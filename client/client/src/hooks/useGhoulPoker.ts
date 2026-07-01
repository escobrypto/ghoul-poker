import { useCallback, useRef, useState } from 'react';
import {
  TableState, Player, ActionType, newTable, postBlind, applyAction,
  aiDecision, roundComplete, activePlayers, resolveShowdown,
  GHOUL_LINES, SB, BB, START_STACK,
} from '../engine/table';
import { handStrength } from '../engine/poker';
import { INITIAL_MISSIONS, Mission, xpNeed } from '../data/missions';

export interface ChatLine { id: number; name?: string; msg: string; sys?: boolean; }
export interface HistoryLine { id: number; name: string; action: string; amt: number; you: boolean; }
export interface Bubble { seat: number; text: string; }

export interface Profile {
  level: number; xp: number; bank: number; hands: number; wins: number;
  sghoul: number; souls: number; handno: number;
}

export interface PromptInfo { need: number; minRaise: number; maxRaise: number; strength: number; }

export interface ChipFlight { key: number; from: number; to: number; /* -1 = pot */ color: number; }

let uid = 1;
const nextId = () => uid++;

type SoundName = 'chip_slide' | 'chip_land' | 'pot_collect' | 'card_flip' | 'achievement_unlock' | 'all_in_stinger';

