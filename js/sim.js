'use strict';

// ---------------------------------------------------------------------------
// Simulation: block signalling, braking, platform reservations, single-track
// direction locks, track gauges, incidents and the timetable. Time is in
// seconds since 00:00, distances in km and speeds in km/h. The simulation
// advances in fixed 1 s steps.
// ---------------------------------------------------------------------------

const BLOCK_KM = 12;        // target length of one block (cantón)
const BRAKE_PLAN = 0.6;     // m/s² used for the braking curve
const BRAKE_MAX = 1.0;      // m/s² actual braking capacity
const SPAWN_AHEAD = 300;    // trains appear at the origin platform 5 min early
const TURNAROUND = 180;     // a train leaves the network 3 min after its last arrival
const PUNCTUAL = 300;       // arrival within 5 min counts as on time
const GAUGE_CHANGE = 240;   // seconds a train spends in the gauge changer
const REBASE_KMH = 30;      // speed limit when passing a failed track circuit
const DAY_START = 6 * 3600;
const DAY_END = 24 * 3600;

const SHIFTS = {
  manana: { name: 'Turno de mañana', start: 6 * 3600, end: 14 * 3600 },
  tarde:  { name: 'Turno de tarde',  start: 14 * 3600, end: 22 * 3600 },
  jornada: { name: 'Jornada completa', start: 6 * 3600, end: DAY_END },
};

const ST = {};
const SEGS = [];
const SEG_BY = {};

function segKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
function segBetween(a, b) { return SEG_BY[segKey(a, b)]; }

(function buildNetwork() {
  for (const [id, s] of Object.entries(STATIONS)) {
    const p = project(s.lon, s.lat);
    const plats = [];
    for (let k = 1; k <= s.platforms; k++) plats.push({ anden: true, num: k, label: 'V' + k });
    for (let k = 1; k <= (s.sidings || 0); k++) plats.push({ anden: false, num: k, label: 'A' + k });
    for (const pl of plats) { pl.train = null; pl.resv = null; }
    ST[id] = { id, name: s.name, x: p.x, y: p.y, mode: 'AUTO', plats, changer: !!s.changer, changerUntil: 0 };
  }
  LINES.forEach(([a, b, tracks, vmax, gauge], i) => {
    const len = Math.hypot(ST[a].x - ST[b].x, ST[a].y - ST[b].y) * 1.15;
    const n = Math.max(2, Math.round(len / BLOCK_KM));
    const seg = {
      id: i, a, b, tracks, vmax, gauge, len, n, blen: len / n,
      occ: Array.from({ length: tracks }, () => Array(n).fill(null)),
      fault: Array.from({ length: tracks }, () => Array(n).fill(0)),  // failed track circuit until t
      ltv: null,  // temporary speed restriction { limit, cause, until }
      lock: 0,    // single track: direction currently granted (+1 a→b, -1 b→a)
      count: 0,   // trains currently on the line
    };
    SEGS.push(seg);
    SEG_BY[segKey(a, b)] = seg;
  });
})();

function segName(seg) { return `${ST[seg.a].name} – ${ST[seg.b].name}`; }
function segV(seg) { return seg.ltv ? Math.min(seg.vmax, seg.ltv.limit) : seg.vmax; }

// --- Blocks ----------------------------------------------------------------

function trackOf(seg, dir) { return seg.tracks === 2 && dir === -1 ? 1 : 0; }
function relBlock(seg, pos) { return Math.min(seg.n - 1, Math.max(0, Math.floor(pos / seg.blen))); }
function absBlock(seg, dir, rel) { return dir === 1 ? rel : seg.n - 1 - rel; }
function blockOcc(seg, dir, rel) { return seg.occ[trackOf(seg, dir)][absBlock(seg, dir, rel)]; }
function setBlock(seg, dir, rel, id) { seg.occ[trackOf(seg, dir)][absBlock(seg, dir, rel)] = id; }
function blockFault(seg, dir, rel) { return seg.fault[trackOf(seg, dir)][absBlock(seg, dir, rel)] > SIM.t; }

// A block a train may not enter: occupied, or failed without a rebase order.
function blockClosed(tr, seg, dir, rel) {
  const o = blockOcc(seg, dir, rel);
  if (o !== null && o !== tr.id) return true;
  return blockFault(seg, dir, rel) && !tr.rebase;
}

