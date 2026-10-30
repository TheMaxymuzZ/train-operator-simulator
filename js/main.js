'use strict';

// Bootstrap: runs after every other script is loaded.
const ro = new ResizeObserver(resize);
ro.observe(mapEl);
ro.observe(chartEl);
window.addEventListener('resize', resize);
resize();
$('ver-tag').textContent = 'v' + APP.version;
showStart();
requestAnimationFrame(frame);
