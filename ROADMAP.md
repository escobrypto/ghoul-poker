# 👻 Ghoul Poker — Road to v1.0

Living document. Updated before and after every feature. Source of truth for
release scope. v1.0 = "six people can play a polished, persistent, social game
on Steam" — crypto optional.

Last updated: Leaderboards shipped. Next: Daily Missions.

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
| 13 | Cosmetics | ⬜ | unlockable card backs / table themes / avatar frames |
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
| Reconnect mid-hand verified | 🟨 (logic done, needs explicit test) |

## Post-v1.0 (explicitly deferred)
🧊 NFT Inventory · 🧊 Wallet · 🧊 Steam Build · 🧊 Mobile · 🧊 JWT auth ·
🧊 Redis multi-instance scaling · 🧊 Spectator mode (stretch for v1.0)

---

## Decision log
- Persistence behind `Store` interface → Postgres swap was zero-game-code-change.
- Client renders from adapted server snapshots; no poker logic client-side.
- Crypto features all deferred to post-v1.0 (priority: fun first).
- Leaderboard built before Seasons on purpose: Seasons = leaderboard + timer + reset, so this de-risks #12.
