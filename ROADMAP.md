# 👻 Ghoul Poker — Road to v1.0: PREMIUM FIRST

Living document. Updated before and after every feature. Source of truth.
v1.0 = "a polished, addictive multiplayer poker game." Every screen
intentional, every interaction polished, codebase modular. Quality over
quantity. Ship the premium feel FIRST; systems plug in after.

Last updated: NATIVE AUTH + GENESIS GHOUL SHIPPED (auth 12/12, PG 20/20, full
gameplay E2E green over production config). P1 stage architecture still awaits
Esco's visual QA before P2 (cosmetic framework) begins.

## Status legend
✅ shipped & tested · 🟨 in progress · ⬜ not started · 🧊 deferred

---

## Shipped foundation (stability-audited 🔒)
Server-authoritative engine w/ correct side pots (8/8) · multiplayer rooms +
quickplay + redaction (E2E clean, zero leaks) · reconnect w/ seat+stack ·
Postgres persistence (10/10) · leaderboard · founder badge (race-safe, live
rule: first 100 to L2 — superseded by Genesis Ghoul below) · neon-goth scene,
sounds, animations, ALL IN cinematic · GPU-gated shader bg · real drip logo +
lobby backdrop (cosmetics pass 1).

## THE POLISH SEQUENCE (immediate, in order)

