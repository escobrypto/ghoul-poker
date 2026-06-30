// ============================================================================
// GameRoom — authoritative owner of ONE poker table.
//
// Responsibility split (per directive): the SERVER owns deck, shuffle, pot,
// betting, turn order, and winner calculation. Clients are visual only and may
// only submit an action *when it is their turn* — every action is validated
// here against authoritative state before the engine touches it.
//
// The room runs a small state machine driven by timers, not by client input:
//   lobby -> (host starts) -> hand loop -> showdown -> next hand -> ...
// A player who disconnects keeps their seat (chips are committed) and may
// reconnect within a grace window; their turn auto-checks/folds on timeout so
// the table never stalls waiting on an absent human.
// ============================================================================

import {
  TableState, Player, ActionType,
  createTable, freshDeck, postBlind, applyAction, aiDecision,
  roundComplete, activePlayers, resolveShowdown,
  SB, BB, START_STACK, HANDNAME,
} from '@ghoul/engine';
import type { PublicTable, HandResult } from './protocol.js';
import { redactTableFor } from './redact.js';

export interface RoomMember {
  id: number;
  name: string;
  connected: boolean;
  ready: boolean;
  /** seat reserves chips even while disconnected */
  stack: number;
}

const TURN_MS = 20_000;          // server-authoritative action clock
const SHOWDOWN_HOLD_MS = 3_500;  // let the win cinematic breathe before next hand
const STAGE_GAP_MS = 900;        // pause between streets (cosmetic pacing)
const DISCONNECT_GRACE_MS = 45_000;

type Emit = {
  table: (viewerId: number, t: PublicTable) => void;
  handResult: (r: HandResult) => void;
  roomInfo: () => void;
  chat: (name: string, msg: string) => void;
};

export class GameRoom {
  code: string;
  isPublic: boolean;
  hostId: number;
  maxSeats: number;
  members: RoomMember[] = [];
  started = false;
  handNo = 0;

  private state: TableState | null = null;
  private turnEndsAt: number | null = null;
  private turnTimer: NodeJS.Timeout | null = null;
  private loopTimer: NodeJS.Timeout | null = null;
  private graceTimers = new Map<number, NodeJS.Timeout>();
  private emit: Emit;

  constructor(code: string, hostId: number, isPublic: boolean, emit: Emit, maxSeats = 6) {
    this.code = code; this.hostId = hostId; this.isPublic = isPublic; this.emit = emit; this.maxSeats = maxSeats;
  }

  // ---- membership ----
  addMember(id: number, name: string): { ok: true } | { error: string } {
    if (this.members.find((m) => m.id === id)) { // reconnect
      const m = this.members.find((x) => x.id === id)!;
      m.connected = true;
      const g = this.graceTimers.get(id); if (g) { clearTimeout(g); this.graceTimers.delete(id); }
      this.pushState();
      this.emit.roomInfo();
      return { ok: true };
    }
    if (this.started) return { error: 'Table already in play' };
    if (this.members.length >= this.maxSeats) return { error: 'Table full' };
    this.members.push({ id, name, connected: true, ready: false, stack: START_STACK });
    this.emit.roomInfo();
    return { ok: true };
  }

  setReady(id: number, ready: boolean) {
    const m = this.members.find((x) => x.id === id); if (m) m.ready = ready;
    this.emit.roomInfo();
  }

  markDisconnected(id: number) {
    const m = this.members.find((x) => x.id === id); if (!m) return;
    m.connected = false;
    this.pushState();
    this.emit.roomInfo();
    // grace window before the seat is freed (only matters in lobby; mid-hand the
    // seat stays so chips/pot stay correct — they just auto-act on their turn)
    const t = setTimeout(() => {
      if (!this.started) this.members = this.members.filter((x) => x.id !== id);
      this.emit.roomInfo();
    }, DISCONNECT_GRACE_MS);
    this.graceTimers.set(id, t);
  }

