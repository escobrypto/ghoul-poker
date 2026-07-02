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
  founder        BOOLEAN NOT NULL DEFAULT false, -- one of the first 100 participants
  founder_number INT,                            -- their founder rank 1..100 (null if not)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- idempotent upgrade for databases created before founder columns existed
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS founder BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS founder_number INT;

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

-- Backstop: founder numbers must be unique. Wrapped so boot survives even if a
-- historical duplicate exists (the advisory lock in PgStore prevents new ones).
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_founder_number
    ON accounts (founder_number) WHERE founder_number IS NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- AUTH — modular provider layer. An account owns progression; a provider row
-- is one way to prove you own it ('password' now; discord/google/steam/wallet
-- later are just more rows — no backend rewrite). Username uniqueness lives on
-- UNIQUE(provider, provider_key) with provider_key = lowercased username.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auth_providers (
  id          SERIAL PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  secret      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_key)
);
CREATE INDEX IF NOT EXISTS idx_auth_providers_account ON auth_providers(account_id);

-- Server-side persistent sessions (opaque random tokens, 30-day sliding expiry)
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX IF NOT EXISTS idx_sessions_account ON sessions(account_id);
