import { ChipFlight } from '../hooks/useGhoulPoker';
import { seatLayout } from '../data/ghouls';

interface Props {
  flights: ChipFlight[];
  playerCount: number;
}

// Pot sits at the table center within the scene. Seat coords are % of the scene.
// These approximate the rendered seat-pod centers so chips launch/land believably.
const POT = { x: 50, y: 52 };

export default function ChipFlights({ flights, playerCount }: Props) {
  const layout = seatLayout(playerCount);

  return (
    <div className="chip-flights">
      {flights.map((f, idx) => {
        const seat = f.from === -1 ? layout[f.to] : layout[f.from];
        const isToPot = f.to === -1;
        const start = f.from === -1 ? POT : layout[f.from];
        const end = f.to === -1 ? POT : layout[f.to];
        // small spread so chips don't perfectly overlap
        const jx = (idx % 5 - 2) * 2.2;
        const jy = (Math.floor(idx / 5) % 3 - 1) * 1.6;
        const style = {
          ['--sx' as string]: `${start.x + jx}%`,
          ['--sy' as string]: `${start.y + jy}%`,
          ['--ex' as string]: `${end.x + jx * 0.4}%`,
          ['--ey' as string]: `${end.y + jy * 0.4}%`,
          animationDelay: `${(idx % 6) * 45}ms`,
        } as React.CSSProperties;
        return <i key={f.key} className={`flychip chip-${f.color}${isToPot ? '' : ' towin'}`} style={style} />;
      })}
    </div>
  );
}