// Aspect of the signal that protects block `rel` for trains running in `dir`.
function aspect(seg, dir, rel) {
  if (seg.tracks === 1 && seg.lock && seg.lock !== dir) return 'R';
  if (blockOcc(seg, dir, rel) !== null || blockFault(seg, dir, rel)) return 'R';
  if (rel + 1 < seg.n && (blockOcc(seg, dir, rel + 1) !== null || blockFault(seg, dir, rel + 1))) return 'A';
  return 'V';
}

// --- Gauges ----------------------------------------------------------------

function fits(axle, gauge) { return gauge === 'M' || gauge === axle; }

// Which gauge a service starts with and where it has to change.
function gaugePlan(type, route) {
  const gs = route.slice(1).map((s, i) => segBetween(route[i], s).gauge);
  let g = TYPES[type].gauge;
  if (g === 'auto') g = gs.every(x => fits('U', x)) ? 'U' : 'I';
  if (g !== 'D') {
    if (!gs.every(x => fits(g, x))) console.error('Ruta incompatible con el ancho', type, route.join('-'));
    return { axle: g, changes: new Set() };
  }
  let axle = gs.find(x => x !== 'M') || 'I';
  const start = axle;
  const changes = new Set();
  gs.forEach((x, i) => {
    if (x !== 'M' && x !== axle) {
      changes.add(route[i]);
      if (!ST[route[i]].changer) console.error('Cambio de ancho sin cambiador en', route[i]);
      axle = x;
    }
  });
  return { axle: start, changes };
}

// --- Timetable -------------------------------------------------------------

function parseHM(s) { const [h, m] = s.split(':').map(Number); return h * 3600 + m * 60; }

function plannedRun(type, seg) {
  const v = Math.min(TYPES[type].vmax, seg.vmax) * 0.88;
  return seg.len / v * 3600 + 120;
}

const NUM_BASE = { AV: 3000, LD: 400, MD: 17000, MER: 90000 };

function buildServices() {
  const out = [];
  const counters = {};
  for (const p of PATTERNS) {
    for (const rev of [false, true]) {
      const route = rev ? p.route.slice().reverse() : p.route.slice();
      const gp = gaugePlan(p.type, route);
      const stops = new Set([...(p.stops || p.route), ...gp.changes]);
      const offset = rev ? 15 * 60 : 0;
      const ck = p.type + rev;
      for (let t0 = parseHM(p.first) + offset; t0 <= parseHM(p.last) + offset; t0 += p.every * 60) {
        counters[ck] = (counters[ck] || 0) + 1;
        const num = NUM_BASE[p.type] + counters[ck] * 2 + (rev ? 1 : 0);
        const sched = [{ arr: null, dep: t0 }];
        let t = t0;
        for (let i = 1; i < route.length; i++) {
          t += plannedRun(p.type, segBetween(route[i - 1], route[i])) * (p.type === 'MER' ? 1.1 : 1);
          const arr = Math.round(t / 60) * 60;
          const last = i === route.length - 1;
          let dep = arr;
          if (last) dep = null;
          else if (gp.changes.has(route[i])) dep = arr + GAUGE_CHANGE + 120;
          else if (stops.has(route[i])) dep = arr + Math.max(60, TYPES[p.type].dwell);
          sched.push({ arr, dep });
          t = dep ?? arr;
        }
        out.push({ num, type: p.type, route, stops, sched, axle: gp.axle, changes: gp.changes, spawnAt: t0 - SPAWN_AHEAD });
      }
    }
  }
  out.sort((a, b) => a.spawnAt - b.spawnAt);
  return out;
}

// --- State -----------------------------------------------------------------

let SIM;
const listeners = { log: () => {} };

function newStats() {
  const byType = {};
  for (const k of Object.keys(TYPES)) byType[k] = { done: 0, punctual: 0, delaySum: 0, max: 0 };
  return { done: 0, punctual: 0, delaySum: 0, byType, arrivals: [], incidents: [], orders: 0 };
}

function resetSim(opts = {}) {
  for (const s of Object.values(ST)) {
    s.mode = 'AUTO';
    s.changerUntil = 0;
    for (const p of s.plats) { p.train = null; p.resv = null; }
  }
  for (const g of SEGS) {
    for (const o of g.occ) o.fill(null);
    for (const f of g.fault) f.fill(0);
    g.ltv = null; g.lock = 0; g.count = 0;
  }
  SIM = {
    t: DAY_START - 600,
    acc: 0,
    services: buildServices(),
    next: 0,          // index of the next service to put on the network
    queue: [],        // services waiting for a free platform at their origin
    trains: new Map(),
    archive: [],
    stats: newStats(),
    incidents: [],
    incidentsOn: opts.incidents !== false,
    nextIncident: DAY_START + (15 + Math.random() * 20) * 60,
    incSeq: 0,
    shiftKey: SHIFTS[opts.shift] ? opts.shift : 'jornada',
    shift: SHIFTS[opts.shift] || SHIFTS.jornada,
    quiet: false,
    over: false,
  };
}

