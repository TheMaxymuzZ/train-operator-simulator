'use strict';

// ---------------------------------------------------------------------------
// Interface: map rendering, camera, input and the main loop. Side panel,
// train graph and overlays live in panels.js.
// ---------------------------------------------------------------------------

const C = {
  bg: '#070b10',
  land: '#0a1118',
  coast: '#18232e',
  grid: '#0d141b',
  text: '#b9c7d4',
  dim: '#5b6b7b',
  bright: '#e8f1f8',
  accent: '#4cf3a0',
  amber: '#ffb547',
  red: '#ff5c5c',
  violet: '#c792ff',
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
let lastSpeed = 10;
let running = false;
let selected = null;   // { kind: 'st' | 'tr' | 'seg', id }
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
  if (first && W > 0) fitBox(SECTORS['ESPAÑA']);
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
  return trackPoint(tr.seg, tr.dir, tr.dir === 1 ? tr.pos : tr.seg.len - tr.pos);
}

function line(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

// --- Map drawing -----------------------------------------------------------

const GEO_XY = {
  land: GEO.land.map(poly => poly.map(([lon, lat]) => project(lon, lat))),
  islands: GEO.islands.map(poly => poly.map(([lon, lat]) => project(lon, lat))),
  rivers: Object.entries(GEO.rivers).map(([name, pts]) => ({ name, pts: pts.map(([lon, lat]) => project(lon, lat)) })),
  labels: GEO.labels.map(([text, lon, lat, kind]) => ({ text, kind, p: project(lon, lat) })),
};

function polyPath(ctx, pts, close) {
  ctx.beginPath();
  pts.forEach((q, i) => {
    const p = toScreen(q);
    if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
  });
  if (close) ctx.closePath();
}

// Faint dot grid in the sea plus a 1-degree graticule with edge labels.
function drawGrid() {
  mctx.fillStyle = C.grid;
  for (let x = 16; x < W; x += 32) for (let y = 16; y < H; y += 32) mctx.fillRect(x, y, 1.5, 1.5);
  const tl = toWorld(0, 0), br = toWorld(W, H);
  const lonAt = x => x / (COS_LAT * KM_PER_DEG) - 3.7, latAt = y => 40.4 - y / KM_PER_DEG;
  const step = cam.s >= 3 ? 0.5 : 1;
  mctx.strokeStyle = '#0f1922';
  mctx.lineWidth = 1;
  mctx.setLineDash([2, 6]);
  mctx.font = `9px ${FONT}`;
  mctx.fillStyle = '#2a3a4a';
  for (let lon = Math.ceil(lonAt(tl.x) / step) * step; lon <= lonAt(br.x); lon += step) {
    const x = toScreen(project(lon, 40)).x;
    line(mctx, { x, y: 0 }, { x, y: H });
    mctx.textAlign = 'left';
    mctx.fillText(`${Math.abs(lon).toFixed(step < 1 ? 1 : 0)}°${lon < 0 ? 'O' : 'E'}`, x + 3, 12);
  }
  for (let lat = Math.ceil(latAt(br.y) / step) * step; lat <= latAt(tl.y); lat += step) {
    const y = toScreen(project(-3.7, lat)).y;
    line(mctx, { x: 0, y }, { x: W, y });
    mctx.textAlign = 'right';
    mctx.fillText(`${lat.toFixed(step < 1 ? 1 : 0)}°N`, W - 6, y - 3);
  }
  mctx.setLineDash([]);
}

function drawOutline() {
  // neighbouring countries: darker fill, dashed borders
  for (const poly of GEO_XY.land) {
    polyPath(mctx, poly, true);
    mctx.fillStyle = '#090f15';
    mctx.fill();
  }
  // Spain and its islands, with a soft coastal glow
  const shapes = [OUTLINE_XY, ...GEO_XY.islands];
  for (const poly of shapes) {
    polyPath(mctx, poly, true);
    mctx.strokeStyle = 'rgba(76,160,200,.07)';
    mctx.lineWidth = 6;
    mctx.lineJoin = 'round';
    mctx.stroke();
    mctx.fillStyle = C.land;
    mctx.fill();
    mctx.strokeStyle = '#1f3040';
    mctx.lineWidth = 1;
    mctx.stroke();
  }
  mctx.setLineDash([5, 3, 1, 3]);
  mctx.strokeStyle = '#2a3846';
  for (const border of [PT_BORDER, FR_BORDER]) {
    polyPath(mctx, border.map(([lon, lat]) => project(lon, lat)));
    mctx.stroke();
  }
  mctx.setLineDash([]);
  // rivers
  mctx.strokeStyle = '#14304a';
  mctx.lineWidth = clamp(cam.s * 0.6, 0.8, 1.6);
  mctx.lineJoin = 'round';
  for (const r of GEO_XY.rivers) { polyPath(mctx, r.pts); mctx.stroke(); }
  if (cam.s >= 2.2) {
    mctx.font = `italic 9px ${FONT}`;
    mctx.fillStyle = '#1f4462';
    mctx.textAlign = 'center';
    for (const r of GEO_XY.rivers) {
      const q = toScreen(r.pts[Math.floor(r.pts.length / 2)]);
      mctx.fillText(r.name.toUpperCase(), q.x, q.y - 4);
    }
  }
  // seas and countries
  mctx.textAlign = 'center';
  for (const l of GEO_XY.labels) {
    const q = toScreen(l.p);
    if (q.x < -100 || q.x > W + 100 || q.y < -20 || q.y > H + 20) continue;
    mctx.font = l.kind === 'sea' ? `italic 10px ${FONT}` : `10px ${FONT}`;
    mctx.fillStyle = l.kind === 'sea' ? '#1d3a52' : '#2c3a48';
    spaced(mctx, l.text, q.x, q.y, l.kind === 'sea' ? 3 : 2.5);
  }
}

// Letter-spaced text centred on x.
function spaced(ctx, text, x, y, gap) {
  const w = [...text].reduce((n, ch) => n + ctx.measureText(ch).width + gap, -gap);
  let cx = x - w / 2;
  ctx.textAlign = 'left';
  for (const ch of text) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + gap; }
  ctx.textAlign = 'center';
}

