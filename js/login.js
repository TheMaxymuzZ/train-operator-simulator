'use strict';

// ---------------------------------------------------------------------------
// Title screen: simulated operator sign-in followed by the terminal loading
// sequence. Nothing is sent anywhere; the operator name is only remembered in
// this browser so the next session can prefill it.
// ---------------------------------------------------------------------------

const OPERATOR = { name: '', post: 'ESPAÑA' };
const OP_KEY = 'ctc-es.operator';
let OFFLINE_READY = false;

// Footer note once the service worker has cached the game.
function markOffline() {
  const el = $('lg-offline');
  if (el && OFFLINE_READY) { el.textContent = '● disponible sin conexión'; el.className = 'ok'; }
}

const POSTS = {
  'ESPAÑA':   'Mando central · toda la red',
  'CENTRO':   'Puesto Centro · Madrid',
  'NOROESTE': 'Puesto Noroeste · Galicia y León',
  'NORTE':    'Puesto Norte · Castilla y Cantábrico',
  'NORESTE':  'Puesto Noreste · Aragón y Cataluña',
  'LEVANTE':  'Puesto Levante · Valencia y Murcia',
  'SUR':      'Puesto Sur · Andalucía',
};

const loginEl = $('login');
const lgCanvas = $('login-bg');
const lgCtx = lgCanvas.getContext('2d');
let lgW = 0, lgH = 0, lgRaf = 0;

function loadOperator() {
  try {
    const saved = JSON.parse(localStorage.getItem(OP_KEY) || 'null');
    if (saved && typeof saved.name === 'string') Object.assign(OPERATOR, saved);
  } catch (e) { /* storage unavailable: start blank */ }
  if (!POSTS[OPERATOR.post]) OPERATOR.post = 'ESPAÑA';
}

function saveOperator() {
  try { localStorage.setItem(OP_KEY, JSON.stringify(OPERATOR)); } catch (e) { /* ignore */ }
}

const escapeHtml = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- Background: dim network with trains running along it -------------------

const LG_LINES = LINES.map(([a, b]) => [ST[a], ST[b]]);
const LG_TRAINS = Array.from({ length: 26 }, (_, i) => ({
  line: i % LG_LINES.length,
  t: Math.random(),
  v: 0.02 + Math.random() * 0.05,
  dir: Math.random() < 0.5 ? 1 : -1,
  color: Object.values(TYPES)[i % 4].color,
}));

