import { Card, freshDeck, evaluate, cmpScore, handStrength, HANDNAME } from './poker.js';

export interface Player {
  id: number;
  name: string;
  you?: boolean;
  agg?: number;
  stack: number;
  cards: Card[];
  bet: number;
  /** total chips committed this hand across all streets — drives side pots */
  committed: number;
  folded: boolean;
  allin: boolean;
  acted: boolean;
}

export type Stage = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type ActionType = 'fold' | 'call' | 'raise';

export interface TableState {
  players: Player[];
  deck: Card[];
  board: Card[];
  pot: number;
  toCall: number;
  minRaise: number;
  button: number;
  turn: number;
  stage: Stage;
  lastRaiser: number;
}

export const SB = 10, BB = 20, START_STACK = 1000;

export const GHOULS = [
  { name: 'The Ghoul King', agg: 0.7 },
  { name: 'Night Stalker', agg: 0.6 },
  { name: 'Liquidity Hunter', agg: 0.55 },
  { name: 'Degen Oracle', agg: 0.5 },
  { name: 'River Rat', agg: 0.4 },
  { name: 'Crypto Banshee', agg: 0.62 },
];

export const GHOUL_LINES: Record<string, string[]> = {
  'The Ghoul King': ['GHOUL GANG 👑', 'bow to the king', 'easy money'],
  'Night Stalker': ["let's cook 🔥", 'i smell fear', 'tick tock'],
  'Liquidity Hunter': ['night is young 🌙', 'liquidating you', 'snack time 🦈'],
  'Degen Oracle': ['LFGGGGG 💀', 'the charts foretold this', 'aped in'],
  'River Rat': ['we printing tonight', 'one more card', 'rivered again 🐀'],
  'Crypto Banshee': ['AAAEEEE', 'souls collected', 'wagmi 👻'],
};

export function newTable(bank: number, seats = 4): TableState {
  const players: Player[] = [
    { id: 0, name: 'YOU', you: true, stack: bank, cards: [], bet: 0, committed: 0, folded: false, allin: false, acted: false },
  ];
  const pick = [...GHOULS].sort(() => Math.random() - 0.5).slice(0, seats - 1);
  pick.forEach((g, i) =>
    players.push({ id: i + 1, name: g.name, agg: g.agg, stack: START_STACK, cards: [], bet: 0, committed: 0, folded: false, allin: false, acted: false }),
  );
  return {
    players, deck: [], board: [], pot: 0, toCall: 0, minRaise: BB,
    button: (Math.random() * players.length) | 0, turn: 0, stage: 'idle', lastRaiser: -1,
  };
}

/**
 * MULTIPLAYER table builder. Unlike newTable (single-player, hardcodes "YOU" +
 * AI ghouls), this seats an arbitrary roster of real players. The server owns
 * this TableState; clients never construct it. Math/betting is identical — only
 * the seating differs. `seated` order defines clockwise seat order at the table.
 */
export function createTable(seated: { id: number; name: string; stack: number }[], buttonSeat = 0): TableState {
  const players: Player[] = seated.map((s) => ({
    id: s.id,
    name: s.name,
    stack: s.stack,
    cards: [],
    bet: 0,
    committed: 0,
    folded: false,
    allin: false,
    acted: false,
  }));
  return {
    players, deck: [], board: [], pot: 0, toCall: 0, minRaise: BB,
    button: buttonSeat % Math.max(1, players.length), turn: 0, stage: 'idle', lastRaiser: -1,
  };
}

export function activePlayers(s: TableState) { return s.players.filter((p) => !p.folded); }

export function roundComplete(s: TableState): boolean {
  const live = s.players.filter((p) => !p.folded && !p.allin);
  if (live.length === 0) return true;
  return live.every((p) => p.acted && p.bet === s.toCall);
}

export function postBlind(s: TableState, i: number, amt: number) {
  const p = s.players[i];
  const a = Math.min(amt, p.stack);
  p.stack -= a; p.bet += a; p.committed += a; s.pot += a;
  if (p.stack === 0) p.allin = true;
}

// Apply an action in place. Returns a short description for the history log.
export function applyAction(s: TableState, p: Player, action: ActionType, amount = 0):
  { label: string; allin: boolean } {
  const need = s.toCall - p.bet;
  if (action === 'fold') {
    p.folded = true; p.acted = true;
    return { label: 'FOLD', allin: false };
  }
  if (action === 'call') {
    const pay = Math.min(need, p.stack);
    p.stack -= pay; p.bet += pay; p.committed += pay; s.pot += pay; p.acted = true;
    if (p.stack === 0) p.allin = true;
    if (need <= 0) return { label: 'CHECK', allin: false };
    return { label: p.allin ? 'ALL IN' : 'CALL', allin: p.allin };
  }
  // raise
  const target = Math.max(amount, s.toCall + s.minRaise);
  const pay = Math.min(target - p.bet, p.stack);
  p.stack -= pay; p.bet += pay; p.committed += pay; s.pot += pay;
  const rs = p.bet - s.toCall;
  if (rs > 0) s.minRaise = Math.max(s.minRaise, rs);
  s.toCall = Math.max(s.toCall, p.bet);
  s.lastRaiser = p.id;
  s.players.forEach((o) => { if (!o.folded && !o.allin && o.id !== p.id) o.acted = false; });
  p.acted = true;
  if (p.stack === 0) p.allin = true;
  return { label: p.allin ? 'ALL IN' : 'RAISE', allin: p.allin };
}

