// Live auth E2E vs the real server over Postgres: register/login/logout,
// session persistence across reconnects, guest upgrade, rate limiting.
import { io } from 'socket.io-client';
const URL = 'http://localhost:8099';
let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log('  ok -', n); } else { fail++; console.log('  FAIL -', n, d); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = () => io(URL, { transports: ['websocket'] });
const emit = (s, ev, p) => new Promise((res) => s.emit(ev, p, res));
const auth = (s, token, name = 'Guesty') => emit(s, 'auth', { token, name });

console.log('[1] register validation + happy path');
const A = mk(); await wait(300);
const g = await auth(A, undefined);
t('fresh guest is not registered', g.profile.registered === false);
t('bad username rejected', (await emit(A, 'auth:register', { username: 'x', password: 'password123' })).error?.includes('Username'));
t('short password rejected', (await emit(A, 'auth:register', { username: 'EscoTest', password: 'short' })).error?.includes('Password'));
const reg = await emit(A, 'auth:register', { username: 'EscoTest', password: 'password123' });
t('register ok, session token issued', reg.ok === true && reg.token?.startsWith('gs_'));
t('profile flips to registered, name = username', reg.profile.registered === true && reg.profile.name === 'EscoTest');
t('guest upgraded in place (same account id)', reg.profile.id === g.profile.id);
t('double-register blocked', (await emit(A, 'auth:register', { username: 'EscoTest2', password: 'password123' })).error === 'Already registered');

console.log('[2] session persistence across a fresh connection');
A.disconnect(); const A2 = mk(); await wait(300);
const back = await auth(A2, reg.token);
t('session token resumes the SAME account on a new socket', back.profile.id === g.profile.id && back.profile.registered === true);

console.log('[3] login from a clean browser');
const B = mk(); await wait(300);
await auth(B, undefined); // brand-new guest
t('wrong password rejected', (await emit(B, 'auth:login', { username: 'EscoTest', password: 'nope-nope' })).error?.length > 0);
const li = await emit(B, 'auth:login', { username: 'escotest', password: 'password123' });
t('login ok (case-insensitive username), same account', li.ok === true && li.profile.id === g.profile.id);

console.log('[4] logout kills the session server-side');
await emit(B, 'auth:logout', { token: li.token });
const C = mk(); await wait(300);
const dead = await auth(C, li.token);
t('dead session token -> new guest, NOT the account', dead.profile.id !== g.profile.id);

console.log('[5] login rate limit');
const D = mk(); await wait(300); await auth(D, undefined);
let limited = false;
for (let i = 0; i < 7; i++) {
  const r = await emit(D, 'auth:login', { username: 'EscoTest', password: 'badbadbad' });
  if (r.error?.includes('Too many')) limited = true;
}
t('brute force throttled after 5 attempts', limited);

console.log(`\n${pass} passed, ${fail} failed`);
[A2, B, C, D].forEach((s) => s.disconnect());
process.exit(fail ? 1 : 0);