function lgResize() {
  const dpr = window.devicePixelRatio || 1;
  lgW = loginEl.clientWidth; lgH = loginEl.clientHeight;
  lgCanvas.width = lgW * dpr; lgCanvas.height = lgH * dpr;
  lgCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function lgDraw(now) {
  const [lon0, lat0, lon1, lat1] = SECTORS['ESPAÑA'];
  const a = project(lon0, lat1), b = project(lon1, lat0);
  const s = Math.max(lgW / (b.x - a.x), lgH / (b.y - a.y)) * 0.95;
  const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
  const P = q => ({ x: (q.x - cx) * s + lgW / 2, y: (q.y - cy) * s + lgH / 2 });

  lgCtx.fillStyle = C.bg;
  lgCtx.fillRect(0, 0, lgW, lgH);
  lgCtx.beginPath();
  OUTLINE_XY.forEach((q, i) => { const p = P(q); if (i) lgCtx.lineTo(p.x, p.y); else lgCtx.moveTo(p.x, p.y); });
  lgCtx.closePath();
  lgCtx.fillStyle = '#0a1118';
  lgCtx.fill();
  lgCtx.strokeStyle = '#141e28';
  lgCtx.stroke();
  lgCtx.strokeStyle = '#1b2a38';
  lgCtx.lineWidth = 1.2;
  for (const [u, v] of LG_LINES) line(lgCtx, P(u), P(v));
  for (const st of Object.values(ST)) {
    const p = P(st);
    lgCtx.fillStyle = '#24384a';
    lgCtx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  for (const tr of LG_TRAINS) {
    tr.t += tr.v * tr.dir / 60;
    if (tr.t > 1 || tr.t < 0) { tr.line = (tr.line + 7) % LG_LINES.length; tr.t = tr.dir > 0 ? 0 : 1; }
    const [u, v] = LG_LINES[tr.line];
    const pu = P(u), pv = P(v);
    const x = pu.x + (pv.x - pu.x) * tr.t, y = pu.y + (pv.y - pu.y) * tr.t;
    lgCtx.fillStyle = tr.color;
    lgCtx.globalAlpha = 0.55;
    lgCtx.beginPath();
    lgCtx.arc(x, y, 2.2, 0, Math.PI * 2);
    lgCtx.fill();
    lgCtx.globalAlpha = 1;
  }
  // slow sweep line, like a refreshing monitor
  const sy = (now / 25) % (lgH + 120) - 60;
  const grad = lgCtx.createLinearGradient(0, sy - 60, 0, sy);
  grad.addColorStop(0, 'rgba(76,243,160,0)');
  grad.addColorStop(1, 'rgba(76,243,160,.05)');
  lgCtx.fillStyle = grad;
  lgCtx.fillRect(0, sy - 60, lgW, 60);
  lgRaf = requestAnimationFrame(lgDraw);
}

// --- Stages ------------------------------------------------------------------

const lgCard = $('login-card');
const wait = ms => new Promise(r => setTimeout(r, ms));

function brandBlock() {
  return `
    <div class="lg-brand">
      <svg class="lg-mark" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="1" y="1" width="46" height="46" rx="8" fill="#0c1218" stroke="#1c2733"/>
        <path d="M8 31H40M8 17H40" stroke="#2f5068" stroke-width="2"/>
        <path d="M8 31Q24 31 30 17" stroke="#5d5a52" stroke-width="1.5" fill="none" stroke-dasharray="3 2"/>
        <rect x="24" y="14" width="12" height="6" rx="3" fill="#5fd4ff"/>
        <rect x="11" y="28" width="12" height="6" rx="1.5" fill="#ffb547"/>
        <circle cx="40" cy="11" r="2.5" fill="#4cf3a0"/>
        <circle cx="8" cy="37" r="2.5" fill="#ff5c5c"/>
      </svg>
      <div>
        <div class="lg-title">TRAIN OPERATOR SIMULATOR</div>
        <div class="lg-sub">${APP.short} · CENTRO DE REGULACIÓN DE CIRCULACIÓN</div>
      </div>
    </div>`;
}

async function bootStage() {
  lgCard.innerHTML = `${brandBlock()}<div class="lg-term" id="lg-term"></div>`;
  const term = $('lg-term');
  const lines = [
    `${APP.short} terminal v${APP.version} (${APP.date})`,
    'Comprobando memoria ............ OK',
    'Enlace con puesto central ...... OK',
  ];
  for (const l of lines) {
    term.insertAdjacentHTML('beforeend', `<div>${escapeHtml(l)}</div>`);
    await wait(260);
  }
  await wait(200);
  formStage();
}

function formStage(error) {
  const posts = Object.entries(POSTS)
    .map(([k, v]) => `<option value="${k}"${k === OPERATOR.post ? ' selected' : ''}>${v}</option>`).join('');
  lgCard.innerHTML = `${brandBlock()}
    <form class="lg-form" id="lg-form" autocomplete="off" novalidate>
      <div class="lg-head">ACCESO AL PUESTO DE MANDO</div>
      <label><span>ID DE OPERADOR</span>
        <input id="lg-name" name="operator" maxlength="18" spellcheck="false" placeholder="p. ej. A.GARCIA" value="${escapeHtml(OPERATOR.name)}">
      </label>
      <label><span>CLAVE</span>
        <input id="lg-pass" type="password" maxlength="24" placeholder="••••••">
      </label>
      <label><span>PUESTO</span><select id="lg-post">${posts}</select></label>
      <div class="lg-err" id="lg-err">${error ? '▲ ' + escapeHtml(error) : ''}</div>
      <button class="primary" type="submit">ACCEDER ▸</button>
      <div class="lg-note">Acceso simulado: vale cualquier clave y no se envía ningún dato.</div>
    </form>
    <div class="lg-foot"><span>v${APP.version}</span><span id="lg-offline"></span><span>${APP.date}</span></div>`;
  markOffline();
  const name = $('lg-name');
  (OPERATOR.name ? $('lg-pass') : name).focus();
  $('lg-form').addEventListener('submit', e => {
    e.preventDefault();
    const n = name.value.trim().toUpperCase().replace(/\s+/g, '.');
    if (n.length < 2) return formStage('Introduce tu ID de operador (mínimo 2 caracteres).');
    if (!$('lg-pass').value) return formStage('Introduce una clave de acceso.');
    OPERATOR.name = n;
    OPERATOR.post = $('lg-post').value;
    saveOperator();
    loadingStage();
  });
}

async function loadingStage() {
  const single = SEGS.filter(g => g.tracks === 1).length;
  const blocks = SEGS.reduce((n, g) => n + g.n * g.tracks, 0);
  const signals = SEGS.reduce((n, g) => n + (g.n - 1) * 2, 0);
  const plats = Object.values(ST).reduce((n, s) => n + s.plats.length, 0);
  const steps = [
    ['Verificando credenciales', `operador ${OPERATOR.name}`],
    ['Abriendo sesión en el puesto', POSTS[OPERATOR.post]],
    ['Cargando topología de la red', `${Object.keys(ST).length} estaciones · ${SEGS.length} trayectos`],
    ['Conectando enclavamientos', `${plats} vías de estación`],
    ['Inicializando bloqueos', `${blocks} cantones · ${single} trayectos de vía única`],
    ['Comprobando señales', `${signals} señales`],
    ['Sincronizando horario', `${SIM.services.length} circulaciones`],
    ['Puesto listo', ''],
  ];
  lgCard.innerHTML = `${brandBlock()}
    <div class="lg-head">INICIANDO SESIÓN · ${escapeHtml(OPERATOR.name)}</div>
    <div class="lg-bar"><i id="lg-fill"></i></div>
    <div class="lg-pct"><span id="lg-step">0%</span></div>
    <div class="lg-term" id="lg-term"></div>`;
  const term = $('lg-term'), fill = $('lg-fill'), pct = $('lg-step');
  for (let i = 0; i < steps.length; i++) {
    const [what, info] = steps[i];
    term.insertAdjacentHTML('beforeend',
      `<div class="lg-row"><span>${what}${info ? ' <i>· ' + escapeHtml(info) + '</i>' : ''}</span><b id="lg-r${i}">···</b></div>`);
    term.scrollTop = term.scrollHeight;
    const target = Math.round((i + 1) / steps.length * 100);
    await wait(220 + Math.random() * 260);
    fill.style.width = target + '%';
    pct.textContent = target + '%';
    $(`lg-r${i}`).textContent = 'OK';
    $(`lg-r${i}`).className = 'ok';
  }
  await wait(450);
  enterApp();
}

function enterApp() {
  loginEl.classList.add('out');
  setTimeout(() => {
    loginEl.classList.add('hidden');
    cancelAnimationFrame(lgRaf);
  }, 500);
  $('op-name').textContent = OPERATOR.name;
  $('op-chip').hidden = false;
  resize();
  fitBox(SECTORS[OPERATOR.post]);
  showStart();
}

function showLogin(boot = true) {
  running = false;
  closeOverlay();
  loadOperator();
  loginEl.classList.remove('hidden', 'out');
  lgResize();
  cancelAnimationFrame(lgRaf);
  lgRaf = requestAnimationFrame(lgDraw);
  if (boot) bootStage(); else formStage();
}

function logout() {
  $('op-chip').hidden = true;
  showLogin(false);
}

window.addEventListener('resize', () => { if (!loginEl.classList.contains('hidden')) lgResize(); });
$('op-logout').addEventListener('click', logout);
