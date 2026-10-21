// The crane: a tower crane on a building site, a pile of parts, and open ground to build on.
//
// After the colour tower, with a tool in between. A child of three can carry a block with a finger;
// lifting it with a crane is the same work done at a distance, through a hook that swings. So the
// hook goes wherever the finger takes it: the trolley runs along the jib after it and the cable
// winds to its height. Lowered onto a part, the hook takes it; let go, the part drops and settles
// on whatever is under it. Parts snap to a grid of half-blocks as they land, so a stack stands
// and a row is a row, and there is no physics to fight: a part rests on the highest thing beneath
// it, and when something is taken from under it, it drops. A child who does not get on with the
// hook can carry a part straight to where it should go, and the hook comes along with it.
//
// Nothing is correct. A building is whatever stands, and whatever stands comes alive: windows
// light at night, a cat moves into one, plants appear on the ledges, and a bird comes to nest on
// the very top. Each part sounds its colour's note, the note it has as a paint on the easel, and a
// tap on the ground at a building's foot plays it from the bottom up, each part lit as it sounds.
// Landing, a part clanks a step of the scale higher for every half-block it stands above the
// ground, so a building going up rings up the scale.
//
//   touch  - tap a part for its note, the ground for the whole building, the cab for the horn, the
//            hook to set it swinging; the sun in the corner for the night.
//   move   - drag the hook: it follows, takes what it is lowered onto, and drops it where it is let
//            go. Or carry a part by hand, and the crane follows that.
//   make   - a building of any shape, which moves in by itself; and at Bloom, arches, roofs, and a
//            wrecking ball to knock it all down again.

import { Scene } from '../stage.js';
import { makeLayer, freeLayer, grain, fillRound, disc, ellipse, woodPanel, PALETTE } from '../draw.js';
import {
    Spring,
    clamp,
    lerp,
    dist,
    approach,
    segmentDistance,
    rgbString,
    hexToRgb,
    mixRgb,
} from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { SITE } from './machines.js';
import { COLOURS } from './cubes.js';
import * as art from './craneart.js';
import { bird, cat, sun, moon } from './farmart.js';

// The shapes, in half-blocks of the grid: how many columns wide, how tall, and for each column
// how high its underside sits (an arch stands on its feet) and how high its top is (a roof slopes).
const KINDS = {
    block: { cols: 2, rows: 2, bottom: [0, 0], top: [2, 2] },
    window: { cols: 2, rows: 2, bottom: [0, 0], top: [2, 2] },
    beam: { cols: 4, rows: 1, bottom: [0, 0, 0, 0], top: [1, 1, 1, 1] },
    arch: { cols: 4, rows: 2, bottom: [0, art.OPENING, art.OPENING, 0], top: [2, 2, 2, 2] },
    roof: { cols: 4, rows: 1.5, bottom: [0, 0, 0, 0], top: [0.55, 1.15, 1.15, 0.55] },
    ball: { cols: 2, rows: 1.9, bottom: [0, 0], top: [1.9, 1.9] },
};

// What each stage puts out, as a pile on the ground by the crane: each part dropped in turn at a
// column of the pile, landing on whatever is already there. `narrow` is the same parts in fewer
// columns, for a screen held upright.
const PLANS = [
    {
        grid: 46,
        pile: [
            ['block', 'red', 0],
            ['block', 'yellow', 2],
            ['block', 'blue', 4],
            ['block', 'green', 6],
        ],
        narrow: [
            ['block', 'red', 0],
            ['block', 'yellow', 2],
            ['block', 'blue', 0],
            ['block', 'green', 2],
        ],
    },
    {
        grid: 34,
        pile: [
            ['beam', 'blue', 0],
            ['beam', 'yellow', 4],
            ['block', 'red', 0],
            ['window', 'purple', 2],
            ['block', 'green', 4],
            ['block', 'yellow', 6],
            ['window', 'blue', 1],
            ['block', 'red', 5],
        ],
    },
    {
        grid: 32,
        ball: true,
        pile: [
            ['beam', 'blue', 0],
            ['beam', 'yellow', 4],
            ['arch', 'green', 8],
            ['block', 'red', 0],
            ['window', 'purple', 2],
            ['block', 'green', 4],
            ['block', 'yellow', 6],
            ['window', 'blue', 8],
            ['block', 'red', 10],
            ['roof', 'red', 4],
        ],
        narrow: [
            ['beam', 'blue', 0],
            ['beam', 'yellow', 4],
            ['block', 'red', 0],
            ['window', 'purple', 2],
            ['block', 'green', 4],
            ['block', 'yellow', 6],
            ['window', 'blue', 0],
            ['arch', 'green', 2],
            ['block', 'red', 6],
            ['roof', 'red', 2],
        ],
    },
];

const TINT = {};
for (const kind of COLOURS) TINT[kind.name] = kind;

// The time between two parts of a building playing, and how long one stays lit, in seconds.
const STEP = 0.2;
const GLOW = 0.7;

class CraneScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.plan = PLANS[this.level];
        this.rand = Math.random;
        this.time = 0;
        this.queue = [];
        this.fx = [];
        this.sequence = [];
        this.bands = [];
        this.pointers = new Set();
        this.sprites = {};
        this.bg = null;
        this.night = 0;
        this.nightTarget = 0;
        this.sunPress = new Spring(0, 420, 18);
        this.cabWave = 0;
        this.winch = new audio.Motor('winch');
        this.winchLevel = 0;
        this.lastLanding = null;
        this.lifeAt = Infinity;
        // A fresh site every time it comes off the shelf, and which hidden things have shown
        // themselves this time out.
        this.found = new Set();
        this.parts = null;
        this.bird = null;
        this.cat = null;
        this.walker = null;
        this.plants = [];
        this.hook = {
            tx: 0,
            L: 0,
            targetX: 0,
            targetL: 0,
            vx: 0,
            theta: 0.1,
            omega: 0,
            carrying: null,
            direct: false,
            owner: null,
            cooldown: 0,
            ignore: null,
            hop: new Spring(0, 260, 9),
        };
        this.placed = false;
    }

    //--------------------------------------------------------------------------
    // Layout

    layout() {
        freeLayer(this.bg);
        this.freeSprites();
        const { w, h, u } = this;
        const tall = h > w;
        this.ground = h - (tall ? 118 : 84) * u;
        this.jibD = 22 * u;
        this.jibY = (tall ? 200 : 150) * u;
        this.apexY = this.jibY - this.jibD - (tall ? 76 : 62) * u;
        this.mastW = 30 * u;
        this.mastX = Math.max(100 * u, w * 0.1);
        this.jibEnd = w - 24 * u;
        this.counterEnd = Math.max(14 * u, this.mastX - 104 * u);
        this.cab = { x: this.mastX + this.mastW * 0.5 - 2 * u, y: this.jibY + 6 * u, w: 54 * u, h: 46 * u };
        this.trolleyS = 40 * u;
        this.hookS = 40 * u;
        this.ty = this.jibY + this.trolleyS * 0.42;
        this.txMin = this.cab.x + this.cab.w + 24 * u;
        this.txMax = this.jibEnd - 30 * u;
        this.sling = 0.34 * 34 * u;
        this.gravity = 2600 * u;
        this.swingG = 4600 * u;
        this.sunButton = { x: w - 48, y: 48, r: 30 };

        // The grid: half-blocks along the ground, from beside the mast to the far end. Upright,
        // the pile is stacked higher if a wide one would leave too little ground to build on.
        this.x0 = this.mastX + this.mastW * 1.25 + 8 * u;
        const right = w - 22 * u;
        let pile = this.plan.pile;
        let g = this.plan.grid * u;
        const span = (list) => list.reduce((m, [kind, , col]) => Math.max(m, col + KINDS[kind].cols), 0);
        if (this.plan.narrow && Math.floor((right - this.x0) / g) - span(pile) < 10) pile = this.plan.narrow;
        const wanted = span(pile) + 8 + (this.plan.ball ? 2 : 0);
        g = Math.min(g, (right - this.x0) / wanted);
        this.g = g;
        this.ncols = Math.floor((right - this.x0) / g);
        this.pileCols = span(pile);

        if (!this.placed) this.makeParts(pile);
        else this.reseat();
        this.placed = true;

        const hk = this.hook;
        if (!hk.tx) {
            hk.tx = clamp(this.x0 + (this.pileCols + 3) * g, this.txMin, this.txMax);
            hk.L = (this.ground - this.ty) * 0.42;
        }
        hk.tx = clamp(hk.tx, this.txMin, this.txMax);
        hk.L = clamp(hk.L, this.minL(), this.ground - this.ty - this.hookS);
        hk.targetX = hk.tx;
        hk.targetL = hk.L;
        this.drawBackground();
    }

    makeParts(pile) {
        this.parts = [];
        const tops = new Array(this.ncols).fill(0);
        let id = 0;
        for (const [kind, name, col] of pile) {
            const p = this.makePart(id++, kind, name, col);
            p.y = this.ground - this.baseFor(p, col, tops);
            p.x = this.centreOf(col, p);
            this.addTops(p, tops);
            this.parts.push(p);
        }
        if (this.plan.ball) {
            const p = this.makePart(id++, 'ball', null, this.ncols - 2);
            p.y = this.ground - this.baseFor(p, p.col, tops);
            p.x = this.centreOf(p.col, p);
            this.parts.push(p);
        }
    }

    makePart(id, kind, name, col) {
        const shape = KINDS[kind];
        const tint = name ? TINT[name] : null;
        return {
            id,
            kind,
            name,
            colour: tint ? tint.colour : '#A79C92',
            degree: tint ? tint.degree : 0,
            col,
            home: col,
            cols: shape.cols,
            rows: shape.rows,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            angle: 0,
            spin: 0,
            tilt: 0,
            wait: 0,
            flight: null,
            state: 'rest',
            glow: 0,
            squash: new Spring(0, 520, 14),
            wobble: new Spring(0, 220, 7),
        };
    }

    // A new size of screen: everything at rest goes back onto the grid, from the ground up, keeping
    // its column; anything in the air drops.
    reseat() {
        for (const p of this.parts) {
            p.col = clamp(p.col, 0, this.ncols - p.cols);
            p.x = this.centreOf(p.col, p);
            if (p.state !== 'rest') {
                p.state = 'fall';
                p.flight = null;
                p.y = Math.min(p.y, this.ground);
            }
        }
        const hk = this.hook;
        hk.carrying = null;
        hk.direct = false;
        hk.owner = null;
        const order = this.parts.slice().sort((a, b) => b.y - a.y);
        const tops = new Array(this.ncols).fill(0);
        for (const p of order) {
            if (p.state !== 'rest') continue;
            p.y = this.ground - this.baseFor(p, p.col, tops);
            this.addTops(p, tops);
        }
    }

    minL() {
        return 16 * this.u;
    }

    drawBackground() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, this.ground);
        sky.addColorStop(0, SITE.sky);
        sky.addColorStop(1, SITE.skyLow);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // Clouds, and far off, the roofs of the town the building will join.
        for (const [cx, cy, s] of [
            [0.42, 0.3, 1],
            [0.78, 0.22, 0.8],
            [0.62, 0.48, 0.6],
        ]) {
            const x = w * cx;
            const y = this.jibY + (this.ground - this.jibY) * cy;
            for (const [dx, dy, r] of [
                [-34, 6, 22],
                [0, 0, 30],
                [32, 8, 20],
                [12, 14, 22],
            ]) {
                disc(ctx, x + dx * s * u, y + dy * s * u, r * s * u, 'rgba(255, 255, 255, 0.7)');
            }
        }
        ctx.fillStyle = 'rgba(181, 170, 196, 0.32)';
        let x = this.x0 + this.g * 4;
        let i = 0;
        while (x < w) {
            const bw = (56 + ((i * 37) % 40)) * u;
            const bh = (40 + ((i * 53) % 70)) * u;
            fillRound(ctx, x, this.ground - bh, bw - 6 * u, bh + 10 * u, 6 * u, 'rgba(181, 170, 196, 0.28)');
            x += bw;
            i++;
        }

        // The ground: packed sand, and a concrete slab to build on beyond the pile.
        fillRound(ctx, -10, this.ground - 4 * u, w + 20, h - this.ground + 20, 10 * u, SITE.sandDeep);
        ctx.fillStyle = SITE.sand;
        ctx.fillRect(0, this.ground - 4 * u, w, 10 * u);
        const slabX = this.x0 + (this.pileCols + 0.5) * this.g;
        fillRound(ctx, slabX, this.ground - 2 * u, w - slabX - 10 * u, 16 * u, 6 * u, SITE.concreteDeep);
        fillRound(ctx, slabX, this.ground - 4 * u, w - slabX - 10 * u, 12 * u, 6 * u, SITE.concrete);
        // A pallet under the pile.
        woodPanel(
            ctx,
            this.x0 - 4 * u,
            this.ground - 3 * u,
            this.pileCols * this.g + 8 * u,
            12 * u,
            4 * u,
            PALETTE.wood,
            7,
            this.scale
        );
        grain(ctx, 0, this.ground, w, h - this.ground, 0.35, this.scale);

        art.crane(ctx, this);
        this.bg = layer;
    }

    //--------------------------------------------------------------------------
    // The grid

    colX(col) {
        return this.x0 + col * this.g;
    }

    centreOf(col, p) {
        return this.x0 + (col + p.cols / 2) * this.g;
    }

    width(p) {
        return p.cols * this.g;
    }

    height(p) {
        return p.rows * this.g;
    }

    snapCol(p) {
        return clamp(Math.round((p.x - this.x0) / this.g - p.cols / 2), 0, this.ncols - p.cols);
    }

    addTops(p, tops) {
        const shape = KINDS[p.kind];
        const base = this.ground - p.y;
        for (let i = 0; i < shape.cols; i++) {
            const c = p.col + i;
            if (c >= 0 && c < tops.length) tops[c] = Math.max(tops[c], base + shape.top[i] * this.g);
        }
    }

    // How high `p` stands with its left edge at `col`: on the highest thing under any of its
    // columns, allowing for an arch's opening.
    baseFor(p, col, tops) {
        const shape = KINDS[p.kind];
        let base = 0;
        for (let i = 0; i < shape.cols; i++) {
            const c = col + i;
            if (c < 0 || c >= tops.length) continue;
            base = Math.max(base, tops[c] - shape.bottom[i] * this.g);
        }
        return base;
    }

    tops(except = null) {
        const tops = new Array(this.ncols).fill(0);
        for (const p of this.parts) if (p.state === 'rest' && p !== except) this.addTops(p, tops);
        return tops;
    }

    // The highest top under the span [a, b] of the screen.
    topUnder(a, b, tops) {
        let top = 0;
        const c0 = Math.max(0, Math.floor((a - this.x0) / this.g));
        const c1 = Math.min(this.ncols - 1, Math.floor((b - this.x0 - 0.01) / this.g));
        for (let c = c0; c <= c1; c++) top = Math.max(top, tops[c]);
        return top;
    }

    // The height of a part's top surface above the ground at screen x: flat, or a roof's slope.
    surfaceAt(p, x) {
        const shape = KINDS[p.kind];
        const base = this.ground - p.y;
        if (p.kind === 'roof') {
            const half = this.width(p) / 2;
            const k = clamp(1 - Math.abs(x - p.x) / half, 0, 1);
            return base + this.height(p) * (0.15 + 0.85 * k);
        }
        return base + shape.rows * this.g;
    }

    // Everything at rest, from the ground up, onto whatever is under it now: whatever has lost what
    // it stood on, drops.
    settle() {
        const resting = this.parts.filter((p) => p.state === 'rest').sort((a, b) => b.y - a.y || a.x - b.x);
        const tops = new Array(this.ncols).fill(0);
        for (const p of resting) {
            const rest = this.ground - this.baseFor(p, p.col, tops);
            if (p.y < rest - 0.5) {
                p.state = 'fall';
                p.vy = 0;
                continue;
            }
            p.y = rest;
            this.addTops(p, tops);
        }
    }

    //--------------------------------------------------------------------------
    // The hook

    hookTip() {
        const hk = this.hook;
        const len = hk.L + art.hookDrop(this.hookS);
        return { x: hk.tx + Math.sin(hk.theta) * len, y: this.ty + Math.cos(hk.theta) * len };
    }

    // The most the cable may pay out: the hook, or what hangs from it, stops on whatever is under it.
    maxL(tops) {
        const hk = this.hook;
        const tip = this.hookTip();
        const drop = art.hookDrop(this.hookS);
        const p = hk.carrying;
        let floor;
        if (p && !hk.direct) {
            const half = this.width(p) / 2;
            floor =
                this.ground - this.topUnder(tip.x - half, tip.x + half, tops) - this.height(p) - this.sling;
        } else {
            floor = this.ground - this.topUnder(tip.x - this.g * 0.3, tip.x + this.g * 0.3, tops);
        }
        return Math.max(this.minL(), floor - this.ty - drop);
    }

    // Where a load hangs from the hook: its centre, and its bottom.
    hang(p) {
        const tip = this.hookTip();
        const s = Math.sin(this.hook.theta);
        const c = Math.cos(this.hook.theta);
        const down = this.sling + this.height(p) / 2;
        return { x: tip.x + s * down, y: tip.y + c * this.sling + this.height(p) };
    }

    stepHook(dt, tops) {
        const hk = this.hook;
        const u = this.u;
        const p = hk.carrying;
        if (hk.cooldown > 0) hk.cooldown -= dt;

        if (p && hk.direct) {
            // A part carried by hand: the crane follows it, cable straight down to its slings.
            hk.targetX = clamp(p.x, this.txMin, this.txMax);
            hk.targetL = clamp(
                p.y - this.height(p) - this.sling - art.hookDrop(this.hookS) - this.ty,
                this.minL(),
                this.ground
            );
        }
        const lowest = this.maxL(tops);
        const wantL = clamp(hk.targetL, this.minL(), lowest);
        const before = hk.tx;
        const beforeL = hk.L;
        hk.tx = approach(hk.tx, clamp(hk.targetX, this.txMin, this.txMax), 10, dt);
        hk.L = approach(hk.L, wantL, 9, dt);
        if (hk.L > lowest) hk.L = lowest;
        const vx = (hk.tx - before) / dt;
        const accel = clamp((vx - hk.vx) / dt, -3200 * u, 3200 * u);
        hk.vx = vx;

        if (hk.direct) {
            hk.theta = approach(hk.theta, 0, 12, dt);
            hk.omega = 0;
        } else {
            const ball = p && p.kind === 'ball';
            const len = hk.L + art.hookDrop(this.hookS) + (p ? this.sling + this.height(p) * 0.5 : 0);
            const damping = ball ? 0.6 : p ? 2.6 : 2.2;
            const limit = ball ? 0.9 : 0.45;
            const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
            const h = dt / steps;
            for (let i = 0; i < steps; i++) {
                const alpha =
                    (-this.swingG / len) * Math.sin(hk.theta) -
                    (accel / len) * Math.cos(hk.theta) -
                    damping * hk.omega;
                hk.omega += alpha * h;
                hk.theta += hk.omega * h;
            }
            if (Math.abs(hk.theta) > limit) {
                hk.theta = Math.sign(hk.theta) * limit;
                hk.omega *= -0.3;
            }
        }
        hk.hop.update(dt);

        // The winch sings as it winds, a step of the scale for each stretch of cable, and is quiet
        // when the hook is still.
        const speed = Math.abs(hk.L - beforeL) / dt + 0.6 * Math.abs(vx);
        const target = clamp(speed / (380 * u), 0, 1);
        this.winchLevel = approach(this.winchLevel, target, target > this.winchLevel ? 20 : 9, dt);
        if (target === 0 && this.winchLevel < 0.01) this.winchLevel = 0;
        const reach = (hk.L - this.minL()) / Math.max(1, this.ground - this.ty - this.minL());
        const degree = clamp(Math.round((1 - reach) * 7), 0, 7);
        this.winch.set(this.winchLevel * 0.9, noteHz(degree, 48));

        if (p && !hk.direct) {
            const at = this.hang(p);
            p.x = at.x;
            p.y = at.y;
            p.tilt = hk.theta;
        }
        if (!p && hk.cooldown <= 0) this.tryCatch(tops);
        if (p && p.kind === 'ball' && !hk.direct) this.wreck(dt);

        return (
            Math.abs(hk.tx - hk.targetX) > 0.3 ||
            Math.abs(hk.L - wantL) > 0.3 ||
            Math.abs(hk.theta) > 0.002 ||
            Math.abs(hk.omega) > 0.004 ||
            this.winchLevel > 0
        );
    }

    // Lowered onto a part, the empty hook takes it.
    tryCatch(tops) {
        const hk = this.hook;
        const tip = this.hookTip();
        if (hk.ignore) {
            const p = hk.ignore;
            if (p.state !== 'rest' || tip.y < this.ground - this.surfaceAt(p, tip.x) - this.g * 0.6)
                hk.ignore = null;
            else if (Math.abs(tip.x - p.x) > this.width(p) / 2) hk.ignore = null;
        }
        let best = null;
        let bestTop = Infinity;
        for (const p of this.parts) {
            if (p.state !== 'rest' || p === hk.ignore) continue;
            const half = this.width(p) / 2 - this.g * 0.12;
            if (tip.x < p.x - half || tip.x > p.x + half) continue;
            const top = this.ground - this.surfaceAt(p, tip.x);
            if (tip.y < top - 5 * this.u || tip.y > top + this.g * 0.6) continue;
            if (top < bestTop) {
                best = p;
                bestTop = top;
            }
        }
        if (!best) return;
        // Only the uppermost thing there: the hook never reaches through one part to another.
        if (this.topUnder(tip.x - 1, tip.x + 1, tops) > this.ground - bestTop + 1) return;
        this.take(best, false);
        audio.play('latch', {}, { gain: 0.5, pan: this.pan(best.x) });
        audio.play('rattle', {}, { gain: 0.55, pan: this.pan(best.x), delay: 0.05 });
    }

    // The hook takes `p`, from the hook (`direct` false) or because a finger has it.
    take(p, direct) {
        const hk = this.hook;
        p.state = direct ? 'held' : 'hooked';
        p.flight = null;
        hk.carrying = p;
        hk.direct = direct;
        hk.ignore = null;
        p.squash.kick(3);
        this.settle();
        this.lifeAt = this.time + 0.6;
    }

    // Let go of whatever the hook carries: it drops, straight down onto the grid.
    release() {
        const hk = this.hook;
        const p = hk.carrying;
        if (!p) return;
        hk.carrying = null;
        hk.direct = false;
        hk.cooldown = 0.45;
        hk.ignore = p;
        hk.hop.kick(-140);
        p.state = 'fall';
        p.vy = 0;
        p.col = this.snapCol(p);
        audio.play('hiss', {}, { gain: 0.45, pan: this.pan(p.x) });
    }

    // Swung into a building, the ball knocks over what it hits and everything resting on that.
    wreck(dt) {
        const ball = this.hook.carrying;
        const prev = ball.prev || { x: ball.x, y: ball.y };
        const vx = (ball.x - prev.x) / dt;
        const vy = (ball.y - prev.y) / dt;
        ball.prev = { x: ball.x, y: ball.y };
        const speed = Math.sqrt(vx * vx + vy * vy);
        const r = art.ballRadius(this.height(ball));
        const cx = ball.x;
        const cy = ball.y - r;
        for (const p of this.parts) {
            if (p === ball || p.state !== 'rest') continue;
            const left = p.x - this.width(p) / 2;
            const top = p.y - this.height(p);
            const nx = clamp(cx, left, left + this.width(p));
            const ny = clamp(cy, top, p.y);
            if (dist(cx, cy, nx, ny) > r) continue;
            if (speed > 70 * this.u) this.knock(p, vx >= 0 ? 1 : -1, speed);
            else p.wobble.kick(2);
        }
    }

    knock(hit, dir, speed) {
        const u = this.u;
        const down = [hit];
        // Everything above what was hit comes down with it.
        let grew = true;
        while (grew) {
            grew = false;
            for (const p of this.parts) {
                if (p.state !== 'rest' || p.kind === 'ball' || down.indexOf(p) >= 0) continue;
                const base = this.ground - p.y;
                for (const q of down) {
                    const over = p.col < q.col + q.cols && q.col < p.col + p.cols;
                    if (over && base >= this.ground - q.y + 1) {
                        down.push(p);
                        grew = true;
                        break;
                    }
                }
            }
        }
        const push = clamp(speed / (600 * u), 0.6, 1.5);
        down.forEach((p, i) => {
            p.state = 'tumble';
            p.vx = dir * (140 + 220 * this.rand()) * u * push;
            p.vy = -(180 + 200 * this.rand() + i * 30) * u;
            p.spin = dir * (2 + 3 * this.rand());
            p.wait = 0;
        });
        this.hook.omega *= -0.35;
        audio.play('thud', { f: 85 }, { gain: 0.9, pan: this.pan(hit.x) });
        audio.play('crunch', {}, { gain: 0.7, pan: this.pan(hit.x), delay: 0.03 });
        audio.play('rattle', {}, { gain: 0.5, pan: this.pan(hit.x), delay: 0.08 });
        for (let i = 0; i < 4; i++)
            this.puff(hit.x + (this.rand() - 0.5) * this.width(hit), hit.y - this.height(hit) / 2, 1);
        this.settle();
        this.lifeAt = this.time + 0.6;
    }

    //--------------------------------------------------------------------------
    // Parts on the move

    stepParts(dt, tops) {
        const u = this.u;
        let busy = false;
        const falling = this.parts.filter((p) => p.state === 'fall').sort((a, b) => b.y - a.y);
        for (const p of falling) {
            busy = true;
            p.vy += this.gravity * dt;
            p.y += p.vy * dt;
            const x = this.centreOf(p.col, p);
            p.x = approach(p.x, x, 18, dt);
            p.tilt = approach(p.tilt, 0, 10, dt);
            const rest = this.ground - this.baseFor(p, p.col, tops);
            if (p.y >= rest) {
                // Dropped from high onto a building, the ball goes through it.
                if (p.kind === 'ball' && rest < this.ground - 1 && p.vy > 500 * u) {
                    const under = this.parts.filter(
                        (q) =>
                            q.state === 'rest' && q !== p && q.col < p.col + p.cols && p.col < q.col + q.cols
                    );
                    if (under.length) {
                        under.sort((a, b) => a.y - b.y);
                        this.knock(under[0], this.rand() < 0.5 ? -1 : 1, p.vy);
                        tops = this.tops();
                        continue;
                    }
                }
                p.y = rest;
                p.x = x;
                p.tilt = 0;
                p.state = 'rest';
                this.land(p, p.vy);
                p.vy = 0;
                this.addTops(p, tops);
            }
        }

        for (const p of this.parts) {
            if (p.state === 'tumble') {
                busy = true;
                p.vy += this.gravity * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.angle += p.spin * dt;
                const half = this.width(p) / 2;
                if (p.x - half < this.x0 - this.g) {
                    p.x = this.x0 - this.g + half;
                    p.vx = Math.abs(p.vx) * 0.4;
                } else if (p.x + half > this.w - 6 * u) {
                    p.x = this.w - 6 * u - half;
                    p.vx = -Math.abs(p.vx) * 0.4;
                }
                if (p.y >= this.ground) {
                    p.y = this.ground;
                    if (p.vy > 220 * u) {
                        audio.play(
                            'thud',
                            { f: 110 },
                            { gain: clamp(p.vy / (1400 * u), 0.2, 0.6), pan: this.pan(p.x) }
                        );
                        this.puff(p.x, this.ground, 0.7);
                        p.vy = -p.vy * 0.32;
                        p.vx *= 0.6;
                        p.spin *= 0.5;
                    } else {
                        p.vy = 0;
                        p.vx = 0;
                        p.spin = 0;
                        p.state = 'scatter';
                        p.wait = 0.5 + this.rand() * 0.4;
                    }
                }
            } else if (p.state === 'scatter') {
                busy = true;
                // Back on its feet, then home to the pile, a hop at a time from first to last down.
                p.angle = approach(p.angle, Math.round(p.angle / Math.PI) * Math.PI, 8, dt);
                p.wait -= dt;
                if (p.wait <= 0) this.sendHome(p, tops);
            } else if (p.state === 'return') {
                busy = true;
                const f = p.flight;
                f.t += dt;
                const k = clamp(f.t / f.time, 0, 1);
                p.x = lerp(f.x0, f.x1, k);
                p.y = lerp(f.y0, f.y1, k) - f.arc * 4 * k * (1 - k);
                p.angle = lerp(f.a0, 0, k);
                if (k >= 1) {
                    p.angle = 0;
                    p.flight = null;
                    p.state = 'fall';
                    p.vy = 120 * u;
                }
            }
        }
        return busy;
    }

    sendHome(p, tops) {
        const col = clamp(p.home, 0, this.ncols - p.cols);
        p.col = col;
        const rest = this.ground - this.baseFor(p, col, tops);
        const x1 = this.centreOf(col, p);
        p.state = 'return';
        p.flight = {
            t: 0,
            time: 0.75,
            x0: p.x,
            y0: p.y,
            x1,
            y1: rest - 6 * this.u,
            arc: 150 * this.u + Math.abs(p.x - x1) * 0.2,
            a0: p.angle,
        };
        if (p.kind !== 'ball')
            audio.note('marimba', p.degree, 60, { gain: 0.55, pan: this.pan(p.x), wet: 0.25 });
    }

    // A part comes to rest: it clanks a step higher for each half-block above the ground.
    land(p, speed) {
        const u = this.u;
        const base = this.ground - p.y;
        const strength = clamp(speed / (1300 * u), 0.35, 1.15);
        if (p.kind === 'ball') {
            audio.play('thud', { f: 85 }, { gain: 0.7 * strength, pan: this.pan(p.x) });
            audio.play('crunch', {}, { gain: 0.4 * strength, pan: this.pan(p.x) });
        } else {
            const degree = clamp(Math.round(base / this.g), 0, 12);
            audio.play(
                'clank',
                { f: noteHz(degree, 48) },
                { gain: 0.9 * strength, pan: this.pan(p.x), wet: 0.22 }
            );
            this.lastLanding = { id: p.id, degree, base };
        }
        p.squash.kick(clamp(speed / (260 * u), 1.5, 8));
        if (base < 1) {
            this.puff(p.x - this.width(p) * 0.35, this.ground, 0.6);
            this.puff(p.x + this.width(p) * 0.35, this.ground, 0.6);
        }
        this.lifeAt = this.time + 0.7;
    }

    //--------------------------------------------------------------------------
    // Buildings

    // The parts standing together with the one at `col` on the ground, or the lowest over it: each
    // touching the next, on top or side by side.
    buildingAt(col) {
        const resting = this.parts.filter((p) => p.state === 'rest' && p.kind !== 'ball');
        const over = resting.filter((p) => col >= p.col - 1 && col < p.col + p.cols + 1);
        if (!over.length) return [];
        over.sort((a, b) => b.y - a.y || Math.abs(col - a.col) - Math.abs(col - b.col));
        const group = [over[0]];
        for (let i = 0; i < group.length; i++) {
            const a = group[i];
            for (const b of resting) {
                if (group.indexOf(b) >= 0) continue;
                if (this.touching(a, b)) group.push(b);
            }
        }
        return group.sort((a, b) => b.y - a.y || a.x - b.x);
    }

    touching(a, b) {
        const g = this.g;
        const aBase = this.ground - a.y;
        const bBase = this.ground - b.y;
        const aTop = aBase + this.height(a);
        const bTop = bBase + this.height(b);
        const overlap = a.col < b.col + b.cols && b.col < a.col + a.cols;
        if (overlap && (Math.abs(aTop - bBase) < g * 0.5 || Math.abs(bTop - aBase) < g * 0.5)) return true;
        const beside = a.col + a.cols === b.col || b.col + b.cols === a.col;
        return beside && aBase < bTop - 1 && bBase < aTop - 1;
    }

    // Play a building from the bottom up, each part lit as it sounds.
    play(group) {
        if (!group.length) return;
        this.sequence = this.sequence.filter((e) => group.indexOf(e.part) < 0);
        let x0 = Infinity;
        let x1 = -Infinity;
        for (const p of group) {
            x0 = Math.min(x0, p.x - this.width(p) / 2);
            x1 = Math.max(x1, p.x + this.width(p) / 2);
        }
        this.bands = this.bands.filter((b) => b.x1 < x0 || b.x0 > x1);
        this.bands.push({ x0, x1, start: this.time, end: this.time + (group.length - 1) * STEP });
        group.forEach((part, i) => this.sequence.push({ part, at: this.time + i * STEP }));
        this.sequence.sort((a, b) => a.at - b.at);
    }

    sound(p, gain) {
        if (p.kind === 'ball') {
            audio.play('clank', { f: noteHz(-3, 48) }, { gain: 0.6 * gain, pan: this.pan(p.x) });
            return;
        }
        audio.note('marimba', p.degree, 60, { gain, pan: this.pan(p.x), wet: 0.2 });
    }

    //--------------------------------------------------------------------------
    // Life: what moves into a building once it stands still a moment.

    chance(p) {
        return this.rand() < p;
    }

    // A hidden thing shows itself the first time it can, each time the crane comes out, and often
    // after that: a three-year-old should find them, not hope to.
    surprise(name, p) {
        if (!this.found.has(name)) {
            this.found.add(name);
            return true;
        }
        return this.chance(p);
    }

    calm() {
        const hk = this.hook;
        if (hk.carrying && hk.carrying.kind !== 'ball') return false;
        return this.parts.every((p) => p.state === 'rest' || p.state === 'hooked' || p.state === 'held');
    }

    // The top surface of `p` at its middle, where a bird would sit.
    crown(p) {
        return { x: p.x, y: p.kind === 'roof' ? p.y - this.height(p) * 0.98 : p.y - this.height(p) };
    }

    covered(p, col) {
        const top = this.ground - p.y + KINDS[p.kind].top[col - p.col] * this.g;
        for (const q of this.parts) {
            if (q === p || q.state !== 'rest') continue;
            if (col < q.col || col >= q.col + q.cols) continue;
            if (Math.abs(this.ground - q.y - top) < 2) return true;
        }
        return false;
    }

    life() {
        const g = this.g;
        const resting = this.parts.filter((p) => p.state === 'rest' && p.kind !== 'ball');

        // Whatever lived on a part that has gone, or been built over, leaves.
        const b = this.bird;
        if (b && (b.state === 'nesting' || b.state === 'building')) {
            const p = b.part;
            const col = Math.floor((b.x - this.x0) / g);
            if (p.state !== 'rest' || this.covered(p, clamp(col, p.col, p.col + p.cols - 1)))
                this.birdLeaves();
        }
        if (this.cat && this.cat.part.state !== 'rest') {
            this.puff(this.cat.part.x, this.cat.part.y - this.height(this.cat.part) / 2, 0.4);
            this.cat = null;
        }
        this.plants = this.plants.filter((pl) => {
            const gone = pl.part.state !== 'rest' || this.covered(pl.part, pl.part.col + pl.offset);
            if (gone) audio.play('pop', { f: 500 }, { gain: 0.35, pan: this.pan(pl.part.x) });
            return !gone;
        });
        if (this.walker && this.walker.part.state !== 'rest') this.walker = null;

        if (!resting.length) return;

        // A bird comes to nest on the very top of a building at least two parts tall.
        if (!this.bird) {
            let top = null;
            for (const p of resting) {
                if (this.ground - p.y < g * 1.5) continue;
                const col = clamp(Math.floor((p.x - this.x0) / g), p.col, p.col + p.cols - 1);
                if (this.covered(p, col)) continue;
                if (!top || this.crown(p).y < this.crown(top).y) top = p;
            }
            if (top && this.surprise('bird', 0.6)) this.birdArrives(top);
        }

        // A cat moves into a window.
        if (!this.cat) {
            const windows = resting.filter((p) => p.kind === 'window');
            if (windows.length && this.surprise('cat', 0.5)) {
                const p = windows[Math.floor(this.rand() * windows.length)];
                this.cat = {
                    part: p,
                    t: 0,
                    stretch: new Spring(0, 90, 8),
                    facing: this.rand() < 0.5 ? -1 : 1,
                };
            }
        }

        // Plants on the ledges: the open tops of blocks and beams above the ground, not where the
        // bird is.
        if (this.plants.length < 3) {
            const spots = [];
            for (const p of resting) {
                if (p.kind !== 'block' && p.kind !== 'beam') continue;
                if (this.ground - p.y < g * 1.5) continue;
                for (let i = 0; i < p.cols; i++) {
                    const col = p.col + i;
                    if (this.covered(p, col)) continue;
                    if (this.bird && this.bird.part === p) continue;
                    if (this.plants.some((pl) => pl.part === p && Math.abs(pl.offset - i) < 2)) continue;
                    spots.push([p, i]);
                }
            }
            if (spots.length && this.surprise('plant', 0.5)) {
                const [p, offset] = spots[Math.floor(this.rand() * spots.length)];
                const colour = ['#F2BAC3', '#F3DE97', '#C9BBE3', '#FBF6EE', '#ABCDEA'][
                    Math.floor(this.rand() * 5)
                ];
                this.plants.push({ part: p, offset, colour, grow: new Spring(0, 160, 10) });
                this.plants[this.plants.length - 1].grow.target = 1;
                audio.play('pop', { f: 650 }, { gain: 0.4, pan: this.pan(p.x) });
                audio.note('tink', 9, 60, { gain: 0.35, pan: this.pan(p.x), delay: 0.12 });
            }
        }

        // A worker walks out along a beam to wave.
        if (!this.walker) {
            const beams = resting.filter((p) => p.kind === 'beam' && p.id === (this.lastLanding || {}).id);
            if (beams.length && this.surprise('worker', 0.5)) {
                const p = beams[0];
                this.walker = { part: p, t: 0, side: this.rand() < 0.5 ? -1 : 1, waved: false };
            }
        }
    }

    birdArrives(p) {
        const spot = this.crown(p);
        const from = { x: this.w + 30 * this.u, y: Math.max(20 * this.u, spot.y - 220 * this.u) };
        this.bird = {
            state: 'arriving',
            part: p,
            x: from.x,
            y: from.y,
            from,
            to: spot,
            t: 0,
            nest: 0,
            hop: 0,
        };
        audio.play('chirp', {}, { gain: 0.5, pan: 0.6 });
    }

    birdLeaves() {
        const b = this.bird;
        b.state = 'leaving';
        b.t = 0;
        b.from = { x: b.x, y: b.y };
        b.to = { x: -40 * this.u, y: Math.max(20 * this.u, b.y - 260 * this.u) };
        audio.play('chirp', {}, { gain: 0.45, pan: this.pan(b.x) });
    }

    stepLife(dt) {
        let busy = false;
        const b = this.bird;
        if (b) {
            b.t += dt;
            if (b.state === 'arriving' || b.state === 'leaving') {
                busy = true;
                const time = b.state === 'arriving' ? 1.6 : 1.2;
                const k = clamp(b.t / time, 0, 1);
                const e = 1 - Math.pow(1 - k, 2);
                b.x = lerp(b.from.x, b.to.x, e);
                b.y = lerp(b.from.y, b.to.y, e) - Math.sin(k * Math.PI) * 50 * this.u;
                if (k >= 1) {
                    if (b.state === 'leaving') this.bird = null;
                    else {
                        b.state = 'building';
                        b.t = 0;
                        audio.play('rustle', {}, { gain: 0.5, pan: this.pan(b.x) });
                    }
                }
            } else if (b.state === 'building') {
                busy = true;
                b.nest = clamp(b.t / 0.9, 0, 1);
                if (b.t >= 0.9) {
                    b.state = 'nesting';
                    b.nest = 1;
                    audio.play('chirp', {}, { gain: 0.5, pan: this.pan(b.x) });
                }
            }
            if (b.hop > 0) {
                b.hop = Math.max(0, b.hop - dt);
                busy = true;
            }
            // Riding the part it nests on, if the part is moved gently: it goes where the part goes.
            if (this.bird && (b.state === 'nesting' || b.state === 'building')) {
                const spot = this.crown(b.part);
                b.x = spot.x;
                b.y = spot.y;
            }
        }
        if (this.cat) {
            this.cat.t += dt;
            if (this.cat.t < 0.6) busy = true;
            if (this.cat.stretch.update(dt)) busy = true;
        }
        for (const pl of this.plants) if (pl.grow.update(dt)) busy = true;
        const wk = this.walker;
        if (wk) {
            busy = true;
            wk.t += dt;
            // Out from the end of the beam to its middle, a wave, and back.
            if (!wk.waved && wk.t > 1.7) {
                wk.waved = true;
                audio.note('glock', 7, 72, { gain: 0.4, pan: this.pan(wk.part.x) });
                audio.note('glock', 9, 72, { gain: 0.4, pan: this.pan(wk.part.x), delay: 0.22 });
            }
            if (wk.t > 5.4) this.walker = null;
        }
        if (this.cabWave > 0) {
            this.cabWave = Math.max(0, this.cabWave - dt);
            busy = true;
        }
        return busy;
    }

    walkerSpot(wk) {
        const p = wk.part;
        const half = this.width(p) / 2 - this.g * 0.35;
        const t = wk.t;
        let k;
        if (t < 1.7) k = t / 1.7;
        else if (t < 3.3) k = 1;
        else k = Math.max(0, 1 - (t - 3.3) / 1.7);
        const x = p.x + wk.side * half * (1 - k);
        const walking = t < 1.7 || t > 3.3;
        return {
            x,
            y: p.y - this.height(p),
            facing: t < 1.7 ? -wk.side : wk.side,
            step: walking ? t * 9 : 0,
            wave: t >= 1.7 && t <= 3.3 ? (t - 1.7) * 7 : undefined,
            alpha: clamp(Math.min(t / 0.3, (5.4 - t) / 0.3), 0, 1),
        };
    }

    //--------------------------------------------------------------------------
    // Input

    pan(x) {
        return clamp((x / this.w) * 2 - 1, -1, 1);
    }

    partAt(x, y) {
        const pad = 6 * this.u;
        const order = this.drawOrder();
        for (let i = order.length - 1; i >= 0; i--) {
            const p = order[i];
            if (p.state !== 'rest' && p.state !== 'fall') continue;
            const half = this.width(p) / 2;
            if (
                x > p.x - half - pad &&
                x < p.x + half + pad &&
                y > p.y - this.height(p) - pad &&
                y < p.y + pad
            )
                return p;
        }
        return null;
    }

    nearHook(x, y) {
        const hk = this.hook;
        const tip = this.hookTip();
        const u = this.u;
        if (dist(x, y, tip.x, tip.y - this.hookS * 0.4) < 46 * u) return true;
        if (dist(x, y, hk.tx, this.jibY + this.trolleyS * 0.2) < 34 * u) return true;
        if (segmentDistance(x, y, hk.tx, this.ty, tip.x, tip.y) < 16 * u) return true;
        const p = hk.carrying;
        if (p && !hk.direct) {
            const half = this.width(p) / 2;
            if (x > p.x - half && x < p.x + half && y > p.y - this.height(p) - 4 * u && y < p.y + 4 * u)
                return true;
        }
        return false;
    }

    down(p) {
        const u = this.u;
        const hk = this.hook;
        if (dist(p.x, p.y, this.sunButton.x, this.sunButton.y) < this.sunButton.r + 10 * u) {
            p.owner = { type: 'sun' };
            this.sunPress.kick(-6);
            return;
        }
        this.pointers.add(p);
        if (!hk.owner && !(hk.carrying && hk.direct) && this.nearHook(p.x, p.y)) {
            const tip = this.hookTip();
            hk.owner = p;
            p.owner = { type: 'hook', dx: tip.x - p.x, dy: tip.y - p.y, moved: false };
            return;
        }
        const target = this.targetAt(p.x, p.y);
        if (target) {
            p.owner = { type: 'target', target };
            return;
        }
        const c = this.cab;
        if (p.x > c.x - 6 * u && p.x < c.x + c.w + 6 * u && p.y > c.y - 6 * u && p.y < c.y + c.h + 6 * u) {
            p.owner = { type: 'cab' };
            return;
        }
        const part = this.partAt(p.x, p.y);
        if (part) {
            p.owner = {
                type: 'part',
                part,
                dx: part.x - p.x,
                dy: part.y - p.y,
                lifted: false,
                t0: this.time,
                played: false,
            };
            part.squash.kick(2);
            return;
        }
        if (p.y > this.ground - 8 * u && p.x > this.x0 - this.g) p.owner = { type: 'ground' };
    }

    move(p) {
        const o = p.owner;
        if (!o) return;
        const u = this.u;
        const hk = this.hook;
        if (o.type === 'hook') {
            if (p.travel > 6 * u) o.moved = true;
            hk.targetX = p.x + o.dx;
            hk.targetL = p.y + o.dy - this.ty - art.hookDrop(this.hookS);
        } else if (o.type === 'part') {
            const part = o.part;
            if (!o.lifted) {
                if (p.travel < 8 * u || o.played) return;
                if (part.state !== 'rest' && part.state !== 'fall') {
                    p.owner = null;
                    return;
                }
                o.lifted = true;
                if (!hk.owner && !hk.carrying) {
                    this.take(part, true);
                    audio.play('rattle', {}, { gain: 0.35, pan: this.pan(part.x) });
                } else {
                    part.state = 'held';
                    this.settle();
                }
                part.tilt = 0;
                audio.play('tick', { f: noteHz(part.degree, 72) }, { gain: 0.25, pan: this.pan(part.x) });
            }
            this.carry(part, p.x + o.dx, p.y + o.dy);
        }
    }

    // A part in a finger: it goes where the finger goes, but never down into what is under it.
    carry(part, x, y) {
        const half = this.width(part) / 2;
        part.x = clamp(x, this.x0 - this.g + half, this.w - 8 * this.u - half);
        const floor = this.ground - this.topUnder(part.x - half, part.x + half, this.tops());
        part.y = clamp(y, this.ty + this.height(part) + this.sling, floor);
    }

    up(p) {
        this.pointers.delete(p);
        const o = p.owner;
        if (!o) return;
        const hk = this.hook;
        if (o.type === 'sun') {
            if (dist(p.x, p.y, this.sunButton.x, this.sunButton.y) < this.sunButton.r + 20 * this.u)
                this.toggleNight();
        } else if (o.type === 'hook') {
            hk.owner = null;
            hk.targetX = hk.tx;
            hk.targetL = hk.L;
            if (!o.moved) {
                // A tap sets the hook swinging.
                hk.omega += (this.rand() < 0.5 ? -1 : 1) * 1.6;
                audio.play('rattle', {}, { gain: 0.35, pan: this.pan(hk.tx) });
            } else if (hk.carrying && !hk.direct) this.release();
        } else if (o.type === 'part') {
            const part = o.part;
            if (!o.lifted) {
                if (!o.played) {
                    part.wobble.kick(5);
                    part.squash.kick(4);
                    this.sound(part, 0.9);
                }
                return;
            }
            if (hk.carrying === part) this.release();
            else if (part.state === 'held') {
                part.state = 'fall';
                part.vy = 0;
                part.col = this.snapCol(part);
            }
        } else if (o.type === 'ground') {
            const col = Math.floor((p.x - this.x0) / this.g);
            const group = this.buildingAt(col);
            if (group.length) this.play(group);
            else {
                this.puff(p.x, this.ground, 0.6);
                audio.play('crunch', { seed: 3 }, { gain: 0.35, pan: this.pan(p.x) });
            }
        } else if (o.type === 'cab') {
            audio.play('toot', { f: noteHz(3, 60) }, { gain: 0.8, pan: this.pan(this.cab.x) });
            audio.play('toot', { f: noteHz(5, 60) }, { gain: 0.7, pan: this.pan(this.cab.x), delay: 0.32 });
            this.cabWave = 1.6;
        } else if (o.type === 'target') {
            o.target.tap();
        }
    }

    cancel(p) {
        this.pointers.delete(p);
        const o = p.owner;
        if (!o) return;
        const hk = this.hook;
        if (o.type === 'hook') {
            hk.owner = null;
            hk.targetX = hk.tx;
            hk.targetL = hk.L;
            if (hk.carrying && !hk.direct) this.release();
        } else if (o.type === 'part' && o.lifted) {
            if (hk.carrying === o.part) this.release();
            else if (o.part.state === 'held') {
                o.part.state = 'fall';
                o.part.vy = 0;
                o.part.col = this.snapCol(o.part);
            }
        }
    }

    // Things to touch that are not parts: the bird, the cat, the worker.
    targetAt(x, y) {
        const u = this.u;
        const b = this.bird;
        if (
            b &&
            (b.state === 'nesting' || b.state === 'building') &&
            dist(x, y, b.x, b.y - 10 * u) < 22 * u
        ) {
            return {
                tap: () => {
                    b.hop = 0.5;
                    audio.play('chirp', {}, { gain: 0.5, pan: this.pan(b.x) });
                },
            };
        }
        const c = this.cat;
        if (c && c.t > 0.6) {
            const spot = this.catSpot(c);
            if (dist(x, y, spot.x, spot.y - this.g * 0.25) < this.g * 0.45) {
                return {
                    tap: () => {
                        c.stretch.kick(8);
                        audio.play('meow', {}, { gain: 0.6, pan: this.pan(spot.x) });
                    },
                };
            }
        }
        const wk = this.walker;
        if (wk) {
            const s = this.walkerSpot(wk);
            if (dist(x, y, s.x, s.y - this.g * 0.5) < this.g * 0.6) {
                return {
                    tap: () => {
                        wk.t = Math.min(wk.t, 1.75);
                        wk.waved = false;
                    },
                };
            }
        }
        return null;
    }

    catSpot(c) {
        const p = c.part;
        const glass = art.glassOf(this.width(p), this.height(p), this.g);
        return {
            x: p.x - this.width(p) / 2 + glass.x + glass.w / 2,
            y: p.y - this.height(p) + glass.y + glass.h,
        };
    }

    //--------------------------------------------------------------------------
    // Day and night

    toggleNight() {
        this.nightTarget = this.nightTarget > 0.5 ? 0 : 1;
        if (this.nightTarget) {
            [4, 2, 0].forEach((d, i) => audio.note('chime', d, 48, { gain: 0.5, delay: i * 0.25, wet: 0.5 }));
        } else {
            [5, 7, 9].forEach((d, i) =>
                audio.note('glock', d, 72, { gain: 0.45, delay: i * 0.16, wet: 0.4 })
            );
        }
    }

    // How many windows are lit: at night, all of them.
    windowsLit() {
        if (this.night < 0.5) return 0;
        return this.parts.filter((p) => p.kind === 'window').length;
    }

    //--------------------------------------------------------------------------
    // Time

    later(delay, fn) {
        this.queue.push({ at: this.time + delay, fn });
    }

    update(dt) {
        this.time += dt;
        let busy = this.pointers.size > 0 || this.queue.length > 0;
        const due = this.queue.filter((q) => q.at <= this.time);
        if (due.length) {
            this.queue = this.queue.filter((q) => q.at > this.time);
            for (const q of due) q.fn();
        }

        const was = this.night;
        this.night += (this.nightTarget - this.night) * (1 - Math.exp(-dt / 0.7));
        if (Math.abs(this.night - this.nightTarget) < 0.002) this.night = this.nightTarget;
        if (this.night !== was) busy = true;
        if (this.sunPress.update(dt)) busy = true;

        // A finger held still on a part, for a moment, plays the building it is in.
        for (const p of this.pointers) {
            const o = p.owner;
            if (
                o &&
                o.type === 'part' &&
                !o.lifted &&
                !o.played &&
                this.time - o.t0 > 0.6 &&
                p.travel < 8 * this.u
            ) {
                o.played = true;
                const group = this.buildingAt(o.part.col);
                this.play(group.indexOf(o.part) >= 0 ? group : [o.part]);
            }
        }

        let tops = this.tops();
        if (this.stepParts(dt, tops)) busy = true;
        tops = this.tops();
        if (this.stepHook(dt, tops)) busy = true;

        for (const p of this.parts) {
            if (p.squash.update(dt)) busy = true;
            if (p.wobble.update(dt)) busy = true;
            if (p.glow > 0) {
                p.glow = Math.max(0, p.glow - dt / GLOW);
                busy = true;
            }
        }
        while (this.sequence.length && this.sequence[0].at <= this.time) {
            const part = this.sequence.shift().part;
            part.squash.kick(6);
            part.glow = 1;
            this.sound(part, 1);
        }
        if (this.sequence.length) busy = true;
        this.bands = this.bands.filter((b) => this.time < b.end + 0.8);
        if (this.bands.length) busy = true;

        if (this.time >= this.lifeAt && this.calm()) {
            this.lifeAt = Infinity;
            this.life();
        }
        if (this.lifeAt < Infinity) busy = true;
        if (this.stepLife(dt)) busy = true;

        this.fx = this.fx.filter((f) => {
            f.t += dt;
            return f.t < f.life;
        });
        if (this.fx.length) busy = true;
        return busy;
    }

    puff(x, y, size) {
        const u = this.u;
        for (let i = 0; i < 3; i++) {
            const dx = (this.rand() - 0.5) * 30 * u * size;
            this.fx.push({ t: -i * 0.04, life: 0.6, x: x + dx, y, r: (10 + 8 * this.rand()) * u * size });
        }
    }

    //--------------------------------------------------------------------------
    // Drawing

    // Each look of part drawn once, with its offset shadow, into a small layer.
    sprite(p) {
        const id = `${p.kind}|${p.colour}`;
        let layer = this.sprites[id];
        if (!layer) {
            const u = this.u;
            const w = this.width(p);
            const h = this.height(p);
            const pad = 8 * u;
            layer = makeLayer(w + pad * 2, h + pad * 2, this.scale);
            layer.pad = pad;
            const ctx = layer.ctx;
            ctx.save();
            ctx.translate(pad + 3 * u, pad + 4 * u);
            ctx.globalAlpha = 0.14;
            art.outline(ctx, p.kind, w, h, this.g, '#70543A');
            ctx.restore();
            ctx.save();
            ctx.translate(pad, pad);
            art.part(ctx, p.kind, w, h, this.g, p.colour);
            ctx.restore();
            this.sprites[id] = layer;
        }
        return layer;
    }

    freeSprites() {
        for (const id of Object.keys(this.sprites || {})) freeLayer(this.sprites[id]);
        this.sprites = {};
    }

    drawOrder() {
        const resting = this.parts.filter((p) => p.state === 'rest').sort((a, b) => b.y - a.y || a.x - b.x);
        const moving = this.parts.filter((p) => p.state !== 'rest');
        return resting.concat(moving);
    }

    drawPart(ctx, p) {
        const layer = this.sprite(p);
        const w = this.width(p);
        const h = this.height(p);
        const squash = p.squash.value * 0.012;
        ctx.save();
        if (p.tilt && (p.state === 'hooked' || p.state === 'fall')) {
            // Hanging from the hook, it turns about the hook's tip.
            const tip = p.state === 'hooked' ? this.hookTip() : { x: p.x, y: p.y - h - this.sling };
            ctx.translate(tip.x, tip.y);
            ctx.rotate(p.tilt);
            ctx.translate(-tip.x, -tip.y);
        }
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle + p.wobble.value * 0.02);
        ctx.scale(1 + squash, 1 - squash * 1.3);
        if (p.state === 'tumble' || p.state === 'scatter' || p.state === 'return') ctx.translate(0, -h / 2);
        const dy = p.state === 'tumble' || p.state === 'scatter' || p.state === 'return' ? -h / 2 : -h;
        ctx.drawImage(layer.canvas, -w / 2 - layer.pad, dy - layer.pad, w + layer.pad * 2, h + layer.pad * 2);
        if (p.glow > 0) {
            art.outline(ctx, p.kind, w, h, this.g, `rgba(255, 250, 235, ${0.28 * p.glow})`, -w / 2, dy);
        }
        ctx.restore();
    }

    draw(ctx) {
        const u = this.u;
        const g = this.g;
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);

        // A pale band along the ground under a building as it plays, and a light in each part's
        // colour as it sounds, so the light climbs the building with the tune.
        for (const b of this.bands) {
            const fade =
                clamp((this.time - b.start) / 0.12, 0, 1) * clamp(1 - (this.time - b.end - 0.3) / 0.5, 0, 1);
            if (fade <= 0) continue;
            fillRound(
                ctx,
                b.x0 - 10 * u,
                this.ground - 6 * u,
                b.x1 - b.x0 + 20 * u,
                20 * u,
                10 * u,
                `rgba(255, 250, 232, ${0.9 * fade})`
            );
        }
        for (const p of this.parts) {
            if (p.glow <= 0) continue;
            const rgb = mixRgb(hexToRgb(p.colour), [255, 252, 246], 0.2);
            const w = this.width(p);
            const h = this.height(p);
            for (const [reach, alpha] of [
                [16, 0.3],
                [7, 0.5],
            ]) {
                const pad = reach * (0.5 + 0.5 * p.glow) * u;
                fillRound(
                    ctx,
                    p.x - w / 2 - pad,
                    p.y - h - pad,
                    w + pad * 2,
                    h + pad * 2,
                    pad * 1.3,
                    rgbString(rgb, alpha * p.glow)
                );
            }
        }

        // Where a load in the air will land: its shadow on whatever is below it.
        const tops = this.tops();
        for (const p of this.parts) {
            if (p.state !== 'hooked' && p.state !== 'held' && p.state !== 'fall') continue;
            const col = this.snapCol(p);
            const x = this.centreOf(col, p);
            const below = this.ground - this.baseFor(p, col, tops);
            const height = Math.max(0, below - p.y);
            const k = clamp(1 - height / (this.ground - this.jibY), 0.25, 1);
            ellipse(ctx, x, below, (this.width(p) / 2) * (0.6 + 0.4 * k), 6 * u * k + 2 * u);
            ctx.fillStyle = `rgba(112, 84, 58, ${0.16 * k})`;
            ctx.fill();
        }

        for (const p of this.drawOrder()) {
            if (p.state === 'hooked') continue;
            this.drawPart(ctx, p);
            if (this.cat && this.cat.part === p) this.drawCat(ctx, this.cat);
        }
        for (const pl of this.plants) {
            const p = pl.part;
            const x = this.colX(p.col + pl.offset) + g / 2;
            art.plant(ctx, x, p.y - this.height(p), g * 1.25, pl.colour, pl.grow.value);
        }
        this.drawBird(ctx);
        if (this.walker) {
            const s = this.walkerSpot(this.walker);
            ctx.globalAlpha = s.alpha;
            art.worker(ctx, s.x, s.y, g * 4.6, { facing: s.facing, step: s.step, wave: s.wave });
            ctx.globalAlpha = 1;
        }

        this.drawHook(ctx);

        for (const f of this.fx) {
            if (f.t < 0) continue;
            art.dust(ctx, f.x, f.y, f.r, f.t / f.life);
        }

        // The night: everything darker and bluer, and then what has a light in it, glows.
        if (this.night > 0.01) {
            const k = this.night;
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = rgbString([255 - 135 * k, 255 - 122 * k, 255 - 62 * k]);
            ctx.fillRect(0, 0, this.w, this.h);
            ctx.globalCompositeOperation = 'source-over';
            this.drawNight(ctx);
        }
        art.apexLight(ctx, this.mastX, this.apexY - 6 * u, 7 * u, this.night);
        this.drawSun(ctx);
    }

    drawHook(ctx) {
        const hk = this.hook;
        const u = this.u;
        const tip = this.hookTip();
        const top = {
            x: hk.tx + Math.sin(hk.theta) * hk.L,
            y: this.ty + Math.cos(hk.theta) * hk.L + hk.hop.value * 0.02 * u,
        };
        art.trolley(ctx, hk.tx, this.jibY, this.trolleyS);
        art.cable(ctx, hk.tx, this.ty, top.x, top.y, this.trolleyS);
        const p = hk.carrying;
        if (p && !hk.direct) {
            // The load hangs from slings, all of it turned with the swing.
            const w = this.width(p);
            const h = this.height(p);
            ctx.save();
            ctx.translate(tip.x, tip.y);
            ctx.rotate(hk.theta);
            if (p.kind === 'ball') {
                const r = art.ballRadius(h);
                art.slings(
                    ctx,
                    0,
                    0,
                    0,
                    this.sling + h - 2 * r - this.g * 0.2,
                    0,
                    this.sling + h - 2 * r - this.g * 0.2,
                    this.trolleyS
                );
            } else {
                art.slings(ctx, 0, 0, -w * 0.32, this.sling, w * 0.32, this.sling, this.trolleyS);
            }
            ctx.restore();
            ctx.save();
            ctx.translate(tip.x, tip.y);
            ctx.rotate(hk.theta);
            ctx.translate(0, this.sling + h);
            const squash = p.squash.value * 0.012;
            ctx.scale(1 + squash, 1 - squash * 1.3);
            const layer = this.sprite(p);
            ctx.drawImage(
                layer.canvas,
                -w / 2 - layer.pad,
                -h - layer.pad,
                w + layer.pad * 2,
                h + layer.pad * 2
            );
            if (p.glow > 0)
                art.outline(ctx, p.kind, w, h, this.g, `rgba(255, 250, 235, ${0.28 * p.glow})`, -w / 2, -h);
            ctx.restore();
            if (this.cat && this.cat.part === p) this.drawCat(ctx, this.cat);
        } else if (p && hk.direct) {
            art.slings(
                ctx,
                tip.x,
                tip.y,
                p.x - this.width(p) * 0.32,
                p.y - this.height(p),
                p.x + this.width(p) * 0.32,
                p.y - this.height(p),
                this.trolleyS
            );
        }
        art.hookBlock(ctx, top.x, top.y, this.hookS, hk.theta);
    }

    drawCat(ctx, c) {
        const spot = this.catSpot(c);
        const p = c.part;
        const glass = art.glassOf(this.width(p), this.height(p), this.g);
        const k = clamp(c.t / 0.6, 0, 1);
        ctx.save();
        ctx.beginPath();
        ctx.rect(p.x - this.width(p) / 2 + glass.x, p.y - this.height(p) + glass.y, glass.w, glass.h);
        ctx.clip();
        const rise = (1 - k) * this.g * 0.8;
        cat(ctx, spot.x, spot.y + rise, this.g * 3.6, {
            facing: c.facing,
            sleep: this.night > 0.6,
            stretch: c.stretch.value * 0.1,
        });
        ctx.restore();
    }

    drawBird(ctx) {
        const b = this.bird;
        if (!b) return;
        const g = this.g;
        if (b.state === 'building' || b.state === 'nesting') {
            const k = b.nest;
            if (k > 0) {
                ctx.save();
                ctx.translate(b.x, b.y);
                ctx.scale(k, k);
                art.nest(ctx, 0, 0, g * 3.2);
                ctx.restore();
            }
        }
        const flying = b.state === 'arriving' || b.state === 'leaving';
        const hop = b.hop > 0 ? Math.sin((b.hop / 0.5) * Math.PI) * g * 0.3 : 0;
        bird(ctx, b.x, b.y - (flying ? 0 : g * 0.12) - hop, g * 3.2, {
            facing: b.state === 'leaving' || (flying && b.to.x < b.from.x) ? -1 : 1,
            flap: flying || b.hop > 0 ? this.time * 22 : 0,
        });
    }

    drawNight(ctx) {
        const u = this.u;
        const k = this.night;
        const lit = (alpha) => `rgba(255, 226, 154, ${alpha * k})`;
        for (const p of this.parts) {
            if (p.kind !== 'window') continue;
            if (p.state === 'hooked') continue;
            const w = this.width(p);
            const h = this.height(p);
            const glass = art.glassOf(w, h, this.g);
            const x = p.x - w / 2 + glass.x;
            const y = p.y - h + glass.y;
            fillRound(ctx, x - 5 * u, y - 5 * u, glass.w + 10 * u, glass.h + 10 * u, 8 * u, lit(0.22));
            fillRound(ctx, x, y, glass.w, glass.h, 3 * u, lit(0.82));
            if (this.cat && this.cat.part === p) this.drawCat(ctx, this.cat);
        }
        const c = this.cab;
        fillRound(ctx, c.x + c.w * 0.06, c.y + c.h * 0.08, c.w * 0.88, c.h * 0.68, 6 * u, lit(0.25));
        art.cab(ctx, c.x, c.y, c.w, c.h, { lit: k, wave: this.cabWave > 0 ? this.cabWave * 9 : undefined });
        // A few stars, and the cab's light.
        for (let i = 0; i < 9; i++) {
            const sx = ((i * 37 + 11) % 100) / 100;
            const sy = ((i * 61 + 23) % 100) / 100;
            const x = this.w * (0.2 + 0.7 * sx);
            const y = this.jibY * 0.3 + (this.ground - this.jibY) * 0.45 * sy;
            const twinkle = 0.6 + 0.4 * Math.sin(this.time * 2 + i);
            art.star(ctx, x, y, 5 * u * twinkle, `rgba(255, 250, 225, ${0.9 * k})`);
        }
    }

    drawSun(ctx) {
        const b = this.sunButton;
        const press = this.sunPress.value * 0.012;
        const back = rgbString(
            hexToRgb('#FBF6EE').map((v, i) => lerp(v, [124, 131, 184][i], this.night)),
            0.92
        );
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(1 + press, 1 + press);
        fillRound(ctx, -32, -32 + 4, 64, 64, 20, 'rgba(112, 84, 58, 0.14)');
        fillRound(ctx, -32, -32, 64, 64, 20, back);
        if (this.night < 0.5) sun(ctx, 0, 0, 12);
        else moon(ctx, -2, 2, 14, back);
        ctx.restore();
        if (this.night <= 0.01) {
            const c = this.cab;
            art.cab(ctx, c.x, c.y, c.w, c.h, { wave: this.cabWave > 0 ? this.cabWave * 9 : undefined });
        }
    }

    exit() {
        freeLayer(this.bg);
        this.bg = null;
        this.freeSprites();
        this.winch.stop();
        this.fx = [];
        this.queue = [];
        this.sequence = [];
        this.pointers.clear();
    }
}

