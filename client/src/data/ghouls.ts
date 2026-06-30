export interface GhoulTheme {
  slug: string;        // avatar filename in /assets/avatars
  flame: string;       // seat glow color
  rarity?: string;
}

export const GHOUL_THEMES: Record<string, GhoulTheme> = {
  'YOU':              { slug: 'you',             flame: '#9d4edd' },
  'The Ghoul King':   { slug: 'ghoul-king',      flame: '#ffce4a', rarity: 'LEGENDARY' },
  'Night Stalker':    { slug: 'night-stalker',   flame: '#ff3ec9', rarity: 'EPIC' },
  'Liquidity Hunter': { slug: 'liquidity-hunter',flame: '#21e6ff', rarity: 'RARE' },
  'Degen Oracle':     { slug: 'degen-oracle',    flame: '#c77dff', rarity: 'EPIC' },
  'River Rat':        { slug: 'river-rat',        flame: '#ff9d2e', rarity: 'EPIC' },
  'Crypto Banshee':   { slug: 'crypto-banshee',   flame: '#39ff8b', rarity: 'RARE' },
};

export function avatarSrc(name: string): string {
  const t = GHOUL_THEMES[name] ?? GHOUL_THEMES['YOU'];
  return `/assets/avatars/${t.slug}.png`;
}

export function flameFor(name: string): string {
  return (GHOUL_THEMES[name] ?? GHOUL_THEMES['YOU']).flame;
}

// Seat coordinates (percent of table area). Positions are chosen per player-count
// so seats spread evenly around the oval instead of clustering.
const SEAT_LAYOUTS: Record<number, { x: number; y: number }[]> = {
  2: [{ x: 50, y: 96 }, { x: 50, y: 8 }],
  3: [{ x: 50, y: 96 }, { x: 9, y: 30 }, { x: 91, y: 30 }],
  4: [{ x: 50, y: 96 }, { x: 8, y: 40 }, { x: 50, y: 8 }, { x: 92, y: 40 }],
  5: [{ x: 50, y: 96 }, { x: 8, y: 58 }, { x: 17, y: 14 }, { x: 83, y: 14 }, { x: 92, y: 58 }],
  6: [{ x: 50, y: 96 }, { x: 7, y: 64 }, { x: 12, y: 20 }, { x: 50, y: 8 }, { x: 88, y: 20 }, { x: 93, y: 64 }],
};

export function seatLayout(count: number) {
  return SEAT_LAYOUTS[count] ?? SEAT_LAYOUTS[6];
}

// kept for back-compat
export const SEAT_POS = SEAT_LAYOUTS[6];