export function useGhoulPoker(onSound?: (name: SoundName) => void) {
  const sfx = (n: SoundName) => { try { onSound?.(n); } catch { /* sound is optional */ } };
  const [state, setState] = useState<TableState>(() => newTable(START_STACK, 4));
  const [profile, setProfile] = useState<Profile>({
    level: 1, xp: 0, bank: START_STACK, hands: 0, wins: 0,
    sghoul: 7890, souls: 842, handno: 2389471,
  });
  const [missions, setMissions] = useState<Mission[]>(INITIAL_MISSIONS);
  const [chat, setChat] = useState<ChatLine[]>([
    { id: nextId(), sys: true, msg: 'Welcome to the trenches, ghoul. Chips are fake. Glory is real.' },
    { id: nextId(), name: 'The Ghoul King', msg: 'GHOUL GANG 👑' },
    { id: nextId(), name: 'Degen Oracle', msg: 'LFGGGGG 💀' },
  ]);
  const [history, setHistory] = useState<HistoryLine[]>([]);
  const [status, setStatus] = useState('Press DEAL to enter the trenches.');
  const [prompt, setPrompt] = useState<PromptInfo | null>(null);
  const [xpGain, setXpGain] = useState(0);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [winners, setWinners] = useState<number[]>([]);
  const [winningCards, setWinningCards] = useState<string[]>([]);
  const [toast, setToast] = useState<{ text: string; kind: string } | null>(null);
  const [achievementUnlocked, setAchievementUnlocked] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [chipFlights, setChipFlights] = useState<ChipFlight[]>([]);
  const [potPulse, setPotPulse] = useState(0);
  const [winBurst, setWinBurst] = useState<{ seat: number; xp: number; key: number } | null>(null);
  const [allInCinematic, setAllInCinematic] = useState<{ seat: number; name: string; key: number } | null>(null);

  // mutable working copy the loop mutates, then we publish snapshots
  const sRef = useRef<TableState>(state);
  const resolverRef = useRef<((a: ActionType, amt?: number) => void) | null>(null);

  const publish = useCallback(() => setState({ ...sRef.current, players: sRef.current.players.map((p) => ({ ...p })) }), []);

  const addChat = useCallback((line: Omit<ChatLine, 'id'>) =>
    setChat((c) => [...c.slice(-79), { id: nextId(), ...line }]), []);
  const addHistory = useCallback((h: Omit<HistoryLine, 'id'>) =>
    setHistory((x) => [{ id: nextId(), ...h }, ...x.slice(0, 49)]), []);
  const showToast = useCallback((text: string, kind = '') => {
    setToast({ text, kind });
    setTimeout(() => setToast(null), 1400);
  }, []);
  const showBubble = useCallback((seat: number, text: string) => {
    setBubble({ seat, text });
    setTimeout(() => setBubble(null), 1400);
  }, []);

  // Emit `count` chips flying from a seat index toward the pot (to = -1) or a seat.
  const flyChips = useCallback((from: number, to: number, count = 5) => {
    sfx('chip_slide');
    const flights: ChipFlight[] = Array.from({ length: count }, (_, i) => ({
      key: nextId(), from, to, color: i % 3,
    }));
    setChipFlights((cf) => [...cf, ...flights]);
    // chips land ~520ms after launch; pulse the pot + clean up
    setTimeout(() => {
      sfx('chip_land');
      if (to === -1) setPotPulse((p) => p + 1);
      const keys = new Set(flights.map((f) => f.key));
      setChipFlights((cf) => cf.filter((f) => !keys.has(f.key)));
    }, 560);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addXP = useCallback((n: number) => {
    setXpGain(n);
    setProfile((pr) => {
      let xp = pr.xp + n, level = pr.level, souls = pr.souls, need = xpNeed(level);
      while (xp >= need) { xp -= need; level++; need = xpNeed(level); souls += 10; showToast('LEVEL ' + level + '!', 'lvl'); setConfettiKey((k) => k + 1); }
      return { ...pr, xp, level, souls };
    });
  }, [showToast]);

  const bumpMission = useCallback((id: string, n = 1) => {
    setMissions((ms) => ms.map((m) => {
      if (m.id !== id || m.done) return m;
      const prog = m.prog + n;
      const done = prog >= m.goal;
      if (done) addXP(m.reward);
      return { ...m, prog, done };
    }));
  }, [addXP]);

  // ---- main loop ----
  const drive = useCallback(() => {
    const s = sRef.current;
    if (activePlayers(s).length === 1) return endHand();
    if (roundComplete(s)) return nextStage();
    let p = s.players[s.turn], g = 0;
    while ((p.folded || p.allin) && g++ < 12) { s.turn = (s.turn + 1) % s.players.length; p = s.players[s.turn]; }
    if (roundComplete(s)) return nextStage();
    publish();
    if (p.you) promptHuman(p);
    else {
      setStatus(`${p.name} is thinking…`);
      setTimeout(() => aiAct(p), 700 + Math.random() * 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const promptHuman = useCallback((p: Player) => {
    const s = sRef.current;
    const need = s.toCall - p.bet;
    const strength = handStrength(p.cards, s.board, activePlayers(s).length - 1);
    setStatus(need > 0 ? `Your move. Call needs ◈${need}.` : 'Your move. You can check.');
    setPrompt({
      need,
      minRaise: Math.min(p.stack + p.bet, s.toCall + s.minRaise),
      maxRaise: p.stack + p.bet,
      strength,
    });
    resolverRef.current = (action, amount = 0) => {
      resolverRef.current = null;
      setPrompt(null);
      doAction(p, action, amount);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aiAct = useCallback((p: Player) => {
    const s = sRef.current;
    const { action, amount } = aiDecision(s, p);
    if (Math.random() < 0.14) {
      const lines = GHOUL_LINES[p.name] || ['💀'];
      addChat({ name: p.name, msg: lines[(Math.random() * lines.length) | 0] });
      showBubble(p.id, '💬');
    }
    doAction(p, action, amount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addChat, showBubble]);

  const doAction = useCallback((p: Player, action: ActionType, amount: number) => {
    const s = sRef.current;
    const stackBefore = p.stack;
    const res = applyAction(s, p, action, amount);
    const paid = stackBefore - p.stack; // chips that actually moved this action
    addHistory({ name: p.name, action: res.label, amt: p.bet, you: !!p.you });
    if (paid > 0) {
      const seatIdx = s.players.findIndex((x) => x.id === p.id);
      // scale chip count to bet size (3–8 chips), purely cosmetic
      const count = Math.max(3, Math.min(8, Math.round(paid / Math.max(BB, s.pot / 8)) + 3));
      flyChips(seatIdx, -1, count);
    }
    let cinematicPause = 0;
    if (res.allin) {
      const seatIdx = s.players.findIndex((x) => x.id === p.id);
      // SOUND: stinger plays at the cinematic moment
      sfx('all_in_stinger');
      setAllInCinematic({ seat: seatIdx, name: p.name, key: nextId() });
      setTimeout(() => setAllInCinematic(null), 1150);
      showToast('ALL IN', 'allin');
      if (!p.you) { addChat({ name: p.name, msg: "ALL IN. LET'S GHOUL. 💀" }); showBubble(p.id, '💬'); }
      cinematicPause = 900; // hold the moment ~1s before next turn (cosmetic only — logic unchanged)
    }
    publish();
    s.turn = (s.turn + 1) % s.players.length;
    setTimeout(drive, 440 + cinematicPause);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addHistory, addChat, showToast, showBubble, drive, publish, flyChips]);

  const nextStage = useCallback(() => {
    const s = sRef.current;
    s.players.forEach((p) => { p.bet = 0; p.acted = false; });
    s.toCall = 0; s.minRaise = BB;
    if (s.stage === 'preflop') { s.stage = 'flop'; deal(3); }
    else if (s.stage === 'flop') { s.stage = 'turn'; deal(1); }
    else if (s.stage === 'turn') { s.stage = 'river'; deal(1); }
    else if (s.stage === 'river') return showdown();
    addChat({ sys: true, msg: `— ${s.stage.toUpperCase()} —` });
    publish();
    const canBet = s.players.filter((p) => !p.folded && !p.allin);
    if (canBet.length <= 1) { setTimeout(nextStage, 800); return; }
    let t = (s.button + 1) % s.players.length, g = 0;
    while ((s.players[t].folded || s.players[t].allin) && g++ < 12) t = (t + 1) % s.players.length;
    s.turn = t;
    setTimeout(drive, 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addChat, drive, publish]);

  const deal = (n: number) => { const s = sRef.current; for (let k = 0; k < n; k++) s.board.push(s.deck.pop()!); };

  // Visual win celebration. Call BEFORE the pot is folded into the winner's stack.
  // Fires pot→winner chip flights, the +XP burst over the seat, and aura flash (via winners state).
  const celebrateWin = useCallback((winnerSeatIdx: number, potSize: number, xp: number) => {
    sfx('pot_collect');
    const count = Math.max(5, Math.min(12, Math.round(potSize / 200) + 4));
    flyChips(-1, winnerSeatIdx, count); // -1 source = pot
    setWinBurst({ seat: winnerSeatIdx, xp, key: nextId() });
    // XP burst chime layers in just after the pot sweep
    setTimeout(() => sfx('achievement_unlock'), 260);
    setTimeout(() => setWinBurst(null), 1600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyChips]);

  const finish = useCallback((youWon: boolean, wasShowdown: boolean, survivedAllIn: boolean, bigPot: boolean) => {
    const s = sRef.current;
    setProfile((pr) => {
      const np = { ...pr, bank: s.players[0].stack };
      if (youWon) { np.wins++; np.sghoul += Math.floor(s.pot / 4); }
      return np;
    });
    if (youWon) {
      showToast('YOU WIN', 'win'); setConfettiKey((k) => k + 1);
      addXP(wasShowdown ? 70 : 45); bumpMission('win1');
      if (wasShowdown) bumpMission('showdown');
      if (bigPot && !achievementUnlocked) { setAchievementUnlocked(true); showToast('NIGHT HUNTER', 'win'); addChat({ sys: true, msg: '★ ACHIEVEMENT: Night Hunter unlocked.' }); }
    } else addXP(12);
    if (survivedAllIn) bumpMission('allin');
    s.stage = 'idle'; s.turn = -1;
    publish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast, addXP, bumpMission, addChat, achievementUnlocked, publish]);

  const showdown = useCallback(() => {
    const s = sRef.current;
    s.stage = 'showdown';
    const potSize = s.pot;
    const r = resolveShowdown(s);
    setWinners(r.winners.map((w) => w.id));
    setWinningCards(r.winningCards);
    const names = r.winners.map((w) => w.name).join(' & ');
    addChat({ sys: true, msg: `★ ${names} win${r.winners.length > 1 ? '' : 's'} ◈${potSize.toLocaleString()} with ${r.handName}.` });
    setStatus(`${names} take${r.winners.length > 1 ? '' : 's'} the pot — ${r.handName}.`);
    const youWon = r.winners.some((w) => w.you);
    const primaryWinnerIdx = s.players.findIndex((p) => p.id === r.winners[0].id);
    celebrateWin(primaryWinnerIdx, potSize, youWon ? 70 : 12);
    finish(youWon, true, s.players[0].allin && !s.players[0].folded, potSize >= 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addChat, finish, celebrateWin]);

  const endHand = useCallback(() => {
    const s = sRef.current;
    const w = activePlayers(s)[0];
    const potSize = s.pot;
    w.stack += s.pot;
    setWinners([w.id]);
    addChat({ sys: true, msg: `★ ${w.name} wins ◈${potSize.toLocaleString()} (all folded).` });
    setStatus(`${w.name} scoops ◈${potSize.toLocaleString()} uncontested.`);
    const winnerIdx = s.players.findIndex((p) => p.id === w.id);
    celebrateWin(winnerIdx, potSize, w.you ? 45 : 12);
    finish(!!w.you, false, false, potSize >= 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addChat, finish, celebrateWin]);

  // ---- public actions ----
  const startHand = useCallback(() => {
    const s = sRef.current;
    if (s.players[0].stack < BB) s.players[0].stack = START_STACK;
    setWinners([]); setWinningCards([]);
    s.deck = freshDeckLocal();
    s.board = []; s.pot = 0; s.toCall = 0; s.minRaise = BB; s.stage = 'preflop'; s.lastRaiser = -1;
    s.players.forEach((p) => { p.cards = []; p.bet = 0; p.folded = false; p.allin = false; p.acted = false; if (!p.you && p.stack < BB) p.stack = START_STACK; });
    s.button = (s.button + 1) % s.players.length;
    setProfile((pr) => ({ ...pr, handno: pr.handno + 1, hands: pr.hands + 1 }));
    addChat({ sys: true, msg: '— new hand dealt —' });
    bumpMission('play3');
    for (let r = 0; r < 2; r++) s.players.forEach((p) => p.cards.push(s.deck.pop()!));
    const sb = (s.button + 1) % s.players.length, bb = (s.button + 2) % s.players.length;
    postBlind(s, sb, SB); postBlind(s, bb, BB);
    s.toCall = BB; s.lastRaiser = bb; s.turn = (bb + 1) % s.players.length;
    setStatus(`Blinds posted. ${s.players[sb].name} SB / ${s.players[bb].name} BB.`);
    publish();
    setTimeout(drive, 650);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addChat, bumpMission, drive, publish]);

  const act = useCallback((action: ActionType, amount?: number) => {
    resolverRef.current?.(action, amount);
  }, []);

  const sendChat = useCallback((msg: string) => {
    addChat({ name: 'YOU', msg });
    setTimeout(() => {
      const g = sRef.current.players.find((p) => !p.you && !p.folded) ?? sRef.current.players[1];
      if (g) { addChat({ name: g.name, msg: ['gg', 'degen', '📈', '💀', 'wp', 'based'][(Math.random() * 6) | 0] }); showBubble(g.id, '💬'); }
    }, 800);
  }, [addChat, showBubble]);

  const emote = useCallback((e: string) => { addChat({ name: 'YOU', msg: e }); showBubble(0, e); }, [addChat, showBubble]);

  return {
    state, profile, missions, chat, history, status, prompt, xpGain, bubble,
    winners, winningCards, toast, achievementUnlocked, confettiKey,
    chipFlights, potPulse, winBurst, allInCinematic,
    startHand, act, sendChat, emote,
    isIdle: state.stage === 'idle',
  };
}

// local re-export to avoid circular import surprises
function freshDeckLocal() {
  const SUITS = ['s', 'h', 'd', 'c'];
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const d: string[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  for (let i = d.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
