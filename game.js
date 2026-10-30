'use strict';

// ---------------------------------------------------------------------------
// Train Operator Simulator
// A minimalist rail traffic control screen. Virtual canvas is 1280x720 and is
// scaled to whatever size the screen has.
// ---------------------------------------------------------------------------

const W = 1280;
const H = 720;

const C = {
  bg: '#070b10',
  grid: '#0f161e',
  track: '#253241',
  trackLit: '#7d93a8',
  text: '#b9c7d4',
  dim: '#4d5d6d',
  accent: '#4cf3a0',
  amber: '#ffb547',
  red: '#ff5c5c',
  white: '#e8f1f8',
};

const TRAIN_LEN = 34;      // px of track a train occupies
const V_MAX = 44;          // px per second
const ACCEL = 34;          // px per second^2
const HIT_DIST = 6;        // body points closer than this collide
const SWITCH_LOCK = 18;    // a train this close to a switch locks it
const SHIFT_START = 6 * 60;
const SHIFT_END = 14 * 60; // game minutes; 1 real second = 1 game minute
const MAX_STRIKES = 3;

// --- Network ---------------------------------------------------------------
// Endpoints are terminals where trains enter and leave. Every other node is a
// switch: a train coming from the stem takes the selected branch; a train
// coming from either branch always continues to the stem.

const nodes = {
  ARC: { x: 100,  y: 250, end: true, name: 'ARCOS',    color: '#5fd4ff' },
  BOR: { x: 100,  y: 470, end: true, name: 'BORDE',    color: '#c792ff' },
  CEN: { x: 640,  y: 80,  end: true, name: 'CENTRAL',  color: '#4cf3a0' },
  DUN: { x: 1180, y: 250, end: true, name: 'DUNAS',    color: '#ffd166' },
  EST: { x: 1180, y: 470, end: true, name: 'ESTUARIO', color: '#ff8fa3' },
  FAR: { x: 640,  y: 640, end: true, name: 'FARO',     color: '#ff9f43' },

  A:  { x: 250, y: 250, stem: 'ARC', branches: ['C1', 'K'],   key: '1' },
  C1: { x: 520, y: 250, stem: 'A',   branches: ['C2', 'Q'],   key: '2' },
  Q:  { x: 640, y: 150, stem: 'CEN', branches: ['C1', 'C2'],  key: '3' },
  C2: { x: 760, y: 250, stem: 'N',   branches: ['C1', 'Q'],   key: '4' },
  N:  { x: 980, y: 250, stem: 'DUN', branches: ['C2', 'M'],   key: '5' },
  K:  { x: 370, y: 470, stem: 'S1',  branches: ['BOR', 'A'],  key: '6' },
  S1: { x: 520, y: 470, stem: 'K',   branches: ['S2', 'R'],   key: '7' },
  R:  { x: 640, y: 560, stem: 'FAR', branches: ['S1', 'S2'],  key: '8' },
  S2: { x: 760, y: 470, stem: 'M',   branches: ['S1', 'R'],   key: '9' },
  M:  { x: 860, y: 470, stem: 'S2',  branches: ['EST', 'N'],  key: '0' },
};

const endpoints = Object.keys(nodes).filter(id => nodes[id].end);
const switches = Object.keys(nodes).filter(id => !nodes[id].end);

const edges = [];
(function buildEdges() {
  const seen = new Set();
  for (const id of switches) {
    const n = nodes[id];
    n.state = 0;
    for (const other of [n.stem, ...n.branches]) {
      const k = [id, other].sort().join('|');
      if (!seen.has(k)) { seen.add(k); edges.push([id, other]); }
    }
  }
  for (const id of endpoints) {
    nodes[id].next = edges.find(e => e.includes(id)).find(x => x !== id);
  }
})();

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function nextNode(from, at) {
  const n = nodes[at];
  if (n.end) return null;
  return from === n.stem ? n.branches[n.state] : n.stem;
}

function options(from, at) {
  const n = nodes[at];
  if (n.end) return [];
  return from === n.stem ? n.branches.slice() : [n.stem];
}

