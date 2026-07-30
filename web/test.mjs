// End-to-end test of the web build, in a real browser.
//
// The point is to check the things that cannot be checked by compiling: that the AudioWorklet
// actually loads the module, that the engine initialises inside it, that the interface builds
// itself from the parameter table the engine sent, and — the one that matters — that audio comes
// out and stops when it should.
//
//   node web/test.mjs                 the multi-file build in this directory
//   node web/test.mjs --bundle        the single file produced by bundle.mjs
//   node web/test.mjs --bundle --csp  the same, under a restrictive Content-Security-Policy
//
// The bundle is worth running the *same* checks against rather than a lighter smoke test: it
// rewrites how the worklet is loaded, and a worklet that fails to load is invisible except as
// silence. `--csp` covers the case of a host that serves it under a policy of its own.
//
// Audio is measured by tapping the live graph through an AnalyserNode, so what the test observes
// is what the page is really producing rather than a separate render.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

const TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
};

const BUNDLE = process.argv.includes('--bundle');
const ENTRY = BUNDLE ? '/bud-standalone.html' : '/index.html';

// What the page actually needs, and nothing else. Starting from `default-src 'none'` and adding
// only what the bundle asks for is the point: it proves there is no network dependency hiding in
// here — no CDN, no font, no fetch of the wasm — which is the property that lets this be handed
// to someone as a file. The `data:` image is the placeholder favicon in the page head.
const CSP = process.argv.includes('--csp')
    ? "default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; "
      + "style-src 'unsafe-inline'; img-src data:; worker-src blob:"
    : null;

let failures = 0;

function check(label, condition, detail = '') {
    const mark = condition ? 'ok  ' : 'FAIL';
    if (!condition) failures++;
    console.log(`  ${mark}  ${label}${detail ? `  (${detail})` : ''}`);
}

