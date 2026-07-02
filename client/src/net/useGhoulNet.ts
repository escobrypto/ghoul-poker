// ============================================================================
// useGhoulNet — the client's networked game hook. REPLACES useGhoulPoker as the
// data source. It contains NO poker logic: no applyAction, no aiDecision, no
// drive loop. It receives authoritative redacted snapshots and exposes the exact
// surface the existing App/scene already consume, so rendering code is unchanged.
//
// Animations are reconstructed by DIFFING consecutive snapshots (the "network
// interpolation" layer): pot increased on a seat -> chips fly; new board card ->
// deal; allin flipped true -> cinematic. The UI never learns it's networked.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket, ConnStatus } from './socket';
import { adaptTable, AdaptedView, orderedIndexOf } from './adapt';
import type { PublicTable, HandResult, RoomInfo, ProfilePayload } from './protocol';
import type { TableState, ActionType } from '../engine/table';

import type { SfxName } from '../hooks/useSoundEffects';

export interface ChipFlight { key: number; from: number; to: number; color: number; }
export interface ChatLine { id: number; name?: string; msg: string; sys?: boolean; }
export interface HistoryLine { id: number; name: string; action: string; amt: number; you: boolean; }

let uid = 1; const nextId = () => uid++;

const EMPTY_TABLE: TableState = {
  players: [], deck: [], board: [], pot: 0, toCall: 0, minRaise: 20,
  button: 0, turn: -1, stage: 'idle', lastRaiser: -1,
};

