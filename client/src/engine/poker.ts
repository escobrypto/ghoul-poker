// Ghoul Poker — poker engine (typed). Hand evaluation validated against all hand classes.
export const SUITS = ['s', 'h', 'd', 'c'] as const;
export type Suit = (typeof SUITS)[number];
export const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'] as const;
export type Rank = (typeof RANKS)[number];
export type Card = string; // e.g. "As", "Th"

export const RVAL: Record<string, number> = {};
RANKS.forEach((r, i) => (RVAL[r] = i + 2));

// Crypto suit theming
export const CRYPTO: Record<Suit, { sym: string; name: string }> = {
  s: { sym: '◎', name: 'SOL' },
  h: { sym: '₿', name: 'BTC' },
  d: { sym: 'Ξ', name: 'ETH' },
  c: { sym: 'Ð', name: 'DOGE' },
};

export function freshDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  for (let i = d.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function kCombos<T>(arr: T[], k: number): T[][] {
  const res: T[][] = [];
  (function go(start: number, combo: T[]) {
    if (combo.length === k) { res.push(combo.slice()); return; }
    for (let i = start; i < arr.length; i++) { combo.push(arr[i]); go(i + 1, combo); combo.pop(); }
  })(0, []);
  return res;
}

// Score a 5-card hand. Returns [rankClass, ...tiebreakers]; higher is better.
function score5(cards: Card[]): number[] {
  const vs = cards.map((c) => RVAL[c[0]]).sort((a, b) => b - a);
  const su = cards.map((c) => c[1]);
  const flush = su.every((s) => s === su[0]);
  const uniq = [...new Set(vs)].sort((a, b) => b - a);
  let straight = false, high = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) { straight = true; high = uniq[0]; }
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) { straight = true; high = 5; } // wheel
  }
  const cnt: Record<number, number> = {};
  vs.forEach((v) => (cnt[v] = (cnt[v] || 0) + 1));
  const groups = Object.entries(cnt).map(([v, n]) => [+v, n] as [number, number])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const counts = groups.map((g) => g[1]);
  const ordered = groups.map((g) => g[0]);
  if (straight && flush) return [8, high];
  if (counts[0] === 4) return [7, ...ordered];
  if (counts[0] === 3 && counts[1] === 2) return [6, ...ordered];
  if (flush) return [5, ...vs];
  if (straight) return [4, high];
  if (counts[0] === 3) return [3, ...ordered];
  if (counts[0] === 2 && counts[1] === 2) return [2, ...ordered];
  if (counts[0] === 2) return [1, ...ordered];
  return [0, ...vs];
}

export function cmpScore(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export function evaluate(cards: Card[]): number[] {
  const combos = kCombos(cards, 5);
  let best: number[] | null = null;
  for (const c of combos) { const s = score5(c); if (!best || cmpScore(s, best) > 0) best = s; }
  return best!;
}

export const HANDNAME = [
  'High Card', 'Pair', 'Two Pair', 'Trips', 'Straight',
  'Flush', 'Full House', 'Quads', 'Straight Flush',
];

// Monte-Carlo win estimate, 0..1
export function handStrength(hole: Card[], board: Card[], opps: number, trials = 130): number {
  let win = 0, tie = 0;
  const known = new Set([...hole, ...board]);
  const pool = freshDeck().filter((c) => !known.has(c));
  for (let t = 0; t < trials; t++) {
    const d = pool.slice();
    for (let i = d.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [d[i], d[j]] = [d[j], d[i]];
    }
    let di = 0;
    const fb = board.slice();
    while (fb.length < 5) fb.push(d[di++]);
    const mine = evaluate([...hole, ...fb]);
    let best = true, tied = false;
    for (let o = 0; o < opps; o++) {
      const oh = [d[di++], d[di++]];
      const os = evaluate([...oh, ...fb]);
      const c = cmpScore(os, mine);
      if (c > 0) { best = false; break; }
      if (c === 0) tied = true;
    }
    if (best && !tied) win++;
    else if (best && tied) tie++;
  }
  return (win + tie * 0.5) / trials;
}
