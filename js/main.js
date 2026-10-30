'use strict';

// Bootstrap: runs after every other script is loaded.
const ro = new ResizeObserver(resize);
ro.observe(mapEl);
ro.observe(chartEl);
window.addEventListener('resize', resize);
resize();
$('ver-tag').textContent = 'v' + APP.version;
showLogin();

// Offline support: only over http(s); opening index.html from disk already
// works without a connection.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => { OFFLINE_READY = true; markOffline(); })
    .catch(() => { /* offline mode unavailable; the game still works online */ });
}
requestAnimationFrame(frame);
