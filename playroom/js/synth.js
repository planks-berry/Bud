// The sound set, synthesised from recipes rather than shipped as recordings.
//
// Every one-shot sound in the playroom is rendered here, once, into a plain Float32Array, and the
// audio engine wraps the result in an AudioBuffer and caches it. Three reasons for doing the work
// in JavaScript rather than as a live graph of oscillators and filters:
//
//   - Cost at play time. A note is one buffer source and one gain node, not five oscillators,
//     five envelopes and a filter. A toddler hitting eight bars with eight fingers is forty-odd
//     nodes on an A7 rather than two hundred.
//   - Control. Modal synthesis (a sum of damped sinusoids, each with its own decay) is the honest
//     model of a struck bar, a bell or a wooden block, and it is a few lines of arithmetic here.
//   - Verifiability. These are pure functions of (sample rate, parameters, seed). The test suite
//     renders every recipe in Node, with no browser and no Web Audio, and checks each one for
//     NaNs, clipping, clicks at either end and DC.
//
// Pitched sounds share one tuning: C major pentatonic, A4 = 440 Hz. Any two notes from any two
// toys are consonant, so nothing a child does can sound wrong.

import { TAU, clamp, rng } from './util.js';

//==============================================================================
// Tuning

const PENTATONIC = [0, 2, 4, 7, 9];

export function midiHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

// Scale degree -> MIDI note. Degree 0 is `base` (C4 by default), 5 is the octave above.
export function pentatonicMidi(degree, base = 60) {
    const octave = Math.floor(degree / 5);
    const step = ((degree % 5) + 5) % 5;
    return base + octave * 12 + PENTATONIC[step];
}

export function noteHz(degree, base = 60) {
    return midiHz(pentatonicMidi(degree, base));
}

//==============================================================================
// Building blocks

function makeBuffer(sr, seconds) {
    // The epsilon matters: 48000 * 0.34 is 16320.000000000002 in floating point, and one sample
    // too many puts the last phase of a half-sine envelope just past PI.
    return new Float32Array(Math.max(1, Math.ceil(sr * seconds - 1e-6)));
}

// A half-sine swell over [0, 1], clamped so rounding can never hand Math.pow a negative base.
function hump(x) {
    return Math.max(0, Math.sin(Math.PI * clamp(x, 0, 1)));
}

// Add one damped sinusoid: amplitude `amp` decaying with time constant `tau` seconds, starting at
// `start` seconds. A recursive oscillator rather than Math.sin per sample: three multiplies, and
// stable over a few seconds in double precision.
function addMode(out, sr, freq, amp, tau, start = 0, phase = 0) {
    const w = (TAU * freq) / sr;
    if (w >= Math.PI * 0.9 || amp === 0) return;

    const c = 2 * Math.cos(w);
    const decay = Math.exp(-1 / (tau * sr));
    let y1 = Math.sin(phase - w);
    let y2 = Math.sin(phase - 2 * w);
    let env = amp;
    const floor = Math.abs(amp) * 1e-5;

    for (let n = Math.floor(start * sr); n < out.length; n++) {
        const y = c * y1 - y2;
        y2 = y1;
        y1 = y;
        out[n] += y * env;
        env *= decay;
        if (env < floor) break;
    }
}

// A sine whose frequency glides exponentially from `f0` towards `f1` with time constant `glide`,
// under an exponential decay. The shape of a water drop, a bubble, a pop and a gulp.
function addSweep(out, sr, f0, f1, glide, amp, tau, start = 0) {
    let phase = 0;
    const n0 = Math.floor(start * sr);
    for (let n = n0; n < out.length; n++) {
        const t = (n - n0) / sr;
        const f = f1 + (f0 - f1) * Math.exp(-t / glide);
        phase += (TAU * f) / sr;
        const env = amp * Math.exp(-t / tau);
        if (env < 1e-5) break;
        out[n] += Math.sin(phase) * env;
    }
}

class OnePole {
    constructor(sr, cutoff) {
        this.sr = sr;
        this.y = 0;
        this.set(cutoff);
    }

    set(cutoff) {
        this.a = 1 - Math.exp((-TAU * cutoff) / this.sr);
    }

    lowpass(x) {
        this.y += this.a * (x - this.y);
        return this.y;
    }

    highpass(x) {
        this.y += this.a * (x - this.y);
        return x - this.y;
    }
}