// Scale bar and north arrow in the bottom-right corner.
function drawScale() {
  const kmPerPx = 1 / cam.s;
  const nice = [5, 10, 20, 25, 50, 100, 200, 250, 500].find(k => k / kmPerPx >= 70) || 500;
  const w = nice / kmPerPx, x0 = W - 18 - w, y0 = H - 58;
  mctx.strokeStyle = '#5b6b7b';
  mctx.fillStyle = '#5b6b7b';
  mctx.lineWidth = 1;
  line(mctx, { x: x0, y: y0 }, { x: x0 + w, y: y0 });
  for (const t of [0, 0.5, 1]) line(mctx, { x: x0 + w * t, y: y0 - (t === 0.5 ? 2 : 4) }, { x: x0 + w * t, y: y0 });
  mctx.font = `9px ${FONT}`;
  mctx.textAlign = 'right';
  mctx.fillText(`${nice} km`, x0 + w, y0 - 6);
  const nx = W - 22, ny = 30;
  mctx.beginPath();
  mctx.moveTo(nx, ny - 9); mctx.lineTo(nx + 4.5, ny + 4); mctx.lineTo(nx, ny + 1); mctx.lineTo(nx - 4.5, ny + 4);
  mctx.closePath();
  mctx.fill();
  mctx.textAlign = 'center';
  mctx.fillText('N', nx, ny + 15);
}

