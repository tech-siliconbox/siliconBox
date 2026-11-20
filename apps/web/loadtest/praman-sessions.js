// Praman sessions under load (ADR 0031), run with k6 against a local stack (loadtest/README.md).
// Each virtual learner does what the tool page does: signs in, starts a session (waiting in line
// while the solver's slots are full), loads the example FIFO, proves it, polls every second while
// busy, and deletes the session. Learners come from seed-praman.ts; nothing here is real data.
import { check, fail, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3100';
const PASSWORD = __ENV.LOAD_PASSWORD;
const LEARNERS = Number(__ENV.LOAD_LEARNERS || 4);
const SCRIPT = [
  'analyze -sv fifo.sv fifo_sva.sv',
  'elaborate -top fifo',
  'clock clk',
  'reset !rst_n',
  'prove -all',
].join('; ');

export const options = {
  scenarios: {
    sessions: {
      executor: 'per-vu-iterations',
      vus: LEARNERS,
      iterations: 1,
      maxDuration: '20m',
    },
  },
  thresholds: {
    'http_req_duration{route:poll}': ['p(95)<500'],
    'http_req_duration{route:command}': ['p(95)<1000'],
    'http_req_duration{route:open}': ['p(95)<1000'],
    checks: ['rate>0.99'],
  },
};

const openWait = new Trend('praman_open_wait', true);
const proofTime = new Trend('praman_proof_time', true);
const polls = new Counter('praman_polls');

// Writes need the site's own origin (the API's origin check).
const write = (route) => ({
  headers: { 'content-type': 'application/json', origin: BASE },
  tags: { route },
});
const read = (route) => ({ tags: { route } });

function signIn(email) {
  const response = http.post(
    `${BASE}/api/auth/sign-in/email`,
    JSON.stringify({ email, password: PASSWORD }),
    write('sign-in'),
  );
  if (!check(response, { 'signed in': (r) => r.status === 200 }))
    fail(`sign-in ${response.status}`);
}

/** Opens the session; while the solver is full it answers 202 with a place in line. */
function open(sessionId) {
  const started = Date.now();
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const response = http.post(
      `${BASE}/api/v1/tool/sessions/${sessionId}/open`,
      null,
      write('open'),
    );
    if (response.status === 200) {
      openWait.add(Date.now() - started);
      return;
    }
    sleep(2);
  }
  fail(`session ${sessionId} never opened`);
}

/** Polls as the page does while busy (every second) until the proof is done. */
function proveAndWait(sessionId) {
  const started = Date.now();
  let after = 0;
  let seenBusy = false;
  for (let attempt = 0; attempt < 1200; attempt += 1) {
    sleep(1);
    const response = http.get(
      `${BASE}/api/v1/tool/sessions/${sessionId}/poll?after=${after}&version=-1`,
      read('poll'),
    );
    polls.add(1);
    check(response, { 'poll answered': (r) => r.status === 200 });
    const view = response.json();
    after = view.seq;
    seenBusy = seenBusy || view.busy || view.proofRunning;
    if (seenBusy && !view.busy && !view.proofRunning) {
      proofTime.add(Date.now() - started);
      return;
    }
  }
  fail(`session ${sessionId} stayed busy`);
}

export default function learner() {
  signIn(`loadtest-${__VU}@example.test`);
  const created = http.post(
    `${BASE}/api/v1/tool/sessions`,
    JSON.stringify({ name: `Load ${__VU}` }),
    write('create'),
  );
  if (!check(created, { 'session made': (r) => r.status === 201 }))
    fail(`create ${created.status}`);
  const sessionId = created.json('id');
  open(sessionId);
  const example = http.post(
    `${BASE}/api/v1/tool/sessions/${sessionId}/example`,
    null,
    write('example'),
  );
  check(example, { 'example loaded': (r) => r.status === 204 });
  const command = http.post(
    `${BASE}/api/v1/tool/sessions/${sessionId}/commands`,
    JSON.stringify({ line: SCRIPT }),
    write('command'),
  );
  check(command, { 'script queued': (r) => r.status === 202 });
  proveAndWait(sessionId);
  // Deleting closes the session on the solver: its slot goes to the next learner in line.
  http.del(`${BASE}/api/v1/tool/sessions/${sessionId}`, null, write('delete'));
}
