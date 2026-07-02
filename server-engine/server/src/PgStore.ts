// ============================================================================
// PgStore — Postgres-backed Store. Drop-in for MemoryStore (same interface);
// the difference is durability: accounts/XP/chips survive restarts and deploys.
//
// Design:
//  - One pooled connection (pg.Pool), not per-query connects.
//  - All queries parameterized ($1,$2…) — never string-interpolated (injection-safe).
//  - Schema applied on init() via CREATE TABLE IF NOT EXISTS (idempotent boot).
//  - XP/level math identical to MemoryStore so behavior is unchanged when swapped.
//  - SCALING: when one box isn't enough, this same class works behind a read
//    replica for leaderboard/getProfile; writes stay on primary. Token lookups
//    are the only per-action read and they're indexed (UNIQUE on token).
// ============================================================================

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import type { Store, Account, AuthOutcome } from './Store.js';
import { xpNeeded, sanitizeName, FOUNDER_CAP, hashPassword, verifyPassword, newSessionToken } from './Store.js';
import type { ProfilePayload } from './protocol.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function rowToProfile(r: any): ProfilePayload {
  return {
    id: Number(r.id), name: r.name, level: r.level, xp: r.xp,
    xpNeeded: xpNeeded(r.level), chips: Number(r.chips),
    handsPlayed: r.hands_played, handsWon: r.hands_won,
    founder: !!r.founder, founderNumber: r.founder_number ?? null,
    registered: !!r.registered,
  };
}

export class PgStore implements Store {
  private pool: pg.Pool;

  // Accept either a connection string (production) or a pre-built pool (tests can
  // inject an in-memory Postgres). Same query code runs both ways.
  constructor(connectionStringOrPool: string | pg.Pool) {
    if (typeof connectionStringOrPool === 'string') {
      this.pool = new pg.Pool({
        connectionString: connectionStringOrPool,
        // Railway/Fly managed Postgres requires SSL; allow self-signed in prod.
        ssl: connectionStringOrPool.includes('localhost') ? false : { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30_000,
      });
    } else {
      this.pool = connectionStringOrPool;
    }
  }

  /** apply schema on boot; safe to run every start */
  async init() {
    const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
    await this.pool.query(sql);
  }

  async authenticate(token: string | undefined, name: string): Promise<Account> {
    if (token) {
      // 1) registered session token (sliding 30-day expiry, no auto-rename)
      const sess = await this.pool.query(
        `SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
         WHERE s.token = $1 AND s.expires_at > now()`, [token]);
      if (sess.rowCount) {
        await this.pool.query(
          `UPDATE sessions SET last_seen = now(), expires_at = now() + interval '30 days' WHERE token = $1`, [token]);
        await this.pool.query('UPDATE accounts SET last_seen=now() WHERE id=$1', [sess.rows[0].id]);
        return this.toAccount(sess.rows[0]);
      }
      // 2) legacy guest token
      const found = await this.pool.query('SELECT * FROM accounts WHERE token = $1', [token]);
      if (found.rowCount) {
        const a = found.rows[0];
        const clean = sanitizeName(name, a.name);
        if (clean !== a.name) {
          await this.pool.query('UPDATE accounts SET name=$1, last_seen=now() WHERE id=$2', [clean, a.id]);
          a.name = clean;
        } else {
          await this.pool.query('UPDATE accounts SET last_seen=now() WHERE id=$1', [a.id]);
        }
        return this.toAccount(a);
      }
    }
    // new account. Insert with a provisional name, then if none was given, set a
    // default derived from the real id. Avoids depending on the serial sequence
    // name in SQL (which isn't portable / guaranteed).
    const newToken = `gp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    const provided = (name && name.trim()) ? sanitizeName(name, 'Ghoul') : null;
    const ins = await this.pool.query(
      `INSERT INTO accounts (token, name) VALUES ($1, $2) RETURNING *`,
      [newToken, provided ?? 'Ghoul'],
    );
    let row = ins.rows[0];
    if (!provided) {
      const def = `Ghoul#${row.id}`;
      await this.pool.query('UPDATE accounts SET name=$1 WHERE id=$2', [def, row.id]);
      row = { ...row, name: def };
    }
    return this.toAccount(row);
  }

