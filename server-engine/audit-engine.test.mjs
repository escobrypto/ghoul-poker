// Audit: engine pot-logic tests (run against built @ghoul/engine)
import { evaluate, cmpScore } from './packages/engine/dist/poker.js';
import { resolveShowdown } from './packages/engine/dist/table.js';

let pass = 0, fail = 0;
function t(name, cond, detail = '') {
  if (cond) { pass++; console.log('  ok -', name); }
  else { fail++; console.log('  FAIL -', name, detail); }
}

console.log('[1] hand evaluation sanity');
t('straight flush beats quads', cmpScore(evaluate(['As','Ks','Qs','Js','Ts','2h','3d']), evaluate(['Ah','Ad','Ac','As','Kh','2s','3s'])) > 0);
t('wheel straight recognized', evaluate(['Ah','2s','3d','4c','5h','9s','Jd'])[0] === 4);
t('two pair vs pair', cmpScore(evaluate(['Ah','Ad','Kh','Kd','2c','3s','7h']), evaluate(['Ah','Ac','Qh','Jd','2c','3s','7h'])) > 0);

console.log('[2] SIDE POTS — short-stack all-in must not scoop chips it never covered');
// P0 all-in 100 with the best hand. P1/P2 each committed 500.
// Correct poker: P0 wins main pot 300; side pot 800 goes to best of P1/P2.
// Board gives P0 quads; P1 has a straight, P2 has two pair -> side pot must go to P1.
const board = ['Ah','Ad','9c','8d','2s'];
const s = {
  players: [
    { id: 0, name: 'SHORT', stack: 0, cards: ['As','Ac'], bet: 0, folded: false, allin: true,  acted: true },
    { id: 1, name: 'MID',   stack: 0, cards: ['Kh','Ks'], bet: 0, folded: false, allin: false, acted: true },
    { id: 2, name: 'BIG',   stack: 0, cards: ['9h','8s'], bet: 0, folded: false, allin: false, acted: true },
  ],
  deck: [], board, pot: 1100, toCall: 0, minRaise: 20, button: 0, turn: 0, stage: 'showdown', lastRaiser: -1,
  // per-player total commitment this hand (100 + 500 + 500 = 1100)
  committed: { 0: 100, 1: 500, 2: 500 },
};
// attach commitments the way the engine tracks them (post-fix: p.committed)
s.players[0].committed = 100; s.players[1].committed = 500; s.players[2].committed = 500;

const r = resolveShowdown(s);
const p0 = s.players[0].stack, p1 = s.players[1].stack, p2 = s.players[2].stack;
console.log('    payouts -> SHORT:', p0, 'MID:', p1, 'BIG:', p2);
t('chip conservation (no chips created or burned)', p0 + p1 + p2 === 1100, `sum=${p0+p1+p2}`);
t('short all-in capped at main pot (300)', p0 === 300, `got ${p0}`);
t('side pot (800) to best covering hand (MID)', p1 === 800, `got ${p1}`);
t('BIG gets nothing', p2 === 0, `got ${p2}`);

console.log('[3] SPLIT POT — odd chip must not vanish');
const board2 = ['Ah','Kd','Qc','Jd','Ts']; // board plays: both split
const s2 = {
  players: [
    { id: 0, name: 'A', stack: 0, cards: ['2s','3c'], bet: 0, folded: false, allin: false, acted: true, committed: 105 },
    { id: 1, name: 'B', stack: 0, cards: ['2d','3h'], bet: 0, folded: false, allin: false, acted: true, committed: 106 },
  ],
  deck: [], board: board2, pot: 211, toCall: 0, minRaise: 20, button: 0, turn: 0, stage: 'showdown', lastRaiser: -1,
};
const r2 = resolveShowdown(s2);
const sum2 = s2.players[0].stack + s2.players[1].stack;
console.log('    payouts -> A:', s2.players[0].stack, 'B:', s2.players[1].stack);
t('split pot conserves every chip', sum2 === 211, `sum=${sum2}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
