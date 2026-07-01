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
  2: [{ x: 50, y: 84 }, { x: 50, y: 16 }],
  3: [{ x: 50, y: 84 }, { x: 12, y: 34 }, { x: 88, y: 34 }],
  4: [{ x: 50, y: 84 }, { x: 11, y: 44 }, { x: 50, y: 16 }, { x: 89, y: 44 }],
  5: [{ x: 50, y: 84 }, { x: 10, y: 58 }, { x: 20, y: 20 }, { x: 80, y: 20 }, { x: 90, y: 58 }],
  6: [{ x: 50, y: 84 }, { x: 9, y: 62 }, { x: 15, y: 24 }, { x: 50, y: 16 }, { x: 85, y: 24 }, { x: 91, y: 62 }],
};

export function seatLayout(count: number) {
  return SEAT_LAYOUTS[count] ?? SEAT_LAYOUTS[6];
}

// kept for back-compat
export const SEAT_POS = SEAT_LAYOUTS[6];
