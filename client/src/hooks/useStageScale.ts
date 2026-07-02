// ============================================================================
// useStageScale — the resolution-invariance layer for the table scene.
//
// The play area (felt, seats, board, pot, deck, effects) is authored ONCE at a
// fixed design size (the "stage"). This hook measures the real container and
// returns the uniform scale factor that letterboxes the stage into it. Every
// resolution — phone, laptop, ultrawide — renders the exact same proportions,
// so alignment can never drift per-breakpoint. Room dressing (walls, window,
// neon) stays full-bleed outside the stage and simply fills whatever remains.
// ============================================================================
import { useEffect, useState, type RefObject } from 'react';

export function useStageScale(
  ref: RefObject<HTMLElement | null>,
  designW: number,
  designH: number,
  maxScale = 1.3,
): number {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const s = Math.min(r.width / designW, r.height / designH, maxScale);
      setScale(Math.max(0.3, s));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, designW, designH, maxScale]);

  return scale;
}