// Shortest route length from an origin to every reachable terminal, assuming
// the operator sets every switch right.
function routesFrom(origin) {
  const best = {};
  const start = { from: origin, at: nodes[origin].next, d: dist(nodes[origin], nodes[nodes[origin].next]) };
  const queue = [start];
  const seen = new Map();
  while (queue.length) {
    queue.sort((a, b) => a.d - b.d);
    const s = queue.shift();
    const key = s.from + '>' + s.at;
    if (seen.has(key)) continue;
    seen.set(key, s.d);
    if (nodes[s.at].end) {
      if (s.at !== origin && !(s.at in best)) best[s.at] = s.d;
      continue;
    }
    for (const nx of options(s.from, s.at)) {
      queue.push({ from: s.at, at: nx, d: s.d + dist(nodes[s.at], nodes[nx]) });
    }
  }
  return best;
}

const ROUTES = {};
for (const e of endpoints) ROUTES[e] = routesFrom(e);

// --- State -----------------------------------------------------------------

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);

let state;
let paused = false;
let running = false;
let timeScale = 1;
let soundOn = true;
let hover = null;

function newState() {
  for (const id of switches) nodes[id].state = 0;
  return {
    clock: SHIFT_START,
    score: 0,
    delivered: 0,
    strikes: 0,
    trains: [],
    nextId: 101 + Math.floor(Math.random() * 40),
    spawnTimer: 3,
    pending: null,   // announced train waiting to enter
    crash: null,
    over: false,
    blinkT: 0,
  };
}

// --- Audio -----------------------------------------------------------------

let audio = null;
function beep(freq, dur = 0.06, type = 'square', vol = 0.04) {
  if (!soundOn) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + dur);
  } catch (e) { /* audio not available */ }
}

// --- Log -------------------------------------------------------------------

function fmtClock(m) {
  const h = Math.floor(m / 60) % 24;
  const mm = Math.floor(m % 60);
  return String(h).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function log(msg, cls = '') {
  const li = document.createElement('li');
  li.className = cls;
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = fmtClock(state.clock);
  li.appendChild(t);
  li.appendChild(document.createTextNode(msg));
  const ul = $('log');
  ul.prepend(li);
  while (ul.children.length > 6) ul.lastChild.remove();
}

// --- Spawning --------------------------------------------------------------

function difficulty() {
  // 0 at the start of the shift, 1 at the end
  return Math.min(1, (state.clock - SHIFT_START) / (SHIFT_END - SHIFT_START));
}

// A terminal can send a train only when its access track is empty, so a new
// train never appears head-on with one already on the way in.
function portalFree(id) {
  const p = nodes[id];
  const access = [id, p.next];
  return !state.trains.some(t =>
    (access.includes(t.from) && access.includes(t.to)) ||
    t.trail.some(pt => dist(pt, p) < TRAIN_LEN + 30));
}

function announce() {
  const free = endpoints.filter(portalFree);
  if (!free.length) return false;
  const origin = free[Math.floor(Math.random() * free.length)];
  const dests = Object.keys(ROUTES[origin]);
  const dest = dests[Math.floor(Math.random() * dests.length)];
  const id = 'T' + state.nextId++;
  state.pending = { id, origin, dest, wait: 4 };
  log(`${id} anunciado  ${nodes[origin].name} → ${nodes[dest].name}`);
  beep(880, 0.05, 'sine');
  return true;
}

function spawn(p) {
  const o = nodes[p.origin];
  const routeLen = ROUTES[p.origin][p.dest];
  state.trains.push({
    id: p.id,
    origin: p.origin,
    dest: p.dest,
    color: nodes[p.dest].color,
    from: p.origin,
    to: o.next,
    d: 0,
    speed: V_MAX * 0.6,
    held: false,
    trail: [{ x: o.x, y: o.y }],
    age: 0,
    deadline: routeLen / V_MAX * 1.7 + 12,
  });
}

function updateSpawner(dt) {
  if (state.pending) {
    state.pending.wait -= dt;
    if (state.pending.wait <= 0 && portalFree(state.pending.origin)) {
      spawn(state.pending);
      state.pending = null;
      const k = difficulty();
      state.spawnTimer = 13 - 8 * k + Math.random() * 3;
    }
    return;
  }
  const maxTrains = 3 + Math.round(6 * difficulty());
  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0 && state.trains.length < maxTrains && state.clock < SHIFT_END - 8) {
    if (!announce()) state.spawnTimer = 1;
  }
}

// --- Trains ----------------------------------------------------------------

