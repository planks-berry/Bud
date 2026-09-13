// Offline support, kept deliberately small.
//
// The game is a handful of static files, so the whole of it fits in the cache on the first
// visit and plays on a tablet with no connection afterwards. Requests go to the network first
// and fall back to the cache, so a new version is picked up on the next online visit without
// any versioning ceremony — and if the network is slow rather than absent, the page waits
// rather than serving something stale.

const CACHE = 'little-kitchen-v1';

const FILES = [
    './',
    './index.html',
    './style.css',
    './game.js',
    './art.js',
    './audio.js',
    './manifest.webmanifest',
    './icon.svg',
];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const copy = response.clone();
                caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
                return response;
            })
            .catch(() => caches.match(event.request, { ignoreSearch: true })),
    );
});
