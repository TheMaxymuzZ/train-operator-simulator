'use strict';

// ---------------------------------------------------------------------------
// Interface: map rendering, camera, side panel, train graph and controls.
// ---------------------------------------------------------------------------

const C = {
  bg: '#070b10',
  land: '#0a1118',
  coast: '#18232e',
  grid: '#0d141b',
  hs: '#2f5068',
  conv: '#56616d',
  text: '#b9c7d4',
  dim: '#5b6b7b',
  bright: '#e8f1f8',
  accent: '#4cf3a0',
  amber: '#ffb547',
  red: '#ff5c5c',
  sigV: '#4cf3a0',
  sigA: '#ffb547',
  sigR: '#ff5c5c',
};
const FONT = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

const $ = id => document.getElementById(id);
const mapEl = $('map');
const mctx = mapEl.getContext('2d');
const chartEl = $('chart');
const cctx = chartEl.getContext('2d');

let speed = 10;
let running = false;
let selected = null;   // { kind: 'st' | 'tr', id }
let follow = false;
let W = 0, H = 0;
const cam = { x: 0, y: 0, s: 1 };
const OUTLINE_XY = OUTLINE.map(([lon, lat]) => project(lon, lat));

// --- Camera ----------------------------------------------------------------

function sizeCanvas(el, ctx) {
  const dpr = window.devicePixelRatio || 1;
  const r = el.getBoundingClientRect();
  el.width = Math.max(1, Math.round(r.width * dpr));
  el.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return r;
}

function resize() {
  const first = W === 0;
  const r = sizeCanvas(mapEl, mctx);
  W = r.width; H = r.height;
  sizeCanvas(chartEl, cctx);
  if (first) fitBox(SECTORS['ESPAÑA']);
}

function fitBox([lon0, lat0, lon1, lat1]) {
  const a = project(lon0, lat1), b = project(lon1, lat0);
  cam.x = (a.x + b.x) / 2;
  cam.y = (a.y + b.y) / 2;
  cam.s = Math.min(W / (b.x - a.x), H / (b.y - a.y)) * 0.96;
}

function toScreen(p) { return { x: (p.x - cam.x) * cam.s + W / 2, y: (p.y - cam.y) * cam.s + H / 2 }; }
function toWorld(sx, sy) { return { x: (sx - W / 2) / cam.s + cam.x, y: (sy - H / 2) / cam.s + cam.y }; }

function zoomAt(sx, sy, f) {
  const w = toWorld(sx, sy);
  cam.s = Math.min(30, Math.max(0.25, cam.s * f));
  cam.x = w.x - (sx - W / 2) / cam.s;
  cam.y = w.y - (sy - H / 2) / cam.s;
}

// --- Geometry --------------------------------------------------------------

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function trackOff() { return clamp(cam.s * 1.3, 1.5, 6); }

function segScreen(seg) {
  const pa = toScreen(ST[seg.a]), pb = toScreen(ST[seg.b]);
  const L = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
  return { pa, pb, nx: -(pb.y - pa.y) / L, ny: (pb.x - pa.x) / L };
}

// Screen point at a fraction of the segment (from a), shifted sideways.
function segPoint(g, frac, off) {
  return {
    x: g.pa.x + (g.pb.x - g.pa.x) * frac + g.nx * off,
    y: g.pa.y + (g.pb.y - g.pa.y) * frac + g.ny * off,
  };
}

function trainPoint(tr) {
  const seg = tr.seg;
  const g = segScreen(seg);
  const fromA = tr.dir === 1 ? tr.pos : seg.len - tr.pos;
  const off = seg.tracks === 2 ? (tr.dir === 1 ? trackOff() : -trackOff()) : 0;
  return segPoint(g, fromA / seg.len, off);
}

function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

// --- Map drawing -----------------------------------------------------------

function drawGrid() {
  mctx.fillStyle = C.grid;
  for (let x = 16; x < W; x += 32) for (let y = 16; y < H; y += 32) mctx.fillRect(x, y, 1.5, 1.5);
}

