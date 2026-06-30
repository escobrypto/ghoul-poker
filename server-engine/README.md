# 👻 Ghoul Poker — Multiplayer Core (server-authoritative)

The first version six people can play together online. Server owns the game;
clients are visual. See `ARCHITECTURE.md` for the why.

## What works right now (verified by automated tests)

- ✅ Server-authoritative hands: deck, shuffle, pot, betting, turn order, winner — all server-side
- ✅ Per-viewer redaction: you only ever receive your own hole cards (no leaks pre-showdown)
- ✅ Persistent accounts with token reconnect
- ✅ XP / level / chips stored per account, awarded on wins
- ✅ Private rooms via 5-char codes
- ✅ Public quickplay matchmaking (joins the fullest open room)
- ✅ Disconnect grace + auto-act so a table never stalls
- ✅ Leaderboard + hand stats in the Store

## Run locally

```bash
npm install
npm run build:engine     # compile shared engine
npm run build:server     # compile server
node server/dist/index.js   # starts on :8080
```

Then point a client at `ws://localhost:8080`.

## Test it (no client needed)

```bash
node mp_test.mjs      # 3 clients: auth → room → play a hand → redaction checks
node recon_test.mjs   # quickplay matchmaking + reconnect
node engine_test.mjs  # 15 engine assertions (hand eval + chip conservation)
```

## Layout

```
packages/engine/   shared poker math (pure, deterministic) — @ghoul/engine
server/            Socket.io authoritative server — @ghoul/server
  src/protocol.ts    shared event/payload types (the socket contract)
  src/redact.ts      full state -> per-viewer view (the security boundary)
  src/GameRoom.ts    authoritative hand loop for one table
  src/RoomManager.ts create/lookup/quickplay
  src/Store.ts       accounts/XP/leaderboard (MemoryStore now, Postgres later)
  src/index.ts       Socket.io wiring
```

## Next steps (in priority order — fun first)

1. **Wire the existing client** to consume `table:state` instead of the local hook.
   The scene already renders from a snapshot; this is a data-source swap, not a redesign.
2. Lobby UI (room code entry, ready-up, player list) — the events already exist.
3. `PostgresStore` for real persistence.
4. Deploy: server → Railway/Fly, client → Vercel.

## Deploy

Server (Railway/Fly): set `PORT` and `CLIENT_ORIGIN` (your Vercel URL). Run `npm run build:server && node server/dist/index.js`.
Client (Vercel): set `VITE_SERVER_URL` to the server's public URL.
