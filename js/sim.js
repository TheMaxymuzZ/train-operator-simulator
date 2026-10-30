'use strict';

// ---------------------------------------------------------------------------
// Simulation: block signalling, braking, platform reservations, single-track
// direction locks and the timetable. Time is in seconds since 00:00, distances
// in km and speeds in km/h. The simulation advances in fixed 1 s steps.
// ---------------------------------------------------------------------------

const BLOCK_KM = 12;        // target length of one block (cantón)
const BRAKE_PLAN = 0.6;     // m/s² used for the braking curve
const BRAKE_MAX = 1.0;      // m/s² actual braking capacity
const SPAWN_AHEAD = 300;    // trains appear at the origin platform 5 min early
const TURNAROUND = 180;     // a train leaves the network 3 min after its last arrival
const PUNCTUAL = 300;       // arrival within 5 min counts as on time
const DAY_START = 6 * 3600;
const DAY_END = 24 * 3600;

const ST = {};
const SEGS = [];
const SEG_BY = {};

function segKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
function segBetween(a, b) { return SEG_BY[segKey(a, b)]; }

(function buildNetwork() {
  for (const [id, s] of Object.entries(STATIONS)) {
    const p = project(s.lon, s.lat);
    ST[id] = {
      id, name: s.name, x: p.x, y: p.y, mode: 'AUTO',
      plats: Array.from({ length: s.platforms }, () => ({ train: null, resv: null })),
    };
  }
  LINES.forEach(([a, b, tracks, vmax], i) => {
    const len = Math.hypot(ST[a].x - ST[b].x, ST[a].y - ST[b].y) * 1.15;
    const n = Math.max(2, Math.round(len / BLOCK_KM));
    const seg = {
      id: i, a, b, tracks, vmax, len, n, blen: len / n,
      occ: Array.from({ length: tracks }, () => Array(n).fill(null)),
      lock: 0,   // single track: direction currently granted (+1 a→b, -1 b→a)
      count: 0,  // trains currently on the line
    };
    SEGS.push(seg);
    SEG_BY[segKey(a, b)] = seg;
  });
})();

// --- Blocks ----------------------------------------------------------------

function trackOf(seg, dir) { return seg.tracks === 2 && dir === -1 ? 1 : 0; }
function relBlock(seg, pos) { return Math.min(seg.n - 1, Math.max(0, Math.floor(pos / seg.blen))); }
function absBlock(seg, dir, rel) { return dir === 1 ? rel : seg.n - 1 - rel; }
function blockOcc(seg, dir, rel) { return seg.occ[trackOf(seg, dir)][absBlock(seg, dir, rel)]; }
function setBlock(seg, dir, rel, id) { seg.occ[trackOf(seg, dir)][absBlock(seg, dir, rel)] = id; }

// Aspect of the signal that protects block `rel` for trains running in `dir`.
function aspect(seg, dir, rel) {
  if (seg.tracks === 1 && seg.lock && seg.lock !== dir) return 'R';
  if (blockOcc(seg, dir, rel) !== null) return 'R';
  if (rel + 1 < seg.n && blockOcc(seg, dir, rel + 1) !== null) return 'A';
  return 'V';
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
      const stops = new Set(p.stops || p.route);
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
          const dep = last ? null : stops.has(route[i]) ? arr + Math.max(60, TYPES[p.type].dwell) : arr;
          sched.push({ arr, dep });
          t = dep ?? arr;
        }
        out.push({ num, type: p.type, route, stops, sched, spawnAt: t0 - SPAWN_AHEAD });
      }
    }
  }
  out.sort((a, b) => a.spawnAt - b.spawnAt);
  return out;
}

// --- State -----------------------------------------------------------------

let SIM;
const listeners = { log: () => {} };

