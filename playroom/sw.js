// The playroom's offline copy.
//
// The first visit over the network installs this worker, which stores every file the playroom
// needs. From then on the home-screen icon opens it with no connection at all: a playroom should
// not need Wi-Fi. iOS has supported this since 11.3, so the iPad Air's 12.5 is comfortably in.
//
// VERSION is stamped with the commit when the site is published (see .github/workflows/pages.yml),
// so each deploy gets a fresh cache and the old one is cleared on activation. Unstamped, as it is
// when served from a working copy, the worker goes to the network first and uses the cache only
// as a fallback, so a developer never sees yesterday's files.
//
// FILES must list everything the page loads; `test.mjs` checks it against the directory, because a
// file missing here works perfectly online and breaks only on the iPad, offline, later.

const VERSION = '__VERSION__';
const CACHE = `playroom-${VERSION}`;
const STAMPED = VERSION.indexOf('__') !== 0;

const FILES = [
    './',
    'index.html',
    'style.css',
    'manifest.webmanifest',
    'js/main.js',
    'js/stage.js',
    'js/audio.js',
    'js/synth.js',
    'js/draw.js',
    'js/util.js',
    'js/settings.js',
    'js/parent.js',
    'js/start.js',
    'js/shelf.js',
    'js/toys/index.js',
    'js/toys/pond.js',
    'js/toys/busy.js',
    'js/toys/bars.js',
    'js/toys/tower.js',
    'js/toys/pour.js',
    'js/toys/easel.js',
    'js/toys/cubes.js',
    'js/toys/glyphs.js',
    'js/toys/sandpaper.js',
    'js/toys/farm.js',
    'js/toys/farmart.js',
    'js/toys/machines.js',
    'js/toys/dig.js',
    'js/toys/crane.js',
    'js/toys/site.js',
    'js/toys/siteart.js',
    'js/toys/board.js',
    'icons/icon-32.png',
    'icons/icon-152.png',
    'icons/icon-167.png',
    'icons/icon-180.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/splash-1536x2048.png',
    'icons/splash-2048x1536.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) => cache.addAll(FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.indexOf('playroom-') === 0 && key !== CACHE)
                        .map((key) => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const cached = () => caches.match(request, { ignoreSearch: true });
    if (STAMPED) {
        event.respondWith(cached().then((hit) => hit || fetch(request)));
    } else {
        event.respondWith(fetch(request).catch(() => cached().then((hit) => hit || Response.error())));
    }
});
