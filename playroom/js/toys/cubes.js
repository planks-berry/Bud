// The colour towers' cubes: the five colours and their notes, the three wooden beats, what each
// stage puts on the shelf, and a fresh choice of colours each time the shelf is taken out.
//
// The set changes; the rules do not. Whatever the dice say:
//   - each colour keeps its note, the one it has in every game, so red is always C;
//   - the stage's colours: 2 at Seed and 3 at Sprout, never the same ones twice in a row, and all
//     5 at Bloom;
//   - the rows run from the drum at the bottom, through the other beats, to the colours in the
//     order of their notes, lowest first, so a higher cubby is always a higher note.
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

// Plain wooden cubes, darker for the lower sound, each with a mark burnt into its face: a drum's
// skin, a clap's burst, a shaker's seeds.
export const BEATS = [
    { name: 'drum', colour: '#C79E72', mark: 'skin' },
    { name: 'clap', colour: '#DDBF94', mark: 'burst' },
    { name: 'shaker', colour: '#ECD9B8', mark: 'seeds' },
];

// `steps`: the columns of the loop; `colours` and `beats`: its rows; `step`: seconds a column.
export const STAGES = [
    { steps: 4, colours: 2, beats: ['drum'], step: 0.46 },
    { steps: 8, colours: 3, beats: ['drum', 'shaker'], step: 0.36 },
    { steps: 8, colours: 5, beats: ['drum', 'clap', 'shaker'], step: 0.3 },
];

// Which colours a choice holds, as one string, to compare one outing with the last.
export function colourKey(colours) {
    return colours
        .map((kind) => kind.name)
        .sort()
        .join(' ');
}

// The stage's colours, rolled from `seed`, lowest note first. `avoid` is the last choice's
// colourKey.
export function pickColours(level, seed, avoid = '') {
    const stage = STAGES[level];
    const next = rng(seed);
    let kinds = COLOURS;
    for (let tries = 0; tries < 20; tries++) {
        kinds = shuffle(COLOURS, next).slice(0, stage.colours);
        if (stage.colours === COLOURS.length || colourKey(kinds) !== avoid) break;
    }
    return kinds.slice().sort((a, b) => a.degree - b.degree);
}

// The shelf's rows from the bottom up: the beats, then the colours.
export function rowsFor(level, colours) {
    const beats = STAGES[level].beats.map((name) => BEATS.find((beat) => beat.name === name));
    return beats
        .map((beat) => Object.assign({ beat: true }, beat))
        .concat(colours.map((kind) => Object.assign({ beat: false }, kind)));
}

// What the shelf holds when it comes out: a heartbeat, the drum on the first beat of every four,
// so there is something to hear at once and a pulse to build on. As [row, column] pairs.
export function starter(level) {
    const stage = STAGES[level];
    const out = [];
    for (let col = 0; col < stage.steps; col += stage.steps > 4 ? 4 : 2) out.push([0, col]);
    return out;
}
