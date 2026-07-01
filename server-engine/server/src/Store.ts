// ============================================================================
// Store — persistence abstraction for accounts, XP, leaderboard.
// The first playable ships with an in-memory implementation so gameplay can be
// tested without infra. PRODUCTION: implement the same interface against
// Postgres (the schema mirrors these methods 1:1) and swap it in index.ts —
// no game code changes. Tokens are opaque session ids here; in prod use signed
// JWTs + a users table keyed by wallet or email.
// ============================================================================

import type { ProfilePayload } from './protocol.js';

export interface Account {
  id: number;
  name: string;
  token: string;
  level: number;
  xp: number;
  chips: number;
  handsPlayed: number;
  handsWon: number;
  founder: boolean;
  founderNumber: number | null;
}

export function xpNeeded(level: number) { return 100 + (level - 1) * 120; }

// The founder program: the first 100 accounts to REACH LEVEL 2 (i.e. actually
// play, not just load the page) get a permanent founder badge numbered 1..100.
export const FOUNDER_CAP = 100;
export const FOUNDER_LEVEL = 2;

// Name validation shared by both stores. Keeps names sane + non-empty.
export function sanitizeName(name: string | undefined, fallback: string): string {
  const n = (name || '').trim().replace(/\s+/g, ' ').slice(0, 16);
  return n.length >= 1 ? n : fallback;
}

export interface Store {
  authenticate(token: string | undefined, name: string): Promise<Account>;
  getProfile(id: number): Promise<ProfilePayload | null>;
  addXp(id: number, xp: number): Promise<ProfilePayload | null>;
  recordHand(id: number, won: boolean, chipDelta: number): Promise<void>;
  leaderboard(limit: number): Promise<LeaderRow[]>;
  setName(id: number, name: string): Promise<ProfilePayload | null>;
  /** grant founder # to an eligible account (race-safe, idempotent). returns number or null */
  grantFounderIfEligible(id: number): Promise<number | null>;
}

type LeaderRow = { id: number; name: string; level: number; xp: number; handsWon: number; founder: boolean; founderNumber: number | null };

export class MemoryStore implements Store {
  private byId = new Map<number, Account>();
  private byToken = new Map<string, number>();
  private seq = 1000;
  private founderCount = 0;

  async authenticate(token: string | undefined, name: string): Promise<Account> {
    if (token && this.byToken.has(token)) {
      const acc = this.byId.get(this.byToken.get(token)!)!;
      const clean = sanitizeName(name, acc.name);
      if (clean !== acc.name) acc.name = clean; // allow rename
      return acc;
    }
    const id = ++this.seq;
    const newToken = `gp_${id}_${Math.random().toString(36).slice(2, 10)}`;
    const acc: Account = {
      id, name: sanitizeName(name, `Ghoul#${id}`), token: newToken, level: 1, xp: 0,
      chips: 1000, handsPlayed: 0, handsWon: 0, founder: false, founderNumber: null,
    };
    this.byId.set(id, acc); this.byToken.set(newToken, id);
    return acc;
  }

  async setName(id: number, name: string): Promise<ProfilePayload | null> {
    const a = this.byId.get(id); if (!a) return null;
    a.name = sanitizeName(name, a.name);
    return this.getProfile(id);
  }

  async getProfile(id: number): Promise<ProfilePayload | null> {
    const a = this.byId.get(id); if (!a) return null;
    return {
      id: a.id, name: a.name, level: a.level, xp: a.xp, xpNeeded: xpNeeded(a.level),
      chips: a.chips, handsPlayed: a.handsPlayed, handsWon: a.handsWon,
      founder: a.founder, founderNumber: a.founderNumber,
    };
  }

  async addXp(id: number, xp: number): Promise<ProfilePayload | null> {
    const a = this.byId.get(id); if (!a) return null;
    a.xp += xp;
    while (a.xp >= xpNeeded(a.level)) { a.xp -= xpNeeded(a.level); a.level++; }
    return this.getProfile(id);
  }

  async grantFounderIfEligible(id: number): Promise<number | null> {
    const a = this.byId.get(id); if (!a) return null;
    if (a.founder) return a.founderNumber;                 // idempotent
    if (a.level < FOUNDER_LEVEL) return null;              // must have played to L2
    if (this.founderCount >= FOUNDER_CAP) return null;     // slots full
    this.founderCount++;
    a.founder = true; a.founderNumber = this.founderCount;
    return a.founderNumber;
  }

  async recordHand(id: number, won: boolean, chipDelta: number): Promise<void> {
    const a = this.byId.get(id); if (!a) return;
    a.handsPlayed++; if (won) a.handsWon++; a.chips = Math.max(0, a.chips + chipDelta);
  }

  async leaderboard(limit: number) {
    return [...this.byId.values()]
      .sort((x, y) => (y.level - x.level) || (y.xp - x.xp) || (y.handsWon - x.handsWon))
      .slice(0, limit)
      .map((a) => ({ id: a.id, name: a.name, level: a.level, xp: a.xp, handsWon: a.handsWon, founder: a.founder, founderNumber: a.founderNumber }));
  }
}
