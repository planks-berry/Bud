// The playroom's test suite: source checks in Node, then the real thing in a real browser.
//
// There is no iPad in CI, so the suite does the next best things. It reads the code the way
// Safari 12 would, failing on any syntax or API that arrived after it. It renders every sound in
// Node and checks each for the faults that are hard to hear on a laptop and obvious on an iPad
// speaker. Then it drives every toy with touch events in Chromium, measures the audio that
// actually reaches the output, and does it all a second time with the post-Safari-12 APIs removed
// from the page and an iPad's user agent, so that anything the playroom quietly depends on fails
// here instead.
//
//   node playroom/test.mjs                  everything
//   node playroom/test.mjs --shots DIR      also save a screenshot of every scene into DIR
//
// Needs `playwright` and `acorn` (see docs/PLAYROOM.md); uses the container's Chromium when there
// is one, as web/test.mjs does.

import { chromium } from 'playwright';
import * as acorn from 'acorn';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, extname, relative } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? process.argv[shotsAt + 1] : null;

let failures = 0;

function check(label, condition, detail = '') {
    const mark = condition ? 'ok  ' : 'FAIL';
    if (!condition) failures++;
    console.log(`  ${mark}  ${label}${detail ? `  (${detail})` : ''}`);
}

async function walk(dir) {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(path)));
        else out.push(path);
    }
    return out;
}

// The files that make up the playroom, as served: everything here except the tooling.
const EXCLUDED = /^(node_modules|tools)\/|^(test\.mjs|package\.json|package-lock\.json)$/;
const appFiles = (await walk(here))
    .map((path) => relative(here, path))
    .filter((path) => !EXCLUDED.test(path))
    .sort();
const scripts = appFiles.filter((path) => path.endsWith('.js'));

//==============================================================================
console.log('\nPlayroom — source\n');

// ---- Safari 12 can parse every file ---------------------------------------
//
// ES2017 is what Safari 12 implements in full; optional chaining, nullish coalescing, class fields
// and the rest arrived later and are syntax errors there. A syntax error in any module stops the
// whole graph from loading, which on the iPad is a blank screen.

for (const path of scripts) {
    const source = await readFile(join(here, path), 'utf8');
    let error = '';
    try {
        acorn.parse(source, { ecmaVersion: 2017, sourceType: path === 'sw.js' ? 'script' : 'module' });
    } catch (e) {
        error = e.message;
    }
    check(`${path} parses as ES2017`, !error, error);
}

// ---- and uses nothing Safari 12 lacks --------------------------------------
//
// Each entry is a habit from newer browsers with the version of Safari that brought it.

