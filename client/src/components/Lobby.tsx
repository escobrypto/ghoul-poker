// Production lobby: Quick Play, Private Room (create/join by code), ready-up,
// player list, and a Friends/Spectate surface. Pure UI over the net hook.
import { useState } from 'react';
import type { RoomInfo, ProfilePayload, LeaderRow } from '../net/protocol';
import { avatarSrc } from '../data/ghouls';
import Leaderboard from './Leaderboard';

interface Props {
  profile: ProfilePayload | null;
  room: RoomInfo | null;
  conn: string;
  latency: number;
  onQuickplay: () => void;
  onCreate: (isPublic: boolean) => void;
  onJoin: (code: string) => void;
  onReady: (v: boolean) => void;
  onStart: () => void;
  onLeave: () => void;
  onSetName: (n: string) => void;
  fetchLeaderboard: (cb: (rows: LeaderRow[]) => void) => void;
}

export default function Lobby({
  profile, room, conn, latency, onQuickplay, onCreate, onJoin, onReady, onStart, onLeave, onSetName, fetchLeaderboard,
}: Props) {
  const [code, setCode] = useState('');
  const [tab, setTab] = useState<'play' | 'ranks' | 'friends'>('play');
  const youId = profile?.id;
  const me = room?.players.find((p) => p.id === youId);
  const isHost = room?.hostId === youId;
  const canStart = isHost && (room?.players.filter((p) => p.connected).length ?? 0) >= 2;

  // ---- IN A ROOM: show the room lobby (ready-up) ----
  if (room && !room.started) {
    return (
      <div className="lobby">
        <div className="lobby-card room">
          <div className="lobby-head">
            <h2>ROOM <span className="rcode">{room.code}</span></h2>
            <div className="rmeta">{room.isPublic ? 'PUBLIC' : 'PRIVATE'} · {room.players.length}/{room.maxSeats} ghouls</div>
          </div>
          <div className="seatlist">
            {room.players.map((p) => (
              <div key={p.id} className={`seatrow${p.ready ? ' ready' : ''}${!p.connected ? ' dim' : ''}`}>
                <img src={avatarSrc(p.id === youId ? 'YOU' : p.name)} className="ghoul-img" alt="" />
                <span className="nm">{p.name}{p.id === room.hostId ? ' 👑' : ''}{p.id === youId ? ' (you)' : ''}</span>
                <span className="rdy">{p.ready ? 'READY' : '…'}</span>
              </div>
            ))}
            {Array.from({ length: Math.max(0, room.maxSeats - room.players.length) }, (_, i) => (
              <div key={`e${i}`} className="seatrow empty"><span className="nm">empty seat</span></div>
            ))}
          </div>
          <div className="lobby-actions">
            <button className="gbtn call" onClick={() => onReady(!me?.ready)}>{me?.ready ? 'UNREADY' : 'READY UP'}</button>
            {isHost && <button className="gbtn deal" disabled={!canStart} onClick={onStart}>START TABLE</button>}
            <button className="gbtn fold" onClick={onLeave}>LEAVE</button>
          </div>
          {isHost && !canStart && <div className="hint">Need at least 2 ghouls to start. Share code <b>{room.code}</b>.</div>}
        </div>
      </div>
    );
  }

  // ---- NOT IN A ROOM: main menu ----
  return (
    <div className="lobby">
      <div className="lobby-card">
        <div className="lobby-brand">
          <img src="/assets/ui/logo.png" className="lobby-logo" alt="GHOUL POKER" />
          <div className="tagline">NIGHT OWLS ONLY · {conn === 'online' ? <span className="on">ONLINE</span> : <span className="off">{conn.toUpperCase()}</span>} {conn === 'online' && <span className="ping">{latency}ms</span>}</div>
          <div className="verstamp">v1.0</div>
        </div>

        {profile && (
          <div className="lobby-profile">
            <img src={avatarSrc('YOU')} className="ghoul-img" alt="" />
            <div className="prof-info">
              <div className="name-row">
                <input className="namein" defaultValue={profile.name} maxLength={16}
                  onBlur={(e) => onSetName(e.target.value.trim() || profile.name)} />
                {profile.founder && <span className="founder-badge" title={`Founder #${profile.founderNumber}`}>👑 FOUNDER #{profile.founderNumber}</span>}
              </div>
              <div className="lvl">LVL {profile.level} · {profile.xp}/{profile.xpNeeded} XP · ◈{profile.chips.toLocaleString()}</div>
            </div>
          </div>
        )}

        <div className="lobby-tabs">
          <button className={tab === 'play' ? 'on' : ''} onClick={() => setTab('play')}>PLAY</button>
          <button className={tab === 'ranks' ? 'on' : ''} onClick={() => setTab('ranks')}>RANKS</button>
          <button className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>FRIENDS</button>
        </div>

        {tab === 'play' ? (
          <div className="lobby-menu">
            <button className="menu-btn quick" onClick={onQuickplay}>
              <span className="mt">QUICK PLAY</span><span className="ms">Drop into the next open table</span>
            </button>
            <button className="menu-btn" onClick={() => onCreate(false)}>
              <span className="mt">PRIVATE ROOM</span><span className="ms">Create a table, share the code</span>
            </button>
            <div className="join-row">
              <input placeholder="ENTER CODE" value={code} maxLength={5}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 5) onJoin(code); }} />
              <button className="gbtn call" disabled={code.length !== 5} onClick={() => onJoin(code)}>JOIN</button>
            </div>
            <button className="menu-btn ghost" onClick={() => onCreate(true)}>
              <span className="mt">HOST PUBLIC</span><span className="ms">Open table others can quick-play into</span>
            </button>
          </div>
        ) : tab === 'ranks' ? (
          <Leaderboard profile={profile} fetchLeaderboard={fetchLeaderboard} />
        ) : (
          <div className="lobby-friends">
            <div className="friends-empty">
              <div className="fi">👻</div>
              <p>Friends list is coming. For now, host a Private Room and share the code with your gang.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