  async getProfile(id: number): Promise<ProfilePayload | null> {
    const r = await this.pool.query(
      `SELECT a.*, EXISTS(SELECT 1 FROM auth_providers p WHERE p.account_id = a.id) AS registered
       FROM accounts a WHERE a.id=$1`, [id]);
    return r.rowCount ? rowToProfile(r.rows[0]) : null;
  }

  // ---- auth: modular provider layer ('password' today; more providers later) ----

  async register(currentAccountId: number | null, username: string, password: string): Promise<AuthOutcome> {
    const secret = await hashPassword(password);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      let accountId = currentAccountId;
      if (accountId != null) {
        // upgrading a guest in place — keeps XP/level/badges. Refuse if already registered.
        const has = await client.query('SELECT 1 FROM auth_providers WHERE account_id=$1 LIMIT 1', [accountId]);
        if (has.rowCount) { await client.query('ROLLBACK'); return { ok: false, error: 'Already registered' }; }
        const exists = await client.query('SELECT 1 FROM accounts WHERE id=$1', [accountId]);
        if (!exists.rowCount) accountId = null;
      }
      if (accountId == null) {
        const legacy = `gp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
        const ins = await client.query('INSERT INTO accounts (token, name) VALUES ($1,$2) RETURNING id', [legacy, username]);
        accountId = Number(ins.rows[0].id);
      }
      // UNIQUE(provider, provider_key) is the single source of truth for username
      // uniqueness — a concurrent duplicate registration loses cleanly here.
      await client.query(
        `INSERT INTO auth_providers (account_id, provider, provider_key, secret) VALUES ($1,'password',$2,$3)`,
        [accountId, username.toLowerCase(), secret]);
      await client.query('UPDATE accounts SET name=$1, last_seen=now() WHERE id=$2', [username, accountId]);
      const sessionToken = newSessionToken();
      await client.query('INSERT INTO sessions (token, account_id) VALUES ($1,$2)', [sessionToken, accountId]);
      const acc = await client.query('SELECT * FROM accounts WHERE id=$1', [accountId]);
      await client.query('COMMIT');
      return { ok: true, account: this.toAccount(acc.rows[0]), sessionToken };
    } catch (e: any) {
      await client.query('ROLLBACK');
      if (e?.code === '23505') return { ok: false, error: 'Username taken' };
      throw e;
    } finally {
      client.release();
    }
  }

  async login(username: string, password: string): Promise<AuthOutcome> {
    const r = await this.pool.query(
      `SELECT p.secret, a.* FROM auth_providers p JOIN accounts a ON a.id = p.account_id
       WHERE p.provider='password' AND p.provider_key=$1`, [username.toLowerCase()]);
    if (!r.rowCount || !(await verifyPassword(password, r.rows[0].secret))) {
      return { ok: false, error: 'Wrong username or password' };
    }
    const sessionToken = newSessionToken();
    await this.pool.query('INSERT INTO sessions (token, account_id) VALUES ($1,$2)', [sessionToken, r.rows[0].id]);
    await this.pool.query('UPDATE accounts SET last_seen=now() WHERE id=$1', [r.rows[0].id]);
    return { ok: true, account: this.toAccount(r.rows[0]), sessionToken };
  }

  async logout(sessionToken: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token=$1', [sessionToken]);
  }

  async addXp(id: number, xp: number): Promise<ProfilePayload | null> {
    // read-modify-write the level curve. Done in a transaction so concurrent
    // hand resolutions for the same player can't lose an XP award.
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query('SELECT level, xp FROM accounts WHERE id=$1 FOR UPDATE', [id]);
      if (!r.rowCount) { await client.query('ROLLBACK'); return null; }
      let { level, xp: cur } = r.rows[0];
      cur += xp;
      while (cur >= xpNeeded(level)) { cur -= xpNeeded(level); level++; }
      await client.query('UPDATE accounts SET level=$1, xp=$2 WHERE id=$3', [level, cur, id]);
      await client.query('COMMIT');
      return this.getProfile(id);
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally {
      client.release();
    }
  }

  async recordHand(id: number, won: boolean, chipDelta: number): Promise<void> {
    // fire-and-forget audit + stats; off the hot path (after showdown)
    await this.pool.query(
      `UPDATE accounts SET hands_played = hands_played + 1,
         hands_won = hands_won + $2,
         chips = GREATEST(0, chips + $3) WHERE id = $1`,
      [id, won ? 1 : 0, chipDelta],
    );
    await this.pool.query('INSERT INTO hands (account_id, won, chip_delta) VALUES ($1,$2,$3)', [id, won, chipDelta]);
  }

  async leaderboard(limit: number) {
    const r = await this.pool.query(
      `SELECT id, name, level, xp, hands_won, founder, founder_number FROM accounts
       ORDER BY level DESC, xp DESC, hands_won DESC LIMIT $1`,
      [limit],
    );
    return r.rows.map((x) => ({ id: Number(x.id), name: x.name, level: x.level, xp: x.xp, handsWon: x.hands_won, founder: !!x.founder, founderNumber: x.founder_number ?? null }));
  }

  async setName(id: number, name: string): Promise<ProfilePayload | null> {
    await this.pool.query('UPDATE accounts SET name=$1 WHERE id=$2', [sanitizeName(name, `Ghoul#${id}`), id]);
    return this.getProfile(id);
  }

  /**
   * GENESIS GHOUL grant, race-safe + idempotent. Eligibility: a REGISTERED
   * account (has an auth provider) that has finished at least one hand.
   * The advisory lock single-files the count->grant sequence globally so the
   * cap can never overshoot; the unique index on founder_number is the backstop.
   */
  async grantFounderIfEligible(id: number): Promise<number | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize ALL founder grants: the per-account row lock below does NOT
      // stop two DIFFERENT accounts from counting concurrently and both taking
      // slot #100. This advisory lock is held to COMMIT and makes the
      // count->grant sequence globally single-file.
      await client.query('SELECT pg_advisory_xact_lock(777001)');
      const me = await client.query(
        `SELECT founder, founder_number, hands_played,
                EXISTS(SELECT 1 FROM auth_providers p WHERE p.account_id = accounts.id) AS registered
         FROM accounts WHERE id=$1 FOR UPDATE`, [id]);
      if (!me.rowCount) { await client.query('ROLLBACK'); return null; }
      const row = me.rows[0];
      if (row.founder) { await client.query('COMMIT'); return row.founder_number; } // idempotent
      if (!row.registered || row.hands_played < 1) { await client.query('ROLLBACK'); return null; }
      // count existing founders under a lock to prevent overshooting the cap
      const cnt = await client.query('SELECT COUNT(*)::int AS n FROM accounts WHERE founder=true');
      const n = cnt.rows[0].n as number;
      if (n >= FOUNDER_CAP) { await client.query('ROLLBACK'); return null; }
      const num = n + 1;
      await client.query('UPDATE accounts SET founder=true, founder_number=$1 WHERE id=$2', [num, id]);
      await client.query('COMMIT');
      return num;
    } catch (e) {
      await client.query('ROLLBACK'); throw e;
    } finally {
      client.release();
    }
  }

  private toAccount(r: any): Account {
    return {
      id: Number(r.id), name: r.name, token: r.token, level: r.level,
      xp: r.xp, chips: Number(r.chips), handsPlayed: r.hands_played, handsWon: r.hands_won,
      founder: !!r.founder, founderNumber: r.founder_number ?? null,
    };
  }

  async close() { await this.pool.end(); }
}