function drawOutline() {
  mctx.beginPath();
  OUTLINE_XY.forEach((p, i) => {
    const s = toScreen(p);
    if (i) mctx.lineTo(s.x, s.y); else mctx.moveTo(s.x, s.y);
  });
  mctx.closePath();
  mctx.fillStyle = C.land;
  mctx.fill();
  mctx.strokeStyle = C.coast;
  mctx.lineWidth = 1;
  mctx.stroke();
}

function drawLines() {
  const off = trackOff();
  for (const seg of SEGS) {
    const g = segScreen(seg);
    const offs = seg.tracks === 2 ? [off, -off] : [0];
    mctx.lineCap = 'butt';
    offs.forEach((o, ti) => {
      mctx.strokeStyle = seg.vmax >= 250 ? C.hs : C.conv;
      mctx.lineWidth = seg.tracks === 2 ? 1.3 : 1.6;
      line(mctx, segPoint(g, 0, o), segPoint(g, 1, o));
      // occupied blocks light up in the colour of the train type
      seg.occ[ti].forEach((id, j) => {
        if (id === null) return;
        const tr = SIM.trains.get(id);
        mctx.strokeStyle = tr ? TYPES[tr.type].color : C.red;
        mctx.globalAlpha = 0.55;
        mctx.lineWidth = 3;
        line(mctx, segPoint(g, j / seg.n, o), segPoint(g, (j + 1) / seg.n, o));
        mctx.globalAlpha = 1;
      });
    });
    if (cam.s >= 1.6) {
      mctx.strokeStyle = C.dim;
      mctx.lineWidth = 1;
      const tk = seg.tracks === 2 ? off + 3 : 3;
      for (let j = 1; j < seg.n; j++) line(mctx, segPoint(g, j / seg.n, -tk), segPoint(g, j / seg.n, tk));
    }
    if (cam.s >= 2.6) drawSignals(seg, g, off);
  }
}

function drawSignals(seg, g, off) {
  for (const dir of [1, -1]) {
    const side = (seg.tracks === 2 ? off : 0) + 5;
    for (let r = 1; r < seg.n; r++) {
      const fromA = dir === 1 ? r * seg.blen : seg.len - r * seg.blen;
      const p = segPoint(g, fromA / seg.len, dir === 1 ? side : -side);
      const a = aspect(seg, dir, r);
      mctx.fillStyle = a === 'V' ? C.sigV : a === 'A' ? C.sigA : C.sigR;
      mctx.beginPath();
      mctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      mctx.fill();
    }
  }
}

function stationAlert(stId) {
  for (const tr of SIM.trains.values()) {
    if (!tr.needsAction) continue;
    if (tr.at === 'st' && tr.route[tr.i] === stId) return true;
    if (tr.at === 'line' && nextStation(tr) === stId) return true;
  }
  return false;
}

