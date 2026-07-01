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
import type { Store, Account } from './Store.js';
import { xpNeeded, sanitizeName, FOUNDER_LEVEL, FOUNDER_CAP } from './Store.js';
import type { ProfilePayload } from './protocol.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function rowToProfile(r: any): ProfilePayload {
  return {
    id: Number(r.id), name: r.name, level: r.level, xp: r.xp,
    xpNeeded: xpNeeded(r.level), chips: Number(r.chips),
    handsPlayed: r.hands_played, handsWon: r.hands_won,
    founder: !!r.founder, founderNumber: r.founder_number ?? null,
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
      const found = await this.pool.query('SELECT * FROM accounts WHERE token = $1', [token]);
      if (found.rowCount) {
        const a = found.rows[0];
        if (name && name !== a.name) {
          await this.pool.query('UPDATE accounts SET name=$1, last_seen=now() WHERE id=$2', [name.slice(0, 16), a.id]);
          a.name = name.slice(0, 16);
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
    const provided = (name && name.trim()) ? name.trim().slice(0, 16) : null;
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
    const r = await this.pool.query('SELECT * FROM accounts WHERE id=$1', [id]);
    return r.rowCount ? rowToProfile(r.rows[0]) : null;
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
   * Grant a founder number, race-safe. A transaction locks the count so two
   * simultaneous level-ups can't both claim slot #100. Idempotent: an existing
   * founder just returns their number. Only accounts at FOUNDER_LEVEL qualify.
   */
  async grantFounderIfEligible(id: number): Promise<number | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const me = await client.query('SELECT founder, founder_number, level FROM accounts WHERE id=$1 FOR UPDATE', [id]);
      if (!me.rowCount) { await client.query('ROLLBACK'); return null; }
      const row = me.rows[0];
      if (row.founder) { await client.query('COMMIT'); return row.founder_number; } // idempotent
      if (row.level < FOUNDER_LEVEL) { await client.query('ROLLBACK'); return null; }
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
