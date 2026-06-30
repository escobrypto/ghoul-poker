export interface Mission {
  id: string;
  text: string;
  goal: number;
  prog: number;
  reward: number;
  done: boolean;
}

export const INITIAL_MISSIONS: Mission[] = [
  { id: 'play3', text: 'Play 3 hands', goal: 3, prog: 0, reward: 80, done: false },
  { id: 'win1', text: 'Win a hand', goal: 1, prog: 0, reward: 120, done: false },
  { id: 'showdown', text: 'Win at showdown', goal: 1, prog: 0, reward: 160, done: false },
  { id: 'allin', text: 'Survive an all-in', goal: 1, prog: 0, reward: 250, done: false },
];

export function xpNeed(level: number) { return 100 + (level - 1) * 120; }