function drawStations(pulse) {
  const cell = clamp(cam.s * 2.2, 3, 8);
  const detailed = cam.s >= 1.6;
  mctx.textBaseline = 'alphabetic';
  for (const st of Object.values(ST)) {
    const p = toScreen(st);
    if (p.x < -80 || p.y < -40 || p.x > W + 80 || p.y > H + 40) continue;
    const manual = st.mode === 'MANUAL';
    mctx.fillStyle = C.bg;
    mctx.fillRect(p.x - 4, p.y - 4, 8, 8);
    mctx.strokeStyle = manual ? C.bright : '#7d93a8';
    mctx.lineWidth = manual ? 2 : 1.2;
    mctx.strokeRect(p.x - 4, p.y - 4, 8, 8);

    mctx.font = `${detailed ? 11 : 10}px ${FONT}`;
    mctx.textAlign = 'left';
    mctx.fillStyle = manual ? C.bright : C.text;
    const label = (detailed ? st.name.toUpperCase() : st.id) + (manual ? ' ·M' : '');
    mctx.fillText(label, p.x + 8, p.y - 6);

    st.plats.forEach((pl, i) => {
      const x = p.x + 8 + i * (cell + 2), y = p.y - 1;
      const occ = pl.train !== null ? SIM.trains.get(pl.train) : null;
      const res = pl.resv !== null ? SIM.trains.get(pl.resv) : null;
      if (occ) {
        mctx.fillStyle = TYPES[occ.type].color;
        mctx.fillRect(x, y, cell, cell);
      } else {
        mctx.strokeStyle = res ? TYPES[res.type].color : '#2a3644';
        mctx.lineWidth = 1;
        mctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      }
    });

    if (stationAlert(st.id)) {
      mctx.strokeStyle = C.red;
      mctx.globalAlpha = 0.4 + 0.6 * pulse;
      mctx.lineWidth = 1.5;
      mctx.beginPath();
      mctx.arc(p.x, p.y, 9 + 3 * pulse, 0, Math.PI * 2);
      mctx.stroke();
      mctx.globalAlpha = 1;
    }
    const selTrainHere = selected && selected.kind === 'tr' && SIM.trains.get(selected.id)?.at === 'st' &&
      SIM.trains.get(selected.id).route[SIM.trains.get(selected.id).i] === st.id;
    if ((selected && selected.kind === 'st' && selected.id === st.id) || selTrainHere) {
      mctx.strokeStyle = C.accent;
      mctx.lineWidth = 1.5;
      mctx.strokeRect(p.x - 8, p.y - 8, 16, 16);
    }
  }
}

function drawTrains(pulse) {
  const r = clamp(cam.s * 1.4, 2.5, 5);
  const labels = cam.s >= 2.4;
  mctx.font = `10px ${FONT}`;
  mctx.textAlign = 'left';
  for (const tr of SIM.trains.values()) {
    if (tr.at !== 'line') continue;
    const p = trainPoint(tr);
    if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) continue;
    const isSel = selected && selected.kind === 'tr' && selected.id === tr.id;
    mctx.fillStyle = TYPES[tr.type].color;
    mctx.beginPath();
    mctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    mctx.fill();
    const stuck = tr.waitSince !== null && (tr.needsAction || SIM.t - tr.waitSince > 600);
    if (stuck) {
      mctx.strokeStyle = C.red;
      mctx.globalAlpha = 0.4 + 0.6 * pulse;
      mctx.lineWidth = 1.5;
      mctx.beginPath();
      mctx.arc(p.x, p.y, r + 3 + 2 * pulse, 0, Math.PI * 2);
      mctx.stroke();
      mctx.globalAlpha = 1;
    }
    if (isSel) {
      mctx.strokeStyle = C.bright;
      mctx.lineWidth = 1.5;
      mctx.beginPath();
      mctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      mctx.stroke();
    }
    if (labels || isSel) {
      const d = estDelay(tr);
      mctx.fillStyle = d > PUNCTUAL ? C.amber : C.text;
      mctx.fillText(`${trainLabel(tr)} ${fmt.delay(d)}`, p.x + r + 4, p.y + r + 10);
    }
  }
}

function drawMap(now) {
  const pulse = (Math.sin(now / 180) + 1) / 2;
  mctx.fillStyle = C.bg;
  mctx.fillRect(0, 0, W, H);
  drawGrid();
  drawOutline();
  drawLines();
  drawStations(pulse);
  drawTrains(pulse);
  if (running && speed === 0) {
    mctx.fillStyle = C.amber;
    mctx.font = `12px ${FONT}`;
    mctx.textAlign = 'right';
    mctx.fillText('■ SIMULACIÓN EN PAUSA', W - 14, H - 14);
  }
}

// --- Picking & input --------------------------------------------------------

function pick(sx, sy) {
  let best = null, bd = 12;
  for (const tr of SIM.trains.values()) {
    if (tr.at !== 'line') continue;
    const p = trainPoint(tr);
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d < bd) { bd = d; best = { kind: 'tr', id: tr.id }; }
  }
  if (best) return best;
  bd = 16;
  for (const st of Object.values(ST)) {
    const p = toScreen(st);
    // the platform cells to the right of the marker count too
    const cx = clamp(sx, p.x, p.x + 8 + st.plats.length * 10);
    const d = Math.hypot(cx - sx, p.y - sy);
    if (d < bd) { bd = d; best = { kind: 'st', id: st.id }; }
  }
  return best;
}

