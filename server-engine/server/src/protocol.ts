// ============================================================================
// Ghoul Poker — network protocol (shared contract).
// Both server and client import these types so the socket API can never drift.
// Design rule: the client receives ONLY redacted state. It never sees the deck
// or other players' hole cards until showdown. "Never trust the client" is
// enforced here, structurally, by what we choose to serialize.
// ============================================================================

import type { Stage, ActionType } from '@ghoul/engine';

/** A seat as the CLIENT sees it. `cards` is null for opponents until showdown. */
export interface PublicSeat {
  id: number;
  name: string;
  stack: number;
  bet: number;
  folded: boolean;
  allin: boolean;
  cards: (string | null)[]; // your own cards, or [null,null] / [] for others
  connected: boolean;
  isYou: boolean;
  isTurn: boolean;
  isButton: boolean;
}

/** The redacted table view streamed to a single client each update. */
export interface PublicTable {
  roomCode: string;
  seats: PublicSeat[];
  board: string[];
  pot: number;
  toCall: number;
  minRaise: number;
  stage: Stage;
  handNo: number;
  // whose turn + how long they have (server-authoritative timer)
  turnSeatId: number | null;
  turnEndsAt: number | null; // epoch ms; client renders a cosmetic countdown
}

/** Result of a finished hand, for the win cinematic + history. */
export interface HandResult {
  winners: { id: number; name: string; amount: number }[];
  handName: string | null; // null when everyone folded
  winningCards: string[];
  showdown: boolean;
}

/** Lobby/room metadata shown before a hand starts. */
export interface RoomInfo {
  code: string;
  hostId: number;
  isPublic: boolean;
  players: { id: number; name: string; ready: boolean; connected: boolean }[];
  started: boolean;
  maxSeats: number;
}

// ---- client → server events ----
export interface ClientToServer {
  'auth': (p: { token?: string; name: string }, ack: (r: AuthResult) => void) => void;
  'room:create': (p: { isPublic: boolean }, ack: (r: { code: string } | { error: string }) => void) => void;
  'room:join': (p: { code: string }, ack: (r: { ok: true } | { error: string }) => void) => void;
  'room:quickplay': (ack: (r: { code: string } | { error: string }) => void) => void;
  'room:ready': (p: { ready: boolean }) => void;
  'room:start': () => void; // host only
  'room:leave': () => void;
  'action': (p: { type: ActionType; amount?: number }) => void;
  'chat': (p: { msg: string }) => void;
  'ping:rt': (ack: () => void) => void;
  'leaderboard': (ack: (rows: LeaderRow[]) => void) => void;
  'profile:setName': (p: { name: string }, ack: (r: ProfilePayload | { error: string }) => void) => void;
}

export interface LeaderRow { name: string; level: number; xp: number; handsWon: number; founder: boolean; founderNumber: number | null; }

// ---- server → client events ----
export interface ServerToClient {
  'room:info': (info: RoomInfo) => void;
  'table:state': (table: PublicTable) => void;
  'hand:result': (result: HandResult) => void;
  'chat': (p: { id: number; name: string; msg: string }) => void;
  'error': (p: { message: string }) => void;
  'profile': (p: ProfilePayload) => void;
}

export interface AuthResult {
  ok: boolean;
  token?: string;
  profile?: ProfilePayload;
  error?: string;
}

export interface ProfilePayload {
  id: number;
  name: string;
  level: number;
  xp: number;
  xpNeeded: number;
  chips: number;       // persistent play-money bank
  handsPlayed: number;
  handsWon: number;
  founder: boolean;        // one of the first 100 participants
  founderNumber: number | null; // 1..100
}
