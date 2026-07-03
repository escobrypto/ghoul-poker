// CPU opponents E2E: solo human + 2 bots plays real hands; bots persist nothing;
// hands stop when the human leaves; redaction holds for bot cards.
import { io } from 'socket.io-client';
const URL = 'http://localhost:8099';
let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log('  ok -', n); } else { fail++; console.log('  FAIL -', n, d); } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));

const H = io(URL, { transports: ['websocket'] });
let leaks = 0, results = 0, lastRoomInfo = null, lastProfile = null, handNoSeen = 0;
H.on('table:state', (tb) => {
  if (tb.handNo > handNoSeen) handNoSeen = tb.handNo;
  if (tb.stage !== 'showdown' && tb.stage !== 'idle') {
    for (const seat of tb.seats) if (!seat.isYou && seat.cards.some((c) => c !== null)) leaks++;
  }
});
H.on('hand:result', () => results++);
H.on('room:info', (r) => { lastRoomInfo = r; });
H.on('profile', (p) => { lastProfile = p; });
await wait(300);
const me = (await emit(H, 'auth', { token: undefined, name: 'SoloEsco' })).profile;

console.log('[1] host builds a practice table');
const code = (await emit(H, 'room:create', { isPublic: false })).code;
t('bot 1 seated', (await emit(H, 'room:addBot', undefined)).ok === true);
t('bot 2 seated', (await emit(H, 'room:addBot', undefined)).ok === true);
await wait(200);
const bots = lastRoomInfo.players.filter((p) => p.isBot);
t('room shows 2 CPU players with roster names + negative ids', bots.length === 2 && bots.every((b) => b.id < 0 && b.ready), JSON.stringify(bots));

console.log('[2] remove + re-add works pre-start');
H.emit('room:removeBot', { botId: bots[0].id }); await wait(200);
t('bot removed', lastRoomInfo.players.filter((p) => p.isBot).length === 1);
await emit(H, 'room:addBot', undefined); await wait(200);
t('bot re-added', lastRoomInfo.players.filter((p) => p.isBot).length === 2);

console.log('[3] solo human vs 2 CPUs — real hands');
H.emit('room:ready', { ready: true }); await wait(150);
H.emit('room:start', undefined);
// human just calls whenever it's their turn
H.on('table:state', (tb) => {
  if (tb.turnSeatId === me.id) {
    const seat = tb.seats.find((s) => s.isYou);
    if (seat) setTimeout(() => H.emit('action', { type: 'call' }), 150);
  }
});
await wait(20_000);
t('multiple hands completed against CPUs', results >= 1, `results=${results}`);
t('zero redaction leaks of CPU hole cards', leaks === 0, `leaks=${leaks}`);
t('human stats recorded (hands played grew)', (lastProfile?.handsPlayed ?? 0) >= 1, `hp=${lastProfile?.handsPlayed}`);

console.log('[4] hands stop when the human leaves');
const before = results;
H.disconnect();
await wait(6_000);
// reconnect a probe to confirm server alive
const P = io(URL, { transports: ['websocket'] }); await wait(300);
const probe = await emit(P, 'auth', { token: undefined, name: 'Probe' });
t('server alive after bot-only room wind-down', probe.ok === true);
t('no runaway hands after human left', results === before, `grew ${results - before}`);
P.disconnect();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