const ptrs = new Map();
let drag = null, pinch = null;

function localXY(e) {
  const r = mapEl.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

mapEl.addEventListener('pointerdown', e => {
  mapEl.setPointerCapture(e.pointerId);
  const p = localXY(e);
  ptrs.set(e.pointerId, p);
  if (ptrs.size === 1) drag = { x: p.x, y: p.y, cx: cam.x, cy: cam.y, moved: false };
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.s };
    drag = null;
  }
});

mapEl.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  const p = localXY(e);
  ptrs.set(e.pointerId, p);
  if (pinch && ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.s * d / pinch.d / cam.s);
    follow = false;
  } else if (drag) {
    const dx = p.x - drag.x, dy = p.y - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) {
      cam.x = drag.cx - dx / cam.s;
      cam.y = drag.cy - dy / cam.s;
      follow = false;
      mapEl.style.cursor = 'grabbing';
    }
  }
});

function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  if (drag && !drag.moved && ptrs.size === 1) {
    const p = localXY(e);
    select(pick(p.x, p.y));
  }
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (ptrs.size === 0) { drag = null; mapEl.style.cursor = 'grab'; }
}
mapEl.addEventListener('pointerup', endPointer);
mapEl.addEventListener('pointercancel', endPointer);

mapEl.addEventListener('wheel', e => {
  e.preventDefault();
  const p = localXY(e);
  zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
  follow = false;
}, { passive: false });

function select(sel) {
  selected = sel;
  follow = false;
  renderDetail(true);
}

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  if (e.key === ' ') { e.preventDefault(); setSpeed(speed === 0 ? lastSpeed : 0); }
  if (e.key === 'Escape') select(null);
});

// --- Speed & sectors -----------------------------------------------------------

let lastSpeed = 10;
function setSpeed(v) {
  if (v > 0) lastSpeed = v;
  speed = v;
  for (const b of $('speed').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.speed) === v);
}
$('speed').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) setSpeed(Number(b.dataset.speed));
});

for (const name of Object.keys(SECTORS)) {
  const b = document.createElement('button');
  b.textContent = name;
  b.addEventListener('click', () => { fitBox(SECTORS[name]); follow = false; });
  $('sectors').appendChild(b);
}

// --- Side panel ----------------------------------------------------------------

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dot = type => `<span class="tag" style="background:${TYPES[type].color}"></span>`;
const delayCls = d => d > 900 ? 'vlate' : d > PUNCTUAL ? 'late' : 'ok';

function trainStatus(tr) {
  if (tr.waitSince !== null) {
    const mins = Math.floor((SIM.t - tr.waitSince) / 60);
    return `<span class="${tr.needsAction ? 'alert' : 'late'}">${esc(tr.waitReason)} · ${mins} min</span>`;
  }
  if (tr.at === 'line') return `${Math.round(tr.v)} km/h → ${esc(ST[nextStation(tr)].name)}`;
  if (tr.i === tr.route.length - 1) return 'fin de trayecto';
  if (tr.hold) return '<span class="late">retenido</span>';
  return `sale ${fmt.time(Math.max(tr.readyAt, tr.sched[tr.i].dep ?? 0))}`;
}

function alertsList() {
  const list = [...SIM.trains.values()]
    .filter(tr => tr.waitSince !== null && (tr.needsAction || SIM.t - tr.waitSince > 600))
    .sort((a, b) => a.waitSince - b.waitSince);
  return list;
}

