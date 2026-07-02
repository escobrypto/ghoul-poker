// ============================================================================
// Ghoul Poker server — Socket.io entry point.
// Wires authenticated sockets to rooms. Every socket maps to an Account id; a
// player's id is their identity across reconnects. Rooms emit redacted state
// back through per-socket lookups so each client sees only its own cards.
// Deploy target: Railway/Fly (long-lived process, websockets). CORS allows the
// Vercel client origin via CLIENT_ORIGIN env.
// ============================================================================

import { createServer } from 'http';
import { Server } from 'socket.io';
import type { ClientToServer, ServerToClient } from './protocol.js';
import { RoomManager } from './RoomManager.js';
import { MemoryStore } from './Store.js';
import { PgStore } from './PgStore.js';
import type { Store } from './Store.js';

const PORT = Number(process.env.PORT) || 8080;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';

const httpServer = createServer((_req, res) => { res.writeHead(200); res.end('Ghoul Poker server alive'); });
const io = new Server<ClientToServer, ServerToClient>(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

// Persistence: Postgres in production (DATABASE_URL set), in-memory for local dev.
// The game is identical either way — only durability across restarts differs.
let store!: Store;
async function initStore(): Promise<Store> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pg = new PgStore(url);
    await pg.init();
    console.log('💾 Postgres store connected — accounts persist across restarts');
    return pg;
  }
  console.log('⚠️  No DATABASE_URL — using in-memory store (accounts reset on restart)');
  return new MemoryStore();
}
const rooms = new RoomManager();

// socketId -> { accountId, name, roomCode } for routing redacted state
interface Session { accountId: number; name: string; roomCode?: string; }
const sessions = new Map<string, Session>();
// accountId -> socketId, so a room can push state to the right live socket
const liveSocket = new Map<number, string>();

function emitFactoryFor(code: string) {
  return {
    table: (viewerId: number, t: any) => {
      const sid = liveSocket.get(viewerId);
      if (sid) io.to(sid).emit('table:state', t);
    },
    handResult: (r: any) => { io.to(code).emit('hand:result', r); void awardXp(code, r).catch(() => {}); },
    roomInfo: () => {
      const room = rooms.get(code); if (!room) return;
      io.to(code).emit('room:info', {
        code, hostId: room.hostId, isPublic: room.isPublic, started: room.started, maxSeats: room.maxSeats,
        players: room.members.map((m) => ({ id: m.id, name: m.name, ready: m.ready, connected: m.connected })),
      });
    },
    chat: (name: string, msg: string) => io.to(code).emit('chat', { id: 0, name, msg }),
  };
}

// award XP + record stats when a hand resolves (persistence side-effect).
// EVERY dealt player gets hands_played credit (stats + GENESIS eligibility);
// winners additionally earn XP.
async function awardXp(code: string, result: any) {
  try {
    const winnerIds = new Set<number>(result.winners.map((w: any) => w.id));
    const participants: number[] = result.participants ?? [...winnerIds];
    for (const id of participants) {
      await store.recordHand(id, winnerIds.has(id), 0);
      if (winnerIds.has(id)) await store.addXp(id, result.showdown ? 70 : 45);
      // GENESIS GHOUL: first 100 registered accounts to finish a hand.
      // race-safe + idempotent inside the store; safe to call every time.
      await store.grantFounderIfEligible(id);
      const prof = await store.getProfile(id);
      const sid = liveSocket.get(id);
      if (prof && sid) io.to(sid).emit('profile', prof);
    }
  } catch (e) {
    // A transient store error must never take the process (and every table) down.
    console.error('awardXp failed (non-fatal):', e);
  }
}

