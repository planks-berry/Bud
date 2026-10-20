// Small helpers shared by every scene: maths, easing, springs, seeded randomness and colour.
//
// Everything here is written for Safari 12 (iOS 12.5, the ceiling for an iPad Air 1 or mini 2/3):
// ES2017 syntax and nothing newer, and no API that arrived after it. `test.mjs` parses every file
// at ES2017 and greps for the usual offenders, so a modern habit fails the suite rather than the
// iPad.

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    return Math.sqrt(dx * dx + dy * dy);
}

// Shortest signed difference between two angles, in (-PI, PI].
export function angleDelta(from, to) {
    let d = (to - from) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d <= -Math.PI) d += TAU;
    return d;
}

// Frame-rate independent exponential approach: after one second, `rate` time constants have
// elapsed. Used everywhere something should glide towards a target rather than snap.
export function approach(current, target, rate, dt) {
    return target + (current - target) * Math.exp(-rate * dt);
}

export function easeOutCubic(t) {
    const u = 1 - t;
    return 1 - u * u * u;
}

export function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutBack(t) {
    const c = 1.4;
    const u = t - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
}

export function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
}

// Distance from a point to a segment, for hit-testing strokes and rails.
export function segmentDistance(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    let t = len2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / len2 : 0;
    t = clamp(t, 0, 1);
    return dist(px, py, ax + vx * t, ay + vy * t);
}

//==============================================================================
// Randomness

// mulberry32: small, fast and seedable, so the procedural sounds and textures are the same on
// every run and the tests can render them outside a browser and get identical numbers.
export function rng(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const shared = rng(20261020);

export function random(lo = 0, hi = 1) {
    return lo + (hi - lo) * shared();
}

export function pick(list) {
    return list[Math.floor(shared() * list.length) % list.length];
}

export function shuffle(list, next = shared) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}

//==============================================================================
// Springs

// A damped spring, integrated in fixed substeps so it behaves the same at 30 fps on an old iPad
// as at 60 fps in a test browser. Used for every squash, wobble, bob and press.
export class Spring {
    constructor(value = 0, stiffness = 260, damping = 16) {
        this.value = value;
        this.target = value;
        this.velocity = 0;
        this.stiffness = stiffness;
        this.damping = damping;
    }

    update(dt) {
        const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
            const force = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
            this.velocity += force * h;
            this.value += this.velocity * h;
        }
        if (this.settled()) {
            this.value = this.target;
            this.velocity = 0;
            return false;
        }
        return true;
    }

    settled() {
        return Math.abs(this.value - this.target) < 1e-4 && Math.abs(this.velocity) < 1e-3;
    }

    kick(velocity) {
        this.velocity += velocity;
    }

    set(value) {
        this.value = value;
        this.target = value;
        this.velocity = 0;
    }
}

//==============================================================================
// Colour

export function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbString(rgb, alpha = 1) {
    const r = Math.round(clamp(rgb[0], 0, 255));
    const g = Math.round(clamp(rgb[1], 0, 255));
    const b = Math.round(clamp(rgb[2], 0, 255));
    return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export function mixRgb(a, b, t) {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// A hex colour pushed towards white (t > 0) or towards a warm dark (t < 0). Shading towards a
// warm brown rather than black keeps shadows from going grey and dirty on the soft palette.
export function shade(hex, t) {
    const rgb = hexToRgb(hex);
    const target = t >= 0 ? [255, 252, 246] : [92, 70, 58];
    return rgbString(mixRgb(rgb, target, Math.abs(t)));
}

export function withAlpha(hex, alpha) {
    return rgbString(hexToRgb(hex), alpha);
}

// Paint mixing in red-yellow-blue space, the way a child expects it to work: blue and yellow make
// green, not the grey that averaging RGB gives. The method is Gossett and Chen's, "Paint Inspired
// Color Compositing" (2004): trilinear interpolation inside an RYB cube whose corners are colours.
// Their corners are pure primaries; these are the playroom's own softened ones, so that every mix
// a child can make is already a colour that belongs here.
const RYB_CORNERS = [
    [252, 248, 240], // 000 white
    [226, 128, 122], // 100 red
    [244, 212, 112], // 010 yellow
    [240, 162, 104], // 110 orange
    [112, 158, 210], // 001 blue
    [164, 128, 196], // 101 purple
    [128, 180, 112], // 011 green
    [128, 98, 80], // 111 brown
];

export function rybToRgb(r, y, b) {
    const out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
        const x0 = lerp(
            lerp(RYB_CORNERS[0][c], RYB_CORNERS[1][c], r),
            lerp(RYB_CORNERS[2][c], RYB_CORNERS[3][c], r),
            y
        );
        const x1 = lerp(
            lerp(RYB_CORNERS[4][c], RYB_CORNERS[5][c], r),
            lerp(RYB_CORNERS[6][c], RYB_CORNERS[7][c], r),
            y
        );
        out[c] = lerp(x0, x1, b);
    }
    return out;
}

// A liquid is a pigment load per unit volume, [red, yellow, blue]. Mixing two liquids is a
// volume-weighted average of their loads; the hue comes from the load's proportions and the
// strength from its total, so equal parts yellow and blue make a full green, while yellow and
// clear water make a paler yellow. With no pigment at all it is water: clear, faintly blue.
export function pigmentColour(load) {
    const strength = clamp(load[0] + load[1] + load[2], 0, 1);
    const peak = Math.max(load[0], load[1], load[2]);
    const hue = peak > 1e-6 ? rybToRgb(load[0] / peak, load[1] / peak, load[2] / peak) : RYB_CORNERS[0];
    const water = [214, 236, 240];
    return mixRgb(water, hue, Math.pow(strength, 0.8));
}
