# Ghoul Poker — Multiplayer Architecture

## The one decision that matters: a shared engine, server-authoritative

The poker math (`packages/engine`) is **pure and deterministic** — no React, no DOM,
no I/O. This was true from the single-player build and is why multiplayer didn't
require a rewrite. The same compiled engine runs on the server as the source of
truth and can be imported by the client for optimistic rendering later.

```
packages/engine   poker.ts (hand eval) + table.ts (betting/showdown). UNCHANGED MATH.
server            Node + Socket.io. Owns deck, shuffle, pot, betting, turn order, winner.
client            Visual only. Renders redacted snapshots. (the existing Vite app)
```

## Why server-authoritative, enforced structurally

The server holds the full `TableState` including the deck and every hole card.
Clients receive only a **redacted per-viewer view** (`server/src/redact.ts`):
you see your own cards; opponents' cards are `null` until showdown; folded hands
stay secret. Because the client is never *sent* privileged data, it cannot cheat
by inspecting memory or network traffic. "Never trust the client" is a property
of what we serialize, not a runtime check we hope holds.

Every client action passes through `GameRoom.handleAction`, which validates it is
(a) an in-progress hand and (b) that player's turn, before the engine mutates
anything. Out-of-turn or spoofed actions are dropped silently.

## The authoritative loop (`server/src/GameRoom.ts`)

A timer-driven state machine the clients cannot stall:
`lobby → startHand → (betting round → nextStage)×4 → showdown → next hand`.

- **Turn clock is server-side** (`TURN_MS`). A client countdown is cosmetic only.
  On timeout the server auto-checks/folds so an absent player never freezes a table.
- **Turn windows are explicit.** `turnSeatId`/`turnEndsAt` are only non-null while a
  real action window is open. Between actions (while the street resolves) no seat is
  actionable — this prevents clients from re-triggering actions into the gap.
- **Disconnect ≠ leave.** A disconnected player keeps their seat and committed chips;
  their turns auto-act via the same AI used in single-player; they may reconnect with
  their token within a grace window.

## Persistence (`server/src/Store.ts`)

`Store` is an interface (accounts, XP, leaderboard, hand stats). The first playable
ships `MemoryStore` so gameplay is testable with zero infra. **Production swap:**
implement `Store` against Postgres — the methods map 1:1 to tables — and inject it in
`index.ts`. No game code changes.

## Known future scaling issues (designed-around, not yet solved)

1. **Single-process room state.** Rooms live in `RoomManager`'s memory. Fine for one
   box / hundreds of tables. To scale horizontally: move room state to Redis and add
   `@socket.io/redis-adapter` + sticky sessions. All room access already funnels
   through `RoomManager`, so the blast radius is contained.
2. **Persistence is in-memory** until `MemoryStore` → `PostgresStore`.
3. **No anti-collusion / rake / RNG audit.** Real-money or ranked play would need a
   certified RNG, collusion detection, and an audit log. Out of scope for a social
   play-money launch; the redaction boundary is the prerequisite that makes them addable.

## Deploy split (matches the chosen target)

- **Server → Railway/Fly** (long-lived process, websockets). `PORT` + `CLIENT_ORIGIN` env.
- **Client → Vercel** (static). Points at the server URL via `VITE_SERVER_URL`.

---

## Update: Accounts & Database (persistence)

`Store` now has two implementations behind the same interface:

- **`MemoryStore`** — local dev / tests. Accounts reset on restart.
- **`PgStore`** — production. Postgres-backed; accounts, XP, chips, and stats
  persist across restarts and deploys. Selected automatically when `DATABASE_URL`
  is set; otherwise the server falls back to `MemoryStore` and logs a warning, so
  the game always boots.

**Schema** (`server/src/schema.sql`, applied idempotently on boot):
- `accounts` — identity (token), progression (level/xp), chips, hand stats. Indexed
  for the leaderboard (`level DESC, xp DESC, hands_won DESC`).
- `hands` — per-hand audit trail (off the hot path), the basis for seasons/analytics.

**Why this design survives launch:**
- Pooled connections (`pg.Pool`), parameterized queries (injection-safe).
- `addXp` runs in a transaction with `SELECT … FOR UPDATE` so concurrent hand
  resolutions for the same player can't lose an XP award.
- Persistence is off the critical path: XP/stats are written *after* showdown, so a
  slow DB never stalls a hand.
- `PgStore` accepts an injected pool, so it's tested against an in-memory Postgres
  (`pg-mem`) running real SQL — schema + every query verified without infra.

**Documented next steps (not yet built):**
- Signed JWTs instead of opaque tokens (removes the per-action token lookup).
- A migration tool once the schema starts evolving (currently CREATE IF NOT EXISTS).
- Read replica for leaderboard/profile reads at high scale.

## Deploy (Postgres)

On Railway/Fly, add a Postgres plugin — it injects `DATABASE_URL`. The server picks
it up on boot, applies the schema, and persistence is live. No code change between
local (no DB) and prod (DB) — same binary, different env.
