# 👻 Ghoul Poker — Road to v1.0: PREMIUM FIRST

Living document. Updated before and after every feature. Source of truth.
v1.0 = "a polished, addictive multiplayer poker game." Every screen
intentional, every interaction polished, codebase modular. Quality over
quantity. Ship the premium feel FIRST; systems plug in after.

Last updated: P1 alignment fix shipped (stage pattern) — pending Esco's visual
verification at phone/laptop/ultrawide. Genesis rule decided: registered +
finish 1 hand. Next: P2 cosmetic framework.

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
| P2 | **Cosmetic framework** | ⬜ | reusable theme system — table = config: felt, rail, background, lighting, particles, ambience, logo, seasonal assets. NO hardcoded tables, ever. Future tables = drop in artwork. Server-validated equip. |
| P3 | **Card v2** | ⬜ | premium redesign: larger, readable, clean typography, high suit visibility, more impact. SVG-based, neon/night aesthetic kept. |
| P4 | **Environmental polish** | ⬜ | premium casino ambience + backgrounds, GG branding in the table/felt, bigger logo presence, better composition, animation toggle in settings (expose existing GPU gate). |
| P5 | **Profiles** | ⬜ | username, avatar, Genesis badge, level, XP, chips, lifetime winnings, biggest pot, hands played/won, win %, favorite hand, achievement showcase. Requires per-hand recording for ALL seats (fixes winners-only stats gap). |

## AUTH — native accounts (v1.0 requirement)
| Item | Status | Notes |
|------|--------|-------|
| Register / login / logout, username+password | ⬜ | UX: Register → Login → Play. No OAuth in v1.0. |
| Password hashing | ⬜ | argon2id (or bcrypt) — never plaintext, never reversible |
| Persistent server-side sessions | ⬜ | httpOnly session tokens; account-based progression |
| Pluggable provider layer | ⬜ | `auth_providers` table decoupled from accounts → Discord/Google/Steam/wallet add later with ZERO backend rewrite |
| Token-account migration | ⬜ | registering from a browser with an existing localStorage token upgrades that account in place — XP/level/badge preserved |

## GENESIS GHOUL (rarest cosmetic in the game)
| Item | Status | Notes |
|------|--------|-------|
| Grant: first 100 registered accounts | ⬜ | server-side only, race-safe (advisory-lock pattern already proven), permanent, never removable, never re-obtainable. Existing production badges keep their numbers; remaining slots fill by registration. Rule: registered + finish 1 hand. |
| Display everywhere | ⬜ | lobby, profile, poker table, chat, leaderboard |

## FUTURE ECONOMY (architect now, build later)
5,000 starting chips for new players · persistent bankroll · then: High Roller
tables, cosmetic shop, seasonal progression, daily missions, Battle Pass,
airdrops, wallet integrations. Schema/interfaces designed so these plug in
without rewrites. Bust-handling design decision still open (auto-refill goes
away when economy is real).

## Also queued
⬜ Quick chat (RL-style presets, instant, non-intrusive, server rate-limited)
⬜ Rate limiting / abuse guards + name filter (before promoting outside BRYPTO)
⬜ Landing/rules screen ("fake chips, not gambling" explicit in-product)
⬜ Friends · ⬜ Seasons · ⬜ Table/chip art library ingestion (via P2 framework)

## Post-v1.0 (explicitly deferred)
🧊 Discord/Google/Steam/wallet login (providers slot into auth layer) ·
🧊 NFT inventory · 🧊 Steam build · 🧊 Mobile app · 🧊 Redis multi-instance ·
🧊 Spectator mode

---

## Working rules (non-negotiable)
- Functionality before features. Verify stability, preserve MP sync, no regressions.
- Server-authoritative always; clients render redacted snapshots; re-verify redaction on every change.
- Per feature: justify priority, estimate, risks → implement → TEST (tsc + build + runtime + existing systems + redaction) → update this file.
- Esco produces premium art; the framework makes every drop plug-and-play.

## Decision log
- Discord login CUT from v1.0 → clean native username/password auth with a pluggable provider layer so OAuth/wallets bolt on later.
- Genesis Ghoul criteria moves from "first 100 to L2" to "first 100 registered"; existing granted badges are permanent and keep numbers. DECIDED: grant = registered + finish 1 hand (bot-farm floor). Existing badges keep numbers; remaining slots fill in qualification order.
- P1 solved via the letterboxed-stage pattern (standard in poker clients): one fixed design size scaled uniformly beats per-breakpoint layouts — desktop stays pixel-identical, every other size is proportionally correct, zero breakpoint bugs possible. Dedicated mobile-first layout deferred to its own pass.
- Polish before systems: alignment → framework → cards → environment → profiles. Framework before library (20 tables = 20 config entries, not 20 refactors).
- Profiles deliberately fix the winners-only stats gap (per-hand recording, all seats).
- Persistence behind `Store`; client renders adapted snapshots, no poker logic client-side; crypto post-v1.0; leaderboard before Seasons.
- Concept renders contain baked-in fake UI → lobby backdrop + logo source only.
- AUDIT FIXES (shipped): side pots via per-player `committed` + layered pots + refunds + clockwise odd chips; pot zeroed on payout; founder grant advisory-locked + unique-index backstop; awardXp crash-guarded; PgStore name sanitization unified.
- KNOWN + INTENTIONAL: heads-up blinds button-posts-BB; disconnected players AI-piloted; XP winners-only (fixed by P5); profile chips static (fixed by economy); short all-in reopens action.
