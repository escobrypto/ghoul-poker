// PgStore audit vs real Postgres: schema boot, auth, XP, founder race.
import { PgStore } from './server/dist/PgStore.js';

const URL = 'postgres://ghoul:gg@localhost:5432/ghoulpoker';
let pass = 0, fail = 0;
const t = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  ok -', name); }
  else { fail++; console.log('  FAIL -', name, detail); }
};

const store = new PgStore(URL);
await store.init();
console.log('[1] schema boots idempotently');
await store.init(); // second boot must not throw
t('double init survives (CREATE IF NOT EXISTS path)', true);

console.log('[2] account lifecycle');
const a = await store.authenticate(undefined, '  Spooky  Ghoul  ');
t('name sanitized on create', a.name === 'Spooky Ghoul', a.name);
const a2 = await store.authenticate(a.token, a.name);
t('token round-trips to same account', a2.id === a.id);
const a3 = await store.authenticate(a.token, '   ');
t('whitespace rename rejected, name kept', a3.name === 'Spooky Ghoul', a3.name);

console.log('[3] XP transaction + level curve');
await store.addXp(a.id, 250); // 100 to L2, leaving 150 (L3 needs 220)
const prof = await store.getProfile(a.id);
t('level curve correct (250xp -> L2 + 150)', prof.level === 2 && prof.xp === 150, `L${prof.level} xp${prof.xp}`);

console.log('[4] FOUNDER RACE — 150 eligible accounts grant concurrently, cap 100');
const ids = [];
for (let i = 0; i < 150; i++) {
  const acc = await store.authenticate(undefined, `Racer${i}`);
  ids.push(acc.id);
}
// make them all level 2 (eligible) without the grant firing yet
await Promise.all(ids.map((id) => store.addXp(id, 100)));
// fire ALL grants at once — the exact production race window
const results = await Promise.all(ids.map((id) => store.grantFounderIfEligible(id)));
const granted = results.filter((n) => n !== null);
const unique = new Set(granted);
t('exactly 100 grants (cap held under concurrency)', granted.length === 100, `granted=${granted.length}`);
t('all founder numbers unique', unique.size === granted.length, `unique=${unique.size}`);
t('numbers are exactly 1..100', Math.min(...granted) === 1 && Math.max(...granted) === 100);

console.log('[5] idempotency — regrant returns same number');
const firstId = ids[results.findIndex((n) => n !== null)];
const firstNum = results.find((n) => n !== null);
const again = await store.grantFounderIfEligible(firstId);
t('regrant returns existing number', again === firstNum, `${again} vs ${firstNum}`);

console.log('[6] leaderboard reads');
const rows = await store.leaderboard(20);
t('leaderboard returns rows with founder data', rows.length === 20 && rows.some((r) => r.founder));

await store.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