function icon(ctx, x, y, w, h) {
    const s = Math.min(w, h);
    const ground = y + h * 0.86;
    const mx = x + w * 0.24;
    const jib = y + h * 0.2;
    ctx.fillStyle = SITE.sand;
    ctx.fillRect(x + w * 0.06, ground, w * 0.88, h * 0.06);
    art.mast(ctx, mx, jib, ground + h * 0.04, s * 0.07);
    art.girder(ctx, mx - s * 0.12, x + w * 0.9, jib, s * 0.055);
    fillRound(ctx, mx - s * 0.13, jib + s * 0.01, s * 0.08, s * 0.07, s * 0.015, SITE.concrete);
    const hx = x + w * 0.6;
    art.trolley(ctx, hx, jib, s * 0.1);
    art.cable(ctx, hx, jib + s * 0.04, hx, y + h * 0.42, s * 0.1);
    art.hookBlock(ctx, hx, y + h * 0.42, s * 0.1, 0);
    const b = s * 0.13;
    const blockAt = (bx, by, name) => {
        ctx.save();
        ctx.translate(bx - b, by - b * 2);
        art.part(ctx, 'block', b * 2, b * 2, b, TINT[name].colour);
        ctx.restore();
    };
    blockAt(hx, y + h * 0.42 + s * 0.09 + b * 2, 'red');
    blockAt(x + w * 0.8, ground, 'blue');
    blockAt(x + w * 0.8, ground - b * 2, 'yellow');
}