// ---- auth guardrails: throttle FAILED attempts (5 fails/min per socket + per
// username). Successful logins never count — testing your own account can't
// lock you out — and a success clears the username's fail counter.
const authFails = new Map<string, { n: number; reset: number }>();
function throttled(key: string): boolean {
  const a = authFails.get(key);
  return !!a && Date.now() <= a.reset && a.n >= 5;
}
function noteAuthFail(key: string) {
  const now = Date.now();
  const a = authFails.get(key);
  if (!a || now > a.reset) authFails.set(key, { n: 1, reset: now + 60_000 });
  else a.n++;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of authFails) if (now > v.reset) authFails.delete(k); }, 120_000).unref();
const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

io.on('connection', (socket) => {
  socket.on('auth', async ({ token, name }, ack) => {
    const acc = await store.authenticate(token, name);
    sessions.set(socket.id, { accountId: acc.id, name: acc.name });
    liveSocket.set(acc.id, socket.id);
    const profile = await store.getProfile(acc.id);
    ack({ ok: true, token: acc.token, profile: profile ?? undefined });
  });

  // ---- native accounts: Register → Login → Play ----
  socket.on('auth:register', async (p: any, ack: any) => {
    try {
      const username = String(p?.username ?? '').trim();
      const password = String(p?.password ?? '');
      if (throttled(`r:${socket.id}`)) return ack({ error: 'Too many attempts — wait a minute' });
      if (!USERNAME_RE.test(username)) return ack({ error: 'Username must be 3–16 letters, numbers, or _' });
      if (password.trim().length < 8 || password.length > 72) return ack({ error: 'Password must be at least 8 characters' });
      const cur = sessions.get(socket.id);
      const r = await store.register(cur?.accountId ?? null, username, password);
      if (!r.ok) { noteAuthFail(`r:${socket.id}`); return ack({ error: r.error }); }
      sessions.set(socket.id, { accountId: r.account.id, name: r.account.name });
      liveSocket.set(r.account.id, socket.id);
      // a guest who already finished hands may qualify for GENESIS the moment they register
      await store.grantFounderIfEligible(r.account.id);
      const profile = await store.getProfile(r.account.id);
      ack({ ok: true, token: r.sessionToken, profile: profile ?? undefined });
    } catch (e) {
      console.error('register failed:', e);
      ack({ error: 'Registration failed — try again' });
    }
  });

  socket.on('auth:login', async (p: any, ack: any) => {
    try {
      const username = String(p?.username ?? '').trim();
      const password = String(p?.password ?? '');
      const ukey = `u:${username.toLowerCase()}`;
      if (throttled(`l:${socket.id}`) || throttled(ukey)) {
        return ack({ error: 'Too many attempts — wait a minute' });
      }
      const r = await store.login(username, password);
      if (!r.ok) {
        noteAuthFail(`l:${socket.id}`); noteAuthFail(ukey);
        console.log(`auth: login failed for "${username}" — ${r.error}`); // shows up in Railway logs
        return ack({ error: r.error });
      }
      authFails.delete(ukey); // proven owner — clear the counter
      sessions.set(socket.id, { accountId: r.account.id, name: r.account.name });
      liveSocket.set(r.account.id, socket.id);
      const profile = await store.getProfile(r.account.id);
      ack({ ok: true, token: r.sessionToken, profile: profile ?? undefined });
    } catch (e) {
      console.error('login failed:', e);
      ack({ error: 'Login failed — try again' });
    }
  });

  socket.on('auth:logout', async (p: any, ack: any) => {
    try { if (p?.token) await store.logout(String(p.token)); } catch { /* non-fatal */ }
    ack?.({ ok: true });
  });

  socket.on('room:create', ({ isPublic }, ack) => {
    const s = sessions.get(socket.id); if (!s) return ack({ error: 'Not authenticated' });
    const room = rooms.create(s.accountId, isPublic, emitFactoryFor);
    joinRoom(socket, room.code, ack);
  });

  socket.on('room:join', ({ code }, ack) => {
    const room = rooms.get(code); if (!room) return ack({ error: 'Room not found' });
    joinRoom(socket, room.code, (r: any) => ack(r.code ? { ok: true } : r));
  });

  socket.on('room:quickplay', (ack) => {
    const s = sessions.get(socket.id); if (!s) return ack({ error: 'Not authenticated' });
    let room = rooms.findQuickplay();
    if (!room) room = rooms.create(s.accountId, true, emitFactoryFor);
    joinRoom(socket, room.code, ack);
  });

  socket.on('room:ready', ({ ready }) => withRoom(socket, (room, s) => room.setReady(s.accountId, ready)));
  socket.on('room:start', () => withRoom(socket, (room, s) => room.start(s.accountId)));
  socket.on('room:leave', () => leaveRoom(socket));
  socket.on('action', ({ type, amount }) => withRoom(socket, (room, s) => room.handleAction(s.accountId, type, amount)));
  socket.on('chat', ({ msg }) => withRoom(socket, (room, s) => {
    const clean = String(msg).slice(0, 120);
    io.to(room.code).emit('chat', { id: s.accountId, name: s.name, msg: clean });
  }));

  // lightweight round-trip latency probe; client measures the ack delay
  socket.on('ping:rt', (ack: () => void) => { if (typeof ack === 'function') ack(); });

  // leaderboard pulled live from the store (Postgres in prod)
  socket.on('leaderboard', async (ack: (rows: any[]) => void) => {
    if (typeof ack !== 'function') return;
    try { ack(await store.leaderboard(20)); } catch { ack([]); }
  });

  // persist a chosen display name to the account
  socket.on('profile:setName', async ({ name }, ack) => {
    const s = sessions.get(socket.id);
    if (!s) { if (typeof ack === 'function') ack({ error: 'Not authenticated' }); return; }
    try {
      const prof = await store.setName(s.accountId, String(name || ''));
      if (prof) { s.name = prof.name; if (typeof ack === 'function') ack(prof); io.to(socket.id).emit('profile', prof); }
      else if (typeof ack === 'function') ack({ error: 'Failed' });
    } catch { if (typeof ack === 'function') ack({ error: 'Failed' }); }
  });

  socket.on('disconnect', () => {
    const s = sessions.get(socket.id); if (!s) return;
    if (s.roomCode) { const room = rooms.get(s.roomCode); if (room) room.markDisconnected(s.accountId); }
    if (liveSocket.get(s.accountId) === socket.id) liveSocket.delete(s.accountId);
    sessions.delete(socket.id);
  });
});

