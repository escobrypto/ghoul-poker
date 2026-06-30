import { useEffect, useRef, useState } from 'react';
import { CRYPTO, Suit } from '../engine/poker';

interface Props {
  card?: string;
  big?: boolean;
  faceUp?: boolean;      // should this card reveal its face?
  win?: boolean;
  dimmed?: boolean;      // folded player's cards tilt + dim
  dealIndex?: number;    // stagger order for the slide-in
  onFlip?: () => void;   // fired exactly when the card flips to reveal
}

// A flip card: back face + front face on a 3D-rotated inner element.
// Lifecycle: slide in from deck (back showing) → bounce → flip to front → glow if win.
export default function CryptoCard({
  card, big, faceUp = true, win, dimmed, dealIndex = 0, onFlip,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const flipFired = useRef(false);

  // Time the flip after the slide+bounce lands. Fast + snappy.
  // dealIndex < 0 means "already on the board" — show face immediately, no re-deal/sound.
  useEffect(() => {
    if (!card || !faceUp) { setFlipped(false); flipFired.current = false; return; }
    if (dealIndex < 0) { setFlipped(true); flipFired.current = true; return; }
    const slide = 90 * dealIndex; // stagger
    const t = setTimeout(() => {
      setFlipped(true);
      if (!flipFired.current) { flipFired.current = true; onFlip?.(); }
    }, slide + 240); // slide ~240ms then flip
    return () => clearTimeout(t);
  }, [card, faceUp, dealIndex, onFlip]);

  if (!card) return <div className={`cardwrap${big ? ' big' : ''}`} />;

  const r = card[0];
  const s = card[1] as Suit;
  const rank = r === 'T' ? '10' : r;
  // A card is only "known" if it's a valid 2-char code with a real suit. Hidden
  // opponent cards (server sends null -> adapter passes a placeholder) have no
  // valid suit, so they always render as a back — never crash on CRYPTO[s].
  const suitInfo = CRYPTO[s];
  const known = !!suitInfo && card.length >= 2;
  const showFront = faceUp && flipped && known;

  return (
    <div
      className={`cardwrap${big ? ' big' : ''}${dimmed ? ' dimmed' : ''}`}
      style={{ ['--di' as string]: dealIndex }}
    >
      <div className={`card3d${showFront ? ' flipped' : ''}`}>
        {/* back face */}
        <div className="cardface back" />
        {/* front face — only rendered for known cards (hidden cards stay backs) */}
        {known && (
          <div className={`cardface front s-${s}${win ? ' win' : ''}`}>
            <span className="rank">{rank}</span>
            <span className="sym">{suitInfo.sym}</span>
            <span className="rank br">{rank}</span>
          </div>
        )}
      </div>
    </div>
  );
}
