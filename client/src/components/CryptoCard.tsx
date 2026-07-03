import { useEffect, useRef, useState } from 'react';
import { Suit } from '../engine/poker';

interface Props {
  card?: string;
  big?: boolean;
  mine?: boolean;        // local player's hole cards — the hero of the table
  faceUp?: boolean;      // should this card reveal its face?
  win?: boolean;
  dimmed?: boolean;      // folded player's cards tilt + dim
  dealIndex?: number;    // stagger order for the slide-in
  onFlip?: () => void;   // fired exactly when the card flips to reveal
}

// ---------------------------------------------------------------------------
// CARD v2 — neon traditional suits (Card Designs sheet). Cards are built in
// layers: programmatic frame/indices/pips (crisp at any stage scale) + cropped
// sheet art for suit glyphs and the skull card back. Face art (A/K/Q/J
// renders) drops in later without touching this component's logic.
// ---------------------------------------------------------------------------
// clean bold silhouettes for pips/indices — ornate art only where it's BIG (ace centers)
const SUIT_PATH: Record<string, string> = {
  h: 'M50 90 C22 64 6 45 6 29 C6 15 17 6 30 6 C39 6 47 11 50 19 C53 11 61 6 70 6 C83 6 94 15 94 29 C94 45 78 64 50 90 Z',
  d: 'M50 4 L90 50 L50 96 L10 50 Z',
  s: 'M50 4 C66 26 90 40 90 60 C90 74 80 83 68 83 C62 83 56 80 53 75 C54 83 58 90 64 96 L36 96 C42 90 46 83 47 75 C44 80 38 83 32 83 C20 83 10 74 10 60 C10 40 34 26 50 4 Z',
  c: 'M50 8 a15 15 0 1 0 0.1 0 Z M29 42 a15 15 0 1 0 0.1 0 Z M71 42 a15 15 0 1 0 0.1 0 Z M45 56 C45 72 41 84 34 93 L66 93 C59 84 55 72 55 56 Z',
};

const SUITS: Record<string, { img: string; color: string; glow: string }> = {
  s: { img: '/assets/cards/suit-spade.png',   color: '#b06dff', glow: 'rgba(157,78,221,.55)' },
  h: { img: '/assets/cards/suit-heart.png',   color: '#ff4d6d', glow: 'rgba(255,77,109,.5)' },
  c: { img: '/assets/cards/suit-club.png',    color: '#2ee6a8', glow: 'rgba(46,230,168,.5)' },
  d: { img: '/assets/cards/suit-diamond.png', color: '#ff5bd1', glow: 'rgba(255,91,209,.5)' },
};

// classic pip coordinates (percent of pip field; true = rendered upside-down)
type Pip = [number, number, boolean?];
const PIPS: Record<string, Pip[]> = {
  '2': [[50, 22], [50, 78, true]],
  '3': [[50, 20], [50, 50], [50, 80, true]],
  '4': [[31, 22], [69, 22], [31, 78, true], [69, 78, true]],
  '5': [[31, 22], [69, 22], [50, 50], [31, 78, true], [69, 78, true]],
  '6': [[31, 22], [69, 22], [31, 50], [69, 50], [31, 78, true], [69, 78, true]],
  '7': [[31, 22], [69, 22], [50, 36], [31, 50], [69, 50], [31, 78, true], [69, 78, true]],
  '8': [[31, 22], [69, 22], [50, 36], [31, 50], [69, 50], [50, 64, true], [31, 78, true], [69, 78, true]],
  '9': [[31, 20], [69, 20], [31, 41], [69, 41], [50, 50], [31, 59, true], [69, 59, true], [31, 80, true], [69, 80, true]],
  'T': [[31, 20], [69, 20], [50, 30], [31, 41], [69, 41], [31, 59, true], [69, 59, true], [50, 70, true], [31, 80, true], [69, 80, true]],
};

export default function CryptoCard({
  card, big, mine, faceUp = true, win, dimmed, dealIndex = 0, onFlip,
}: Props) {
  const [flipped, setFlipped] = useState(false);
  const flipFired = useRef(false);

  useEffect(() => {
    if (!card || !faceUp) { setFlipped(false); flipFired.current = false; return; }
    if (dealIndex < 0) { setFlipped(true); flipFired.current = true; return; }
    const slide = 90 * dealIndex;
    const t = setTimeout(() => {
      setFlipped(true);
      if (!flipFired.current) { flipFired.current = true; onFlip?.(); }
    }, slide + 240);
    return () => clearTimeout(t);
  }, [card, faceUp, dealIndex, onFlip]);

  if (!card) return <div className={`cardwrap${big ? ' big' : ''}${mine ? ' mine' : ''}`} />;

  const r = card[0];
  const s = card[1] as Suit;
  const rank = r === 'T' ? '10' : r;
  const suit = SUITS[s as string];
  const known = !!suit && card.length >= 2;
  const showFront = faceUp && flipped && known;
  const pips = PIPS[r];
  const isFace = r === 'J' || r === 'Q' || r === 'K';

  return (
    <div
      className={`cardwrap${big ? ' big' : ''}${mine ? ' mine' : ''}${dimmed ? ' dimmed' : ''}`}
      style={{ ['--di' as string]: dealIndex }}
    >
      <div className={`card3d${showFront ? ' flipped' : ''}`}>
        {/* back face — skull art from the card sheet */}
        <div className="cardface back" />
        {known && (
          <div
            className={`cardface front${win ? ' win' : ''}`}
            style={{ ['--suit' as string]: suit.color, ['--suitglow' as string]: suit.glow }}
          >
            <span className="idx"><b>{rank}</b><svg viewBox="0 0 100 100"><path d={SUIT_PATH[s as string]} fill={suit.color} /></svg></span>
            <span className="idx br"><b>{rank}</b><svg viewBox="0 0 100 100"><path d={SUIT_PATH[s as string]} fill={suit.color} /></svg></span>

            {pips && (
              <svg className="pipsvg" viewBox="0 0 100 140" preserveAspectRatio="none">
                {pips.map(([x, y, rot], i) => {
                  const cx = 15 + 70 * (x / 100);
                  const cy = 18 + 104 * (y / 100);
                  const t = `translate(${(cx - 9).toFixed(1)} ${(cy - 10).toFixed(1)}) scale(0.18 0.20)`;
                  return (
                    <path key={i} d={SUIT_PATH[s as string]} fill={suit.color}
                      transform={rot ? `rotate(180 ${cx} ${cy}) ${t}` : t} />
                  );
                })}
              </svg>
            )}
            {r === 'A' && (
              <svg className="pipsvg" viewBox="0 0 100 140" preserveAspectRatio="none">
                <image href={suit.img} x="27" y="43" width="46" height="54" preserveAspectRatio="xMidYMid meet" />
              </svg>
            )}
            {isFace && (
              <div className="facecenter">
                <span className="faceletter">{r}</span>
                <svg viewBox="0 0 100 100" className="facesuit"><path d={SUIT_PATH[s as string]} fill={suit.color} /></svg>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