function detailNone() {
  let h = `<div class="d-title">PUESTO DE MANDO</div>
    <div class="d-note">Selecciona una estación o un tren en el mapa. Las estaciones con borde blanco (·M) están en mando manual.</div>
    <div class="d-sec">AVISOS</div>`;
  const al = alertsList();
  if (!al.length) h += '<div class="d-note">Sin avisos.</div>';
  for (const tr of al.slice(0, 14)) {
    const where = tr.at === 'st' ? ST[tr.route[tr.i]].name : `antes de ${ST[nextStation(tr)].name}`;
    h += `<div class="d-row click" data-act="selTr" data-id="${tr.id}">${dot(tr.type)}
      <span class="grow">${trainLabel(tr)} · ${esc(where)}<br>${trainStatus(tr)}</span></div>`;
  }
  return h;
}

function detailStation(st) {
  const manual = st.mode === 'MANUAL';
  let h = `<div class="d-title">${esc(st.name.toUpperCase())} <span class="dim">${st.id}</span></div>
    <div class="d-sub">${st.plats.length} vías · mando ${manual ? 'manual' : 'automático'}</div>
    <div class="d-row">
      <button data-act="mode" data-st="${st.id}" class="${manual ? 'on' : ''}">MANUAL</button>
      <button data-act="mode" data-st="${st.id}" class="${manual ? '' : 'on'}">AUTO</button>
    </div>
    <div class="d-sec">VÍAS</div>`;
  st.plats.forEach((p, i) => {
    h += `<div class="d-row"><span class="plat">V${i + 1}</span>`;
    const tr = p.train !== null ? SIM.trains.get(p.train) : null;
    const rs = p.resv !== null ? SIM.trains.get(p.resv) : null;
    if (tr) {
      const last = tr.i === tr.route.length - 1;
      const dest = ST[tr.route[tr.route.length - 1]].name;
      h += `${dot(tr.type)}<span class="grow" data-act="selTr" data-id="${tr.id}" style="cursor:pointer">${trainLabel(tr)} → ${esc(dest)}<br>${trainStatus(tr)}</span>`;
      if (!last) {
        if (manual) h += `<button data-act="auth" data-id="${tr.id}" ${tr.auth ? 'class="on"' : ''}>SALIDA</button>`;
        h += `<button data-act="hold" data-id="${tr.id}" ${tr.hold ? 'class="warn"' : ''}>${tr.hold ? 'LIBERAR' : 'RETENER'}</button>`;
      }
    } else if (rs) {
      h += `${dot(rs.type)}<span class="grow dim">reservada · ${trainLabel(rs)}</span>`;
    } else {
      h += '<span class="grow dim">libre</span>';
    }
    h += '</div>';
  });

  const incoming = [...SIM.trains.values()]
    .filter(tr => tr.at === 'line' && nextStation(tr) === st.id)
    .sort((a, b) => (a.seg.len - a.pos) - (b.seg.len - b.pos));
  h += '<div class="d-sec">LLEGANDO</div>';
  if (!incoming.length) h += '<div class="d-note">Ningún tren en aproximación.</div>';
  const free = st.plats.map((p, i) => (p.train === null && p.resv === null ? i : -1)).filter(i => i >= 0);
  for (const tr of incoming) {
    const km = Math.round(tr.seg.len - tr.pos);
    const from = ST[tr.route[tr.i]].id;
    h += `<div class="d-row">${dot(tr.type)}<span class="grow" data-act="selTr" data-id="${tr.id}" style="cursor:pointer">${trainLabel(tr)} desde ${from} · ${km} km · ${tr.stops.has(st.id) || tr.i + 1 === tr.route.length - 1 ? 'para' : 'pasa'}<br>${trainStatus(tr)}</span>`;
    if (tr.resv) h += `<span class="dim">V${tr.resv.plat + 1}</span>`;
    else if (manual) {
      h += '<div class="btns">';
      for (const i of free) h += `<button data-act="assign" data-id="${tr.id}" data-st="${st.id}" data-plat="${i}">V${i + 1}</button>`;
      if (!isStop(tr, tr.i + 1)) h += `<button data-act="auth" data-id="${tr.id}" ${tr.auth ? 'class="on"' : ''}>PASO</button>`;
      h += '</div>';
    }
    h += '</div>';
  }

  const upcoming = [...SIM.queue, ...SIM.services.slice(SIM.next, SIM.next + 400)]
    .filter(s => s.route[0] === st.id).slice(0, 4);
  h += '<div class="d-sec">PRÓXIMOS ORÍGENES</div>';
  if (!upcoming.length) h += '<div class="d-note">Sin más salidas hoy.</div>';
  for (const s of upcoming) {
    h += `<div class="d-row">${dot(s.type)}<span class="grow">${fmt.time(s.sched[0].dep)} ${s.type} ${fmt.num(s.num)} → ${esc(ST[s.route[s.route.length - 1]].name)}</span></div>`;
  }
  return h;
}

