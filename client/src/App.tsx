import { useGhoulPoker } from './hooks/useGhoulPoker';
import { useSoundEffects } from './hooks/useSoundEffects';
import GhoulPokerTableScene from './components/GhoulPokerTableScene';
import ActionBar from './components/ActionBar';
import { ParticleField, Confetti } from './components/FX';
import {
  TopBar, ChatPanel, MissionsPanel, HistoryPanel, XpPanel, AchievementPanel, Toast,
} from './components/Panels';
import './styles/app.css';

export default function App() {
  const sound = useSoundEffects();
  const g = useGhoulPoker(sound.play);

  return (
    <>
      <ParticleField />
      <div className="app">
        <TopBar profile={g.profile} soundOn={sound.enabled} onToggleSound={sound.toggle} />

        <aside className="left">
          <ChatPanel chat={g.chat} onSend={g.sendChat} onEmote={g.emote} />
          <MissionsPanel missions={g.missions} />
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
            isIdle={g.isIdle}
            prompt={g.prompt}
            status={g.status}
            youStack={g.state.players[0].stack}
            pot={g.state.pot}
            onDeal={g.startHand}
            onAct={g.act}
            allInActive={!!g.allInCinematic}
          />
          <div className="foot">
            Free to play · No real money in or out · <b>XP &amp; cosmetics only</b> · A game first, crypto second.
          </div>
        </main>

        <aside className="right">
          <HistoryPanel history={g.history} />
          <XpPanel xpGain={g.xpGain} />
          <AchievementPanel unlocked={g.achievementUnlocked} />
        </aside>
      </div>
      <Toast toast={g.toast} />
      <Confetti trigger={g.confettiKey} />
    </>
  );
}
