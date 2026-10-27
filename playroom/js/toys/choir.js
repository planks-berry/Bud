// Bug Maker's rules: the parts a bug can be built from at each stage, and the song its parts make.
// No drawing and no sound here, so the rules can be checked in Node.
//
// A bug's song is one bar, and each part brings something to it. Its legs are the rhythm, a step a
// beat with two pairs, quicker with three, quicker still with four. Its body is its note, sung at the
// start of each half of the bar. Its head is its voice: a marimba, a bell or a woodblock. Its wings
// buzz on its note. Its spots, from Sprout, each tick their colour's note, left to right, one after
// each beat; at Bloom each spot is a note of its tune, one a beat, so a bug with four spots sings four
// notes: counting, heard, never asked. Every note is on the playroom's scale, so any bugs sing
// together in tune.

import { COLOURS } from './cubes.js';

export const BODIES = ['round', 'long', 'heart'];
export const HEADS = ['round', 'eyes', 'horns'];
// Pairs of legs.
export const LEGS = [2, 3, 4];
export const WINGS = ['round', 'long', 'butterfly'];
// The spots, in the playroom's five colours, each with its note.
export const SPOT_COLOURS = COLOURS;

// What each stage puts out: wings and spots from Sprout, and how many spots a bug can carry; at
// Bloom, its spots are its tune.
export const STAGES = [
    { wings: false, spots: 0, counting: false },
    { wings: true, spots: 4, counting: false },
    { wings: true, spots: 6, counting: true },
];

// Each body's note, and each head's voice.
export const BODY_NOTE = { round: 0, long: 2, heart: 4 };
export const VOICE = { round: 'marimba', eyes: 'glock', horns: 'wood' };
// Each pair of wings buzzes a little differently.
export const WING_BUZZ = { round: 0, long: 1, butterfly: 2 };

export const BEAT = 0.5;
export const BAR = 4;
// The octave every bug sings in; its wings buzz an octave below.
export const BASE = 72;

// How many steps a bar its legs take: more legs, a quicker step.
export function stepsOf(pairs) {
    return pairs <= 2 ? 4 : pairs === 3 ? 6 : 8;
}

// A bug can walk off into the meadow once it has a body, a head and legs.
export function ready(bug) {
    return !!(bug && bug.body && bug.head && bug.legs);
}

// One bar of a bug's song: { beats, events }, each event { at, kind, ... } with `at` in beats. Kinds:
// 'step' (a foot, `foot` 0 or 1), 'note' (its body's note, in its head's voice), 'buzz' (its wings),
// and 'spot' (`index` its place in the tune, left to right, `spot` which of the bug's spots it is,
// `degree` its note, `sung` at Bloom).
export function song(bug, level) {
    const stage = STAGES[level];
    const spots = (bug.spots || [])
        .slice(0, stage.spots)
        .map((spot, i) => ({ x: spot.x, degree: spot.degree, i }))
        .sort((a, b) => a.x - b.x);
    const beats = stage.counting ? Math.max(BAR, spots.length) : BAR;
    const events = [];
    if (bug.legs) {
        const n = (stepsOf(bug.legs) * beats) / BAR;
        for (let i = 0; i < n; i++) events.push({ at: (i * beats) / n, kind: 'step', foot: i % 2 });
    }
    if (bug.body) {
        const degree = BODY_NOTE[bug.body];
        events.push({ at: 0, kind: 'note', degree });
        events.push({ at: beats / 2, kind: 'note', degree });
        if (bug.wings && stage.wings) events.push({ at: 0, kind: 'buzz', degree, wings: bug.wings });
    }
    spots.forEach((spot, index) => {
        const at = stage.counting ? index : index + 0.5;
        events.push({ at, kind: 'spot', index, spot: spot.i, degree: spot.degree, sung: stage.counting });
    });
    return { beats, events: events.sort((a, b) => a.at - b.at) };
}
