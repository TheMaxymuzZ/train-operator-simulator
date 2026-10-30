'use strict';

// ---------------------------------------------------------------------------
// Side panel (station, line section and train details), train graph, header
// indicators, event log and the overlays: start, help and shift report.
// ---------------------------------------------------------------------------

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const dot = type => `<span class="tag" style="background:${TYPES[type].color}"></span>`;
const delayCls = d => d > 900 ? 'vlate' : d > PUNCTUAL ? 'late' : 'ok';
const pct = (a, b) => b ? Math.round(a / b * 100) : null;

// --- Detail panel ----------------------------------------------------------------

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
  return [...SIM.trains.values()]
    .filter(tr => tr.waitSince !== null && (tr.needsAction || SIM.t - tr.waitSince > 600))
    .sort((a, b) => (b.needsAction - a.needsAction) || (a.waitSince - b.waitSince));
}

function incidentRow(inc) {
  const ref = inc.train && SIM.trains.has(inc.train) ? `data-act="selTr" data-id="${inc.train}"`
    : inc.seg !== undefined ? `data-act="selSeg" data-seg="${inc.seg}"` : '';
  return `<div class="d-row click" ${ref}><span class="tag inc-${inc.kind}"></span>
    <span class="grow">${esc(inc.title)} · ${esc(inc.where)}<br><span class="dim">hasta ${fmt.time(inc.until)}</span></span></div>`;
}

