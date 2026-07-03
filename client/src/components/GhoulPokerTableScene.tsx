import { useRef } from 'react';
import { TableState } from '../engine/table';
import { Bubble, ChipFlight } from '../hooks/useGhoulPoker';
import PlayerSeat from './PlayerSeat';
import CryptoCard from './CryptoCard';
import ChipFlights from './ChipFlights';
import AllInCinematic from './AllInCinematic';
import { TableLightning, SmokeLayer } from './FX';
import { seatLayout } from '../data/ghouls';
import { useStageScale } from '../hooks/useStageScale';

// The play stage is authored at this fixed size and scaled as ONE unit to fit
// any viewport (see useStageScale). Room dressing stays full-bleed behind it.
const STAGE_W = 1280;
const STAGE_H = 720;

interface Props {
  state: TableState;
  winners: number[];
  winningCards: string[];
  bubble: Bubble | null;
  chipFlights: ChipFlight[];
  potPulse: number;
  winBurst: { seat: number; xp: number; key: number } | null;
  allInCinematic: { seat: number; name: string; key: number } | null;
  onCardFlip?: () => void;
}

export default function GhoulPokerTableScene({ state, winners, winningCards, bubble, chipFlights, potPulse, winBurst, allInCinematic, onCardFlip }: Props) {
  const sceneRef = useRef<HTMLDivElement>(null);
  const stageScale = useStageScale(sceneRef, STAGE_W, STAGE_H);
  const maxStack = Math.max(...state.players.map((p) => p.stack), 1);
  // real money on the table: show the denomination chips the pot contains
  const DENOMS: [number, string][] = [[1000, 'chip-1k'], [500, 'chip-500'], [100, 'chip-100'], [25, 'chip-25'], [5, 'chip-5']];
  const potDenoms = DENOMS.filter(([v]) => state.pot >= v).map(([, img]) => img);

  // Only the most recently dealt street should stagger-animate. flop=3 cards (idx0-2),
  // turn=4th, river=5th. Cards already on the board before this street don't re-deal.
  const communityDealIndex = (total: number, i: number) => {
    if (total <= 3) return i;             // flop: stagger all three
    if (total === 4) return i === 3 ? 0 : -1; // turn: only the new card
    return i === 4 ? 0 : -1;              // river: only the new card
  };

  // deck sits just inside the table edge near the dealer-button seat
  const layout = seatLayout(state.players.length);
  const btnPos = layout[state.button] ?? layout[0];
  const deckX = btnPos.x < 50 ? btnPos.x + 9 : btnPos.x - 9;
  const deckY = btnPos.y < 50 ? btnPos.y + 8 : btnPos.y - 8;

  return (
    <div className="scene" ref={sceneRef}>
      {/* ===== ROOM + TABLE: one painted perspective render (theme asset) ===== */}
      {/* drifting smoke */}
      <SmokeLayer />

      {/* ===== PLAY STAGE — fixed design size, scaled as one unit ===== */}
      <div
        className="stage"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%,-50%) scale(${stageScale})` }}
      >
      {/* invisible anchor matched to the PAINTED felt ellipse — children position on the art */}
      <div className="felt">
        <TableLightning />

        <div className="pot">
          <div className="pot-lbl">💀 POT 💀</div>
          <div className={`pot-amt${allInCinematic ? ' allin-pulse' : ''}`} key={potPulse} data-pulse={potPulse > 0}>{state.pot.toLocaleString()}</div>
        </div>
        <div className="potchips">
          {potDenoms.map((img) => (
            <img key={img} src={`/assets/chips/${img}.png`} alt="" className="denom" />
          ))}
        </div>
      </div>

        {/* the board is SACRED — its own stage layer, above every seat/avatar */}
        <div className="community">
          {state.board.map((c, i) => (
            <CryptoCard
              key={c}
              card={c}
              big
              faceUp
              win={winningCards.includes(c)}
              dealIndex={communityDealIndex(state.board.length, i)}
              onFlip={onCardFlip}
            />
          ))}
        </div>


      {/* deck stack near the dealer button */}
      {state.stage !== 'idle' && (
        <div className="deck-stack" style={{ left: `${deckX}%`, top: `${deckY}%` }}>
          <i /><i /><i /><i /><i />
        </div>
      )}

      {/* ===== SEATS ===== */}
      {state.players.map((p, i) => (
        <PlayerSeat
          key={p.id}
          player={p}
          index={i}
          total={state.players.length}
          isButton={i === state.button}
          isActive={i === state.turn && state.stage !== 'idle' && state.stage !== 'showdown'}
          isWinner={winners.includes(p.id)}
          showdown={state.stage === 'showdown'}
          winningCards={winningCards}
          bubble={bubble?.seat === p.id ? bubble.text : undefined}
          maxStack={maxStack}
          winBurstXp={winBurst && winBurst.seat === i ? winBurst.xp : undefined}
          seatDealOffset={i * 2}
          onCardFlip={onCardFlip}
          allIn={allInCinematic?.seat === i}
        />
      ))}

      {/* flying chips (above seats so they read clearly) */}
      <ChipFlights flights={chipFlights} playerCount={state.players.length} />

      {/* ALL IN cinematic overlay */}
      <AllInCinematic cinematic={allInCinematic} playerCount={state.players.length} />
      </div>
      {/* ===== /PLAY STAGE ===== */}

      <div className="scene-vignette" />
    </div>
  );
}