function trimTrail(t) {
  let acc = 0;
  for (let i = 1; i < t.trail.length; i++) {
    const seg = dist(t.trail[i - 1], t.trail[i]);
    if (acc + seg >= TRAIN_LEN) {
      const r = (TRAIN_LEN - acc) / seg;
      const a = t.trail[i - 1], b = t.trail[i];
      t.trail[i] = { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
      t.trail.length = i + 1;
      return;
    }
    acc += seg;
  }
}

function moveTrain(t, dt) {
  t.age += dt;
  const target = t.held ? 0 : V_MAX;
  if (t.speed < target) t.speed = Math.min(target, t.speed + ACCEL * dt);
  else t.speed = Math.max(target, t.speed - ACCEL * 1.6 * dt);

  let move = t.speed * dt;
  while (move > 0) {
    const a = nodes[t.from], b = nodes[t.to];
    const len = dist(a, b);
    const rem = len - t.d;
    if (move < rem) {
      t.d += move;
      move = 0;
    } else {
      move -= rem;
      t.trail.unshift({ x: b.x, y: b.y });
      const nx = nextNode(t.from, t.to);
      if (nx === null) { arrive(t); return; }
      t.from = t.to;
      t.to = nx;
      t.d = 0;
    }
  }
  const a = nodes[t.from], b = nodes[t.to];
  const r = t.d / dist(a, b);
  const head = { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
  if (!t.trail.length || dist(head, t.trail[0]) > 0.01) t.trail.unshift(head);
  trimTrail(t);

  if (!t.late && t.age > t.deadline) {
    t.late = true;
    log(`${t.id} con retraso`, 'warn');
  }
}

function arrive(t) {
  t.gone = true;
  if (t.to === t.dest) {
    const pts = t.late ? 40 : 100;
    state.score += pts;
    state.delivered++;
    log(`${t.id} llega a ${nodes[t.dest].name}${t.late ? ' con retraso' : ' a tiempo'}  +${pts}`, t.late ? 'warn' : 'ok');
    beep(t.late ? 520 : 1040, 0.08, 'sine');
  } else {
    state.score = Math.max(0, state.score - 75);
    state.strikes++;
    log(`${t.id} desviado a ${nodes[t.to].name} (destino ${nodes[t.dest].name})  -75`, 'bad');
    beep(180, 0.25, 'sawtooth', 0.05);
    if (state.strikes >= MAX_STRIKES) {
      endGame('RELEVADO DEL PUESTO', `Tres trenes enviados a un destino equivocado.`, true);
    }
  }
}

function checkCollisions() {
  const ts = state.trains;
  for (let i = 0; i < ts.length; i++) {
    for (let j = i + 1; j < ts.length; j++) {
      const a = ts[i], b = ts[j];
      if (dist(a.trail[0], b.trail[0]) > TRAIN_LEN * 2 + 10) continue;
      for (const p of a.trail) {
        for (const q of b.trail) {
          if (dist(p, q) < HIT_DIST) {
            state.crash = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, t: 0 };
            log(`COLISIÓN entre ${a.id} y ${b.id}`, 'bad');
            beep(90, 0.8, 'sawtooth', 0.08);
            endGame('INCIDENTE: COLISIÓN', `${a.id} y ${b.id} han chocado. Circulación suspendida.`, true);
            return;
          }
        }
      }
    }
  }
}

function switchLocked(id) {
  const n = nodes[id];
  return state.trains.some(t => t.trail.some(p => dist(p, n) < SWITCH_LOCK));
}

function toggleSwitch(id) {
  if (!running || paused || state.over) return;
  if (switchLocked(id)) {
    log(`Desvío ${nodes[id].key} ocupado, no se puede mover`, 'warn');
    beep(220, 0.08);
    return;
  }
  const n = nodes[id];
  n.state = 1 - n.state;
  beep(640, 0.04);
}

function toggleHold(t) {
  if (!running || paused || state.over) return;
  t.held = !t.held;
  log(`${t.id} ${t.held ? 'detenido' : 'reanuda la marcha'}`);
  beep(t.held ? 400 : 760, 0.05);
}

// --- Loop ------------------------------------------------------------------

function update(dt) {
  state.blinkT += dt;
  if (state.crash) state.crash.t += dt;
  if (!running || paused || state.over) return;

  state.clock += dt;
  updateSpawner(dt);
  for (const t of state.trains) moveTrain(t, dt);
  state.trains = state.trains.filter(t => !t.gone);
  if (state.over) return;
  checkCollisions();

  if (!state.over && state.clock >= SHIFT_END && !state.trains.length && !state.pending) {
    endGame('TURNO COMPLETADO', `Buen trabajo, operador. ${state.delivered} trenes llegaron a destino.`, false);
  }
}

function updateHud() {
  $('clock').textContent = fmtClock(state.clock);
  $('score').textContent = state.score;
  $('delivered').textContent = state.delivered;
  const s = $('strikes');
  s.textContent = `${state.strikes}/${MAX_STRIKES}`;
  s.className = state.strikes >= 2 ? 'bad' : state.strikes === 1 ? 'warn' : '';
  $('active').textContent = state.trains.length;
}

// --- Drawing ---------------------------------------------------------------

function line(a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function toward(a, b, d) {
  const L = dist(a, b);
  return { x: a.x + (b.x - a.x) * d / L, y: a.y + (b.y - a.y) * d / L };
}

function drawGrid() {
  ctx.fillStyle = C.grid;
  for (let x = 20; x < W; x += 40) {
    for (let y = 20; y < H; y += 40) ctx.fillRect(x, y, 2, 2);
  }
}

function drawTracks() {
  ctx.lineCap = 'round';
  ctx.strokeStyle = C.track;
  ctx.lineWidth = 4;
  for (const [a, b] of edges) line(nodes[a], nodes[b]);

  for (const id of switches) {
    const n = nodes[id];
    const off = n.branches[1 - n.state];
    const on = n.branches[n.state];
    // gap on the branch that is not set
    ctx.strokeStyle = C.bg;
    ctx.lineWidth = 8;
    ctx.lineCap = 'butt';
    line(toward(n, nodes[off], 6), toward(n, nodes[off], 20));
    // the route that is set
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.trackLit;
    ctx.lineWidth = 4;
    line(toward(n, nodes[n.stem], 26), n);
    line(n, toward(n, nodes[on], 26));
  }
}

function drawSwitches() {
  ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const id of switches) {
    const n = nodes[id];
    const locked = running && switchLocked(id);
    const isHover = hover === id;
    ctx.beginPath();
    ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = C.bg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = locked ? C.amber : isHover ? C.accent : C.trackLit;
    ctx.stroke();
    ctx.fillStyle = locked ? C.amber : isHover ? C.accent : C.text;
    ctx.fillText(n.key, n.x, n.y + 0.5);
  }
}

function drawEndpoints() {
  ctx.font = '12px ui-monospace, Menlo, Consolas, monospace';
  ctx.textBaseline = 'middle';
  const p = state.pending;
  const w = 84, h = 26;
  for (const id of endpoints) {
    const n = nodes[id];
    const side = n.x < W / 3 ? 'left' : n.x > W * 2 / 3 ? 'right' : n.y < H / 2 ? 'top' : 'bottom';
    const bx = side === 'left' ? n.x - w : side === 'right' ? n.x : n.x - w / 2;
    const by = side === 'top' ? n.y - h : side === 'bottom' ? n.y : n.y - h / 2;
    ctx.fillStyle = C.bg;
    ctx.fillRect(bx, by, w, h);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = n.color;
    ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
    ctx.fillStyle = n.color;
    ctx.textAlign = 'center';
    ctx.fillText(n.name, bx + w / 2, by + h / 2 + 0.5);

    if (p && p.origin === id && Math.floor(state.blinkT * 3) % 2 === 0) {
      const dc = nodes[p.dest].color;
      ctx.strokeStyle = dc;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(bx - 5.5, by - 5.5, w + 11, h + 11);
      ctx.setLineDash([]);
      ctx.fillStyle = dc;
      const msg = `ENTRANTE ${p.id} → ${nodes[p.dest].name}`;
      if (side === 'left' || side === 'right') {
        ctx.textAlign = side;
        ctx.fillText(msg, side === 'left' ? bx : bx + w, by + h + 18);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(msg, bx + w + 14, by + h / 2);
      }
    }
  }
}

function drawLabels() {
  ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
  ctx.fillStyle = C.dim;
  ctx.textAlign = 'left';
  ctx.fillText('VÍA 1', 130, 236);
  ctx.fillText('VÍA 2', 130, 456);
  ctx.textAlign = 'right';
  ctx.fillText('VÍA 1', 1150, 236);
  ctx.fillText('VÍA 2', 1150, 456);
}

function drawTrains() {
  for (const t of state.trains) {
    const tr = t.trail;
    if (tr.length < 2) continue;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (t.held) {
      ctx.strokeStyle = 'rgba(232,241,248,.35)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(tr[0].x, tr[0].y);
      for (const p of tr) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.strokeStyle = t.color;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(tr[0].x, tr[0].y);
    for (const p of tr) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.arc(tr[0].x, tr[0].y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '11px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = t.held ? C.white : t.late ? C.amber : C.text;
    const tag = t.held ? `${t.id} ■ ALTO` : `${t.id} › ${t.dest}`;
    ctx.fillText(tag, tr[0].x, tr[0].y - 10);
    ctx.textBaseline = 'middle';
  }
}

function drawCrash() {
  const c = state.crash;
  if (!c) return;
  const r = 10 + (c.t * 40) % 40;
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.red;
  ctx.beginPath();
  ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawFrame() {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  drawGrid();
  drawLabels();
  drawTracks();
  drawSwitches();
  drawEndpoints();
  drawTrains();
  drawCrash();
  if (paused && running && !state.over) {
    ctx.fillStyle = C.amber;
    ctx.font = '14px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('■ SIMULACIÓN EN PAUSA', W - 24, 20);
  }
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.width * 9 / 16 * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // sub-steps keep collision checks reliable at higher speeds
  const steps = timeScale;
  for (let i = 0; i < steps; i++) update(dt);
  drawFrame();
  updateHud();
  requestAnimationFrame(frame);
}

// --- Input -----------------------------------------------------------------

function toVirtual(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * W,
    y: (e.clientY - rect.top) / rect.height * H,
  };
}

function switchAt(p) {
  let best = null, bd = 22;
  for (const id of switches) {
    const d = dist(p, nodes[id]);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

function trainAt(p) {
  let best = null, bd = 18;
  for (const t of state.trains) {
    for (const q of t.trail) {
      const d = dist(p, q);
      if (d < bd) { bd = d; best = t; }
    }
  }
  return best;
}

canvas.addEventListener('pointerdown', e => {
  const p = toVirtual(e);
  const sw = switchAt(p);
  if (sw && !switchLocked(sw)) return toggleSwitch(sw);
  const t = trainAt(p);
  if (t) return toggleHold(t);
  if (sw) toggleSwitch(sw);
});

canvas.addEventListener('pointermove', e => {
  const p = toVirtual(e);
  hover = switchAt(p);
  canvas.style.cursor = hover || (running && trainAt(p)) ? 'pointer' : 'crosshair';
});

window.addEventListener('keydown', e => {
  if (e.key === 'p' || e.key === 'P' || e.key === ' ') {
    e.preventDefault();
    togglePause();
    return;
  }
  const id = switches.find(s => nodes[s].key === e.key);
  if (id) toggleSwitch(id);
});

function togglePause() {
  if (!running || state.over) return;
  paused = !paused;
  $('btn-pause').textContent = paused ? 'SEGUIR' : 'PAUSA';
}

$('btn-pause').addEventListener('click', togglePause);
$('btn-speed').addEventListener('click', () => {
  timeScale = timeScale === 1 ? 2 : 1;
  $('btn-speed').textContent = 'x' + timeScale;
});
$('btn-sound').addEventListener('click', () => {
  soundOn = !soundOn;
  $('btn-sound').textContent = soundOn ? 'SND ON' : 'SND OFF';
});

// --- Overlay ---------------------------------------------------------------

function bestScore() {
  try { return Number(localStorage.getItem('tos-best')) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem('tos-best', String(v)); } catch (e) { /* storage blocked */ }
}

function endGame(title, text, bad) {
  state.over = true;
  running = false;
  const prev = bestScore();
  if (state.score > prev) saveBest(state.score);
  setTimeout(() => {
    $('ov-title').textContent = title;
    $('ov-title').className = bad ? 'bad' : '';
    $('ov-body').innerHTML = '';
    const p1 = document.createElement('p');
    p1.textContent = text;
    const p2 = document.createElement('p');
    p2.innerHTML = `Puntos: <b>${state.score}</b> · Llegadas: <b>${state.delivered}</b> · Hora: <b>${fmtClock(state.clock)}</b><br>` +
      (state.score > prev ? '<b>Nuevo récord del puesto.</b>' : `Récord del puesto: <b>${prev}</b>`);
    $('ov-body').append(p1, p2);
    $('ov-btn').textContent = 'NUEVO TURNO';
    $('overlay').classList.remove('hidden');
  }, bad ? 1400 : 300);
}

$('ov-btn').addEventListener('click', () => {
  state = newState();
  $('log').innerHTML = '';
  $('overlay').classList.add('hidden');
  paused = false;
  $('btn-pause').textContent = 'PAUSA';
  running = true;
  log('Turno iniciado. Red operativa.', 'ok');
  beep(660, 0.05, 'sine');
});

state = newState();
window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