function detailTrain(tr) {
  const d = estDelay(tr);
  const origin = ST[tr.route[0]].name, dest = ST[tr.route[tr.route.length - 1]].name;
  let where;
  if (tr.at === 'st') where = `${ST[tr.route[tr.i]].name}, vía ${tr.plat + 1}`;
  else where = `${ST[tr.route[tr.i]].id} → ${ST[nextStation(tr)].id}, km ${Math.round(tr.pos)} de ${Math.round(tr.seg.len)} (${tr.seg.tracks === 1 ? 'vía única' : 'doble vía'})`;
  const atManual = tr.at === 'st' && ST[tr.route[tr.i]].mode === 'MANUAL' && tr.i < tr.route.length - 1;
  let h = `<div class="d-title">${dot(tr.type)} ${trainLabel(tr)}</div>
    <div class="d-sub">${TYPES[tr.type].name} · ${esc(origin)} → ${esc(dest)}</div>
    <div class="d-row"><span class="grow">${esc(where)}<br>${trainStatus(tr)}</span></div>
    <div class="d-row">Retraso estimado <b class="${delayCls(d)}">${fmt.delay(d)}</b></div>
    <div class="d-row">
      <button data-act="hold" data-id="${tr.id}" ${tr.hold ? 'class="warn"' : ''}>${tr.hold ? 'LIBERAR' : 'RETENER'}</button>
      ${atManual ? `<button data-act="auth" data-id="${tr.id}" ${tr.auth ? 'class="on"' : ''}>SALIDA</button>` : ''}
      <button data-act="follow" ${follow ? 'class="on"' : ''}>SEGUIR</button>
    </div>
    <div class="d-sec">ITINERARIO</div>
    <table class="route"><tr class="dim"><td></td><td>prev.</td><td>real</td><td></td></tr>`;
  tr.route.forEach((sid, i) => {
    const s = tr.sched[i], a = tr.actual[i];
    const stop = isStop(tr, i) || i === 0;
    const plan = i === 0 ? s.dep : s.arr;
    const real = i === 0 ? a.dep : a.arr;
    const cls = i < tr.i || (i === tr.i && tr.at === 'line') ? 'past' : i === tr.i ? 'cur' : '';
    const dl = real != null ? `<span class="${delayCls(real - plan)}">${fmt.delay(real - plan)}</span>` : '';
    h += `<tr class="${cls}"><td${stop ? '' : ' class="pass"'}>${esc(ST[sid].name)}${stop ? '' : ' (pasa)'}</td>
      <td>${fmt.time(plan)}</td><td>${fmt.time(real)}</td><td>${dl}</td></tr>`;
  });
  return h + '</table>';
}

let lastDetail = '';
function renderDetail(force) {
  let h;
  if (selected && selected.kind === 'st') h = detailStation(ST[selected.id]);
  else if (selected && selected.kind === 'tr') {
    const tr = SIM.trains.get(selected.id);
    if (tr) h = detailTrain(tr);
    else { selected = null; h = detailNone(); }
  } else h = detailNone();
  if (force || h !== lastDetail) { $('detail').innerHTML = h; lastDetail = h; }
}

// pointerdown so a click is never lost to a panel refresh
$('detail').addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = Number(el.dataset.id);
  switch (el.dataset.act) {
    case 'mode': if (ST[el.dataset.st].mode !== (el.textContent.trim())) cmdToggleMode(el.dataset.st); break;
    case 'auth': cmdAuthorize(id); break;
    case 'hold': cmdHold(id); break;
    case 'assign': cmdAssign(id, el.dataset.st, Number(el.dataset.plat)); break;
    case 'selTr': selected = { kind: 'tr', id }; follow = false; break;
    case 'follow': follow = !follow; break;
  }
  renderDetail(true);
});