const fmt = {
  time(s) {
    if (s == null) return '--:--';
    const m = Math.floor(s / 60);
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  },
  delay(s) {
    const m = Math.round(s / 60);
    return (m > 0 ? '+' : '') + m + "'";
  },
  num(n) { return String(n).padStart(5, '0'); },
};

function log(msg, cls) { if (!SIM.quiet) listeners.log(fmt.time(SIM.t), msg, cls); }

// --- Helpers ---------------------------------------------------------------

function freePlat(st) { return st.plats.findIndex(p => p.train === null && p.resv === null); }
function nextStation(tr) { return tr.route[tr.i + 1]; }
function isStop(tr, i) { return i === 0 || i === tr.route.length - 1 || tr.stops.has(tr.route[i]); }
function trainLabel(tr) { return tr.type + ' ' + fmt.num(tr.num); }

// Station a train heads to after route position i, or null at the end.
function after(tr, i) { return i < tr.route.length - 1 ? tr.route[i + 1] : null; }

// Distance from Madrid along the network. A train is "impar" (odd) when it
// moves away from Madrid and "par" (even) when it moves towards it.
const DIST_MAD = (function () {
  const d = { MAD: 0 };
  const todo = ['MAD'];
  while (todo.length) {
    todo.sort((a, b) => d[a] - d[b]);
    const s = todo.shift();
    for (const g of SEGS) {
      const o = g.a === s ? g.b : g.b === s ? g.a : null;
      if (o && (d[o] === undefined || d[s] + g.len < d[o])) { d[o] = d[s] + g.len; todo.push(o); }
    }
  }
  return d;
})();

// Platform class a train needs at route position i: 1 odd, 0 even, -1 any.
function platClass(route, i) {
  if (i === route.length - 1) return -1;
  const ref = i === 0 ? route[0] : route[i - 1];
  return DIST_MAD[route[i + 1]] > DIST_MAD[ref] ? 1 : 0;
}

// Tracks a train may use at a station: a passenger train that stops needs a
// platform; everything else may also use sidings.
function platAllowed(tr, pl, i) {
  return pl.anden || !(TYPES[tr.type].pax && isStop(tr, i));
}

// Free track for an automatic reservation. Freight and non-stopping trains go
// to sidings first. Odd trains prefer odd platforms (V1, V3...) and even trains
// even platforms, so the two directions rarely block each other. Next to a
// single-track section, trains waiting to enter it may fill at most all but one
// track, so a train coming the other way can always get in.
function autoPlat(tr, stId, i) {
  const st = ST[stId];
  const free = [];
  st.plats.forEach((pl, k) => { if (pl.train === null && pl.resv === null && platAllowed(tr, pl, i)) free.push(k); });
  if (!free.length) return -1;
  const cls = platClass(tr.route, i);
  const parity = k => cls === -1 || st.plats[k].num % 2 === cls;
  const pax = TYPES[tr.type].pax, stop = isStop(tr, i);
  const sidings = free.filter(k => !st.plats[k].anden);
  const platforms = free.filter(k => st.plats[k].anden && parity(k));
  let p = (pax && stop ? platforms : [...sidings, ...platforms])[0];
  // a platform of the other parity only while another track stays free
  if (p === undefined) p = free.length >= 2 ? free[0] : -1;
  if (p < 0) return -1;
  const nx = after(tr, i);
  if (!nx || segBetween(stId, nx).tracks !== 1) return p;
  let waiting = 0;
  for (const pl of st.plats) {
    const id = pl.train ?? pl.resv;
    if (id === null) continue;
    const o = SIM.trains.get(id);
    if (o && after(o, o.route.indexOf(stId)) === nx) waiting++;
  }
  return waiting < st.plats.length - 1 ? p : -1;
}

function setWait(tr, reason, needsAction) {
  if (tr.waitSince === null) tr.waitSince = SIM.t;
  tr.waitReason = reason;
  tr.needsAction = !!needsAction;
}
function clearWait(tr) { tr.waitSince = null; tr.waitReason = ''; tr.needsAction = false; }

