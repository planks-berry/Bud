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
    moo: [{ f: noteHz(-5, 60) }, { f: noteHz(-3, 60) }],
    baa: [{ f: noteHz(-2, 60) }, { f: noteHz(0, 60) }],
    oink: [{ f: noteHz(-4, 60) }],
    cluck: [{ f: noteHz(4, 60) }],
    quack: [{ f: noteHz(1, 60) }],
    ribbit: [{ f: noteHz(-2, 60) }],
    hoot: [{ f: noteHz(2, 60) }],
    chirp: [{ f: noteHz(2, 96) }, { f: noteHz(0, 96), variant: 'peep' }],
    warble: [
        { f: noteHz(0, 84) },
        { f: noteHz(5, 84), variant: 'short', from: noteHz(4, 84) },
        { f: noteHz(0, 72) },
    ],
    flutter: [
        { beats: 2, gap: 0.2 },
        { beats: 3, gap: 0.2 },
        { beats: 4, gap: 0.2 },
    ],
    rainstick: [{}],
    thunder: [{}],
    sigh: [{}],
    jingle: [{}],
    cymbal: [{}],
    sneeze: [{ f: 330 }, { f: 520 }],
    putt: [{}],
    toot: [{ f: noteHz(3, 60) }, { f: noteHz(5, 60) }],
    crow: [{}],
    meow: [{ f: noteHz(5, 60) }],
    woof: [{ f: noteHz(-2, 60) }],
    beep: [{ f: noteHz(4, 72) }, { f: noteHz(2, 72) }],
    whistle: [{}, { variant: 'long' }],
    clank: [{ f: noteHz(0, 60) }, { f: noteHz(9, 60) }, { f: noteHz(-3, 60) }],
    rumble: [{}, { variant: 'short' }],
    rattle: [{}],
    crunch: [{}, { seed: 3 }],
    hiss: [{}],
    slosh: [{}],
    drum: [{}, { f: noteHz(-3, 60) }],
    clap: [{}],
    shaker: [{}],
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

