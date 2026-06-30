-- ============================================================================
-- Ghoul Poker schema. Idempotent: the server runs this on boot (CREATE IF NOT
-- EXISTS), so a fresh Postgres becomes launch-ready with no manual migration.
-- Mirrors the Store interface 1:1 — every method maps to queries on these tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounts (
  id            BIGSERIAL PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,        -- opaque session id (JWT upgrade documented)
  name          TEXT NOT NULL,
  level         INT  NOT NULL DEFAULT 1,
  xp            INT  NOT NULL DEFAULT 0,
  chips         BIGINT NOT NULL DEFAULT 1000, -- persistent play-money bank
  hands_played  INT  NOT NULL DEFAULT 0,
  hands_won     INT  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- leaderboard query hits this index (rank by level desc, then xp desc)
CREATE INDEX IF NOT EXISTS idx_accounts_rank ON accounts (level DESC, xp DESC, hands_won DESC);

-- per-hand audit trail. Not on the hot path (written async after showdown).
-- Enables seasons/analytics later without touching the accounts row.
CREATE TABLE IF NOT EXISTS hands (
  id          BIGSERIAL PRIMARY KEY,
  account_id  BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  won         BOOLEAN NOT NULL,
  chip_delta  BIGINT NOT NULL DEFAULT 0,
  played_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hands_account ON hands (account_id, played_at DESC);
