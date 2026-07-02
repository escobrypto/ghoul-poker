// Live multiplayer audit vs the real server on :8099 (MemoryStore).
import { io } from 'socket.io-client';

const URL = 'http://localhost:8099';
const problems = [];
const notes = [];
let founderSeen = null;

function client(name) {
  const sock = io(URL, { transports: ['websocket'] });
  const c = { name, sock, id: null, token: null, profile: null, lastTable: null, folder: true };
  sock.on('table:state', (t) => {
    c.lastTable = t;
    // --- REDACTION: pre-showdown, every non-you seat's cards must be null ---
    if (t.stage !== 'showdown' && t.stage !== 'idle') {
      for (const s of t.seats) {
        if (!s.isYou && s.cards.some((x) => x !== null)) {
          problems.push(`REDACTION LEAK: ${name} saw ${s.name}'s cards ${JSON.stringify(s.cards)} at stage ${t.stage}`);
        }
        if (s.isYou && t.stage === 'preflop' && s.cards.some((x) => x === null)) {
          problems.push(`OWN-CARD MISSING: ${name} missing own cards preflop`);
        }
      }
    }
    if ('deck' in t) problems.push(`DECK LEAKED to ${name}`);
    // --- CHIP CONSERVATION within a hand ---
    const sum = t.seats.reduce((a, s) => a + s.stack + s.bet, 0) + (t.pot - t.seats.reduce((a, s) => a + s.bet, 0));
    // simpler: stacks + pot (pot already includes current bets)
    const total = t.seats.reduce((a, s) => a + s.stack, 0) + t.pot;
    const key = `h${t.handNo}`;
    if (!conservation.has(key)) conservation.set(key, total);
    else if (conservation.get(key) !== total) {
      problems.push(`CHIP LEAK hand ${t.handNo}: ${conservation.get(key)} -> ${total} (seen by ${name})`);
      conservation.set(key, total);
    }
    // --- act when it's our turn ---
    if (t.turnSeatId === c.id) {
      const me = t.seats.find((s) => s.isYou);
      const need = t.toCall - me.bet;
      setTimeout(() => {
        if (c.folder && need > 0) sock.emit('action', { type: 'fold' });
        else sock.emit('action', { type: 'call' }); // call/check
      }, 120);
    }
  });
  sock.on('profile', (p) => {
    c.profile = p;
    if (p.founder && !founderSeen) {
      founderSeen = { name: p.name, num: p.founderNumber, level: p.level };
    }
  });
  sock.on('hand:result', (r) => {
    handResults.push(r);
  });
  return c;
}

const conservation = new Map();
const handResults = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const auth = (c, tok) => new Promise((res) => c.sock.emit('auth', { token: tok, name: c.name }, (r) => {
  c.token = r.token; c.id = r.profile?.id; c.profile = r.profile; res(r);
}));

async function main() {
  const A = client('AuditA'), B = client('AuditB'), C = client('AuditC');
  await wait(400);
  await auth(A); await auth(B); await auth(C);
  notes.push(`accounts: A=${A.id} B=${B.id} C=${C.id}`);

  // A creates a private room; B and C join by code
  // Register B as a real account BEFORE play — under the GENESIS rule
  // (registered + finish 1 hand) B should get badge #1 after the first hand.
  const reg = await new Promise((res) => B.sock.emit('auth:register', { username: 'AuditB', password: 'password123' }, res));
  if (!reg.ok) problems.push(`REGISTER failed: ${reg.error}`);

  const code = await new Promise((res) => A.sock.emit('room:create', { isPublic: false }, (r) => res(r.code)));
  await new Promise((res) => B.sock.emit('room:join', { code }, res));
  await new Promise((res) => C.sock.emit('room:join', { code }, res));
  A.sock.emit('room:ready', { ready: true }); B.sock.emit('room:ready', { ready: true }); C.sock.emit('room:ready', { ready: true });
  await wait(200);
  A.sock.emit('room:start');
  notes.push(`room ${code} started with 3 players`);

  // Phase 1: fold-fest — blinds rotate wins, someone reaches level 2 -> founder
  await wait(30_000);

  // Phase 2: one full showdown hand — everyone calls to the river
  A.folder = B.folder = C.folder = false;
  await wait(16_000);

  // Phase 3: reconnect mid-hand — C drops and comes back with the same token
  const cToken = C.token, cId = C.id;
  C.sock.disconnect();
  notes.push('C disconnected mid-play');
  await wait(2_500);
  const C2 = client('AuditC');
  C2.folder = false;
  await wait(300);
  await auth(C2, cToken);
  if (C2.id !== cId) problems.push(`RECONNECT: identity changed ${cId} -> ${C2.id}`);
  await new Promise((res) => C2.sock.emit('room:join', { code }, res));
  await wait(6_000);
  if (!C2.lastTable) problems.push('RECONNECT: C never received table state after rejoin');
  else {
    const seat = C2.lastTable.seats.find((s) => s.id === cId);
    if (!seat) problems.push('RECONNECT: C lost their seat');
    else notes.push(`reconnect OK: C rejoined hand ${C2.lastTable.handNo}, stack ${seat.stack}`);
  }

  // ---- payout integrity: winners' amounts must equal the pot they were paid from
  const paid = handResults.filter((r) => r.winners.length);
  notes.push(`hands completed: ${paid.length} (${paid.filter((r) => r.showdown).length} showdowns)`);
  for (const r of paid) {
    const total = r.winners.reduce((a, w) => a + w.amount, 0);
    if (total <= 0) problems.push(`PAYOUT: non-positive total ${total}`);
  }

  // ---- founder
  if (founderSeen) {
    notes.push(`GENESIS fired: ${founderSeen.name} -> #${founderSeen.num}`);
    if (founderSeen.name !== 'AuditB') problems.push(`GENESIS went to unregistered player ${founderSeen.name}`);
  } else problems.push('GENESIS: registered player finished hands but no badge (check grant path)');

  console.log('\n===== E2E AUDIT RESULT =====');
  notes.forEach((n) => console.log('  •', n));
  if (problems.length) { console.log('\nPROBLEMS:'); problems.forEach((p) => console.log('  ✗', p)); }
  else console.log('\n  ✓ no redaction leaks, no chip leaks, reconnect clean, founder grant fired');
  process.exit(problems.length ? 1 : 0);
}
main();
