import { useEffect, useRef, useState } from 'react';
import { PromptInfo } from '../hooks/useGhoulPoker';
import { ActionType } from '../engine/table';
import { avatarSrc } from '../data/ghouls';

interface Props {
  isIdle: boolean;
  prompt: PromptInfo | null;
  status: string;
  youStack: number;
  pot: number;
  onDeal: () => void;
  onAct: (a: ActionType, amt?: number) => void;
  allInActive?: boolean;
  hideDeal?: boolean;
}

export default function ActionBar({ isIdle, prompt, status, youStack, pot, onDeal, onAct, allInActive, hideDeal }: Props) {
  const [raise, setRaise] = useState(0);
  const [timer, setTimer] = useState(15);
  const intRef = useRef<number | null>(null);

  const active = !!prompt;
  const need = prompt?.need ?? 0;

  useEffect(() => {
    if (prompt) setRaise(prompt.minRaise);
  }, [prompt]);

  useEffect(() => {
    if (!prompt) { if (intRef.current) clearInterval(intRef.current); setTimer(15); return; }
    setTimer(15);
    intRef.current = window.setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          clearInterval(intRef.current!);
          onAct(need > 0 ? 'fold' : 'call');
          return 15;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (intRef.current) clearInterval(intRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  // hotkeys
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (isIdle && (e.key === 'd' || e.key === ' ')) onDeal();
      if (!active) return;
      if (e.key === 'f') onAct('fold');
      if (e.key === 'c') onAct('call');
      if (e.key === 'r') onAct('raise', raise);
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [active, isIdle, raise, onAct, onDeal]);

  const quick = (q: number) => {
    if (!prompt) return;
    const target = Math.min(prompt.maxRaise, need + Math.round(pot * q) + (youStack - youStack));
    setRaise(Math.max(prompt.minRaise, Math.min(prompt.maxRaise, target + need)));
  };

  const timerPct = (timer / 15) * 100;

  return (
    <div className="actionbar">
      <div className="statusline">{status}{prompt && <span className="read"> · Read: {(prompt.strength * 100) | 0}% to win</span>}</div>
      <div className="youtag">
        <span className="av"><img src={avatarSrc('YOU')} className="ghoul-img" alt="you" /></span>
        <span className="nm">YOU</span>
        <span className="st">◈ {youStack.toLocaleString()}</span>
      </div>
      <div className="btnrow">
        {!hideDeal && <button className="gbtn deal" disabled={!isIdle} onClick={onDeal}>DEAL</button>}
        <button className="gbtn fold" disabled={!active} onClick={() => onAct('fold')}>FOLD <small>F</small></button>
        <button className="gbtn call" disabled={!active} onClick={() => onAct('call')}>
          {need > 0 ? `CALL ◈${Math.min(need, youStack)}` : 'CHECK'} <small>C</small>
        </button>
        <button className="gbtn raise" disabled={!active || youStack <= need} onClick={() => onAct('raise', raise)}>
          RAISE TO <small>◈{raise.toLocaleString()}</small>
        </button>
        <button className={`gbtn allin${allInActive ? ' danger' : ''}`} disabled={!active} onClick={() => onAct('raise', youStack + (need > 0 ? need : 0))}>
          ALL IN <small>◈{youStack.toLocaleString()}</small>
        </button>
        <div className="quickbets">
          <button onClick={() => quick(0.5)} disabled={!active}>½</button>
          <button onClick={() => quick(0.75)} disabled={!active}>¾</button>
          <button onClick={() => quick(1)} disabled={!active}>POT</button>
        </div>
        <div className="sliderwrap">
          <button className="step" disabled={!active} onClick={() => setRaise((r) => Math.max(prompt?.minRaise ?? 0, r - 20))}>−</button>
          <input
            type="range" min={prompt?.minRaise ?? 0} max={prompt?.maxRaise ?? 100}
            value={raise} disabled={!active || youStack <= need}
            onChange={(e) => setRaise(+e.target.value)}
          />
          <button className="step" disabled={!active} onClick={() => setRaise((r) => Math.min(prompt?.maxRaise ?? r, r + 20))}>+</button>
          <span className="raiseval">◈ {raise.toLocaleString()}</span>
        </div>
        <div className="timerwrap">
          <div className={`timer${timer <= 5 ? ' warn' : ''}`} style={{ ['--p' as string]: `${timerPct}%` }}>
            <span>{timer}</span>
          </div>
          <span className="tb-label">TIME BANK</span>
        </div>
      </div>
    </div>
  );
}
