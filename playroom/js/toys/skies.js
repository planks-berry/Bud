// Weather Song's weather: what each instrument brings, how long it stays, how the day goes from
// morning to night, and how the friend feels about all of it. Pure, so the suite can play whole days
// in Node and check them.
//
// Each kind of weather is a level, 0 to 1. A touch of an instrument raises its weather, and from
// then on it passes by itself, halving every so many seconds: a drizzle lingers, sunshine a little
// longer, thunder rolls away quickly. Every mood is allowed, and every mood passes.

export const STAGES = [
    // Seed: sunny and sleepy. The rain-stick and three bells.
    { bells: 3, drum: false, fog: false, rainbow: false, strip: false },
    // Sprout: and cross, and calm after. The big drum's thunder.
    { bells: 5, drum: true, fog: false, rainbow: false, strip: false },
    // Bloom: and shy in the fog, and proud of a rainbow after rain; the day painted as a strip.
    { bells: 5, drum: true, fog: true, rainbow: true, strip: true },
];

// What one touch of each instrument adds.
export const ADD = { rain: 0.42, sun: 0.26, storm: 0.38 };
// Seconds for each kind of weather to halve once he stops.
export const HALF = { rain: 5, sun: 6, storm: 2.2, rainbow: 5, fog: 0.8 };
// Above this much thunder the friend is cross; when it has passed, it is calm for a while, a sigh
// and then a smile, before the weather's own mood comes back.
export const CROSS = 0.3;
export const CALM = 3;
// Sunshine while it is still raining makes a rainbow, at Bloom.
export const RAINBOW_SUN = 0.35;
export const RAINBOW_RAIN = 0.2;
// At Bloom, after this many seconds of quiet the fog comes in, over this many.
export const FOG_AFTER = 9;
export const FOG_IN = 4;
// The day: seconds from morning to night, and where in it evening and night begin.
export const DAY = 160;
export const EVENING = 0.76;
export const NIGHT = 0.88;
// How many pieces the day's strip of sky is painted in.
export const STRIP = 80;

const halve = (level, half, dt) => level * Math.pow(0.5, dt / half);

export class Weather {
    constructor(level) {
        this.stage = STAGES[level];
        this.rain = 0;
        this.sun = 0;
        this.storm = 0;
        this.fog = 0;
        this.rainbow = 0;
        this.day = 0;
        this.time = 0;
        this.quiet = 0;
        this.wasCross = false;
        this.calmUntil = -1;
        // What the sky was like through the day so far: one entry a piece of the strip.
        this.strip = [];
        // What has just happened, for the game to show and sound: cleared each step.
        this.events = [];
    }

    // A touch of an instrument: 'rain', 'sun' or 'storm'.
    play(kind) {
        this.quiet = 0;
        if (kind === 'rain') this.rain = Math.min(1, this.rain + ADD.rain);
        else if (kind === 'sun') {
            this.sun = Math.min(1, this.sun + ADD.sun);
            // The sun burns the last of a storm off a little sooner.
            this.storm *= 0.85;
        } else if (kind === 'storm' && this.stage.drum) {
            this.storm = Math.min(1, this.storm + ADD.storm);
            // Thunderclouds cover the sun.
            this.sun *= 0.7;
        }
    }

    // A new day, from morning.
    dawn() {
        this.day = 0;
        this.strip = [];
        this.events.push('dawn');
    }

    over() {
        return this.day >= 1;
    }

    step(dt) {
        this.events = [];
        this.time += dt;
        this.quiet += dt;
        const before = this.day;
        this.day = Math.min(1, this.day + dt / DAY);
        if (before < NIGHT && this.day >= NIGHT) this.events.push('night');
        this.rain = halve(this.rain, HALF.rain, dt);
        this.sun = halve(this.sun, HALF.sun, dt);
        this.storm = halve(this.storm, HALF.storm, dt);

        if (this.stage.rainbow) {
            const had = this.rainbow > 0.15;
            if (this.sun >= RAINBOW_SUN && this.rain >= RAINBOW_RAIN && this.day < NIGHT) {
                if (!had) this.events.push('rainbow');
                this.rainbow = 1;
            } else this.rainbow = halve(this.rainbow, HALF.rainbow, dt);
        }
        if (this.stage.fog) {
            if (this.quiet > FOG_AFTER && this.day < NIGHT) this.fog = Math.min(1, this.fog + dt / FOG_IN);
            else this.fog = halve(this.fog, HALF.fog, dt);
        }

        // The storm passes: a calm while it settles.
        if (this.storm > CROSS) this.wasCross = true;
        else if (this.wasCross) {
            this.wasCross = false;
            this.calmUntil = this.time + CALM;
            this.events.push('calm');
        }

        if (this.stage.strip) {
            const piece = Math.min(STRIP - 1, Math.floor(this.day * STRIP));
            while (this.strip.length <= piece) this.strip.push(this.kind());
            this.strip[piece] = this.kind();
        }
    }

    // The weather that shows most now: what a piece of the strip is painted.
    kind() {
        if (this.storm > CROSS) return 'storm';
        if (this.rainbow > 0.15) return 'rainbow';
        if (this.rain > 0.2 && this.rain >= this.sun) return 'rain';
        if (this.sun > 0.2) return 'sun';
        if (this.fog > 0.5) return 'fog';
        return this.day >= NIGHT ? 'night' : this.day >= EVENING ? 'evening' : 'clear';
    }

    // How the friend feels about it.
    mood() {
        if (this.storm > CROSS) return 'cross';
        if (this.time < this.calmUntil) return 'calm';
        if (this.day >= NIGHT) return this.day >= NIGHT + 0.04 ? 'asleep' : 'sleepy';
        if (this.rainbow > 0.15) return 'proud';
        if (this.sun > 0.3 && this.sun >= this.rain) return 'happy';
        if (this.rain > 0.2) return 'sleepy';
        if (this.fog > 0.5) return 'shy';
        if (this.day >= EVENING + 0.06) return 'sleepy';
        return 'content';
    }

    // Is anything still happening in the sky?
    // Below a twentieth there is nothing to see: the last drops have stopped.
    settled() {
        const faint = 0.05;
        return (
            this.rain < faint &&
            this.sun < faint &&
            this.storm < faint &&
            this.rainbow < faint &&
            this.fog < faint
        );
    }
}
