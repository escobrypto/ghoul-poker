// ============================================================================
// Redaction: full server TableState  ->  per-viewer PublicTable.
// THE security boundary. A client only ever receives this output, so it is
// physically impossible for it to learn the deck or opponents' hole cards
// before showdown. Called once per connected viewer on every state change.
// ============================================================================

import type { TableState } from '@ghoul/engine';
import type { PublicTable, PublicSeat } from './protocol.js';

export function redactTableFor(
  state: TableState,
  viewerId: number,
  meta: { roomCode: string; handNo: number; turnEndsAt: number | null; connected: Set<number> },
): PublicTable {
  const showdown = state.stage === 'showdown';
  // A turn is only "open" for client action when the server has armed the turn
  // clock (turnEndsAt). Between actions — while drive()/nextStage() resolve — no
  // seat is actionable, so turnSeatId is null and clients won't emit into the gap.
  const turnOpen = meta.turnEndsAt != null && state.stage !== 'idle' && state.stage !== 'showdown';
  const turnSeat = state.players[state.turn];

  const seats: PublicSeat[] = state.players.map((p, i) => {
    const isYou = p.id === viewerId;
    // reveal rules: your own cards always; everyone else only at showdown
    // (and only if they didn't fold — folded hands stay secret, like real poker)
    let cards: (string | null)[];
    if (isYou) cards = p.cards.slice();
    else if (showdown && !p.folded) cards = p.cards.slice();
    else cards = p.cards.map(() => null);

    return {
      id: p.id,
      name: p.name,
      stack: p.stack,
      bet: p.bet,
      folded: p.folded,
      allin: p.allin,
      cards,
      connected: meta.connected.has(p.id),
      isYou,
      isTurn: turnOpen && i === state.turn,
      isButton: i === state.button,
    };
  });

  return {
    roomCode: meta.roomCode,
    seats,
    board: state.board.slice(),
    pot: state.pot,
    toCall: state.toCall,
    minRaise: state.minRaise,
    stage: state.stage,
    handNo: meta.handNo,
    turnSeatId: turnOpen && turnSeat ? turnSeat.id : null,
    turnEndsAt: meta.turnEndsAt,
  };
}