// Live delay estimate against the timetable.
function estDelay(tr) {
  if (tr.at === 'st') {
    const s = tr.sched[tr.i];
    if (tr.i === tr.route.length - 1) return tr.delay;
    const leave = Math.max(SIM.t, tr.readyAt, isStop(tr, tr.i) ? s.dep : 0);
    return leave - s.dep;
  }
  const seg = tr.seg;
  const v = Math.min(TYPES[tr.type].vmax, segV(seg)) * 0.88;
  const remaining = (seg.len - tr.pos) / v * 3600 + Math.max(0, (tr.brokenUntil || 0) - SIM.t);
  return Math.max(tr.delay, SIM.t + remaining - tr.sched[tr.i + 1].arr);
}

// --- Spawning --------------------------------------------------------------

function spawnDue() {
  const sv = SIM.services;
  while (SIM.next < sv.length && sv[SIM.next].spawnAt <= SIM.t) SIM.queue.push(sv[SIM.next++]);
  SIM.queue = SIM.queue.filter(s => !spawn(s));
}

function spawn(svc) {
  const st = ST[svc.route[0]];
  const p = autoPlat(svc, st.id, 0);
  if (p < 0) return false;
  // Occasional late start at origin, so the plan never runs perfectly.
  const late = Math.random() < 0.1 ? (1 + Math.floor(Math.random() * 5)) * 60 : 0;
  const tr = {
    id: svc.num, num: svc.num, type: svc.type, route: svc.route, stops: svc.stops, sched: svc.sched,
    axle: svc.axle, changes: svc.changes, changed: new Set(),
    i: 0, at: 'st', plat: p, seg: null, dir: 0, pos: 0, v: 0, resv: null,
    readyAt: Math.max(SIM.t, svc.sched[0].dep + late),
    hold: false, auth: false, rebase: false, brokenUntil: 0, delay: 0, yieldSince: null,
    actual: svc.route.map(() => ({ arr: null, dep: null })),
    waitSince: null, waitReason: '', needsAction: false,
    hist: [],
  };
  st.plats[p].train = tr.id;
  SIM.trains.set(tr.id, tr);
  if (late) log(`${trainLabel(tr)} retrasa su salida de ${st.name} ${late / 60} min (viajeros)`, 'warn');
  return true;
}

// --- Movement --------------------------------------------------------------

function departBlocked(tr) {
  const from = tr.route[tr.i], to = nextStation(tr);
  const seg = segBetween(from, to);
  const dir = seg.a === from ? 1 : -1;
  if (blockOcc(seg, dir, 0) !== null) return ['señal de salida en rojo: cantón ocupado', false];
  if (blockFault(seg, dir, 0) && !tr.rebase) return ['fallo de circuito de vía: autorizar rebase', true];
  if (seg.tracks === 1) {
    if (seg.lock && seg.lock !== dir) return ['vía única ocupada en sentido contrario', false];
    if (!tr.resv && autoPlat(tr, to, tr.i + 1) < 0) return [`sin vía libre para cruzar en ${ST[to].name}`, false];
  }
  return null;
}

// Automatic regulation: a slower train waits at the station when a faster one
// heading the same way would catch it before the next station. It never waits
// more than 20 minutes, and only for trains that can actually reach it.
function yieldTo(tr) {
  const from = tr.route[tr.i], to = nextStation(tr);
  const seg = segBetween(from, to);
  if (tr.yieldSince !== null && SIM.t - tr.yieldSince > 1200) return null;
  const vS = Math.min(TYPES[tr.type].vmax, segV(seg));
  const ts = seg.len / vS * 3600;
  for (const f of SIM.trains.values()) {
    if (f === tr || f.brokenUntil > SIM.t) continue;
    const vF = Math.min(TYPES[f.type].vmax, segV(seg));
    if (vF <= vS + 20) continue;
    let eta;
    if (f.at === 'st' && f.route[f.i] === from && after(f, f.i) === to) {
      eta = Math.max(0, f.readyAt - SIM.t, isStop(f, f.i) ? f.sched[f.i].dep - SIM.t : 0);
    } else if (f.at === 'line' && nextStation(f) === from && after(f, f.i + 1) === to &&
               (f.resv || freePlat(ST[from]) >= 0 || !isStop(f, f.i + 1))) {
      eta = (f.seg.len - f.pos) / Math.min(TYPES[f.type].vmax, segV(f.seg)) * 3600 +
        (isStop(f, f.i + 1) ? TYPES[f.type].dwell : 0);
    } else continue;
    if (eta < 1800 && eta + seg.len / vF * 3600 < ts) return f;
  }
  return null;
}

