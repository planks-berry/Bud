// Freeze Parade's rules: who is in the parade at each stage, what each one marches to, how his beat
// sets the pace, when the parade freezes, and the tune the band plays at Bloom. Pure, so the suite
// can drum whole parades in Node and check them.

import { clamp } from '../util.js';

// Seed: one drum, and the cow, the sheep and the pig. Sprout: two ducks join, who march to a
// tambourine. Bloom: a hare at the front, who only hops to a quick beat, a tortoise at the back,
// who only walks to a slow one, and the parade becomes a band that plays along with him.
export const STAGES = [
    { animals: ['cow', 'sheep', 'pig'], tambourine: false, band: false },
    { animals: ['cow', 'sheep', 'pig', 'duck', 'duck'], tambourine: true, band: false },
    { animals: ['hare', 'cow', 'sheep', 'pig', 'duck', 'duck', 'tortoise'], tambourine: true, band: true },
];

// What each marches to. The hare only hops when the beat is quick, and goes two steps at a hop;
// the tortoise only walks when it is slow.
export const WALKERS = {
    cow: { instrument: 'drum', steps: 1 },
    sheep: { instrument: 'drum', steps: 1 },
    pig: { instrument: 'drum', steps: 1 },
    duck: { instrument: 'tambourine', steps: 1 },
    tortoise: { instrument: 'drum', steps: 1, tempo: 'slow' },
    hare: { instrument: 'drum', steps: 2, tempo: 'quick' },
};

// Seconds between his beats: slower than SLOW is slow, quicker than QUICK is quick. The pace he
// sets is kept between FASTEST and SLOWEST, and a first beat counts as an easy walk.
export const SLOW = 0.75;
export const QUICK = 0.42;
export const FASTEST = 0.18;
export const SLOWEST = 1.5;
export const FIRST = 0.6;
// How much of the loop one step goes: a lap is forty steps.
export const STEPS_A_LAP = 40;

// The parade freezes when no beat has come for this long: well past where his next one would have
// been, so a slow beat is not mistaken for stopping, and never so long that stopping goes unseen.
export function freezeAfter(interval) {
    return clamp(interval * 1.7, 0.9, 2.2);
}

// The pace he plays: the time between his last two beats on an instrument, steadied a little by the
// one before, so one uneven tap does not jolt the parade.
export class Tempo {
    constructor() {
        this.last = -Infinity;
        this.interval = FIRST;
    }

    // A beat at time t. Returns the interval to step at.
    beat(t) {
        const gap = t - this.last;
        this.last = t;
        if (gap > SLOWEST * 1.6) this.interval = FIRST;
        else this.interval = clamp(this.interval * 0.35 + gap * 0.65, FASTEST, SLOWEST);
        return this.interval;
    }

    // Whether the parade has stopped, at time t.
    stopped(t) {
        return t - this.last > freezeAfter(this.interval);
    }
}

// How many steps an animal takes on a beat of `instrument` at `interval`: 0 if it does not march
// to it.
export function stepsFor(name, instrument, interval) {
    const walker = WALKERS[name];
    if (!walker || walker.instrument !== instrument) return 0;
    if (walker.tempo === 'slow' && interval < SLOW) return 0;
    if (walker.tempo === 'quick' && interval > QUICK) return 0;
    return walker.steps;
}

// The band's march at Bloom: one note a beat, on the playroom's scale, played on the sheep's horn
// as the parade goes. Two bars that answer each other, and come home to C.
export const MARCH = [3, 3, 4, 3, 2, 0, 2, 3, 4, 4, 5, 4, 3, 2, 1, 0];
