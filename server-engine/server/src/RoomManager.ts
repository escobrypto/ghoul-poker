// ============================================================================
// RoomManager — creates, indexes, and matchmakes GameRooms.
// In-memory for the first playable (fine for one server box; see scaling note).
// SCALING: to run multiple server instances, room state must move to Redis and
// sockets need a shared adapter (@socket.io/redis-adapter) + sticky routing.
// All room access is funnelled through here so that swap stays localized.
// ============================================================================

import { GameRoom } from './GameRoom.js';

function makeCode(): string {
  // unambiguous alphabet (no O/0/I/1) — players read these aloud / paste in chat
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = ''; for (let i = 0; i < 5; i++) c += A[(Math.random() * A.length) | 0];
  return c;
}

export class RoomManager {
  private rooms = new Map<string, GameRoom>();

  create(hostId: number, isPublic: boolean, emitFactory: (code: string) => ConstructorParameters<typeof GameRoom>[3]): GameRoom {
    let code = makeCode();
    while (this.rooms.has(code)) code = makeCode();
    const room = new GameRoom(code, hostId, isPublic, emitFactory(code));
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): GameRoom | undefined { return this.rooms.get(code.toUpperCase()); }

  /** public matchmaking: join the most-full open public room, else signal create */
  findQuickplay(): GameRoom | null {
    let best: GameRoom | null = null;
    for (const r of this.rooms.values()) {
      if (!r.isPublic || r.started) continue;
      if (r.members.length >= r.maxSeats) continue;
      if (!best || r.members.length > best.members.length) best = r;
    }
    return best;
  }

  remove(code: string) { const r = this.rooms.get(code); if (r) { r.destroy(); this.rooms.delete(code); } }

  /** periodic GC of dead rooms (all players gone) */
  sweep() {
    for (const [code, r] of this.rooms) if (r.members.length === 0 || r.isEmpty) this.remove(code);
  }

  get count() { return this.rooms.size; }
}
