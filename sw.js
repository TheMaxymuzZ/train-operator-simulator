'use strict';

// Service worker: keeps a copy of every file so the simulator works offline.
// The cache is named after the app version, so each release replaces it.
importScripts('js/version.js');

const CACHE = `ctc-es-${APP.version}`;
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/data.js',
  'js/version.js',
  'js/sim.js',
  'js/ui.js',
  'js/panels.js',
  'js/login.js',
  'js/main.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('ctc-es-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first, so a new release shows up as soon as there is connection;
// the cached copy is used when the network fails.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