function drawLines(pulse) {
  const off = trackOff();
  const detail = cam.s >= 1.6;
  for (const seg of SEGS) {
    const g = segScreen(seg);
    const offs = seg.tracks === 2 ? [off, -off] : [0];
    const isSel = selected && selected.kind === 'seg' && selected.id === seg.id;
    mctx.lineCap = 'butt';
    offs.forEach((o, ti) => {
      const a = segPoint(g, 0, o), b = segPoint(g, 1, o);
      mctx.strokeStyle = isSel ? C.accent : GAUGES[seg.gauge === 'M' ? 'U' : seg.gauge].color;
      mctx.lineWidth = seg.tracks === 2 ? 1.4 : 1.8;
      line(mctx, a, b);
      if (seg.gauge === 'M' && !isSel) {
        // mixed gauge: third rail drawn as a dashed overlay
        mctx.setLineDash([4, 4]);
        mctx.strokeStyle = GAUGES.I.color;
        line(mctx, a, b);
        mctx.setLineDash([]);
      }
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
      // failed track circuits flash red
      seg.fault[ti].forEach((until, j) => {
        if (until <= SIM.t) return;
        mctx.strokeStyle = C.red;
        mctx.globalAlpha = 0.4 + 0.6 * pulse;
        mctx.lineWidth = 3;
        mctx.setLineDash([3, 3]);
        line(mctx, segPoint(g, j / seg.n, o), segPoint(g, (j + 1) / seg.n, o));
        mctx.setLineDash([]);
        mctx.globalAlpha = 1;
      });
    });
    if (seg.ltv) {
      const side = (seg.tracks === 2 ? off : 0) + 4;
      mctx.strokeStyle = C.amber;
      mctx.lineWidth = 1;
      mctx.setLineDash([2, 3]);
      line(mctx, segPoint(g, 0.05, side), segPoint(g, 0.95, side));
      line(mctx, segPoint(g, 0.05, -side), segPoint(g, 0.95, -side));
      mctx.setLineDash([]);
      if (detail) {
        const m = segPoint(g, 0.5, side + 10);
        mctx.fillStyle = C.amber;
        mctx.font = `10px ${FONT}`;
        mctx.textAlign = 'center';
        mctx.fillText(`LTV ${seg.ltv.limit}`, m.x, m.y);
      }
    }
    if (detail) {
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
    const side = (seg.tracks === 2 ? off : 0) + 3;
    for (let r = 1; r < seg.n; r++) {
      const fromA = dir === 1 ? r * seg.blen : seg.len - r * seg.blen;
      const s = dir === 1 ? 1 : -1;
      const base = segPoint(g, fromA / seg.len, s * side);
      const lamp = segPoint(g, fromA / seg.len, s * (side + 4));
      const a = aspect(seg, dir, r);
      // mast from the track side out to the lamp
      mctx.strokeStyle = '#3a4b5c';
      mctx.lineWidth = 1;
      line(mctx, base, lamp);
      mctx.beginPath();
      mctx.arc(lamp.x, lamp.y, 2.4, 0, Math.PI * 2);
      mctx.fillStyle = C.bg;
      mctx.fill();
      mctx.beginPath();
      mctx.arc(lamp.x, lamp.y, 1.7, 0, Math.PI * 2);
      mctx.fillStyle = a === 'V' ? C.sigV : a === 'A' ? C.sigA : C.sigR;
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
    const hub = st.plats.filter(pl => pl.anden).length >= 6;
    const r = hub ? 5 : 4;
    // station node: rounded square, double frame for main hubs, filled core in MANUAL
    mctx.beginPath();
    roundRect(mctx, p.x - r, p.y - r, r * 2, r * 2, 2);
    mctx.fillStyle = '#0c1218';
    mctx.fill();
    mctx.strokeStyle = manual ? C.amber : '#8aa1b6';
    mctx.lineWidth = 1.3;
    mctx.stroke();
    if (hub) {
      mctx.beginPath();
      roundRect(mctx, p.x - r - 2.5, p.y - r - 2.5, r * 2 + 5, r * 2 + 5, 3);
      mctx.strokeStyle = manual ? 'rgba(255,181,71,.45)' : '#34495c';
      mctx.lineWidth = 1;
      mctx.stroke();
    }
    mctx.fillStyle = manual ? C.amber : '#4f6476';
    const core = manual ? r - 1.6 : 1.6;
    mctx.fillRect(p.x - core, p.y - core, core * 2, core * 2);
    if (st.changer) {
      // gauge changer: diamond with the two rail gauges inside
      const cx = p.x - r - 8, busy = st.changerUntil > SIM.t;
      mctx.beginPath();
      mctx.moveTo(cx, p.y - 4.5); mctx.lineTo(cx + 4.5, p.y); mctx.lineTo(cx, p.y + 4.5); mctx.lineTo(cx - 4.5, p.y);
      mctx.closePath();
      mctx.fillStyle = busy ? C.violet : '#0c1218';
      mctx.globalAlpha = busy ? 0.55 + 0.45 * pulse : 1;
      mctx.fill();
      mctx.globalAlpha = 1;
      mctx.strokeStyle = C.violet;
      mctx.lineWidth = 1.2;
      mctx.stroke();
      mctx.strokeStyle = busy ? C.bg : C.violet;
      mctx.lineWidth = 1;
      line(mctx, { x: cx - 1.8, y: p.y - 1.2 }, { x: cx + 1.8, y: p.y - 1.2 });
      line(mctx, { x: cx - 1.2, y: p.y + 1.2 }, { x: cx + 1.2, y: p.y + 1.2 });
    }

    mctx.font = `${detailed ? 11 : 10}px ${FONT}`;
    mctx.textAlign = 'left';
    mctx.fillStyle = manual ? C.bright : C.text;
    const label = detailed ? st.name.toUpperCase() : st.id;
    mctx.strokeStyle = C.bg;
    mctx.lineWidth = 3;
    mctx.lineJoin = 'round';
    mctx.strokeText(label, p.x + r + 4, p.y - r - 2);
    mctx.fillText(label, p.x + r + 4, p.y - r - 2);
    if (manual) {
      // MANUAL badge after the name
      const bx = p.x + r + 8 + mctx.measureText(label).width;
      mctx.font = `bold 8px ${FONT}`;
      mctx.fillStyle = C.amber;
      mctx.fillRect(bx, p.y - r - 10, 11, 9);
      mctx.fillStyle = C.bg;
      mctx.fillText('M', bx + 3, p.y - r - 3);
    }

    let x = p.x + r + 4;
    st.plats.forEach(pl => {
      const h = pl.anden ? cell : Math.max(2, cell / 2);
      const y = p.y - 1 + (cell - h);
      const occ = pl.train !== null ? SIM.trains.get(pl.train) : null;
      const res = pl.resv !== null ? SIM.trains.get(pl.resv) : null;
      if (!pl.anden && pl.num === 1) x += 2;
      if (occ) {
        mctx.fillStyle = TYPES[occ.type].color;
        mctx.fillRect(x, y, cell, h);
      } else {
        mctx.strokeStyle = res ? TYPES[res.type].color : '#2a3644';
        mctx.lineWidth = 1;
        mctx.strokeRect(x + 0.5, y + 0.5, cell - 1, h - 1);
      }
      if (pl.anden) {
        // platform edge under tracks with a platform
        mctx.fillStyle = '#3a4b5c';
        mctx.fillRect(x, y + h + 1, cell, 1);
      }
      x += cell + 2;
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
    const sel = selected && selected.kind === 'tr' ? SIM.trains.get(selected.id) : null;
    const selTrainHere = sel && sel.at === 'st' && sel.route[sel.i] === st.id;
    if ((selected && selected.kind === 'st' && selected.id === st.id) || selTrainHere) {
      mctx.strokeStyle = C.accent;
      mctx.lineWidth = 1.5;
      mctx.strokeRect(p.x - 8, p.y - 8, 16, 16);
    }
  }
}

// Train glyphs. Every car is placed on the track on its own: the body follows
// the line back from the head, through the last station and onto the
// previous section, so a train turning at a station bends with the track.
// Cars are listed head first as [kind, length]; lengths are in pixels at
// scale 1.
const CONSIST = {
  AV:  { w: 1.00, cars: [['nose', 7], ['mid', 5.5], ['mid', 5.5], ['tail', 7]] },
  LD:  { w: 1.00, cars: [['cab', 6], ['mid', 6], ['cabR', 6]] },
  MD:  { w: 1.00, cars: [['cab', 6], ['cabR', 6]] },
  MER: { w: 0.85, cars: [['loco', 5.5], ['wagon', 4.2], ['wagon', 4.2], ['wagon', 4.2], ['wagon', 4.2]] },
};

function trainScale() { return clamp(cam.s / 1.2, 0.75, 1.8); }

// Screen point on the track a train uses on a section, `fromA` km from end a.
function trackPoint(seg, dir, fromA) {
  const off = seg.tracks === 2 ? (dir === 1 ? trackOff() : -trackOff()) : 0;
  return segPoint(segScreen(seg), fromA / seg.len, off);
}

// Polyline from the head back along the track: current section to the station
// it left, then the section it came from. Beyond that the train is still
// inside its origin station and those cars are not drawn.
function trainTrack(tr) {
  const seg = tr.seg;
  const pts = [trainPoint(tr), trackPoint(seg, tr.dir, tr.dir === 1 ? 0 : seg.len)];
  if (tr.i > 0) {
    const prev = segBetween(tr.route[tr.i - 1], tr.route[tr.i]);
    const pdir = prev.a === tr.route[tr.i - 1] ? 1 : -1;
    pts.push(trackPoint(prev, pdir, pdir === 1 ? prev.len : 0));
    pts.push(trackPoint(prev, pdir, pdir === 1 ? 0 : prev.len));
  }
  return pts;
}

// Point `d` pixels behind the head along the polyline (null past its end).
function alongTrack(pts, d) {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= L) {
      const t = L ? d / L : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    d -= L;
  }
  return null;
}

function trainFrame(tr) {
  const z = trainScale(), cs = CONSIST[tr.type];
  const gap = Math.max(0.9, z * 0.9);
  const pts = trainTrack(tr);
  const cars = [];
  let d = 0;
  for (const [kind, l] of cs.cars) {
    const len = l * z;
    const front = alongTrack(pts, d), back = alongTrack(pts, d + len);
    if (!front || !back) break;
    cars.push({ kind, front, back, len, ang: Math.atan2(front.y - back.y, front.x - back.x) });
    d += len + gap;
  }
  return { p: pts[0], pts, cars, len: Math.max(0, d - gap), w: 3.4 * z * cs.w, z };
}

function trainMid(f) { return alongTrack(f.pts, f.len / 2) || f.p; }

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// One car in local coordinates: front at x = 0, body towards negative x.
function carPath(ctx, kind, len, w) {
  const h = w / 2;
  ctx.beginPath();
  if (kind === 'nose' || kind === 'tail') {
    // streamlined power car; the tail one is the same shape facing back
    const s = kind === 'nose' ? 1 : -1, x0 = kind === 'nose' ? 0 : -len;
    const nose = len * 0.55, r = h * 0.5;
    ctx.moveTo(x0, 0);
    ctx.bezierCurveTo(x0 - s * nose * 0.3, -h * 0.9, x0 - s * nose * 0.65, -h, x0 - s * nose, -h);
    ctx.lineTo(x0 - s * (len - r), -h);
    ctx.arcTo(x0 - s * len, -h, x0 - s * len, 0, r);
    ctx.arcTo(x0 - s * len, h, x0 - s * (len - r), h, r);
    ctx.lineTo(x0 - s * nose, h);
    ctx.bezierCurveTo(x0 - s * nose * 0.65, h, x0 - s * nose * 0.3, h * 0.9, x0, 0);
    ctx.closePath();
  } else if (kind === 'cab' || kind === 'cabR') {
    // multiple-unit end car: rounded cab on the outer end only
    const front = kind === 'cab', r = h * 0.95, q = h * 0.3;
    ctx.moveTo(-len + (front ? q : r), -h);
    ctx.lineTo(-(front ? r : q), -h);
    ctx.arcTo(0, -h, 0, 0, front ? r : q);
    ctx.arcTo(0, h, -len, h, front ? r : q);
    ctx.lineTo(-len + (front ? q : r), h);
    ctx.arcTo(-len, h, -len, 0, front ? q : r);
    ctx.arcTo(-len, -h, 0, -h, front ? q : r);
    ctx.closePath();
  } else if (kind === 'loco') {
    roundRect(ctx, -len, -h * 1.15, len, w * 1.15, h * 0.45);
  } else if (kind === 'wagon') {
    ctx.rect(-len, -h * 0.85, len, w * 0.85);
  } else {
    roundRect(ctx, -len, -h, len, w, h * 0.3);
  }
}

function eachCar(f, fn) {
  for (const c of f.cars) {
    mctx.save();
    mctx.translate(c.front.x, c.front.y);
    mctx.rotate(c.ang);
    fn(c);
    mctx.restore();
  }
}

function drawTrainGlyph(tr, f, pulse) {
  const broken = tr.brokenUntil > SIM.t;
  // dark halo first, so cars read over the track and the occupied blocks
  mctx.strokeStyle = C.bg;
  mctx.lineWidth = 2.5;
  mctx.lineJoin = 'round';
  eachCar(f, c => { carPath(mctx, c.kind, c.len, f.w); mctx.stroke(); });
  mctx.fillStyle = TYPES[tr.type].color;
  mctx.globalAlpha = broken ? 0.35 + 0.4 * pulse : 1;
  eachCar(f, c => { carPath(mctx, c.kind, c.len, f.w); mctx.fill(); });
  mctx.globalAlpha = 1;
  const head = f.cars[0];
  if (!head) return;
  eachCar({ cars: [head] }, c => {
    // cab window and headlight (dimmed while stopped)
    if (f.z >= 1) {
      const cx = c.kind === 'nose' ? -c.len * 0.42 : c.kind === 'loco' ? -c.len * 0.55 : -f.w * 0.75;
      mctx.fillStyle = 'rgba(7,11,16,.7)';
      mctx.fillRect(cx - f.z * 0.7, -f.w * 0.3, f.z * 1.4, f.w * 0.6);
    }
    mctx.fillStyle = tr.v > 0.5 ? '#fffbe6' : 'rgba(255,251,230,.35)';
    mctx.beginPath();
    mctx.arc(-0.9 * f.z, 0, Math.max(0.8, 0.7 * f.z), 0, Math.PI * 2);
    mctx.fill();
  });
}

// Outline that follows the whole consist, for selection and alerts.
function trainRing(f, pad, color) {
  if (!f.cars.length) return;
  const pts = [f.cars[0].front];
  let d = 0;
  for (let i = 1; i < f.pts.length; i++) {
    d += Math.hypot(f.pts[i].x - f.pts[i - 1].x, f.pts[i].y - f.pts[i - 1].y);
    if (d >= f.len) break;
    pts.push(f.pts[i]);
  }
  pts.push(f.cars[f.cars.length - 1].back);
  const path = () => {
    mctx.beginPath();
    pts.forEach((q, i) => (i ? mctx.lineTo(q.x, q.y) : mctx.moveTo(q.x, q.y)));
  };
  mctx.lineCap = 'round';
  mctx.lineJoin = 'round';
  path();
  mctx.strokeStyle = color;
  mctx.lineWidth = f.w + pad * 2 + 2.4;
  mctx.stroke();
  path();
  mctx.strokeStyle = C.bg;
  mctx.lineWidth = f.w + pad * 2;
  mctx.stroke();
  mctx.lineCap = 'butt';
}

function drawTrains(pulse) {
  const labels = cam.s >= 2.4;
  mctx.font = `10px ${FONT}`;
  mctx.textAlign = 'left';
  for (const tr of SIM.trains.values()) {
    if (tr.at !== 'line') continue;
    const f = trainFrame(tr);
    if (f.p.x < -40 || f.p.y < -40 || f.p.x > W + 40 || f.p.y > H + 40) continue;
    const isSel = selected && selected.kind === 'tr' && selected.id === tr.id;
    const stuck = tr.waitSince !== null && (tr.needsAction || SIM.t - tr.waitSince > 600);
    // rings go underneath the cars so they never hide them
    if (stuck) {
      mctx.globalAlpha = 0.4 + 0.6 * pulse;
      trainRing(f, 1.5 + 1.5 * pulse, C.red);
      mctx.globalAlpha = 1;
    } else if (isSel) {
      trainRing(f, 2, C.bright);
    }
    drawTrainGlyph(tr, f, pulse);
    const m = trainMid(f);
    if (tr.brokenUntil > SIM.t) {
      const r = f.w + 1;
      mctx.strokeStyle = C.red;
      mctx.lineWidth = 1.5;
      line(mctx, { x: m.x - r, y: m.y - r }, { x: m.x + r, y: m.y + r });
      line(mctx, { x: m.x - r, y: m.y + r }, { x: m.x + r, y: m.y - r });
    }
    if (labels || isSel) {
      const d = estDelay(tr);
      const tag = `${trainLabel(tr)} ${fmt.delay(d)}`;
      const tx = m.x + 8, ty = m.y + 14;
      mctx.fillStyle = 'rgba(7,11,16,.8)';
      mctx.fillRect(tx - 3, ty - 9, mctx.measureText(tag).width + 6, 12);
      mctx.fillStyle = TYPES[tr.type].color;
      mctx.fillRect(tx - 3, ty - 9, 1.5, 12);
      mctx.fillStyle = d > PUNCTUAL ? C.amber : C.text;
      mctx.fillText(tag, tx + 1, ty);
    }
  }
}

function drawMap(now) {
  const pulse = (Math.sin(now / 180) + 1) / 2;
  mctx.fillStyle = C.bg;
  mctx.fillRect(0, 0, W, H);
  drawGrid();
  drawOutline();
  drawLines(pulse);
  drawStations(pulse);
  drawTrains(pulse);
  drawScale();
  if (running && speed === 0) {
    mctx.fillStyle = C.amber;
    mctx.font = `12px ${FONT}`;
    mctx.textAlign = 'right';
    mctx.fillText('■ SIMULACIÓN EN PAUSA', W - 44, 30);
  }
}

// --- Picking & input --------------------------------------------------------

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

function pick(sx, sy) {
  let best = null, bd = 12;
  for (const tr of SIM.trains.values()) {
    if (tr.at !== 'line') continue;
    const f = trainFrame(tr);
    for (const c of f.cars.length ? f.cars : [{ front: f.p, back: f.p }]) {
      const d = distToSegment({ x: sx, y: sy }, c.front, c.back);
      if (d < bd) { bd = d; best = { kind: 'tr', id: tr.id }; }
    }
  }
  if (best) return best;
  bd = 16;
  for (const st of Object.values(ST)) {
    const p = toScreen(st);
    // the platform cells to the right of the marker count too
    const cx = clamp(sx, p.x - 12, p.x + 8 + st.plats.length * 10);
    const d = Math.hypot(cx - sx, p.y - sy);
    if (d < bd) { bd = d; best = { kind: 'st', id: st.id }; }
  }
  if (best) return best;
  bd = 7;
  for (const seg of SEGS) {
    const g = segScreen(seg);
    const d = distToSegment({ x: sx, y: sy }, g.pa, g.pb);
    if (d < bd) { bd = d; best = { kind: 'seg', id: seg.id }; }
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
  if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (overlayOpen() && running) closeOverlay(); else select(null); return; }
  if (!running) return;
  if (k === ' ') { e.preventDefault(); setSpeed(speed === 0 ? lastSpeed : 0); }
  else if (k === 'h' || k === '?') showHelp();
  else if (k === 'i') showReport(false);
  else if (k === '+' || k === '=') zoomAt(W / 2, H / 2, 1.25);
  else if (k === '-') zoomAt(W / 2, H / 2, 0.8);
  else if (k === '0') fitBox(SECTORS['ESPAÑA']);
});

// --- Speed & sectors -----------------------------------------------------------

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

// --- Loop -----------------------------------------------------------------------

let last = performance.now(), lastPanel = 0, lastChart = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (running && speed > 0 && !overlayOpen()) advance(dt * speed);
  if (running && SIM.over) { running = false; showReport(true); }
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
