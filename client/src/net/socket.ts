// ============================================================================
// GhoulSocket — the client's single connection to the authoritative server.
// Owns: connect/reconnect lifecycle, auth + token persistence, latency probe.
// Everything game-related flows through here; the client never opens a second
// channel and never computes poker logic. This is a thin transport wrapper —
// all decisions live server-side.
// ============================================================================
import { io, Socket } from 'socket.io-client';
import type {
  PublicTable, HandResult, RoomInfo, ProfilePayload, AuthResult, ActionType,
} from './protocol';

const SERVER_URL = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:8080';
const TOKEN_KEY = 'ghoul_token';
const NAME_KEY = 'ghoul_name';

export type ConnStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

export interface NetHandlers {
  onTable?: (t: PublicTable) => void;
  onRoomInfo?: (r: RoomInfo) => void;
  onHandResult?: (r: HandResult) => void;
  onChat?: (m: { id: number; name: string; msg: string }) => void;
  onProfile?: (p: ProfilePayload) => void;
  onStatus?: (s: ConnStatus, latencyMs: number) => void;
  onError?: (msg: string) => void;
}

export class GhoulSocket {
  private sock: Socket;
  private handlers: NetHandlers = {};
  private latency = 0;
  private pingTimer: number | null = null;
  status: ConnStatus = 'connecting';

  constructor() {
    // localStorage is the ONE allowed client persistence: the session token, so a
    // refresh/reconnect resumes the same account. Not game state — just identity.
    this.sock = io(SERVER_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 600,
      reconnectionDelayMax: 4000,
    });
    this.wire();
  }

  on(h: NetHandlers) { this.handlers = { ...this.handlers, ...h }; }

  private setStatus(s: ConnStatus) {
    this.status = s;
    this.handlers.onStatus?.(s, this.latency);
  }

  private wire() {
    this.sock.on('connect', () => {
      this.authenticate();         // (re)auth on every (re)connect
      this.startPing();
    });
    this.sock.io.on('reconnect_attempt', () => this.setStatus('reconnecting'));
    this.sock.on('disconnect', () => { this.setStatus('offline'); this.stopPing(); });

    this.sock.on('table:state', (t: PublicTable) => this.handlers.onTable?.(t));
    this.sock.on('room:info', (r: RoomInfo) => this.handlers.onRoomInfo?.(r));
    this.sock.on('hand:result', (r: HandResult) => this.handlers.onHandResult?.(r));
    this.sock.on('chat', (m) => this.handlers.onChat?.(m));
    this.sock.on('profile', (p: ProfilePayload) => this.handlers.onProfile?.(p));
    this.sock.on('error', (e: { message: string }) => this.handlers.onError?.(e.message));
  }

  private authenticate() {
    const token = localStorage.getItem(TOKEN_KEY) || undefined;
    const name = localStorage.getItem(NAME_KEY) || `Ghoul#${(Math.random() * 9000 + 1000) | 0}`;
    this.setStatus('connecting');
    this.sock.emit('auth', { token, name }, (res: AuthResult) => {
      if (res.ok) {
        if (res.token) localStorage.setItem(TOKEN_KEY, res.token);
        if (res.profile) {
          localStorage.setItem(NAME_KEY, res.profile.name);
          this.handlers.onProfile?.(res.profile);
        }
        this.setStatus('online');
        // auto-rejoin a room we were in (server keeps the seat through grace window)
        const lastRoom = sessionStorage.getItem('ghoul_room');
        if (lastRoom) this.joinRoom(lastRoom, () => {});
      } else {
        this.handlers.onError?.(res.error || 'Auth failed');
      }
    });
  }

  // ---- latency probe (socket.io has built-in ping; we surface it) ----
  private startPing() {
    this.stopPing();
    const probe = () => {
      const t0 = performance.now();
      this.sock.emit('ping:rt', () => {
        this.latency = Math.round(performance.now() - t0);
        this.handlers.onStatus?.(this.status, this.latency);
      });
    };
    probe();
    this.pingTimer = window.setInterval(probe, 3000);
  }
  private stopPing() { if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; } }

  // ---- native accounts: Register → Login → Play ----
  register(username: string, password: string, cb: (err: string | null) => void) {
    this.sock.emit('auth:register', { username, password }, (r: any) => {
      if (r?.ok) {
        localStorage.setItem(TOKEN_KEY, r.token);          // session token replaces guest token
        if (r.profile) { localStorage.setItem(NAME_KEY, r.profile.name); this.handlers.onProfile?.(r.profile); }
        cb(null);
      } else cb(r?.error || 'Registration failed');
    });
  }

  login(username: string, password: string, cb: (err: string | null) => void) {
    this.sock.emit('auth:login', { username, password }, (r: any) => {
      if (r?.ok) {
        localStorage.setItem(TOKEN_KEY, r.token);
        if (r.profile) { localStorage.setItem(NAME_KEY, r.profile.name); this.handlers.onProfile?.(r.profile); }
        cb(null);
      } else cb(r?.error || 'Login failed');
    });
  }

  logout() {
    const token = localStorage.getItem(TOKEN_KEY);
    // kill the server session, clear local identity, come back as a fresh guest
    this.sock.emit('auth:logout', { token }, () => {});
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(NAME_KEY);
    sessionStorage.removeItem('ghoul_room');
    window.location.reload();
  }

  // ---- actions (client → server) ----
  setName(name: string, cb?: (ok: boolean) => void) {
    localStorage.setItem(NAME_KEY, name);
    this.sock.emit('profile:setName', { name }, (r: any) => {
      if (r && !r.error) { this.handlers.onProfile?.(r); cb?.(true); }
      else cb?.(false);
    });
  }

  createRoom(isPublic: boolean, cb: (code: string | null) => void) {
    this.sock.emit('room:create', { isPublic }, (r: any) => {
      if (r.code) { sessionStorage.setItem('ghoul_room', r.code); cb(r.code); }
      else { this.handlers.onError?.(r.error); cb(null); }
    });
  }
  joinRoom(code: string, cb: (ok: boolean) => void) {
    this.sock.emit('room:join', { code: code.toUpperCase() }, (r: any) => {
      if (r.ok || r.code) { sessionStorage.setItem('ghoul_room', code.toUpperCase()); cb(true); }
      else { this.handlers.onError?.(r.error); cb(false); }
    });
  }
  quickplay(cb: (code: string | null) => void) {
    this.sock.emit('room:quickplay', (r: any) => {
      if (r.code) { sessionStorage.setItem('ghoul_room', r.code); cb(r.code); }
      else { this.handlers.onError?.(r.error); cb(null); }
    });
  }
  ready(v: boolean) { this.sock.emit('room:ready', { ready: v }); }
  startGame() { this.sock.emit('room:start'); }
  leaveRoom() { this.sock.emit('room:leave'); sessionStorage.removeItem('ghoul_room'); }
  act(type: ActionType, amount?: number) { this.sock.emit('action', { type, amount }); }
  sendChat(msg: string) { this.sock.emit('chat', { msg }); }
  requestLeaderboard(cb: (rows: import('./protocol').LeaderRow[]) => void) {
    this.sock.emit('leaderboard', (rows: any[]) => cb(rows || []));
  }

  get latencyMs() { return this.latency; }
}

// module singleton — one connection per tab
let instance: GhoulSocket | null = null;
export function getSocket(): GhoulSocket {
  if (!instance) instance = new GhoulSocket();
  return instance;
}
