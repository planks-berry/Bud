// The pond: still water, a few fish, lily pads, and a pot of fish food on the bank.
//
// The first toy on the shelf, because everything in it answers a single touch: the water ripples
// and sounds, the fish dart away. The rest is found by staying a while.
//
//   touch  - tap the water: a ripple and a drop, pitched by where it lands (left low, right high),
//            so the pond is also an instrument. Nearby fish startle.
//   move   - push the lily pads around; they drift and bump. Touch a lotus to open or close it.
//   make   - hold a finger still in the water and the fish come to nibble it. Drag from the
//            pot to scatter food, and they gather to eat: caring for animals is Montessori
//            practical life, and the fish do not need anything from the child to be content.

import { Scene } from '../stage.js';
import { PALETTE, makeLayer, freeLayer, grain, ellipse, disc, fillRound } from '../draw.js';
import { clamp, dist, random, rng, angleDelta, approach, shade, Spring, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';

const FISH = [3, 4, 5];
const PADS = [2, 3, 4];
const FLOWERS = [1, 2, 2];
const SHAPE = 3.4;
const MAX_CRUMBS = 40;
const DROP_DEGREES = [3, 12];

const FISH_LOOKS = [
    { body: '#F4B897', fin: '#EFA27F', spots: null },
    { body: '#FBF3E6', fin: '#F2DCC3', spots: '#EF9E7E' },
    { body: '#F3D27E', fin: '#EBBE5A', spots: null },
    { body: '#EFB1B0', fin: '#E39391', spots: '#FBF3E6' },
    { body: '#CFDDEA', fin: '#AFC6DD', spots: '#F4B897' },
];

class PondScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.time = 0;
        this.fish = [];
        this.pads = [];
        this.ripples = [];
        this.crumbs = [];
        this.bubbles = [];
        this.lures = new Set();
        this.waterHands = new Set();
        this.swish = new audio.Texture('water');
        this.lapping = new audio.Texture('lapping');
        this.pot = { wiggle: new Spring(0, 300, 10) };
        this.bg = null;
        this.placed = false;
    }

    layout() {
        freeLayer(this.bg);
        const { w, h, u } = this;
        const bank = Math.max(54 * u, Math.min(w, h) * 0.085);
        this.cx = w / 2;
        this.cy = h / 2;
        this.a = w / 2 - bank;
        this.b = h / 2 - bank;
        this.pot.x = w - bank * 0.62 - 26 * u;
        this.pot.y = h - bank * 0.6 - 22 * u;
        this.pot.r = 34 * u;

        if (!this.placed) {
            this.placed = true;
            const next = rng(7);
            for (let i = 0; i < FISH[this.level]; i++) {
                const spot = this.randomPoint(next, 80 * u);
                this.fish.push({
                    x: spot.x,
                    y: spot.y,
                    a: next() * TAU,
                    v: 30 * u,
                    len: (78 + next() * 20) * u,
                    look: FISH_LOOKS[i % FISH_LOOKS.length],
                    phase: next() * TAU,
                    target: this.randomPoint(next, 90 * u),
                    retarget: 2 + next() * 4,
                    flee: 0,
                    fleeTarget: null,
                    nibble: next(),
                });
            }
            for (let i = 0; i < PADS[this.level]; i++) {
                const spot = this.randomPoint(next, 120 * u);
                this.pads.push({
                    x: spot.x,
                    y: spot.y,
                    r: (50 + next() * 16) * u,
                    rot: next() * TAU,
                    vx: 0,
                    vy: 0,
                    va: 0,
                    tx: 0,
                    ty: 0,
                    held: null,
                    bob: new Spring(0, 180, 6),
                    flower: i < FLOWERS[this.level] ? { open: new Spring(1, 90, 9) } : null,
                });
            }
            this.separatePads(1);
        } else {
            // Rotated: keep everything in the water.
            for (const f of this.fish) this.keepInside(f, 30 * u);
            for (const pad of this.pads) this.keepInside(pad, pad.r);
        }
        this.drawBackground();
    }

    randomPoint(next, margin) {
        for (let i = 0; i < 50; i++) {
            const x = this.cx + (next() * 2 - 1) * this.a;
            const y = this.cy + (next() * 2 - 1) * this.b;
            if (this.inside(x, y, margin)) return { x, y };
        }
        return { x: this.cx, y: this.cy };
    }

    inside(x, y, margin = 0) {
        const dx = Math.abs(x - this.cx) / Math.max(1, this.a - margin);
        const dy = Math.abs(y - this.cy) / Math.max(1, this.b - margin);
        return Math.pow(dx, SHAPE) + Math.pow(dy, SHAPE) < 1;
    }

    keepInside(obj, margin) {
        let guard = 0;
        while (!this.inside(obj.x, obj.y, margin) && guard++ < 60) {
            obj.x += (this.cx - obj.x) * 0.05;
            obj.y += (this.cy - obj.y) * 0.05;
        }
    }

    waterPath(ctx, margin = 0) {
        const a = this.a - margin;
        const b = this.b - margin;
        ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
            const t = (i / 120) * TAU;
            const c = Math.cos(t);
            const s = Math.sin(t);
            const x = this.cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / SHAPE);
            const y = this.cy + b * Math.sign(s) * Math.pow(Math.abs(s), 2 / SHAPE);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    drawBackground() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const next = rng(19);

        ctx.fillStyle = PALETTE.sage;
        ctx.fillRect(0, 0, w, h);
        grain(ctx, 0, 0, w, h, 0.5, this.scale);
        // Tufts of grass on the bank.
        ctx.strokeStyle = PALETTE.sageDeep;
        ctx.lineCap = 'round';
        ctx.lineWidth = 2.5 * u;
        for (let i = 0; i < 140; i++) {
            const x = next() * w;
            const y = next() * h;
            if (this.inside(x, y, -14 * u)) continue;
            const s = (6 + next() * 6) * u;
            ctx.globalAlpha = 0.5 + next() * 0.4;
            ctx.beginPath();
            ctx.moveTo(x - s * 0.5, y - s);
            ctx.lineTo(x, y);
            ctx.lineTo(x + s * 0.5, y - s);
            ctx.moveTo(x, y);
            ctx.lineTo(x, y - s * 1.2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // A few small flowers in the grass.
        for (let i = 0; i < 18; i++) {
            const x = next() * w;
            const y = next() * h;
            if (this.inside(x, y, -24 * u) || dist(x, y, this.pot.x, this.pot.y) < 60 * u) continue;
            for (let k = 0; k < 5; k++) {
                const a = (k / 5) * TAU;
                disc(ctx, x + Math.cos(a) * 3.5 * u, y + Math.sin(a) * 3.5 * u, 3 * u, '#FBF6EE');
            }
            disc(ctx, x, y, 2.4 * u, PALETTE.butterDeep);
        }

        // A sandy rim, then the water: lighter in the middle, deeper at the edges.
        this.waterPath(ctx, -9 * u);
        ctx.fillStyle = shade(PALETTE.sand, 0.15);
        ctx.fill();
        this.waterPath(ctx);
        ctx.fillStyle = PALETTE.waterDeep;
        ctx.fill();
        ctx.save();
        this.waterPath(ctx);
        ctx.clip();
        ctx.translate(this.cx, this.cy);
        ctx.scale(1, this.b / this.a);
        const middle = ctx.createRadialGradient(0, 0, 0, 0, 0, this.a);
        middle.addColorStop(0, '#BFE2DC');
        middle.addColorStop(0.7, 'rgba(166, 211, 209, 0.8)');
        middle.addColorStop(1, 'rgba(166, 211, 209, 0)');
        ctx.fillStyle = middle;
        ctx.fillRect(-this.a, -this.a, this.a * 2, this.a * 2);
        ctx.restore();

        // Pebbles on the bottom, seen through the water.
        ctx.save();
        this.waterPath(ctx);
        ctx.clip();
        for (let i = 0; i < 38; i++) {
            const x = this.cx + (next() * 2 - 1) * this.a;
            const y = this.cy + (next() * 2 - 1) * this.b;
            ellipse(ctx, x, y, (6 + next() * 14) * u, (4 + next() * 9) * u, next() * 3);
            ctx.fillStyle = `rgba(70, 120, 120, ${0.08 + next() * 0.1})`;
            ctx.fill();
        }
        grain(ctx, 0, 0, w, h, 0.2, this.scale);
        ctx.restore();

        this.drawReeds(ctx, this.cx - this.a + 10 * u, this.cy - this.b + 30 * u, next);
        this.drawReeds(ctx, this.cx + this.a - 40 * u, this.cy + this.b - 120 * u, next);
        this.bg = layer;
    }

    drawReeds(ctx, x, y, next) {
        const u = this.u;
        for (let i = 0; i < 5; i++) {
            const bx = x + i * 9 * u + next() * 6 * u;
            const top = y - (40 + next() * 40) * u;
            ctx.strokeStyle = PALETTE.sageDeep;
            ctx.lineWidth = 3 * u;
            ctx.beginPath();
            ctx.moveTo(bx, y + 40 * u);
            ctx.quadraticCurveTo(bx + 6 * u, (y + top) / 2, bx + (next() - 0.5) * 10 * u, top);
            ctx.stroke();
            if (i % 2 === 0) fillRound(ctx, bx - 4 * u, top + 4 * u, 8 * u, 24 * u, 4 * u, '#B58A6A');
        }
    }

    //--------------------------------------------------------------------------
    // Things happening

    ripple(x, y, strength) {
        if (this.ripples.length > 24) this.ripples.shift();
        this.ripples.push({ x, y, t: 0, strength });
    }

    drop(x, y, gain) {
        const t = clamp((x - (this.cx - this.a)) / (this.a * 2), 0, 1);
        const degree = Math.round(DROP_DEGREES[0] + t * (DROP_DEGREES[1] - DROP_DEGREES[0]));
        audio.note('drop', degree, 60, { gain, pan: t * 2 - 1, wet: 0.35 });
    }

    startle(x, y, radius) {
        for (const f of this.fish) {
            const d = dist(x, y, f.x, f.y);
            if (d > radius) continue;
            const away = Math.atan2(f.y - y, f.x - x);
            f.flee = 1.2;
            f.fleeTarget = { x: f.x + Math.cos(away) * 260 * this.u, y: f.y + Math.sin(away) * 260 * this.u };
        }
    }

    sprinkle(x, y, count) {
        for (let i = 0; i < count; i++) {
            if (this.crumbs.length >= MAX_CRUMBS) this.crumbs.shift();
            const cx = x + random(-14, 14) * this.u;
            const cy = y + random(-14, 14) * this.u;
            if (!this.inside(cx, cy, 10 * this.u)) continue;
            this.crumbs.push({ x: cx, y: cy, vx: random(-6, 6) * this.u, vy: random(-6, 6) * this.u, t: 0 });
            this.ripple(cx, cy, 0.25);
        }
        audio.play('bubble', { f: 3000 }, { gain: 0.4, rate: random(0.85, 1.2), pan: (x / this.w) * 2 - 1 });
    }

    padAt(x, y) {
        for (let i = this.pads.length - 1; i >= 0; i--) {
            const pad = this.pads[i];
            if (dist(x, y, pad.x, pad.y) < pad.r * 1.05) return pad;
        }
        return null;
    }

    //--------------------------------------------------------------------------
    // Touch

    down(p) {
        const u = this.u;
        if (dist(p.x, p.y, this.pot.x, this.pot.y) < this.pot.r * 1.6) {
            p.owner = { kind: 'food', lastX: p.x, lastY: p.y, walked: 0 };
            this.pot.wiggle.kick(6);
            audio.play('wood', { f: 392 }, { gain: 0.55 });
            return;
        }

        const pad = this.padAt(p.x, p.y);
        if (pad) {
            // Bring the touched pad to the top.
            this.pads.splice(this.pads.indexOf(pad), 1);
            this.pads.push(pad);
            pad.bob.kick(4);
            pad.held = p;
            pad.tx = pad.x;
            pad.ty = pad.y;
            p.owner = { kind: 'pad', pad, dx: pad.x - p.x, dy: pad.y - p.y };
            if (pad.flower && dist(p.x, p.y, pad.x, pad.y) < pad.r * 0.5) {
                const opening = pad.flower.open.target < 0.5;
                pad.flower.open.target = opening ? 1 : 0;
                audio.note('chime', opening ? 9 : 7, 60, {
                    gain: 0.95,
                    wet: 0.45,
                    pan: (pad.x / this.w) * 2 - 1,
                });
            } else {
                audio.note('drop', 1, 48, { gain: 1, wet: 0.3, pan: (pad.x / this.w) * 2 - 1 });
            }
            this.ripple(pad.x, pad.y, 0.5);
            return;
        }

        if (this.inside(p.x, p.y)) {
            this.ripple(p.x, p.y, 1);
            this.drop(p.x, p.y, 1);
            this.startle(p.x, p.y, 190 * u);
            const lure = { x: p.x, y: p.y, still: 0, active: false };
            p.owner = { kind: 'water', lure, lastX: p.x, lastY: p.y };
            this.lures.add(lure);
            this.waterHands.add(p);
            return;
        }

        audio.play('pat', {}, { gain: 0.3, pan: (p.x / this.w) * 2 - 1 });
    }

    move(p) {
        const o = p.owner;
        if (!o) return;
        const u = this.u;
        if (o.kind === 'pad') {
            o.pad.tx = p.x + o.dx;
            o.pad.ty = p.y + o.dy;
        } else if (o.kind === 'water') {
            const lure = o.lure;
            if (dist(p.x, p.y, lure.x, lure.y) > 16 * u) {
                lure.x = p.x;
                lure.y = p.y;
                lure.still = 0;
                lure.active = false;
            }
            if (dist(p.x, p.y, o.lastX, o.lastY) > 36 * u && this.inside(p.x, p.y)) {
                o.lastX = p.x;
                o.lastY = p.y;
                this.ripple(p.x, p.y, 0.45);
                this.startle(p.x, p.y, 90 * u);
            }
        } else if (o.kind === 'food') {
            o.walked += dist(p.x, p.y, o.lastX, o.lastY);
            o.lastX = p.x;
            o.lastY = p.y;
            if (o.walked > 28 * u && this.inside(p.x, p.y, 8 * u)) {
                o.walked = 0;
                this.sprinkle(p.x, p.y, 1 + Math.floor(random(0, 2)));
            }
        }
    }

    up(p) {
        const o = p.owner;
        if (!o) return;
        if (o.kind === 'pad') {
            o.pad.held = null;
            const limit = 500 * this.u;
            o.pad.vx = clamp(p.vx * 0.6, -limit, limit);
            o.pad.vy = clamp(p.vy * 0.6, -limit, limit);
        } else if (o.kind === 'water') {
            this.lures.delete(o.lure);
            this.waterHands.delete(p);
        } else if (o.kind === 'food' && p.travel < 12 * this.u) {
            // A tap on the pot throws a small handful into the nearest water.
            const toward = Math.atan2(this.cy - this.pot.y, this.cx - this.pot.x);
            for (let i = 0; i < 4; i++) {
                const reach = random(70, 150) * this.u;
                const spread = toward + random(-0.5, 0.5);
                this.sprinkle(
                    this.pot.x + Math.cos(spread) * reach,
                    this.pot.y + Math.sin(spread) * reach,
                    1
                );
            }
        }
    }

    //--------------------------------------------------------------------------
    // Time

    update(dt) {
        const u = this.u;
        this.time += dt;
        this.lapping.set(1);

        // The sound of a hand moving through water follows the fastest moving hand. A finger that has
        // stopped sends no more move events, so its last speed is stale and counts as still.
        let speed = 0;
        const now = performance.now();
        for (const p of this.waterHands) {
            if (now - p.time < 90) speed = Math.max(speed, Math.sqrt(p.vx * p.vx + p.vy * p.vy));
        }
        this.swish.set(clamp(speed / (900 * u), 0, 1));

        for (const lure of this.lures) {
            lure.still += dt;
            if (lure.still > 0.35) lure.active = true;
        }

        for (const f of this.fish) this.updateFish(f, dt);
        this.updatePads(dt);

        for (const r of this.ripples) r.t += dt;
        this.ripples = this.ripples.filter((r) => r.t < 1.7);

        for (const c of this.crumbs) {
            c.t += dt;
            c.vx *= Math.exp(-dt * 0.6);
            c.vy *= Math.exp(-dt * 0.6);
            c.x += c.vx * dt;
            c.y += c.vy * dt;
        }
        this.crumbs = this.crumbs.filter((c) => c.t < 40 && this.inside(c.x, c.y));

        for (const b of this.bubbles) b.t += dt;
        this.bubbles = this.bubbles.filter((b) => b.t < 0.6);

        this.pot.wiggle.update(dt);
        return true;
    }

    updateFish(f, dt) {
        const u = this.u;
        let goal = null;
        let speed = 30 * u;
        let eating = null;
        let nibbling = null;

        if (f.flee > 0) {
            f.flee -= dt;
            goal = f.fleeTarget;
            speed = (34 + 190 * f.flee) * u;
        } else {
            let best = 420 * u;
            for (const c of this.crumbs) {
                const d = dist(f.x, f.y, c.x, c.y);
                if (d < best) {
                    best = d;
                    eating = c;
                }
            }
            if (eating) {
                goal = eating;
                speed = 72 * u;
            } else {
                let near = 400 * u;
                for (const lure of this.lures) {
                    if (!lure.active) continue;
                    const d = dist(f.x, f.y, lure.x, lure.y);
                    if (d < near) {
                        near = d;
                        nibbling = lure;
                    }
                }
                if (nibbling) {
                    goal = nibbling;
                    speed = near > 60 * u ? 58 * u : 14 * u;
                }
            }
        }
        if (!goal) {
            f.retarget -= dt;
            if (f.retarget <= 0 || dist(f.x, f.y, f.target.x, f.target.y) < 30 * u) {
                f.target = this.randomPoint(Math.random, 90 * u);
                f.retarget = 3 + Math.random() * 5;
            }
            goal = f.target;
        }

        let desired = Math.atan2(goal.y - f.y, goal.x - f.x);
        const aheadX = f.x + Math.cos(f.a) * 60 * u;
        const aheadY = f.y + Math.sin(f.a) * 60 * u;
        if (!this.inside(aheadX, aheadY, 34 * u)) desired = Math.atan2(this.cy - f.y, this.cx - f.x);

        // Give each other a little room.
        for (const g of this.fish) {
            if (g === f) continue;
            const d = dist(f.x, f.y, g.x, g.y);
            if (d < f.len * 0.8 && d > 0.01) {
                const away = Math.atan2(f.y - g.y, f.x - g.x);
                desired += angleDelta(desired, away) * 0.3;
            }
        }

        const rate = (f.flee > 0 ? 5.5 : 2.4) * dt;
        f.a += clamp(angleDelta(f.a, desired), -rate, rate);
        f.v = approach(f.v, speed, 2.5, dt);
        f.x += Math.cos(f.a) * f.v * dt;
        f.y += Math.sin(f.a) * f.v * dt;
        if (!this.inside(f.x, f.y, 18 * u)) this.keepInside(f, 18 * u);
        f.phase += dt * (3.5 + f.v / (10 * u));

        const mouthX = f.x + Math.cos(f.a) * f.len * 0.45;
        const mouthY = f.y + Math.sin(f.a) * f.len * 0.45;
        if (eating && dist(mouthX, mouthY, eating.x, eating.y) < 16 * u) {
            this.crumbs.splice(this.crumbs.indexOf(eating), 1);
            audio.play('gulp', { f: 360 }, { gain: 1, rate: random(0.9, 1.15), pan: (f.x / this.w) * 2 - 1 });
            this.ripple(mouthX, mouthY, 0.3);
        }
        if (nibbling && dist(mouthX, mouthY, nibbling.x, nibbling.y) < 28 * u) {
            f.nibble -= dt;
            if (f.nibble <= 0) {
                f.nibble = 0.45 + Math.random() * 0.5;
                audio.play(
                    'bubble',
                    { f: 2200 },
                    { gain: 1, rate: random(0.8, 1.25), pan: (f.x / this.w) * 2 - 1 }
                );
                this.bubbles.push({ x: mouthX, y: mouthY, t: 0 });
            }
        }
    }

    updatePads(dt) {
        const u = this.u;
        for (const pad of this.pads) {
            if (pad.held) {
                const nx = approach(pad.x, pad.tx, 10, dt);
                const ny = approach(pad.y, pad.ty, 10, dt);
                pad.vx = (nx - pad.x) / Math.max(dt, 1e-3);
                pad.vy = (ny - pad.y) / Math.max(dt, 1e-3);
                pad.x = nx;
                pad.y = ny;
            } else {
                pad.vx *= Math.exp(-dt * 1.1);
                pad.vy *= Math.exp(-dt * 1.1);
                pad.x += pad.vx * dt;
                pad.y += pad.vy * dt;
            }
            pad.va = approach(pad.va, ((pad.vx - pad.vy) * 0.0015) / u, 2, dt);
            pad.rot += pad.va * dt;
            if (!this.inside(pad.x, pad.y, pad.r)) {
                this.keepInside(pad, pad.r);
                pad.vx *= -0.4;
                pad.vy *= -0.4;
                pad.bob.kick(1.5);
            }
            pad.bob.update(dt);
            if (pad.flower) pad.flower.open.update(dt);
        }
        this.separatePads(dt);
    }

    separatePads(dt) {
        for (let i = 0; i < this.pads.length; i++) {
            for (let j = i + 1; j < this.pads.length; j++) {
                const a = this.pads[i];
                const b = this.pads[j];
                const d = dist(a.x, a.y, b.x, b.y);
                const overlap = a.r + b.r - d;
                if (overlap <= 0 || d < 0.01) continue;
                const nx = (b.x - a.x) / d;
                const ny = (b.y - a.y) / d;
                const push = overlap * Math.min(1, dt * 12);
                const wa = a.held ? 0 : b.held ? 1 : 0.5;
                const wb = b.held ? 0 : a.held ? 1 : 0.5;
                a.x -= nx * push * wa;
                a.y -= ny * push * wa;
                b.x += nx * push * wb;
                b.y += ny * push * wb;
                if (overlap > 6 * this.u && Math.random() < dt * 4) {
                    a.bob.kick(1);
                    b.bob.kick(1);
                }
            }
        }
    }

    //--------------------------------------------------------------------------
    // Drawing

    draw(ctx) {
        const u = this.u;
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);

        // A slow shimmer of light across the water.
        ctx.save();
        this.waterPath(ctx);
        ctx.clip();
        for (let i = 0; i < 3; i++) {
            const t = this.time * 0.05 + i * 2.1;
            const x = this.cx + Math.cos(t * 1.3 + i) * this.a * 0.6;
            const y = this.cy + Math.sin(t + i * 1.7) * this.b * 0.5;
            ellipse(ctx, x, y, 150 * u, 60 * u, t);
            ctx.fillStyle = 'rgba(255,255,255,0.07)';
            ctx.fill();
        }

        for (const f of this.fish) this.drawFish(ctx, f, true);
        for (const f of this.fish) this.drawFish(ctx, f, false);

        for (const c of this.crumbs) {
            const sink = clamp(c.t / 40, 0, 1);
            ctx.globalAlpha = 1 - sink * 0.6;
            disc(ctx, c.x, c.y, 3.6 * u, '#E9C483');
            ctx.globalAlpha = 1;
        }

        ctx.lineCap = 'round';
        for (const r of this.ripples) {
            const life = 1 - r.t / 1.7;
            for (let k = 0; k < 3; k++) {
                const tk = r.t - k * 0.16;
                if (tk <= 0) continue;
                const radius = 6 * u + tk * 92 * u * (0.65 + r.strength * 0.5);
                ctx.strokeStyle = `rgba(255,255,255,${life * 0.5 * r.strength * (1 - k * 0.25)})`;
                ctx.lineWidth = (1 + 2.5 * life) * u;
                ellipse(ctx, r.x, r.y, radius, radius * 0.92);
                ctx.stroke();
            }
        }
        for (const b of this.bubbles) {
            ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - b.t / 0.6)})`;
            ctx.lineWidth = 2 * u;
            ellipse(ctx, b.x, b.y, (3 + b.t * 14) * u, (3 + b.t * 14) * u);
            ctx.stroke();
        }

        for (const pad of this.pads) this.drawPad(ctx, pad);
        ctx.restore();

        this.drawPot(ctx);
    }

    drawFish(ctx, f, shadow) {
        const L = f.len;
        const wag = Math.sin(f.phase);
        ctx.save();
        if (shadow) ctx.translate(9 * this.u, 13 * this.u);
        ctx.translate(f.x, f.y);
        ctx.rotate(f.a + wag * 0.06);

        // The tail, swinging.
        ctx.save();
        ctx.translate(-L * 0.3, 0);
        ctx.rotate(wag * 0.45);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(-L * 0.2, -L * 0.24, -L * 0.32, -L * 0.2);
        ctx.quadraticCurveTo(-L * 0.22, 0, -L * 0.32, L * 0.2);
        ctx.quadraticCurveTo(-L * 0.2, L * 0.24, 0, 0);
        ctx.fillStyle = shadow ? 'rgba(50, 105, 110, 0.15)' : f.look.fin;
        ctx.fill();
        ctx.restore();

        if (!shadow) {
            for (const side of [-1, 1]) {
                ellipse(ctx, L * 0.12, side * L * 0.17, L * 0.1, L * 0.045, side * (0.7 + wag * 0.2));
                ctx.fillStyle = f.look.fin;
                ctx.fill();
            }
        }

        ctx.beginPath();
        ctx.moveTo(L * 0.5, 0);
        ctx.bezierCurveTo(L * 0.5, -L * 0.19, L * 0.1, -L * 0.21, -L * 0.1, -L * 0.15);
        ctx.quadraticCurveTo(-L * 0.28, -L * 0.08, -L * 0.33, 0);
        ctx.quadraticCurveTo(-L * 0.28, L * 0.08, -L * 0.1, L * 0.15);
        ctx.bezierCurveTo(L * 0.1, L * 0.21, L * 0.5, L * 0.19, L * 0.5, 0);
        ctx.closePath();
        if (shadow) {
            ctx.fillStyle = 'rgba(50, 105, 110, 0.15)';
            ctx.fill();
            ctx.restore();
            return;
        }
        ctx.fillStyle = f.look.body;
        ctx.fill();
        if (f.look.spots) {
            ctx.save();
            ctx.clip();
            disc(ctx, L * 0.18, -L * 0.08, L * 0.1, f.look.spots);
            disc(ctx, -L * 0.08, L * 0.1, L * 0.08, f.look.spots);
            disc(ctx, L * 0.32, L * 0.12, L * 0.05, f.look.spots);
            ctx.restore();
        }
        ellipse(ctx, L * 0.15, -L * 0.04, L * 0.16, L * 0.05);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fill();
        disc(ctx, L * 0.36, -L * 0.08, Math.max(1.5, L * 0.028), PALETTE.ink);
        disc(ctx, L * 0.36, L * 0.08, Math.max(1.5, L * 0.028), PALETTE.ink);
        ctx.restore();
    }

    drawPad(ctx, pad) {
        const u = this.u;
        const s = 1 + pad.bob.value * 0.05;
        const r = pad.r * s;
        const notch = 0.32;
        const path = (x, y) => {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y, r, pad.rot + notch, pad.rot + TAU - notch);
            ctx.closePath();
        };
        path(pad.x + 7 * u, pad.y + 10 * u);
        ctx.fillStyle = 'rgba(50, 105, 110, 0.18)';
        ctx.fill();
        path(pad.x, pad.y);
        ctx.fillStyle = '#A3C98F';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 2.2 * u;
        for (let k = 1; k < 7; k++) {
            const a = pad.rot + notch + (k / 7) * (TAU - notch * 2);
            ctx.beginPath();
            ctx.moveTo(pad.x, pad.y);
            ctx.lineTo(pad.x + Math.cos(a) * r * 0.85, pad.y + Math.sin(a) * r * 0.85);
            ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(80, 130, 70, 0.35)';
        ctx.lineWidth = 2 * u;
        path(pad.x, pad.y);
        ctx.stroke();

        if (pad.flower) this.drawLotus(ctx, pad.x, pad.y, pad.r * 0.48, pad.flower.open.value);
    }

    drawLotus(ctx, x, y, r, open) {
        const o = clamp(open, 0, 1.2);
        ctx.save();
        ctx.translate(x, y);
        for (let ring = 0; ring < 2; ring++) {
            const count = ring ? 5 : 7;
            const len = r * (ring ? 0.6 : 0.85) * (0.45 + 0.55 * o);
            for (let i = 0; i < count; i++) {
                const a = (i / count) * TAU + ring * 0.4;
                ctx.save();
                ctx.rotate(a);
                ellipse(ctx, len * 0.55 * o + r * 0.08, 0, len * 0.55, len * 0.26 * (0.5 + 0.5 * o));
                ctx.fillStyle = ring ? '#F7D3D6' : '#EDB0B8';
                ctx.fill();
                ctx.restore();
            }
        }
        disc(ctx, 0, 0, r * 0.2 * (0.6 + 0.4 * o), PALETTE.butter);
        ctx.restore();
    }

    drawPot(ctx) {
        const u = this.u;
        const { x, y, r } = this.pot;
        const tilt = this.pot.wiggle.value * 0.05;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tilt);
        ellipse(ctx, 4 * u, r * 0.95, r * 1.05, r * 0.3);
        ctx.fillStyle = 'rgba(90, 110, 70, 0.25)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.55);
        ctx.lineTo(r, -r * 0.55);
        ctx.lineTo(r * 0.72, r * 0.9);
        ctx.lineTo(-r * 0.72, r * 0.9);
        ctx.closePath();
        ctx.fillStyle = PALETTE.peachDeep;
        ctx.fill();
        fillRound(ctx, -r * 1.1, -r * 0.75, r * 2.2, r * 0.4, r * 0.15, shade(PALETTE.peachDeep, -0.08));
        ellipse(ctx, 0, -r * 0.62, r * 0.85, r * 0.16);
        ctx.fillStyle = '#E9C483';
        ctx.fill();
        for (let i = 0; i < 6; i++)
            disc(ctx, (i - 2.5) * r * 0.24, -r * (0.66 + (i % 2) * 0.06), r * 0.08, '#D9AF68');
        ctx.restore();
    }

    exit() {
        this.swish.stop();
        this.lapping.stop();
        freeLayer(this.bg);
        this.bg = null;
    }
}

function icon(ctx, x, y, w, h, u) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    ellipse(ctx, cx, cy, w * 0.42, h * 0.38);
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fill();
    ellipse(ctx, cx, cy, w * 0.34, h * 0.3);
    ctx.fillStyle = '#BFE2DC';
    ctx.fill();
    // A fish.
    const fx = cx - w * 0.1;
    const fy = cy + h * 0.06;
    const L = w * 0.26;
    ctx.beginPath();
    ctx.moveTo(fx + L * 0.5, fy);
    ctx.quadraticCurveTo(fx + L * 0.1, fy - L * 0.25, fx - L * 0.3, fy);
    ctx.quadraticCurveTo(fx + L * 0.1, fy + L * 0.25, fx + L * 0.5, fy);
    ctx.fillStyle = '#F4B897';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(fx - L * 0.25, fy);
    ctx.lineTo(fx - L * 0.5, fy - L * 0.16);
    ctx.lineTo(fx - L * 0.5, fy + L * 0.16);
    ctx.closePath();
    ctx.fill();
    // A lily pad.
    const px = cx + w * 0.17;
    const py = cy - h * 0.1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, w * 0.11, 0.4, TAU - 0.3);
    ctx.closePath();
    ctx.fillStyle = '#A3C98F';
    ctx.fill();
    disc(ctx, px, py, w * 0.035, '#EDB0B8');
}

export const toy = {
    id: 'pond',
    title: 'Pond',
    about: 'Tap the water, push the lily pads, feed the fish. Fish come to a finger held still.',
    mat: shade(PALETTE.mint, 0.3),
    icon,
    create: (app) => new PondScene(app),
    sounds() {
        const list = [
            ['gulp', { f: 360 }],
            ['bubble', { f: 2200 }],
            ['bubble', { f: 3000 }],
            ['pat', {}],
        ];
        for (let d = DROP_DEGREES[0]; d <= DROP_DEGREES[1]; d++) list.push(['drop', { f: noteHz(d, 60) }]);
        list.push(
            ['drop', { f: noteHz(1, 48) }],
            ['chime', { f: noteHz(7, 60) }],
            ['chime', { f: noteHz(9, 60) }]
        );
        return list;
    },
    signature() {
        audio.note('drop', 8, 60, { gain: 0.6, wet: 0.35, delay: 0.05 });
    },
};