  get isEmpty() { return this.members.every((m) => !m.connected); }

  // ---- starting play ----
  start(byId: number) {
    if (byId !== this.hostId || this.started) return;
    const ready = this.members.filter((m) => m.connected);
    if (ready.length < 2) { this.emit.chat('TABLE', 'Need at least 2 ghouls to start.'); return; }
    this.started = true;
    this.emit.roomInfo();
    this.startHand();
  }

  // ---- the authoritative hand loop ----
  private startHand() {
    const seated = this.members.map((m) => ({ id: m.id, name: m.name, stack: m.stack }));
    // top up busted stacks so play-money tables never dead-end (design choice:
    // this is a fun-first social game, not real-stakes; nobody gets stuck out)
    seated.forEach((s) => { if (s.stack < BB) s.stack = START_STACK; });

    this.handNo++;
    const button = this.handNo % seated.length;
    this.state = createTable(seated, button);
    const s = this.state;
    s.deck = freshDeck();
    s.stage = 'preflop';
    for (let r = 0; r < 2; r++) s.players.forEach((p) => p.cards.push(s.deck.pop()!));

    const sb = (s.button + 1) % s.players.length;
    const bb = (s.button + 2) % s.players.length;
    postBlind(s, sb, SB);
    postBlind(s, bb, BB);
    s.toCall = BB; s.lastRaiser = s.players[bb].id; s.turn = (bb + 1) % s.players.length;

    this.pushState();
    this.scheduleDrive(STAGE_GAP_MS);
  }

  /** advance to whoever must act next, or resolve the street/hand */
  private drive = () => {
    const s = this.state; if (!s) return;
    if (activePlayers(s).length === 1) return this.endHandFolded();
    if (roundComplete(s)) return this.nextStage();

    // skip folded/all-in players
    let guard = 0; let p = s.players[s.turn];
    while ((p.folded || p.allin) && guard++ < 12) {
      s.turn = (s.turn + 1) % s.players.length; p = s.players[s.turn];
    }
    if (roundComplete(s)) return this.nextStage();

    this.beginTurn(p);
  };

  /** open the action window for one player (human => start timer; bot => auto-act) */
  private beginTurn(p: Player) {
    const s = this.state!;
    this.pushState();
    const member = this.members.find((m) => m.id === p.id);

    // A disconnected human is treated like a bot so the table never stalls.
    if (!member || !member.connected) {
      this.scheduleDrive(700, () => this.autoAct(p));
      return;
    }

    this.turnEndsAt = Date.now() + TURN_MS;
    this.pushState();
    this.clearTurnTimer();
    this.turnTimer = setTimeout(() => {
      // timeout = check if free, else fold (standard poker default)
      const need = s.toCall - p.bet;
      this.handleAction(p.id, need > 0 ? 'fold' : 'call');
    }, TURN_MS);
  }

  /** bot/disconnect fallback uses the same engine AI as single-player */
  private autoAct(p: Player) {
    const s = this.state!; if (s.players[s.turn].id !== p.id) return;
    const { action, amount } = aiDecision(s, p);
    this.commit(p, action, amount);
  }

  /**
   * PUBLIC entry for a client action. Validates authority before mutating:
   * must be an in-progress hand, must be this player's turn. Anything else is
   * dropped silently — the client cannot force an out-of-turn action.
   */
  handleAction(playerId: number, type: ActionType, amount?: number) {
    const s = this.state; if (!s || s.stage === 'idle' || s.stage === 'showdown') return;
    const current = s.players[s.turn];
    if (!current || current.id !== playerId) return; // not your turn -> ignore
    this.commit(current, type, amount ?? 0);
  }

  private commit(p: Player, type: ActionType, amount: number) {
    const s = this.state!;
    this.clearTurnTimer();
    this.turnEndsAt = null;
    applyAction(s, p, type, amount);
    s.turn = (s.turn + 1) % s.players.length;
    // Resolve the table position synchronously so turnSeatId never lingers on a
    // player who already acted (which previously let clients re-trigger commit in
    // a loop and reset the drive timer forever). drive() either opens the next
    // legal turn, advances the street, or ends the hand — all idempotent.
    this.pushState();
    this.scheduleDrive(450);
  }

