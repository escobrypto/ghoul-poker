// ============================================================================
// Store — persistence abstraction for accounts, XP, leaderboard.
// The first playable ships with an in-memory implementation so gameplay can be
// tested without infra. PRODUCTION: implement the same interface against
// Postgres (the schema mirrors these methods 1:1) and swap it in index.ts —
// no game code changes. Tokens are opaque session ids here; in prod use signed
// JWTs + a users table keyed by wallet or email.
// ============================================================================

import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import type { ProfilePayload } from './protocol.js';

const scrypt = promisify(_scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

// ---------------------------------------------------------------------------
// Password hashing — Node built-in scrypt (memory-hard, no native deps, no new
// packages, nothing to break on deploy). Stored as `scrypt:salt:hash` so the
// algorithm can be migrated later by prefix.
// ---------------------------------------------------------------------------
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hex] = (stored || '').split(':');
  if (algo !== 'scrypt' || !salt || !hex) return false;
  const test = await scrypt(password, salt, 64);
  const want = Buffer.from(hex, 'hex');
  return test.length === want.length && timingSafeEqual(test, want);
}
export function newSessionToken(): string {
  return `gs_${randomBytes(24).toString('hex')}`;
}

/** Result of register/login. */
export type AuthOutcome =
  | { ok: true; account: Account; sessionToken: string }
  | { ok: false; error: string };

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

// GENESIS GHOUL — the founder program. The first 100 REGISTERED accounts that
// finish at least one hand get a permanent numbered badge (1..100). Requiring
// registration + a completed hand means real players, not bot farms; requiring
// only 100 keeps it the rarest cosmetic in the game, exclusive forever.
export const FOUNDER_CAP = 100;

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
  /** grant a GENESIS number to an eligible account (race-safe, idempotent). returns number or null */
  grantFounderIfEligible(id: number): Promise<number | null>;

  // ---- auth (modular provider layer: 'password' today, discord/google/steam/wallet later) ----
  /** create a registered account, or upgrade the given guest account in place (keeps XP/badges) */
  register(currentAccountId: number | null, username: string, password: string): Promise<AuthOutcome>;
  login(username: string, password: string): Promise<AuthOutcome>;
  logout(sessionToken: string): Promise<void>;
}

type LeaderRow = { id: number; name: string; level: number; xp: number; handsWon: number; founder: boolean; founderNumber: number | null };

export class MemoryStore implements Store {
  private byId = new Map<number, Account>();
  private byToken = new Map<string, number>();
  private seq = 1000;
  private founderCount = 0;
  // auth layer (mirrors the auth_providers + sessions tables in PgStore)
  private providers = new Map<string, { accountId: number; secret: string }>(); // key: 'password:'+lower(username)
  private sessions = new Map<string, number>();      // session token -> account id
  private registered = new Set<number>();

  async authenticate(token: string | undefined, name: string): Promise<Account> {
    // registered session tokens win; registered accounts are never auto-renamed
    if (token && this.sessions.has(token)) {
      return this.byId.get(this.sessions.get(token)!)!;
    }
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

  async register(currentAccountId: number | null, username: string, password: string): Promise<AuthOutcome> {
    password = password.trim(); // mobile keyboards love trailing spaces — never let one lock an account
    const key = `password:${username.toLowerCase()}`;
    if (this.providers.has(key)) return { ok: false, error: 'Username taken' };
    let acc = currentAccountId != null ? this.byId.get(currentAccountId) : undefined;
    if (acc && this.registered.has(acc.id)) return { ok: false, error: 'Already registered' };
    if (!acc) acc = await this.authenticate(undefined, username); // fresh account
    acc.name = username;
    this.providers.set(key, { accountId: acc.id, secret: await hashPassword(password) });
    this.registered.add(acc.id);
    const sessionToken = newSessionToken();
    this.sessions.set(sessionToken, acc.id);
    return { ok: true, account: acc, sessionToken };
  }

  async login(username: string, password: string): Promise<AuthOutcome> {
    const p = this.providers.get(`password:${username.toLowerCase()}`);
    if (!p) return { ok: false, error: 'No account with that username' };
    // trimmed first (current policy) then raw (accounts registered before trimming)
    const okPw = (await verifyPassword(password.trim(), p.secret)) || (await verifyPassword(password, p.secret));
    if (!okPw) return { ok: false, error: 'Wrong password' };
    const sessionToken = newSessionToken();
    this.sessions.set(sessionToken, p.accountId);
    return { ok: true, account: this.byId.get(p.accountId)!, sessionToken };
  }

  async logout(sessionToken: string): Promise<void> { this.sessions.delete(sessionToken); }

  async getProfile(id: number): Promise<ProfilePayload | null> {
    const a = this.byId.get(id); if (!a) return null;
    return {
      id: a.id, name: a.name, level: a.level, xp: a.xp, xpNeeded: xpNeeded(a.level),
      chips: a.chips, handsPlayed: a.handsPlayed, handsWon: a.handsWon,
      founder: a.founder, founderNumber: a.founderNumber,
      registered: this.registered.has(a.id),
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
    if (a.founder) return a.founderNumber;                       // idempotent
    if (!this.registered.has(id)) return null;                   // GENESIS: registered accounts only
    if (a.handsPlayed < 1) return null;                          // ...that finished a real hand
    if (this.founderCount >= FOUNDER_CAP) return null;           // slots full — exclusive forever
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