// AI chooses an action based on Monte-Carlo strength + personality aggression.
export function aiDecision(s: TableState, p: Player): { action: ActionType; amount: number } {
  const need = s.toCall - p.bet;
  const strength = handStrength(p.cards, s.board, activePlayers(s).length - 1);
  const agg = p.agg ?? 0.5;
  const potOdds = need / (s.pot + need || 1);
  const r = Math.random();
  let action: ActionType = 'call', amount = 0;
  if (need === 0) {
    if (strength > 0.6 && r < agg) { action = 'raise'; amount = Math.min(p.stack, Math.round(s.pot * (0.5 + agg * 0.5)) + p.bet); }
    else action = 'call';
  } else {
    if (strength < potOdds * 0.9 && strength < 0.5 && r > 0.15) action = 'fold';
    else if (strength > 0.72 && r < agg + 0.2) { action = 'raise'; amount = Math.min(p.stack, Math.round(s.pot * (0.6 + agg * 0.5)) + s.toCall); }
    else action = 'call';
  }
  if (action === 'raise' && amount <= s.toCall) action = 'call';
  return { action, amount };
}

export interface Showdown {
  winners: Player[];          // winners of the main pot (drives the win cinematic)
  handName: string;
  winningCards: Card[];
  share: number;              // main-pot share per winner (back-compat)
  /** exact chips paid to every player who received any (side pots + refunds) */
  payouts: { id: number; name: string; amount: number }[];
}

/**
 * Side-pot-correct showdown. Pots are layered at each distinct all-in
 * commitment level of the non-folded players. Each layer collects the matching
 * slice from EVERY player's committed chips (folded players' money stays in the
 * pots they fed) but only non-folded players who covered the layer can win it.
 * A layer with a single eligible player is an uncalled bet — it refunds to them.
 * Odd chips on a split go to the first winner clockwise from the button.
 * Chip conservation is guaranteed: every committed chip is paid to someone.
 */
export function resolveShowdown(s: TableState): Showdown {
  const live = activePlayers(s);
  const commit = (p: Player) => p.committed ?? 0;

  // rank all live hands once
  const scores = new Map<number, number[]>();
  live.forEach((p) => scores.set(p.id, evaluate([...p.cards, ...s.board])));

  // layer boundaries: ascending unique commitments of non-folded players
  const levels = [...new Set(live.map(commit))].filter((c) => c > 0).sort((a, b) => a - b);

  // clockwise order from left of the button, for deterministic odd-chip awards
  const order: Player[] = [];
  for (let k = 1; k <= s.players.length; k++) order.push(s.players[(s.button + k) % s.players.length]);

  const paid = new Map<number, number>();
  const credit = (p: Player, amt: number) => {
    p.stack += amt;
    paid.set(p.id, (paid.get(p.id) ?? 0) + amt);
  };

  let prev = 0;
  let distributed = 0;
  let mainWinners: Player[] = live.slice(0, 1);
  let mainBest: number[] | null = null;
  let mainShare = 0;
  let lastWinners: Player[] = [];

  for (let li = 0; li < levels.length; li++) {
    const L = levels[li];
    // this layer's money: the (prev, L] slice of every player's commitment
    let amount = 0;
    for (const p of s.players) amount += Math.max(0, Math.min(commit(p), L) - prev);
    if (amount <= 0) { prev = L; continue; }

    const eligible = live.filter((p) => commit(p) >= L);
    let winners: Player[];
    if (eligible.length === 1) {
      winners = eligible; // uncalled slice — refund
    } else {
      let best: number[] | null = null;
      winners = [];
      for (const p of eligible) {
        const sc = scores.get(p.id)!;
        const c = best ? cmpScore(sc, best) : 1;
        if (!best || c > 0) { best = sc; winners = [p]; }
        else if (c === 0) winners.push(p);
      }
    }

    const share = Math.floor(amount / winners.length);
    let remainder = amount - share * winners.length;
    for (const p of order) {
      if (!winners.includes(p)) continue;
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      credit(p, share + extra);
    }
    distributed += amount;
    lastWinners = winners;
    if (li === 0) { // main pot drives the cinematic + hand name
      mainWinners = winners;
      mainShare = share;
      mainBest = winners.length ? scores.get(winners[0].id) ?? null : null;
    }
    prev = L;
  }

  // safety sweep: any chips not captured by the layers (cannot normally happen)
  // go to the winners of the highest pot so no chip is ever burned.
  const leftover = s.pot - distributed;
  if (leftover > 0 && lastWinners.length) credit(lastWinners[0], leftover);

  // every chip has been paid out — the pot is now authoritatively empty, so a
  // client reconnecting during the showdown hold never sees money twice
  s.pot = 0;

  const handName = mainBest ? HANDNAME[mainBest[0]] : HANDNAME[0];
  const winningCards = [...new Set(mainWinners.flatMap((w) => w.cards).concat(s.board))];
  const payouts = s.players
    .filter((p) => (paid.get(p.id) ?? 0) > 0)
    .map((p) => ({ id: p.id, name: p.name, amount: paid.get(p.id)! }));

  return { winners: mainWinners, handName, winningCards, share: mainShare, payouts };
}
