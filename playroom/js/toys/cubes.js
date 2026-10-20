// The colour tower's cubes: the five colours and their notes, and a fresh set of colours and sizes
// each time the tower is taken out.
//
// The set changes; the rules do not. Whatever the dice say:
//   - each colour keeps its note, the one it has as a paint on the easel, so red is always C;
//   - the stage's colours and cubes: 2 colours of 3 cubes at Seed, 3 of 3 at Sprout, 5 of 2 at
//     Bloom, and at Seed and Sprout never the same colours twice in a row;
//   - every cube a different size, from the largest down to the stage's smallest, and each at
//     least 8% smaller than the one before, so ordering by size is always possible to see;
//   - colour and size never line up: every colour has a cube in the larger half and one in the
//     smaller, and the colours in size order do not repeat, so building by size plays nothing that
//     building any other way does not.
//
// Pure, so the suite can roll thousands of sets in Node and check every one.

import { rng, shuffle } from '../util.js';

export const COLOURS = [
    { name: 'red', colour: '#E79A98', degree: 0 },
    { name: 'yellow', colour: '#F1CF5E', degree: 2 },
    { name: 'green', colour: '#8EBF7A', degree: 3 },
    { name: 'blue', colour: '#7FB2DE', degree: 4 },
    { name: 'purple', colour: '#AE93D6', degree: 5 },
];

export const STAGES = [
    { colours: 2, each: 3, smallest: 0.42 },
    { colours: 3, each: 3, smallest: 0.26 },
    { colours: 5, each: 2, smallest: 0.1 },
];

export const MIN_STEP = 1.08;

// Which colours a set uses, as one string, to compare one outing with the last.
export function colourKey(set) {
    const names = [];
    for (const cube of set) if (names.indexOf(cube.name) < 0) names.push(cube.name);
    return names.sort().join(' ');
}

// Sizes from 1 down to `smallest`: the pink tower's even steps, each stretched or shrunk at random,
// and none smaller than MIN_STEP. Steps are measured as ratios, which is how the eye compares sizes.
function sizes(n, smallest, next) {
    const even = [];
    for (let i = 0; i < n; i++) even.push(1 - (i / (n - 1)) * (1 - smallest));
    const span = -Math.log(smallest);
    const least = Math.log(MIN_STEP);
    const weights = [];
    for (let i = 0; i < n - 1; i++) weights.push(Math.log(even[i] / even[i + 1]) * (0.5 + next()));
    const total = weights.reduce((sum, w) => sum + w, 0);
    const out = [1];
    let at = 0;
    for (const w of weights) {
        at += least + (span - least * (n - 1)) * (w / total);
        out.push(Math.exp(-at));
    }
    out[n - 1] = smallest;
    return out;
}

// Colours in size order, largest first, that do not line up with size.
export function mixed(order) {
    const n = order.length;
    const names = [];
    for (const name of order) if (names.indexOf(name) < 0) names.push(name);
    for (const name of names) {
        const large = order.some((o, i) => o === name && i < n / 2);
        const small = order.some((o, i) => o === name && i >= n / 2);
        if (!large || !small) return false;
    }
    // A repeating pattern repeats at least twice.
    for (let p = 1; p <= n / 2; p++) {
        if (order.every((o, i) => i + p >= n || o === order[i + p])) return false;
    }
    return true;
}

// A set for stage `level`, rolled from `seed`: cubes largest first, each { name, colour, degree,
// size }, size as a fraction of the largest. `avoid` is the last set's colourKey.
export function makeSet(level, seed, avoid = '') {
    const stage = STAGES[level];
    const next = rng(seed);
    const n = stage.colours * stage.each;

    let kinds = COLOURS;
    for (let tries = 0; tries < 20; tries++) {
        kinds = shuffle(COLOURS, next).slice(0, stage.colours);
        if (stage.colours === COLOURS.length || colourKey(kinds) !== avoid) break;
    }

    const pool = [];
    for (const kind of kinds) for (let i = 0; i < stage.each; i++) pool.push(kind);
    let order = pool;
    for (let tries = 0; tries < 200; tries++) {
        order = shuffle(pool, next);
        if (mixed(order.map((kind) => kind.name))) break;
    }

    const scale = sizes(n, stage.smallest, next);
    return order.map((kind, i) => ({
        name: kind.name,
        colour: kind.colour,
        degree: kind.degree,
        size: scale[i],
    }));
}