function depart(tr) {
  const from = tr.route[tr.i], to = nextStation(tr);
  const seg = segBetween(from, to);
  const dir = seg.a === from ? 1 : -1;
  if (seg.tracks === 1) {
    seg.lock = dir;
    if (!tr.resv) reserve(tr, to, autoPlat(tr, to, tr.i + 1));
  }
  if (tr.plat !== null) ST[from].plats[tr.plat].train = null;
  seg.count++;
  tr.at = 'line'; tr.seg = seg; tr.dir = dir; tr.pos = 0; tr.plat = null;
  setBlock(seg, dir, 0, tr.id);
  tr.actual[tr.i].dep = SIM.t;
  tr.delay = SIM.t - tr.sched[tr.i].dep;
  tr.auth = false;
  tr.yieldSince = null;
  clearWait(tr);
  if (tr.i === 0) log(`${trainLabel(tr)} sale de ${ST[from].name} hacia ${ST[tr.route[tr.route.length - 1]].name} (${fmt.delay(tr.delay)})`);
}

function reserve(tr, stId, plat) {
  ST[stId].plats[plat].resv = tr.id;
  tr.resv = { st: stId, plat };
}

function leaveSegment(tr) {
  const seg = tr.seg;
  setBlock(seg, tr.dir, seg.n - 1, null);
  seg.count--;
  if (seg.count === 0) seg.lock = 0;
  tr.rebase = false;
}

function arrive(tr) {
  leaveSegment(tr);
  tr.i++;
  const st = ST[tr.route[tr.i]];
  const p = st.plats[tr.resv.plat];
  p.resv = null;
  p.train = tr.id;
  tr.plat = tr.resv.plat;
  tr.resv = null;
  tr.at = 'st'; tr.seg = null;
  tr.actual[tr.i].arr = SIM.t;
  tr.delay = SIM.t - tr.sched[tr.i].arr;
  clearWait(tr);
  const last = tr.i === tr.route.length - 1;
  if (last) {
    tr.v = 0;
    tr.readyAt = SIM.t + TURNAROUND;
    recordArrival(tr, st);
  } else if (isStop(tr, tr.i)) {
    tr.v = 0;
    tr.readyAt = SIM.t + Math.max(45, TYPES[tr.type].dwell * (0.8 + Math.random() * 0.6));
  } else {
    tr.readyAt = SIM.t;
  }
}

function recordArrival(tr, st) {
  const ok = tr.delay <= PUNCTUAL;
  const s = SIM.stats, bt = s.byType[tr.type];
  const late = Math.max(0, tr.delay);
  s.done++; bt.done++;
  if (ok) { s.punctual++; bt.punctual++; }
  s.delaySum += late; bt.delaySum += late;
  bt.max = Math.max(bt.max, tr.delay);
  s.arrivals.push({ label: trainLabel(tr), from: ST[tr.route[0]].name, to: st.name, delay: tr.delay });
  log(`${trainLabel(tr)} llega a ${st.name} ${ok ? 'puntual' : 'con retraso'} (${fmt.delay(tr.delay)})`, ok ? 'ok' : 'warn');
}

// Dual-gauge trains stop in the changer; only one train fits at a time.
function gaugeChange(tr, st) {
  if (!tr.changes.has(st.id) || tr.changed.has(st.id)) return null;
  if (st.changerUntil > SIM.t) return 'espera turno en el cambiador de ancho';
  st.changerUntil = SIM.t + GAUGE_CHANGE;
  tr.changed.add(st.id);
  tr.axle = tr.axle === 'U' ? 'I' : 'U';
  tr.readyAt = Math.max(tr.readyAt, SIM.t + GAUGE_CHANGE);
  log(`${trainLabel(tr)} pasa por el cambiador de ancho de ${st.name} (a ${GAUGES[tr.axle].name})`);
  return 'cambio de ancho en curso';
}

function stepStation(tr) {
  const st = ST[tr.route[tr.i]];
  if (tr.i === tr.route.length - 1) {
    if (SIM.t >= tr.readyAt) finish(tr);
    return;
  }
  if (SIM.t >= tr.readyAt) {
    const g = gaugeChange(tr, st);
    if (g) { tr.v = 0; if (g.startsWith('espera')) setWait(tr, g, false); return; }
  }
  const ready = SIM.t >= tr.readyAt && (!isStop(tr, tr.i) || SIM.t >= tr.sched[tr.i].dep);
  if (!ready) { tr.v = 0; clearWait(tr); return; }
  let why = null, action = false;
  if (tr.hold) why = 'retenido por el operador';
  else if (st.mode === 'MANUAL' && !tr.auth) { why = 'espera orden de salida'; action = true; }
  else {
    const b = departBlocked(tr);
    if (b) [why, action] = b;
  }
  if (!why && st.mode === 'AUTO') {
    const f = yieldTo(tr);
    if (f) {
      if (tr.yieldSince === null) tr.yieldSince = SIM.t;
      why = `cede el paso a ${trainLabel(f)}`;
    }
  }
  if (why) { tr.v = 0; setWait(tr, why, action); return; }
  depart(tr);
}

