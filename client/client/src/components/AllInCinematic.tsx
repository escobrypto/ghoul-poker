import { useEffect, useRef } from 'react';
import { seatLayout } from '../data/ghouls';

interface Props {
  cinematic: { seat: number; name: string; key: number } | null;
  playerCount: number;
}

const POT = { x: 50, y: 52 };

// Brief (~1s) all-in theater: screen darkens, big pixel text, lightning arcs seat→pot.
export default function AllInCinematic({ cinematic, playerCount }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!cinematic) return;
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d')!;
    const resize = () => { c.width = c.offsetWidth; c.height = c.offsetHeight; };
    resize();
    const seat = seatLayout(playerCount)[cinematic.seat] ?? seatLayout(playerCount)[0];
    let raf = 0; const t0 = performance.now();

    const bolt = (x0: number, y0: number, x1: number, y1: number, color: string) => {
      x.beginPath(); x.moveTo(x0, y0);
      const seg = 7;
      for (let i = 1; i < seg; i++) {
        const t = i / seg;
        const mx = x0 + (x1 - x0) * t + (Math.random() - 0.5) * 46;
        const my = y0 + (y1 - y0) * t + (Math.random() - 0.5) * 46;
        x.lineTo(mx, my);
      }
      x.lineTo(x1, y1);
      x.strokeStyle = color; x.lineWidth = 1.6 + Math.random() * 1.6;
      x.shadowBlur = 14; x.shadowColor = color; x.stroke();
    };

    const loop = () => {
      const el = performance.now() - t0;
      x.clearRect(0, 0, c.width, c.height);
      const sx = (seat.x / 100) * c.width, sy = (seat.y / 100) * c.height;
      const px = (POT.x / 100) * c.width, py = (POT.y / 100) * c.height;
      // fire a few arcs each frame for a crackling discharge
      const n = 2 + ((Math.random() * 2) | 0);
      for (let i = 0; i < n; i++) {
        bolt(sx, sy, px, py, Math.random() < 0.5 ? 'rgba(57,255,139,.9)' : 'rgba(157,78,221,.9)');
      }
      if (el < 1100) raf = requestAnimationFrame(loop);
      else x.clearRect(0, 0, c.width, c.height);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [cinematic, playerCount]);

  if (!cinematic) return null;

  return (
    <div className="allin-cine">
      <div className="allin-darken" key={`d${cinematic.key}`} />
      <canvas ref={ref} className="allin-arcs" />
      <div className="allin-text" key={`t${cinematic.key}`}>ALL IN</div>
      <div className="allin-sub" key={`s${cinematic.key}`}>{cinematic.name}</div>
    </div>
  );
}
