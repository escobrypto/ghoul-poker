import { Player } from '../engine/table';
import { avatarSrc, flameFor, seatLayout } from '../data/ghouls';
import CryptoCard from './CryptoCard';

interface Props {
  player: Player;
  index: number;
  total: number;
  isButton: boolean;
  isActive: boolean;
  isWinner: boolean;
  showdown: boolean;
  winningCards: string[];
  bubble?: string;
  action?: { label: string; kind: string };
  maxStack: number;
}

interface Props {
  player: Player;
  index: number;
  total: number;
  isButton: boolean;
  isActive: boolean;
  isWinner: boolean;
  showdown: boolean;
  winningCards: string[];
  bubble?: string;
  action?: { label: string; kind: string };
  maxStack: number;
  winBurstXp?: number;
  seatDealOffset: number;   // stagger so cards deal one-at-a-time around the table
  onCardFlip?: () => void;
  allIn?: boolean;          // this player is the all-in cinematic subject
}

export default function PlayerSeat({
  player, index, total, isButton, isActive, isWinner, showdown, winningCards, bubble, action, maxStack, winBurstXp,
  seatDealOffset, onCardFlip, allIn,
}: Props) {
  const pos = seatLayout(total)[index];
  const flame = flameFor(player.name);
  const reveal = player.you || showdown;
  const stackPct = Math.min(100, (player.stack / maxStack) * 100);
  // resting chip stack height scales with stack size (cosmetic)
  const restChips = Math.max(2, Math.min(7, Math.round((player.stack / maxStack) * 7)));

  return (
    <div
      className={`seat${player.you ? ' you' : ''}${player.folded ? ' folded' : ''}${isActive ? ' active' : ''}${isWinner ? ' winner' : ''}${isButton ? ' has-button' : ''}${allIn ? ' allin' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, ['--flame' as string]: flame }}
    >
      {winBurstXp != null && <div className="winburst">+{winBurstXp} XP</div>}
      <div className="pod">
        {bubble && <div className="bubble show">{bubble}</div>}
        {action && <div className={`paction show ${action.kind}`}>{action.label}</div>}
        <div className="seat-aura" />
        <div className="spritebox">
          <img src={avatarSrc(player.name)} alt={player.name} className="ghoul-img" />
        </div>
        <div className="pname">{player.name}</div>
        <div className="pchips">{player.stack.toLocaleString()}</div>
        <div className="pbar"><i style={{ width: `${stackPct}%` }} /></div>
        <div className="holecards">
          {player.cards.map((c, i) => (
            <CryptoCard
              key={i}
              card={c}
              mine={player.you}
              faceUp={reveal}
              win={winningCards.includes(c)}
              dimmed={player.folded}
              dealIndex={seatDealOffset + i}
              onFlip={onCardFlip}
            />
          ))}
        </div>
        <div className="dealerbtn">D</div>
      </div>
      {/* resting chip stack beside the seat */}
      <div className="rest-stack">
        {Array.from({ length: restChips }, (_, i) => (
          <i key={i} className={`rchip chip-${i % 3}`} style={{ bottom: `${i * 4}px` }} />
        ))}
      </div>
    </div>
  );
}