function stepLine(tr, dt) {
  const seg = tr.seg;
  const type = TYPES[tr.type];
  let vmax = Math.min(type.vmax, segV(seg));
  const k = relBlock(seg, tr.pos);
  let stopAt = Infinity, reason = '', action = false, passing = false;
  let capAt = Infinity;  // boundary where the rebase speed limit starts

  if (blockFault(seg, tr.dir, k) && tr.rebase) vmax = Math.min(vmax, REBASE_KMH);
  if (tr.rebase && !blockFault(seg, tr.dir, k) && (k === seg.n - 1 || !blockFault(seg, tr.dir, k + 1))) tr.rebase = false;

  if (k < seg.n - 1) {
    if (blockClosed(tr, seg, tr.dir, k + 1)) {
      stopAt = (k + 1) * seg.blen - 0.2;
      const fault = blockOcc(seg, tr.dir, k + 1) === null;
      reason = fault ? 'fallo de circuito de vía: autorizar rebase' : 'señal en rojo';
      action = fault;
    } else if (blockFault(seg, tr.dir, k + 1)) {
      capAt = (k + 1) * seg.blen;
    }
  }
  if (tr.brokenUntil > SIM.t) {
    stopAt = Math.min(stopAt, Math.max(tr.pos, tr.brokenStop));
    reason = 'avería del tren';
    action = false;
  }
  const remain = seg.len - tr.pos;
  if (remain < 30) {
    const to = nextStation(tr);
    // only the first train of the queue may take a platform
    const leader = ![...SIM.trains.values()].some(o =>
      o !== tr && o.seg === seg && o.dir === tr.dir && o.pos > tr.pos && !o.resv);
    passing = !tr.resv && leader && canPass(tr);
    if (!tr.resv && !passing && leader && ST[to].mode === 'AUTO') {
      const p = autoPlat(tr, to, tr.i + 1);
      if (p >= 0) reserve(tr, to, p);
    }
    if (!tr.resv && !passing) {
      if (seg.len - 0.3 < stopAt) {
        stopAt = seg.len - 0.3;
        const manual = ST[to].mode === 'MANUAL';
        reason = manual ? (isStop(tr, tr.i + 1) ? 'señal de entrada: asignar vía' : 'señal de entrada: asignar vía o dar paso')
          : 'señal de entrada: sin vía libre';
        action = manual;
      }
    } else if (isStop(tr, tr.i + 1) && seg.len < stopAt) {
      stopAt = seg.len;
    }
  }

  const dist = Math.max(0, stopAt - tr.pos);
  let target = Math.min(vmax, Math.sqrt(2 * BRAKE_PLAN * dist * 1000) * 3.6);
  if (capAt < Infinity) {
    const vr = REBASE_KMH / 3.6;
    target = Math.min(target, Math.sqrt(vr * vr + 2 * BRAKE_PLAN * Math.max(0, capAt - tr.pos) * 1000) * 3.6);
  }
  if (tr.v < target) tr.v = Math.min(target, tr.v + type.acc * dt * 3.6);
  else tr.v = Math.max(target, tr.v - BRAKE_MAX * dt * 3.6);

  let pos = tr.pos + tr.v / 3.6 * dt / 1000;
  if (pos >= stopAt) {
    pos = stopAt;
    if (stopAt < seg.len) tr.v = 0;
  }
  if (tr.v < 1 && dist < 0.5 && reason) setWait(tr, reason, action);
  else if (tr.v >= 1) clearWait(tr);

  const nk = relBlock(seg, pos);
  if (nk !== k) {
    setBlock(seg, tr.dir, k, null);
    setBlock(seg, tr.dir, nk, tr.id);
  }
  tr.pos = pos;
  if (pos >= seg.len) {
    if (tr.resv) arrive(tr);
    else if (canPass(tr)) passThrough(tr);
    else { tr.pos = seg.len - 0.3; tr.v = 0; }
  }
}