export const toy = {
    id: 'crane',
    title: 'Crane',
    about: 'A tower crane: lower the hook onto a part, lift it, and let go where it should stand. Whatever gets built comes alive.',
    stages: [
        '4 big blocks, to lift or carry',
        'blocks, beams and windows',
        'and arches, a roof, and a wrecking ball',
    ],
    mat: '#E2ECF2',
    icon,
    create: (app) => new CraneScene(app),
    sounds() {
        const list = [
            ['latch', {}],
            ['rattle', {}],
            ['hiss', {}],
            ['thud', { f: 85 }],
            ['thud', { f: 110 }],
            ['crunch', {}],
            ['crunch', { seed: 3 }],
            ['toot', { f: noteHz(3, 60) }],
            ['toot', { f: noteHz(5, 60) }],
            ['chirp', {}],
            ['rustle', {}],
            ['meow', {}],
            ['pop', { f: 500 }],
            ['pop', { f: 650 }],
            ['tink', { f: noteHz(9, 60) }],
            ['clank', { f: noteHz(-3, 48) }],
        ];
        for (let d = 0; d <= 12; d++) list.push(['clank', { f: noteHz(d, 48) }]);
        for (const kind of COLOURS) {
            list.push(['marimba', { f: noteHz(kind.degree, 60) }], ['tick', { f: noteHz(kind.degree, 72) }]);
        }
        for (const d of [0, 2, 4]) list.push(['chime', { f: noteHz(d, 48) }]);
        for (const d of [5, 7, 9]) list.push(['glock', { f: noteHz(d, 72) }]);
        return list;
    },
    signature() {
        audio.play('toot', { f: noteHz(3, 60) }, { gain: 0.45, delay: 0.05 });
        audio.play('clank', { f: noteHz(4, 48) }, { gain: 0.55, delay: 0.35 });
    },
};
