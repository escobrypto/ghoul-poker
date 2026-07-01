// Networked App — the production multiplayer client. Switches between the Lobby
// and the live table based on whether a started room exists. The table scene and
// all its components are UNCHANGED; only the data source moved to the server.
import { useGhoulNet } from './net/useGhoulNet';
import { useSoundEffects } from './hooks/useSoundEffects';
import GhoulPokerTableScene from './components/GhoulPokerTableScene';
import ActionBar from './components/ActionBar';
import { ParticleField, Confetti } from './components/FX';
import ShaderBackground from './components/ShaderBackground';
import { ChatPanel, HistoryPanel, Toast } from './components/Panels';
import Lobby from './components/Lobby';
import { ReconnectScreen, LatencyBadge } from './components/NetOverlay';
import './styles/app.css';

export default function AppNet() {
  const sound = useSoundEffects();
  const g = useGhoulNet(sound.play);

  const inGame = !!g.room?.started && g.state.players.length > 0;

  return (
    <>
      <ShaderBackground />
      <ParticleField />
      <ReconnectScreen conn={g.conn} />
      <div className="topright-net"><LatencyBadge conn={g.conn} latency={g.latency} /></div>

      {!inGame ? (
        <Lobby
          profile={g.profile}
          room={g.room}
          conn={g.conn}
          latency={g.latency}
          onQuickplay={() => g.quickplay()}
          onCreate={(pub) => g.createRoom(pub)}
          onJoin={(code) => g.joinRoom(code)}
          onReady={(v) => g.ready(v)}
          onStart={() => g.startGame()}
          onLeave={() => g.leaveRoom()}
          onSetName={(n) => g.setName(n)}
          fetchLeaderboard={g.fetchLeaderboard}
        />
      ) : (
        <div className="app">
          <header className="topbar net-topbar">
            <div className="brand">
              <div className="sigil">GG</div>
              <div><h1>GHOUL <b>POKER</b></h1><small>ROOM {g.room?.code}</small></div>
            </div>
            <div className="tablemeta">
              NL HOLD'EM ◆ <b>10 / 20</b> ◆ HAND #{g.state.stage !== 'idle' ? '•' : '—'}
            </div>
            <button className="gbtn fold leave-btn" onClick={() => g.leaveRoom()}>LEAVE TABLE</button>
          </header>

          <aside className="left">
            <ChatPanel chat={g.chat} onSend={g.sendChat} onEmote={(e) => g.sendChat(e)} />
          </aside>

          <main className="center">
            <div className="table-area">
              <GhoulPokerTableScene
                state={g.state}
                winners={g.winners}
                winningCards={g.winningCards}
                bubble={g.bubble}
                chipFlights={g.chipFlights}
                potPulse={g.potPulse}
                winBurst={g.winBurst}
                allInCinematic={g.allInCinematic}
                onCardFlip={() => sound.play('card_flip')}
              />
            </div>
            <ActionBar
              isIdle={!g.prompt}
              prompt={g.prompt}
              status={g.status}
              youStack={g.state.players[0]?.stack ?? 0}
              pot={g.state.pot}
              onDeal={() => { /* server auto-deals next hand; no client deal */ }}
              onAct={g.act}
              allInActive={!!g.allInCinematic}
              hideDeal
            />
          </main>

          <aside className="right">
            <HistoryPanel history={g.history} />
          </aside>
        </div>
      )}

      <Toast toast={g.toast} />
      <Confetti trigger={g.confettiKey} />
    </>
  );
}