const server = createServer(async (request, response) => {
    const path = request.url === '/' ? ENTRY : request.url.split('?')[0];

    try {
        const body = await readFile(join(here, path));
        const headers = { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' };
        if (CSP) headers['Content-Security-Policy'] = CSP;

        response.writeHead(200, headers);
        response.end(body);
    } catch {
        response.writeHead(404).end('not found');
    }
});

await new Promise((resolve) => server.listen(0, resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

// This container ships its own Chromium; a CI runner installs one through Playwright. Detect
// rather than assume, so the same test runs in both places without a flag.
const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const executablePath = process.env.BUD_CHROME
    || (existsSync(CONTAINER_CHROME) ? CONTAINER_CHROME : undefined);

const browser = await chromium.launch({
    executablePath,
    args: ['--autoplay-policy=no-user-gesture-required'],
});

const page = await browser.newPage();

const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
});

console.log(`\nBud — ${BUNDLE ? 'single-file bundle' : 'web build'}${CSP ? ', under CSP' : ''}\n`);

await page.goto(url);

// ---- the engine reaches the worklet and reports back ----------------------

await page.waitForFunction(() => window.bud && window.bud.parameters.length > 0, null,
                           { timeout: 30000 });

const meta = await page.evaluate(() => ({
    parameters: window.bud.parameters.length,
    tracks: window.bud.tracks.length,
    knobs: window.bud.knobKinds.knobs.length,
    sampleRate: window.bud.context.sampleRate,
    firstTrack: window.bud.tracks[0].short,
    lastTrack: window.bud.tracks[window.bud.tracks.length - 1].short,
}));

check('worklet loads and the engine initialises', meta.parameters > 0);
check('parameter table crosses the boundary', meta.parameters >= 60, `${meta.parameters} parameters`);
check('all eleven tracks arrive', meta.tracks === 11, `${meta.firstTrack} … ${meta.lastTrack}`);
check('the eleven micro knobs arrive', meta.knobs === 11, `${meta.knobs}`);

// ---- the interface builds itself from that table --------------------------

const grid = await page.evaluate(() => ({
    rows: document.querySelectorAll('.track-row').length,
    steps: document.querySelectorAll('.step').length,
    controls: document.querySelectorAll('.control').length,
    lit: document.querySelectorAll('.step.on').length,
}));

check('a row per track', grid.rows === 11);
check('sixteen steps per track', grid.steps === 11 * 16, `${grid.steps} keys`);
check('controls generated, not hand-written', grid.controls > 12, `${grid.controls} controls`);
check('the demo pattern is lit on the grid', grid.lit > 8, `${grid.lit} steps on`);

// ---- audio ---------------------------------------------------------------

// Tap the graph the page is really using.
await page.evaluate(() => {
    const analyser = window.bud.context.createAnalyser();
    analyser.fftSize = 2048;
    window.bud.node.connect(analyser);
    window.__analyser = analyser;
    window.__buffer = new Float32Array(analyser.fftSize);
});

const measure = async () => page.evaluate(async () => {
    // Take the loudest of several looks, so a measurement between drum hits is not mistaken
    // for silence.
    let peak = 0;

    for (let i = 0; i < 25; i++) {
        window.__analyser.getFloatTimeDomainData(window.__buffer);
        for (const v of window.__buffer) peak = Math.max(peak, Math.abs(v));
        await new Promise((r) => setTimeout(r, 40));
    }

    return peak;
});

const silent = await measure();
check('silent before play', silent < 0.001, `peak ${silent.toFixed(5)}`);

await page.click('#play');
await page.waitForTimeout(400);

const playing = await measure();
check('audio when playing', playing > 0.02, `peak ${playing.toFixed(4)}`);

const head = await page.evaluate(() => window.bud.heads[0]);
check('the playhead advances', typeof head === 'number');

await page.waitForTimeout(300);
const advanced = await page.evaluate(() => document.querySelectorAll('.step.playing').length);
check('the grid follows the playhead', advanced > 0, `${advanced} lit`);

await page.click('#stop');
await page.waitForTimeout(1200);

const stopped = await measure();
check('silent after stop', stopped < 0.02, `peak ${stopped.toFixed(4)}`);

// ---- editing -------------------------------------------------------------

await page.click('#clear');
await page.waitForTimeout(200);
const cleared = await page.evaluate(() => document.querySelectorAll('.step.on').length);
check('CLR PTN empties the grid', cleared === 0, `${cleared} lit`);

await page.click('.step[data-track="0"][data-step="0"]');
await page.waitForTimeout(200);
const afterToggle = await page.evaluate(() =>
    document.querySelector('.step[data-track="0"][data-step="0"]').classList.contains('on'));
check('a step key toggles a note on', afterToggle);

await page.click('.step[data-track="0"][data-step="0"]');
await page.waitForTimeout(200);
const afterSecond = await page.evaluate(() =>
    document.querySelector('.step[data-track="0"][data-step="0"]').classList.contains('on'));
check('pressing it again removes the note', !afterSecond);

await page.click('#demo');
await page.waitForTimeout(200);
const restored = await page.evaluate(() => document.querySelectorAll('.step.on').length);
check('DEMO reloads a pattern', restored > 8, `${restored} steps on`);

// ---- touch ---------------------------------------------------------------
// An iPad has no shift key, so accent has to be reachable by holding. This is the interaction
// the whole tablet story depends on, so it is checked rather than assumed.

const touch = await browser.newContext({
    viewport: { width: 834, height: 1194 },
    hasTouch: true,
    deviceScaleFactor: 2,
});

const tablet = await touch.newPage();
await tablet.goto(url);
await tablet.waitForFunction(() => window.bud?.parameters.length > 0, null, { timeout: 30000 });

const overflow = await tablet.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
}));
check('no sideways scrolling on a tablet', overflow.scroll <= overflow.client,
      `${overflow.scroll} vs ${overflow.client}`);

const keySize = await tablet.evaluate(() =>
    document.querySelector('.step').getBoundingClientRect().height);
check('step keys are a comfortable touch target', keySize >= 44, `${keySize}px`);

// Press and hold an already-lit step: it should gain an accent, not vanish. Tapping first
// would turn the note off, and an accent on an unlit step has nothing to show.
const target = '.step[data-track="0"][data-step="0"]';

const lit = await tablet.evaluate((s) => document.querySelector(s).classList.contains('on'), target);
check('the demo leaves a lit step to hold', lit);

await tablet.dispatchEvent(target, 'pointerdown', { pointerType: 'touch', isPrimary: true });
await tablet.waitForTimeout(700);
await tablet.dispatchEvent(target, 'pointerup', { pointerType: 'touch', isPrimary: true });
await tablet.waitForTimeout(250);

const after = await tablet.evaluate((s) => document.querySelector(s).className, target);
check('press and hold reaches accent without a shift key',
      after.includes('hard') || after.includes('soft'), after.replace('step ', ''));

await touch.close();

// ---- errors --------------------------------------------------------------

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

console.log(`\n${failures === 0 ? 'PASSED' : 'FAILED'} — ${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