// RBJ cookbook band-pass, constant 0 dB peak gain.
class BandPass {
    constructor(sr, freq, q) {
        this.sr = sr;
        this.x1 = 0;
        this.x2 = 0;
        this.y1 = 0;
        this.y2 = 0;
        this.set(freq, q);
    }

    set(freq, q) {
        const w0 = (TAU * clamp(freq, 20, this.sr * 0.45)) / this.sr;
        const alpha = Math.sin(w0) / (2 * q);
        const a0 = 1 + alpha;
        this.b0 = alpha / a0;
        this.b2 = -alpha / a0;
        this.a1 = (-2 * Math.cos(w0)) / a0;
        this.a2 = (1 - alpha) / a0;
    }

    process(x) {
        const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
        this.x2 = this.x1;
        this.x1 = x;
        this.y2 = this.y1;
        this.y1 = y;
        return y;
    }
}

// A short burst of filtered noise: the felt of a mallet, the snap of a switch, the scrape of a
// zipper tooth. `shape` > 1 makes the burst die away faster than linearly.
function addBurst(out, sr, next, seconds, amp, filter, start = 0, shape = 2) {
    const n0 = Math.floor(start * sr);
    const count = Math.max(1, Math.floor(seconds * sr));
    for (let i = 0; i < count && n0 + i < out.length; i++) {
        const env = Math.pow(1 - i / count, shape);
        out[n0 + i] += filter(next() * 2 - 1) * amp * env;
    }
}