function resetSim() {
  for (const s of Object.values(ST)) for (const p of s.plats) { p.train = null; p.resv = null; }
  for (const g of SEGS) { for (const o of g.occ) o.fill(null); g.lock = 0; g.count = 0; }
  SIM = {
    t: DAY_START - 600,
    acc: 0,
    services: buildServices(),
    next: 0,          // index of the next service to put on the network
    queue: [],        // services waiting for a free platform at their origin
    trains: new Map(),
    archive: [],
    stats: { done: 0, punctual: 0, delaySum: 0 },
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

function log(msg, cls) { listeners.log(fmt.time(SIM.t), msg, cls); }

// --- Helpers ---------------------------------------------------------------

function freePlat(st) { return st.plats.findIndex(p => p.train === null && p.resv === null); }

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

// Free platform for an automatic reservation. Odd trains prefer odd tracks (V1,
// V3...) and even trains even tracks, so the two directions rarely block each
// other inside a station. Next to a single-track section, trains waiting to
// enter it may fill at most all but one platform, so a train coming the other
// way can always get in and the section never gridlocks.
function autoPlat(tr, stId, i) {
  const st = ST[stId];
  const cls = platClass(tr.route, i);
  const free = [];
  st.plats.forEach((pl, k) => { if (pl.train === null && pl.resv === null) free.push(k); });
  let p = free.find(k => cls === -1 || (k + 1) % 2 === cls);
  // a track of the other parity only while another one stays free
  if (p === undefined) p = free.length >= 2 ? free[0] : -1;
  if (p < 0) return -1;
  const nx = after(tr, i);
  if (!nx || segBetween(stId, nx).tracks !== 1) return p;
  let waiting = 0;
  for (const pl of st.plats) {
    const id = pl.train ?? pl.resv;
    if (id === null) continue;
    const o = SIM.trains.get(id);
    if (!o) continue;
    const oi = o.route.indexOf(stId);
    if (after(o, oi) === nx) waiting++;
  }
  return waiting < st.plats.length - 1 ? p : -1;
}
function nextStation(tr) { return tr.route[tr.i + 1]; }
function isStop(tr, i) { return i === tr.route.length - 1 || tr.stops.has(tr.route[i]); }
function trainLabel(tr) { return tr.type + ' ' + fmt.num(tr.num); }

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
  const v = Math.min(TYPES[tr.type].vmax, seg.vmax) * 0.88;
  const remaining = (seg.len - tr.pos) / v * 3600;
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
  const p = autoPlat({ route: svc.route }, st.id, 0);
  if (p < 0) return false;
  // Occasional late start at origin, so the plan never runs perfectly.
  const late = Math.random() < 0.1 ? (1 + Math.floor(Math.random() * 5)) * 60 : 0;
  const tr = {
    id: svc.num, num: svc.num, type: svc.type, route: svc.route, stops: svc.stops, sched: svc.sched,
    i: 0, at: 'st', plat: p, seg: null, dir: 0, pos: 0, v: 0, resv: null,
    readyAt: Math.max(SIM.t, svc.sched[0].dep + late),
    hold: false, auth: false, delay: 0, yieldSince: null,
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
  if (blockOcc(seg, dir, 0) !== null) return 'señal de salida en rojo: cantón ocupado';
  if (seg.tracks === 1) {
    if (seg.lock && seg.lock !== dir) return 'vía única ocupada en sentido contrario';
    if (!tr.resv && autoPlat(tr, to, tr.i + 1) < 0) return `sin vía libre para cruzar en ${ST[to].name}`;
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
  const vS = Math.min(TYPES[tr.type].vmax, seg.vmax);
  const ts = seg.len / vS * 3600;
  for (const f of SIM.trains.values()) {
    if (f === tr) continue;
    const vF = Math.min(TYPES[f.type].vmax, seg.vmax);
    if (vF <= vS + 20) continue;
    let eta;
    if (f.at === 'st' && f.route[f.i] === from && after(f, f.i) === to) {
      eta = Math.max(0, f.readyAt - SIM.t, isStop(f, f.i) ? f.sched[f.i].dep - SIM.t : 0);
    } else if (f.at === 'line' && nextStation(f) === from && after(f, f.i + 1) === to &&
               (f.resv || freePlat(ST[from]) >= 0 || !isStop(f, f.i + 1))) {
      eta = (f.seg.len - f.pos) / Math.min(TYPES[f.type].vmax, f.seg.vmax) * 3600 +
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

function arrive(tr) {
  const seg = tr.seg;
  setBlock(seg, tr.dir, seg.n - 1, null);
  seg.count--;
  if (seg.count === 0) seg.lock = 0;
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
    const ok = tr.delay <= PUNCTUAL;
    SIM.stats.done++;
    if (ok) SIM.stats.punctual++;
    SIM.stats.delaySum += Math.max(0, tr.delay);
    log(`${trainLabel(tr)} llega a ${st.name} ${ok ? 'puntual' : 'con retraso'} (${fmt.delay(tr.delay)})`, ok ? 'ok' : 'warn');
  } else if (isStop(tr, tr.i)) {
    tr.v = 0;
    tr.readyAt = SIM.t + Math.max(45, TYPES[tr.type].dwell * (0.8 + Math.random() * 0.6));
  } else {
    tr.readyAt = SIM.t;
  }
}

function stepStation(tr) {
  const st = ST[tr.route[tr.i]];
  if (tr.i === tr.route.length - 1) {
    if (SIM.t >= tr.readyAt) finish(tr);
    return;
  }
  const ready = SIM.t >= tr.readyAt && (!isStop(tr, tr.i) || SIM.t >= tr.sched[tr.i].dep);
  if (!ready) { tr.v = 0; clearWait(tr); return; }
  let why = null, action = false;
  if (tr.hold) why = 'retenido por el operador';
  else if (st.mode === 'MANUAL' && !tr.auth) { why = 'espera orden de salida'; action = true; }
  else why = departBlocked(tr);
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
  const vmax = Math.min(type.vmax, seg.vmax);
  const k = relBlock(seg, tr.pos);
  let stopAt = Infinity, reason = '', action = false, passing = false;

  if (k < seg.n - 1 && blockOcc(seg, tr.dir, k + 1) !== null) {
    stopAt = (k + 1) * seg.blen - 0.2;
    reason = 'señal en rojo';
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
  const vCurve = Math.sqrt(2 * BRAKE_PLAN * dist * 1000) * 3.6;
  const target = Math.min(vmax, vCurve);
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
  if (blockOcc(seg, dir, 0) !== null) return false;
  if (seg.tracks === 1 && ((seg.lock && seg.lock !== dir) || autoPlat(tr, z, i + 1) < 0)) return false;
  return true;
}

function passThrough(tr) {
  const seg = tr.seg;
  setBlock(seg, tr.dir, seg.n - 1, null);
  seg.count--;
  if (seg.count === 0) seg.lock = 0;
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

function step(dt) {
  SIM.t += dt;
  spawnDue();
  for (const tr of [...SIM.trains.values()]) {
    if (tr.at === 'st') stepStation(tr);
    else stepLine(tr, dt);
  }
  if (SIM.t % 60 === 0) {
    for (const tr of SIM.trains.values()) sample(tr);
    const cut = SIM.t - 4 * 3600;
    SIM.archive = SIM.archive.filter(a => a.doneAt > cut);
  }
  if (!SIM.over && SIM.next >= SIM.services.length && !SIM.queue.length && !SIM.trains.size) SIM.over = true;
  if (SIM.t >= DAY_END) SIM.over = true;
}

function advance(seconds) {
  SIM.acc += seconds;
  while (SIM.acc >= 1 && !SIM.over) { SIM.acc -= 1; step(1); }
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
}

function cmdHold(id) {
  const tr = SIM.trains.get(id);
  if (!tr) return;
  tr.hold = !tr.hold;
  if (tr.hold) tr.auth = false;
  log(`${trainLabel(tr)} ${tr.hold ? 'retenido' : 'liberado'}${tr.at === 'line' ? ' (se aplica en la próxima estación)' : ''}`);
}

function cmdAssign(id, stId, plat) {
  const tr = SIM.trains.get(id);
  const st = ST[stId];
  if (!tr || tr.at !== 'line' || tr.resv || nextStation(tr) !== stId) return;
  const p = st.plats[plat];
  if (!p || p.train !== null || p.resv !== null) return;
  reserve(tr, stId, plat);
}

resetSim();