// And every sound the code asks for with fixed parameters, played or prepared, renders as asked:
// a recipe missing a parameter it needs (a bubble with no pitch) renders NaN, which is silence at
// best, and in the filters on the way out it can stay, silencing everything after it.
const askFaults = [];
let askCount = 0;
for (const dir of ['js', 'js/toys']) {
    for (const file of (await readdir(join(here, dir))).filter((name) => name.endsWith('.js'))) {
        const text = await readFile(join(here, dir, file), 'utf8');
        for (const m of text.matchAll(/(?:audio\.play\(|\[)\s*'(\w+)',\s*(\{[^{}]*\})/g)) {
            if (!synth.recipes[m[1]]) continue;
            let params;
            try {
                params = new Function('noteHz', `return (${m[2]});`)(noteHz);
            } catch (error) {
                continue; // worked out as it plays
            }
            askCount++;
            const b = synth.render(m[1], 48000, params);
            if (!b.every(Number.isFinite) || !b.some((v) => v !== 0)) {
                askFaults.push(`${dir}/${file}:${text.slice(0, m.index).split('\n').length} ${m[1]} ${m[2]}`);
            }
        }
    }
}
check(
    `the ${askCount} sounds the toys ask for by fixed parameters all render`,
    askCount > 50 && askFaults.length === 0,
    askFaults.slice(0, 6).join('; ')
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
    [
        'notes',
        [-19.5, -14.5],
        ['marimba', 'glock', 'chime', 'musicBox', 'drop', 'wood', 'clank', 'drum', 'warble'],
    ],
    [
        'voices',
        [-21.5, -16.5],
        ['moo', 'baa', 'oink', 'cluck', 'quack', 'ribbit', 'hoot', 'toot', 'crow', 'meow', 'woof', 'sneeze'],
    ],
    [
        'foley',
        [-24, -18.5],
        [
            'click',
            'tick',
            'pop',
            'thud',
            'tink',
            'squeak',
            'gulp',
            'creak',
            'latch',
            'pat',
            'chirp',
            'beep',
            'whistle',
            'rattle',
            'crunch',
            'clap',
            'shaker',
            'flutter',
            'sigh',
            'jingle',
            'cymbal',
        ],
    ],
    ['air', [-27, -21.5], ['bubble', 'rustle', 'whoosh', 'rumble', 'hiss', 'slosh', 'rainstick', 'thunder']],
    ['streams', [-30, -24.5], ['zip', 'putt']],
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

// ---- every choice of colours the colour beats can roll keeps its rules ----------------------

{
    const cubes = await import(pathToFileURL(join(here, 'js/toys/cubes.js')).href);
    const noteOf = {};
    for (const kind of cubes.COLOURS) noteOf[kind.name] = kind.degree;
    const faults = [];
    const palettes = cubes.STAGES.map(() => new Set());
    cubes.STAGES.forEach((stage, level) => {
        let last = '';
        for (let roll = 0; roll < 2000 && faults.length < 5; roll++) {
            const colours = cubes.pickColours(level, (roll * 2654435761) >>> 0, last);
            const where = `stage ${level}, roll ${roll}`;
            const names = colours.map((kind) => kind.name);
            if (names.length !== stage.colours || new Set(names).size !== names.length)
                faults.push(`${where}: ${names.join(' ')}`);
            if (colours.some((kind) => kind.degree !== noteOf[kind.name]))
                faults.push(`${where}: a colour off its note`);
            for (let i = 1; i < colours.length; i++)
                if (colours[i].degree <= colours[i - 1].degree) faults.push(`${where}: not lowest first`);
            const key = cubes.colourKey(colours);
            if (stage.colours < cubes.COLOURS.length && key === last)
                faults.push(`${where}: the same colours twice running`);
            last = key;
            palettes[level].add(key);
            const rows = cubes.rowsFor(level, colours).map((row) => row.name);
            if (rows.join(' ') !== stage.beats.concat(names).join(' ') || rows[0] !== 'drum')
                faults.push(`${where}: rows ${rows.join(' ')}`);
        }
        const start = cubes.starter(level);
        if (!start.length || start.some(([row, col]) => row !== 0 || col < 0 || col >= stage.steps))
            faults.push(`stage ${level}: starts with ${JSON.stringify(start)}`);
    });
    check(
        'every choice of colours keeps its rules, over 2000 rolls a stage: each its note, lowest first, the beats below, never the same twice running',
        faults.length === 0,
        faults.slice(0, 3).join('; ')
    );
    check(
        'and the choices vary: every pair of colours at Seed, every three at Sprout',
        palettes[0].size === 10 && palettes[1].size === 10 && palettes[2].size === 1,
        `${palettes.map((p) => p.size).join(' / ')} palettes`
    );
}

// ---- the turntable's records: in tune, in time, and round and round without a seam -----------

{
    const records = await import(pathToFileURL(join(here, 'js/toys/records.js')).href);
    const cubes = await import(pathToFileURL(join(here, 'js/toys/cubes.js')).href);
    const sr = 44100;
    const rendered = new Map();
    const sound = (name, params) => {
        const key = `${name} ${JSON.stringify(params)}`;
        if (!rendered.has(key)) rendered.set(key, synth.render(name, sr, params));
        return rendered.get(key);
    };
    const scale = Array.from({ length: 40 }, (_, i) => noteHz(i - 20, 60));
    const faults = [];
    const levels = [];
    for (const record of records.RECORDS) {
        const where = record.name;
        if (!cubes.COLOURS.some((kind) => kind.colour === record.colour))
            faults.push(`${where}: not one of the playroom's colours`);
        for (const [step, name, params, gain] of record.events) {
            if (!Number.isInteger(step) || step < 0 || step >= records.STEPS)
                faults.push(`${where}: step ${step}`);
            if (!synth.recipes[name]) faults.push(`${where}: no sound called ${name}`);
            else if (!(gain > 0 && gain <= 1)) faults.push(`${where}: ${name} at ${gain}`);
            if (params.f && !scale.some((f) => Math.abs(f / params.f - 1) < 1e-9))
                faults.push(`${where}: ${name} at ${params.f.toFixed(1)} Hz, off the scale`);
        }
        if (faults.length) continue;
        const loop = records.press(record, sr, sound);
        const n = loop.length;
        if (n !== Math.round(records.LENGTH * sr)) faults.push(`${where}: ${n} samples`);
        // The record played round and round from silence: from its second time round it is
        // the pressed loop, sample for sample, so going round has no seam.
        const round = new Float32Array(n * 3);
        for (let k = 0; k < 3; k++) {
            for (const [step, name, params, gain] of record.events) {
                const data = sound(name, params);
                const start = k * n + Math.round(step * records.STEP * sr);
                const level = gain * synth.MIX[name];
                for (let i = 0; i < data.length && start + i < round.length; i++)
                    round[start + i] += data[i] * level;
            }
        }
        let seam = 0;
        let top = 0;
        for (let i = 0; i < n; i++) {
            seam = Math.max(seam, Math.abs(round[n + i] - loop[i]), Math.abs(round[2 * n + i] - loop[i]));
            top = Math.max(top, Math.abs(loop[i]));
        }
        if (!(seam < 1e-5)) faults.push(`${where}: differs from itself played round by ${seam}`);
        // What reaches the room, through the deck at 0.9: in the band of the notes, unclipped.
        const level = loudness(
            loop.map((v) => v * 0.9),
            sr
        );
        const [lo, hi] = BANDS.find(([band]) => band === 'notes')[1];
        levels.push(`${where} ${level.toFixed(1)} dB`);
        if (top * 0.9 > 0.9 || level < lo || level > hi)
            faults.push(`${where}: at ${level.toFixed(1)} dB, peak ${(top * 0.9).toFixed(2)}`);
    }
    check(
        'every record is in tune and in time, round and round without a seam, as loud as the notes',
        faults.length === 0,
        faults.length ? faults.slice(0, 4).join('; ') : levels.join('; ')
    );
    check(
        'one record at Seed, three in the crate after',
        records.recordsFor(0).length === 1 &&
            records.recordsFor(1).length === 3 &&
            records.recordsFor(2).length === 3 &&
            new Set(records.RECORDS.map((record) => record.colour)).size === records.RECORDS.length
    );
}

// ---- a scratch through a held note slides, rather than buzzes --------------------------------
//
// A hand scratching a held C5, back and forth two and a half times a second, its touches arriving
// unevenly (in some frames none, in some two), at 60 and at 30 frames a second: through the
// record's following the finger, and the sound's glide as the audio engine runs it, a step every
// 128 samples. What a held note hears as a buzz is the record's place wobbling faster than 25 Hz;
// here, as phase on the C5, its level against the note, the middle of nine runs of uneven touches.
// Setting the speed once a frame, as the first turntable did, put it about as loud as the note, or
// louder.

{
    const { follow, GLIDE } = await import(pathToFileURL(join(here, 'js/toys/scratch.js')).href);
    const SR = 44100;
    const SPIN = (Math.PI * 2 * 100) / 3 / 60;
    const highpass = (x, fc) => {
        const w = (2 * Math.PI * fc) / SR;
        const c = Math.cos(w);
        const a = Math.sin(w) / Math.SQRT2;
        const [b0, b1, a1, a2] = [(1 + c) / 2, -(1 + c), -2 * c, 1 - a];
        const y = new Float64Array(x.length);
        let [x1, x2, y1, y2] = [0, 0, 0, 0];
        for (let k = 0; k < x.length; k++) {
            y[k] = (b0 * x[k] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2) / (1 + a);
            [x2, x1, y2, y1] = [x1, x[k], y1, y[k]];
        }
        return y;
    };
    const buzz = (fps, start) => {
        let seed = start;
        const random = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
        const finger = (t) => 0.6 * Math.sin(2 * Math.PI * 2.5 * t);
        const frame = 1 / fps;
        const place = new Float64Array(2 * SR);
        let [angle, spin, target, touched, speed, p, i] = [0, 0, 0, 0, 0, 0, 0];
        for (let t = 0; i < place.length; t += frame) {
            const r = random();
            const touches = r < 0.15 ? 0 : r > 0.85 ? 2 : 1;
            if (touches) {
                touched = Math.min(t, touched + touches / 60);
                target = finger(touched);
            }
            [angle, spin] = follow(angle, spin, target, frame);
            for (const end = Math.min(place.length, Math.round((t + frame) * SR)); i < end; i++) {
                if (i % 128 === 0) speed += (spin / SPIN - speed) * (1 - Math.exp(-128 / SR / GLIDE));
                p += speed / SR;
                place[i] = p;
            }
        }
        const fast = highpass(highpass(place, 25), 25);
        let sum = 0;
        for (let k = SR / 2; k < place.length; k++) sum += (2 * Math.PI * 523.25 * fast[k]) ** 2;
        return 10 * Math.log10(sum / (place.length - SR / 2));
    };
    const levels = [60, 30].map(
        (fps) => Array.from({ length: 9 }, (_, k) => buzz(fps, k * 7919 + 1)).sort((a, b) => a - b)[4]
    );
    check(
        'a scratch through a held note slides rather than buzzes: its fast wobble 9 dB under the note',
        levels.every((level) => level < -9),
        `${levels.map((level, k) => `${[60, 30][k]} frames a second ${level.toFixed(1)} dB`).join(', ')}`
    );
}

// ---- Bird Song: every tune the bird composes, and every answer it sings back, keeps its rules ----

{
    const tunes = await import(pathToFileURL(join(here, 'js/toys/tunes.js')).href);
    const cubes = await import(pathToFileURL(join(here, 'js/toys/cubes.js')).href);
    const faults = [];
    tunes.STAGES.forEach((stage, level) => {
        const count = stage.flowers.length;
        if (stage.flowers.some((name) => !cubes.COLOURS.some((kind) => kind.name === name)))
            faults.push(`stage ${level}: a flower in no colour of the playroom's`);
        const opener = tunes.OPENERS[level];
        if (opener.length !== stage.first || opener.some((name) => stage.flowers.indexOf(name) < 0))
            faults.push(`stage ${level}: its first tune`);
        let seed = 11 + level;
        const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let roll = 0; roll < 3000 && faults.length < 5; roll++) {
            const start = roll % count;
            const length = stage.first + (roll % (stage.most - stage.first + 1));
            const tune = tunes.compose(start, length, count, next);
            const where = `stage ${level}, roll ${roll}: ${tune.join(' ')}`;
            if (tune.length !== length || tune[0] !== start) faults.push(`${where}: length or start`);
            if (tune.some((at) => !Number.isInteger(at) || at < 0 || at >= count))
                faults.push(`${where}: off the flowers`);
            for (let k = 1; k < tune.length; k++) {
                if (Math.abs(tune[k] - tune[k - 1]) > 2) faults.push(`${where}: a leap`);
                if (k >= 2 && tune[k] === tune[k - 1] && tune[k - 1] === tune[k - 2])
                    faults.push(`${where}: three the same`);
            }
        }
    });
    check(
        "every tune the bird composes, 3000 a stage, begins on his last note, has the stage's length, stays on its flowers, steps or skips one, and never repeats a note three times",
        faults.length === 0,
        faults.slice(0, 3).join('; ')
    );

    const taps = tunes.echo([
        { index: 0, t: 0 },
        { index: 2, t: 0.5 },
        { index: 1, t: 3 },
    ]);
    const glide = tunes.echo([0, 1, 2, 3, 4].map((index, k) => ({ index, t: k * 0.08 })));
    const many = tunes.echo(Array.from({ length: 20 }, (_, k) => ({ index: k % 5, t: k * 0.3 })));
    const close = (a, b) => Math.abs(a - b) < 1e-9;
    check(
        'the bird sings his notes back in his rhythm, a long wait shortened; a run along the flowers as a glide; at most his last twelve',
        taps.map((n) => n.index).join(' ') === '0 2 1' &&
            close(taps[1].at, 0.5) &&
            close(taps[2].at, 1.1) &&
            taps.every((n) => !n.short && n.glide === undefined) &&
            glide.every((n) => n.short) &&
            glide.slice(1).every((n, k) => n.glide === k) &&
            close(glide[1].at, 0.11) &&
            many.length === 12 &&
            many[0].index === 3,
        JSON.stringify(glide)
    );

    let grow = { streak: 0, length: 3 };
    const lengths = [];
    for (let k = 0; k < 9; k++) {
        grow = tunes.grown(grow.streak, grow.length, 5);
        lengths.push(grow.length);
    }
    check(
        "the tunes grow by a note after three answered turns, up to the stage's most",
        lengths.join(' ') === '3 3 4 4 4 5 5 5 5',
        lengths.join(' ')
    );

    const bids = [
        [4.9, 1],
        [5, 0.2],
        [5, 0.3],
        [6.9, 0.1],
        [7, 0.1],
    ].map(([held, since]) => tunes.bidding(held, since));
    check(
        'the bird bids for its turn after five seconds of his playing, in a gap of a third of a second between his notes, or two seconds later if he leaves none',
        bids.join(' ') === 'false false true false true',
        bids.join(' ')
    );
}

// ---- Weather Song: what each instrument brings, how it passes, and how the friend feels -------

{
    const skies = await import(pathToFileURL(join(here, 'js/toys/skies.js')).href);
    const { FEELINGS } = await import(pathToFileURL(join(here, 'js/friend.js')).href);
    const { Weather } = skies;
    const run = (w, seconds, step = 0.05) => {
        const events = [];
        for (let t = 0; t < seconds - 1e-9; t += step) {
            w.step(step);
            events.push(...w.events);
        }
        return events;
    };
    const close = (a, b, tol = 0.01) => Math.abs(a - b) < tol;

    // Each passes by itself, halving in its own time.
    const passing = new Weather(1);
    passing.play('rain');
    passing.play('sun');
    passing.play('storm');
    const at0 = { rain: passing.rain, sun: passing.sun, storm: passing.storm };
    run(passing, 2.2);
    const storm22 = passing.storm / at0.storm;
    run(passing, 2.8);
    check(
        'each weather passes by itself: thunder halves in 2.2 seconds, a drizzle in 5, sunshine in 6',
        close(storm22, 0.5, 0.02) && close(passing.rain / at0.rain, 0.5, 0.02) && passing.sun < at0.sun * 0.6,
        JSON.stringify({ storm22, rain: passing.rain / at0.rain })
    );

    // The friend's moods, as the weather goes.
    const moods = [];
    const w = new Weather(1);
    moods.push(w.mood());
    w.play('rain');
    w.step(0.05);
    moods.push(w.mood());
    run(w, 30);
    moods.push(w.mood());
    for (let i = 0; i < 3; i++) w.play('sun');
    w.step(0.05);
    moods.push(w.mood());
    run(w, 30);
    for (let i = 0; i < 2; i++) w.play('storm');
    w.step(0.05);
    moods.push(w.mood());
    const passed = run(w, 4);
    moods.push(w.mood());
    run(w, 3.5);
    moods.push(w.mood());
    check(
        'the friend is content, sleepy in a drizzle, happy in the sun, cross in the thunder, calm with a sigh when it passes, and content again',
        moods.join(' ') === 'content sleepy content happy cross calm content' &&
            passed.indexOf('calm') >= 0 &&
            moods.every((m) => FEELINGS.indexOf(m) >= 0),
        moods.join(' ')
    );

    const seed = new Weather(0);
    seed.play('storm');
    const bloom = new Weather(2);
    bloom.play('rain');
    bloom.play('rain');
    bloom.play('sun');
    bloom.play('sun');
    const rainbow = run(bloom, 0.1);
    const proud = bloom.mood();
    run(bloom, 30);
    const quietFog = run(bloom, 14) && bloom.mood();
    bloom.play('sun');
    run(bloom, 3);
    const clears = bloom.fog;
    check(
        'Seed has no thunder; at Bloom, sun in the rain makes a rainbow and the friend is proud of it, and a long quiet brings the fog, and a shy friend, until he plays again',
        seed.storm === 0 &&
            rainbow.indexOf('rainbow') >= 0 &&
            proud === 'proud' &&
            quietFog === 'shy' &&
            clears < 0.1,
        JSON.stringify({ proud, quietFog, clears })
    );

    const day = new Weather(2);
    const dayEvents = run(day, skies.DAY * (skies.NIGHT + 0.02), 0.25);
    const dusk = day.mood();
    run(day, skies.DAY * 0.1, 0.25);
    const asleep = day.mood();
    day.play('storm');
    day.play('storm');
    day.step(0.05);
    const woken = day.mood();
    run(day, 12, 0.25);
    const backToSleep = day.mood();
    run(day, skies.DAY, 0.25);
    check(
        'a day goes from morning to night: the friend gets sleepy and falls asleep; thunder in the night wakes it, cross, and it goes back to sleep; and at Bloom the day is painted, a piece at a time, as a strip of sky',
        dayEvents.indexOf('night') >= 0 &&
            dusk === 'sleepy' &&
            asleep === 'asleep' &&
            woken === 'cross' &&
            backToSleep === 'asleep' &&
            day.over() &&
            day.strip.length === skies.STRIP &&
            day.strip.every((kind) => typeof kind === 'string'),
        JSON.stringify({ dusk, asleep, woken, backToSleep, strip: day.strip.length })
    );
}

// ---- Freeze Parade: who marches to what, at what pace, and when they freeze --------------------

{
    const march = await import(pathToFileURL(join(here, 'js/toys/march.js')).href);
    const close = (a, b, tol = 0.01) => Math.abs(a - b) < tol;
    const { stepsFor, freezeAfter, Tempo, STAGES, MARCH, SLOW, QUICK } = march;
    const tempo = new Tempo();
    const intervals = [0, 0.5, 1.0, 1.5, 2.0, 2.5].map((t) => tempo.beat(t));
    const steady = intervals[intervals.length - 1];
    const restart = tempo.beat(10);
    check(
        "the parade's pace is his: the time between his beats, steadied, a first beat an easy walk; it freezes when no beat has come for well past his next, never sooner than 0.9 s or later than 2.2",
        close(intervals[0], march.FIRST) &&
            Math.abs(steady - 0.5) < 0.02 &&
            close(restart, march.FIRST) &&
            freezeAfter(0.2) === 0.9 &&
            freezeAfter(2) === 2.2 &&
            close(freezeAfter(0.8), 1.36) &&
            tempo.stopped(10 + freezeAfter(tempo.interval) + 0.01) &&
            !tempo.stopped(10 + freezeAfter(tempo.interval) - 0.01),
        intervals.map((v) => v.toFixed(2)).join(' ')
    );
    check(
        'the cow, the sheep and the pig march to the drum at any pace; the ducks only to the tambourine; the hare hops two steps, only to a quick beat; the tortoise walks, only to a slow one',
        ['cow', 'sheep', 'pig'].every(
            (a) =>
                stepsFor(a, 'drum', 0.25) === 1 &&
                stepsFor(a, 'drum', 1.2) === 1 &&
                !stepsFor(a, 'tambourine', 0.5)
        ) &&
            stepsFor('duck', 'tambourine', 0.5) === 1 &&
            !stepsFor('duck', 'drum', 0.5) &&
            stepsFor('hare', 'drum', QUICK) === 2 &&
            !stepsFor('hare', 'drum', QUICK + 0.05) &&
            stepsFor('tortoise', 'drum', SLOW) === 1 &&
            !stepsFor('tortoise', 'drum', SLOW - 0.05)
    );
    check(
        "Seed's parade is the cow, the sheep and the pig; Sprout's adds two ducks and a tambourine; Bloom's a hare in front and a tortoise behind, and a band whose march is on the playroom's scale and comes home to C",
        STAGES[0].animals.join(' ') === 'cow sheep pig' &&
            !STAGES[0].tambourine &&
            STAGES[1].animals.join(' ') === 'cow sheep pig duck duck' &&
            STAGES[1].tambourine &&
            STAGES[2].animals[0] === 'hare' &&
            STAGES[2].animals[STAGES[2].animals.length - 1] === 'tortoise' &&
            STAGES[2].band &&
            MARCH.every((d) => Number.isInteger(d) && d >= 0 && d <= 5) &&
            MARCH[MARCH.length - 1] === 0
    );
}

// ---- Building site: the ways its machines find across the island --------------------------------

{
    const { route, walk } = await import(pathToFileURL(join(here, 'js/toys/routes.js')).href);
    // A board drawn in letters: '.' open ground, '#' something in the way, 'r' road, 'G' a goal.
    const board = (rows) => ({
        at: (c, r) => (rows[r] && rows[r][c]) || ' ',
        open: (c, r) => ['.', 'r', 'G', 'S'].indexOf((rows[r] && rows[r][c]) || ' ') >= 0,
    });
    const b = board(['S..#.', '.#.#G', '.....']);
    const way = route([0, 0], (c, r) => b.at(c, r) === 'G', b.open);
    const roads = board(['S....', 'r###.', 'rrrrG']);
    const byRoad = route(
        [0, 0],
        (c, r) => roads.at(c, r) === 'G',
        roads.open,
        (c, r) => (roads.at(c, r) === 'r' || roads.at(c, r) === 'G' ? 1 : 1.6)
    );
    const holes = board(['S.H..', '.....']);
    const intoHole = route(
        [0, 0],
        (c, r) => holes.at(c, r) === 'H',
        (c, r) => holes.at(c, r) !== ' '
    );
    check(
        'a machine finds its way round what is in the way, the cheapest way, keeping to the road when it can, and stops at the first goal; with no way at all there is none',
        way &&
            way.map(([c, r]) => `${c}${r}`).join(' ') === '00 10 20 21 22 32 42 41' &&
            byRoad.map(([c, r]) => `${c}${r}`).join(' ') === '00 01 02 12 22 32 42' &&
            intoHole.length === 3 &&
            route([0, 0], () => false, b.open) === null &&
            route([4, 1], (c, r) => b.at(c, r) === 'G', b.open).length === 1,
        way && way.map(([c, r]) => `${c}${r}`).join(' ')
    );
    // A road like a T: the walk goes out to every tile wanted and home, and only down branches that
    // lead to something wanted.
    const t = board(['rrrrr', '..r..', '..r..']);
    const along = (c, r) => t.at(c, r) === 'r';
    const tourOf = (wanted) =>
        walk([4, 0], along, (c, r) => wanted.indexOf(`${c}${r}`) >= 0).map(([c, r]) => `${c}${r}`);
    const both = tourOf(['00', '22']);
    const end = tourOf(['00']);
    check(
        'the road machines walk out along the road to every tile they work and home again, turning only into branches with work down them',
        both.join(' ') === '40 30 20 21 22 21 20 10 00 10 20 30 40' &&
            end.join(' ') === '40 30 20 10 00 10 20 30 40' &&
            tourOf([]).join(' ') === '40',
        `${both.join(' ')} / ${end.join(' ')}`
    );
}

// ---- Fix-it Shop: what is missing, what lies in the drawer, what fits, and the band ------------------

{
    const repairs = await import(pathToFileURL(join(here, 'js/toys/repairs.js')).href);
    const { KINDS, PARTS, STAGES, missing, fits, drawer, round, SCORE, bandNotes } = repairs;
    const { rng } = await import(pathToFileURL(join(here, 'js/util.js')).href);
    const drawerFaults = [];
    for (let seed = 1; seed <= 400; seed++) {
        const next = rng(seed);
        for (const kind of KINDS) {
            for (let level = 0; level < 3; level++) {
                const need = missing(kind, level);
                const tray = drawer(kind, level, next);
                const names = tray.map((item) => item.part);
                const families = names.map((name) => PARTS[name].family);
                const fault =
                    tray.length !== STAGES[level].drawer ||
                    need.length !== STAGES[level].gaps ||
                    need.some((name) => names.indexOf(name) < 0) ||
                    new Set(names).size !== names.length ||
                    (level === 0 && new Set(families).size !== families.length) ||
                    tray.some(
                        (item) =>
                            need.indexOf(item.part) < 0 &&
                            need.some((want) => fits(item.part, item.rot, want, level))
                    ) ||
                    tray.some((item) => {
                        if (need.indexOf(item.part) < 0) return false;
                        const turns = PARTS[item.part].turns;
                        const now = fits(item.part, item.rot, item.part, level);
                        // At Seed every part fits as it lies; from Sprout an orientable part never does
                        // until it is turned, a round one always does; and turning finds the way.
                        if (level === 0) return !now || item.rot !== 0;
                        if (turns > 1 && now) return true;
                        if (turns === 1 && !now) return true;
                        return ![0, 1, 2, 3].some((taps) =>
                            fits(item.part, item.rot + taps, item.part, level)
                        );
                    });
                if (fault) drawerFaults.push(`${kind} ${level} ${JSON.stringify(tray)}`);
            }
        }
    }
    check(
        "the Fix-it Shop's drawer always holds the parts a toy is missing and others to choose from, all different, of different kinds at Seed; no other part fits; from Sprout the parts it needs lie turned, and a few taps turn them to fit",
        drawerFaults.length === 0,
        drawerFaults.slice(0, 2).join(' | ')
    );
    const roundFaults = [];
    let last = null;
    const next = rng(9);
    for (let i = 0; i < 300; i++) {
        const order = round(last, next);
        if (order.length !== KINDS.length || new Set(order).size !== KINDS.length || order[0] === last)
            roundFaults.push(order.join(' '));
        last = order[order.length - 1];
    }
    const notes = bandNotes(KINDS);
    check(
        'the broken toys come one each a round, never the last one first again; and the band plays on the playroom scale, in time, the drum on every beat',
        roundFaults.length === 0 &&
            KINDS.every((kind) => SCORE[kind] && SCORE[kind].length) &&
            notes.every((n, i) => n.beat >= 0 && n.beat < 8 && (i === 0 || notes[i - 1].beat <= n.beat)) &&
            notes.every(
                (n) =>
                    n.note.degree === undefined ||
                    (Number.isInteger(n.note.degree) && n.note.degree >= 0 && n.note.degree <= 5)
            ) &&
            SCORE.drum.length === 8,
        roundFaults.slice(0, 2).join(' | ')
    );
    check(
        'at Seed a toy is missing one part, at Sprout one that must be turned, at Bloom two, the first held by a screw',
        KINDS.every((kind) => missing(kind, 0).length === 1 && missing(kind, 2).length === 2) &&
            !STAGES[0].turn &&
            STAGES[1].turn &&
            STAGES[2].screw &&
            !STAGES[1].screw &&
            fits('sail', 1, 'sail', 0) &&
            !fits('sail', 1, 'sail', 1) &&
            fits('sail', 4, 'sail', 1) &&
            fits('wheel', 3, 'wheel', 2) &&
            !fits('wheel', 0, 'skin', 0)
    );
}

// ---- Torch in the Dark: where they hide, how the light wakes them, and the fireflies -------------

{
    const hiding = await import(pathToFileURL(join(here, 'js/toys/hiding.js')).href);
    const {
        STAGES,
        SPOTS,
        CREATURES,
        hide,
        rest,
        SLOW,
        call,
        echo,
        grown,
        FLASH,
        FIRST,
        MOST,
        SONG,
        VOICE_AT,
    } = hiding;
    const { rng } = await import(pathToFileURL(join(here, 'js/util.js')).href);
    const seed = hide(0, null, rng(3));
    const seedAgain = hide(0, seed, rng(4));
    const hideFaults = [];
    let repeats = 0;
    let stays = 0;
    for (const level of [1, 2]) {
        const next = rng(level * 11);
        let last = null;
        for (let night = 0; night < 400; night++) {
            const places = hide(level, last, next);
            const used = Object.values(places);
            if (
                Object.keys(places).length !== STAGES[level].creatures.length ||
                new Set(used).size !== used.length ||
                Object.keys(places).some(
                    (who) => !SPOTS[places[who]] || SPOTS[places[who]].who.indexOf(who) < 0
                )
            )
                hideFaults.push(JSON.stringify(places));
            if (last) {
                for (const who of Object.keys(places)) {
                    stays++;
                    if (places[who] === last[who]) repeats++;
                }
            }
            last = places;
        }
    }
    check(
        'Torch in the Dark: at Seed four friends sleep in the same places every night; from Sprout six, somewhere new each night, each in a place that suits it, never two in one place, and seldom where it slept the night before',
        Object.keys(seed).length === 4 &&
            JSON.stringify(seed) === JSON.stringify(seedAgain) &&
            STAGES[1].creatures.length === CREATURES.length &&
            hideFaults.length === 0 &&
            repeats / stays < 0.1,
        `${hideFaults.slice(0, 2).join(' | ')} repeats ${repeats}/${stays}`
    );
    let lit = 0;
    for (let i = 0; i < 30; i++) lit = rest(lit, 1 / 60, true, SLOW * 0.5);
    const rested = lit;
    for (let i = 0; i < 30; i++) lit = rest(lit, 1 / 60, true, SLOW * 2);
    const swept = lit;
    let fast = 0;
    for (let i = 0; i < 60; i++) fast = rest(fast, 1 / 60, true, SLOW * 3);
    check(
        'the light wakes a creature only by resting on it: it gathers while the beam is still on it, and drains when the beam sweeps fast; a beam that only sweeps never gathers any',
        Math.abs(rested - 0.5) < 0.01 &&
            swept === 0 &&
            fast === 0 &&
            STAGES.every((s, i) => i === 0 || s.wake >= STAGES[i - 1].wake),
        `${rested.toFixed(2)} ${swept.toFixed(2)}`
    );
    const rhythmFaults = [];
    const next = rng(5);
    for (let i = 0; i < 300; i++) {
        const length = FIRST + (i % (MOST - FIRST + 1));
        const times = call(length, next);
        const gaps = times.slice(1).map((t, j) => t - times[j]);
        if (
            times.length !== length ||
            times[0] !== 0 ||
            gaps.some((g) => Math.abs(g - FLASH) > 1e-9 && Math.abs(g - 2 * FLASH) > 1e-9)
        )
            rhythmFaults.push(times.join(' '));
    }
    const back = echo([0, 0.05, 0.4, 3, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7]);
    let growth = { streak: 0, length: FIRST };
    const lengths = [];
    for (let i = 0; i < 10; i++) {
        growth = grown(growth.streak, growth.length);
        lengths.push(growth.length);
    }
    check(
        'the fireflies blink rhythms of short and long gaps, from two blinks growing by one every second rhythm he answers, to five; they blink his back in his own time, a quick flicker and a long wait kept within bounds, at most eight',
        rhythmFaults.length === 0 &&
            back.length === 8 &&
            back[0] === 0 &&
            back.slice(1).every((t, j) => t - back[j] >= 0.14 - 1e-9 && t - back[j] <= 0.7 + 1e-9) &&
            lengths.join(' ') === '2 3 3 4 4 5 5 5 5 5',
        `${rhythmFaults.slice(0, 2).join(' | ')} ${lengths.join(' ')} ${back.map((t) => t.toFixed(2)).join(' ')}`
    );
    check(
        'the night song is on the playroom scale, and every friend has its note in it',
        SONG.every((d) => Number.isInteger(d) && d >= 0 && d <= 5) &&
            CREATURES.every(
                (who) => Number.isInteger(VOICE_AT[who]) && VOICE_AT[who] >= 0 && VOICE_AT[who] < SONG.length
            )
    );
}

//==============================================================================
// The browser

const TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
};

// Files the tests stand in for: a published copy's stamped worker and version file, replaced by a
// newer copy's mid-test, as a deploy replaces them.
const standIns = new Map();

const server = createServer(async (request, response) => {
    const path = request.url.split('?')[0];
    const standIn = standIns.get(path.slice(1));
    if (standIn) {
        response.writeHead(200, { 'Content-Type': 'text/javascript' });
        response.end(standIn);
        return;
    }
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
    check(
        'seventeen trays on the shelf, the newest last',
        trays.length === 17 && trays.slice(12).join(' ') === 'birdsong weather parade fixit torch',
        trays.join(' ')
    );

    // Hello: the trays wake one by one, each with a note, and then the shelf is still.
    const hello = await scene(() => {
        const s = window.playroom.shelf;
        return { greeting: !!s.greeting, asleep: s.items.filter((item) => item.wake.target === 0).length };
    });
    const helloOver = await page
        .waitForFunction(
            () =>
                !window.playroom.shelf.greeting &&
                window.playroom.shelf.items.every((item) => item.wake.settled()),
            null,
            { timeout: 6000 }
        )
        .then(
            () => true,
            () => false
        );
    check(
        'the shelf says hello: its trays wake one by one, until all are awake',
        hello.greeting &&
            hello.asleep > 0 &&
            helloOver &&
            (await scene(() => window.playroom.shelf.items.every((item) => item.wake.target === 1))),
        JSON.stringify(hello)
    );
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

    // The shy fish keeps to its lily pad, until a finger has been still in the water for a while:
    // then it comes out a step at a time, and nibbles. A finger that moves sends it home.
    const shy = await scene(() => {
        const s = window.playroom.stage.scene;
        const f = s.fish.find((fish) => fish.shy);
        if (!f) return null;
        const pad = f.home;
        const away = Math.atan2(s.cy - pad.y, s.cx - pad.x);
        return {
            home: Math.hypot(f.x - pad.x, f.y - pad.y) < pad.r * 1.2,
            at: [pad.x + Math.cos(away) * 230, pad.y + Math.sin(away) * 230],
        };
    });
    let shyNibbled = false;
    let shyCourage = -1;
    if (shy) {
        await touch.down(shy.at[0], shy.at[1]);
        shyNibbled = await page
            .waitForFunction(() => window.playroom.stage.scene.fish.find((f) => f.shy).nibbled, null, {
                timeout: 11000,
            })
            .then(
                () => true,
                () => false
            );
        await touch.move(shy.at[0] + 60, shy.at[1]);
        await page.waitForTimeout(120);
        shyCourage = await scene(() => window.playroom.stage.scene.fish.find((f) => f.shy).courage);
        await touch.up();
    }
    check(
        'the shy fish keeps to its lily pad, comes out to a finger held still and nibbles it, and darts home when the finger moves',
        !!shy && shy.home && shyNibbled && shyCourage === 0,
        JSON.stringify({ shy, shyNibbled, shyCourage })
    );
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

    // ---- colour beats ------------------------------------------------------------

    await open('tower');
    const beatShelf = await scene(() => {
        const s = window.playroom.stage.scene;
        return {
            rows: s.rows.map((k) => ({ name: k.name, beat: k.beat, colour: k.colour, degree: k.degree })),
            steps: s.steps,
            period: s.period,
            grid: s.grid.map((row) => row.map((c) => (c ? 1 : 0)).join('')),
        };
    });
    const noteRows = beatShelf.rows.filter((k) => !k.beat);
    check(
        'the colour beats open at Sprout: 8 columns, a drum and a shaker under 3 colours, the lowest note lowest',
        beatShelf.steps === 8 &&
            beatShelf.rows
                .slice(0, 2)
                .map((k) => k.name)
                .join(' ') === 'drum shaker' &&
            noteRows.length === 3 &&
            noteRows.every((k, i) => i === 0 || k.degree > noteRows[i - 1].degree),
        beatShelf.rows.map((k) => k.name).join(' ')
    );
    check(
        'with a heartbeat on the drum to start with',
        beatShelf.grid[0] === '10001000' && beatShelf.grid.slice(1).every((row) => row === '00000000'),
        beatShelf.grid.join(' ')
    );

    const cubby = (row, col) =>
        scene(
            ([row, col]) => {
                const q = window.playroom.stage.scene.cellRect(row, col);
                return { x: q.x + q.w / 2, y: q.y + q.h / 2 };
            },
            [row, col]
        );
    const shelfRows = () =>
        scene(() => window.playroom.stage.scene.grid.map((row) => row.map((c) => (c ? 1 : 0)).join('')));
    const tapCubby = async (row, col) => {
        const q = await cubby(row, col);
        await touch.tap(q.x, q.y);
    };

    // Quiet first, the heartbeat taken out, so what a tap sounds is heard on its own.
    await tapCubby(0, 0);
    await tapCubby(0, 4);
    await page.waitForTimeout(1600);
    const hush = await peak(300);
    await tapCubby(2, 2);
    const knock = await peak(300);
    const one = await shelfRows();
    check(
        'a tap on an empty cubby drops its cube in, sounding',
        one[0] === '00000000' && one[2] === '00100000' && knock > 0.02 && knock > hush * 2,
        `${one.join(' ')}; ${hush.toFixed(3)} then ${knock.toFixed(3)}`
    );
    await tapCubby(2, 2);
    await page.waitForTimeout(100);
    check('and a tap on the cube takes it out again', (await shelfRows())[2] === '00000000');

    const rowStart = await cubby(3, 0);
    const rowEnd = await cubby(3, 7);
    await touch.drag(line(rowStart.x, rowStart.y, rowEnd.x, rowEnd.y, 14));
    const stroked = await shelfRows();
    const rowMid = await cubby(3, 3);
    await touch.drag(line(rowStart.x, rowStart.y, rowMid.x, rowMid.y, 8));
    const erased = await shelfRows();
    check('a stroke along a row fills every cubby it crosses', stroked[3] === '11111111', stroked.join(' '));
    check(
        'and a stroke begun on a cube empties the ones it crosses',
        erased[3] === '00001111',
        erased.join(' ')
    );

    // Two colours in one column and a drum two columns on: the light reaches each in turn, the
    // two in the column together, a column every beat, round and round, booked to the sample.
    await tapCubby(2, 1);
    await tapCubby(4, 1);
    await tapCubby(0, 3);
    const looped = await page.evaluate(async () => {
        const s = window.playroom.stage.scene;
        const watch = { a: s.grid[2][1], b: s.grid[4][1], c: s.grid[0][3] };
        const rose = { a: [], b: [], c: [] };
        const was = { a: 0, b: 0, c: 0 };
        let gap = 0;
        let worst = 0;
        let loudest = 0;
        const start = Date.now();
        const span = s.period * s.steps * 2000 + 400;
        while (Date.now() - start < span) {
            const t = Date.now() - start;
            for (const k of Object.keys(watch)) {
                if (watch[k].glow > was[k] + 0.2) rose[k].push(t);
                was[k] = watch[k].glow;
            }
            for (let i = 1; i < s.booked.length; i++) {
                gap = s.booked[i].at - s.booked[i - 1].at;
                worst = Math.max(worst, Math.abs(gap - s.period));
            }
            loudest = Math.max(loudest, window.playroom.audio.peak());
            await new Promise((r) => setTimeout(r, 8));
        }
        return { rose, worst, loudest, clock: s.clock };
    });
    const beatMs = beatShelf.period * 1000;
    const loopMs = beatMs * beatShelf.steps;
    const firstA = looped.rose.a[0];
    const nextC = looped.rose.c.find((t) => t > firstA);
    check(
        'the light plays a column at a time: the two cubes in one column together, the drum two beats on',
        looped.rose.a.length >= 2 &&
            looped.rose.a.join(' ') === looped.rose.b.join(' ') &&
            Math.abs(nextC - firstA - 2 * beatMs) < 120 &&
            looped.loudest > 0.02,
        JSON.stringify(looped)
    );
    check(
        'round and round, a loop at a time, each column booked on the audio clock exactly a beat after the last',
        Math.abs(looped.rose.a[1] - looped.rose.a[0] - loopMs) < 150 &&
            looped.clock === 'audio' &&
            looped.worst < 1e-6,
        `${looped.rose.a.join(' ')} ms; ${looped.clock}, ${looped.worst}`
    );

    // Held, the ball plays each column it is rolled to, and the loop waits; let go, the loop carries
    // on from the next column.
    const runway = await scene(() => {
        const s = window.playroom.stage.scene;
        return { y: s.groove, from: s.colX(2), to: s.colX(6) };
    });
    await touch.down(runway.from, runway.y);
    const grabbed = await scene(() => {
        const s = window.playroom.stage.scene;
        return { held: !!s.held, lit: s.lastCol };
    });
    const rolledOver = [];
    for (const [x, y] of line(runway.from, runway.y, runway.to, runway.y, 16).slice(1)) {
        await page.waitForTimeout(30);
        await touch.move(x, y);
        rolledOver.push(await scene(() => window.playroom.stage.scene.lastCol));
    }
    await page.waitForTimeout(700);
    const waited = await scene(() => window.playroom.stage.scene.lastCol);
    await touch.up();
    const carried = await page
        .waitForFunction(() => window.playroom.stage.scene.lastCol !== 6, null, { timeout: 3000 })
        .then(
            () => scene(() => window.playroom.stage.scene.lastCol),
            () => -1
        );
    check(
        'held, the ball plays each column it is rolled to, in turn, and the loop waits for it',
        grabbed.held &&
            grabbed.lit === 2 &&
            Array.from(new Set(rolledOver)).join(' ') === '2 3 4 5 6' &&
            waited === 6,
        `${grabbed.lit}: ${rolledOver.join(' ')}, then ${waited}`
    );
    check('and let go, the loop carries on from the next column', carried === 7, `${carried}`);

    const hop = await page.evaluate(async () => {
        const s = window.playroom.stage.scene;
        let highest = s.groove;
        const start = Date.now();
        while (Date.now() - start < s.period * s.steps * 1000 + 500) {
            highest = Math.min(highest, s.ballAt(s.now()).y);
            await new Promise((r) => setTimeout(r, 8));
        }
        return { rise: s.groove - highest, cell: s.cellH };
    });
    check(
        'when the loop goes round, the ball hops back over the front of the shelf to the start',
        hop.rise > hop.cell * 0.3,
        `${hop.rise.toFixed(0)} of ${hop.cell.toFixed(0)}`
    );
    await shot('tower');

    // Untouched for minutes, the loop plays to its end and rests, and the frames stop; a touch
    // starts it again from the first column.
    await scene(() => {
        const s = window.playroom.stage.scene;
        s.touched = s.time - 1000;
    });
    const rested = await page
        .waitForFunction(() => !window.playroom.stage.scene.playing, null, { timeout: 8000 })
        .then(
            () => scene(() => window.playroom.stage.scene.lastCol),
            () => -1
        );
    const asleep = await page
        .waitForFunction(() => !window.playroom.stage.raf, null, { timeout: 4000 })
        .then(
            () => true,
            () => false
        );
    await tapCubby(1, 5);
    const woke = await page
        .waitForFunction(() => window.playroom.stage.scene.lastCol === 0, null, { timeout: 3000 })
        .then(
            () => true,
            () => false
        );
    check(
        'left alone, the loop plays to its end and rests, and the frames stop',
        rested === beatShelf.steps - 1 && asleep,
        `rested after column ${rested}; ${asleep ? 'asleep' : 'still drawing'}`
    );
    check('and a touch starts it again from the first column', woke);
    check('home from the colour beats', (await home()) === 'ShelfScene');

    // The next outing brings other colours.
    await open('tower');
    const again = await scene(() =>
        window.playroom.stage.scene.rows.filter((k) => !k.beat).map((k) => k.name)
    );
    check(
        'the next time the shelf comes out, it brings other colours',
        again.length === 3 && again.join(' ') !== noteRows.map((k) => k.name).join(' '),
        `${noteRows.map((k) => k.name).join(' ')} then ${again.join(' ')}`
    );
    await home();

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

    // ---- turntable ------------------------------------------------------------------------
    //
    // The turntable alone first: the friend at the decks has its own checks after these.

    await page.evaluate(async () => (await import('./js/settings.js')).setExtra('turntableFriend', false));
    await open('turntable');
    const deck = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            return {
                rate: s.rate,
                place: s.place(),
                heard: s.deck.place(),
                dir: s.deck.dir,
                record: s.records[s.current].name,
                motor: s.motor,
                swapping: !!s.swap,
                started: !!s.deck.voice,
            };
        });
    const tt = await scene(() => {
        const s = window.playroom.stage.scene;
        return {
            cx: s.cx,
            cy: s.cy,
            r: s.recordR,
            button: s.buttonAt,
            records: s.records.map((record) => record.name),
            pads: s.pads.map((pad) => ({
                name: pad.name,
                x: pad.x,
                y: pad.y,
                colour: pad.colour,
                f: pad.f,
                mark: pad.mark,
            })),
            sleeves: s.sleeves.map((q) => ({ x: q.x + q.s / 2, y: q.y + q.s * 0.6 })),
            fader: !!s.fader,
        };
    });
    const { LENGTH: LOOP } = await import(pathToFileURL(join(here, 'js/toys/records.js')).href);
    const { COLOURS, BEATS } = await import(pathToFileURL(join(here, 'js/toys/cubes.js')).href);
    const yellow = COLOURS.find((kind) => kind.name === 'yellow');
    const green = COLOURS.find((kind) => kind.name === 'green');
    // How far apart two places in the loop are, the short way round.
    const apart = (a, b) => ((((a - b) % LOOP) + LOOP * 1.5) % LOOP) - LOOP / 2;
    const SPIN = (Math.PI * 2 * 100) / 3 / 60;
    check(
        'the turntable opens at Sprout: three records in the crate, four pads, no slider',
        tt.records.join(' ') === 'tune beat animals' &&
            tt.pads.map((pad) => pad.name).join(' ') === 'horn boom cow scratch' &&
            !tt.fader,
        `${tt.records.join(' ')}; ${tt.pads.map((pad) => pad.name).join(' ')}`
    );
    await page.waitForTimeout(300);
    const waiting = await deck();
    check(
        'the record waits, stopped and silent, for the button',
        !waiting.motor && waiting.rate === 0 && waiting.heard === null && !waiting.started,
        JSON.stringify(waiting)
    );
    await touch.tap(tt.button.x, tt.button.y);
    await page.waitForTimeout(900);
    const spinning = await deck();
    check(
        'the button starts it: it turns and plays',
        spinning.motor &&
            Math.abs(spinning.rate - 1) < 0.01 &&
            spinning.heard !== null &&
            (await peak(500)) > 0.02,
        `rate ${spinning.rate.toFixed(2)}`
    );

    // A hand on the record holds it, and the music stops; moved, the music goes with it.
    const on = (a) => [tt.cx + Math.cos(a) * tt.r * 0.7, tt.cy + Math.sin(a) * tt.r * 0.7];
    const top = -Math.PI / 2;
    await touch.down(...on(top));
    await page.waitForTimeout(300);
    const held = await deck();
    check(
        'a hand on the record holds it still, and silent',
        Math.abs(held.rate) < 0.01 && held.heard === null
    );
    for (let i = 1; i <= 10; i++) {
        await page.waitForTimeout(16);
        await touch.move(...on(top - (0.8 * i) / 10));
    }
    const back = await deck();
    await page.waitForTimeout(250);
    const backAt = await deck();
    for (let i = 1; i <= 10; i++) {
        await page.waitForTimeout(16);
        await touch.move(...on(top - 0.8 + (0.8 * i) / 10));
    }
    const ahead = await deck();
    await page.waitForTimeout(250);
    const aheadAt = await deck();
    const turnedBack = apart(held.place, backAt.place);
    check(
        'turned back, the music plays backwards, back to where the record is turned to',
        back.rate < -0.3 &&
            back.dir === -1 &&
            back.heard !== null &&
            Math.abs(turnedBack - 0.8 / SPIN) < 0.05,
        `rate ${back.rate.toFixed(2)}, back ${turnedBack.toFixed(3)} s`
    );
    check(
        'and turned on, forwards again: a scratch',
        ahead.rate > 0.3 && ahead.dir === 1 && Math.abs(apart(aheadAt.place, held.place)) < 0.05,
        `rate ${ahead.rate.toFixed(2)}, ${apart(aheadAt.place, held.place).toFixed(3)} s from the start`
    );
    await touch.up();
    await page.waitForTimeout(900);
    const released = await deck();
    check(
        'let go, it spins back up to speed, the music with it',
        Math.abs(released.rate - 1) < 0.02 &&
            released.heard !== null &&
            Math.abs(apart(released.heard, released.place)) < 0.05,
        `rate ${released.rate.toFixed(2)}`
    );

    // A slow frame does not stop the music, and the record catches up with it.
    await scene(() => {
        const until = performance.now() + 400;
        while (performance.now() < until);
    });
    await page.waitForTimeout(1000);
    const caught = await deck();
    check(
        'after a slow frame the record catches up with the music',
        caught.heard !== null && Math.abs(apart(caught.heard, caught.place)) < 0.03,
        `${caught.heard === null ? 'silent' : apart(caught.heard, caught.place).toFixed(3) + ' s apart'}`
    );

    // Another record from the crate: the arm lifts, the records change places, and it plays from
    // its start.
    await touch.tap(tt.sleeves[2].x, tt.sleeves[2].y);
    await page.waitForTimeout(150);
    const swapping = await deck();
    await page.waitForTimeout(900);
    const swapped = await deck();
    check(
        'a record from the crate goes on, and plays from its start',
        swapping.swapping &&
            swapped.record === 'animals' &&
            !swapped.swapping &&
            swapped.heard !== null &&
            swapped.place < 0.6,
        `${swapped.record} at ${swapped.place.toFixed(2)} s`
    );
    await shot('turntable');

    // The button winds it down to a stop, and then nothing moves.
    await touch.tap(tt.button.x, tt.button.y);
    await page.waitForTimeout(1000);
    const winding = await deck();
    await page.waitForTimeout(4600);
    const stopped = await deck();
    const framesStopped = await scene(() => window.playroom.stage.frames);
    await page.waitForTimeout(600);
    check(
        'the button winds the record down to a stop, and then nothing moves',
        !winding.motor &&
            winding.rate > 0.05 &&
            winding.rate < 0.5 &&
            stopped.rate === 0 &&
            stopped.heard === null &&
            (await scene(() => window.playroom.stage.frames)) === framesStopped,
        `${winding.rate.toFixed(2)} after a second`
    );

    const [horn, boom, cow, scratcher] = tt.pads;
    const drum = BEATS.find((beat) => beat.name === 'drum');
    check(
        "the pads keep the playroom's colours: the horn yellow, tooting yellow's note; the cow green, mooing green's an octave down; the boom the colour beats' drum, with its mark",
        horn.colour === yellow.colour &&
            Math.abs(horn.f - noteHz(yellow.degree, 60)) < 1e-9 &&
            cow.colour === green.colour &&
            Math.abs(cow.f - noteHz(green.degree - 5, 60)) < 1e-9 &&
            boom.colour === drum.colour &&
            boom.mark === drum.mark
    );
    await touch.tap(horn.x, horn.y);
    check(
        'the horn toots',
        (await peak(300)) > 0.02 && (await scene(() => window.playroom.stage.scene.pads[0].glow > 0))
    );
    await page.waitForTimeout(900);
    await touch.tap(boom.x, boom.y);
    check('the boom booms', (await peak(300)) > 0.02);
    await page.waitForTimeout(900);
    await touch.tap(cow.x, cow.y);
    check('the cow moos', (await peak(400)) > 0.02);
    await page.waitForTimeout(1200);

    // The scratch pad scratches the record for him: back and forth, and it comes to rest where it was.
    const unscratched = await deck();
    await touch.tap(scratcher.x, scratcher.y);
    const scratched = await scene(async () => {
        const s = window.playroom.stage.scene;
        let slowest = 0;
        let fastest = 0;
        let heard = 0;
        for (let i = 0; i < 40; i++) {
            slowest = Math.min(slowest, s.rate);
            fastest = Math.max(fastest, s.rate);
            if (s.deck.place() !== null) heard++;
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return { slowest, fastest, heard };
    });
    await page.waitForTimeout(600);
    const settled = await deck();
    check(
        'the scratch pad scratches the record, back and forth, and it comes to rest where it was',
        scratched.slowest < -1 &&
            scratched.fastest > 1 &&
            scratched.heard > 5 &&
            Math.abs(settled.rate) < 0.05 &&
            Math.abs(apart(settled.place, unscratched.place)) < 0.05,
        `${scratched.slowest.toFixed(2)} to ${scratched.fastest.toFixed(2)}, ${apart(settled.place, unscratched.place).toFixed(3)} s from where it was`
    );

    // And up again, going on from where it stopped.
    await touch.tap(tt.button.x, tt.button.y);
    await page.waitForTimeout(900);
    const restarted = await deck();
    const onFrom = apart(restarted.place, stopped.place);
    check(
        'the button starts it again, going on from where it stopped',
        restarted.motor &&
            Math.abs(restarted.rate - 1) < 0.02 &&
            restarted.heard !== null &&
            onFrom > 0.4 &&
            onFrom < 1.2,
        `on ${onFrom.toFixed(2)} s`
    );
    check('home from the turntable', (await home()) === 'ShelfScene');

    // ---- the friend at the turntable --------------------------------------------------------------
    //
    // With its switch on, the friend from Weather Song is behind the decks, in headphones, and takes
    // turns with him: at Seed it answers his pads on the same pads; at Sprout it leads with a scratch
    // and waits for him; at Bloom, with the record playing, they take two bars each, and the beat he
    // taps in his stays in the record's loop.

    await page.evaluate(async () => {
        const settings = await import('./js/settings.js');
        settings.setExtra('turntableFriend', true);
        settings.setStage('turntable', 'seed');
    });
    await open('turntable');
    // Every pad played, by whom, and how far the friend's hand was from it; and every scratch.
    const watchDeck = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            s.hitLog = [];
            s.scratchLog = [];
            const hit = s.hit;
            s.hit = function (pad, byFriend) {
                const hand = this.pal && this.pal.hands[1];
                this.hitLog.push({
                    name: pad.name,
                    friend: !!byFriend,
                    t: this.time,
                    reach: hand ? Math.hypot(hand.x - pad.x, hand.y - pad.y) / pad.r : -1,
                });
                return hit.call(this, pad, byFriend);
            };
            const scratch = s.scratch;
            s.scratch = function () {
                this.scratchLog.push(this.time);
                return scratch.call(this);
            };
        });
    const palState = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            const f = s.pal;
            return {
                on: !!f,
                mode: f && f.mode,
                mood: f && f.friend.mood,
                turn: f && f.turn,
                kept: f ? f.kept().map(([step, name]) => `${step}:${name}`) : [],
                pads: s.pads.map((pad) => [pad.x, pad.y, pad.name]),
                button: s.buttonAt,
                r: s.R,
                plinth: s.plinth.y,
                record: [s.cx, s.cy, s.recordR],
                hits: s.hitLog,
                scratches: s.scratchLog,
            };
        });
    await watchDeck();
    let deckPal = await palState();
    await touch.tap(deckPal.pads[0][0], deckPal.pads[0][1]);
    await page.waitForTimeout(350);
    await touch.tap(deckPal.pads[1][0], deckPal.pads[1][1]);
    await page.waitForTimeout(150);
    const palWaits = await palState();
    await page.waitForTimeout(2300);
    const palAnswered = await palState();
    const his = palAnswered.hits.filter((h) => !h.friend);
    const its = palAnswered.hits.filter((h) => h.friend);
    await shot('turntable-friend');
    check(
        'at Seed the friend at the decks waits while he plays, then answers his pads on the same pads, in his order, reaching over to tap each',
        deckPal.on &&
            palWaits.mode === 'wait' &&
            his.map((h) => h.name).join(' ') === 'horn boom' &&
            its.map((h) => h.name).join(' ') === 'horn boom' &&
            its[0].t - his[1].t > 1 &&
            its.every((h) => h.reach >= 0 && h.reach < 0.5),
        JSON.stringify(palAnswered.hits)
    );
    await home();

    // At Sprout it leads: a scratch on the record and a pad, and then it waits for him.
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('turntable', 'sprout'));
    await open('turntable');
    await watchDeck();
    await page.waitForTimeout(3600);
    const led = await palState();
    const [rx, ry, rr] = led.record;
    await touch.down(rx + rr * 0.7, ry);
    for (let i = 1; i <= 8; i++) {
        await page.waitForTimeout(16);
        await touch.move(rx + rr * 0.7, ry - (rr * 0.4 * i) / 8);
    }
    await touch.up();
    await page.waitForTimeout(2300);
    const scratchedBack = await palState();
    check(
        'at Sprout the friend leads, a scratch and a pad, and then waits for him; his scratch it answers with a scratch',
        led.scratches.length === 1 &&
            led.hits.filter((h) => h.friend).length === 1 &&
            led.mode === 'wait' &&
            led.mood === 'listen' &&
            scratchedBack.scratches.length === 2,
        JSON.stringify({
            led: led.scratches.length,
            mode: led.mode,
            mood: led.mood,
            after: scratchedBack.scratches.length,
        })
    );
    await home();

    // At Bloom, with the record going round: its two bars, then his, and his beat stays in the loop.
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('turntable', 'bloom'));
    await open('turntable');
    await watchDeck();
    deckPal = await palState();
    await touch.tap(deckPal.button.x, deckPal.button.y);
    const turnIs = (turn) =>
        page
            .waitForFunction((turn) => window.playroom.stage.scene.pal.turn === turn, turn, { timeout: 9000 })
            .then(
                () => true,
                () => false
            );
    await page.waitForTimeout(400);
    const itsBars = await palState();
    const hisTurn = await turnIs('him');
    const cowPad = deckPal.pads.find((pad) => pad[2] === 'cow');
    const clapPad = deckPal.pads.find((pad) => pad[2] === 'clap');
    await page.waitForTimeout(800);
    await touch.tap(cowPad[0], cowPad[1]);
    await page.waitForTimeout(700);
    await touch.tap(clapPad[0], clapPad[1]);
    const itsTurnAgain = await turnIs('friend');
    const keptAfter = await palState();
    await page.waitForTimeout(5600);
    const later = await palState();
    const keptPlayed = later.hits.filter(
        (h) =>
            h.friend &&
            h.t > keptAfter.hits[keptAfter.hits.length - 1].t &&
            (h.name === 'cow' || h.name === 'clap')
    );
    await shot('turntable-friend-bloom');
    check(
        "at Bloom, with the record going round, the friend plays its two bars, then listens through his; what he taps in his stays in the record's loop and plays each time round",
        itsBars.turn === 'friend' &&
            itsBars.mode === 'play' &&
            hisTurn &&
            itsTurnAgain &&
            keptAfter.kept.length === 2 &&
            keptAfter.kept.some((k) => k.endsWith(':cow')) &&
            keptAfter.kept.some((k) => k.endsWith(':clap')) &&
            keptPlayed.length >= 2,
        JSON.stringify({
            itsBars: itsBars.mode,
            hisTurn,
            itsTurnAgain,
            kept: keptAfter.kept,
            keptPlayed: keptPlayed.length,
        })
    );
    await touch.tap(deckPal.button.x, deckPal.button.y);
    await home();

    // Off, the turntable is as it was: no friend, and the room above it its own again.
    const withFriend = deckPal;
    await page.evaluate(async () => (await import('./js/settings.js')).setExtra('turntableFriend', false));
    await open('turntable');
    const alone = await palState();
    check(
        'with its switch off, there is no friend, and the turntable has its room back',
        !alone.on && alone.plinth < withFriend.plinth && alone.r >= withFriend.r,
        JSON.stringify({
            on: alone.on,
            plinth: [alone.plinth, withFriend.plinth],
            r: [alone.r, withFriend.r],
        })
    );
    await home();
    await page.evaluate(async () => {
        const settings = await import('./js/settings.js');
        settings.setExtra('turntableFriend', true);
        settings.setStage('turntable', 'sprout');
    });

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

    // ---- farm ----------------------------------------------------------------------------------
    //
    // The farm comes out as an empty table. To work on, the tests lay out an island on the Sprout
    // table of 6 by 5 tiles (' ' is table, '.' bare grass):
    //
    //      . . T . . .      a tree                 c runs down to the right on the screen,
    //      . B P P P .      the barn, a path       r down to the left
    //      . . R C N .      the tractor, a cow, a fence
    //      . F F S S .      a field, two sheep
    //      . . W W H .      a pond, the hen house

    // An island laid out at once: in `rows` a letter is land with a piece on it, '.' bare land and
    // ' ' the table; `codes` maps the letters to kinds, and `props` gives a piece some state by its
    // letter. A crane beside a foundation turns to face it, as one does when it sets it.
    const lay = (rows, codes, props = {}) =>
        scene(
            ([rows, codes, props]) => {
                const s = window.playroom.stage.scene;
                rows.forEach((line, r) => {
                    for (let c = 0; c < line.length; c++) {
                        if (line[c] === ' ') continue;
                        s.land[r][c] = true;
                        if (codes[line[c]])
                            s.cells[r][c] = Object.assign(s.make(codes[line[c]]), props[line[c]] || {});
                    }
                });
                if (s.plotBeside) {
                    for (const [c, r] of s.every('crane')) {
                        const plot = s.plotBeside(c, r, (n) => n.step >= 4);
                        if (!plot) continue;
                        const crane = s.at(c, r);
                        crane.slew.value = crane.slew.target = Math.atan2(plot[1] - r, plot[0] - c);
                    }
                }
                s.normalise(true);
                s.drawGround();
            },
            [rows, codes, props]
        );
    const blankTable = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            return {
                land: s.landCount(),
                pieces: s.cells.reduce((n, row) => n + row.filter(Boolean).length, 0),
                found: s.found.size,
                broom: !!s.broomButton,
            };
        });
    const FARM_CODES = {
        P: 'path',
        F: 'field',
        W: 'pond',
        T: 'tree',
        C: 'cow',
        R: 'tractor',
        B: 'barn',
        S: 'sheep',
        H: 'coop',
        N: 'fence',
        G: 'pig',
        M: 'windmill',
        O: 'house',
    };

    await open('farm');
    const farmKinds = await scene(() => window.playroom.stage.scene.kinds);
    check(
        'the farm opens with its tiles and pieces in the tray',
        (await sceneName()) === 'FarmScene' && farmKinds.length === 12 && farmKinds[0] === 'grass'
    );
    const farmBlank = await blankTable();
    check(
        'on an empty table: no land, nothing on it, and a broom beside the sun',
        farmBlank.land === 0 && farmBlank.pieces === 0 && farmBlank.broom,
        JSON.stringify(farmBlank)
    );
    // The fields are already sprouting, so there is something to grow at the first tap.
    await lay(['  T.  ', ' BPPP ', ' .RCN ', ' FFSS ', '  WWH '], FARM_CODES, { F: { stage: 2 } });
    const frog = await page
        .waitForFunction(() => !!window.playroom.stage.scene.frog, null, { timeout: 3000 })
        .then(
            () => true,
            () => false
        );
    check('within seconds a frog sits on a lily pad', frog);
    // Chance says no to everything for now, so only certainty shows a hidden thing; growth by water
    // waits to be asked.
    await scene(() => {
        const s = window.playroom.stage.scene;
        s.rand = () => 0.99;
        s.growClock = -1e9;
    });
    // The middle of a tile's top on the screen, and the size of a piece.
    const cellCentre = (c, r) =>
        scene(
            ([c, r]) => {
                const s = window.playroom.stage.scene;
                const q = s.center(c, r);
                return { x: q.x, y: q.y, s: s.cell };
            },
            [c, r]
        );
    const trayCentre = (kind) =>
        scene((kind) => {
            const t = window.playroom.stage.scene.trayItem(kind);
            return { x: t.x + t.s / 2, y: t.y + t.s / 2 };
        }, kind);
    const kindAt = (c, r) =>
        scene(
            ([c, r]) => {
                const p = window.playroom.stage.scene.at(c, r);
                return p ? p.kind : null;
            },
            [c, r]
        );
    const landAt = (c, r) => scene(([c, r]) => window.playroom.stage.scene.isLand(c, r), [c, r]);
    const landCount = () => scene(() => window.playroom.stage.scene.landCount());
    // A dragged piece is held a little above the finger, so it lands on the tile just above it.
    const carryTo = async (from, to) => {
        await touch.drag(line(from.x, from.y, to.x, to.y + to.s * 0.18, 16), 16, 120);
        await page.waitForTimeout(350);
    };
    const tapCell = async (c, r, dy = 0.05) => {
        const q = await cellCentre(c, r);
        await touch.tap(q.x, q.y + q.s * dy);
    };
    const fieldStages = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            return s.component(1, 3, 'field').map(([c, r]) => s.at(c, r).stage);
        });

    await scene(() => {
        const s = window.playroom.stage.scene;
        const run = s.mouseRun;
        s.mice = 0;
        s.mouseRun = function (c, r) {
            this.mice++;
            return run.call(this, c, r);
        };
    });
    const mice = () => scene(() => window.playroom.stage.scene.mice);
    await tapCell(2, 1);
    const firstMice = await mice();
    await tapCell(3, 1);
    const nextMice = await mice();
    // From here chance always says yes, so every hidden thing shows itself.
    await scene(() => {
        window.playroom.stage.scene.rand = () => 0;
    });
    await tapCell(4, 1);
    const thenMice = await mice();
    check(
        'a hidden thing shows itself the first time whatever chance says, and by chance after that',
        firstMice === 1 && nextMice === 1 && thenMice === 2,
        `mice ${firstMice}, ${nextMice}, ${thenMice}`
    );

    const farmLand = await landCount();
    await carryTo(await trayCentre('grass'), await cellCentre(1, 0));
    check(
        'a tile of grass put down on the table makes the island bigger',
        (await landAt(1, 0)) && (await landCount()) === farmLand + 1 && (await kindAt(1, 0)) === null,
        `${farmLand} -> ${await landCount()}`
    );

    await carryTo(await trayCentre('path'), await cellCentre(3, 0));
    const joined = await scene(() => {
        const s = window.playroom.stage.scene;
        return { kind: s.at(3, 0) && s.at(3, 0).kind, mask: s.mask(3, 0) };
    });
    check(
        'a path put down on the grass joins the path beside it',
        joined.kind === 'path' && (joined.mask & 4) === 4,
        JSON.stringify(joined)
    );

    const sown = await fieldStages();
    await tapCell(1, 3);
    await page.waitForTimeout(700);
    const grown = await fieldStages();
    check(
        'a tap grows the whole joined field a stage',
        sown.length === 2 && grown.every((v) => v === sown[0] + 1),
        `${sown.join('')} -> ${grown.join('')}`
    );
    await scene(() => {
        const s = window.playroom.stage.scene;
        for (const [c, r] of s.component(1, 3, 'field')) s.at(c, r).crop = 'carrot';
    });
    for (let i = 0; i < 4 && (await fieldStages())[0] < 4; i++) {
        await tapCell(1, 3);
        await page.waitForTimeout(600);
    }
    await tapCell(1, 3);
    await page.waitForTimeout(800);
    const harvested = await scene(() => {
        const s = window.playroom.stage.scene;
        return {
            stage: s.at(1, 3).stage,
            crop: s.at(1, 3).crop,
            rabbit: s.fx.some((f) => f.kind === 'rabbit'),
        };
    });
    check(
        'ripe, a tap harvests it, the next crop is sown, and the carrots hid a rabbit',
        harvested.stage === 0 && harvested.crop === 'pumpkin' && harvested.rabbit,
        JSON.stringify(harvested)
    );

    await scene(() => window.playroom.stage.scene.growByWater());
    await page.waitForTimeout(1300);
    check(
        'a field beside the pond grows on its own',
        (await fieldStages()).every((v) => v === 1),
        (await fieldStages()).join('')
    );

    check(
        'a pond of two tiles has no ducks',
        (await scene(() => window.playroom.stage.scene.ducks.length)) === 0
    );
    await carryTo(await trayCentre('pond'), await cellCentre(1, 4));
    const ducks = await scene(() => window.playroom.stage.scene.ducks.map((f) => f.birds.length));
    check(
        'a pond put down on the table brings its land with it, and grown to three tiles, ducks',
        (await landAt(1, 4)) && (await kindAt(1, 4)) === 'pond' && ducks.length === 1 && ducks[0] === 3,
        ducks.join(' ')
    );

    const beforeBaa = await scene(() => window.playroom.stage.scene.time);
    await tapCell(3, 3);
    const baa = await peak(900);
    const answered = await scene((t) => (window.playroom.stage.scene.at(4, 3).called || 0) > t, beforeBaa);
    check('a sheep baas, and the sheep beside it answers', answered && baa > 0.02, `peak ${baa.toFixed(3)}`);

    await carryTo(await cellCentre(2, 0), await cellCentre(1, 2));
    check(
        'a piece can be carried to another tile',
        (await kindAt(1, 2)) === 'tree' && (await kindAt(2, 0)) === null
    );
    await carryTo(await cellCentre(1, 2), await cellCentre(1, 1));
    check(
        'and dropped on another piece, the two swap places',
        (await kindAt(1, 1)) === 'tree' && (await kindAt(1, 2)) === 'barn'
    );
    const coop = await cellCentre(4, 4);
    const tray = await trayCentre('coop');
    await touch.drag(line(coop.x, coop.y, coop.x, tray.y, 16), 16, 120);
    await page.waitForTimeout(500);
    check('carried to the tray, a piece goes back to it', (await kindAt(4, 4)) === null);

    await carryTo(await trayCentre('field'), await cellCentre(1, 2));
    check(
        'a field put down on a piece changes the tile, and the piece goes back to the tray',
        (await kindAt(1, 2)) === 'field' && (await fieldStages()).length === 3
    );
    await carryTo(await trayCentre('grass'), await cellCentre(1, 2));
    check(
        'and grass put down on a tile makes it bare grass again',
        (await kindAt(1, 2)) === null && (await landAt(1, 2)) && (await fieldStages()).length === 2
    );

    for (let i = 0; i < 4 && (await fieldStages())[0] < 4; i++) {
        await tapCell(1, 3);
        await page.waitForTimeout(600);
    }
    await tapCell(2, 2);
    await page.waitForTimeout(500);
    const setOff = await scene(() => {
        const s = window.playroom.stage.scene;
        const t = s.at(2, 2);
        return { away: t.away, covers: s.tour([2, 1]).length };
    });
    check('the tractor sets off along the path', setOff.away === 'trip', JSON.stringify(setOff));
    const home2 = await page
        .waitForFunction(() => !window.playroom.stage.scene.at(2, 2).trip, null, { timeout: 20000 })
        .then(
            () => true,
            () => false
        );
    check(
        'and comes home, having harvested the ripe field beside it',
        home2 && (await fieldStages()).every((v) => v === 0),
        (await fieldStages()).join('')
    );

    // A stream: on its own it is dry; joined to a pond, the pond's water runs into it and on along
    // it, a tile at a time, and a field where it gets to grows. A tap sets a leaf floating down it,
    // and cut off from the pond again, it runs dry.
    const streamSpot = await scene(() => {
        const s = window.playroom.stage.scene;
        const sides = [
            [0, -1],
            [1, 0],
            [0, 1],
            [-1, 0],
        ];
        const free = (c, r) => s.inside(c, r) && !s.at(c, r);
        const pondBy = (c, r) => sides.some(([dc, dr]) => s.is(c + dc, r + dr, 'pond'));
        const spots = [];
        for (let r = 0; r < s.rows; r++) {
            for (let c = 0; c < s.cols; c++) {
                if (!free(c, r) || !pondBy(c, r)) continue;
                for (const [dc, dr] of sides) {
                    const [nc, nr] = [c + dc, r + dr];
                    if (!free(nc, nr) || pondBy(nc, nr)) continue;
                    const field = sides
                        .map(([ec, er]) => [nc + ec, nr + er])
                        .find(([fc, fr]) => s.is(fc, fr, 'field') && s.at(fc, fr).stage < 4);
                    spots.push({ first: [c, r], second: [nc, nr], field: field || null });
                }
            }
        }
        return spots.find((spot) => spot.field) || spots[0] || null;
    });
    const streamAt = (cell) =>
        scene((cell) => {
            const p = window.playroom.stage.scene.at(cell[0], cell[1]);
            return p && p.kind === 'stream' ? { wet: p.wet, reach: p.reach, fillAt: p.fillAt } : null;
        }, cell);
    const fieldStage = (cell) =>
        scene((cell) => window.playroom.stage.scene.at(cell[0], cell[1]).stage, cell);
    const until = (fn, arg, timeout) =>
        page.waitForFunction(fn, arg, { timeout }).then(
            () => true,
            () => false
        );
    const trayStream = await trayCentre('stream');
    await carryTo(trayStream, await cellCentre(...streamSpot.second));
    const streamDry = await streamAt(streamSpot.second);
    const fieldBefore = streamSpot.field && (await fieldStage(streamSpot.field));
    await carryTo(trayStream, await cellCentre(...streamSpot.first));
    // The water is due in the second tile a step after the first; it is seen arriving there, part
    // full, and then full.
    const streamFirst = await streamAt(streamSpot.first);
    const streamNext = await streamAt(streamSpot.second);
    const arriving = await until(
        (cell) => {
            const p = window.playroom.stage.scene.at(cell[0], cell[1]);
            return p.wet > 0 && p.wet < 1;
        },
        streamSpot.second,
        3000
    );
    const arrived = await until(
        (cell) => window.playroom.stage.scene.at(cell[0], cell[1]).wet === 1,
        streamSpot.second,
        3000
    );
    check(
        "a stream on its own is dry; joined to a pond, the pond's water runs into it and on along it, a tile at a time",
        streamDry &&
            streamDry.wet === 0 &&
            streamDry.reach === null &&
            streamFirst.reach === 0 &&
            streamNext.reach === 1 &&
            Math.abs(streamNext.fillAt - streamFirst.fillAt - 0.32) < 1e-6 &&
            arriving &&
            arrived,
        JSON.stringify([streamDry, streamFirst, streamNext, arriving, arrived, streamSpot])
    );
    if (streamSpot.field) {
        const grown = await until(
            ([cell, before]) => window.playroom.stage.scene.at(cell[0], cell[1]).stage > before,
            [streamSpot.field, fieldBefore],
            4000
        );
        check('where the water gets to, the field beside it grows', grown, `from stage ${fieldBefore}`);
    }
    await tapCell(...streamSpot.first, 0);
    const leafOut = await scene(() => window.playroom.stage.scene.leaves.length);
    const leafGone = await until(() => window.playroom.stage.scene.leaves.length === 0, null, 5000);
    check('a tap on the stream sets a leaf floating down it to the end', leafOut === 1 && leafGone);
    const firstAt = await cellCentre(...streamSpot.first);
    await touch.drag(line(firstAt.x, firstAt.y, trayStream.x, trayStream.y, 16), 16, 120);
    const runDry = await until(
        ([a, b]) => {
            const s = window.playroom.stage.scene;
            return !s.at(a[0], a[1]) && s.at(b[0], b[1]).wet === 0;
        },
        [streamSpot.first, streamSpot.second],
        4000
    );
    check('and cut off from the pond, it runs dry', runDry);
    await shot('farm-stream');

    const sun = await scene(() => window.playroom.stage.scene.sunButton);
    await touch.tap(sun.x, sun.y);
    await page.waitForTimeout(2600);
    check('the sun turns the farm to night', (await scene(() => window.playroom.stage.scene.night)) > 0.9);
    await tapCell(3, 2);
    await page.waitForTimeout(300);
    check(
        'and at night, the cow jumps over the moon',
        await scene(() => window.playroom.stage.scene.fx.some((f) => f.kind === 'moonJump'))
    );
    await shot('farm-night');
    await touch.tap(sun.x, sun.y);
    await page.waitForTimeout(2800);
    check('and the moon brings the morning', (await scene(() => window.playroom.stage.scene.night)) < 0.1);

    await shot('farm');

    // The broom: a tap sweeps every piece back to the tray and leaves the island plain, and the
    // board begins again as it comes off the shelf, on that land; a second tap sweeps the land
    // away, and the table is empty.
    const sweepTable = async () => {
        const broom = await scene(() => window.playroom.stage.scene.broomButton);
        const before = await blankTable();
        const swept = (land) =>
            page
                .waitForFunction(
                    (land) => {
                        const s = window.playroom.stage.scene;
                        const pieces = s.cells.reduce((n, row) => n + row.filter(Boolean).length, 0);
                        return !s.sweep && pieces === 0 && (land ? s.landCount() > 0 : s.landCount() === 0);
                    },
                    land,
                    { timeout: 5000 }
                )
                .then(
                    () => true,
                    () => false
                );
        await touch.tap(broom.x, broom.y);
        const first = await swept(true);
        const plain = await blankTable();
        await touch.tap(broom.x, broom.y);
        const second = await swept(false);
        return { before, first, plain, second, after: await blankTable() };
    };
    const farmSweep = await sweepTable();
    check(
        'a tap on the broom sweeps every piece back to the tray and leaves the island plain grass, and the farm begins again',
        farmSweep.first &&
            farmSweep.before.pieces > 0 &&
            farmSweep.plain.land === farmSweep.before.land &&
            farmSweep.plain.pieces === 0 &&
            farmSweep.plain.found === 0,
        JSON.stringify(farmSweep)
    );
    check(
        'and a second tap sweeps the land away: an empty table',
        farmSweep.second &&
            farmSweep.after.land === 0 &&
            farmSweep.after.pieces === 0 &&
            (await sceneName()) === 'FarmScene',
        JSON.stringify(farmSweep.after)
    );
    await carryTo(await trayCentre('cow'), await cellCentre(2, 2));
    check(
        'where a piece put down brings its land again',
        (await kindAt(2, 2)) === 'cow' && (await landCount()) === 1
    );
    check('home from the farm', (await home()) === 'ShelfScene');
    await open('farm');
    const farmAgain = await blankTable();
    check(
        'and the farm comes off the shelf again as an empty table, its surprises new',
        farmAgain.land === 0 && farmAgain.pieces === 0 && farmAgain.found === 0,
        JSON.stringify(farmAgain)
    );
    await home();

    // ---- dig -----------------------------------------------------------------------------------
    //
    // A finger drives the digger's bucket: the sand it takes is the sand the ground loses, and every
    // grain digPoured lands somewhere. Volumes are compared to a hundredth of a unit.

    await open('dig');
    const digStart = await scene(() => {
        const s = window.playroom.stage.scene;
        return {
            name: s.constructor.name,
            truck: !!s.truck,
            dozer: !!s.dozer,
            volume: s.volume(),
            cup: s.joints().cup,
            heap: s.surfaceY(s.w * 0.44),
        };
    });
    check(
        'the dig opens with a digger, a truck and a heap of sand',
        digStart.name === 'DigScene' && digStart.truck && !digStart.dozer
    );
    const digState = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            return {
                volume: s.volume(),
                ground: s.groundVolume(),
                bucket: s.bucketLoad(),
                truck: s.truckLoad(),
                found: s.found.size,
                motor: s.motorLevel,
            };
        });
    const digInto = { x: 1024 * 0.44, y: digStart.heap + 60 };
    await touch.down(digStart.cup.x, digStart.cup.y);
    for (const [x, y] of line(digStart.cup.x, digStart.cup.y, digInto.x, digInto.y, 20).slice(1)) {
        await page.waitForTimeout(30);
        await touch.move(x, y);
    }
    await page.waitForTimeout(600);
    const digScooped = await digState();
    check(
        'a finger in the sand fills the bucket, and the ground gives up exactly what it takes',
        digScooped.bucket > 0 && Math.abs(digScooped.ground + digScooped.bucket - digStart.volume) < 0.01,
        `bucket ${digScooped.bucket.toFixed(1)}, ground ${digScooped.ground.toFixed(1)} of ${digStart.volume.toFixed(1)}`
    );
    check('and the first proper bite always turns something up', digScooped.found >= 1);
    const digTruckAt = await scene(() => {
        const s = window.playroom.stage.scene;
        return { x: s.truck.x, by: s.truck.by, k: s.k, facing: s.truck.facing };
    });
    const digOver = {
        x: digTruckAt.x - digTruckAt.facing * digTruckAt.k * 0.15,
        y: digTruckAt.by - digTruckAt.k * 1.05,
    };
    for (const [x, y] of line(digInto.x, digInto.y, digOver.x, digOver.y, 30).slice(1)) {
        await page.waitForTimeout(30);
        await touch.move(x, y);
    }
    const digMoving = await scene(() => window.playroom.stage.scene.motorLevel);
    await page.waitForTimeout(900);
    await touch.up();
    const digSettled = () =>
        page
            .waitForFunction(
                () => {
                    const s = window.playroom.stage.scene;
                    return s.bucketLoad() === 0 && s.grains.length === 0 && (!s.truck || s.truck.tip < 0.05);
                },
                null,
                { timeout: 8000 }
            )
            .then(
                () => true,
                () => false
            );
    await digSettled();
    await page.waitForTimeout(700);
    const digPoured = await digState();
    check(
        'carried over the truck and let go, it pours into the bed, and not a grain is lost',
        digPoured.truck > 0 && Math.abs(digPoured.volume - digStart.volume) < 0.01,
        `truck ${digPoured.truck.toFixed(1)}, all ${digPoured.volume.toFixed(2)} of ${digStart.volume.toFixed(2)}`
    );
    check(
        "the arm's motor sings while the arm moves, and is quiet once it stops",
        digMoving > 0.05 && digPoured.motor === 0,
        `${digMoving.toFixed(2)} then ${digPoured.motor.toFixed(2)}`
    );
    const digBed = await scene(() => {
        const s = window.playroom.stage.scene;
        const t = s.truck;
        return { x: t.x - t.facing * s.k * 0.2, y: t.by - s.k * 0.3 };
    });
    await touch.tap(digBed.x, digBed.y);
    await page.waitForTimeout(400);
    await digSettled();
    await page.waitForFunction(() => window.playroom.stage.scene.truckLoad() === 0, null, { timeout: 6000 });
    const digTipped = await digState();
    check(
        'tapped on its bed, the truck tips its load out onto the sand',
        digTipped.truck === 0 && Math.abs(digTipped.ground - digStart.volume) < 0.01,
        `ground ${digTipped.ground.toFixed(2)}`
    );
    const digCab = await scene(() => {
        const s = window.playroom.stage.scene;
        const t = s.truck;
        return { x: t.x + t.facing * s.k * 0.28, y: t.by - s.k * 0.35, from: t.x, k: s.k };
    });
    await touch.drag(line(digCab.x, digCab.y, digCab.x - 170, digCab.y, 24), 30, 300);
    await page.waitForTimeout(700);
    const digDrove = await scene(() => {
        const s = window.playroom.stage.scene;
        const t = s.truck;
        return { x: t.x, by: t.by, ground: s.surfaceY(t.x) };
    });
    check(
        'dragged, the truck drives over the sand, riding its shape',
        digDrove.x < digCab.from - 60 && Math.abs(digDrove.by - digDrove.ground) < digCab.k * 0.25,
        `from ${Math.round(digCab.from)} to ${Math.round(digDrove.x)}`
    );
    await shot('dig');
    check('home from the dig', (await home()) === 'ShelfScene');
    await open('dig');
    const digAgain = await digState();
    check(
        'and the dig starts fresh when it comes off the shelf again',
        digAgain.bucket === 0 &&
            digAgain.truck === 0 &&
            digAgain.found === 0 &&
            Math.abs(digAgain.volume - digStart.volume) < 0.01
    );
    await home();

    // ---- crane ---------------------------------------------------------------------------------
    //
    // Parts rest on a grid of half-blocks: a part's height above the ground is a whole number of
    // half-blocks, `g`, and it lands a note higher for each.

    await open('crane');
    const craneLook = () =>
        scene(() =>
            window.playroom.stage.scene.parts
                .map(
                    (p) =>
                        `${p.kind}:${p.name}@${p.col}:${Math.round(window.playroom.stage.scene.ground - p.y)}`
                )
                .join(' ')
        );
    const craneStart = await scene(() => {
        const s = window.playroom.stage.scene;
        return {
            name: s.constructor.name,
            parts: s.parts.length,
            g: s.g,
            x0: s.x0,
            ground: s.ground,
            pile: s.pileCols,
        };
    });
    const craneFresh = await craneLook();
    check(
        'the crane opens with its parts on the pile',
        craneStart.name === 'CraneScene' && craneStart.parts === 8,
        `${craneStart.parts} parts`
    );
    await scene(() => {
        window.playroom.stage.scene.rand = () => 0.99;
    });
    // A drag that starts on the hook, wherever it is, through `points`, pausing where asked.
    const hookDrag = async (points, release = true) => {
        const tip = await scene(() => window.playroom.stage.scene.hookTip());
        let [px, py] = [tip.x, tip.y - 8];
        await touch.down(px, py);
        for (const [x, y, pause = 0] of points) {
            for (const [mx, my] of line(
                px,
                py,
                x,
                y,
                Math.max(1, Math.round(Math.hypot(x - px, y - py) / 12))
            ).slice(1)) {
                await page.waitForTimeout(16);
                await touch.move(mx, my);
            }
            [px, py] = [x, y];
            if (pause) await page.waitForTimeout(pause);
        }
        if (release) await touch.up();
    };
    // The highest block on the pile with nothing resting on it, and the hook's way down onto it:
    // across above everything, then straight down, so it meets no other part on the way.
    const craneFree = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            const tops = s.tops();
            const free = s.parts.filter((p) => {
                if (p.kind !== 'block' || p.state !== 'rest' || p.col + p.cols > s.pileCols) return false;
                const top = s.ground - p.y + s.height(p);
                for (let i = 0; i < p.cols; i++) if (tops[p.col + i] > top + 0.5) return false;
                return true;
            });
            free.sort((a, b) => a.y - s.height(a) - (b.y - s.height(b)));
            const p = free[0];
            return p && { id: p.id, x: p.x, top: p.y - s.height(p), base: s.ground - p.y, col: p.col };
        });
    const craneOnto = async (part) => {
        const { tip, highest } = await scene(() => {
            const s = window.playroom.stage.scene;
            const tops = s.parts.filter((p) => p.state === 'rest').map((p) => p.y - s.height(p));
            return { tip: s.hookTip(), highest: Math.min(...tops) };
        });
        const high = Math.min(tip.y - 8, highest - craneStart.g * 2);
        // A pause above the part lets the swing from the run across die down before the drop.
        return [
            [tip.x, high],
            [part.x, high, 1200],
            [part.x, part.top + 6, 700],
        ];
    };
    const partById = (id) =>
        scene((id) => {
            const s = window.playroom.stage.scene;
            const p = s.parts.find((q) => q.id === id);
            return { state: p.state, base: Math.round(s.ground - p.y), col: p.col, x: p.x };
        }, id);
    const restAll = () =>
        page
            .waitForFunction(() => window.playroom.stage.scene.parts.every((p) => p.state === 'rest'), null, {
                timeout: 8000,
            })
            .then(
                () => true,
                () => false
            );

    const craneFirst = await craneFree();
    const craneBuildX = craneStart.x0 + (craneStart.pile + 6) * craneStart.g;
    const craneTrolleyFrom = await scene(() => window.playroom.stage.scene.hook.tx);
    await hookDrag(await craneOnto(craneFirst), false);
    const craneCaught = await scene(() => {
        const s = window.playroom.stage.scene;
        return { carrying: s.hook.carrying && s.hook.carrying.id, tx: s.hook.tx, winch: s.winchLevel };
    });
    check(
        'dragging the hook runs the trolley along the jib and winds the cable down to the finger',
        Math.abs(craneCaught.tx - craneFirst.x) < craneStart.g &&
            Math.abs(craneTrolleyFrom - craneFirst.x) > craneStart.g
    );
    check('lowered onto a part, the hook takes it', craneCaught.carrying === craneFirst.id);
    for (const [x, y] of line(
        craneFirst.x,
        craneFirst.top + 6,
        craneBuildX,
        craneStart.ground - 260,
        20
    ).slice(1)) {
        await page.waitForTimeout(16);
        await touch.move(x, y);
    }
    const craneWinching = await scene(() => window.playroom.stage.scene.winchLevel);
    await page.waitForTimeout(900);
    await touch.up();
    await restAll();
    const craneLanded = await partById(craneFirst.id);
    const craneFirstNote = await scene(() => window.playroom.stage.scene.lastLanding);
    check(
        'carried over the slab and let go, it drops onto the ground',
        craneLanded.state === 'rest' && craneLanded.base === 0 && craneLanded.col >= craneStart.pile,
        JSON.stringify(craneLanded)
    );

    const craneSecond = await craneFree();
    await hookDrag([...(await craneOnto(craneSecond)), [craneBuildX, craneStart.ground - 300, 900]]);
    await restAll();
    const craneStacked = await partById(craneSecond.id);
    const craneSecondNote = await scene(() => window.playroom.stage.scene.lastLanding);
    check(
        'and a second let go above it lands on top of it, a note higher',
        craneStacked.col === craneLanded.col &&
            craneStacked.base === Math.round(craneStart.g * 2) &&
            craneSecondNote.degree > craneFirstNote.degree,
        `${JSON.stringify(craneStacked)}, notes ${craneFirstNote.degree} then ${craneSecondNote.degree}`
    );
    await page.waitForTimeout(700);
    check(
        'the winch sings while the hook moves, and is quiet once it stops',
        craneWinching > 0.05 && (await scene(() => window.playroom.stage.scene.winchLevel)) === 0,
        craneWinching.toFixed(2)
    );

    const craneThird = await craneFree();
    const craneByHandTo = craneBuildX - craneStart.g * 4;
    await touch.drag(
        line(craneThird.x, craneThird.top + craneStart.g, craneByHandTo, craneStart.ground - 200, 24),
        20,
        300
    );
    await restAll();
    const craneCarried = await partById(craneThird.id);
    check(
        'a part carried by hand goes where the finger takes it, the hook following',
        craneCarried.state === 'rest' && Math.abs(craneCarried.x - craneByHandTo) < craneStart.g * 1.6,
        JSON.stringify(craneCarried)
    );

    await touch.tap(craneLanded.x, craneStart.ground + 10);
    const craneLit = await page.evaluate(
        async ([a, b]) => {
            const s = window.playroom.stage.scene;
            const order = [];
            const end = Date.now() + 1500;
            while (Date.now() < end) {
                for (const id of [a, b]) {
                    const p = s.parts.find((q) => q.id === id);
                    if (p.glow > 0.9 && order.indexOf(id) < 0) order.push(id);
                }
                await new Promise((r) => setTimeout(r, 30));
            }
            return order;
        },
        [craneFirst.id, craneSecond.id]
    );
    check(
        "a tap at a building's foot plays it from the bottom up, each part lit as it sounds",
        craneLit.join(' ') === `${craneFirst.id} ${craneSecond.id}`,
        craneLit.join(' ')
    );
    const craneNested = await page
        .waitForFunction(
            () => {
                const b = window.playroom.stage.scene.bird;
                return b && (b.state === 'nesting' || b.state === 'building');
            },
            null,
            { timeout: 8000 }
        )
        .then(
            () => true,
            () => false
        );
    check('a bird comes to nest on the very top, the first time whatever chance says', craneNested);

    // The trucks: one in a colour of the parts backs in at the far end, the parts it has come for
    // marked out on its deck. A part of another colour carried onto it hops back to the pile; parts of
    // its colour go into their places; loaded, it drives away, and the far crane brings as many new
    // parts to the pile before the next truck comes.
    const craneTruck = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            const t = s.truck;
            if (!t) return null;
            const here = s.parts.filter((p) => p.name === t.name && p.state === 'rest');
            return {
                state: t.state,
                name: t.name,
                wants: t.slots.map((q) => q.kind),
                filled: t.slots.filter((q) => q.part && q.part.state === 'loaded').length,
                there: t.slots.every(
                    (q) =>
                        here.filter((p) => p.kind === q.kind).length >=
                        t.slots.filter((r) => r.kind === q.kind).length
                ),
            };
        });
    const craneTruckWaits = () =>
        page
            .waitForFunction(
                () => {
                    const t = window.playroom.stage.scene.truck;
                    return t && t.state === 'waiting';
                },
                null,
                { timeout: 15000 }
            )
            .then(
                () => true,
                () => false
            );
    // A part at rest with nothing on part of its top: the truck's (`fits`) or not; where to touch it.
    const craneReachable = (fits) =>
        scene((fits) => {
            const s = window.playroom.stage.scene;
            const t = s.truck;
            const tops = s.tops();
            for (const p of s.parts) {
                if (p.state !== 'rest' || p.kind === 'ball') continue;
                if ((p.name === t.name && t.slots.some((q) => !q.part && q.kind === p.kind)) !== fits)
                    continue;
                const top = s.ground - p.y + s.height(p);
                for (let i = 0; i < p.cols; i++) {
                    if (tops[p.col + i] > top + 0.5) continue;
                    const x = s.x0 + (p.col + i + 0.5) * s.g;
                    return { id: p.id, x, y: p.y - s.height(p) / 2, dx: p.x - x, h: s.height(p) };
                }
            }
            return null;
        }, fits);
    // What lies on top of a part the truck wants, with nothing on it in turn.
    const craneOnTop = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            const t = s.truck;
            const tops = s.tops();
            const want = s.parts.find(
                (p) =>
                    p.state === 'rest' &&
                    p.name === t.name &&
                    t.slots.some((q) => !q.part && q.kind === p.kind)
            );
            if (!want) return null;
            const over = s.parts
                .filter(
                    (q) =>
                        q.state === 'rest' &&
                        q !== want &&
                        q.col < want.col + want.cols &&
                        want.col < q.col + q.cols &&
                        q.y < want.y
                )
                .sort((a, b) => a.y - b.y);
            for (const q of over) {
                const top = s.ground - q.y + s.height(q);
                for (let i = 0; i < q.cols; i++) {
                    if (tops[q.col + i] > top + 0.5) continue;
                    const x = s.x0 + (q.col + i + 0.5) * s.g;
                    return { id: q.id, x, y: q.y - s.height(q) / 2, dx: q.x - x, h: s.height(q) };
                }
            }
            return null;
        });
    // Carried by hand to above (x, deck), and let go.
    const craneCarryTo = (p, x, deck) =>
        touch.drag(line(p.x, p.y, x - p.dx, deck - p.h / 2 - 30, 24), 16, 250);
    const craneWaited = await craneTruckWaits();
    const craneTruck1 = await craneTruck();
    check(
        "a truck in one of the parts' colours backs in, the parts it has come for marked out on its deck",
        craneWaited && craneTruck1.wants.length >= 1 && craneTruck1.there,
        JSON.stringify(craneTruck1)
    );
    const craneDeck = await scene(() => {
        const s = window.playroom.stage.scene;
        return { x: s.bay.x0 + (s.bay.cols * s.g) / 2, y: s.deckY() };
    });
    const craneWrong = await craneReachable(false);
    await craneCarryTo(craneWrong, craneDeck.x, craneDeck.y);
    const craneWentBack = await page
        .waitForFunction(
            (id) => {
                const p = window.playroom.stage.scene.parts.find((q) => q.id === id);
                return p.state === 'rest' && p.col === p.home;
            },
            craneWrong.id,
            { timeout: 6000 }
        )
        .then(
            () => true,
            () => false
        );
    check(
        'a part of another colour carried onto the truck hops back to the pile',
        craneWentBack && (await craneTruck()).filled === 0
    );
    const craneCount = await scene(() => window.playroom.stage.scene.parts.length);
    const craneFirstNew = await scene(() => window.playroom.stage.scene.nextId);
    for (let i = 0; i < 8; i++) {
        const t = await craneTruck();
        if (!t || t.state !== 'waiting') break;
        const p = await craneReachable(true);
        if (p) {
            const to = await scene((id) => {
                const s = window.playroom.stage.scene;
                return s.placeFor(s.parts.find((q) => q.id === id)).x;
            }, p.id);
            await craneCarryTo(p, to, craneDeck.y);
        } else {
            const q = await craneOnTop();
            if (!q) break;
            await craneCarryTo(
                q,
                craneStart.x0 + (craneStart.pile + 2) * craneStart.g,
                craneStart.ground - 150
            );
        }
        await page.waitForTimeout(700);
    }
    const craneLoaded = await craneTruck();
    check(
        "parts of the truck's colour carried onto it go into their places",
        craneLoaded && craneLoaded.state !== 'waiting' && craneLoaded.filled === craneTruck1.wants.length,
        JSON.stringify(craneLoaded)
    );
    const craneGone = await page
        .waitForFunction(() => !window.playroom.stage.scene.truck, null, { timeout: 8000 })
        .then(
            () => true,
            () => false
        );
    const craneRestocked = await page
        .waitForFunction(
            ([n, first]) => {
                const s = window.playroom.stage.scene;
                if (s.parts.length !== n || s.drop || s.deliveries.length) return false;
                return s.parts.every(
                    (p) => p.state === 'rest' && (p.id < first || p.col + p.cols <= s.pileCols)
                );
            },
            [craneCount, craneFirstNew],
            { timeout: 20000 }
        )
        .then(
            () => true,
            () => false
        );
    const craneNextCame = await craneTruckWaits();
    const craneTruck2 = await craneTruck();
    check(
        'loaded, it drives away; the other crane brings as many new parts to the pile, and another truck comes',
        craneGone && craneRestocked && craneNextCame && craneTruck2.name !== craneTruck1.name,
        `${craneTruck1.name} then ${craneTruck2 && craneTruck2.name}`
    );

    const craneSun = await scene(() => window.playroom.stage.scene.sunButton);
    await touch.tap(craneSun.x, craneSun.y);
    await page.waitForTimeout(2600);
    check(
        'at night the windows light',
        (await scene(() => window.playroom.stage.scene.night)) > 0.9 &&
            (await scene(() => window.playroom.stage.scene.windowsLit())) > 0
    );
    await shot('crane-night');
    await touch.tap(craneSun.x, craneSun.y);
    await page.waitForTimeout(2600);
    await shot('crane');
    check('home from the crane', (await home()) === 'ShelfScene');
    await open('crane');
    check('and the crane starts fresh when it comes off the shelf again', (await craneLook()) === craneFresh);
    await home();

    // ---- building site ---------------------------------------------------------------------------
    //
    // The site comes out as an empty table too. Its pieces stand on the ground rather than taking
    // its place, and only on flat ground, earth or road. The tests lay out, at Sprout:
    //
    //                              L . P D T .      a pile, a plot, the digger, the truck
    //                              . . P P . .      the plot goes on round: three tiles joined
    //                              R R R R R        a road
    //                              M F H C B        the mixer, the forms in a hole, a dug hole,
    //                              K K . O .        the crane, a building; cones, the hut
    //                                               (and the rest of the table, still to build on)
    //
    // where P is a plot marked out, H one dug, F one with its forms in, and B a building as tall as
    // the crane builds.
    const SITE_CODES = {
        R: 'road',
        P: 'plot',
        H: 'plot',
        F: 'plot',
        B: 'plot',
        L: 'pile',
        D: 'digger',
        T: 'truck',
        M: 'mixer',
        C: 'crane',
        K: 'cones',
        O: 'hut',
        Y: 'roller',
        Z: 'dozer',
        V: 'paver',
        J: 'lamp',
    };
    const PLOTS = { P: { step: 0 }, H: { step: 1 }, F: { step: 2 }, B: { step: 8 } };
    // Each tile of the table as letters: what stands, over what it stands on.
    const siteAt = (c, r) =>
        scene(
            ([c, r]) => {
                const s = window.playroom.stage.scene;
                const p = s.at(c, r);
                if (!p) return s.isLand(c, r) ? 'earth' : 'table';
                const of = (q) =>
                    q.kind +
                    (q.kind === 'plot' ? q.step : '') +
                    (q.kind === 'road' ? `:${q.state}` : '') +
                    (q.load ? '*' : '');
                return p.under ? `${of(p)}/${of(p.under)}` : of(p);
            },
            [c, r]
        );
    const count = (kind) => scene((kind) => window.playroom.stage.scene.every(kind).length, kind);

    await open('site');
    const siteKinds = await scene(() => window.playroom.stage.scene.kinds);
    check(
        'the building site opens with its tiles and pieces in the tray',
        (await sceneName()) === 'SiteScene' && siteKinds.length === 10 && siteKinds[0] === 'earth'
    );
    const siteBlank = await blankTable();
    check(
        'on an empty table, with a broom beside the sun',
        siteBlank.land === 0 && siteBlank.pieces === 0 && siteBlank.broom,
        JSON.stringify(siteBlank)
    );
    await lay(['L.PDT.', '..PP..', 'RRRRR ', 'MFHCB ', 'KK.O. '], SITE_CODES, PLOTS);
    const plotAt = (c, r) => scene(([c, r]) => window.playroom.stage.scene.at(c, r).step, [c, r]);
    await scene(() => {
        const s = window.playroom.stage.scene;
        s.rand = () => 0.99;
        const run = s.pigeons;
        s.flocks = 0;
        s.pigeons = function (c, r) {
            this.flocks++;
            return run.call(this, c, r);
        };
    });
    const flocks = () => scene(() => window.playroom.stage.scene.flocks);
    await tapCell(1, 2);
    const firstFlock = await flocks();
    await tapCell(2, 2);
    const nextFlock = await flocks();
    await scene(() => {
        window.playroom.stage.scene.rand = () => 0;
    });
    await tapCell(4, 2);
    check(
        'pigeons come to the road the first time whatever chance says, and by chance after that',
        firstFlock === 1 && nextFlock === 1 && (await flocks()) === 2,
        `flocks ${firstFlock}, ${nextFlock}, ${await flocks()}`
    );

    await carryTo(await trayCentre('earth'), await cellCentre(5, 2));
    check('a tile of earth put down on the table makes the site bigger', await landAt(5, 2));
    await carryTo(await trayCentre('road'), await cellCentre(5, 2));
    const siteRoad = await scene(() => {
        const s = window.playroom.stage.scene;
        return { kind: s.at(5, 2) && s.at(5, 2).kind, state: s.at(5, 2).state, mask: s.mask(5, 2) };
    });
    check(
        'a road dragged from the tray joins the road beside it, paved, at Sprout',
        siteRoad.kind === 'road' && siteRoad.state === 'paved' && (siteRoad.mask & 8) === 8,
        JSON.stringify(siteRoad)
    );

    // Where a machine may stand: on flat ground, and on it, not in its place.
    await carryTo(await trayCentre('truck'), await cellCentre(2, 1));
    const onPlot = { tile: await siteAt(2, 1), trucks: await count('truck') };
    await carryTo(await trayCentre('truck'), await cellCentre(5, 2));
    const onRoad = await siteAt(5, 2);
    const roadJoined = await scene(() => window.playroom.stage.scene.mask(4, 2, 'road') & 2);
    check(
        'a truck put down on a plot goes back to the tray, and the plot stays as it was',
        onPlot.tile === 'plot0' && onPlot.trucks === 1,
        JSON.stringify(onPlot)
    );
    check(
        'put down on a road, it stands on the road, and the road is still there under it, joined to the next',
        onRoad === 'truck/road:paved' && roadJoined === 2,
        onRoad
    );
    await carryTo(await trayCentre('plot'), await cellCentre(5, 2));
    const plotUnder = await siteAt(5, 2);
    await carryTo(await trayCentre('earth'), await cellCentre(5, 2));
    const earthUnder = await siteAt(5, 2);
    await carryTo(await cellCentre(5, 2), Object.assign(await trayCentre('truck'), { s: 0 }));
    check(
        'a plot cannot go in under a truck, but earth can: the road goes, and the truck stays where it is',
        plotUnder === 'truck/road:paved' && earthUnder === 'truck' && (await siteAt(5, 2)) === 'earth',
        `${plotUnder}, ${earthUnder}`
    );

    // The digger: one tile at a time, however many it is joined to. Its work takes its own time,
    // which on a slow machine is slower than the clock's, so the tests wait for it to be done.
    const digged = async () => {
        await tapCell(3, 0, -0.05);
        await page.waitForFunction(() => !window.playroom.stage.scene.at(3, 0).work, null, {
            timeout: 10000,
        });
    };
    await digged();
    const firstDig = {
        tiles: [await plotAt(3, 1), await plotAt(2, 0), await plotAt(2, 1)],
        truck: await siteAt(4, 0),
    };
    check(
        'the digger digs out one tile of the plot beside it, however many it is joined to, and loads the earth into the truck beside it',
        firstDig.tiles.join('') === '100' && firstDig.truck === 'truck*',
        JSON.stringify(firstDig)
    );
    await tapCell(4, 0, -0.05);
    const truckTurn = await scene(() => {
        const s = window.playroom.stage.scene;
        const t = s.at(4, 0).trip;
        if (!t) return null;
        const [c, r] = t.points[(t.points.length - 1) / 2];
        return { c, r, edge: s.openSides(c, r).length > 0 };
    });
    const truckHome = await page
        .waitForFunction(() => !window.playroom.stage.scene.at(4, 0).trip, null, { timeout: 25000 })
        .then(
            () => true,
            () => false
        );
    check(
        'the truck takes the earth to the edge of the site, tips it over, and comes home empty',
        !!truckTurn && truckTurn.edge && truckHome && (await siteAt(4, 0)) === 'truck',
        JSON.stringify(truckTurn)
    );
    await digged();
    const secondDig = [await plotAt(3, 1), await plotAt(2, 0), await plotAt(2, 1)];
    await tapCell(3, 0, -0.05);
    const scoop = await scene(() => {
        const w = window.playroom.stage.scene.at(3, 0).work;
        return w && w.type;
    });
    await page.waitForFunction(() => !window.playroom.stage.scene.at(3, 0).work, null, { timeout: 10000 });
    check(
        'the next tap, the next tile beside it; with no marked tile in its reach it scoops at the air, and the tile it cannot reach waits',
        secondDig.join('') === '110' && scoop === 'scoop' && (await plotAt(2, 1)) === 0,
        `${secondDig.join('')} ${scoop}`
    );

    // A building's work, a step at a time.
    const craneLift = async () => {
        await tapCell(3, 3, -0.05);
        await page.waitForFunction(() => !window.playroom.stage.scene.at(3, 3).work, null, { timeout: 8000 });
    };
    await craneLift();
    check(
        'the crane lowers the forms into the hole beside it',
        (await plotAt(2, 3)) === 2 && (await plotAt(1, 3)) === 2
    );
    await tapCell(0, 3, -0.05);
    const poured = await page
        .waitForFunction(
            () => {
                const s = window.playroom.stage.scene;
                return s.at(1, 3).step === 3 && s.at(2, 3).step === 3;
            },
            null,
            { timeout: 8000 }
        )
        .then(
            () => true,
            () => false
        );
    check(
        'the mixer pours the concrete into the forms beside it, and the forms joined to them',
        poured,
        `${await plotAt(1, 3)} ${await plotAt(2, 3)}`
    );
    await scene(() => {
        const s = window.playroom.stage.scene;
        for (const c of [1, 2]) s.at(c, 3).setting = 6.9;
    });
    await page.waitForTimeout(400);
    check(
        'and it sets by itself into a foundation',
        (await plotAt(1, 3)) === 4 && (await plotAt(2, 3)) === 4
    );
    await craneLift();
    check(
        'the crane lifts a floor onto the foundation it has been working on',
        (await plotAt(1, 3)) === 5 && (await plotAt(2, 3)) === 5
    );
    await scene(() => {
        const s = window.playroom.stage.scene;
        for (const c of [1, 2]) s.at(c, 3).step = 4 + s.maxFloors - 1;
    });
    await craneLift();
    const topped = async () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            return s.at(1, 3).tree || s.at(2, 3).tree;
        });
    const tall = await plotAt(2, 3);
    check('up to as tall as it builds', tall === 8 && !(await topped()), `step ${tall}`);
    await craneLift();
    check('and then tops it out with a tree', (await plotAt(2, 3)) === 8 && (await topped()));

    await tapCell(4, 3);
    const played = await page.evaluate(async () => {
        const seen = [];
        const s = window.playroom.stage.scene;
        const end = Date.now() + 1800;
        while (Date.now() < end) {
            const g = s.at(4, 3).glow;
            if (g >= 0 && seen[seen.length - 1] !== g) seen.push(g);
            await new Promise((r) => setTimeout(r, 40));
        }
        return seen;
    });
    check(
        'a tap on a building plays its floors from the ground up, each lit as it sounds',
        played.join('') === '0123',
        played.join(' ')
    );

    const worked = await (async () => {
        await tapCell(3, 4, -0.05);
        return page.evaluate(async () => {
            const kinds = new Set();
            const s = window.playroom.stage.scene;
            const end = Date.now() + 8000;
            while (Date.now() < end) {
                for (const row of s.cells)
                    for (const p of row) if (p && (p.work || p.trip)) kinds.add(p.kind);
                await new Promise((r) => setTimeout(r, 100));
            }
            return Array.from(kinds).sort();
        });
    })();
    check(
        "the foreman's whistle sets the machines going, one after another",
        ['crane', 'digger', 'mixer', 'truck'].every((k) => worked.indexOf(k) >= 0),
        worked.join(' ')
    );
    await page.waitForFunction(() => !window.playroom.stage.scene.at(4, 0).trip, null, { timeout: 25000 });

    // Cones put down on the road behind the building: they stand on the road, show through the
    // building, and a touch where they are takes them, not the building.
    await scene(() => {
        const s = window.playroom.stage.scene;
        s.put(3, 2, s.make('cones'), true);
    });
    await page.waitForTimeout(300);
    const siteGhost = await scene(() => {
        const s = window.playroom.stage.scene;
        const q = s.cellRect(3, 2);
        const hit = s.pieceAt(q.x + q.s / 2, q.y + q.s * 0.62);
        return { shown: !!s.ghosts[302], hit: hit && hit.join(','), under: s.floorAt(3, 2).kind };
    });
    check(
        'a piece hidden behind a building shows through it, and a touch there takes it',
        siteGhost.shown && siteGhost.hit === '3,2' && siteGhost.under === 'road',
        JSON.stringify(siteGhost)
    );

    const siteSun = await scene(() => window.playroom.stage.scene.sunButton);
    await touch.tap(siteSun.x, siteSun.y);
    await page.waitForTimeout(2600);
    check('the sun turns the site to night', (await scene(() => window.playroom.stage.scene.night)) > 0.9);
    await shot('site-night');
    await touch.tap(siteSun.x, siteSun.y);
    await page.waitForTimeout(2600);

    await shot('site');
    const siteSweep = await sweepTable();
    check(
        'the broom sweeps every piece off the site and leaves it plain earth, and then the earth away',
        siteSweep.first &&
            siteSweep.plain.land === siteSweep.before.land &&
            siteSweep.plain.pieces === 0 &&
            siteSweep.second &&
            siteSweep.after.land === 0 &&
            (await sceneName()) === 'SiteScene',
        JSON.stringify(siteSweep)
    );
    check('home from the building site', (await home()) === 'ShelfScene');
    await open('site');
    const siteAgain = await blankTable();
    check(
        'and the site comes off the shelf again as an empty table',
        siteAgain.land === 0 && siteAgain.pieces === 0,
        JSON.stringify(siteAgain)
    );
    await home();

    // ---- bird song -------------------------------------------------------------------------------
    //
    // The bird sings first, then waits with its wing to its ear. He plays on the flowers for as long
    // as he likes, and hands the bird its turn with a tap; it sings his notes back, in the rhythm he
    // played them, and its next tune begins on his last note.

    await open('birdsong');
    check('bird song opens', (await sceneName()) === 'BirdScene');
    const song = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            return {
                mode: s.mode,
                tune: s.tune.slice(),
                heard: s.heard.map((n) => n.index),
                sung: s.timeline
                    ? s.timeline.events.map((e) => ({
                          birds: e.birds.join('+'),
                          index: e.index,
                          short: e.short,
                          glide: e.glide,
                      }))
                    : [],
                length: s.length,
                reminders: s.reminders,
                inviting: s.inviting(),
                flowers: s.flowers.map((f) => [f.x, f.y + s.bellH * 0.5]),
                birds: s.birds.map((b) => [b.x, b.y - s.r * 0.3]),
                listening:
                    s.birds.every((b) => b.cup.target === 1) && s.flowers.every((f) => f.open.target === 1),
            };
        });
    const turn = (mode = 'turn', timeout = 8000) =>
        page
            .waitForFunction((mode) => window.playroom.stage.scene.mode === mode, mode, { timeout })
            .then(
                () => true,
                () => false
            );
    const handOver = async () => {
        await touch.tap(tweet.birds[0][0], tweet.birds[0][1]);
        await page.waitForTimeout(120);
        return song();
    };
    let tweet = await song();
    check(
        'the bird sings first: its opening tune, aloud',
        tweet.mode === 'birds' && tweet.sung.length === 3 && (await peak(1300)) > 0.02,
        JSON.stringify(tweet.sung)
    );
    check('then it waits, wing to its ear, and the flowers open', (await turn()) && (await song()).listening);
    for (const k of [0, 2, 1]) {
        await touch.tap(tweet.flowers[k][0], tweet.flowers[k][1]);
        await page.waitForTimeout(300);
    }
    // He has stopped: the bird waits, and asks for its turn.
    await page.waitForTimeout(2200);
    const paused = await song();
    await shot('birdsong');
    tweet = await handOver();
    check(
        'when he stops, the bird asks for its turn and waits; his tap on it hands the turn over, and it sings his notes back, its next tune beginning on his last note',
        paused.mode === 'turn' &&
            paused.inviting &&
            paused.heard.join(' ') === '0 2 1' &&
            tweet.mode === 'birds' &&
            tweet.sung
                .slice(0, 3)
                .map((n) => n.index)
                .join(' ') === '0 2 1' &&
            tweet.sung[3].index === 1 &&
            tweet.tune[0] === 1,
        JSON.stringify({
            stopped: paused.mode,
            inviting: paused.inviting,
            sung: tweet.sung.map((n) => n.index),
        })
    );
    await touch.tap(tweet.flowers[4][0], tweet.flowers[4][1]);
    await turn();
    check(
        'a flower tapped while the bird sings rings, but is not taken as an answer',
        (await song()).heard.length === 0
    );

    const glideY = tweet.flowers[0][1];
    // A quick run, as a child's is: about a tenth of a second a flower.
    await touch.drag(line(tweet.flowers[0][0] - 40, glideY, tweet.flowers[4][0] + 40, glideY, 12), 8);
    await page.waitForTimeout(300);
    const glided = (await handOver()).sung.slice(0, 5);
    check(
        'a finger run along the flowers comes back as a glide',
        glided.map((n) => n.index).join(' ') === '0 1 2 3 4' &&
            glided.every((n) => n.short) &&
            glided.slice(1).every((n, k) => n.glide === k),
        JSON.stringify(glided)
    );
    await turn();
    await touch.tap(tweet.flowers[3][0], tweet.flowers[3][1]);
    await page.waitForTimeout(150);
    tweet = await handOver();
    check(
        'after three answers in a row, the tunes have grown by a note',
        tweet.mode === 'birds' && tweet.sung[0].index === 3 && tweet.length === 4 && tweet.tune.length === 4,
        JSON.stringify({ mode: tweet.mode, length: tweet.length })
    );

    // He plays on and on: five seconds into it, in a gap between his notes, the bird bids for its
    // turn, standing tall and flapping, and five seconds later again, a wingbeat longer. When he
    // pauses it asks with its rings instead. The turn stays his until he taps the bird.
    await turn();
    await scene(() => {
        const s = window.playroom.stage.scene;
        const bid = s.bid;
        s.bidLog = [];
        s.bid = function () {
            const at = { held: this.held, since: this.time - this.lastNote, mode: this.mode };
            bid.call(this);
            const b = this.birds[this.lead];
            this.bidLog.push(Object.assign(at, { tall: b.tall.target, flapFor: b.flapFor }));
        };
    });
    const playing = Date.now();
    for (let k = 0; Date.now() - playing < 12500; k++) {
        await touch.tap(tweet.flowers[k % 5][0], tweet.flowers[k % 5][1]);
        await page.waitForTimeout(350);
    }
    const playedOn = await scene(() => {
        const s = window.playroom.stage.scene;
        return { mode: s.mode, bids: s.bidLog.slice() };
    });
    await page.waitForTimeout(3000);
    const pausedOn = await scene(() => {
        const s = window.playroom.stage.scene;
        return { bids: s.bidLog.length, inviting: s.inviting() };
    });
    tweet = await handOver();
    const handed = await scene(() => {
        const b = window.playroom.stage.scene.birds[0];
        return { tall: b.tall.target, flapping: b.flapping };
    });
    check(
        'while he plays on, the bird bids for its turn every five seconds of it, in a gap between his notes, standing tall and flapping a beat longer each time; it asks with its rings when he pauses, and the turn is his until he taps it',
        playedOn.mode === 'turn' &&
            playedOn.bids.length === 2 &&
            playedOn.bids.every((b) => b.mode === 'turn' && b.held >= 5 && b.since >= 0.3 && b.tall === 1) &&
            Math.abs(playedOn.bids[0].flapFor - 0.4) < 1e-9 &&
            Math.abs(playedOn.bids[1].flapFor - 0.6) < 1e-9 &&
            pausedOn.bids === 2 &&
            pausedOn.inviting &&
            tweet.mode === 'birds' &&
            handed.tall === 0 &&
            handed.flapping === 0,
        JSON.stringify({ playedOn, pausedOn, mode: tweet.mode, handed })
    );
    // His long turn takes a while to sing back.
    await turn('turn', 15000);

    // Quiet is fine: the tune again, twice, and then the bird rests until a flower is touched.
    await turn();
    const quieten = () => scene(() => (window.playroom.stage.scene.quiet = 8.95));
    const reminded = [];
    for (let k = 0; k < 2; k++) {
        await quieten();
        reminded.push(await turn('birds', 2000));
        await turn();
    }
    await quieten();
    const restedNow = await turn('rest', 2000);
    // The flowers' last swing and glow die away, and then nothing moves.
    await page.waitForTimeout(3200);
    const restA = await scene(() => window.playroom.stage.frames);
    await page.waitForTimeout(600);
    const restB = await scene(() => window.playroom.stage.frames);
    await touch.tap(tweet.flowers[2][0], tweet.flowers[2][1]);
    await page.waitForTimeout(100);
    tweet = await song();
    check(
        'with nothing played it sings its tune again, twice, then rests, still, until a flower wakes it',
        reminded.every(Boolean) &&
            restedNow &&
            restB === restA &&
            tweet.mode === 'turn' &&
            tweet.heard.join(' ') === '2' &&
            tweet.length === 4,
        JSON.stringify({ reminded, restedNow, frames: restB - restA, mode: tweet.mode })
    );

    // Played, but not handed over: it chirps to ask, twice, and rests, keeping what he played.
    const asked = [];
    for (let k = 0; k < 2; k++) {
        await quieten();
        await page.waitForTimeout(150);
        asked.push(await scene(() => window.playroom.stage.scene.mode === 'turn'));
    }
    await quieten();
    const keptRest = await turn('rest', 2000);
    const kept = (await song()).heard.join(' ');
    const woken = await handOver();
    check(
        'played but not handed over, it asks twice with a chirp, then rests keeping his notes; a tap on it still sings them back',
        asked.every(Boolean) &&
            keptRest &&
            kept === '2' &&
            woken.mode === 'birds' &&
            woken.sung[0].index === 2,
        JSON.stringify({ asked, keptRest, kept, sung: woken.sung.map((n) => n.index) })
    );
    check('home from bird song', (await home()) === 'ShelfScene');

    // At Bloom a second bird answers the first before both listen, and both sing his notes back.
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('birdsong', 'bloom'));
    await open('birdsong');
    tweet = await song();
    const duet = tweet.sung.map((n) => n.birds).join(' ');
    await turn();
    await touch.tap(tweet.flowers[4][0], tweet.flowers[4][1]);
    await page.waitForTimeout(150);
    const together = (await handOver()).sung;
    check(
        'at Bloom two birds: the second answers the first before they listen, and both sing his notes back',
        tweet.birds.length === 2 &&
            duet === '0 0 0 1 1 1' &&
            together[0].birds === '0+1' &&
            together[0].index === 4,
        `${duet}; ${together.map((n) => n.birds).join(' ')}`
    );
    await shot('birdsong-bloom');
    await home();
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('birdsong', 'sprout'));

    // ---- weather song -----------------------------------------------------------------------------
    //
    // His music is the friend's weather: the rain-stick a drizzle and a sleepy friend under a leaf,
    // the bells the sun and a dance, the big drum thunder and a cross friend who sighs and smiles
    // when it rolls away. The cloud pushed along is wind. A day goes by, and at night the friend
    // sleeps, and nothing moves, until a tap on it brings the morning.

    await page.evaluate(async () => (await import('./js/settings.js')).setStage('weather', 'sprout'));
    await open('weather');
    check('weather song opens', (await sceneName()) === 'WeatherScene');
    const sky = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            const w = s.weather;
            return {
                mood: s.mood,
                rain: w.rain,
                sun: w.sun,
                storm: w.storm,
                fog: w.fog,
                rainbow: w.rainbow,
                day: w.day,
                strip: w.strip.length,
                umbrella: s.friend.umbrella.target,
                drops: s.drops.length,
                wind: s.wind,
                scarf: s.friend.wind.value,
                turned: s.stick.turn.target,
                glow: s.glow,
                stick: [s.stick.x, s.stick.y],
                bells: s.bells.map((b) => [b.x, b.y + b.len]),
                drum: s.drum && [s.drum.x, s.drum.y],
                friend: [s.fx, s.fy - s.r],
                cloud: [s.cloud.x, s.cloud.y],
            };
        });
    const moodIs = (moods, timeout) =>
        page
            .waitForFunction((moods) => moods.indexOf(window.playroom.stage.scene.mood) >= 0, moods, {
                timeout,
            })
            .then(
                () => true,
                () => false
            );
    let weather = await sky();
    await touch.tap(...weather.stick);
    const drizzleSound = await peak(500);
    await page.waitForTimeout(500);
    const drizzle = await sky();
    check(
        'the rain-stick tips end over end with a patter: a drizzle falls, and the friend is sleepy under a leaf',
        drizzle.turned > 3 &&
            drizzle.rain > 0.3 &&
            drizzle.drops > 5 &&
            drizzle.mood === 'sleepy' &&
            drizzle.umbrella === 1 &&
            drizzleSound > 0.01,
        JSON.stringify({ rain: drizzle.rain, drops: drizzle.drops, mood: drizzle.mood, peak: drizzleSound })
    );
    for (const k of [0, 2, 4]) {
        await touch.tap(...weather.bells[k]);
        await page.waitForTimeout(220);
    }
    const sunny = await sky();
    check(
        'the bells bring the sun out, and the friend dances',
        sunny.sun > sunny.rain && sunny.mood === 'happy' && (await peak(300)) > 0.01,
        JSON.stringify({ sun: sunny.sun, rain: sunny.rain, mood: sunny.mood })
    );
    for (let i = 0; i < 3; i++) {
        await touch.tap(...weather.drum);
        await page.waitForTimeout(220);
    }
    const stormy = await sky();
    check(
        'the big drum brings thunder: the cloud lights up, and the friend stamps, cross',
        stormy.storm > 0.3 && stormy.mood === 'cross' && (await peak(700)) > 0.02,
        JSON.stringify({ storm: stormy.storm, mood: stormy.mood })
    );
    const calmed = await moodIs(['calm'], 9000);
    const smiled = await moodIs(['content', 'happy', 'sleepy'], 6000);
    check('then the thunder rolls away: the friend sighs, calm, and then smiles again', calmed && smiled);
    await touch.drag(
        line(weather.cloud[0], weather.cloud[1], weather.cloud[0] + 320, weather.cloud[1], 12),
        16
    );
    const windy = await sky();
    check(
        "pushed along, the cloud is a wind, and the friend's scarf flies out",
        windy.wind > 0.3 && windy.scarf > 0.2,
        JSON.stringify({ wind: windy.wind, scarf: windy.scarf })
    );
    await shot('weather');
    // The end of the day: the friend asleep under the stars, and once all is still, nothing moves.
    await scene(() => {
        const s = window.playroom.stage.scene;
        const w = s.weather;
        w.day = 0.995;
        w.rain = w.sun = w.storm = 0;
        s.cloud.x = s.cloud.hx;
        s.cloud.y = s.cloud.hy;
    });
    const nightAsleep = await moodIs(['asleep'], 3000);
    await page.waitForTimeout(4500);
    const nightA = await scene(() => window.playroom.stage.frames);
    await page.waitForTimeout(600);
    const nightB = await scene(() => window.playroom.stage.frames);
    await shot('weather-night');
    await touch.tap(...weather.friend);
    await page.waitForTimeout(400);
    const morning = await sky();
    check(
        'at night the friend falls asleep, and once all is still nothing moves; a tap on it brings the morning',
        nightAsleep && nightB === nightA && morning.day < 0.05 && morning.mood !== 'asleep',
        JSON.stringify({ nightAsleep, frames: nightB - nightA, day: morning.day, mood: morning.mood })
    );
    await home();

    await page.evaluate(async () => (await import('./js/settings.js')).setStage('weather', 'seed'));
    await open('weather');
    weather = await sky();
    check(
        'at Seed, sunny and sleepy: the rain-stick and three bells, and no drum',
        weather.bells.length === 3 && !weather.drum
    );
    await home();
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('weather', 'bloom'));
    await open('weather');
    weather = await sky();
    for (let i = 0; i < 2; i++) {
        await touch.tap(...weather.stick);
        await page.waitForTimeout(250);
    }
    for (const k of [1, 3]) {
        await touch.tap(...weather.bells[k]);
        await page.waitForTimeout(150);
    }
    const proud = await moodIs(['proud'], 2000);
    const bow = await sky();
    await shot('weather-bloom');
    await scene(() => {
        const w = window.playroom.stage.scene.weather;
        w.rain = w.sun = w.rainbow = 0;
        w.quiet = 20;
    });
    const shyFriend = await moodIs(['shy'], 6000);
    const foggy = await sky();
    await touch.tap(...weather.bells[0]);
    const peeksOut = await moodIs(['content', 'happy'], 4000);
    check(
        'at Bloom, sun in the rain makes a rainbow, and the friend is proud; a long quiet brings the fog, and a shy friend, until he plays again; and the day so far is painted along the top',
        proud && bow.rainbow > 0.5 && shyFriend && foggy.fog > 0.5 && peeksOut && foggy.strip > 0,
        JSON.stringify({
            proud,
            rainbow: bow.rainbow,
            shyFriend,
            fog: foggy.fog,
            peeksOut,
            strip: foggy.strip,
        })
    );
    await home();
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('weather', 'sprout'));

    // ---- freeze parade ----------------------------------------------------------------------------
    //
    // The animals march to his drum, a step a beat; when he stops they freeze, wobbling, and in a
    // while one sneezes, and at last they lie down to wait; a beat and they are up and off. At
    // Sprout the ducks march to the tambourine; at Bloom the hare hops only to a quick beat and the
    // tortoise walks only to a slow one, and the parade plays along as a band.

    await page.evaluate(async () => (await import('./js/settings.js')).setStage('parade', 'seed'));
    await open('parade');
    check('freeze parade opens', (await sceneName()) === 'ParadeScene');
    const parade = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            return {
                animals: s.animals.map((a) => ({
                    name: a.name,
                    s: a.s,
                    state: a.state,
                    freeze: a.freeze.value,
                    sit: a.sit.value,
                    sneezed: a.sneeze >= 0,
                    hit: a.hit,
                })),
                drum: [s.drum.x, s.drum.y],
                tambourine: s.tambourine && [s.tambourine.x, s.tambourine.y],
                step: s.step,
                laps: s.laps,
                door: s.door.target,
                beats: s.beats,
            };
        });
    const moved = (from, to, name) =>
        to.animals
            .filter((a) => a.name === name)
            .map((a, i) => (a.s - from.animals.filter((b) => b.name === name)[i].s) / to.step);
    let march = await parade();
    const before = march;
    for (let i = 0; i < 4; i++) {
        await touch.tap(...march.drum);
        await page.waitForTimeout(450);
    }
    const marched = await parade();
    check(
        'a beat on the drum is a step for the parade: four beats, four steps each',
        ['cow', 'sheep', 'pig'].every((name) => Math.abs(moved(before, marched, name)[0] - 4) < 0.05) &&
            marched.animals.every((a) => a.state === 'march') &&
            (await peak(200)) >= 0,
        JSON.stringify(['cow', 'sheep', 'pig'].map((name) => moved(before, marched, name)[0]))
    );
    await page.waitForTimeout(2200);
    const frozen = await parade();
    await shot('parade-freeze');
    const sneezed = await page
        .waitForFunction(() => window.playroom.stage.scene.animals.some((a) => a.sneeze >= 0), null, {
            timeout: 4000,
        })
        .then(
            () => true,
            () => false
        );
    check(
        'when he stops, they freeze, wobbling, mid-step; hold still and one of them sneezes',
        frozen.animals.every((a) => a.state === 'freeze' && a.freeze > 0.7) && sneezed,
        JSON.stringify(frozen.animals.map((a) => [a.name, a.state, a.freeze.toFixed(2)]))
    );
    await scene(() => {
        window.playroom.stage.scene.groups.drum.frozenAt -= 30;
    });
    await page.waitForTimeout(1800);
    const lying = await parade();
    await touch.tap(...march.drum);
    await page.waitForTimeout(500);
    const upAgain = await parade();
    check(
        'at last they lie down to wait; and a beat brings them up and marching again',
        lying.animals.every((a) => a.state === 'rest' && a.sit > 0.8) &&
            upAgain.animals.every((a) => a.state === 'march') &&
            ['cow', 'sheep', 'pig'].every((name) => Math.abs(moved(lying, upAgain, name)[0] - 1) < 0.05)
    );
    // Home past the barn: the rooster crows, and the door opens.
    await scene(() => {
        const s = window.playroom.stage.scene;
        const shift = s.barnS - Math.max(...s.animals.map((a) => a.s)) - 10;
        for (const a of s.animals) a.s = a.from = a.to = a.s + shift;
    });
    await touch.tap(...march.drum);
    await page.waitForTimeout(500);
    const home1 = await parade();
    check(
        'passing the barn, the parade is home: the barn door opens, and the rooster crows',
        home1.laps === 1 && home1.door === 1
    );
    await home();

    await page.evaluate(async () => (await import('./js/settings.js')).setStage('parade', 'sprout'));
    await open('parade');
    march = await parade();
    for (let i = 0; i < 3; i++) {
        await touch.tap(...march.tambourine);
        await page.waitForTimeout(400);
    }
    const jingled = await parade();
    for (let i = 0; i < 2; i++) {
        await touch.tap(...march.drum);
        await page.waitForTimeout(400);
    }
    const drummed = await parade();
    check(
        'at Sprout the ducks march to the tambourine, and only to it; the drum moves the others',
        moved(march, jingled, 'duck').every((d) => Math.abs(d - 3) < 0.05) &&
            moved(march, jingled, 'cow')[0] === 0 &&
            moved(jingled, drummed, 'duck').every((d) => d === 0) &&
            Math.abs(moved(jingled, drummed, 'cow')[0] - 2) < 0.05
    );
    await home();

    await page.evaluate(async () => (await import('./js/settings.js')).setStage('parade', 'bloom'));
    await open('parade');
    march = await parade();
    // A beat well inside quick: a tap takes some 0.1 s itself, and a slow machine more, so taps 0.3 s
    // apart came out at QUICK (0.42 s) or over, and the hare only sometimes hopped.
    for (let i = 0; i < 7; i++) {
        await touch.tap(...march.drum);
        await page.waitForTimeout(180);
    }
    const quick = await parade();
    await page.waitForTimeout(2600);
    const beforeSlow = await parade();
    for (let i = 0; i < 4; i++) {
        await touch.tap(...march.drum);
        await page.waitForTimeout(1000);
    }
    const slow = await parade();
    await shot('parade-bloom');
    check(
        'at Bloom the hare hops ahead to a quick beat, two steps a hop, and the tortoise waits; to a slow beat the tortoise walks, and the hare waits; and the parade plays along as a band',
        moved(march, quick, 'hare')[0] > 3.95 &&
            moved(march, quick, 'tortoise')[0] === 0 &&
            moved(beforeSlow, slow, 'tortoise')[0] > 1.95 &&
            moved(beforeSlow, slow, 'hare')[0] === 0 &&
            slow.beats >= 10,
        JSON.stringify({
            quick: [moved(march, quick, 'hare')[0], moved(march, quick, 'tortoise')[0]],
            slow: [moved(beforeSlow, slow, 'tortoise')[0], moved(beforeSlow, slow, 'hare')[0]],
            beats: slow.beats,
        })
    );
    await home();
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('parade', 'sprout'));

    // ---- fix-it shop -------------------------------------------------------------------------------
    //
    // Broken toys come in through the door, and a dream shows each one working. A part that does not
    // fit slides back to the drawer; the right part the wrong way round lies by the toy until it is
    // turned; a part that fits clicks in, and the toy comes to life, hops up to the shelf, and the
    // band plays. At Bloom a screw holds the first part until the screwdriver turns it home.

    await page.evaluate(async () => (await import('./js/settings.js')).setStage('fixit', 'sprout'));
    await open('fixit');
    check('the fix-it shop opens', (await sceneName()) === 'FixitScene');
    const shop = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            const t = s.toy;
            return {
                kind: t && t.kind,
                phase: t && t.phase,
                need: t ? t.need : [],
                has: t ? Object.keys(t.has) : [],
                screw: t && t.screw,
                parts: s.parts.map((p) => ({ part: p.part, rot: p.rot, state: p.state, x: p.x, y: p.y })),
                shelf: Object.keys(s.shelf),
                band: !!s.band,
                dream: !!s.dream,
            };
        });
    // The toys that come next, chosen for the test, as the shop chooses them in play.
    const nextToys = (kinds) =>
        scene((kinds) => {
            const s = window.playroom.stage.scene;
            s.toy = null;
            s.parts = [];
            s.queue = kinds;
            s.nextAt = s.time;
            window.playroom.stage.wake();
        }, kinds);
    const fixing = (kind) =>
        page
            .waitForFunction(
                (kind) => {
                    const s = window.playroom.stage.scene;
                    return (
                        s.toy &&
                        s.toy.kind === kind &&
                        s.toy.phase === 'fix' &&
                        s.parts.every((p) => p.delay <= 0)
                    );
                },
                kind,
                { timeout: 9000 }
            )
            .then(
                () => true,
                () => false
            );
    const slotOf = (name) => scene((name) => window.playroom.stage.scene.slotAt(name), name);
    const partOf = async (name) => (await shop()).parts.find((p) => p.part === name);
    const carry = (from, to) => touch.drag(line(from.x, from.y, to.x, to.y, 14), 16, 60);

    await nextToys(['robot', 'boat', 'train']);
    const robotIn = await fixing('robot');
    let fix = await shop();
    check(
        'a broken toy comes in through the door, missing a part; a dream shows it working; the drawer holds three parts, its own among them, turned',
        robotIn &&
            fix.need.join() === 'arm' &&
            fix.dream &&
            fix.parts.length === 3 &&
            fix.parts.some((p) => p.part === 'arm' && p.rot % 4 !== 0),
        JSON.stringify(fix)
    );
    await shot('fixit');
    const armGap = await slotOf('arm');
    const other = fix.parts.find((p) => p.part !== 'arm');
    await carry(other, armGap);
    await page.waitForTimeout(700);
    const slidBack = await partOf(other.part);
    check(
        'a part that does not fit slides gently back to the drawer, and the toy is still waiting',
        slidBack.state === 'drawer' &&
            Math.abs(slidBack.x - other.x) < 3 &&
            Math.abs(slidBack.y - other.y) < 3 &&
            (await shop()).has.length === 0,
        JSON.stringify(slidBack)
    );
    let arm = await partOf('arm');
    await carry(arm, armGap);
    await page.waitForTimeout(700);
    const beside = await partOf('arm');
    for (let i = 0; i < (4 - beside.rot) % 4; i++) {
        await touch.tap(beside.x, beside.y);
        await page.waitForTimeout(250);
    }
    arm = await partOf('arm');
    check(
        'the right part the wrong way round lies by the toy; a tap turns it a quarter, until it is the right way round',
        beside.state === 'bench' && arm.state === 'bench' && arm.rot % 4 === 0,
        JSON.stringify({ beside, arm })
    );
    await carry(arm, armGap);
    const comesAlive = await peak(700);
    fix = await shop();
    check(
        'turned, it fits: it clicks in, and the robot comes to life, waving and singing',
        fix.has.join() === 'arm' && fix.phase === 'alive' && comesAlive > 0.05,
        `${fix.phase} ${comesAlive.toFixed(3)}`
    );
    const banded = await page
        .waitForFunction(
            () => !!window.playroom.stage.scene.band && !!window.playroom.stage.scene.shelf.robot,
            null,
            {
                timeout: 8000,
            }
        )
        .then(
            () => true,
            () => false
        );
    const boatIn = await fixing('boat');
    check(
        'mended, it hops up to the shelf and the band plays; then the next broken toy comes in',
        banded && boatIn && (await shop()).shelf.join() === 'robot',
        JSON.stringify(await shop())
    );
    await page.waitForFunction(() => !window.playroom.stage.scene.dream, null, { timeout: 6000 });
    // A tap on the wall: the shop is touched, and then still.
    await touch.tap(60, 260);
    await page.waitForTimeout(400);
    const stillA = await scene(() => window.playroom.stage.frames);
    await page.waitForTimeout(800);
    const stillB = await scene(() => window.playroom.stage.frames);
    const asking = await scene(() => {
        const s = window.playroom.stage.scene;
        s.touched = s.time - 6;
        window.playroom.stage.wake();
        return s.askingFor();
    });
    await page.waitForTimeout(500);
    const askingFrames = (await scene(() => window.playroom.stage.frames)) - stillB;
    check(
        'a broken toy waiting draws nothing; left a while, its gap glows to show where a part goes',
        stillB === stillA && asking && askingFrames > 10,
        `${stillB - stillA} frames still, ${askingFrames} asking`
    );
    const robotSpot = await scene(() => {
        const s = window.playroom.stage.scene;
        return { x: s.spots.robot.x, y: s.spots.robot.y - s.ss * 0.4 };
    });
    await touch.tap(robotSpot.x, robotSpot.y);
    await page.waitForTimeout(100);
    check(
        'a tap on a mended toy on the shelf plays its part in the band',
        await scene(() => window.playroom.stage.scene.shelf.robot.on > 0.5)
    );
    await home();

    // At Bloom: two parts missing, and the first held by a screw until the screwdriver turns it home.
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('fixit', 'bloom'));
    await open('fixit');
    await nextToys(['car']);
    const carIn = await fixing('car');
    fix = await shop();
    const wheel = fix.parts.find((p) => p.part === 'wheel');
    await carry(wheel, await slotOf('wheel'));
    await page.waitForTimeout(500);
    let carHorn = await partOf('horn');
    for (let i = 0; i < (4 - carHorn.rot) % 4; i++) {
        await touch.tap(carHorn.x, carHorn.y);
        await page.waitForTimeout(250);
    }
    carHorn = await partOf('horn');
    await carry(carHorn, await slotOf('horn'));
    await page.waitForTimeout(500);
    const screwed = await shop();
    const driver = await scene(() => {
        const s = window.playroom.stage.scene;
        const d = s.driver;
        return { x: d.x + d.k * 0.72, y: d.y, k: d.k };
    });
    const screwAt = await slotOf('wheel');
    // The hand holds the handle; the tip, below it, goes on the screw.
    const hand = { x: screwAt.x + 4, y: screwAt.y - driver.k * 0.62 };
    await touch.down(driver.x, driver.y);
    for (const [x, y] of line(driver.x, driver.y, hand.x, hand.y, 12)) {
        await page.waitForTimeout(16);
        await touch.move(x, y);
    }
    await shot('fixit-screw');
    const turned = await page
        .waitForFunction(
            () => window.playroom.stage.scene.toy && window.playroom.stage.scene.toy.phase === 'alive',
            null,
            {
                timeout: 6000,
            }
        )
        .then(
            () => true,
            () => false
        );
    await touch.up();
    check(
        'at Bloom a toy is missing two parts, and the first is held by a screw: in, it waits for the screwdriver, which turns it home, and the car drives',
        carIn &&
            fix.need.join() === 'wheel,horn' &&
            fix.parts.length === 4 &&
            screwed.has.length === 2 &&
            screwed.phase === 'fix' &&
            screwed.screw &&
            screwed.screw.name === 'wheel' &&
            turned,
        JSON.stringify(screwed)
    );
    await home();
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('fixit', 'sprout'));

    // ---- torch in the dark ------------------------------------------------------------------------
    //
    // The garden at night: a beam swept quickly wakes no one; rested on a creature, it wakes it, and
    // its lantern lights. With every lantern lit they sing, and sleep, and the next night they hide
    // somewhere new. The torch clicks on and off; moths come to a beam left still; at Bloom the moon
    // rises and the fireflies blink a rhythm for him to blink back.

    await page.evaluate(async () => (await import('./js/settings.js')).setStage('torch', 'sprout'));
    await open('torch');
    check('torch in the dark opens', (await sceneName()) === 'TorchScene');
    const garden = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            return {
                creatures: s.creatures.map((c) => ({
                    who: c.who,
                    x: c.x,
                    y: c.y,
                    state: c.state,
                    act: c.act,
                })),
                places: Object.assign({}, s.places),
                lanterns: s.lanterns.map((l) => l.glow.target),
                song: !!s.song,
                beam: { on: s.beam.on, x: s.beam.x, y: s.beam.y },
                k: s.k,
                moths: s.moths.length,
                torch: s.torchAt,
            };
        });
    // The finger, for the beam to rest on a creature: the beam sits a little above the finger.
    const fingerFor = (c, k) => [c.x, c.y - k * 0.4 + 36];
    let night = await garden();
    check(
        'six friends asleep in the dark garden, each lantern unlit, the torch off',
        night.creatures.length === 6 &&
            night.creatures.every((c) => c.state === 'asleep') &&
            night.lanterns.every((g) => g === 0) &&
            !night.beam.on
    );
    await shot('torch');
    const firstFriend = night.creatures[0];
    const [fx, fy] = fingerFor(firstFriend, night.k);
    const sweepFrom = Math.max(20, fx - 220);
    await touch.drag(line(sweepFrom, fy, Math.min(1000, fx + 220), fy, 8), 16);
    await page.waitForTimeout(300);
    const swept = (await garden()).creatures[0];
    await touch.tap(fx, fy);
    const friendWoke = await page
        .waitForFunction(() => window.playroom.stage.scene.creatures[0].state === 'awake', null, {
            timeout: 4000,
        })
        .then(
            () => true,
            () => false
        );
    const wokeSound = await peak(600);
    night = await garden();
    check(
        'a beam swept quickly past a friend wakes no one; rested on it, the torch clicked on, it wakes, calls, and its lantern lights',
        swept.state === 'asleep' &&
            friendWoke &&
            night.beam.on &&
            night.lanterns[0] === 1 &&
            wokeSound > 0.03,
        `${swept.state} ${friendWoke} ${wokeSound.toFixed(3)}`
    );
    await shot('torch-awake');
    // Moths come to a beam left still.
    const mothsCame = await page
        .waitForFunction(() => window.playroom.stage.scene.moths.length > 0, null, { timeout: 5000 })
        .then(
            () => true,
            () => false
        );
    check('moths come to a beam left still', mothsCame);
    const torchBefore = night.places;
    for (const c of night.creatures.slice(1)) {
        await touch.tap(...fingerFor(c, night.k));
        await page.waitForFunction(
            (who) => window.playroom.stage.scene.creatures.find((c) => c.who === who).state === 'awake',
            c.who,
            { timeout: 4000 }
        );
    }
    night = await garden();
    const sang = night.song;
    const newNight = await page
        .waitForFunction(
            () => {
                const s = window.playroom.stage.scene;
                return !s.song && s.creatures.every((c) => c.state === 'asleep');
            },
            null,
            { timeout: 15000 }
        )
        .then(
            () => true,
            () => false
        );
    const after = (await garden()).places;
    const torchMoved = Object.keys(after).filter((who) => after[who] !== torchBefore[who]).length;
    check(
        'every friend awake and every lantern lit, they sing a night song, go back to sleep, and the next night hide somewhere new',
        night.lanterns.every((g) => g === 1) && sang && newNight && torchMoved >= 3,
        `${torchMoved} moved`
    );
    const torchAt = night.torch;
    await touch.tap(torchAt.x - torchAt.k * 0.5, torchAt.y);
    await page.waitForTimeout(200);
    const off = (await garden()).beam.on;
    await touch.tap(torchAt.x - torchAt.k * 0.5, torchAt.y);
    await page.waitForTimeout(200);
    check('a tap on the torch clicks it off, and on again', !off && (await garden()).beam.on);
    // Left alone, the garden rests and draws nothing.
    await touch.tap(torchAt.x - torchAt.k * 0.5, torchAt.y);
    await scene(() => {
        const s = window.playroom.stage.scene;
        s.touched = s.time - 60;
    });
    await page.waitForTimeout(2200);
    const torchRestA = await scene(() => window.playroom.stage.frames);
    await page.waitForTimeout(700);
    const torchRestB = await scene(() => window.playroom.stage.frames);
    check(
        'left alone a while, the garden rests and draws nothing',
        torchRestB === torchRestA,
        `${torchRestB - torchRestA} frames`
    );
    await home();

    // At Bloom: the moon climbs, and the fireflies blink a rhythm for him to blink back.
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('torch', 'bloom'));
    await open('torch');
    await scene(() => {
        const s = window.playroom.stage.scene;
        s.flies.t = 0;
    });
    const listening = await page
        .waitForFunction(() => window.playroom.stage.scene.flies.state === 'listen', null, { timeout: 5000 })
        .then(
            () => true,
            () => false
        );
    const called = await scene(() => window.playroom.stage.scene.flies.times.length);
    const torchNow = await scene(() => window.playroom.stage.scene.torchAt);
    for (let i = 0; i < 3; i++) {
        await touch.tap(torchNow.x - torchNow.k * 0.5, torchNow.y);
        await page.waitForTimeout(260);
    }
    const echoed = await page
        .waitForFunction(() => window.playroom.stage.scene.flies.state === 'echo', null, { timeout: 4000 })
        .then(
            () => true,
            () => false
        );
    const flies = await scene(() => {
        const s = window.playroom.stage.scene;
        return { back: s.flies.times.length, streak: s.flies.streak, moon: s.moon };
    });
    check(
        'at Bloom the fireflies blink a rhythm and wait; blinked back with the torch, they blink his rhythm to him; and the moon is rising',
        listening && called === 2 && echoed && flies.back === 3 && flies.streak === 1 && flies.moon > 0,
        JSON.stringify(flies)
    );
    await shot('torch-bloom');
    await home();
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('torch', 'sprout'));

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
    check(
        'and it says which copy of the playroom this is',
        (await page.evaluate(() => document.querySelector('[data-version]').textContent)).indexOf(
            'working copy'
        ) >= 0
    );
    await shot('parent');
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('playroom.settings.v1')));
    const sharedShown = () =>
        page.evaluate(() => ({
            pressed: document.querySelectorAll('[data-stages] [aria-pressed="true"]').length,
            mixed: !document.querySelector('[data-mixed]').hidden,
        }));
    await page.click('[data-stages] button:nth-child(1)');
    check('every toy can be set to Seed at once, and it is remembered', (await stored()).stage === 'seed');
    await page.click('[data-toy="busy"] [data-stage="bloom"]');
    let saved = await stored();
    check(
        'one toy can be moved on by itself',
        saved.stage === 'seed' && saved.stages.busy === 'bloom',
        JSON.stringify(saved.stages)
    );
    let shared = await sharedShown();
    check('and the shared stage then shows as mixed', shared.pressed === 0 && shared.mixed);
    await page.click('[data-stages] button:nth-child(2)');
    saved = await stored();
    shared = await sharedShown();
    check(
        'setting every toy clears the one set by itself',
        saved.stage === 'sprout' &&
            Object.keys(saved.stages).length === 0 &&
            shared.pressed === 1 &&
            !shared.mixed
    );
    await page.click('[data-stages] button:nth-child(1)');
    await page.click('[data-toy="busy"] [data-stage="bloom"]');
    check(
        'the letters, which have no stages, offer none',
        (await page.$$('[data-toy="letters"] [data-stage]')).length === 0
    );

    await page.click('[data-toy="busy"] .switch');
    check('a toy can be put away', (await scene(() => window.playroom.shelf.items.length)) === 16);
    await page.click('[data-toy="busy"] .switch');
    check('and brought back', (await scene(() => window.playroom.shelf.items.length)) === 17);

    // The shelf's order: the arrows move a toy along it, the list follows, the order is remembered,
    // and the playroom's own order is a press away. A new game says so.
    const shelfOrder = () => scene(() => window.playroom.shelf.items.map((item) => item.toy.id).join(' '));
    const listOrder = () =>
        page.evaluate(() =>
            [...document.querySelectorAll('[data-shelf] [data-toy]')]
                .map((row) => row.getAttribute('data-toy'))
                .join(' ')
        );
    const ownOrder = await shelfOrder();
    const ends = await page.evaluate(() => ({
        first: document.querySelector('[data-toy="pond"] [data-earlier]').disabled,
        last: document.querySelector('[data-toy="torch"] [data-later]').disabled,
        badges: [...document.querySelectorAll('[data-shelf] .badge')]
            .map((b) => b.closest('[data-toy]').getAttribute('data-toy'))
            .join(' '),
    }));
    await page.click('[data-toy="birdsong"] [data-earlier]');
    await page.click('[data-toy="birdsong"] [data-earlier]');
    const movedOrder = await shelfOrder();
    const movedList = await listOrder();
    const keptOrder = (await stored()).order;
    await page.click('[data-reset-order]');
    check(
        "the arrows move a toy along the shelf, the list follows and it is remembered; one press brings back the playroom's own order",
        ends.first &&
            ends.last &&
            ends.badges === 'birdsong weather parade fixit torch' &&
            movedOrder.split(' ').indexOf('birdsong') === 10 &&
            movedList === movedOrder &&
            keptOrder.indexOf('birdsong') === 10 &&
            (await shelfOrder()) === ownOrder &&
            (await stored()).order.length === 0,
        `${movedOrder} | ${JSON.stringify(ends)}`
    );

    // The new things: each has a switch, on to begin with and remembered.
    const extras = () =>
        page.evaluate(() =>
            [...document.querySelectorAll('[data-extra]')]
                .map((b) => `${b.getAttribute('data-extra')} ${b.getAttribute('aria-pressed')}`)
                .join(', ')
        );
    const extrasAtFirst = await extras();
    await page.click('[data-extra="hello"]');
    const helloOff = await scene(() => {
        window.playroom.shelf.greet();
        return window.playroom.shelf.greeting === null;
    });
    await page.click('[data-extra="hello"]');
    await page.click('[data-extra="shyFish"]');
    const extrasStored = (await stored()).extras;
    check(
        'each new thing has a switch, on to begin with and remembered',
        extrasAtFirst === 'hello true, goodnight true, shyFish true, turntableFriend true' &&
            helloOff &&
            extrasStored.hello === true &&
            extrasStored.shyFish === false,
        `${extrasAtFirst}; ${JSON.stringify(extrasStored)}`
    );

    // Goodnight: the toys sleep by themselves, or wait for the child; and the timer, which a
    // passcode locks: chosen twice the first time, asked for to stop it, and clearable if forgotten
    // by typing the numbers the keypad shows.
    const tuckShown = () =>
        page.evaluate(() =>
            [...document.querySelectorAll('[data-tuck] button')]
                .map((b) => `${b.getAttribute('data-tuck')} ${b.getAttribute('aria-pressed')}`)
                .join(', ')
        );
    const tuckAtFirst = await tuckShown();
    await page.click('[data-tuck] [data-tuck="child"]');
    const tuckStored = (await stored()).tuck;
    await page.click('[data-tuck] [data-tuck="themselves"]');
    check(
        'the toys fall asleep by themselves to begin with, or can wait for the child to tuck them in',
        tuckAtFirst === 'themselves true, child false' &&
            tuckStored === 'child' &&
            (await stored()).tuck === 'themselves',
        tuckAtFirst
    );
    const pad = () =>
        page.evaluate(() => ({
            shown: !document.querySelector('[data-keypad]').hidden,
            title: document.querySelector('[data-pad-title]').textContent,
            hint: document.querySelector('[data-pad-hint]').textContent,
        }));
    const key = async (digits) => {
        for (const d of digits) await page.click(`[data-key="${d}"]`);
        await page.waitForTimeout(300);
    };
    const band = () =>
        page.evaluate(() => {
            const el = document.getElementById('band');
            const left = el.querySelector('.left');
            return {
                shown: !el.hidden,
                night: el.classList.contains('night'),
                part:
                    parseFloat(left.style.strokeDasharray) /
                    (parseFloat(left.style.strokeDasharray.split(/[ ,]+/)[1]) - 8),
                colour: left.style.stroke,
            };
        });
    await page.click('[data-timer] [data-minutes="10"]');
    const choosing = await pad();
    await key('1234');
    const confirming = await pad();
    await key('1234');
    const running = await scene(() => ({
        minutes: (window.playroom.bedtime - window.playroom.bedtimeFrom) / 60000,
        left: window.playroom.bedtime - Date.now(),
    }));
    const runningBand = await band();
    const runningSays = await page.evaluate(() => document.querySelector('[data-timer-state]').textContent);
    const timerStored = (await stored()).timer;
    await shot('parent-timer');
    check(
        'a ten-minute timer starts once a passcode is chosen, twice; it is remembered, and a full band in leaf green goes round the screen',
        choosing.shown &&
            choosing.title === 'Choose a passcode' &&
            confirming.title === 'Once more' &&
            running.minutes === 10 &&
            running.left > 590000 &&
            !!timerStored &&
            timerStored.ends - timerStored.from === 600000 &&
            runningBand.shown &&
            runningBand.part > 0.99 &&
            runningBand.colour === 'rgb(152, 185, 133)' &&
            /Goodnight in 10 minutes/.test(runningSays),
        JSON.stringify({ choosing, confirming, running, runningBand, runningSays })
    );
    await page.click('[data-timer-stop]');
    await key('9999');
    const wrong = await pad();
    const stillRunning = await scene(() => !!window.playroom.bedtime);
    await key('1234');
    const stoppedNow = await scene(() => window.playroom.bedtime === 0);
    check(
        'stopping it asks for the passcode: a wrong one does not, the right one does, and the band goes',
        wrong.shown &&
            wrong.title === 'Passcode' &&
            /Not that one/.test(wrong.hint) &&
            stillRunning &&
            stoppedNow &&
            !(await band()).shown &&
            (await stored()).timer === null,
        JSON.stringify(wrong)
    );
    await page.click('[data-timer] [data-minutes="15"]');
    await page.click('[data-pad-forgot]');
    const forgotten = await pad();
    const shownDigits = (forgotten.hint.match(/\d( \d){3}/) || [''])[0].replace(/ /g, '');
    await key(shownDigits);
    const fresh = await pad();
    await key('5678');
    await key('5678');
    const fifteen = await scene(() => (window.playroom.bedtime - window.playroom.bedtimeFrom) / 60000);
    await page.click('[data-timer-stop]');
    await key('5678');
    check(
        'a forgotten passcode is cleared by typing the numbers shown, and a new one chosen',
        forgotten.title === 'Forgotten?' &&
            shownDigits.length === 4 &&
            fresh.title === 'Choose a passcode' &&
            fifteen === 15 &&
            (await scene(() => window.playroom.bedtime === 0)),
        JSON.stringify({ forgotten, fresh, fifteen })
    );
    await shot('parent-toys');
    await page.click('[data-close]');
    check('Done closes the settings', await page.evaluate(() => document.getElementById('parent').hidden));
    await open('pond');
    check(
        'with the shy fish switched off, the pond has only its own fish',
        await scene(() => !window.playroom.stage.scene.fish.some((f) => f.shy))
    );
    await home();
    await page.evaluate(async () => (await import('./js/settings.js')).setExtra('shyFish', true));
    await open('busy');
    const board = await scene(() => {
        const widgets = window.playroom.stage.scene.widgets;
        return { count: widgets.length, latch: widgets.find((w) => w.constructor.name === 'Door').hasLatch };
    });
    check('the busy board, moved on by itself, opens at Bloom', board.count === 6 && board.latch);
    await home();
    await open('tower');
    const seed = await scene(() => {
        const s = window.playroom.stage.scene;
        return { steps: s.steps, rows: s.rows.map((k) => k.name) };
    });
    check(
        'while the others stay at Seed: the colour beats loop 4 columns, with 2 colours over a drum',
        seed.steps === 4 && seed.rows.length === 3 && seed.rows[0] === 'drum',
        `${seed.steps} columns: ${seed.rows.join(' ')}`
    );
    await home();
    await page.evaluate(async () => (await import('./js/settings.js')).setExtra('turntableFriend', false));
    await open('turntable');
    const seedDeck = await scene(() => {
        const s = window.playroom.stage.scene;
        return {
            records: s.records.length,
            pads: s.pads.map((pad) => pad.name).join(' '),
            fader: !!s.fader,
            button: s.buttonAt,
        };
    });
    await touch.tap(seedDeck.button.x, seedDeck.button.y);
    await page.waitForTimeout(500);
    check(
        'and the turntable at Seed has one record, the button, a horn and a boom, and plays',
        seedDeck.records === 1 &&
            seedDeck.pads === 'horn boom' &&
            !seedDeck.fader &&
            (await peak(400)) > 0.02,
        `${seedDeck.records} records; ${seedDeck.pads}`
    );
    await home();

    // The turntable at Bloom: a slider sets its speed, and the music's pitch with it; near the
    // middle it settles on the record's own speed.
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('turntable', 'bloom'));
    await open('turntable');
    const bloomDeck = await scene(() => {
        const s = window.playroom.stage.scene;
        return { fader: s.fader, button: s.buttonAt, pads: s.pads.map((pad) => pad.name).join(' ') };
    });
    const fader = bloomDeck.fader;
    const middle = (fader.y0 + fader.y1) / 2;
    await touch.tap(bloomDeck.button.x, bloomDeck.button.y);
    await page.waitForTimeout(600);
    const speeds = () =>
        scene(() => ({ speed: window.playroom.stage.scene.speed, rate: window.playroom.stage.scene.rate }));
    await touch.drag(line(fader.x, middle, fader.x, fader.y0, 12), 16, 100);
    await page.waitForTimeout(700);
    const fast = await speeds();
    await shot('turntable-bloom');
    await touch.drag(line(fader.x, fader.y0, fader.x, middle + 4, 12), 16, 100);
    await page.waitForTimeout(1500);
    const own = await speeds();
    check(
        "the turntable at Bloom: six pads, and the slider sets the record's speed, and near the middle its own",
        bloomDeck.pads === 'horn boom cow scratch clap shaker' &&
            fast.speed === 1.5 &&
            Math.abs(fast.rate - 1.5) < 0.03 &&
            own.speed === 1 &&
            Math.abs(own.rate - 1) < 0.03,
        `${bloomDeck.pads}; ${fast.rate.toFixed(2)} at the top, ${own.rate.toFixed(2)} in the middle`
    );
    await home();
    await page.evaluate(async () => (await import('./js/settings.js')).setExtra('turntableFriend', true));

    // The dig at Bloom: a bulldozer, and earth under the sand.
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('dig', 'bloom'));
    await open('dig');
    const digBloom = await scene(() => {
        const s = window.playroom.stage.scene;
        return { dozer: !!s.dozer, earth: s.pit.cols.some((col) => col.some((layer) => layer[0] === 1)) };
    });
    check('the dig at Bloom: a bulldozer, and earth under the sand', digBloom.dozer && digBloom.earth);
    await home();

    // The crane at Bloom: arches, a roof, and a wrecking ball that knocks things down, after which
    // the parts go home to the pile.
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('crane', 'bloom'));
    await open('crane');
    const craneBall = await scene(() => {
        const s = window.playroom.stage.scene;
        const b = s.parts.find((p) => p.kind === 'ball');
        return { x: b.x, top: b.y - s.height(b), ground: s.ground, g: s.g };
    });
    const craneTipNow = await scene(() => window.playroom.stage.scene.hookTip());
    await touch.down(craneTipNow.x, craneTipNow.y - 8);
    for (const [x, y] of line(craneTipNow.x, craneTipNow.y - 8, craneBall.x, craneBall.top, 30).slice(1)) {
        await page.waitForTimeout(16);
        await touch.move(x, y);
    }
    await page.waitForTimeout(900);
    const craneSwing = [
        [craneBall.x, craneBall.ground - 330],
        [700, craneBall.ground - 340],
        [300, craneBall.ground - 120],
        [200, craneBall.ground - 120],
    ];
    let craneFrom = [craneBall.x, craneBall.top];
    let craneKnocked = false;
    for (const to of craneSwing) {
        for (const [x, y] of line(craneFrom[0], craneFrom[1], to[0], to[1], 18).slice(1)) {
            await page.waitForTimeout(16);
            await touch.move(x, y);
            if (!craneKnocked)
                craneKnocked = await scene(() =>
                    window.playroom.stage.scene.parts.some(
                        (p) => p.state === 'tumble' || p.state === 'scatter'
                    )
                );
        }
        craneFrom = to;
    }
    await page.waitForTimeout(400);
    await touch.up();
    const craneHome2 = await page
        .waitForFunction(() => window.playroom.stage.scene.parts.every((p) => p.state === 'rest'), null, {
            timeout: 10000,
        })
        .then(
            () => true,
            () => false
        );
    check(
        'the crane at Bloom: the wrecking ball knocks a stack down, and the parts go home to the pile',
        craneKnocked && craneHome2
    );
    await home();

    // The building site at Bloom: thirteen kinds of piece and the earth tile, and roads to build.
    // A road is put down marked out; the bulldozer scrapes it to dirt, the roller rolls it flat and
    // the paver paves it, each only at its own step. The earth goes somewhere: a pile beside the
    // bulldozer into the hole the digger dug, and the roller presses the filled hole flat; with no
    // hole, over the edge.
    //
    //                              . L Z . . . .      a pile, the bulldozer
    //                              Y H . . . . .      the roller, a dug hole
    //                              R R R R R . .      a road, marked out; the mixer stands on it
    //                              . . . . V . .      the paver
    //                              . . . . J . .      a lamp
    await page.evaluate(async () => (await import('./js/settings.js')).setStage('site', 'bloom'));
    await open('site');
    await lay(['.LZ....', 'YH.....', 'RRRRR..', '....V..', '....J..'], SITE_CODES, PLOTS);
    await scene(() => {
        const s = window.playroom.stage.scene;
        s.put(1, 2, s.make('mixer'), true);
    });
    const bloomKinds = await scene(() => window.playroom.stage.scene.kinds.length);
    const roads = () =>
        scene(() => {
            const s = window.playroom.stage.scene;
            return [0, 1, 2, 3, 4].map((c) => s.floorAt(c, 2).state[0]).join('');
        });
    // A machine's work: tapped, and quick about it, and done.
    const machine = async (c, r) => {
        await tapCell(c, r, -0.05);
        const went = await scene(
            ([c, r]) => {
                const p = window.playroom.stage.scene.at(c, r);
                if (p.trip) p.trip.speed *= 3;
                return !!p.trip;
            },
            [c, r]
        );
        if (went)
            await page.waitForFunction(([c, r]) => !window.playroom.stage.scene.at(c, r).trip, [c, r], {
                timeout: 20000,
            });
        return went;
    };
    check(
        'the building site at Bloom: thirteen kinds of piece and the earth tile, and its roads put down marked out',
        bloomKinds === 14 && (await roads()) === 'mmmmm',
        `${bloomKinds} kinds, roads ${await roads()}`
    );

    await tapCell(1, 2, -0.05);
    await page.waitForTimeout(1300);
    check('a mixer beside a bare hole waits for the forms', (await siteAt(1, 1)) === 'plot1');

    const pushed = await machine(2, 0);
    await page.waitForTimeout(300);
    check(
        'the bulldozer pushes the pile beside it into the hole the digger dug, and backs up home',
        pushed &&
            (await siteAt(1, 1)) === 'fill' &&
            (await count('pile')) === 0 &&
            (await siteAt(2, 0)) === 'dozer',
        `${await siteAt(1, 0)} ${await siteAt(1, 1)} ${await siteAt(2, 0)}`
    );
    const rolledFill = await machine(0, 1);
    const flattened = await page
        .waitForFunction(() => !window.playroom.stage.scene.at(1, 1), null, { timeout: 5000 })
        .then(
            () => true,
            () => false
        );
    check(
        'the roller rolls the filled hole flat, back to bare earth',
        rolledFill && flattened && (await siteAt(1, 1)) === 'earth'
    );
    check('and has nothing to roll on a road only marked out', !(await machine(0, 1)));

    await scene(() => {
        const s = window.playroom.stage.scene;
        const dozer = s.at(2, 0);
        s.cells[0][2] = null;
        s.put(2, 1, dozer, true);
    });
    const graded = await machine(2, 1);
    check(
        'with no pile beside it, the bulldozer scrapes the marked road into dirt, under the mixer too',
        graded && (await roads()) === 'ddddd' && (await siteAt(1, 2)) === 'mixer/road:dirt',
        await roads()
    );
    check('the paver waits for the dirt to be rolled', !(await machine(4, 3)) && (await roads()) === 'ddddd');
    await machine(0, 1);
    check('the roller rolls the dirt road flat', (await roads()) === 'rrrrr', await roads());
    const paved = await machine(4, 3);
    await page.waitForTimeout(200);
    const roadDucks = await scene(
        () => window.playroom.stage.scene.fx.filter((f) => f.kind === 'ducks').length
    );
    check(
        'the paver paves the rolled road, and the first time, ducks cross the new road',
        paved && (await roads()) === 'ppppp' && roadDucks === 3,
        `${await roads()}, ${roadDucks} ducks`
    );
    await shot('site-bloom');
    check('and the roller has nothing to roll on a paved road', !(await machine(0, 1)));

    await scene(() => {
        const s = window.playroom.stage.scene;
        const dozer = s.at(2, 1);
        s.cells[1][2] = null;
        s.put(6, 0, dozer, true);
        s.put(5, 0, s.make('pile'), true);
    });
    const overEdge = await machine(6, 0);
    check(
        'with no hole to push it into, the bulldozer pushes the pile over the edge of the site',
        overEdge && (await count('pile')) === 0 && (await siteAt(6, 0)) === 'dozer'
    );
    await tapCell(4, 4, -0.2);
    await page.waitForTimeout(300);
    check('the work lamp lights', await scene(() => window.playroom.stage.scene.at(4, 4).lit));
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
    check(
        'leaving a toy stops its sounds',
        (await scene(() => window.playroom.audio.stats().textures)) === 0
    );

    // ---- goodnight ---------------------------------------------------------------------------------
    //
    // The moon in the shelf's window brings the night: the toys fall asleep one by one to a lullaby,
    // a tap tucks one in at once, and when the last is asleep the playroom closes to its bud. Set
    // for later from the corner, the moon shows on the way home, and the night comes on the shelf;
    // then play is over, and the bud sleeps until a grown-up opens the playroom again.

    const tuckAll = async () => {
        const rects = await scene(() =>
            window.playroom.shelf.items
                .filter((item) => !item.asleep)
                .map((item) => window.playroom.shelf.rectOf(item.toy.id))
        );
        for (const r of rects) await touch.tap(r.x + r.w / 2, r.y + r.h / 2);
    };
    // The bud, once it has faded in: touches are not taken during a change of scene.
    const bud = () =>
        page
            .waitForFunction(
                () =>
                    window.playroom.stage.scene.constructor.name === 'StartScene' &&
                    !window.playroom.stage.busy,
                null,
                { timeout: 12000 }
            )
            .then(
                () => true,
                () => false
            );
    await page.waitForTimeout(400);
    const moon = await scene(() => {
        const r = window.playroom.shelf.window;
        return [r.x + r.w / 2, r.y + r.h / 2];
    });
    await touch.tap(moon[0], moon[1]);
    await page.waitForTimeout(300);
    const nightFell = await scene(() => !!window.playroom.shelf.night);
    await page.waitForTimeout(1300);
    await shot('goodnight');
    const first = await scene(() => window.playroom.shelf.rectOf(window.playroom.shelf.items[0].toy.id));
    await touch.tap(first.x + first.w / 2, first.y + first.h / 2);
    const tuckedIn = await scene(() => window.playroom.shelf.items[0].asleep);
    await tuckAll();
    const closed = await bud();
    check(
        'a tap on the moon brings the night, a tap tucks a toy in, and the playroom closes to its bud',
        nightFell && tuckedIn && closed,
        JSON.stringify({ nightFell, tuckedIn, closed })
    );
    await touch.tap(512, 330);
    await page.waitForTimeout(1800);
    check(
        'and the bud opens it again, with its hello',
        (await sceneName()) === 'ShelfScene' && (await scene(() => !!window.playroom.shelf.greeting))
    );
    await page.waitForFunction(() => !window.playroom.shelf.greeting, null, { timeout: 6000 });

    // The grown-up's timer: half gone, the band is half round the screen and butter yellow, and the
    // sun in the window half way down. Run out in a game, the house button shows the moon and the band
    // turns to the night; after a grace the game puts itself away, and the night comes.
    await scene(() => {
        const now = Date.now();
        window.playroom.timeBedtime({ from: now - 300000, ends: now + 300000 });
    });
    const halfway = await band();
    const sunset = await scene(() => window.playroom.shelf.dusk());
    await open('bars');
    await scene(() => {
        window.playroom.grace = 1;
        const now = Date.now();
        window.playroom.timeBedtime({ from: now - 599000, ends: now + 1000 });
    });
    await page.waitForTimeout(1700);
    const dueInToy = await page.evaluate(() => ({
        moon: document.getElementById('home').classList.contains('bedtime'),
        scene: window.playroom.stage.scene.constructor.name,
    }));
    const nightBand = await band();
    await shot('timer-up');
    const putAway = await page
        .waitForFunction(
            () => window.playroom.stage.scene === window.playroom.shelf && !!window.playroom.shelf.night,
            null,
            { timeout: 6000 }
        )
        .then(
            () => true,
            () => false
        );
    await tuckAll();
    const timedOut = await bud();
    // Play time is over: the bud sleeps, the timer is kept, run out, and the leaf to the corner is
    // beside it.
    const sleeping = () =>
        page.evaluate(() => ({
            scene: window.playroom.stage.scene.constructor.name,
            asleep: !!window.playroom.stage.scene.asleep,
            timer: !!window.playroom.bedtime,
            stored: !!JSON.parse(localStorage.getItem('playroom.settings.v1')).timer,
            leaf: !document.getElementById('gate').hidden,
        }));
    const closedForNight = await sleeping();
    const stillNight = (await band()).night;
    check(
        "the timer's band shows the time going; run out in a game, the moon shows and the band turns to night, then the game puts itself away, the night comes, and the playroom closes to a sleeping bud, with the leaf to the corner beside it",
        halfway.shown &&
            Math.abs(halfway.part - 0.5) < 0.02 &&
            halfway.colour === 'rgb(229, 199, 102)' &&
            Math.abs(sunset - 0.3) < 0.02 &&
            dueInToy.moon &&
            dueInToy.scene === 'BarsScene' &&
            nightBand.night &&
            putAway &&
            timedOut &&
            closedForNight.asleep &&
            closedForNight.timer &&
            closedForNight.stored &&
            closedForNight.leaf &&
            stillNight,
        JSON.stringify({
            halfway,
            sunset,
            dueInToy,
            nightBand,
            putAway,
            timedOut,
            closedForNight,
            stillNight,
        })
    );
    for (let i = 0; i < 4; i++) await touch.tap(512, 330);
    const stirred = await scene(() => window.playroom.stage.scene.stirs.length);
    await shot('timer-closed');
    await page.waitForTimeout(2200);
    const afterTaps = await sleeping();
    check(
        'taps on the sleeping bud only stir it: it does not open',
        stirred > 0 && afterTaps.scene === 'StartScene' && afterTaps.asleep && afterTaps.timer,
        JSON.stringify({ stirred, afterTaps })
    );

    // Opened again, even a day after the time ran out, it is still asleep, and silent when tapped.
    await page.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('playroom.settings.v1'));
        const ended = Date.now() - 24 * 3600 * 1000;
        stored.timer = { from: ended - 600000, ends: ended };
        localStorage.setItem('playroom.settings.v1', JSON.stringify(stored));
    });
    await page.reload();
    await page.waitForFunction(() => window.__playroomBooted === true, null, { timeout: 15000 });
    await bud();
    for (let i = 0; i < 3; i++) await touch.tap(512, 330);
    await page.waitForTimeout(1800);
    const nextDay = await sleeping();
    const nextDaySound = await scene(() => window.playroom.audio.stats());
    check(
        'opened again a day later, the playroom is still closed: the bud sleeps, the band is the night, and taps on it make no sound',
        nextDay.scene === 'StartScene' &&
            nextDay.asleep &&
            nextDay.timer &&
            nextDay.leaf &&
            (await band()).night &&
            nextDaySound.state !== 'none' &&
            nextDaySound.voices === 0,
        JSON.stringify({ nextDay, nextDaySound })
    );

    // A grown-up opens it again: the leaf beside the sleeping bud, held, then the passcode.
    const leaf = await page.evaluate(() => {
        const r = document.getElementById('gate').getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await touch.down(leaf.x, leaf.y);
    await page.waitForTimeout(3300);
    await touch.up();
    const corner = await page.evaluate(() => ({
        open: !document.getElementById('parent').hidden,
        says: document.querySelector('[data-timer-state]').textContent,
        button: document.querySelector('[data-timer-stop]').textContent,
        pressed: document.querySelectorAll('[data-timer] [aria-pressed="true"]').length,
    }));
    await page.click('[data-timer-stop]');
    await page.click('[data-pad-cancel]');
    const cancelled = await sleeping();
    await page.click('[data-timer-stop]');
    const askedFor = await pad();
    await key('5678');
    const opened = await sleeping();
    await page.click('[data-close]');
    await bud();
    const awake = await sleeping();
    check(
        'a grown-up opens it again in the corner: cancelled, it stays shut; with the passcode, the timer goes and the bud wakes, without the leaf',
        corner.open &&
            /stays closed/.test(corner.says) &&
            corner.button === 'Open the playroom again' &&
            corner.pressed === 0 &&
            cancelled.asleep &&
            cancelled.timer &&
            askedFor.title === 'Passcode' &&
            /To open the playroom again/.test(askedFor.hint) &&
            !opened.timer &&
            !opened.stored &&
            awake.scene === 'StartScene' &&
            !awake.asleep &&
            !awake.leaf &&
            !(await band()).shown,
        JSON.stringify({ corner, cancelled, askedFor, opened, awake })
    );
    await touch.tap(512, 330);
    await page.waitForTimeout(1800);
    check(
        'and the bud opens it, with its hello',
        (await sceneName()) === 'ShelfScene' && (await scene(() => !!window.playroom.shelf.greeting))
    );
    await page.waitForFunction(() => !window.playroom.shelf.greeting, null, { timeout: 6000 });

    // Tucked in by the child: the night waits, mostly still, until every toy has been tapped.
    await page.evaluate(async () => (await import('./js/settings.js')).setTuck('child'));
    await page.waitForTimeout(400);
    await touch.tap(moon[0], moon[1]);
    await page.waitForTimeout(3800);
    const waitingNight = await scene(() => ({
        night: !!window.playroom.shelf.night,
        asleep: window.playroom.shelf.items.filter((item) => item.asleep).length,
    }));
    const waitA = await scene(() => window.playroom.stage.frames);
    await page.waitForTimeout(3000);
    const waitB = await scene(() => window.playroom.stage.frames);
    await tuckAll();
    const tuckedAll = await bud();
    check(
        'when the child is to tuck them in, the night waits, drawing little, until each toy is tapped',
        waitingNight.night && waitingNight.asleep === 0 && waitB - waitA < 90 && tuckedAll,
        JSON.stringify({ waitingNight, frames: waitB - waitA, tuckedAll })
    );
    await page.evaluate(async () => (await import('./js/settings.js')).setTuck('themselves'));

    // The moon's own goodnight does not stop a grown-up's timer: it runs on, and the bud opens. The
    // night before left the bud, so the shelf first.
    await touch.tap(512, 330);
    await page.waitForTimeout(1800);
    await page.waitForFunction(() => !window.playroom.shelf.greeting, null, { timeout: 6000 });
    await scene(() => window.playroom.setBedtime(30));
    await page.waitForTimeout(400);
    const onShelf = await scene(() => window.playroom.stage.scene === window.playroom.shelf);
    await touch.tap(moon[0], moon[1]);
    await page.waitForTimeout(1500);
    await tuckAll();
    const moonClosed = await bud();
    const afterMoon = await sleeping();
    const afterMoonBand = await band();
    await touch.tap(512, 330);
    await page.waitForTimeout(1800);
    check(
        "the moon's goodnight leaves a running timer running, its band going, and the bud opens again",
        onShelf &&
            moonClosed &&
            !afterMoon.asleep &&
            afterMoon.timer &&
            afterMoon.stored &&
            !afterMoon.leaf &&
            afterMoonBand.shown &&
            !afterMoonBand.night &&
            (await sceneName()) === 'ShelfScene',
        JSON.stringify({ onShelf, moonClosed, afterMoon, afterMoonBand })
    );
    await page.waitForFunction(() => !window.playroom.shelf.greeting, null, { timeout: 6000 });

    // A timer survives the page being opened again.
    await page.reload();
    await page.waitForFunction(() => window.__playroomBooted === true, null, { timeout: 15000 });
    const survived = await scene(() => ({
        minutes: Math.round((window.playroom.bedtime - window.playroom.bedtimeFrom) / 60000),
        left: window.playroom.bedtime - Date.now(),
    }));
    const survivedBand = await band();
    check(
        'a running timer, and its band, survive the playroom being opened again',
        survived.minutes === 30 &&
            survived.left > 29 * 60000 &&
            survivedBand.shown &&
            survivedBand.part > 0.95,
        JSON.stringify({ survived, survivedBand })
    );
    await scene(() => window.playroom.setBedtime(0));
    await touch.tap(512, 330);
    await page.waitForTimeout(1800);
    await page.waitForFunction(() => !window.playroom.shelf.greeting, null, { timeout: 6000 });

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

    // ---- a newer copy --------------------------------------------------------------------------------
    //
    // A published copy is served from the iPad's own store, so a deploy reaches it only through a
    // newer service worker, and a home-screen app is brought back to the front far more often than
    // it is started. Copies are published here in turn, stamped as the deploy stamps them, and the
    // page must change over by itself: straight away while the bud waits, and otherwise only once
    // the playroom has been put away, never mid-play.

    if (!safari) {
        const versionFile = await readFile(join(here, 'js/version.js'), 'utf8');
        const publish = (version) => {
            standIns.set('sw.js', sw.replace("'__VERSION__'", `'${version}'`));
            standIns.set(
                'js/version.js',
                versionFile.replace("'__VERSION__'", `'${version}'`).replace("'__PUBLISHED__'", "'today'")
            );
        };
        const later = await browser.newContext({
            viewport: { width: 1024, height: 768 },
            hasTouch: true,
            isMobile: true,
        });
        const iPad = await later.newPage();
        const iPadTouch = await later.newCDPSession(iPad);
        const copy = () => iPad.evaluate(() => window.playroom && window.playroom.version);
        const changedTo = (version) =>
            iPad
                .waitForFunction((v) => window.playroom && window.playroom.version === v, version, {
                    timeout: 20000,
                })
                .then(
                    () => true,
                    () => false
                );
        // Brought back to the front, or put away: the page cannot tell which from the event alone.
        const toFront = () => iPad.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

        publish('copy-one');
        await iPad.goto(url);
        await iPad.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
            timeout: 20000,
        });
        const first = await copy();
        publish('copy-two');
        await toFront();
        check(
            'a newly published copy is taken up by itself, straight away while the bud waits',
            first === 'copy-one' && (await changedTo('copy-two')),
            `${first} then ${await copy()}`
        );

        await iPad.waitForFunction(() => window.__playroomBooted === true);
        await iPadTouch.send('Input.dispatchTouchEvent', {
            type: 'touchStart',
            touchPoints: [{ x: 512, y: 330, id: 1 }],
        });
        await iPad.waitForTimeout(50);
        await iPadTouch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await iPad.waitForTimeout(2000);
        await iPad.evaluate(() => {
            window.__stillHere = true;
        });
        publish('copy-three');
        await toFront();
        const tookOver = await iPad
            .waitForFunction(
                async () => {
                    const keys = await caches.keys();
                    return keys.length === 1 && keys[0] === 'playroom-copy-three';
                },
                null,
                { timeout: 20000 }
            )
            .then(
                () => true,
                () => false
            );
        await iPad.waitForTimeout(1000);
        const midPlay = await iPad.evaluate(() => ({
            still: window.__stillHere === true,
            scene: window.playroom.stage.scene.constructor.name,
            version: window.playroom.version,
        }));
        check(
            'but mid-play, a newer copy waits',
            tookOver && midPlay.still && midPlay.scene === 'ShelfScene' && midPlay.version === 'copy-two',
            JSON.stringify(midPlay)
        );
        await toFront();
        const changed = await changedTo('copy-three');
        check(
            'until the playroom is put away, and it opens again from the bud',
            changed &&
                (await iPad.evaluate(() => window.playroom.stage.scene.constructor.name)) === 'StartScene'
        );
        standIns.clear();
        await later.close();
    }

    await context.close();
}

await suite('chromium');
await suite('safari12');

await browser.close();
server.close();

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
