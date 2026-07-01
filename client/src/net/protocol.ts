// ============================================================================
// Network protocol — MUST stay identical to server/src/protocol.ts.
// These are the wire types. The client only ever receives redacted views.
// ============================================================================
import type { Stage, ActionType } from '../engine/table';

export interface PublicSeat {
  id: number;
  name: string;
  stack: number;
  bet: number;
  folded: boolean;
  allin: boolean;
  cards: (string | null)[];
  connected: boolean;
  isYou: boolean;
  isTurn: boolean;
  isButton: boolean;
}

export interface PublicTable {
  roomCode: string;
  seats: PublicSeat[];
  board: string[];
  pot: number;
  toCall: number;
  minRaise: number;
  stage: Stage;
  handNo: number;
  turnSeatId: number | null;
  turnEndsAt: number | null;
}

export interface HandResult {
  winners: { id: number; name: string; amount: number }[];
  handName: string | null;
  winningCards: string[];
  showdown: boolean;
}

export interface RoomInfo {
  code: string;
  hostId: number;
  isPublic: boolean;
  players: { id: number; name: string; ready: boolean; connected: boolean }[];
  started: boolean;
  maxSeats: number;
}

export interface ProfilePayload {
  id: number;
  name: string;
  level: number;
  xp: number;
  xpNeeded: number;
  chips: number;
  handsPlayed: number;
  handsWon: number;
  founder: boolean;
  founderNumber: number | null;
}

export interface AuthResult {
  ok: boolean;
  token?: string;
  profile?: ProfilePayload;
  error?: string;
}

export interface LeaderRow { name: string; level: number; xp: number; handsWon: number; founder: boolean; founderNumber: number | null; }

export type { ActionType };
