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

console.log('[3.5] AUTH — register/login/logout/guest-upgrade');
const guest = await store.authenticate(undefined, 'SoonRegistered');
await store.addXp(guest.id, 60);
const reg1 = await store.register(guest.id, 'GhoulEsco', 'hunter22222');
t('guest upgrade succeeds', reg1.ok === true);
t('upgrade keeps account id (XP/badges preserved)', reg1.ok && reg1.account.id === guest.id);
const profReg = await store.getProfile(guest.id);
t('profile marked registered, xp intact', profReg.registered === true && profReg.xp === 60, JSON.stringify({r:profReg.registered,xp:profReg.xp}));
const dupe = await store.register(null, 'ghoulesco', 'password123');
t('duplicate username rejected (case-insensitive)', dupe.ok === false);
const badpw = await store.login('GhoulEsco', 'wrongwrong');
t('wrong password rejected', badpw.ok === false);
const good = await store.login('GHOULESCO', 'hunter22222');
t('login works (any case), same account', good.ok === true && good.account.id === guest.id);
const viaSession = await store.authenticate(good.ok ? good.sessionToken : '', 'IgnoredName');
t('session token resolves to account, name NOT auto-renamed', viaSession.id === guest.id && viaSession.name === 'GhoulEsco', viaSession.name);
await store.logout(good.sessionToken);
const afterLogout = await store.authenticate(good.sessionToken, 'Ghosty');
t('dead session falls through to a fresh guest', afterLogout.id !== guest.id);

console.log('[4] GENESIS RACE — 150 registered+played accounts grant concurrently, cap 100');
const ids = [];
for (let i = 0; i < 150; i++) {
  const r = await store.register(null, `Racer${i}`, 'password123');
  ids.push(r.account.id);
}
// every racer finishes one hand (eligibility floor)
await Promise.all(ids.map((id) => store.recordHand(id, false, 0)));
// fire ALL grants at once — the exact production race window
const results = await Promise.all(ids.map((id) => store.grantFounderIfEligible(id)));
const granted = results.filter((n) => n !== null);
const unique = new Set(granted);
t('exactly 100 grants (cap held under concurrency)', granted.length === 100, `granted=${granted.length}`);
const unregistered = await store.authenticate(undefined, 'NeverRegistered');
await store.recordHand(unregistered.id, true, 0);
t('unregistered player NEVER gets GENESIS', (await store.grantFounderIfEligible(unregistered.id)) === null);
const regNoHand = await store.register(null, 'NoHandsYet', 'password123');
t('registered but zero hands -> not yet eligible', (await store.grantFounderIfEligible(regNoHand.account.id)) === null);
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
