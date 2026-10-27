// The Fix-it Shop's rules: which toys come in broken, what each is missing, what lies in the drawer,
// what fits where, and the tune the mended toys play together. No drawing and no sound here, so the
// rules can be checked in Node.
//
// A part fits a gap when it is the part that goes there, and, from Sprout, when it is turned the way
// the gap is. Round parts (a wheel, a drum's skin) fit however they are turned. A part that does not
// fit is never wrong: it slides back, as a Montessori puzzle piece will not go into the wrong hole.

import { rng, shuffle } from '../util.js';

// The six toys that come in broken, and what each can be missing: the first at every stage, the
// second as well at Bloom.
export const TOYS = {
    car: ['wheel', 'horn'],
    drum: ['skin', 'stick'],
    musicbox: ['crank', 'bird'],
    robot: ['arm', 'antenna'],
    train: ['chimney', 'bell'],
    boat: ['sail', 'flag'],
};
export const KINDS = Object.keys(TOYS);

// The parts. `turns`: how many ways round it can lie that look different, so how many quarter turns
// bring it back to fitting: 1 for a round part, 4 for one with an up and a side. `family`: parts of
// one family look alike, so a drawer never offers two of a family at Seed.
export const PARTS = {
    wheel: { turns: 1, family: 'round' },
    skin: { turns: 1, family: 'round' },
    crank: { turns: 4, family: 'bent' },
    arm: { turns: 4, family: 'long' },
    chimney: { turns: 4, family: 'block' },
    sail: { turns: 4, family: 'point' },
    horn: { turns: 4, family: 'bent' },
    stick: { turns: 4, family: 'long' },
    bird: { turns: 4, family: 'figure' },
    antenna: { turns: 4, family: 'long' },
    bell: { turns: 4, family: 'block' },
    flag: { turns: 4, family: 'point' },
};

// What each stage asks. gaps: how many parts each toy is missing; drawer: how many parts lie in the
// drawer; turn: whether a part must be turned to fit; screw: whether the first part is held by a
// screw the screwdriver turns home.
export const STAGES = [
    { gaps: 1, drawer: 2, turn: false, screw: false },
    { gaps: 1, drawer: 3, turn: true, screw: false },
    { gaps: 2, drawer: 4, turn: true, screw: true },
];

// The parts a toy is missing at a stage.
export function missing(kind, level) {
    return TOYS[kind].slice(0, STAGES[level].gaps);
}

// Whether a part, lying `rot` quarter turns round, goes into a gap for `want`.
export function fits(part, rot, want, level) {
    if (part !== want) return false;
    if (!STAGES[level].turn) return true;
    return ((rot % PARTS[part].turns) + PARTS[part].turns) % PARTS[part].turns === 0;
}

// What lies in the drawer for a toy: the parts it is missing, and others from other toys to choose
// between, each turned some way round from Sprout on. The parts it needs never lie the right way up
// at Sprout and Bloom, so there is always a turn to make; a round part needs none. At Seed the others
// are of other families, so the choice is plain: a wheel is not offered against a drum's skin.
export function drawer(kind, level, next = rng(1)) {
    const stage = STAGES[level];
    const need = missing(kind, level);
    const taken = new Set(need.map((part) => PARTS[part].family));
    const others = shuffle(
        Object.keys(PARTS).filter((part) => need.indexOf(part) < 0),
        next
    ).filter((part) => {
        if (level > 0) return true;
        const family = PARTS[part].family;
        if (taken.has(family)) return false;
        taken.add(family);
        return true;
    });
    const parts = need.concat(others.slice(0, stage.drawer - need.length));
    return shuffle(parts, next).map((part) => ({
        part,
        rot: !stage.turn
            ? 0
            : need.indexOf(part) >= 0 && PARTS[part].turns > 1
              ? 1 + Math.floor(next() * 3)
              : Math.floor(next() * 4),
    }));
}

// The order the toys come in: each of the six once, in a new order each round, never the toy that
// came last coming first again.
export function round(last, next = rng(2)) {
    const order = shuffle(KINDS.slice(), next);
    if (order[0] === last) order.push(order.shift());
    return order;
}

// The band. Mended, each toy plays its part on the shelf, two bars at a time: the drum the beat, the
// music box the tune, the boat a low bell at the start of each bar, the robot a pair of high notes,
// the car its horn, the train a toot to end on. Beats from 0, eighths as halves. Notes are scale
// degrees: every one is on the playroom's scale, so any mix of the band is in tune.
export const BEAT = 0.6;
export const BARS = 2;
export const SCORE = {
    drum: [0, 1, 2, 3, 4, 5, 6, 7].map((beat) => ({ beat, soft: beat % 2 === 1 })),
    musicbox: [
        { beat: 0, degree: 2 },
        { beat: 1, degree: 3 },
        { beat: 2, degree: 4 },
        { beat: 3, degree: 3 },
        { beat: 4, degree: 2 },
        { beat: 5, degree: 1 },
        { beat: 6, degree: 0 },
    ],
    boat: [
        { beat: 0, degree: 0 },
        { beat: 4, degree: 3 },
    ],
    robot: [
        { beat: 1.5, degree: 2 },
        { beat: 2, degree: 4 },
        { beat: 5.5, degree: 3 },
        { beat: 6, degree: 5 },
    ],
    car: [{ beat: 3 }, { beat: 3.5 }, { beat: 7 }],
    train: [
        { beat: 6.5, degree: 2 },
        { beat: 7, degree: 0 },
    ],
};

// The notes of the band with the toys on the shelf, in time order: { beat, kind, note }.
export function bandNotes(kinds) {
    const out = [];
    for (const kind of kinds) for (const note of SCORE[kind] || []) out.push({ beat: note.beat, kind, note });
    return out.sort((a, b) => a.beat - b.beat);
}