export function useGhoulNet(onSound?: (n: SfxName) => void) {
  const sfx = (n: SfxName) => { try { onSound?.(n); } catch { /* sound optional */ } };
  const sock = getSocket();

  // ---- rendered state (scene-shaped) ----
  const [state, setState] = useState<TableState>(EMPTY_TABLE);
  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [history, setHistory] = useState<HistoryLine[]>([]);
  const [status, setStatus] = useState('Connecting to the trenches…');
  const [conn, setConn] = useState<ConnStatus>('connecting');
  const [latency, setLatency] = useState(0);

  // animation event state (same shapes the scene already uses)
  const [winners, setWinners] = useState<number[]>([]);
  const [winningCards, setWinningCards] = useState<string[]>([]);
  const [chipFlights, setChipFlights] = useState<ChipFlight[]>([]);
  const [potPulse, setPotPulse] = useState(0);
  const [winBurst, setWinBurst] = useState<{ seat: number; xp: number; key: number } | null>(null);
  const [allInCinematic, setAllInCinematic] = useState<{ seat: number; name: string; key: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const [prompt, setPrompt] = useState<{ need: number; minRaise: number; maxRaise: number; strength: number } | null>(null);
  const [turnEndsAt, setTurnEndsAt] = useState<number | null>(null);

  const prevView = useRef<AdaptedView | null>(null);
  const lastHandNo = useRef<number>(-1);

  const showToast = useCallback((text: string, kind = '') => {
    setToast({ text, kind }); setTimeout(() => setToast(null), 1400);
  }, []);

  const flyChips = useCallback((from: number, to: number, count = 5) => {
    sfx('chip_slide');
    const flights = Array.from({ length: count }, (_, i) => ({ key: nextId(), from, to, color: i % 3 }));
    setChipFlights((cf) => [...cf, ...flights]);
    setTimeout(() => {
      sfx('chip_land');
      if (to === -1) setPotPulse((p) => p + 1);
      const keys = new Set(flights.map((f) => f.key));
      setChipFlights((cf) => cf.filter((f) => !keys.has(f.key)));
    }, 560);
  }, []);

  // ---- the snapshot handler: adapt + diff to reconstruct animations ----
  const onTable = useCallback((t: PublicTable) => {
    const view = adaptTable(t);
    const prev = prevView.current;

    // new hand → reset transient visuals, no stale-diff animations
    const isNewHand = t.handNo !== lastHandNo.current;
    if (isNewHand) {
      lastHandNo.current = t.handNo;
      setWinners([]); setWinningCards([]);
      prevView.current = null; // suppress diff burst on the fresh hand
    }

    // DIFF (only when we have a comparable previous frame from the same hand)
    if (prev && prev.state.players.length === view.state.players.length) {
      // chips: any seat whose committed bet increased → fly chips seat→pot
      view.state.players.forEach((p, i) => {
        const before = prev.state.players.find((x) => x.id === p.id);
        if (before && p.bet > before.bet) {
          const paid = p.bet - before.bet;
          const count = Math.max(3, Math.min(8, Math.round(paid / 20) + 3));
          flyChips(i, -1, count);
        }
        // all-in just flipped true → cinematic + stinger
        if (before && !before.allin && p.allin) {
          sfx('all_in_stinger');
          setAllInCinematic({ seat: i, name: p.name, key: nextId() });
          showToast('ALL IN', 'allin');
          setTimeout(() => setAllInCinematic(null), 1150);
        }
      });
      // board grew → a card was dealt (card_flip handled per-card in CryptoCard)
      if (view.state.board.length > prev.state.board.length) sfx('card_flip');
    }

    // turn prompt for the local player (server-authoritative; client only suggests UI)
    const you = view.state.players[0];
    if (you && t.turnSeatId === you.id) {
      const need = t.toCall - you.bet;
      setStatus(need > 0 ? `Your move. Call needs ◈${need}.` : 'Your move. You can check.');
      setPrompt({
        need,
        minRaise: Math.min(you.stack + you.bet, t.toCall + t.minRaise),
        maxRaise: you.stack + you.bet,
        strength: 0, // client does NOT compute hand strength (would leak/compute logic)
      });
    } else {
      setPrompt(null);
      const turnName = view.state.players.find((p) => p.id === t.turnSeatId)?.name;
      if (turnName) setStatus(`${turnName} is thinking…`);
      else if (t.stage === 'idle') setStatus('Waiting for the next hand…');
    }

    setTurnEndsAt(t.turnEndsAt);
    setState(view.state);
    prevView.current = view;
  }, [flyChips, showToast]);

  const onHandResult = useCallback((r: HandResult) => {
    const view = prevView.current;
    if (!view) return;
    const winnerIds = r.winners.map((w) => w.id);
    setWinners(winnerIds.map((id) => id)); // scene matches by id
    setWinningCards(r.winningCards);

    // map first winner to ordered seat index for burst + pot sweep
    const primary = r.winners[0];
    const seatIdx = orderedIndexOf(view, primary.id);
    const youWon = view.state.players[0]?.id === primary.id || winnerIds.includes(view.state.players[0]?.id);

    sfx('pot_collect');
    if (seatIdx >= 0) flyChips(-1, seatIdx, Math.max(5, Math.min(12, Math.round(primary.amount / 200) + 4)));
    setWinBurst({ seat: seatIdx, xp: youWon ? 70 : 0, key: nextId() });
    setTimeout(() => sfx('achievement_unlock'), 260);
    setTimeout(() => setWinBurst(null), 1600);

    const names = r.winners.map((w) => w.name).join(' & ');
    showToast(youWon ? 'YOU WIN' : `${names} WIN`, 'win');
    if (youWon) setConfettiKey((k) => k + 1);
    setHistory((h) => [{
      id: nextId(), name: names, you: youWon,
      action: r.handName ? `wins ${r.handName}` : 'wins (fold)', amt: primary.amount,
    }, ...h.slice(0, 49)]);
    setStatus(`${names} take${r.winners.length > 1 ? '' : 's'} the pot${r.handName ? ' — ' + r.handName : ''}.`);
  }, [flyChips, showToast]);

  // ---- wire socket once ----
  useEffect(() => {
    sock.on({
      onTable,
      onHandResult,
      onRoomInfo: (r: RoomInfo) => setRoom(r),
      onProfile: (p: ProfilePayload) => setProfile(p),
      onChat: (m) => setChat((c) => [...c.slice(-79), { id: nextId(), name: m.name, msg: m.msg, sys: m.id === 0 }]),
      onStatus: (s, lat) => { setConn(s); setLatency(lat); },
      onError: (msg) => showToast(msg, 'allin'),
    });
  }, [onTable, onHandResult, showToast, sock]);

  // ---- public actions (thin pass-throughs to the server) ----
  const act = useCallback((type: ActionType, amount?: number) => sock.act(type, amount), [sock]);
  const sendChat = useCallback((msg: string) => sock.sendChat(msg), [sock]);
  const quickplay = useCallback((cb?: (code: string | null) => void) => sock.quickplay(cb || (() => {})), [sock]);
  const createRoom = useCallback((isPublic: boolean, cb?: (c: string | null) => void) => sock.createRoom(isPublic, cb || (() => {})), [sock]);
  const joinRoom = useCallback((code: string, cb?: (ok: boolean) => void) => sock.joinRoom(code, cb || (() => {})), [sock]);
  const ready = useCallback((v: boolean) => sock.ready(v), [sock]);
  const startGame = useCallback(() => sock.startGame(), [sock]);
  const leaveRoom = useCallback(() => { sock.leaveRoom(); setRoom(null); setState(EMPTY_TABLE); }, [sock]);
  const setName = useCallback((n: string) => sock.setName(n), [sock]);
  const register = useCallback((usr: string, pw: string, cb: (err: string | null) => void) => sock.register(usr, pw, cb), [sock]);
  const login = useCallback((usr: string, pw: string, cb: (err: string | null) => void) => sock.login(usr, pw, cb), [sock]);
  const logout = useCallback(() => sock.logout(), [sock]);
  const fetchLeaderboard = useCallback((cb: (rows: import('./protocol').LeaderRow[]) => void) => sock.requestLeaderboard(cb), [sock]);

  return {
    // scene-shaped state (same surface as before)
    state, winners, winningCards, chipFlights, potPulse, winBurst, allInCinematic,
    toast, confettiKey, prompt, status, history, chat,
    bubble: null as null, xpGain: 0, missions: [] as any[], achievementUnlocked: false,
    isIdle: state.stage === 'idle',
    // networking surface
    profile, room, conn, latency, turnEndsAt,
    // actions
    act, sendChat, quickplay, createRoom, joinRoom, ready, startGame, leaveRoom, setName, fetchLeaderboard,
    register, login, logout,
  };
}