const FORBIDDEN_JS = [
    [/\bPointerEvent\b|['"]pointer(down|move|up|cancel)['"]/, 'pointer events (Safari 13)'],
    [/\bResizeObserver\b/, 'ResizeObserver (13.1)'],
    [/\bcreateStereoPanner\b/, 'StereoPannerNode (14.1)'],
    [/\bcreateConstantSource\b/, 'ConstantSourceNode (14.1)'],
    [/\bcopyToChannel\b|\bcopyFromChannel\b/, 'AudioBuffer.copyToChannel (14.1)'],
    [/\baudioWorklet\b|\bAudioWorkletNode\b/, 'AudioWorklet (14.5)'],
    [/new\s+AudioContext\s*\(/, 'the unprefixed AudioContext constructor (14.1)'],
    [/\.roundRect\s*\(/, 'CanvasRenderingContext2D.roundRect (16)'],
    [/\.filter\s*=\s*['"`]/, 'canvas filter (not in Safari until 18)'],
    [/\bOffscreenCanvas\b|\bcreateImageBitmap\b/, 'OffscreenCanvas / createImageBitmap (15+)'],
    [/\.replaceAll\s*\(/, 'String.replaceAll (13.1)'],
    [/Object\.fromEntries\b/, 'Object.fromEntries (12.1)'],
    [/\bglobalThis\b/, 'globalThis (12.1)'],
    [/\bstructuredClone\b/, 'structuredClone (15.4)'],
    [/Promise\.(allSettled|any)\b/, 'Promise.allSettled / any (13+)'],
    [/\brequestIdleCallback\b/, 'requestIdleCallback (never shipped in Safari)'],
    [/\bqueueMicrotask\b/, 'queueMicrotask (12.1)'],
    [/\.at\(\s*-?\d/, 'Array.prototype.at (15.4)'],
];

const FORBIDDEN_CSS = [
    [/(^|[;{\s])gap\s*:/m, 'flex gap (14.1)'],
    [/(^|[;{\s])inset\s*:/m, 'inset (14.1)'],
    [/aspect-ratio\s*:/, 'aspect-ratio (15)'],
    [/\bclamp\(/, 'clamp() (13.1)'],
    [/overscroll-behavior/, 'overscroll-behavior (16)'],
    [/:focus-visible/, ':focus-visible (15.4)'],
    [/(^|[;{\s])backdrop-filter\s*:/m, 'unprefixed backdrop-filter (18)'],
    [/@container/, 'container queries (16)'],
];

const offenders = [];
for (const path of scripts) {
    const source = (await readFile(join(here, path), 'utf8')).replace(/\/\/.*$/gm, '');
    for (const [pattern, what] of FORBIDDEN_JS) if (pattern.test(source)) offenders.push(`${path}: ${what}`);
}
for (const path of appFiles.filter((p) => p.endsWith('.css'))) {
    const source = (await readFile(join(here, path), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [pattern, what] of FORBIDDEN_CSS) if (pattern.test(source)) offenders.push(`${path}: ${what}`);
}
check('no API or CSS newer than Safari 12', offenders.length === 0, offenders.join('; '));

// ---- the offline copy is complete ------------------------------------------
//
// A file missing from the service worker's list works perfectly online and fails only on the
// iPad, offline, weeks later.

const sw = await readFile(join(here, 'sw.js'), 'utf8');
const listed = JSON.parse(
    `[${sw
        .slice(sw.indexOf('const FILES = [') + 15, sw.indexOf('];', sw.indexOf('const FILES = [')))
        .replace(/'/g, '"')
        .replace(/,\s*$/, '')}]`
);
const served = appFiles.filter((path) => path !== 'sw.js');
const missing = served.filter((path) => listed.indexOf(path) < 0);
const stale = listed.filter((path) => path !== './' && !existsSync(join(here, path)));
check('every served file is in the offline copy', missing.length === 0, missing.join(', '));
check('the offline copy names no missing file', stale.length === 0, stale.join(', '));

const html = await readFile(join(here, 'index.html'), 'utf8');
const referenced = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]);
const broken = referenced.filter((path) => !existsSync(join(here, path)));
check('everything index.html references exists', broken.length === 0, broken.join(', '));

// ---- every sound renders cleanly --------------------------------------------
//
// Rendered in Node, from the same module the browser uses. A NaN is silence or a crash; a buffer
// that does not start and end at zero clicks; DC thumps the speaker; a peak over 1 distorts.

const synth = await import(pathToFileURL(join(here, 'js/synth.js')).href);
const { noteHz } = synth;
const PARAMS = {
    marimba: [{ f: noteHz(0, 60) }, { f: noteHz(9, 60) }],
    glock: [{ f: noteHz(0, 72) }, { f: noteHz(9, 72) }],
    chime: [{ f: noteHz(5, 60) }, { f: noteHz(12, 60) }],
    musicBox: [{ f: 523.25 }, { f: 880 }],
    drop: [{ f: noteHz(3, 60) }, { f: noteHz(12, 60) }, { f: noteHz(1, 48) }],
    bubble: [{ f: 1400 }, { f: 3000 }],
    wood: [{ f: noteHz(0, 60) }, { f: noteHz(9, 60) }, { f: 1046.5 }],
    click: [{ variant: 'on' }, { variant: 'off' }],
    tick: [{ f: noteHz(0, 72) }, { f: 1568 }],
    pop: [{ f: 500 }, { f: 700 }],
    thud: [{ f: 85 }, { f: 110 }],
    tink: [{ f: noteHz(6, 60) }, { f: noteHz(14, 60) }, { f: 2000 }],
    rustle: [{}],
    whoosh: [{ variant: 'up' }, { variant: 'down' }],
    zip: [{ seed: 1 }, { seed: 2 }, { seed: 3 }],
    squeak: [{ f: 1400 }],
    gulp: [{ f: 220 }, { f: noteHz(10, 48) }],
    creak: [{}],
    latch: [{}],
    pat: [{}],
};

const recipeFaults = [];
let recipeCount = 0;
for (const sr of [44100, 48000]) {
    for (const name of Object.keys(synth.recipes)) {
        if (!PARAMS[name]) recipeFaults.push(`${name}: no test parameters`);
        for (const params of PARAMS[name] || []) {
            recipeCount++;
            const b = synth.render(name, sr, params);
            let peak = 0;
            let mean = 0;
            let finite = true;
            for (const v of b) {
                if (!Number.isFinite(v)) finite = false;
                peak = Math.max(peak, Math.abs(v));
                mean += v;
            }
            mean /= b.length;
            const where = `${name}${params.f ? `@${Math.round(params.f)}` : ''}${params.variant ? `:${params.variant}` : ''} ${sr}`;
            if (!finite) recipeFaults.push(`${where}: not finite`);
            if (peak > 1 || peak < 0.05) recipeFaults.push(`${where}: peak ${peak.toFixed(3)}`);
            if (Math.abs(b[0]) > 1e-3) recipeFaults.push(`${where}: starts at ${b[0].toFixed(4)}`);
            if (Math.abs(b[b.length - 1]) > 1e-3)
                recipeFaults.push(`${where}: ends at ${b[b.length - 1].toFixed(4)}`);
            if (Math.abs(mean) > 2e-3) recipeFaults.push(`${where}: DC ${mean.toExponential(1)}`);
            if (b.length / sr > 3.5) recipeFaults.push(`${where}: ${(b.length / sr).toFixed(2)} s long`);
        }
    }
}
check(
    `${recipeCount} sounds render finite, unclipped, click-free and DC-free`,
    recipeFaults.length === 0,
    recipeFaults.slice(0, 6).join('; ')
);

const loops = [
    synth.whiteNoise(48000),
    synth.pinkNoise(48000),
    synth.sandNoise(48000),
    ...synth.impulseResponse(48000),
];
check(
    'noise loops and the room render finite',
    loops.every((b) => b.every(Number.isFinite) && b.some((v) => v !== 0))
);

// ---- and the mix holds together -------------------------------------------------
//
// Loudness estimated as the RMS of a sound's loudest 100 ms, with the ends of the spectrum
// discounted as the ear does (one-pole high-pass at 150 Hz, low-pass at 6 kHz). Not a perceptual
// model, but enough to catch the regression that matters: one sound in a toy suddenly much louder
// or quieter than its neighbours. The bands are the mix's design, written down.

function loudness(samples, sr) {
    const hp = 1 - Math.exp((-2 * Math.PI * 150) / sr);
    const lp = 1 - Math.exp((-2 * Math.PI * 6000) / sr);
    const shaped = new Float32Array(samples.length);
    let low = 0;
    let high = 0;
    for (let i = 0; i < samples.length; i++) {
        low += lp * (samples[i] - low);
        high += hp * (low - high);
        shaped[i] = low - high;
    }
    const window = Math.floor(sr * 0.1);
    let best = 0;
    for (let start = 0; start < Math.max(1, shaped.length - window); start += Math.floor(sr * 0.01)) {
        let energy = 0;
        const n = Math.min(window, shaped.length - start);
        for (let i = 0; i < n; i++) energy += shaped[start + i] * shaped[start + i];
        best = Math.max(best, Math.sqrt(energy / window));
    }
    return 20 * Math.log10(best);
}

const BANDS = [
    ['notes', [-19.5, -14.5], ['marimba', 'glock', 'chime', 'musicBox', 'drop', 'wood']],
    [
        'foley',
        [-24, -18.5],
        ['click', 'tick', 'pop', 'thud', 'tink', 'squeak', 'gulp', 'creak', 'latch', 'pat'],
    ],
    ['air', [-27, -21.5], ['bubble', 'rustle', 'whoosh']],
    ['zip teeth', [-30, -24.5], ['zip']],
];
const mixFaults = [];
const banded = new Set();
for (const [band, [lo, hi], names] of BANDS) {
    for (const name of names) {
        banded.add(name);
        const samples = synth.render(name, 44100, PARAMS[name][0]);
        const level = loudness(
            samples.map((v) => v * synth.MIX[name]),
            44100
        );
        if (level < lo || level > hi)
            mixFaults.push(`${name} at ${level.toFixed(1)} dB, outside the ${band} band (${lo}..${hi})`);
    }
}
for (const name of Object.keys(synth.recipes)) {
    if (!banded.has(name)) mixFaults.push(`${name} is in no band`);
    if (!(name in synth.MIX)) mixFaults.push(`${name} has no mix level`);
}
check('every sound sits in its band of the mix', mixFaults.length === 0, mixFaults.join('; '));

// ---- the letters and numerals ------------------------------------------------

const glyphs = await import(pathToFileURL(join(here, 'js/toys/glyphs.js')).href);
const letters = glyphs.LETTER_LIST.map((g) => g.ch).join('');
const numerals = glyphs.NUMERAL_LIST.map((g) => g.ch).join('');
check('all twenty-six lowercase letters', letters === 'abcdefghijklmnopqrstuvwxyz', letters);
check('the numerals 0 to 9', numerals === '0123456789', numerals);
const shapeFaults = [];
for (const g of glyphs.LETTER_LIST.concat(glyphs.NUMERAL_LIST)) {
    if (g.strokes.some((s) => s.length < 2)) shapeFaults.push(`${g.ch}: empty stroke`);
    if (g.box.y0 < -1.75 || g.box.y1 > 0.72)
        shapeFaults.push(
            `${g.ch}: leaves the writing lines (${g.box.y0.toFixed(2)}..${g.box.y1.toFixed(2)})`
        );
    if (g.box.x1 - g.box.x0 > 1.25) shapeFaults.push(`${g.ch}: too wide`);
    const start = g.strokes[0][0];
    if (glyphs.nearest(g, start[0], start[1]).d > 1e-9)
        shapeFaults.push(`${g.ch}: nearest() misses its own start`);
}
check(
    'every glyph stays on the writing lines and is traceable',
    shapeFaults.length === 0,
    shapeFaults.join('; ')
);

//==============================================================================
// The browser

const TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (request, response) => {
    const path = request.url.split('?')[0];
    const file = join(here, path === '/' ? 'index.html' : path);
    try {
        if (!file.startsWith(here) || statSync(file).isDirectory()) throw new Error('no');
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
        response.end(body);
    } catch {
        response.writeHead(404).end('not found');
    }
});
await new Promise((resolve) => server.listen(0, resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath =
    process.env.BUD_CHROME || (existsSync(CONTAINER_CHROME) ? CONTAINER_CHROME : undefined);
const browser = await chromium.launch({ executablePath });
if (SHOTS) await mkdir(SHOTS, { recursive: true });

const IPAD_12 =
    'Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1';

// Take away, before any of the page's code runs, what Safari 12 does not have.
function removeNewerApis() {
    const real = window.AudioContext;
    window.webkitAudioContext = real;
    delete window.AudioContext;
    const gone = [
        [window, ['PointerEvent', 'ResizeObserver', 'OffscreenCanvas', 'structuredClone', 'queueMicrotask']],
        [Navigator.prototype, ['audioSession']],
        [
            window.BaseAudioContext && BaseAudioContext.prototype,
            ['createStereoPanner', 'createConstantSource'],
        ],
        [AudioBuffer.prototype, ['copyToChannel', 'copyFromChannel']],
        [AnalyserNode.prototype, ['getFloatTimeDomainData']],
        [CanvasRenderingContext2D.prototype, ['roundRect']],
        [Array.prototype, ['at']],
        [String.prototype, ['replaceAll']],
        [Object, ['fromEntries']],
        [Promise, ['allSettled', 'any']],
    ];
    for (const [owner, names] of gone) {
        if (!owner) continue;
        for (const name of names) {
            try {
                delete owner[name];
            } catch (error) {
                /* not configurable: nothing to do */
            }
        }
    }
}

async function suite(mode) {
    const safari = mode === 'safari12';
    console.log(
        `\nPlayroom — ${safari ? 'with Safari 12 APIs only, as an iPad' : 'in Chromium, as an iPad'}\n`
    );

    const context = await browser.newContext({
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        userAgent: safari ? IPAD_12 : undefined,
    });
    if (safari) await context.addInitScript(removeNewerApis);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });

    const cdp = await context.newCDPSession(page);
    const touch = {
        down: (x, y) =>
            cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }),
        move: (x, y) =>
            cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }),
        up: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
        async tap(x, y) {
            await this.down(x, y);
            await page.waitForTimeout(50);
            await this.up();
        },
        // `settle`: hold still before lifting, as a careful hand does; otherwise the release
        // carries the finger's speed, which is a throw.
        async drag(points, ms = 16, settle = 0) {
            await this.down(points[0][0], points[0][1]);
            for (const [x, y] of points.slice(1)) {
                await page.waitForTimeout(ms);
                await this.move(x, y);
            }
            await page.waitForTimeout(ms + settle);
            await this.up();
        },
    };
    const line = (x0, y0, x1, y1, n = 20) =>
        Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
    const arc = (cx, cy, r, a0, a1, n = 30) =>
        Array.from({ length: n + 1 }, (_, i) => [
            cx + r * Math.cos(a0 + ((a1 - a0) * i) / n),
            cy + r * Math.sin(a0 + ((a1 - a0) * i) / n),
        ]);
    const scene = (fn, arg) => page.evaluate(fn, arg);
    const sceneName = () => scene(() => window.playroom.stage.scene.constructor.name);

    // The loudest sample reaching the output over a short window.
    const peak = (ms = 500) =>
        page.evaluate(async (ms) => {
            let max = 0;
            const end = Date.now() + ms;
            while (Date.now() < end) {
                max = Math.max(max, window.playroom.audio.peak());
                await new Promise((r) => setTimeout(r, 25));
            }
            return max;
        }, ms);

    const shot = async (name) => {
        if (SHOTS) await page.screenshot({ path: join(SHOTS, `${mode}-${name}.png`) });
    };

    await page.goto(url);
    await page.waitForFunction(() => window.__playroomBooted === true, null, { timeout: 15000 });

    // ---- the first screen --------------------------------------------------

    check('boots to the bud', (await sceneName()) === 'StartScene');
    check(
        'no audio context before a touch',
        (await scene(() => window.playroom.audio.stats().state)) === 'none'
    );
    await shot('start');

    await touch.tap(512, 330);
    const bloom = await peak(600);
    const stats = await scene(() => window.playroom.audio.stats());
    check('the first touch starts the audio', stats.state === 'running', stats.state);
    check('and the bud blooms with a chord', bloom > 0.02, `peak ${bloom.toFixed(3)}`);
    if (safari) {
        check(
            'it plays through the prefixed webkitAudioContext',
            await page.evaluate(() => !('AudioContext' in window) && !!window.webkitAudioContext)
        );
        check('on iOS, the silent-switch workaround is in place', stats.silentElement === true);
    }

    await page.waitForTimeout(1800);
    check('then the shelf', (await sceneName()) === 'ShelfScene');
    const trays = await scene(() => window.playroom.shelf.items.map((item) => item.toy.id));
    check('eight trays on the shelf', trays.length === 8, trays.join(' '));
    await shot('shelf');

    // A still shelf draws nothing: an iPad left on the playroom stays cool.
    await page.waitForTimeout(700);
    const framesA = await scene(() => window.playroom.stage.frames);
    await page.waitForTimeout(800);
    const framesB = await scene(() => window.playroom.stage.frames);
    check(
        'the frame loop sleeps when nothing moves',
        framesB === framesA,
        `${framesB - framesA} frames while idle`
    );

    const open = async (id) => {
        const r = await scene((id) => window.playroom.shelf.rectOf(id), id);
        await touch.tap(r.x + r.w / 2, r.y + r.h / 2);
        await page.waitForTimeout(800);
    };
    const home = async () => {
        await touch.tap(48, 48);
        await page.waitForTimeout(700);
        return sceneName();
    };

    // ---- pond ----------------------------------------------------------------

    await open('pond');
    check('pond opens', (await sceneName()) === 'PondScene');
    await touch.tap(420, 380);
    check('a tap on the water sounds', (await peak(300)) > 0.02);
    check('and ripples', (await scene(() => window.playroom.stage.scene.ripples.length)) > 0);
    const pot = await scene(() => ({
        x: window.playroom.stage.scene.pot.x,
        y: window.playroom.stage.scene.pot.y,
    }));
    await touch.drag(line(pot.x, pot.y, 520, 420, 24));
    check('food scatters from the pot', (await scene(() => window.playroom.stage.scene.crumbs.length)) > 0);
    await shot('pond');
    check('home from the pond', (await home()) === 'ShelfScene');

    // ---- busy board ------------------------------------------------------------

    await open('busy');
    const widgets = await scene(() =>
        window.playroom.stage.scene.widgets.map((w) => ({
            kind: w.constructor.name,
            x: w.x,
            y: w.y,
            w: w.w,
            h: w.h,
        }))
    );
    const at = (kind) => widgets.find((w) => w.kind === kind);
    const lamp = at('Lamp');
    await touch.tap(lamp.x + lamp.w / 2, lamp.y + lamp.h / 2);
    check('the lamp switch clicks', (await peak(200)) > 0.02);
    check(
        'and the lamp is on',
        await scene(() => window.playroom.stage.scene.widgets.find((w) => w.constructor.name === 'Lamp').on)
    );
    const dial = at('Dial');
    await touch.drag(arc(dial.x + dial.w / 2, dial.y + dial.h * 0.64, 60, -1.5, 1.2));
    check(
        'the dial turns through its detents',
        (await scene(
            () => window.playroom.stage.scene.widgets.find((w) => w.constructor.name === 'Dial').index
        )) !== 0
    );
    const zip = at('Zipper');
    await touch.drag(
        line(zip.x + zip.w * 0.1 + 22, zip.y + zip.h * 0.51, zip.x + zip.w * 0.85, zip.y + zip.h * 0.51, 30)
    );
    check(
        'the zip opens',
        (await scene(
            () => window.playroom.stage.scene.widgets.find((w) => w.constructor.name === 'Zipper').z
        )) > 0.6
    );
    const box = at('MusicBox');
    const axle = { x: box.x + box.w * 0.7 + 16, y: box.y + box.h * 0.64 };
    await touch.drag(arc(axle.x, axle.y, 50, 0, Math.PI * 3, 40));
    check(
        'the crank plays the tune',
        (await scene(
            () => window.playroom.stage.scene.widgets.find((w) => w.constructor.name === 'MusicBox').index
        )) >= 6
    );
    const door = at('Door');
    await touch.tap(door.x + door.w / 2, door.y + door.h / 2);
    await page.waitForTimeout(500);
    check(
        'the door opens',
        (await scene(
            () => window.playroom.stage.scene.widgets.find((w) => w.constructor.name === 'Door').open.value
        )) > 0.5
    );
    await shot('busy');
    check('home from the busy board', (await home()) === 'ShelfScene');

    // ---- tone bars -------------------------------------------------------------

    await open('bars');
    const bars = await scene(() =>
        window.playroom.stage.scene.order.map((b) => window.playroom.stage.scene.barRect(b))
    );
    const mid = bars[3];
    await touch.tap(mid.x + mid.w / 2, mid.y + mid.h / 2);
    check('a bar sounds', (await peak(300)) > 0.02);
    const y = bars[bars.length - 1].y + bars[bars.length - 1].h / 2;
    await touch.drag(line(bars[0].x + 5, y, bars[bars.length - 1].x + 5, y, 40));
    check(
        'a sweep plays every bar',
        (await scene(() => window.playroom.stage.scene.echo.notes.length)) >= bars.length
    );
    const shell = await scene(() => window.playroom.stage.scene.shell);
    await touch.tap(shell.x, shell.y);
    check('the shell plays the phrase back', await scene(() => window.playroom.stage.scene.echo.playing));
    await shot('bars');
    check('home from the bars', (await home()) === 'ShelfScene');

    // ---- pink tower --------------------------------------------------------------

    await open('tower');
    const cubes = await scene(() =>
        window.playroom.stage.scene.cubes.map((c) => ({ rank: c.rank, x: c.x, y: c.y, s: c.s }))
    );
    const big = cubes.find((c) => c.rank === 0);
    const small = cubes.find((c) => c.rank === cubes.length - 1);
    await touch.drag(line(small.x, small.y - small.s / 2, big.x, big.y - big.s - 80, 24), 16, 300);
    await page.waitForTimeout(1200);
    const landed = await scene((rank) => {
        const s = window.playroom.stage.scene;
        const c = s.cubes.find((c) => c.rank === rank);
        return { state: c.state, y: c.y, floor: s.floor };
    }, small.rank);
    check(
        'a cube carried onto another stacks on it',
        landed.state === 'rest' && landed.y < landed.floor - 20,
        `${landed.state} at ${Math.round(landed.y)}`
    );
    await touch.tap(big.x, big.y - big.s / 2);
    check('tapping the base plays the stack', (await peak(500)) > 0.02);
    await shot('tower');
    check('home from the tower', (await home()) === 'ShelfScene');

    // ---- pouring -------------------------------------------------------------------

    await open('pour');
    const vessels = await scene(() =>
        window.playroom.stage.scene.vessels.map((v) => ({ kind: v.kind, x: v.x, y: v.y, h: v.h }))
    );
    const pitcher = vessels.find((v) => v.kind === 'pitcher');
    const glass = vessels.find((v) => v.kind === 'glass');
    await touch.down(pitcher.x, pitcher.y - pitcher.h / 2);
    for (const [x, yy] of line(
        pitcher.x,
        pitcher.y - pitcher.h / 2,
        glass.x + 30,
        glass.y - glass.h - 90,
        20
    )) {
        await page.waitForTimeout(16);
        await touch.move(x, yy);
    }
    await page.waitForTimeout(900);
    const pouringPeak = await peak(400);
    await touch.up();
    const filled = await scene(() =>
        Math.max(...window.playroom.stage.scene.vessels.filter((v) => v.kind === 'glass').map((v) => v.vol))
    );
    check('a pitcher held over a glass pours into it', filled > 0.2, `glass at ${filled.toFixed(2)}`);
    check('pouring sounds', pouringPeak > 0.02, `peak ${pouringPeak.toFixed(3)}`);
    await shot('pour');
    check('home from pouring', (await home()) === 'ShelfScene');

    // ---- easel ------------------------------------------------------------------------

    await open('easel');
    const sheet = await scene(() => window.playroom.stage.scene.sheet);
    const sample = () =>
        scene(() => {
            const paper = window.playroom.stage.scene.paper.canvas;
            const data = paper
                .getContext('2d')
                .getImageData(paper.width / 2 - 40, paper.height / 2 - 40, 80, 80).data;
            let sum = 0;
            for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
            return sum / (data.length / 4);
        });
    const before = await sample();
    const cx = sheet.x + sheet.w / 2;
    const cy = sheet.y + sheet.h / 2;
    await touch.drag(line(cx - 120, cy - 40, cx + 120, cy + 40, 30));
    const after = await sample();
    check('a finger paints on the paper', after < before - 2, `${before.toFixed(0)} -> ${after.toFixed(0)}`);
    const pots = await scene(() => window.playroom.stage.scene.paints.map((p) => ({ x: p.x, y: p.y })));
    await touch.tap(pots[1].x, pots[1].y);
    check('a pot chooses its colour', (await scene(() => window.playroom.stage.scene.current)) === 1);
    const stencils = await scene(() => window.playroom.stage.scene.stencils.map((s) => ({ x: s.x, y: s.y })));
    if (stencils.length) {
        await touch.tap(stencils[0].x, stencils[0].y);
        check('a metal inset lies on the paper', await scene(() => !!window.playroom.stage.scene.plate));
        await touch.tap(stencils[0].x, stencils[0].y);
        check('and lifts off again', await scene(() => !window.playroom.stage.scene.plate));
    }
    await shot('easel');
    check('home from the easel', (await home()) === 'ShelfScene');
    await open('easel');
    check('the painting is still there when you come back', Math.abs((await sample()) - after) < 1);
    await home();

    // ---- sandpaper letters ----------------------------------------------------------------

    await open('letters');
    check('letters open to their box', (await scene(() => window.playroom.stage.scene.view)) === 'box');
    const tile = await scene(() => window.playroom.stage.scene.tiles[14]);
    await touch.tap(tile.x + tile.w / 2, tile.y + tile.h / 2);
    await page.waitForTimeout(600);
    check('a tile opens its board', (await scene(() => window.playroom.stage.scene.view)) === 'board');
    const o = await scene(() => {
        const s = window.playroom.stage.scene;
        const g = s.placement();
        return { ch: s.glyph().ch, ox: s.board.x + g.ox, oy: s.board.y + g.oy, s: g.s };
    });
    check('the fifteenth board is o', o.ch === 'o', o.ch);
    // Round the o, on the sand.
    await touch.drag(
        arc(o.ox + 0.48 * o.s, o.oy - 0.5 * o.s, 0.49 * o.s, -1.6, -1.6 - Math.PI * 1.8, 50),
        18
    );
    check(
        'tracing the sand leaves a trail',
        (await scene(() => window.playroom.stage.scene.trail.length)) > 20
    );
    await touch.down(o.ox + 0.48 * o.s, o.oy - 0.5 * o.s);
    for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(16);
        await touch.move(o.ox + 0.48 * o.s + i * 4, o.oy - 0.5 * o.s);
    }
    check(
        'the smooth board is silent',
        (await scene(
            () =>
                window.playroom.stage.scene.trail.filter((p) => window.playroom.stage.scene.time - p.t < 0.05)
                    .length
        )) === 0
    );
    await touch.up();
    const demo = await scene(() => window.playroom.stage.scene.demoButton);
    await touch.tap(demo.x, demo.y);
    await page.waitForTimeout(900);
    check('the guide shows how it is written', await scene(() => !!window.playroom.stage.scene.demo));
    await shot('letters');
    check('home from the letters', (await home()) === 'ShelfScene');

    // ---- sandpaper numerals ------------------------------------------------------------------

    await open('numerals');
    const five = await scene(() => window.playroom.stage.scene.tiles[5]);
    await touch.tap(five.x + five.w / 2, five.y + five.h / 2);
    await page.waitForTimeout(600);
    const bowl = await scene(() => ({
        x: window.playroom.stage.scene.bowl.x,
        y: window.playroom.stage.scene.bowl.y,
    }));
    await touch.tap(bowl.x, bowl.y);
    await page.waitForTimeout(1500);
    const counted = await scene(() => window.playroom.stage.scene.counters.filter((c) => c.landed).length);
    check('the bowl lays out five counters for 5', counted === 5, `${counted}`);
    await shot('numerals');
    check('home from the numerals', (await home()) === 'ShelfScene');

    // ---- the grown-up's corner ------------------------------------------------------------------

    const gate = await page.evaluate(() => {
        const r = document.getElementById('gate').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await touch.tap(gate.x, gate.y);
    await page.waitForTimeout(300);
    check(
        'a tap on the leaf does not open the settings',
        await page.evaluate(() => document.getElementById('parent').hidden)
    );
    await touch.down(gate.x, gate.y);
    await page.waitForTimeout(3300);
    await touch.up();
    check(
        'holding it for three seconds does',
        await page.evaluate(() => !document.getElementById('parent').hidden)
    );
    await shot('parent');
    await page.click('[data-stages] button:nth-child(1)');
    check(
        'the stage can be set to Seed, and is remembered',
        await page.evaluate(() => JSON.parse(localStorage.getItem('playroom.settings.v1')).stage === 'seed')
    );
    await page.click('[data-shelf] button:nth-child(2)');
    check('a toy can be put away', (await scene(() => window.playroom.shelf.items.length)) === 7);
    await page.click('[data-shelf] button:nth-child(2)');
    check('and brought back', (await scene(() => window.playroom.shelf.items.length)) === 8);
    await page.click('[data-close]');
    check('Done closes the settings', await page.evaluate(() => document.getElementById('parent').hidden));
    await open('busy');
    check(
        'Seed puts out a smaller busy board',
        (await scene(() => window.playroom.stage.scene.widgets.length)) === 4
    );
    await home();

    // ---- turning the iPad ----------------------------------------------------------------------

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(700);
    check('the stage follows a rotation', (await scene(() => window.playroom.stage.w)) === 768);
    await open('pond');
    await touch.tap(380, 500);
    check('and a toy still works in portrait', (await peak(300)) > 0.02);
    await shot('portrait-pond');
    await home();
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(500);

    // Every toy has been opened and put away: nothing it was sounding should still be running.
    check('leaving a toy stops its sounds', (await scene(() => window.playroom.audio.stats().textures)) === 0);

    // ---- nothing went wrong along the way ----------------------------------------------------------

    check('no errors on the page', errors.length === 0, errors.slice(0, 3).join(' | '));

    // ---- offline -----------------------------------------------------------------------------------

    if (!safari) {
        const cachedFiles = await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
            const keys = await caches.keys();
            const cache = await caches.open(keys.find((k) => k.indexOf('playroom-') === 0));
            return (await cache.keys()).length;
        });
        check(
            'the service worker keeps an offline copy',
            cachedFiles === listed.length,
            `${cachedFiles} of ${listed.length} files`
        );
        await context.setOffline(true);
        await page.reload();
        const offline = await page
            .waitForFunction(() => window.__playroomBooted === true, null, { timeout: 10000 })
            .then(
                () => true,
                () => false
            );
        check('and the playroom opens with no connection', offline);
        await context.setOffline(false);
    }

    await context.close();
}

await suite('chromium');
await suite('safari12');

await browser.close();
server.close();

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
