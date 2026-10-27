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
// A new worker takes over as soon as it has its copy, but the page already open keeps running the
// files it started with; main.js checks for a new worker whenever the playroom is opened or comes
// back to the front, and changes the page over at a quiet moment. The copy is fetched past the
// browser's own cache, so a deploy soon after another cannot be stored with the files it replaced.
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
    'js/version.js',
    'js/parent.js',
    'js/keypad.js',
    'js/band.js',
    'js/start.js',
    'js/shelf.js',
    'js/toys/index.js',
    'js/toys/pond.js',
    'js/toys/busy.js',
    'js/toys/bars.js',
    'js/toys/tower.js',
    'js/toys/pour.js',
    'js/toys/turntable.js',
    'js/toys/records.js',
    'js/toys/scratch.js',
    'js/toys/cubes.js',
    'js/toys/glyphs.js',
    'js/toys/sandpaper.js',
    'js/toys/farm.js',
    'js/toys/farmart.js',
    'js/toys/machines.js',
    'js/toys/dig.js',
    'js/toys/digart.js',
    'js/toys/crane.js',
    'js/toys/craneart.js',
    'js/toys/site.js',
    'js/toys/siteart.js',
    'js/toys/board.js',
    'js/toys/routes.js',
    'js/toys/iso.js',
    'js/toys/birdsong.js',
    'js/toys/tunes.js',
    'js/friend.js',
    'js/toys/weather.js',
    'js/toys/skies.js',
    'js/toys/instruments.js',
    'js/toys/parade.js',
    'js/toys/paradeart.js',
    'js/toys/march.js',
    'js/toys/deckfriend.js',
    'js/toys/fixit.js',
    'js/toys/fixitart.js',
    'js/toys/repairs.js',
    'js/toys/torch.js',
    'js/toys/torchart.js',
    'js/toys/hiding.js',
    'js/toys/bugs.js',
    'js/toys/bugart.js',
    'js/toys/choir.js',
    'js/toys/bakery.js',
    'js/toys/bakeryart.js',
    'js/toys/baking.js',
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
            .then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' }))))
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
