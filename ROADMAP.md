# 👻 Ghoul Poker — Road to v1.0

Living document. Updated before and after every feature. Source of truth for
release scope. v1.0 = "six people can play a polished, persistent, social game
on Steam" — crypto optional.

Last updated: STABILITY AUDIT complete — side pots fixed, founder race fixed, crash guard added; engine 8/8, live E2E clean, Postgres 10/10. Cosmetics pass 1 also staged. Next: finish Cosmetics art, then Daily Missions.

## Status legend
✅ shipped & tested · 🟨 in progress · ⬜ not started · 🧊 post-v1.0

---

## Core (must ship for v1.0)

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Poker Engine (server-authoritative) | ✅ | pure, 15 tests pass |
| 2 | UI / neon-goth table scene | ✅ | unchanged through networking |
| 3 | Sounds | ✅ | 6 SFX, toggle, browser-safe |
| 4 | Animations (chips/cards/cinematic) | ✅ | reconstructed from net deltas |
| 5 | Multiplayer Core (rooms, redaction) | ✅ | E2E verified |
| 6 | Client Networking | ✅ | client is pure renderer |
| 7 | Accounts | ✅ | token identity, reconnect |
| 8 | Database (Postgres) | ✅ | PgStore, 16 tests vs pg-mem |
| 9 | Leaderboards | ✅ | live panel, top-20, you-highlight, 15s refresh; E2E verified |
| 10 | **Daily Missions** | 🟨 | NEXT — server-tracked, persisted, claimable |
| 11 | Friends | ⬜ | add/online/invite-to-room |
| 12 | Seasons | ⬜ | time-boxed leaderboard + reset + rewards |
| 13 | Cosmetics | 🟨 | pass 1 ✅: real GHOUL POKER logo (cropped+keyed from concept art) + poker-room lobby backdrop. Remaining: card backs, GG logo in HUD, table themes, equip/unlock system |
| 14 | Reconnect / latency UX | ✅ | veil + latency badge |
| 15 | Lobby (quickplay/private/spectate/friends) | 🟨 | quickplay+private done; spectate+friends pending |

## Launch-readiness (must pass before tagging v1.0)
| Item | Status |
|------|--------|
| All TypeScript projects build clean | ✅ |
| Engine + DB unit tests green | ✅ |
| Full multiplayer E2E green | ✅ |
| Server deploy doc (Railway/Fly + Postgres) | ✅ |
| Client deploy doc (Vercel) | ✅ |
| Rate limiting / abuse guards | ⬜ |
| Reconnect mid-hand verified | ✅ E2E: token re-auth, seat + stack retained |
| Stability audit (pot math, redaction, persistence, founder) | ✅ audit-engine / audit-e2e / audit-pg all green |

## Post-v1.0 (explicitly deferred)
🧊 NFT Inventory · 🧊 Wallet · 🧊 Steam Build · 🧊 Mobile · 🧊 JWT auth ·
🧊 Redis multi-instance scaling · 🧊 Spectator mode (stretch for v1.0)

---

## Decision log
- Persistence behind `Store` interface → Postgres swap was zero-game-code-change.
- Client renders from adapted server snapshots; no poker logic client-side.
- Crypto features all deferred to post-v1.0 (priority: fun first).
- Leaderboard built before Seasons on purpose: Seasons = leaderboard + timer + reset, so this de-risks #12.
- Concept renders (poker-room/room-top) contain baked-in fake UI → used as lobby backdrop + logo source only, never behind the live table.
- AUDIT FIXES: (1) side pots — engine now tracks per-player `committed` and layers pots at all-in levels; short all-ins can no longer scoop uncovered chips, uncalled bets refund, odd chips go clockwise from the button. (2) pot zeroed on payout so showdown snapshots never double-count. (3) founder grant serialized via pg advisory lock (row lock alone allowed two accounts to both take slot #100) + unique-index backstop in schema. (4) awardXp wrapped — a transient DB error can no longer crash the whole server mid-hand. (5) name sanitization unified across PgStore auth paths.
- KNOWN + INTENTIONAL (not bugs, revisit later): heads-up blinds are button-posts-BB (nonstandard but symmetric); disconnected players are piloted by the engine AI; XP/stats currently record winners only; profile chips are static (table stacks are per-room); an all-in raise below min-raise reopens action (nonstandard, not exploitable).