// --- Train graph ---------------------------------------------------------------

for (const name of Object.keys(CORRIDORS)) {
  const o = document.createElement('option');
  o.value = o.textContent = name;
  $('corridor').appendChild(o);
}
$('corridor').addEventListener('change', drawChart);

function drawChart() {
  const r = chartEl.getBoundingClientRect();
  const cw = r.width, ch = r.height;
  cctx.fillStyle = C.bg;
  cctx.fillRect(0, 0, cw, ch);
  const corr = CORRIDORS[$('corridor').value];
  const idx = {}, km = [0];
  corr.forEach((s, i) => { idx[s] = i; if (i) km.push(km[i - 1] + segBetween(corr[i - 1], s).len); });
  const total = km[km.length - 1];
  const L = 34, R = 6, T = 8, B = 16;
  const t0 = SIM.t - 90 * 60, t1 = SIM.t + 60 * 60;
  const X = t => L + (t - t0) / (t1 - t0) * (cw - L - R);
  const Y = k => T + k / total * (ch - T - B);

  cctx.font = `10px ${FONT}`;
  cctx.lineWidth = 1;
  cctx.textBaseline = 'middle';
  cctx.textAlign = 'left';
  corr.forEach((s, i) => {
    cctx.strokeStyle = '#18222c';
    line(cctx, { x: L, y: Y(km[i]) }, { x: cw - R, y: Y(km[i]) });
    cctx.fillStyle = C.dim;
    cctx.fillText(s, 2, Y(km[i]));
  });
  cctx.textAlign = 'center';
  cctx.textBaseline = 'alphabetic';
  for (let h = Math.ceil(t0 / 1800) * 1800; h < t1; h += 1800) {
    cctx.strokeStyle = h % 3600 ? '#0f171e' : '#18222c';
    line(cctx, { x: X(h), y: T }, { x: X(h), y: ch - B });
    if (h % 3600 === 0) { cctx.fillStyle = C.dim; cctx.fillText(fmt.time(h), X(h), ch - 3); }
  }

  const all = [...SIM.archive, ...SIM.trains.values()];
  cctx.save();
  cctx.beginPath();
  cctx.rect(L, 0, cw - L - R, ch);
  cctx.clip();
  for (const tr of all) {
    const color = TYPES[tr.type].color;
    // planned path, dashed
    cctx.setLineDash([3, 3]);
    cctx.strokeStyle = color;
    cctx.globalAlpha = 0.35;
    cctx.beginPath();
    let prev = null;
    tr.route.forEach((sid, i) => {
      if (!(sid in idx)) { prev = null; return; }
      const s = tr.sched[i];
      const ta = s.arr ?? s.dep, td = s.dep ?? s.arr;
      const y = Y(km[idx[sid]]);
      if (prev !== null && Math.abs(prev - idx[sid]) === 1) cctx.lineTo(X(ta), y); else cctx.moveTo(X(ta), y);
      cctx.lineTo(X(td), y);
      prev = idx[sid];
    });
    cctx.stroke();
    // real path, solid
    cctx.setLineDash([]);
    cctx.globalAlpha = 1;
    cctx.lineWidth = 1.4;
    cctx.beginPath();
    let pen = false;
    const pts = tr.hist.slice();
    if (SIM.trains.has(tr.id)) {
      pts.push(tr.at === 'st' ? { t: SIM.t, s: tr.route[tr.i] } : { t: SIM.t, g: tr.seg.id, d: tr.dir, p: tr.pos });
    }
    for (const smp of pts) {
      const y = sampleY(smp, idx, km);
      if (y === null || smp.t < t0 - 600) { pen = false; continue; }
      if (pen) cctx.lineTo(X(smp.t), Y(y)); else cctx.moveTo(X(smp.t), Y(y));
      pen = true;
    }
    cctx.stroke();
    cctx.lineWidth = 1;
  }
  cctx.restore();
  cctx.strokeStyle = C.accent;
  cctx.setLineDash([]);
  line(cctx, { x: X(SIM.t), y: T }, { x: X(SIM.t), y: ch - B });
}

