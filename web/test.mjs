// End-to-end test of the web build, in a real browser.
//
// The point is to check the things that cannot be checked by compiling: that the AudioWorklet
// actually loads the module, that the engine initialises inside it, that the interface builds
// itself from the parameter table the engine sent, and — the one that matters — that audio comes
// out and stops when it should.
//
//   node web/test.mjs
//
// Audio is measured by tapping the live graph through an AnalyserNode, so what the test observes
// is what the page is really producing rather than a separate render.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
};

let failures = 0;

function check(label, condition, detail = '') {
    const mark = condition ? 'ok  ' : 'FAIL';
    if (!condition) failures++;
    console.log(`  ${mark}  ${label}${detail ? `  (${detail})` : ''}`);
}

const server = createServer(async (request, response) => {
    const path = request.url === '/' ? '/index.html' : request.url.split('?')[0];

    try {
        const body = await readFile(join(here, path));
        response.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' });
        response.end(body);
    } catch {
        response.writeHead(404).end('not found');
    }
});

await new Promise((resolve) => server.listen(0, resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

// The container ships a Chromium build; use it rather than downloading one. Override with
// BUD_CHROME if your Playwright brings its own.
const browser = await chromium.launch({
    executablePath: process.env.BUD_CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--autoplay-policy=no-user-gesture-required'],
});

const page = await browser.newPage();

const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
});

console.log('\nBud — web build\n');

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

// ---- errors --------------------------------------------------------------

check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

console.log(`\n${failures === 0 ? 'PASSED' : 'FAILED'} — ${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
