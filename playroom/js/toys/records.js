// The turntable's records: short loops pressed from the playroom's own sounds, one to a record.
//
// Each record is two bars at 96 beats a minute: a list of what sounds on which of its sixteen
// eighth notes, at what loudness. Pressing a record mixes those sounds into one loop of samples,
// each at its level in the playroom's mix, and a sound still ringing at the end of the loop carries
// on at its start, so the loop has no seam however often it goes round. Every note is on the
// playroom's scale, so a record playing at its own speed is in tune with every other toy.
//
// Pure, so the suite can press every record in Node and check it.

import { noteHz, MIX } from '../synth.js';
import { COLOURS } from './cubes.js';

export const BPM = 96;
export const STEPS = 16;
// An eighth note, and the whole loop, in seconds.
export const STEP = 60 / BPM / 2;
export const LENGTH = STEPS * STEP;

const at = (steps, name, params, gain) => steps.map((step) => [step, name, params, gain]);
const knock = (step, degree, gain = 0.9) => [step, 'wood', { f: noteHz(degree, 60) }, gain];

// The heartbeat every record shares: the drum on the first and third beat of each bar, a clap on
// the second and fourth, and the shaker on the eighths between.
const BEAT = [
    ...at([0, 4, 8, 12], 'drum', {}, 0.9),
    ...at([2, 6, 10, 14], 'clap', {}, 0.6),
    ...at([1, 3, 5, 7, 9, 11, 13, 15], 'shaker', {}, 0.45),
];

const colour = (name) => COLOURS.find((kind) => kind.name === name).colour;

// Each record's vinyl is one of the playroom's colours, and its label shows what is on it. What is
// on them is short and struck, as a drum is: a scratch drags it to and fro, and a long held note,
// scratched, slides about where a struck one clicks and rubs. So the tune is played on wooden
// knocks, the colour beats' own notes, and of the animals only the cow holds hers.
export const RECORDS = [
    {
        name: 'tune',
        colour: colour('red'),
        label: 'note',
        events: [
            ...at([0, 8], 'drum', {}, 0.8),
            ...at([4, 12], 'clap', {}, 0.5),
            ...at([2, 6, 10, 14], 'shaker', {}, 0.4),
            knock(0, 5),
            knock(2, 4),
            knock(4, 3),
            knock(5, 2, 0.7),
            knock(6, 3),
            knock(8, 5),
            knock(10, 6),
            knock(12, 5),
            knock(13, 4, 0.7),
            knock(14, 3),
        ],
    },
    {
        name: 'beat',
        colour: colour('blue'),
        label: 'drum',
        events: [
            ...BEAT,
            knock(0, -5, 0.8),
            knock(3, -5, 0.6),
            knock(6, -2, 0.8),
            knock(8, -5, 0.8),
            knock(11, -4, 0.6),
            knock(14, -1, 0.8),
        ],
    },
    {
        name: 'animals',
        colour: colour('green'),
        label: 'cow',
        events: [
            ...BEAT,
            [0, 'moo', { f: noteHz(-5, 60) }, 0.9],
            [4, 'cluck', { f: noteHz(4, 60) }, 0.8],
            [8, 'quack', {}, 0.9],
            [10, 'quack', {}, 0.6],
            [12, 'oink', { f: noteHz(-4, 60) }, 0.9],
        ],
    },
];

// The stage's records, in the order they stand in the crate: one at Seed, all three after.
export function recordsFor(level) {
    return level === 0 ? RECORDS.slice(0, 1) : RECORDS.slice();
}

// Press a record: its loop as samples at `sr`. `sound(name, params)` gives a sound's samples at that
// rate, rendered once; in the browser it is the playroom's own cache.
export function press(record, sr, sound) {
    const n = Math.round(LENGTH * sr);
    const out = new Float32Array(n);
    for (const [step, name, params, gain] of record.events) {
        const data = sound(name, params);
        const level = gain * (MIX[name] === undefined ? 1 : MIX[name]);
        const start = Math.round(step * STEP * sr);
        for (let i = 0; i < data.length; i++) out[(start + i) % n] += data[i] * level;
    }
    return out;
}
