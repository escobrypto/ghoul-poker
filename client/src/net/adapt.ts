// ============================================================================
// adapt.ts — translate the server's redacted PublicTable into the exact
// TableState shape the existing scene already renders from. ZERO rendering code
// changes: the scene/seats/cards keep consuming the same props as single-player.
//
// Key transform: re-seat the viewer to index 0. The scene's seat layout puts
// index 0 at bottom-center ("you"), so we rotate the server seat array until the
// local player is first. Everyone else preserves clockwise order around them.
// ============================================================================
import type { TableState, Player } from '../engine/table';
import type { PublicTable, PublicSeat } from './protocol';

export interface AdaptedView {
  state: TableState;          // scene-shaped (viewer at players[0])
  yourSeatId: number | null;
  serverIndexOfId: Map<number, number>; // id -> ORIGINAL server seat index
}

function seatToPlayer(s: PublicSeat): Player {
  return {
    id: s.id,
    name: s.name,
    you: s.isYou,
    stack: s.stack,
    bet: s.bet,
    folded: s.folded,
    allin: s.allin,
    acted: false, // not needed for rendering; server owns real acted state
    // cards: server sends null for hidden; scene treats [] / hidden via faceUp,
    // but it expects string[]. We pass known cards; hidden become '' placeholders
    // that render as backs (CryptoCard shows a back when faceUp is false).
    cards: s.cards.map((c) => c ?? '??'),
  };
}

export function adaptTable(t: PublicTable): AdaptedView {
  // find viewer, rotate so they're index 0
  const youIdx = t.seats.findIndex((s) => s.isYou);
  const ordered = youIdx >= 0
    ? [...t.seats.slice(youIdx), ...t.seats.slice(0, youIdx)]
    : t.seats.slice();

  const players = ordered.map(seatToPlayer);
  const serverIndexOfId = new Map<number, number>();
  t.seats.forEach((s, i) => serverIndexOfId.set(s.id, i));

  // button/turn as indices into the REORDERED array (what the scene uses)
  const idToOrderedIdx = new Map<number, number>();
  ordered.forEach((s, i) => idToOrderedIdx.set(s.id, i));
  const buttonSeat = ordered.findIndex((s) => s.isButton);
  const turnSeat = t.turnSeatId != null ? idToOrderedIdx.get(t.turnSeatId) ?? -1 : -1;

  const state: TableState = {
    players,
    deck: [],                 // client never has the deck — authoritative on server
    board: t.board.slice(),
    handNo: t.handNo,
    pot: t.pot,
    toCall: t.toCall,
    minRaise: t.minRaise,
    button: buttonSeat < 0 ? 0 : buttonSeat,
    turn: turnSeat,
    stage: t.stage,
    lastRaiser: -1,
  };

  return { state, yourSeatId: t.seats.find((s) => s.isYou)?.id ?? null, serverIndexOfId };
}

/** map a server seat id to its index in the reordered (viewer-first) array */
export function orderedIndexOf(view: AdaptedView, seatId: number): number {
  return view.state.players.findIndex((p) => p.id === seatId);
}