// A non-stopping train runs through on the main track without a platform,
// as long as the line beyond the station is clear.
function canPass(tr) {
  const i = tr.i + 1, y = tr.route[i];
  if (i >= tr.route.length - 1 || isStop(tr, i) || tr.hold) return false;
  if (ST[y].mode === 'MANUAL' && !tr.auth) return false;
  const z = tr.route[i + 1];
  const seg = segBetween(y, z);
  const dir = seg.a === y ? 1 : -1;
  if (blockOcc(seg, dir, 0) !== null || blockFault(seg, dir, 0)) return false;
  if (seg.tracks === 1 && ((seg.lock && seg.lock !== dir) || autoPlat(tr, z, i + 1) < 0)) return false;
  return true;
}

function passThrough(tr) {
  leaveSegment(tr);
  tr.i++;
  tr.actual[tr.i].arr = SIM.t;
  tr.plat = null;
  depart(tr);
}

function finish(tr) {
  ST[tr.route[tr.i]].plats[tr.plat].train = null;
  SIM.trains.delete(tr.id);
  tr.doneAt = SIM.t;
  SIM.archive.push(tr);
}

function sample(tr) {
  if (tr.at === 'st') tr.hist.push({ t: SIM.t, s: tr.route[tr.i] });
  else tr.hist.push({ t: SIM.t, g: tr.seg.id, d: tr.dir, p: tr.pos });
}

// --- Incidents ---------------------------------------------------------------

const pickOne = a => a[Math.floor(Math.random() * a.length)];
const randMin = (a, b) => Math.round((a + Math.random() * (b - a))) * 60;

function addIncident(inc) {
  inc.id = ++SIM.incSeq;
  inc.t0 = SIM.t;
  SIM.incidents.push(inc);
  SIM.stats.incidents.push({ t: SIM.t, title: inc.title, where: inc.where });
  log(`${inc.title}: ${inc.text}`, inc.severe ? 'bad' : 'warn');
}

function spawnIncident() {
  const roll = Math.random();
  if (roll < 0.35) {
    const seg = pickOne(SEGS.filter(g => !g.ltv));
    if (!seg) return;
    const limit = seg.vmax >= 250 ? pickOne([80, 160, 200]) : pickOne([60, 80]);
    const cause = pickOne(['obras en la vía', 'viento fuerte', 'niebla', 'inspección de vía', 'incidencia en catenaria']);
    const until = SIM.t + randMin(60, 150);
    seg.ltv = { limit, cause, until };
    addIncident({ kind: 'ltv', seg: seg.id, until, title: 'Limitación temporal de velocidad', where: segName(seg),
      text: `${limit} km/h entre ${segName(seg)} por ${cause}, hasta las ${fmt.time(until)}` });
  } else if (roll < 0.6) {
    const seg = pickOne(SEGS);
    const track = Math.floor(Math.random() * seg.tracks);
    const free = [];
    for (let j = 1; j < seg.n - 1; j++) if (seg.occ[track][j] === null) free.push(j);
    if (!free.length) return;
    const block = pickOne(free);
    const until = SIM.t + randMin(20, 45);
    seg.fault[track][block] = until;
    addIncident({ kind: 'cv', seg: seg.id, track, block, until, severe: true, title: 'Fallo de circuito de vía',
      where: segName(seg),
      text: `cantón ${block + 1} de ${segName(seg)}${seg.tracks === 2 ? ` (vía ${track + 1})` : ''} da ocupación. Los trenes necesitan orden de rebase a ${REBASE_KMH} km/h` });
  } else if (roll < 0.85) {
    const cands = [...SIM.trains.values()].filter(t =>
      t.at === 'line' && t.v > 20 && t.pos > 5 && t.seg.len - t.pos > 15 && !(t.brokenUntil > SIM.t));
    if (!cands.length) return;
    const tr = pickOne(cands);
    const until = SIM.t + randMin(12, 35);
    tr.brokenUntil = until;
    // it coasts to a stop with its normal braking
    tr.brokenStop = Math.min(tr.seg.len - 1, tr.pos + (tr.v / 3.6) ** 2 / (2 * BRAKE_PLAN) / 1000);
    const what = pickOne(tr.type === 'MER' ? ['locomotora', 'sistema de frenado', 'acoplamiento'] : ['equipo de tracción', 'pantógrafo', 'sistema de frenado', 'puertas']);
    addIncident({ kind: 'averia', train: tr.id, until, severe: true, title: 'Avería de tren', where: segName(tr.seg),
      text: `${trainLabel(tr)} (maquinista): avería en ${what}, detenido en km ${Math.round(tr.pos)} de ${segName(tr.seg)}. Previsión ${Math.round((until - SIM.t) / 60)} min` });
  } else {
    const cands = [...SIM.trains.values()].filter(t =>
      t.at === 'st' && t.i > 0 && t.i < t.route.length - 1 && TYPES[t.type].pax && isStop(t, t.i) && t.readyAt > SIM.t);
    if (!cands.length) return;
    const tr = pickOne(cands);
    const extra = randMin(6, 14);
    tr.readyAt += extra;
    const st = ST[tr.route[tr.i]];
    addIncident({ kind: 'viajero', train: tr.id, until: tr.readyAt, title: 'Atención a viajero', where: st.name,
      text: `${trainLabel(tr)} retenido en ${st.name} por asistencia sanitaria a un viajero (+${extra / 60} min)` });
  }
}

