// Bird Song's tunes: the stages, what the bird composes, what it sings back of his, and how its
// tunes grow. Pure, so the suite can compose thousands in Node and check every one.

import { clamp } from '../util.js';

// Per stage: the flowers, by colour; how many notes the bird's tunes have at first and at most;
// the time between their notes; and how many birds sit on the branch.
export const STAGES = [
    { flowers: ['red', 'yellow', 'green'], first: 2, most: 3, step: 0.46, birds: 1 },
    { flowers: ['red', 'yellow', 'green', 'blue', 'purple'], first: 3, most: 4, step: 0.42, birds: 1 },
    { flowers: ['red', 'yellow', 'green', 'blue', 'purple'], first: 3, most: 5, step: 0.38, birds: 2 },
];

// The first tune: the falling third every child's chant starts with, G to E, and at Sprout and
// Bloom a step up to A after it.
export const OPENERS = [
    ['green', 'yellow'],
    ['green', 'yellow', 'blue'],
    ['green', 'yellow', 'blue'],
];

// Seconds of quiet after his last note before the bird asks for its turn, with a ring and a hop:
// long enough for a small child's pauses between taps. It takes its turn only when he taps it.
export const FINISHED = 1.2;
// Seconds of quiet before the bird sings its tune again, if he has not played, or chirps to ask for
// its turn, if he has; and how many times it does, before it rests.
export const REMIND = 9;
export const REMINDERS = 2;
// Seconds of his playing before the bird bids for its turn, standing tall and flapping, and between
// its bids for as long as he plays on: his pauses it asks for with its rings. It bids in a gap
// between his notes at least BID_GAP long, or, if he leaves none, BID_WAIT seconds later anyway.
export const BID = 5;
export const BID_GAP = 0.3;
export const BID_WAIT = 2;
// Answered turns in a row before the tunes grow by a note.
export const GROW_AFTER = 3;
// The most of his notes the bird sings back: the last ones.
export const ECHO_MOST = 12;
// Notes closer together than this are a glide: sung short, each gliding in from the one before.
export const GLIDE = 0.26;

// Whether the bird bids for its turn now, after `held` seconds of his playing, `since` seconds after
// his last note.
export function bidding(held, since) {
    return held >= BID && (since >= BID_GAP || held >= BID + BID_WAIT);
}

// A new tune of `length` notes on flowers 0..count-1, beginning on `start`: mostly steps to a
// neighbour, sometimes a skip of one, now and then the same note again but never three in a row.
export function compose(start, length, count, next = Math.random) {
    const tune = [clamp(start, 0, count - 1)];
    let at = tune[0];
    while (tune.length < length) {
        const roll = next();
        let step = roll < 0.12 ? 0 : roll < 0.78 ? 1 : 2;
        if (step === 0 && tune.length >= 2 && tune[tune.length - 2] === at) step = 1;
        let way = next() < 0.5 ? -1 : 1;
        if (at + way * step < 0 || at + way * step >= count) way = -way;
        at = clamp(at + way * step, 0, count - 1);
        tune.push(at);
    }
    return tune;
}

// What the bird sings back: his last notes, in his own rhythm, kept between a quick glide and a
// steady walk. Notes close together are sung short; one that follows its neighbour quickly glides
// in from it, so a finger run along the flowers comes back as a glide.
export function echo(notes) {
    const last = notes.slice(-ECHO_MOST);
    const out = [];
    let at = 0;
    for (let i = 0; i < last.length; i++) {
        if (i > 0) at += clamp(last[i].t - last[i - 1].t, 0.11, 0.6);
        out.push({ index: last[i].index, at });
    }
    for (let i = 0; i < out.length; i++) {
        const before = i > 0 ? out[i].at - out[i - 1].at : Infinity;
        const after = i < out.length - 1 ? out[i + 1].at - out[i].at : Infinity;
        out[i].short = Math.min(before, after) < GLIDE;
        if (before < GLIDE && Math.abs(out[i].index - out[i - 1].index) === 1)
            out[i].glide = out[i - 1].index;
    }
    return out;
}

// After a turn he answered: the turns answered in a row, and the tunes' length, which grows by a note
// after GROW_AFTER of them and never shrinks or passes `most`.
export function grown(streak, length, most) {
    if (streak + 1 < GROW_AFTER) return { streak: streak + 1, length };
    return { streak: 0, length: Math.min(most, length + 1) };
}