  private nextStage() {
    const s = this.state!;
    s.players.forEach((p) => { p.bet = 0; p.acted = false; });
    s.toCall = 0; s.minRaise = BB;

    if (s.stage === 'preflop') { s.stage = 'flop'; this.dealBoard(3); }
    else if (s.stage === 'flop') { s.stage = 'turn'; this.dealBoard(1); }
    else if (s.stage === 'turn') { s.stage = 'river'; this.dealBoard(1); }
    else if (s.stage === 'river') return this.showdown();

    // if everyone left is all-in, just run it out with pauses
    const canBet = s.players.filter((p) => !p.folded && !p.allin);
    this.pushState();
    if (canBet.length <= 1) { this.scheduleDrive(STAGE_GAP_MS, () => this.nextStage()); return; }

    let t = (s.button + 1) % s.players.length, g = 0;
    while ((s.players[t].folded || s.players[t].allin) && g++ < 12) t = (t + 1) % s.players.length;
    s.turn = t;
    this.scheduleDrive(STAGE_GAP_MS);
  }

  private dealBoard(n: number) { const s = this.state!; for (let k = 0; k < n; k++) s.board.push(s.deck.pop()!); }

  private showdown() {
    const s = this.state!;
    s.stage = 'showdown';
    const potSize = s.pot;
    const r = resolveShowdown(s);
    this.syncStacks();
    this.pushState();
    this.emit.handResult({
      winners: r.winners.map((w) => ({ id: w.id, name: w.name, amount: Math.floor(potSize / r.winners.length) })),
      handName: r.handName, winningCards: r.winningCards, showdown: true,
    });
    this.scheduleNextHand();
  }

  private endHandFolded() {
    const s = this.state!;
    const w = activePlayers(s)[0];
    const potSize = s.pot;
    w.stack += s.pot;
    this.syncStacks();
    this.pushState();
    this.emit.handResult({
      winners: [{ id: w.id, name: w.name, amount: potSize }],
      handName: null, winningCards: [], showdown: false,
    });
    this.scheduleNextHand();
  }

  /** persist per-hand stacks back onto members so they carry to the next hand */
  private syncStacks() {
    const s = this.state!;
    s.players.forEach((p) => { const m = this.members.find((x) => x.id === p.id); if (m) m.stack = p.stack; });
  }

  private scheduleNextHand() {
    this.clearLoop();
    this.loopTimer = setTimeout(() => {
      // stop if fewer than 2 connected players remain
      if (this.members.filter((m) => m.connected).length < 2) {
        this.started = false; this.state = null; this.emit.roomInfo(); return;
      }
      this.startHand();
    }, SHOWDOWN_HOLD_MS);
  }

  // ---- timers & state push ----
  private scheduleDrive(ms: number, fn: () => void = this.drive) {
    this.clearLoop();
    this.loopTimer = setTimeout(() => {
      fn();
    }, ms);
  }
  private clearLoop() { if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; } }
  private clearTurnTimer() { if (this.turnTimer) { clearTimeout(this.turnTimer); this.turnTimer = null; } }

  /** redact + emit state to every connected member (each sees only their cards) */
  pushState() {
    if (!this.state) return;
    const connected = new Set(this.members.filter((m) => m.connected).map((m) => m.id));
    const meta = { roomCode: this.code, handNo: this.handNo, turnEndsAt: this.turnEndsAt, connected };
    for (const m of this.members) {
      if (!m.connected) continue;
      this.emit.table(m.id, redactTableFor(this.state, m.id, meta));
    }
  }

  destroy() { this.clearLoop(); this.clearTurnTimer(); this.graceTimers.forEach((t) => clearTimeout(t)); }
}