function updateIncidents() {
  if (SIM.incidentsOn && SIM.t >= SIM.nextIncident) {
    if (SIM.incidents.length < 3) spawnIncident();
    SIM.nextIncident = SIM.t + randMin(25, 55);
  }
  for (const inc of SIM.incidents) {
    if (SIM.t < inc.until) continue;
    inc.done = true;
    if (inc.kind === 'ltv') SEGS[inc.seg].ltv = null;
    log(`Restablecido: ${inc.title.toLowerCase()} en ${inc.where}`, 'ok');
  }
  SIM.incidents = SIM.incidents.filter(i => !i.done);
}

// --- Loop ------------------------------------------------------------------

function step(dt) {
  SIM.t += dt;
  spawnDue();
  updateIncidents();
  for (const tr of [...SIM.trains.values()]) {
    if (tr.at === 'st') stepStation(tr);
    else stepLine(tr, dt);
  }
  if (SIM.t % 60 === 0) {
    for (const tr of SIM.trains.values()) sample(tr);
    const cut = SIM.t - 4 * 3600;
    SIM.archive = SIM.archive.filter(a => a.doneAt > cut);
  }
  const noMore = SIM.next >= SIM.services.length && !SIM.queue.length && !SIM.trains.size;
  if (!SIM.quiet && (SIM.t >= SIM.shift.end || noMore)) SIM.over = true;
}

function advance(seconds) {
  SIM.acc += seconds;
  while (SIM.acc >= 1 && !SIM.over) { SIM.acc -= 1; step(1); }
}

// Starts a shift. A later shift first runs the earlier part of the day
// silently, so the network is already busy when the operator takes over.
function startShift(shift, incidents) {
  resetSim({ shift, incidents });
  if (SIM.shift.start > DAY_START) {
    SIM.quiet = true;
    while (SIM.t < SIM.shift.start) step(1);
    SIM.quiet = false;
  }
  SIM.stats = newStats();
  for (const inc of SIM.incidents) SIM.stats.incidents.push({ t: inc.t0, title: inc.title, where: inc.where });
}

// --- Operator commands -------------------------------------------------------

function cmdToggleMode(stId) {
  const st = ST[stId];
  st.mode = st.mode === 'AUTO' ? 'MANUAL' : 'AUTO';
  log(`${st.name} pasa a mando ${st.mode === 'AUTO' ? 'automático' : 'manual'}`);
}

function cmdAuthorize(id) {
  const tr = SIM.trains.get(id);
  if (!tr) return;
  tr.auth = true;
  tr.hold = false;
  SIM.stats.orders++;
}

function cmdHold(id) {
  const tr = SIM.trains.get(id);
  if (!tr) return;
  tr.hold = !tr.hold;
  if (tr.hold) tr.auth = false;
  SIM.stats.orders++;
  log(`${trainLabel(tr)} ${tr.hold ? 'retenido' : 'liberado'}${tr.at === 'line' ? ' (se aplica en la próxima estación)' : ''}`);
}

function cmdRebase(id) {
  const tr = SIM.trains.get(id);
  if (!tr) return;
  tr.rebase = true;
  SIM.stats.orders++;
  log(`Orden de rebase a ${trainLabel(tr)}: marcha a la vista a ${REBASE_KMH} km/h`);
}

function cmdAssign(id, stId, plat) {
  const tr = SIM.trains.get(id);
  const st = ST[stId];
  if (!tr || tr.at !== 'line' || tr.resv || nextStation(tr) !== stId) return;
  const p = st.plats[plat];
  if (!p || p.train !== null || p.resv !== null || !platAllowed(tr, p, tr.i + 1)) return;
  reserve(tr, stId, plat);
  SIM.stats.orders++;
}

resetSim();