| # | Priority | Status | Scope |
|---|----------|--------|-------|
| P1 | **Table alignment audit** | 🟨 shipped, pending visual check | ROOT CAUSE: seats positioned in scene-space while felt clamped independently → drift at every aspect ratio. FIX: letterboxed STAGE pattern — play area authored at fixed 1200x720, scaled as one unit (useStageScale + ResizeObserver, cap 1.3x), room art stays full-bleed behind. All play elements (felt, seats, board, pot, deck, candles, chip flights, cinematic) now share ONE coordinate space; alignment cannot drift per-resolution by construction. |
| P2 | **Cosmetic framework** | ⬜ gated on P1 QA | reusable theme system — a table = configuration + artwork, NEVER code. Theme config defines: background image, felt, rail, lighting, ambient particles, color palette, chip set, card design, neon signs, decorative props, ambient audio (future slot). Target library: Back Alley, Underground Casino, Cathedral, Crypt, Rooftop, Halloween, Christmas, 4th of July, Cyber, Neon, High Roller, +more. Server-validated equip. A new table = an art drop, not an engineering project. |
| P3 | **Card v2** | 🟨 pass 2 shipped | IDENTITY DECIDED: full switch to traditional neon suits (spade violet / heart red / club teal / diamond magenta) per the Card Designs sheet — crypto glyphs retired (engine always used s/h/c/d internally; zero server impact). Shipped: layered card system — programmatic frame/indices + classic pip layouts (2-10) with cropped sheet suit glyphs, big-glyph aces, interim letter treatment for J/Q/K, skull card back from the sheet (deck + hidden cards). Cards stay crisp at any stage scale. AWAITING from Esco: high-res renders of 2 backs, 4 suit glyphs, 4 face-art pieces (A/K/Q/J) to replace the sheet crops — they drop in as files, no code. |
| P4 | **Environmental polish** | 🟨 pass 1 (mock adoption) | Esco's table mock adopted as the visual target. Shipped: community cards to mock proportions (100x144), hole cards 58x82, pot rebuilt as a neon marquee banner with REAL denomination chips (1K/500/100/25/5 cropped from the mock) shown per pot size, side panels slimmed 300/320→266/286 (bigger stage on every screen), chat compacted to the mock's clean density. NEXT PASS (needs Esco's eyes on pass 1 first): seat pod restructure (large avatar art over nameplate, cards below), action bar redesign (hotkey hints, bet fraction buttons, slider, circular timer), top bar restyle. Original scope: | premium casino ambience + backgrounds, GG branding in the table/felt, bigger logo presence, better composition, animation toggle in settings (expose existing GPU gate). |
| P5 | **Profiles** | ⬜ | username, avatar, Genesis badge, level, XP, chips, lifetime winnings, biggest pot, hands played/won, win %, favorite hand, achievement showcase. Requires per-hand recording for ALL seats (fixes winners-only stats gap). |

## AUTH — native accounts (v1.0 requirement)
| Item | Status | Notes |
|------|--------|-------|
| Register / login / logout, username+password | ✅ | Register → Login → Play, in-lobby UI; guests keep playing and can upgrade anytime. 12/12 live E2E. |
| Password hashing | ✅ | Node built-in scrypt (memory-hard, zero new deps), stored `scrypt:salt:hash`, timing-safe verify |
| Persistent server-side sessions | ✅ | opaque tokens in `sessions` table, 30-day sliding expiry, logout kills server-side, survives reconnects |
| Pluggable provider layer | ✅ | `auth_providers` (UNIQUE provider+key = case-insensitive usernames) — Discord/Google/Steam/wallet = new rows later, zero rewrite |
| Token-account migration | ✅ | registering upgrades the guest account in place — XP/level/badge preserved (tested) |
| Auth rate limiting | ✅ | 5 attempts/min per socket + per username on login |

## GENESIS GHOUL (rarest cosmetic in the game)
| Item | Status | Notes |
|------|--------|-------|
| Grant: first 100 registered accounts | ✅ | rule live: REGISTERED + finished ≥1 hand. Advisory-lock serialized, unique-index backstop, idempotent. Proven: 150-way concurrent race → exactly #1..#100 unique; unregistered NEVER granted. Existing production badges keep their numbers. |
| Display everywhere | 🟨 | lobby + leaderboard show 👑 GENESIS #N (renamed). Poker table + chat display lands with P5 profiles (needs badge data in seat payloads). |

## FUTURE ECONOMY (architect now, build later)
5,000 starting chips for new players · persistent bankroll · then: High Roller
tables, cosmetic shop, seasonal progression, daily missions, Battle Pass,
airdrops, wallet integrations. Schema/interfaces designed so these plug in
without rewrites. Bust-handling design decision still open (auto-refill goes
away when economy is real).

## Also queued
✅ CPU OPPONENTS — practice-vs-CPU button + host ADD/REMOVE CPU in room lobby. Bots: negative ids, ghoul-roster names/avatars, engine Monte-Carlo AI with human-feel delays, auto-ready, zero XP/stats/Genesis/leaderboard/DB footprint, cards redacted like anyone's, hands halt when no human remains, bot-only rooms GC'd. 10/10 E2E. Solves solo-testing AND the empty-lobby problem at launch.
⬜ Quick chat (RL-style presets, instant, non-intrusive, server rate-limited)
⬜ Rate limiting / abuse guards + name filter (before promoting outside BRYPTO)
⬜ Landing/rules screen ("fake chips, not gambling" explicit in-product)
⬜ Friends · ⬜ Seasons · ⬜ Table/chip art library ingestion (via P2 framework)

## Post-v1.0 (explicitly deferred)
🧊 Discord/Google/Steam/wallet login (providers slot into auth layer) ·
🧊 NFT inventory · 🧊 Steam build · 🧊 Mobile app · 🧊 Redis multi-instance ·
🧊 Spectator mode

---

## P1 QA gate (Esco, live — play hands, don't just screenshot)
Resolutions: 1920x1080 · 1440p · ultrawide · narrow window · fullscreen · browser zoom 90/100/110%.
Verify: table centered · community cards centered · pot centered · dealer button on right seat · chip animations land correctly · ALL IN cinematic aligned · avatars on seats · chat/history/control panels aligned · no clipping/stretching.

## Working rules (non-negotiable)
- Functionality before features. Verify stability, preserve MP sync, no regressions.
- Server-authoritative always; clients render redacted snapshots; re-verify redaction on every change.
- Per feature: justify priority, estimate, risks → implement → TEST (tsc + build + runtime + existing systems + redaction) → update this file.
- Esco produces premium art; the framework makes every drop plug-and-play.

## Decision log
- Discord login CUT from v1.0 → clean native username/password auth with a pluggable provider layer so OAuth/wallets bolt on later.
- Genesis Ghoul criteria moves from "first 100 to L2" to "first 100 registered"; existing granted badges are permanent and keep numbers. DECIDED: grant = registered + finish 1 hand (bot-farm floor). Existing badges keep numbers; remaining slots fill in qualification order.
- Design priority order (permanent): 1 rock-solid gameplay · 2 beautiful architecture · 3 cosmetic framework · 4 player identity · 5 live-service pipeline · 6 economy/progression · 7 Web3. No quick hacks; every major feature must REDUCE future work.
- P1 solved via the letterboxed-stage pattern (standard in poker clients): one fixed design size scaled uniformly beats per-breakpoint layouts — desktop stays pixel-identical, every other size is proportionally correct, zero breakpoint bugs possible. Dedicated mobile-first layout deferred to its own pass.
- Polish before systems: alignment → framework → cards → environment → profiles. Framework before library (20 tables = 20 config entries, not 20 refactors).
- Profiles deliberately fix the winners-only stats gap (per-hand recording, all seats).
- Persistence behind `Store`; client renders adapted snapshots, no poker logic client-side; crypto post-v1.0; leaderboard before Seasons.
- Concept renders contain baked-in fake UI → lobby backdrop + logo source only.
- AUDIT FIXES (shipped): side pots via per-player `committed` + layered pots + refunds + clockwise odd chips; pot zeroed on payout; founder grant advisory-locked + unique-index backstop; awardXp crash-guarded; PgStore name sanitization unified.
- CARD v2 architecture: layered (art assets + programmatic geometry) over 52 baked images — AI-generating 52 individual cards causes style drift; layers keep cards crisp at all scales, tiny payload, and make card skins a cosmetic-framework config.
- LOGIN HOTFIX: passwords now trimmed at register + login (mobile-keyboard trailing spaces were a silent lockout: register "pass " then login "pass" = wrong password forever) with raw-password fallback for pre-fix accounts; login errors made distinct ("No account with that username" vs "Wrong password"); rate limiter counts FAILURES only and a successful login clears the counter; failed logins now logged server-side for Railway diagnostics.
- AUTH SHIPPED: scrypt over argon2/bcrypt (built into Node = nothing new to compile on Railway); sessions are opaque DB tokens (JWT unnecessary at this scale, revocation trivial); localStorage over cookies (cross-origin Vercel↔Railway socket setup, matches existing token flow).
- hands_played now records EVERY dealt player per hand (was winners-only) — enables Genesis eligibility + partial P5 stats groundwork. XP remains winners-only by design.
- KNOWN + INTENTIONAL: heads-up blinds button-posts-BB; disconnected players AI-piloted; XP winners-only (P5 may revisit); profile chips static (fixed by economy); short all-in reopens action.