function sampleY(s, idx, km) {
  if (s.s) return s.s in idx ? km[idx[s.s]] : null;
  const seg = SEGS[s.g];
  const ia = idx[seg.a], ib = idx[seg.b];
  if (ia === undefined || ib === undefined || Math.abs(ia - ib) !== 1) return null;
  const fromA = s.d === 1 ? s.p : seg.len - s.p;
  return ia < ib ? km[ia] + fromA : km[ia] - fromA;
}

// --- HUD, log, overlay -----------------------------------------------------------

listeners.log = (time, msg, cls) => {
  const li = document.createElement('li');
  if (cls) li.className = cls;
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = time;
  li.append(t, document.createTextNode(msg));
  const ul = $('log');
  ul.prepend(li);
  while (ul.children.length > 6) ul.lastChild.remove();
};

function updateHud() {
  $('clock').textContent = fmt.time(Math.max(SIM.t, 0));
  $('s-active').textContent = SIM.trains.size;
  const st = SIM.stats;
  $('s-done').textContent = st.done;
  const pct = st.done ? Math.round(st.punctual / st.done * 100) : null;
  const pe = $('s-punct');
  pe.textContent = pct === null ? '--' : pct + '%';
  pe.className = pct === null || pct >= 90 ? '' : pct >= 75 ? 'warn' : 'bad';
  $('s-delay').textContent = st.done ? fmt.delay(st.delaySum / st.done) : '--';
  const n = alertsList().length;
  $('s-alerts').textContent = n;
  $('s-alerts').className = n ? 'bad' : '';
}

function showEnd() {
  running = false;
  const st = SIM.stats;
  const pct = st.done ? Math.round(st.punctual / st.done * 100) : 0;
  $('ov-title').textContent = 'FIN DE LA JORNADA';
  $('ov-body').innerHTML = `<p>Resumen del servicio:</p>
    <ul>
      <li>Trenes llegados: <b>${st.done}</b></li>
      <li>Puntualidad (≤ 5 min): <b>${pct}%</b></li>
      <li>Retraso medio: <b>${st.done ? fmt.delay(st.delaySum / st.done) : '--'}</b></li>
    </ul>`;
  $('ov-btn').textContent = 'NUEVA JORNADA';
  $('overlay').classList.remove('hidden');
}

$('ov-btn').addEventListener('click', () => {
  if (SIM.over || SIM.stats.done) {
    resetSim();
    for (const s of Object.values(ST)) s.mode = 'AUTO';
  }
  $('log').innerHTML = '';
  $('overlay').classList.add('hidden');
  running = true;
  selected = null;
  setSpeed(10);
  log('Jornada iniciada. Todas las estaciones en mando automático.', 'ok');
});

// --- Loop -----------------------------------------------------------------------

let last = performance.now(), lastPanel = 0, lastChart = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running && speed > 0) advance(dt * speed);
  if (running && SIM.over) showEnd();
  if (follow && selected && selected.kind === 'tr') {
    const tr = SIM.trains.get(selected.id);
    if (tr) {
      const p = tr.at === 'line' ? toWorld(trainPoint(tr).x, trainPoint(tr).y) : ST[tr.route[tr.i]];
      cam.x += (p.x - cam.x) * 0.15;
      cam.y += (p.y - cam.y) * 0.15;
    }
  }
  drawMap(now);
  if (now - lastPanel > 300) { renderDetail(); updateHud(); lastPanel = now; }
  if (now - lastChart > 500) { drawChart(); lastChart = now; }
  requestAnimationFrame(frame);
}

const ro = new ResizeObserver(resize);
ro.observe(mapEl);
ro.observe(chartEl);
window.addEventListener('resize', resize);
resize();
requestAnimationFrame(frame);