function detailNone() {
  let h = `<div class="d-title">PUESTO DE MANDO</div>
    <div class="d-note">Selecciona una estación, un trayecto o un tren en el mapa. Las estaciones con el núcleo y la marca M en ámbar están en mando manual.</div>
    <div class="d-sec">INCIDENCIAS ACTIVAS</div>`;
  if (!SIM.incidents.length) h += '<div class="d-note">Sin incidencias.</div>';
  for (const inc of SIM.incidents) h += incidentRow(inc);
  h += '<div class="d-sec">AVISOS</div>';
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
  const nA = st.plats.filter(p => p.anden).length, nS = st.plats.length - nA;
  let h = `<div class="d-title">${esc(st.name.toUpperCase())} <span class="dim">${st.id}</span></div>
    <div class="d-sub">${nA} vías con andén${nS ? ` · ${nS} de apartado` : ''} · mando ${manual ? 'manual' : 'automático'}</div>
    <div class="d-row">
      <button data-act="mode" data-st="${st.id}" data-mode="MANUAL" class="${manual ? 'on' : ''}">MANUAL</button>
      <button data-act="mode" data-st="${st.id}" data-mode="AUTO" class="${manual ? '' : 'on'}">AUTO</button>
    </div>`;
  if (st.changer) {
    const busy = st.changerUntil > SIM.t;
    h += `<div class="d-row"><span class="tag" style="background:${C.violet}"></span>
      <span class="grow">Cambiador de ancho: ${busy ? `ocupado hasta ${fmt.time(st.changerUntil)}` : 'libre'}</span></div>`;
  }
  h += '<div class="d-sec">VÍAS</div>';
  st.plats.forEach(p => {
    h += `<div class="d-row"><span class="plat" title="${p.anden ? 'vía con andén' : 'vía de apartado, sin andén'}">${p.label}</span>`;
    const tr = p.train !== null ? SIM.trains.get(p.train) : null;
    const rs = p.resv !== null ? SIM.trains.get(p.resv) : null;
    if (tr) {
      const last = tr.i === tr.route.length - 1;
      const dest = ST[tr.route[tr.route.length - 1]].name;
      h += `${dot(tr.type)}<span class="grow click" data-act="selTr" data-id="${tr.id}">${trainLabel(tr)} → ${esc(dest)}<br>${trainStatus(tr)}</span>`;
      if (!last) {
        if (tr.waitReason.startsWith('fallo')) h += `<button data-act="rebase" data-id="${tr.id}" class="warn">REBASE</button>`;
        if (manual) h += `<button data-act="auth" data-id="${tr.id}" ${tr.auth ? 'class="on"' : ''}>SALIDA</button>`;
        h += `<button data-act="hold" data-id="${tr.id}" ${tr.hold ? 'class="warn"' : ''}>${tr.hold ? 'LIBERAR' : 'RETENER'}</button>`;
      }
    } else if (rs) {
      h += `${dot(rs.type)}<span class="grow dim">reservada · ${trainLabel(rs)}</span>`;
    } else {
      h += `<span class="grow dim">libre${p.anden ? '' : ' · sin andén'}</span>`;
    }
    h += '</div>';
  });

  const incoming = [...SIM.trains.values()]
    .filter(tr => tr.at === 'line' && nextStation(tr) === st.id)
    .sort((a, b) => (a.seg.len - a.pos) - (b.seg.len - b.pos));
  h += '<div class="d-sec">LLEGANDO</div>';
  if (!incoming.length) h += '<div class="d-note">Ningún tren en aproximación.</div>';
  for (const tr of incoming) {
    const km = Math.round(tr.seg.len - tr.pos);
    const stops = isStop(tr, tr.i + 1);
    h += `<div class="d-row">${dot(tr.type)}<span class="grow click" data-act="selTr" data-id="${tr.id}">${trainLabel(tr)} desde ${tr.route[tr.i]} · ${km} km · ${stops ? 'para' : 'pasa'}<br>${trainStatus(tr)}</span>`;
    if (tr.resv) h += `<span class="dim">${st.plats[tr.resv.plat].label}</span>`;
    else if (manual) {
      h += '<div class="btns">';
      st.plats.forEach((p, i) => {
        if (p.train === null && p.resv === null && platAllowed(tr, p, tr.i + 1)) {
          h += `<button data-act="assign" data-id="${tr.id}" data-st="${st.id}" data-plat="${i}">${p.label}</button>`;
        }
      });
      if (!stops) h += `<button data-act="auth" data-id="${tr.id}" ${tr.auth ? 'class="on"' : ''}>PASO</button>`;
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

function detailSegment(seg) {
  const trains = [...SIM.trains.values()].filter(t => t.at === 'line' && t.seg === seg)
    .sort((a, b) => (a.dir === 1 ? a.pos : seg.len - a.pos) - (b.dir === 1 ? b.pos : seg.len - b.pos));
  const faults = [];
  seg.fault.forEach((f, ti) => f.forEach((u, j) => { if (u > SIM.t) faults.push({ ti, j, u }); }));
  let lock = '—';
  if (seg.tracks === 1) lock = seg.lock === 1 ? `${seg.a} → ${seg.b}` : seg.lock === -1 ? `${seg.b} → ${seg.a}` : 'libre';
  let h = `<div class="d-title">${esc(segName(seg).toUpperCase())}</div>
    <div class="d-sub">Trayecto ${seg.a}–${seg.b}</div>
    <table class="kv">
      <tr><td>Longitud</td><td>${Math.round(seg.len)} km</td></tr>
      <tr><td>Vía</td><td>${seg.tracks === 2 ? 'doble' : 'única'}</td></tr>
      <tr><td>Ancho</td><td>${GAUGES[seg.gauge].name}</td></tr>
      <tr><td>Velocidad máxima</td><td>${seg.vmax} km/h</td></tr>
      <tr><td>Cantones</td><td>${seg.n} × ${seg.blen.toFixed(1)} km</td></tr>
      ${seg.tracks === 1 ? `<tr><td>Bloqueo de sentido</td><td>${lock}</td></tr>` : ''}
      ${seg.ltv ? `<tr><td class="late">LTV</td><td class="late">${seg.ltv.limit} km/h hasta ${fmt.time(seg.ltv.until)} (${esc(seg.ltv.cause)})</td></tr>` : ''}
    </table>`;
  if (faults.length) {
    h += '<div class="d-sec">FALLOS DE CIRCUITO DE VÍA</div>';
    for (const f of faults) h += `<div class="d-row alert">Cantón ${f.j + 1}${seg.tracks === 2 ? `, vía ${f.ti + 1}` : ''} · hasta ${fmt.time(f.u)}</div>`;
  }
  h += `<div class="d-sec">TRENES EN EL TRAYECTO (${trains.length})</div>`;
  if (!trains.length) h += '<div class="d-note">Trayecto libre.</div>';
  for (const tr of trains) {
    const from = tr.route[tr.i], to = nextStation(tr);
    h += `<div class="d-row click" data-act="selTr" data-id="${tr.id}">${dot(tr.type)}
      <span class="grow">${trainLabel(tr)} ${from} → ${to} · km ${Math.round(tr.pos)}<br>${trainStatus(tr)}</span></div>`;
  }
  return h;
}

function detailTrain(tr) {
  const d = estDelay(tr);
  const origin = ST[tr.route[0]].name, dest = ST[tr.route[tr.route.length - 1]].name;
  let where;
  if (tr.at === 'st') where = `${ST[tr.route[tr.i]].name}, vía ${ST[tr.route[tr.i]].plats[tr.plat].label}`;
  else where = `${tr.route[tr.i]} → ${nextStation(tr)}, km ${Math.round(tr.pos)} de ${Math.round(tr.seg.len)} (${tr.seg.tracks === 1 ? 'vía única' : 'doble vía'})`;
  const atManual = tr.at === 'st' && ST[tr.route[tr.i]].mode === 'MANUAL' && tr.i < tr.route.length - 1;
  const gauge = tr.changes.size
    ? `${GAUGES[tr.axle].name} · cambia en ${[...tr.changes].map(s => ST[s].name).join(', ')}`
    : GAUGES[tr.axle].name;
  let h = `<div class="d-title">${dot(tr.type)} ${trainLabel(tr)}</div>
    <div class="d-sub">${TYPES[tr.type].name} · ${esc(origin)} → ${esc(dest)}</div>
    <div class="d-row"><span class="grow">${esc(where)}<br>${trainStatus(tr)}</span></div>
    <table class="kv">
      <tr><td>Retraso estimado</td><td class="${delayCls(d)}">${fmt.delay(d)}</td></tr>
      <tr><td>Ancho</td><td>${gauge}</td></tr>
      ${tr.brokenUntil > SIM.t ? `<tr><td class="alert">Avería</td><td class="alert">previsión ${fmt.time(tr.brokenUntil)}</td></tr>` : ''}
    </table>
    <div class="d-row">
      <button data-act="hold" data-id="${tr.id}" ${tr.hold ? 'class="warn"' : ''}>${tr.hold ? 'LIBERAR' : 'RETENER'}</button>
      ${atManual ? `<button data-act="auth" data-id="${tr.id}" ${tr.auth ? 'class="on"' : ''}>SALIDA</button>` : ''}
      ${tr.waitReason.startsWith('fallo') ? `<button data-act="rebase" data-id="${tr.id}" class="warn">AUTORIZAR REBASE</button>` : ''}
      <button data-act="follow" ${follow ? 'class="on"' : ''}>SEGUIR</button>
    </div>
    <div class="d-sec">ITINERARIO</div>
    <table class="route"><tr class="dim"><td></td><td>prev.</td><td>real</td><td></td></tr>`;
  tr.route.forEach((sid, i) => {
    const s = tr.sched[i], a = tr.actual[i];
    const stop = isStop(tr, i);
    const plan = i === 0 ? s.dep : s.arr;
    const real = i === 0 ? a.dep : a.arr;
    const cls = i < tr.i || (i === tr.i && tr.at === 'line') ? 'past' : i === tr.i ? 'cur' : '';
    const dl = real != null ? `<span class="${delayCls(real - plan)}">${fmt.delay(real - plan)}</span>` : '';
    const note = tr.changes.has(sid) ? ' ⇄' : stop ? '' : ' (pasa)';
    h += `<tr class="${cls}"><td${stop ? '' : ' class="pass"'}>${esc(ST[sid].name)}${note}</td>
      <td>${fmt.time(plan)}</td><td>${fmt.time(real)}</td><td>${dl}</td></tr>`;
  });
  return h + '</table>';
}

let lastDetail = '';
function renderDetail(force) {
  let h;
  if (selected && selected.kind === 'st') h = detailStation(ST[selected.id]);
  else if (selected && selected.kind === 'seg') h = detailSegment(SEGS[selected.id]);
  else if (selected && selected.kind === 'tr') {
    const tr = SIM.trains.get(selected.id);
    if (tr) h = detailTrain(tr);
    else { selected = null; h = detailNone(); }
  } else h = detailNone();
  if (selected) h = '<button class="back" data-act="back">← PUESTO</button>' + h;
  if (force || h !== lastDetail) { $('detail').innerHTML = h; lastDetail = h; }
}

// pointerdown so a click is never lost to a panel refresh
$('detail').addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = Number(el.dataset.id);
  switch (el.dataset.act) {
    case 'mode': if (ST[el.dataset.st].mode !== el.dataset.mode) cmdToggleMode(el.dataset.st); break;
    case 'auth': cmdAuthorize(id); break;
    case 'hold': cmdHold(id); break;
    case 'rebase': cmdRebase(id); break;
    case 'assign': cmdAssign(id, el.dataset.st, Number(el.dataset.plat)); break;
    case 'selTr': selected = { kind: 'tr', id }; follow = false; break;
    case 'selSeg': selected = { kind: 'seg', id: Number(el.dataset.seg) }; follow = false; break;
    case 'follow': follow = !follow; break;
    case 'back': selected = null; follow = false; break;
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
  // sections with a speed restriction or a failed track circuit
  corr.slice(1).forEach((s, i) => {
    const seg = segBetween(corr[i], s);
    const bad = seg.fault.some(f => f.some(u => u > SIM.t));
    if (!seg.ltv && !bad) return;
    cctx.fillStyle = bad ? 'rgba(255,92,92,.10)' : 'rgba(255,181,71,.08)';
    cctx.fillRect(L, Y(km[i]), cw - L - R, Y(km[i + 1]) - Y(km[i]));
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
    const isSel = selected && selected.kind === 'tr' && selected.id === tr.id;
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
    cctx.lineWidth = isSel ? 2.5 : 1.4;
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

// --- HUD & log -----------------------------------------------------------------

listeners.log = (time, msg, cls) => {
  const li = document.createElement('li');
  if (cls) li.className = cls;
  const t = document.createElement('span');
  t.className = 't';
  t.textContent = time;
  li.append(t, document.createTextNode(msg));
  const ul = $('log');
  ul.prepend(li);
  while (ul.children.length > 30) ul.lastChild.remove();
};

function updateHud() {
  $('clock').textContent = fmt.time(Math.max(SIM.t, 0));
  $('s-active').textContent = SIM.trains.size;
  const st = SIM.stats;
  $('s-done').textContent = st.done;
  const p = pct(st.punctual, st.done);
  const pe = $('s-punct');
  pe.textContent = p === null ? '--' : p + '%';
  pe.className = p === null || p >= 90 ? '' : p >= 75 ? 'warn' : 'bad';
  $('s-delay').textContent = st.done ? fmt.delay(st.delaySum / st.done) : '--';
  const n = alertsList().length;
  $('s-alerts').textContent = n;
  $('s-alerts').className = n ? 'bad' : '';
  $('s-inc').textContent = SIM.incidents.length;
  $('s-inc').className = SIM.incidents.length ? 'warn' : '';
  $('status').textContent = `${SIM.shift.name} ${fmt.time(SIM.shift.start)}–${fmt.time(SIM.shift.end)} · incidencias ${SIM.incidentsOn ? 'activadas' : 'desactivadas'} · v${APP.version}`;
}

// --- Overlays ------------------------------------------------------------------

const startOpts = { shift: 'manana', incidents: true };

function overlayOpen() { return !$('overlay').classList.contains('hidden'); }
function closeOverlay() { $('overlay').classList.add('hidden'); }
function openOverlay(html, wide) {
  $('ov-panel').innerHTML = html;
  $('ov-panel').classList.toggle('wide', !!wide);
  $('overlay').classList.remove('hidden');
  $('ov-panel').scrollTop = 0;
}

function showStart() {
  const single = SEGS.filter(g => g.tracks === 1).length;
  const changers = Object.values(ST).filter(s => s.changer).length;
  const opt = (group, key, label) =>
    `<button data-act="${group}" data-val="${key}" class="${String(startOpts[group]) === String(key) ? 'on' : ''}">${label}</button>`;
  openOverlay(`
    <div class="boot">
      <div><span class="ok">●</span> ${APP.short} ${APP.version} · Centro de Regulación de Circulación · operador ${escapeHtml(OPERATOR.name || '--')}</div>
      <div class="dim">Red cargada: ${Object.keys(ST).length} estaciones · ${SEGS.length} trayectos (${single} de vía única) · ${changers} cambiadores de ancho</div>
      <div class="dim">Plan del día: ${SIM.services.length} circulaciones programadas</div>
    </div>
    <h1>TRAIN OPERATOR SIMULATOR</h1>
    <p>Eres el regulador de circulación de la red. Los trenes siguen su horario por líneas divididas en cantones protegidos por señales; tu trabajo es que lleguen a tiempo pese a las incidencias.</p>
    <div class="opt"><span class="dim">TURNO</span>
      ${opt('shift', 'manana', 'MAÑANA 06–14')}${opt('shift', 'tarde', 'TARDE 14–22')}${opt('shift', 'jornada', 'JORNADA 06–24')}
    </div>
    <div class="opt"><span class="dim">INCIDENCIAS</span>
      ${opt('incidents', true, 'ACTIVADAS')}${opt('incidents', false, 'DESACTIVADAS')}
    </div>
    <div class="ov-actions">
      <button class="primary" data-act="start">TOMAR EL TURNO</button>
      <button data-act="help">MANUAL DE OPERACIÓN</button>
    </div>
    <div class="ver">v${APP.version} · ${APP.date}</div>`);
}

function showHelp() {
  openOverlay(`
    <h1>MANUAL DE OPERACIÓN</h1>
    <h2>Controles</h2>
    <table class="kv">
      <tr><td>Arrastrar · rueda · pellizco</td><td>mover y ampliar el mapa</td></tr>
      <tr><td>Clic</td><td>seleccionar estación, trayecto o tren</td></tr>
      <tr><td>Espacio</td><td>pausa / reanudar</td></tr>
      <tr><td>+ / − / 0</td><td>ampliar, reducir, ver toda España</td></tr>
      <tr><td>I</td><td>informe del turno</td></tr>
      <tr><td>H</td><td>este manual</td></tr>
      <tr><td>Esc</td><td>cerrar ventana o quitar selección</td></tr>
    </table>
    <h2>Señalización</h2>
    <p>Cada trayecto está dividido en <b>cantones</b> de unos 12 km. Una señal en <b>rojo</b> protege un cantón ocupado; en <b>amarillo</b>, avisa de que el siguiente lo está. Los trenes frenan solos según su curva de frenado.</p>
    <h2>Estaciones</h2>
    <p>Las vías <b>V</b> tienen andén; las <b>A</b> son de apartado, sin andén, para mercancías y adelantamientos. En mando <b>AUTO</b> el sistema asigna vías por orden de llegada (impares para trenes que se alejan de Madrid, pares para los que se acercan) y hace que los lentos cedan el paso a los rápidos. En <b>MANUAL</b> asignas tú la vía, das <b>PASO</b> a los trenes que no paran y la orden de <b>SALIDA</b>.</p>
    <h2>Vía única</h2>
    <p>Solo circulan trenes en un sentido a la vez. Un tren solo entra si hay vía libre en la estación siguiente para cruzarse. <b>RETENER</b> un tren te permite decidir quién pasa primero.</p>
    <h2>Ancho de vía</h2>
    <p>Las líneas de alta velocidad son de <b>ancho estándar</b>; las convencionales, de <b>ancho ibérico</b>; el corredor Zaragoza–Barcelona es de <b>ancho mixto</b>. La alta velocidad solo circula por ancho estándar y los mercancías por ibérico. Los trenes de larga distancia son de ancho variable y cambian en los <b>cambiadores</b> (rombo violeta) de Valladolid, León y Ourense, uno a la vez.</p>
    <h2>Incidencias</h2>
    <table class="kv">
      <tr><td class="late">LTV</td><td>limitación temporal de velocidad por obras, viento o niebla</td></tr>
      <tr><td class="alert">Fallo de circuito de vía</td><td>un cantón da ocupación falsa; los trenes paran ante él hasta que des la orden de <b>REBASE</b> (marcha a la vista a 30 km/h)</td></tr>
      <tr><td class="alert">Avería de tren</td><td>el tren queda detenido en plena vía y bloquea su cantón</td></tr>
      <tr><td class="late">Atención a viajero</td><td>el tren alarga su parada en la estación</td></tr>
    </table>
    <h2>Indicadores</h2>
    <p>La <b>puntualidad</b> cuenta llegadas con 5 minutos de retraso o menos. Los <b>avisos</b> son trenes que esperan una orden tuya o llevan más de 10 minutos parados.</p>
    <div class="ov-actions"><button class="primary" data-act="${running ? 'close' : 'toStart'}">${running ? 'VOLVER AL PUESTO' : 'VOLVER'}</button></div>`, true);
}

function rating(p) {
  if (p === null) return '—';
  if (p >= 95) return 'EXCELENTE';
  if (p >= 85) return 'BUENO';
  if (p >= 75) return 'ACEPTABLE';
  return 'DEFICIENTE';
}

function reportData() {
  const s = SIM.stats;
  const p = pct(s.punctual, s.done);
  const types = Object.entries(s.byType).filter(([, b]) => b.done).map(([k, b]) => ({
    type: k, name: TYPES[k].name, done: b.done, punctual: b.punctual, pct: pct(b.punctual, b.done),
    avg: b.delaySum / b.done, max: b.max,
  }));
  const worst = s.arrivals.slice().sort((a, b) => b.delay - a.delay).filter(a => a.delay > PUNCTUAL).slice(0, 5);
  return { s, p, types, worst, avg: s.done ? s.delaySum / s.done : 0 };
}

function showReport(final) {
  const { s, p, types, worst, avg } = reportData();
  const title = final ? 'INFORME DE FIN DE TURNO' : 'INFORME PARCIAL DEL TURNO';
  let h = `<h1>${title}</h1>
    <div class="d-sub">${SIM.shift.name} · ${fmt.time(SIM.shift.start)}–${fmt.time(SIM.shift.end)} · operador ${escapeHtml(OPERATOR.name || '--')} · emitido a las ${fmt.time(SIM.t)}</div>
    <div class="kpis">
      <div><span>LLEGADAS</span><b>${s.done}</b></div>
      <div><span>PUNTUALIDAD</span><b class="${p === null ? '' : p >= 90 ? 'ok' : p >= 75 ? 'late' : 'vlate'}">${p === null ? '--' : p + '%'}</b></div>
      <div><span>RETRASO MEDIO</span><b>${s.done ? fmt.delay(avg) : '--'}</b></div>
      <div><span>CALIFICACIÓN</span><b>${rating(p)}</b></div>
    </div>
    <h2>Por tipo de tren</h2>
    <table class="grid"><tr><th>Tipo</th><th>Trenes</th><th>Puntuales</th><th>Puntualidad</th><th>Ret. medio</th><th>Máximo</th></tr>`;
  if (!types.length) h += '<tr><td colspan="6" class="dim">Ningún tren ha llegado aún a destino.</td></tr>';
  for (const t of types) {
    h += `<tr><td>${dot(t.type)} ${t.type}</td><td>${t.done}</td><td>${t.punctual}</td><td>${t.pct}%</td><td>${fmt.delay(t.avg)}</td><td class="${delayCls(t.max)}">${fmt.delay(t.max)}</td></tr>`;
  }
  h += '</table><h2>Trenes con más retraso</h2>';
  if (!worst.length) h += '<p class="dim">Ningún tren llegó con más de 5 minutos de retraso.</p>';
  else {
    h += '<table class="grid"><tr><th>Tren</th><th>Recorrido</th><th>Retraso</th></tr>';
    for (const w of worst) h += `<tr><td>${w.label}</td><td>${esc(w.from)} → ${esc(w.to)}</td><td class="${delayCls(w.delay)}">${fmt.delay(w.delay)}</td></tr>`;
    h += '</table>';
  }
  h += `<h2>Incidencias (${s.incidents.length})</h2>`;
  if (!s.incidents.length) h += '<p class="dim">Sin incidencias en el turno.</p>';
  else {
    h += '<table class="grid">';
    for (const i of s.incidents) h += `<tr><td>${fmt.time(i.t)}</td><td>${esc(i.title)}</td><td>${esc(i.where)}</td></tr>`;
    h += '</table>';
  }
  h += `<p>Órdenes del operador: <b>${s.orders}</b></p>
    <div class="ov-actions">
      ${final ? '' : '<button class="primary" data-act="close">VOLVER AL PUESTO</button>'}
      <button data-act="download">DESCARGAR INFORME</button>
      <button data-act="toStart">NUEVO TURNO</button>
    </div>`;
  openOverlay(h, true);
}

function reportText() {
  const { s, p, types, worst, avg } = reportData();
  const pad = (v, n) => String(v).padEnd(n);
  const L = [];
  L.push(`${APP.short} ${APP.version} · ${APP.name}`);
  L.push(`INFORME DE TURNO · ${SIM.shift.name} ${fmt.time(SIM.shift.start)}-${fmt.time(SIM.shift.end)} · emitido ${fmt.time(SIM.t)}`);
  L.push(`Operador: ${OPERATOR.name || '--'} · ${POSTS[OPERATOR.post]}`);
  L.push('='.repeat(64));
  L.push(`Llegadas: ${s.done}   Puntualidad: ${p === null ? '--' : p + '%'}   Retraso medio: ${s.done ? fmt.delay(avg) : '--'}   Calificación: ${rating(p)}`);
  L.push('');
  L.push('POR TIPO DE TREN');
  L.push(pad('Tipo', 6) + pad('Trenes', 8) + pad('Puntuales', 11) + pad('Puntual.', 10) + pad('Medio', 8) + 'Máximo');
  for (const t of types) L.push(pad(t.type, 6) + pad(t.done, 8) + pad(t.punctual, 11) + pad(t.pct + '%', 10) + pad(fmt.delay(t.avg), 8) + fmt.delay(t.max));
  L.push('');
  L.push('TRENES CON MÁS RETRASO');
  if (!worst.length) L.push('Ninguno por encima de 5 minutos.');
  for (const w of worst) L.push(`${pad(w.label, 11)} ${pad(w.from + ' -> ' + w.to, 36)} ${fmt.delay(w.delay)}`);
  L.push('');
  L.push(`INCIDENCIAS (${s.incidents.length})`);
  for (const i of s.incidents) L.push(`${fmt.time(i.t)}  ${pad(i.title, 34)} ${i.where}`);
  L.push('');
  L.push(`Órdenes del operador: ${s.orders}`);
  return L.join('\n') + '\n';
}

function downloadReport() {
  try {
    const blob = new Blob([reportText()], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `informe-ctc-es-${SIM.shiftKey}-${fmt.time(SIM.t).replace(':', '')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { /* downloads blocked */ }
}

$('overlay').addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  switch (el.dataset.act) {
    case 'shift': startOpts.shift = el.dataset.val; showStart(); break;
    case 'incidents': startOpts.incidents = el.dataset.val === 'true'; showStart(); break;
    case 'help': showHelp(); break;
    case 'toStart': running = false; resetSim(); showStart(); break;
    case 'close': closeOverlay(); break;
    case 'download': downloadReport(); break;
    case 'start':
      $('log').innerHTML = '';
      startShift(startOpts.shift, startOpts.incidents);
      closeOverlay();
      running = true;
      selected = null;
      setSpeed(10);
      log(`${SIM.shift.name} iniciado. Todas las estaciones en mando automático.`, 'ok');
      break;
  }
});

$('btn-help').addEventListener('click', () => { if (running) showHelp(); });
$('btn-report').addEventListener('click', () => { if (running) showReport(false); });
