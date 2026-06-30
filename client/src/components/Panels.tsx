import { useEffect, useRef, useState } from 'react';
import { ChatLine, HistoryLine, Profile } from '../hooks/useGhoulPoker';
import { Mission, xpNeed } from '../data/missions';
import { avatarSrc } from '../data/ghouls';

const slug = (n?: string) => (n || '').toLowerCase().replace(/[^a-z]/g, '');

export function TopBar({ profile, soundOn, onToggleSound }: { profile: Profile; soundOn?: boolean; onToggleSound?: () => void }) {
  const need = xpNeed(profile.level);
  return (
    <header className="topbar">
      <div className="brand">
        <div className="sigil">GG</div>
        <div><h1>GHOUL <b>POKER</b></h1><small>NIGHT OWLS ONLY</small></div>
      </div>
      <div className="tablemeta">
        NL HOLD'EM ◆ <b>10 / 20</b> ◆ ANTE 0<br />
        <span className="row2">TABLE: MIDNIGHT #777 · HAND #{profile.handno.toLocaleString()}</span>
      </div>
      <div className="nav">
        <button
          className={`navbtn${soundOn ? ' on' : ' off'}`}
          onClick={onToggleSound}
          title={soundOn ? 'Sound on' : 'Sound off'}
          aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
        >{soundOn ? '♪' : '♪̶'}</button>
        {['☻', '▤', '▣', '⚙'].map((c, i) => <button key={i}>{c}</button>)}
      </div>
      <div className="currencies">
        <div className="cur"><b>{profile.sghoul.toLocaleString()}</b><small>$GHOUL</small></div>
        <div className="cur souls"><b>{profile.souls.toLocaleString()}</b><small>SOULS</small></div>
      </div>
      <div className="profile">
        <div className="av"><img src={avatarSrc('YOU')} className="ghoul-img" alt="you" /></div>
        <div>
          <div className="pid">GHOUL#1337</div>
          <div className="lv">LVL {profile.level}</div>
          <div className="xpwrap">
            <div className="xpbar"><div className="xpfill" style={{ width: `${Math.min(100, (profile.xp / need) * 100)}%` }} /></div>
            <div className="xptext">{profile.xp.toLocaleString()} / {need.toLocaleString()} XP</div>
          </div>
        </div>
      </div>
    </header>
  );
}

const EMOTES = ['💀', '🔥', '👑', '📈', '📉', '😈', '🦈', '🌙', '💎', '🐀'];

export function ChatPanel({ chat, onSend, onEmote }: { chat: ChatLine[]; onSend: (m: string) => void; onEmote: (e: string) => void }) {
  const [val, setVal] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [chat]);
  const send = () => { if (val.trim()) { onSend(val.trim()); setVal(''); } };
  return (
    <div className="panel chat-panel">
      <h3>CHAT · MIDNIGHT TABLES</h3>
      <div className="body chat-body">
        <div className="chatlog" ref={logRef}>
          {chat.map((c) => (
            <div key={c.id} className={c.sys ? 'sys' : ''}>
              {!c.sys && <span className={`nm ${slug(c.name)}`}>{c.name}: </span>}
              {c.msg}
            </div>
          ))}
        </div>
        <div className="chatinput">
          <input value={val} placeholder="Type a message…" maxLength={80}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }} />
          <button onClick={send}>»</button>
        </div>
        <div className="emotes">
          {EMOTES.map((e) => <button key={e} onClick={() => onEmote(e)}>{e}</button>)}
        </div>
      </div>
    </div>
  );
}

export function MissionsPanel({ missions }: { missions: Mission[] }) {
  return (
    <div className="panel">
      <h3>DAILY OPS</h3>
      <div className="body">
        <ul className="missions">
          {missions.map((m) => (
            <li key={m.id} className={m.done ? 'done' : ''}>
              <span>{m.text} <span className="prog">({Math.min(m.prog, m.goal)}/{m.goal})</span></span>
              <span className="rew">+{m.reward}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function HistoryPanel({ history }: { history: HistoryLine[] }) {
  return (
    <div className="panel grow">
      <h3>💀 HAND HISTORY 💀</h3>
      <div className="body">
        <div className="history">
          {history.map((h) => (
            <div key={h.id}>
              <span className={`a ${h.you ? 'you' : ''}`}>{h.name}</span>
              <span className={h.action.toLowerCase().replace(' ', '')}>{h.action}{h.amt ? ' ' + h.amt.toLocaleString() : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function XpPanel({ xpGain }: { xpGain: number }) {
  return (
    <div className="panel">
      <h3>XP GAINED</h3>
      <div className="xpgain">
        <div className="amt" key={xpGain}>+{xpGain.toLocaleString()} XP</div>
        <div className="skull">💀</div>
      </div>
    </div>
  );
}

export function AchievementPanel({ unlocked }: { unlocked: boolean }) {
  return (
    <div className="panel">
      <h3>ACHIEVEMENTS</h3>
      <div className={`ach${unlocked ? '' : ' locked'}`}>
        <div className="ico">👻</div>
        <div>
          <div className="tt">NIGHT HUNTER</div>
          <div className="ds">Win a big pot after midnight.</div>
        </div>
      </div>
    </div>
  );
}

export function Toast({ toast }: { toast: { text: string; kind: string } | null }) {
  if (!toast) return null;
  return <div className={`toast show ${toast.kind}`}>{toast.text}</div>;
}