function fadeIn(out, sr, seconds) {
    const n = Math.min(out.length, Math.max(1, Math.floor(seconds * sr)));
    for (let i = 0; i < n; i++) out[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
}

function fadeOut(out, sr, seconds) {
    const n = Math.min(out.length, Math.max(1, Math.floor(seconds * sr)));
    for (let i = 0; i < n; i++) out[out.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
}

// Trim the inaudible tail, fade the end so nothing stops on a click, remove any DC the recipe left
// behind, and scale to the requested peak. Every recipe ends here, so the guarantees the tests
// check are made in one place.
function finish(out, sr, peak) {
    let last = out.length - 1;
    while (last > 0 && Math.abs(out[last]) < 2e-4) last--;
    const trimmed = out.slice(0, Math.min(out.length, last + Math.ceil(sr * 0.004) + 1));

    // A long ring cut off at its buffer's length is still audible there, and a few milliseconds of
    // fade turns that into a soft chop. Let it die away properly instead.
    let overall = 0;
    let end = 0;
    const tail = Math.max(0, trimmed.length - Math.floor(sr * 0.05));
    for (let i = 0; i < trimmed.length; i++) {
        const v = Math.abs(trimmed[i]);
        overall = Math.max(overall, v);
        if (i >= tail) end = Math.max(end, v);
    }
    if (overall > 0 && end / overall > 0.01) {
        const n = Math.floor(Math.min(0.5 * sr, 0.3 * trimmed.length));
        for (let i = 0; i < n; i++) {
            const x = i / n;
            trimmed[trimmed.length - 1 - i] *= x * x;
        }
    }

    let mean = 0;
    for (let i = 0; i < trimmed.length; i++) mean += trimmed[i];
    mean /= trimmed.length;
    if (Math.abs(mean) > 1e-6) {
        // Remove DC gradually rather than as a step, so the start stays at zero.
        const ramp = Math.min(trimmed.length, Math.ceil(sr * 0.01));
        for (let i = 0; i < trimmed.length; i++) trimmed[i] -= mean * Math.min(1, i / ramp);
    }

    fadeOut(trimmed, sr, 0.006);

    let max = 0;
    for (let i = 0; i < trimmed.length; i++) max = Math.max(max, Math.abs(trimmed[i]));
    if (max > 0) {
        const scale = peak / max;
        for (let i = 0; i < trimmed.length; i++) trimmed[i] *= scale;
    }
    return trimmed;
}

//==============================================================================
// Recipes
//
// Each takes the sample rate and a parameter object and returns a mono Float32Array. Decay times
// lengthen for lower notes, as they do on a real instrument, and upper modes always die faster
// than the fundamental: that ordering is most of what makes a synthetic strike sound struck.

export const recipes = {
    // A rosewood bar over a resonator: fundamental, the tuned 4:1 and 10:1 overtones, and a soft
    // mallet. The resonator is a second, slower copy of the fundamental.
    marimba(sr, p) {
        const f = p.f;
        const next = rng(p.seed || 11);
        const tau = clamp(0.5 * Math.pow(262 / f, 0.55), 0.16, 0.85);
        const out = makeBuffer(sr, Math.min(tau * 6 + 0.06, 2.2));
        addMode(out, sr, f, 0.75, tau);
        addMode(out, sr, f, 0.3, tau * 1.7);
        addMode(out, sr, f * 3.98, 0.2, tau * 0.22);
        addMode(out, sr, f * 9.85, 0.05, tau * 0.07);
        const felt = new OnePole(sr, 2200);
        addBurst(out, sr, next, 0.004, 0.22, (x) => felt.lowpass(x));
        fadeIn(out, sr, 0.0012);
        return finish(out, sr, 0.8);
    },

    // A soft metallophone: the free bar's inharmonic modes, kept quiet so it rings rather than
    // clangs.
    glock(sr, p) {
        const f = p.f;
        const next = rng(p.seed || 12);
        const tau = clamp(1.3 * Math.pow(1047 / f, 0.35), 0.6, 2.0);
        const out = makeBuffer(sr, Math.min(tau * 4.5, 2.6));
        addMode(out, sr, f, 1, tau);
        addMode(out, sr, f * 2.756, 0.17, tau * 0.33);
        addMode(out, sr, f * 5.404, 0.06, tau * 0.13);
        addMode(out, sr, f * 8.933, 0.02, tau * 0.06);
        const tip = new OnePole(sr, 3000);
        addBurst(out, sr, next, 0.0015, 0.05, (x) => tip.highpass(x));
        fadeIn(out, sr, 0.0008);
        return finish(out, sr, 0.75);
    },

    // A small, sweet bell. The pair of nearly equal fundamentals beat slowly against each other,
    // which is the shimmer a real bell has and a pure sine does not.
    chime(sr, p) {
        const f = p.f;
        const tau = clamp(1.7 * Math.pow(523 / f, 0.3), 0.8, 2.4);
        const out = makeBuffer(sr, Math.min(tau * 4, 3.0));
        addMode(out, sr, f, 0.7, tau);
        addMode(out, sr, f * 1.0021, 0.3, tau * 0.9, 0, 1.1);
        addMode(out, sr, f * 2.0, 0.32, tau * 0.6);
        addMode(out, sr, f * 3.0, 0.16, tau * 0.38);
        addMode(out, sr, f * 4.2, 0.08, tau * 0.24);
        addMode(out, sr, f * 5.4, 0.04, tau * 0.16);
        fadeIn(out, sr, 0.0025);
        return finish(out, sr, 0.7);
    },

    // A music-box tine: a plucked steel tongue, bright for an instant and then nearly pure.
    musicBox(sr, p) {
        const f = p.f;
        const next = rng(p.seed || 13);
        const tau = clamp(1.1 * Math.pow(523 / f, 0.4), 0.5, 1.6);
        const out = makeBuffer(sr, Math.min(tau * 3.5, 2.8));
        addMode(out, sr, f, 1, tau);
        addMode(out, sr, f * 2.0, 0.12, tau * 0.4);
        addMode(out, sr, f * 5.95, 0.16, 0.05);
        const pick = new OnePole(sr, 4000);
        addBurst(out, sr, next, 0.0006, 0.12, (x) => pick.highpass(x));
        fadeIn(out, sr, 0.0004);
        return finish(out, sr, 0.7);
    },

    // A drop into still water. What is heard is not the impact but the small bubble it traps,
    // ringing at a pitch that rises as the bubble shrinks: hence the upward sweep.
    drop(sr, p) {
        const f = p.f;
        const next = rng(p.seed || 14);
        const tau = clamp(0.07 * Math.pow(800 / f, 0.5), 0.035, 0.11);
        const out = makeBuffer(sr, 0.34);
        addSweep(out, sr, f * 0.62, f, 0.016, 1, tau);
        addSweep(out, sr, f * 1.2, f * 1.55, 0.008, 0.22, 0.02, 0.04 + next() * 0.02);
        const splash = new OnePole(sr, 2800);
        addBurst(out, sr, next, 0.008, 0.05, (x) => splash.lowpass(x));
        fadeIn(out, sr, 0.001);
        return finish(out, sr, 0.75);
    },

    bubble(sr, p) {
        const f = p.f;
        const out = makeBuffer(sr, 0.12);
        addSweep(out, sr, f * 0.75, f, 0.006, 1, 0.02);
        fadeIn(out, sr, 0.0008);
        return finish(out, sr, 0.5);
    },

    // A block of hard wood, struck: three modes and a crisp contact. Large blocks also thump.
    wood(sr, p) {
        const f = p.f;
        const next = rng(p.seed || 15);
        const tau = clamp(0.11 * Math.pow(300 / f, 0.5), 0.04, 0.2);
        const out = makeBuffer(sr, tau * 6 + 0.04);
        addMode(out, sr, f, 1, tau);
        addMode(out, sr, f * 2.72, 0.3, tau * 0.35);
        addMode(out, sr, f * 4.18, 0.13, tau * 0.18);
        const contact = new OnePole(sr, 3500);
        addBurst(out, sr, next, 0.002, 0.35, (x) => contact.lowpass(x));
        if (f < 330) addSweep(out, sr, 120, 80, 0.015, (0.35 * (330 - f)) / 200, 0.05);
        fadeIn(out, sr, 0.0007);
        return finish(out, sr, 0.8);
    },

    // A toggle switch: the snap of the lever, then the contact settling a few milliseconds later.
    click(sr, p) {
        const next = rng(p.seed || 16);
        const lift = p.variant === 'off' ? 0.88 : 1.12;
        const out = makeBuffer(sr, 0.07);
        const snap = new BandPass(sr, 3200 * lift, 1.2);
        addBurst(out, sr, next, 0.001, 0.9, (x) => snap.process(x));
        addMode(out, sr, 2600 * lift, 0.3, 0.006);
        const settle = new BandPass(sr, 2200 * lift, 1.2);
        addBurst(out, sr, next, 0.0008, 0.5, (x) => settle.process(x), 0.011);
        addMode(out, sr, 1900 * lift, 0.18, 0.005, 0.011);
        fadeIn(out, sr, 0.0003);
        return finish(out, sr, 0.95);
    },

    // A detent: short, pitched, so a turning dial plays the scale.
    tick(sr, p) {
        const next = rng(p.seed || 17);
        const out = makeBuffer(sr, 0.1);
        addMode(out, sr, p.f, 1, 0.018);
        addMode(out, sr, p.f * 2.4, 0.2, 0.006);
        const edge = new OnePole(sr, 3000);
        addBurst(out, sr, next, 0.0006, 0.25, (x) => edge.highpass(x));
        fadeIn(out, sr, 0.0003);
        return finish(out, sr, 0.9);
    },

    pop(sr, p) {
        const f = p.f || 700;
        const next = rng(p.seed || 18);
        const out = makeBuffer(sr, 0.14);
        addSweep(out, sr, f, f * 0.25, 0.025, 1, 0.045);
        const air = new OnePole(sr, 2000);
        addBurst(out, sr, next, 0.003, 0.15, (x) => air.lowpass(x));
        fadeIn(out, sr, 0.001);
        return finish(out, sr, 0.6);
    },

    // Something soft landing on something soft.
    thud(sr, p) {
        const f = p.f || 90;
        const next = rng(p.seed || 19);
        const out = makeBuffer(sr, 0.3);
        addSweep(out, sr, f * 1.35, f, 0.012, 1, 0.07);
        const felt = new OnePole(sr, 500);
        addBurst(out, sr, next, 0.012, 0.6, (x) => felt.lowpass(x));
        fadeIn(out, sr, 0.0015);
        return finish(out, sr, 0.7);
    },

    // Glass on glass: bright, inharmonic and short.
    tink(sr, p) {
        const f = p.f || 2200;
        const next = rng(p.seed || 20);
        const tau = 0.32 * Math.pow(2000 / f, 0.3);
        const out = makeBuffer(sr, tau * 5);
        addMode(out, sr, f, 1, tau);
        addMode(out, sr, f * 2.32, 0.45, tau * 0.6);
        addMode(out, sr, f * 4.25, 0.2, tau * 0.35);
        addMode(out, sr, f * 6.63, 0.08, tau * 0.2);
        const edge = new OnePole(sr, 5000);
        addBurst(out, sr, next, 0.0005, 0.1, (x) => edge.highpass(x));
        fadeIn(out, sr, 0.0004);
        return finish(out, sr, 0.45);
    },

    // A sheet of paper sliding: band-passed noise sweeping upwards under a few irregular swells.
    rustle(sr, p) {
        const next = rng(p.seed || 21);
        const len = 0.45;
        const out = makeBuffer(sr, len);
        const band = new BandPass(sr, 1400, 0.9);
        const swells = [];
        for (let i = 0; i < 4; i++)
            swells.push([0.05 + next() * 0.32, 0.03 + next() * 0.05, 0.5 + next() * 0.5]);
        for (let n = 0; n < out.length; n++) {
            const t = n / sr;
            if ((n & 31) === 0) band.set(1400 + (2400 * t) / len, 0.9);
            let env = 0;
            for (const s of swells) env += s[2] * Math.exp(-Math.pow((t - s[0]) / s[1], 2));
            out[n] = band.process(next() * 2 - 1) * env;
        }
        fadeIn(out, sr, 0.01);
        return finish(out, sr, 0.4);
    },

    // Air moving: the sound of the playroom opening and closing.
    whoosh(sr, p) {
        const next = rng(p.seed || 22);
        const len = 0.5;
        const out = makeBuffer(sr, len);
        const band = new BandPass(sr, 300, 0.8);
        const up = p.variant !== 'down';
        for (let n = 0; n < out.length; n++) {
            const t = n / sr / len;
            if ((n & 31) === 0) band.set(up ? 300 + 1100 * t : 1400 - 1100 * t, 0.8);
            out[n] = band.process(next() * 2 - 1) * Math.pow(hump(t), 1.5);
        }
        return finish(out, sr, 0.3);
    },

    // One tooth of a zipper. A zip is many of these, at a rate set by the finger.
    zip(sr, p) {
        const next = rng(p.seed || 23);
        const out = makeBuffer(sr, 0.03);
        const band = new BandPass(sr, 3800, 1.5);
        addBurst(out, sr, next, 0.0008, 1, (x) => band.process(x));
        addMode(out, sr, 5200 + next() * 400, 0.3, 0.003);
        fadeIn(out, sr, 0.0002);
        return finish(out, sr, 0.9);
    },

    // A wet sponge on a tray.
    squeak(sr, p) {
        const f = p.f || 1400;
        const next = rng(p.seed || 24);
        const out = makeBuffer(sr, 0.13);
        let phase = 0;
        for (let n = 0; n < out.length; n++) {
            const t = n / sr;
            const freq = f * (1 + (0.06 * t) / 0.13) * (1 + 0.05 * Math.sin(TAU * 31 * t));
            phase += (TAU * freq) / sr;
            const env = Math.min(1, t / 0.012) * Math.exp(-t / 0.05);
            out[n] = (Math.sin(phase) + 0.15 * (next() * 2 - 1)) * env;
        }
        return finish(out, sr, 0.35);
    },

    // A liquid bloop: a brush dipped in a pot, a pitcher glugging, a fish swallowing.
    gulp(sr, p) {
        const f = p.f || 330;
        const out = makeBuffer(sr, 0.2);
        addSweep(out, sr, f * 0.7, f * 1.25, 0.03, 1, 0.05);
        fadeIn(out, sr, 0.002);
        return finish(out, sr, 0.6);
    },

    // A small wooden door's hinge: stick-slip, which is an impulse train whose rate climbs as the
    // door speeds up, ringing two body resonances.
    creak(sr, p) {
        const next = rng(p.seed || 25);
        const len = 0.34;
        const out = makeBuffer(sr, len);
        const body = new BandPass(sr, 1100, 6);
        const edge = new BandPass(sr, 2300, 5);
        let until = 0;
        for (let n = 0; n < out.length; n++) {
            const t = n / sr;
            let x = 0;
            if (t >= until) {
                x = 1;
                const rate = 70 + 70 * (t / len);
                until = t + (1 / rate) * (0.85 + next() * 0.3);
            }
            out[n] = (body.process(x) + 0.5 * edge.process(x)) * Math.pow(hump(t / len), 0.8);
        }
        return finish(out, sr, 0.9);
    },

    // A sliding bolt meeting its stop.
    latch(sr, p) {
        const next = rng(p.seed || 26);
        const out = makeBuffer(sr, 0.2);
        addMode(out, sr, 1150, 1, 0.04);
        addMode(out, sr, 2690, 0.4, 0.02);
        addMode(out, sr, 4100, 0.2, 0.01);
        const edge = new OnePole(sr, 2500);
        addBurst(out, sr, next, 0.002, 0.4, (x) => edge.highpass(x));
        fadeIn(out, sr, 0.0003);
        return finish(out, sr, 0.9);
    },

    // A hand patting fabric.
    pat(sr, p) {
        const next = rng(p.seed || 27);
        const out = makeBuffer(sr, 0.12);
        const felt = new OnePole(sr, 700);
        addBurst(out, sr, next, 0.025, 1, (x) => felt.lowpass(x), 0, 3);
        addSweep(out, sr, 180, 140, 0.01, 0.4, 0.03);
        fadeIn(out, sr, 0.001);
        return finish(out, sr, 0.9);
    },
};

// The mix: each recipe's level at a relative gain of 1. Toys say only what they mean (1 for the
// usual, less for a soft variant, an impact's strength for a landing) and the balance between
// a bell, a switch and a zip lives here. Set from a loudness estimate of each sound (RMS of its
// loudest 100 ms, with the extremes of the spectrum discounted, as the ear does), and held to it by
// test.mjs: musical notes near -17 dB, foley near -21, air and paper near -24, single zip teeth,
// which come in streams, near -27.
export const MIX = {
    marimba: 0.39,
    glock: 0.36,
    chime: 0.42,
    musicBox: 0.39,
    drop: 0.5,
    bubble: 0.58,
    wood: 0.55,
    click: 1.0,
    tick: 0.54,
    pop: 0.4,
    thud: 0.6,
    tink: 0.56,
    rustle: 0.76,
    whoosh: 0.75,
    zip: 0.93,
    squeak: 0.7,
    gulp: 0.46,
    creak: 0.72,
    latch: 0.51,
    pat: 0.56,
};

export function render(name, sr, params = {}) {
    const recipe = recipes[name];
    if (!recipe) throw new Error(`no recipe called ${name}`);
    return recipe(sr, params);
}

//==============================================================================
// Loops for continuous textures
//
// The brush, the sand, the pouring water and the pond are not one-shots: they follow a finger
// for as long as it moves. Each is a long loop of noise played through live filters whose gain
// tracks the finger's speed. Noise has no pitch, so the loop point is inaudible.

export function whiteNoise(sr, seconds = 2.5, seed = 31) {
    const next = rng(seed);
    const out = makeBuffer(sr, seconds);
    for (let i = 0; i < out.length; i++) out[i] = next() * 2 - 1;
    return out;
}

// Paul Kellet's economy pink filter: softer than white, closer to wind and water.
export function pinkNoise(sr, seconds = 3, seed = 32) {
    const next = rng(seed);
    const out = makeBuffer(sr, seconds);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < out.length; i++) {
        const white = next() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        out[i] = b0 + b1 + b2 + white * 0.1848;
    }
    let max = 0;
    for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
    for (let i = 0; i < out.length; i++) out[i] *= 0.8 / max;
    return out;
}

// Sand: faint hiss under a crackle of individual grains, each a tiny decaying click. The grains are
// what make it read as sandpaper rather than as wind.
export function sandNoise(sr, seconds = 2.5, seed = 33) {
    const next = rng(seed);
    const out = makeBuffer(sr, seconds);
    const grain = Math.max(2, Math.floor(sr * 0.00025));
    for (let i = 0; i < out.length; i++) out[i] = (next() * 2 - 1) * 0.22;
    const count = Math.floor(seconds * 1100);
    for (let g = 0; g < count; g++) {
        const at = Math.floor(next() * (out.length - grain));
        const amp = Math.pow(next(), 3) * (next() < 0.5 ? -1 : 1);
        for (let k = 0; k < grain; k++) out[at + k] += amp * (1 - k / grain);
    }
    const hp = new OnePole(sr, 600);
    let max = 0;
    for (let i = 0; i < out.length; i++) {
        out[i] = hp.highpass(out[i]);
        max = Math.max(max, Math.abs(out[i]));
    }
    for (let i = 0; i < out.length; i++) out[i] *= 0.8 / max;
    return out;
}

// The room the toys live in: a short, warm reverb tail, darker as it decays, after a pre-delay and
// a handful of early reflections. Two channels decorrelated by seed.
export function impulseResponse(sr, seconds = 1.8, seed = 34) {
    const channels = [];
    for (let c = 0; c < 2; c++) {
        const next = rng(seed + c * 101);
        const out = makeBuffer(sr, seconds);
        const pre = Math.floor(sr * 0.012);
        const tone = new OnePole(sr, 7000);
        for (let n = pre; n < out.length; n++) {
            const t = (n - pre) / sr;
            tone.set(7000 - 5800 * Math.min(1, t / seconds));
            out[n] = tone.lowpass(next() * 2 - 1) * Math.exp((-6.9 * t) / seconds);
        }
        for (let k = 0; k < 6; k++) {
            const at = pre + Math.floor(sr * (0.004 + next() * 0.05));
            if (at < out.length) out[at] += (next() < 0.5 ? -1 : 1) * (0.5 - k * 0.06);
        }
        channels.push(out);
    }
    return channels;
}