function joinRoom(socket: any, code: string, ack: (r: any) => void) {
  const s = sessions.get(socket.id); if (!s) return ack({ error: 'Not authenticated' });
  const room = rooms.get(code); if (!room) return ack({ error: 'Room not found' });
  const res = room.addMember(s.accountId, s.name);
  if ('error' in res) return ack(res);
  s.roomCode = code; socket.join(code);
  emitFactoryFor(code).roomInfo();
  ack({ code });
}

function withRoom(socket: any, fn: (room: any, s: Session) => void) {
  const s = sessions.get(socket.id); if (!s || !s.roomCode) return;
  const room = rooms.get(s.roomCode); if (room) fn(room, s);
}

function leaveRoom(socket: any) {
  const s = sessions.get(socket.id); if (!s || !s.roomCode) return;
  const room = rooms.get(s.roomCode);
  if (room) { room.markDisconnected(s.accountId); socket.leave(s.roomCode); }
  s.roomCode = undefined;
}

// Bootstrap: init persistence, then accept connections. Connection handlers read
// `store` at call-time, so it's guaranteed assigned before any socket connects.
async function bootstrap() {
  store = await initStore();
  setInterval(() => rooms.sweep(), 60_000);
  httpServer.listen(PORT, () => console.log(`👻 Ghoul Poker server on :${PORT}`));
}

bootstrap().catch((e) => { console.error('Fatal boot error:', e); process.exit(1); });
