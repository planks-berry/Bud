// Torch in the Dark's rules: who sleeps in the garden at each stage, where each hides each night, how
// long the light must rest on one to wake it, the night song they sing once all are awake, and the
// fireflies' rhythms. No drawing and no sound here, so the rules can be checked in Node.

import { clamp, rng, shuffle } from '../util.js';

export const CREATURES = ['owl', 'hedgehog', 'snail', 'frog', 'mouse', 'cricket'];

// The places in the garden a creature can sleep, in the garden's own measure, 0 to 1 across and
// down the screen, and who can sleep in each: the owl up high, the frog by the water, the rest on
// and under things on the ground.
export const SPOTS = {
    branch: { x: 0.25, y: 0.34, who: ['owl'] },
    treehole: { x: 0.155, y: 0.49, who: ['owl', 'mouse'] },
    fence: { x: 0.5, y: 0.47, who: ['owl', 'snail', 'cricket'] },
    roof: { x: 0.81, y: 0.3, who: ['owl'] },
    log: { x: 0.45, y: 0.71, who: ['hedgehog', 'snail', 'mouse', 'cricket'] },
    bush: { x: 0.64, y: 0.63, who: ['hedgehog', 'cricket', 'mouse'] },
    pot: { x: 0.86, y: 0.67, who: ['snail', 'cricket', 'mouse'] },
    pond: { x: 0.12, y: 0.79, who: ['frog'] },
    lily: { x: 0.27, y: 0.85, who: ['frog'] },
    grass: { x: 0.72, y: 0.86, who: ['frog', 'hedgehog', 'cricket'] },
    path: { x: 0.35, y: 0.6, who: ['hedgehog', 'snail'] },
};

// Where each sleeps at Seed, and for ever at Seed: the same garden every night.
const HOME = {
    owl: 'branch',
    hedgehog: 'log',
    snail: 'pot',
    frog: 'pond',
    mouse: 'treehole',
    cricket: 'bush',
};

// Per stage: who sleeps in the garden; the torch's beam, in layout units across; the seconds the
// light must rest on a creature to wake it; whether they sleep somewhere new each night; and, at
// Bloom, the moon rising and the fireflies' rhythms to answer.
export const STAGES = [
    {
        creatures: ['owl', 'hedgehog', 'snail', 'frog'],
        beam: 170,
        wake: 0.5,
        move: false,
        moon: false,
        answer: false,
    },
    { creatures: CREATURES, beam: 125, wake: 0.8, move: true, moon: false, answer: false },
    { creatures: CREATURES, beam: 110, wake: 1.0, move: true, moon: true, answer: true },
];

// The places a creature can sleep.
export function placesFor(who) {
    return Object.keys(SPOTS).filter((spot) => SPOTS[spot].who.indexOf(who) >= 0);
}

// Where each sleeps tonight. At Seed, always at home. From Sprout, somewhere new each night that is
// right for it, never two in one place, and none where it slept last night if it can be helped.
export function hide(level, last = null, next = rng(1)) {
    const stage = STAGES[level];
    const out = {};
    if (!stage.move) {
        for (const who of stage.creatures) out[who] = HOME[who];
        return out;
    }
    // The fussiest first: the frog and the owl have the fewest places to choose from.
    const order = shuffle(stage.creatures, next).sort((a, b) => placesFor(a).length - placesFor(b).length);
    const taken = {};
    const place = (i) => {
        if (i === order.length) return true;
        const who = order[i];
        const options = shuffle(placesFor(who), next);
        // Last night's place last.
        options.sort((a, b) => (last && last[who] === a ? 1 : 0) - (last && last[who] === b ? 1 : 0));
        for (const spot of options) {
            if (taken[spot]) continue;
            taken[spot] = true;
            out[who] = spot;
            if (place(i + 1)) return true;
            delete taken[spot];
        }
        return false;
    };
    place(0);
    return out;
}

// How long the light has rested on something, in seconds: it gathers while the beam is on it and
// moving slowly, and drains away quickly when the beam sweeps fast or moves off. A creature wakes
// only when the light rests on it. `speed` is the beam's, in layout units a second.
export const SLOW = 320;
export function rest(lit, dt, on, speed) {
    if (on && speed < SLOW) return lit + dt;
    return Math.max(0, lit - dt * (on ? 1.5 : 3));
}

// The night song, once every creature is awake: a lullaby on the music box, a note a beat, and each
// creature's voice on its note. Every note is on the playroom's scale.
export const SONG = [2, 4, 3, 2, 1, 2, 0, 0];
export const SONG_BEAT = 0.55;
export const VOICE_AT = { owl: 0, frog: 2, cricket: 3, mouse: 5, hedgehog: 6, snail: 7 };

// The fireflies' rhythms, at Bloom: a few blinks, a short or a long gap between each, in steps of
// FLASH seconds; they begin with two blinks and grow by one after every GROW_AFTER rhythms he
// blinks back with the torch, to at most MOST. What they blink back is his, in his own time, kept
// between a quick flicker and a slow wink.
export const FLASH = 0.34;
export const FIRST = 2;
export const MOST = 5;
export const GROW_AFTER = 2;

export function call(length, next = Math.random) {
    const times = [0];
    while (times.length < length) times.push(times[times.length - 1] + FLASH * (next() < 0.6 ? 1 : 2));
    return times;
}

export function echo(clicks) {
    const last = clicks.slice(-8);
    const out = [];
    let at = 0;
    for (let i = 0; i < last.length; i++) {
        if (i > 0) at += clamp(last[i] - last[i - 1], 0.14, 0.7);
        out.push(at);
    }
    return out;
}

// After a rhythm he answered: the rhythms answered in a row, and the length of the next.
export function grown(streak, length) {
    if (streak + 1 < GROW_AFTER) return { streak: streak + 1, length };
    return { streak: 0, length: Math.min(MOST, length + 1) };
}
