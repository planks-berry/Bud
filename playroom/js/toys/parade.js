// Freeze Parade: the farm animals march round the meadow to the beat he plays on a big drum, past
// the barn, over the bridge, round the pond. Their steps follow his tempo; when he stops, they
// freeze mid-step, in silly poses, wobbling, and wait for him. Musical statues: the fun is in
// stopping, and in starting again.
//
//   touch  - each beat on the drum is a step for the parade. Tap an animal and it calls out.
//   move   - a steady beat marches them, quick beats hurry them, and stopping freezes them, with a
//            wobble; hold still a while and one of them sneezes, and at last they lie down to wait.
//   make   - a parade that goes where his beat takes it: over the bridge (the steps knock on its
//            boards), round the pond, and home past the barn, where the rooster crows.
//
// Rhythm-and-movement lessons built preschoolers' self-control in a 213-child trial (QUT, 2023);
// musical statues is the oldest game of it; Cookie Monster practised stopping himself. Stopping on
// purpose, to see them freeze, and waiting before starting again, is self-control, practised.
//
// Seed: one drum, and the cow, the sheep and the pig. Sprout: two ducks join, and they march to a
// tambourine, so the whole parade needs both. Bloom: a hare at the front, who only hops to a quick
// beat, a tortoise at the back, who only walks to a slow one, and the parade is a band that plays
// along: the cow's drum, the sheep's horn playing a march a note a beat, the pig's cymbals.
//
// The rules, who marches to what and when the parade freezes, are march.js.

import { Scene } from '../stage.js';
import { PALETTE, makeLayer, freeLayer, grain, ellipse, fillRound } from '../draw.js';
import { Spring, clamp, lerp, dist, shade, rng, easeInOutSine } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { STAGES, WALKERS, Tempo, stepsFor, STEPS_A_LAP, MARCH } from './march.js';
import { DRAW, SIZE, heightOf } from './paradeart.js';
import { drawDrum, drawTambourine } from './instruments.js';
import * as farm from './farmart.js';

// Each animal's voice, and the pitch it sneezes at.
const VOICES = {
    cow: ['moo', { f: noteHz(-5, 60) }],
    sheep: ['baa', { f: noteHz(0, 60) }],
    pig: ['oink', { f: noteHz(-4, 60) }],
    duck: ['quack', { f: noteHz(1, 60) }],
    tortoise: ['creak', {}],
    hare: ['squeak', { f: 1400 }],
};
const SNEEZE = { cow: 300, sheep: 380, pig: 420, duck: 560, tortoise: 340, hare: 600 };
// What each carries in the band at Bloom.
const CARRY = { cow: 'drum', sheep: 'horn', pig: 'cymbals', duck: 'bells' };
// After the parade freezes: when someone sneezes, and when they lie down to wait.
const SNEEZES = [2.6, 6.5];
const REST = 12;
// Untouched this long, the meadow stops asking and rests.
const IDLE = 40;

// The instrument an animal marches to.
const groupOf = (name) => WALKERS[name].instrument;

class ParadeScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.stage = STAGES[this.level];
        this.time = 0;
        this.touched = 0;
        this.tempo = { drum: new Tempo(), tambourine: new Tempo() };
        // Each band of marchers, by its instrument: when it froze, and the silly things since.
        this.groups = {
            drum: { frozen: false, frozenAt: 0, done: 0 },
            tambourine: { frozen: false, frozenAt: 0, done: 0 },
        };
        this.beats = 0;
        this.laps = 0;
        this.animals = this.stage.animals.map((name, i) => ({
            name,
            order: i,
            lane: name === 'duck' || name === 'tortoise' ? -1 : name === 'hare' ? 1 : 0,
            s: 0,
            from: 0,
            to: 0,
            t: 1,
            dur: 0.4,
            phase: i % 2 ? 1 : -1,
            state: 'stand',
            freeze: new Spring(0, 170, 11),
            wobble: new Spring(0, 70, 2.5),
            sit: new Spring(0, 30, 10),
            sneeze: -1,
            style: 0,
            mouth: 0,
            hit: 0,
            hop: new Spring(0, 260, 14),
            blinkAt: 1 + Math.random() * 3,
        }));
        this.drum = { x: 0, y: 0, r: 0, press: new Spring(0, 520, 16), ring: 0 };
        this.tambourine = this.stage.tambourine
            ? { x: 0, y: 0, r: 0, shake: new Spring(0, 200, 6), ring: 0 }
            : null;
        this.door = new Spring(0, 60, 11);
        this.rooster = new Spring(0, 120, 9);
        this.notes = [];
        this.bg = null;
    }

    //--------------------------------------------------------------------------
    // The meadow, and the loop the parade walks

    layout() {
        const { w, h, u } = this;
        const portrait = h > w;
        this.front = h * (portrait ? 0.6 : 0.64);
        this.back = h * (portrait ? 0.35 : 0.33);
        this.left = w * (portrait ? 0.3 : 0.27);
        this.right = w * (portrait ? 0.7 : 0.73);
        this.capX = w * (portrait ? 0.2 : 0.16);
        this.buildPath();
        this.k = (portrait ? 140 : 150) * u;
        this.step = this.length / STEPS_A_LAP;

        const iy = h * (portrait ? 0.86 : 0.86);
        const pair = !!this.tambourine;
        this.drum.x = pair ? w * 0.4 : w / 2;
        this.drum.y = iy;
        this.drum.r = Math.min(80 * u, w * 0.11);
        if (pair) {
            this.tambourine.x = w * 0.64;
            this.tambourine.y = iy + 6 * u;
            this.tambourine.r = Math.min(62 * u, w * 0.085);
        }
        // The bridge, where the stream crosses the near side of the loop.
        this.bridge = { x0: lerp(this.left, this.right, 0.12), x1: lerp(this.left, this.right, 0.3) };
        // The barn stands behind the far side, a little right of the middle.
        this.barnAt = { x: w * 0.56, y: this.back - 8 * u, s: (portrait ? 150 : 170) * u };
        this.barnS = this.nearest(this.barnAt.x, this.back);

        // Line the parade up along the near side, the first at the front.
        if (!this.placed) {
            this.placed = true;
            let s = this.nearest(lerp(this.left, this.right, 0.78), this.front);
            this.animals.forEach((a, i) => {
                if (i) {
                    const prev = this.animals[i - 1];
                    s -= (SIZE[prev.name] + SIZE[a.name]) * 0.5 * this.k * 0.95;
                }
                a.s = a.from = a.to = s;
            });
        } else {
            const k = this.length / this.lastLength;
            for (const a of this.animals) {
                a.s *= k;
                a.from *= k;
                a.to *= k;
            }
        }
        this.lastLength = this.length;

        freeLayer(this.bg);
        this.bg = this.drawBackground();
    }

    // The loop as a list of points, near side left to right, round the right, far side right to
    // left, and round the left: an oval stretched long, seen from a little above.
    buildPath() {
        const { front, back, left, right, capX } = this;
        const cy = (front + back) / 2;
        const b = (front - back) / 2;
        const pts = [];
        const n = 48;
        for (let i = 0; i < n; i++) pts.push([lerp(left, right, i / n), front]);
        for (let i = 0; i < n; i++) {
            const a = Math.PI / 2 - (Math.PI * i) / n;
            pts.push([right + capX * Math.cos(a), cy + b * Math.sin(a)]);
        }
        for (let i = 0; i < n; i++) pts.push([lerp(right, left, i / n), back]);
        for (let i = 0; i < n; i++) {
            const a = -Math.PI / 2 - (Math.PI * i) / n;
            pts.push([left + capX * Math.cos(a), cy + b * Math.sin(a)]);
        }
        const lengths = [0];
        for (let i = 1; i <= pts.length; i++) {
            const [x0, y0] = pts[i - 1];
            const [x1, y1] = pts[i % pts.length];
            lengths.push(lengths[i - 1] + Math.hypot(x1 - x0, y1 - y0));
        }
        this.points = pts;
        this.lengths = lengths;
        this.length = lengths[pts.length];
        this.cy = cy;
    }

    wrap(s) {
        return ((s % this.length) + this.length) % this.length;
    }

    // Where on the loop `s` is: a point, the way it is going, and how near the front, 0 to 1.
    at(s) {
        s = this.wrap(s);
        const L = this.lengths;
        let lo = 0;
        let hi = L.length - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (L[mid] <= s) lo = mid;
            else hi = mid;
        }
        const p0 = this.points[lo];
        const p1 = this.points[(lo + 1) % this.points.length];
        const k = (s - L[lo]) / Math.max(1e-6, L[lo + 1] - L[lo]);
        const x = lerp(p0[0], p1[0], k);
        const y = lerp(p0[1], p1[1], k);
        const dx = p1[0] - p0[0];
        const dy = p1[1] - p0[1];
        const len = Math.hypot(dx, dy) || 1;
        return {
            x,
            y,
            dx: dx / len,
            dy: dy / len,
            depth: clamp((y - this.back) / (this.front - this.back), 0, 1),
        };
    }

    // The place on the loop nearest a point.
    nearest(x, y) {
        let best = 0;
        let bestD = Infinity;
        this.points.forEach(([px, py], i) => {
            const d = (px - x) * (px - x) + (py - y) * (py - y);
            if (d < bestD) {
                bestD = d;
                best = i;
            }
        });
        return this.lengths[best];
    }

    drawBackground() {
        const { w, h, u, front, back, left, right, capX, cy } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const horizon = back - h * 0.13;
        const sky = ctx.createLinearGradient(0, 0, 0, horizon);
        sky.addColorStop(0, '#B9D9EE');
        sky.addColorStop(1, '#E6F1EE');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, horizon + 2);
        // Far hills, then the meadow.
        ellipse(ctx, w * 0.2, horizon + h * 0.04, w * 0.35, h * 0.08);
        ctx.fillStyle = '#C6DDB3';
        ctx.fill();
        ellipse(ctx, w * 0.82, horizon + h * 0.05, w * 0.4, h * 0.09);
        ctx.fill();
        ctx.fillStyle = '#B9D6A2';
        ctx.fillRect(0, horizon, w, h - horizon);
        const meadow = ctx.createLinearGradient(0, horizon, 0, h);
        meadow.addColorStop(0, '#BCD8A6');
        meadow.addColorStop(1, '#A9CB90');
        ctx.fillStyle = meadow;
        ctx.fillRect(0, horizon, w, h - horizon);

        // Trees at the sides, and the barn behind the far side of the loop.
        farm.tree(ctx, w * 0.02, horizon - h * 0.04, h * 0.2);
        farm.tree(ctx, w * 0.86, horizon - h * 0.02, h * 0.17);
        farm.tree(ctx, w * 0.12, horizon - h * 0.07, h * 0.15);

        // The pond in the middle, and the stream from it under the bridge to the edge.
        const br = this.bridge;
        const bx = (br.x0 + br.x1) / 2;
        ctx.strokeStyle = PALETTE.water;
        ctx.lineCap = 'round';
        ctx.lineWidth = 34 * u;
        ctx.beginPath();
        ctx.moveTo(w / 2 - (right - left) * 0.18, cy + 10 * u);
        ctx.bezierCurveTo(bx + 40 * u, cy + (front - cy) * 0.6, bx, front - 30 * u, bx, front + 10 * u);
        ctx.bezierCurveTo(bx, front + 50 * u, w * 0.08, front + 30 * u, -20 * u, front + 54 * u);
        ctx.stroke();
        ellipse(ctx, w / 2, cy, (right - left) / 2 + capX * 0.2, (front - back) * 0.27);
        ctx.fillStyle = PALETTE.waterDeep;
        ctx.fill();
        ellipse(
            ctx,
            w / 2,
            cy - 2 * u,
            (right - left) / 2 + capX * 0.2 - 6 * u,
            (front - back) * 0.27 - 5 * u
        );
        ctx.fillStyle = PALETTE.water;
        ctx.fill();
        for (const [px, py, r] of [
            [-0.2, -0.1, 16],
            [0.24, 0.08, 13],
            [0.05, -0.18, 11],
        ]) {
            const x = w / 2 + px * (right - left);
            const y = cy + py * (front - back);
            ellipse(ctx, x, y, r * 1.3 * u, r * 0.7 * u);
            ctx.fillStyle = '#9CC58B';
            ctx.fill();
        }

        // The path: a band of packed earth, wider near the front.
        for (const [width, colour] of [
            [1, '#D9C29E'],
            [0.72, '#E6D2B0'],
        ]) {
            ctx.fillStyle = colour;
            for (let i = 0; i < this.points.length; i++) {
                const [x, y] = this.points[i];
                const depth = clamp((y - back) / (front - back), 0, 1);
                const r = lerp(17, 25, depth) * u * width;
                ellipse(ctx, x, y, r * 1.6, r * 0.7);
                ctx.fill();
            }
        }

        // The bridge's boards across the stream, and its far rail: the near rail is drawn over the
        // animals, so they walk between the two.
        const bw = br.x1 - br.x0;
        fillRound(ctx, br.x0, front - 18 * u, bw, 36 * u, 6 * u, '#C9A47A');
        ctx.fillStyle = '#B48C62';
        for (let i = 1; i < 8; i++) ctx.fillRect(br.x0 + (i * bw) / 8 - u, front - 18 * u, 2 * u, 36 * u);
        this.rail(ctx, front - 20 * u);

        // The barn, behind the far side.
        const b = this.barnAt;
        farm.barn(ctx, b.x - b.s / 2, b.y - b.s * 0.87, b.s, { door: 0 });

        // A few flowers about the meadow.
        const next = rng(9);
        for (let i = 0; i < 26; i++) {
            const x = next() * w;
            const y = horizon + 10 * u + next() * (h - horizon - 20 * u);
            const inLoop =
                Math.abs(x - w / 2) < (right - left) / 2 + capX && y > back - 30 * u && y < front + 36 * u;
            const byDrum = y > front + 60 * u;
            if (inLoop || byDrum) continue;
            farm.flower(ctx, x, y, 22 * u, ['#EDB3AC', '#F3DE97', '#C9BBE3', '#FBF3E6'][i % 4]);
        }
        grain(ctx, 0, 0, w, h, 0.22, this.scale);
        return layer;
    }

    // A wooden rail along the bridge: posts and a bar.
    rail(ctx, y) {
        const { u } = this;
        const br = this.bridge;
        ctx.fillStyle = '#A97F57';
        for (let i = 0; i <= 4; i++) {
            const x = lerp(br.x0 + 4 * u, br.x1 - 4 * u, i / 4);
            fillRound(ctx, x - 3 * u, y - 22 * u, 6 * u, 24 * u, 2 * u, '#A97F57');
        }
        fillRound(ctx, br.x0, y - 22 * u, br.x1 - br.x0, 6 * u, 3 * u, '#B98A62');
    }

    //--------------------------------------------------------------------------
    // Playing

    pan(x) {
        return clamp((x / this.w) * 2 - 1, -1, 1) * 0.7;
    }

    // A beat on an instrument: everyone who marches to it, at this pace, takes a step.
    beat(instrument) {
        const t = this.time;
        this.touched = t;
        const interval = this.tempo[instrument].beat(t);
        const group = this.groups[instrument];
        group.frozen = false;
        group.done = 0;
        let onBridge = false;
        let stepped = 0;
        for (const a of this.animals) {
            const steps = stepsFor(a.name, instrument, interval);
            if (!steps) continue;
            this.stepOf(a, steps, interval);
            stepped++;
            const at = this.at(a.to);
            if (at.depth > 0.9 && at.x > this.bridge.x0 && at.x < this.bridge.x1) onBridge = true;
        }
        if (instrument === 'drum') {
            const d = this.drum;
            d.press.kick(-10);
            d.ring = 1;
            audio.play('drum', {}, { pan: this.pan(d.x) });
            if (this.stage.band) this.band();
        } else {
            const tb = this.tambourine;
            tb.shake.kick(tb.shake.value > 0 ? -8 : 8);
            tb.ring = 1;
            audio.play('jingle', {}, { pan: this.pan(tb.x) });
            this.ducksQuack = (this.ducksQuack || 0) + 1;
            if (this.ducksQuack % 4 === 0) {
                const duck = this.animals.find((a) => a.name === 'duck');
                if (duck) this.call(duck, 0.5);
            }
        }
        if (stepped) {
            // Their feet on the grass, or on the bridge's boards.
            if (onBridge)
                audio.play('wood', { f: noteHz(3, 60) }, { gain: 0.55, pan: this.pan(this.bridge.x0) });
            else audio.play('pat', {}, { gain: 0.35 });
        }
    }

    stepOf(a, steps, interval) {
        if (a.t < 1) a.s = a.to;
        a.from = a.s;
        a.to = a.s + steps * this.step;
        a.t = 0;
        // A step takes most of a beat, never so long it drags or so short it is a twitch; the
        // tortoise plods, the hare sails.
        a.dur = clamp(
            interval * (a.name === 'tortoise' ? 0.95 : 0.85),
            0.16,
            a.name === 'tortoise' ? 1.1 : 0.62
        );
        a.phase = -a.phase;
        a.state = 'march';
        a.freeze.target = 0;
        a.sit.target = 0;
        a.sneeze = -1;
    }

    // At Bloom, the parade plays along: the cow's drum on every beat, the sheep's horn a note of the
    // march, the pig's cymbals at the start of each bar. Only those still marching play.
    band() {
        const i = this.beats++;
        for (const a of this.animals) {
            if (a.state !== 'march' || !CARRY[a.name] || CARRY[a.name] === 'bells') continue;
            const where = this.at(a.s);
            if (a.name === 'cow') a.hit = 1;
            else if (a.name === 'sheep') {
                a.hit = 1;
                audio.play(
                    'toot',
                    { f: noteHz(MARCH[i % MARCH.length], 60) },
                    { gain: 0.45, pan: this.pan(where.x) }
                );
            } else if (a.name === 'pig' && i % 4 === 0) {
                a.hit = 1;
                audio.play('cymbal', {}, { gain: 0.5, pan: this.pan(where.x) });
            }
        }
    }

    call(a, gain = 0.8) {
        const [name, params] = VOICES[a.name];
        audio.play(name, params, { gain, pan: this.pan(this.at(a.s).x) });
        a.mouth = 1;
        a.hop.kick(-4);
    }

    freezeGroup(instrument) {
        const group = this.groups[instrument];
        group.frozen = true;
        group.frozenAt = this.time;
        group.done = 0;
        let any = false;
        for (const a of this.animals) {
            if (a.state !== 'march' || groupOf(a.name) !== instrument) continue;
            a.state = 'freeze';
            a.style = Math.floor(Math.random() * 3);
            a.freeze.target = 1;
            a.wobble.kick((Math.random() - 0.5) * 3);
            any = true;
        }
        if (any) {
            // Ta-dum: they have stopped.
            audio.play('wood', { f: noteHz(4, 72) }, { gain: 0.5 });
            audio.play('wood', { f: noteHz(0, 72) }, { gain: 0.55, delay: 0.14 });
        }
    }

    //--------------------------------------------------------------------------
    // Time

    update(dt) {
        this.time += dt;
        const t = this.time;
        let busy = t - this.touched < IDLE;

        for (const instrument of ['drum', 'tambourine']) {
            const group = this.groups[instrument];
            const tempo = this.tempo[instrument];
            const marching = this.animals.some((a) => a.state === 'march' && groupOf(a.name) === instrument);
            if (marching && tempo.stopped(t) && !group.frozen) this.freezeGroup(instrument);
            if (group.frozen) this.statues(instrument, group, t - group.frozenAt, dt);
        }

        // Home past the barn: the first of the parade passing it brings the rooster out.
        const farthest = Math.max(...this.animals.map((a) => a.s));
        const lap = Math.floor((farthest - this.barnS) / this.length);
        if (this.lastLap === undefined) this.lastLap = lap;
        if (lap !== this.lastLap) {
            this.lastLap = lap;
            this.laps++;
            this.door.target = 1;
            this.rooster.kick(-8);
            this.doorAt = t;
            audio.play('crow', {}, { gain: 0.6, pan: this.pan(this.barnAt.x), wet: 0.35, delay: 0.2 });
        }
        if (this.doorAt !== undefined && t - this.doorAt > 2.5) this.door.target = 0;

        for (const a of this.animals) {
            if (a.t < 1) {
                a.t = Math.min(1, a.t + dt / a.dur);
                a.s = a.from + (a.to - a.from) * easeInOutSine(a.t);
                busy = true;
            }
            for (const spring of [a.freeze, a.wobble, a.sit, a.hop]) if (spring.update(dt)) busy = true;
            if (a.mouth > 0) {
                a.mouth = Math.max(0, a.mouth - dt / 0.5);
                busy = true;
            }
            if (a.hit > 0) {
                a.hit = Math.max(0, a.hit - dt / 0.25);
                busy = true;
            }
            if (a.sneeze >= 0) {
                a.sneeze += dt;
                busy = true;
                if (a.sneeze > 1.3) a.sneeze = -1;
            }
            if (t > a.blinkAt) a.blinkAt = t + 2 + Math.random() * 4;
        }
        for (const spring of [this.drum.press, this.door, this.rooster]) if (spring.update(dt)) busy = true;
        this.drum.ring = Math.max(0, this.drum.ring - dt / 0.6);
        if (this.tambourine) {
            if (this.tambourine.shake.update(dt)) busy = true;
            this.tambourine.ring = Math.max(0, this.tambourine.ring - dt / 0.5);
        }
        return busy || this.drum.ring > 0;
    }

    // Frozen: wobbling to keep still; then a sneeze, and another; and at last they lie down to wait.
    statues(instrument, group, since, dt) {
        const frozen = this.animals.filter((a) => a.state === 'freeze' && groupOf(a.name) === instrument);
        if (!frozen.length) return;
        // Now and then one of them nearly loses its balance.
        if (Math.random() < dt * 0.9) {
            const a = frozen[Math.floor(Math.random() * frozen.length)];
            a.wobble.kick((Math.random() - 0.5) * 2.5);
        }
        if (group.done < SNEEZES.length && since >= SNEEZES[group.done]) {
            const a = frozen[(group.done * 2 + this.laps) % frozen.length];
            group.done++;
            a.sneeze = 0;
            group.choo = { at: this.time + 0.65, who: a };
            audio.play('sneeze', { f: SNEEZE[a.name] }, { gain: 0.8, pan: this.pan(this.at(a.s).x) });
        }
        // The choo shakes the whole line.
        if (group.choo && this.time >= group.choo.at) {
            for (const b of frozen)
                b.wobble.kick((b === group.choo.who ? 4 : 1.5) * (Math.random() < 0.5 ? -1 : 1));
            group.choo = null;
        }
        if (since >= REST && group.done <= SNEEZES.length) {
            group.done = SNEEZES.length + 1;
            for (const a of frozen) {
                a.state = 'rest';
                a.freeze.target = 0;
                a.sit.target = 1;
            }
        }
    }

    //--------------------------------------------------------------------------
    // Touch

    down(p) {
        const { u } = this;
        this.touched = this.time;
        const d = this.drum;
        if (Math.abs(p.x - d.x) < d.r * 1.15 && p.y > d.y - d.r * 0.75 && p.y < d.y + d.r * 0.8) {
            this.beat('drum');
            return;
        }
        const tb = this.tambourine;
        if (tb && dist(p.x, p.y, tb.x, tb.y) < tb.r * 1.25) {
            this.beat('tambourine');
            return;
        }
        // An animal: the nearest under the finger, front first.
        let best = null;
        let bestD = Infinity;
        for (const a of this.animals) {
            const { at, k, x, y } = this.place(a);
            const d2 = dist(p.x, p.y, x, y - heightOf(a.name, k) * 0.5);
            if (d2 < k * 0.55 && d2 - at.depth * 10 * u < bestD) {
                bestD = d2 - at.depth * 10 * u;
                best = a;
            }
        }
        if (best) {
            this.call(best);
            if (best.state === 'freeze') best.wobble.kick(3);
        }
    }

    //--------------------------------------------------------------------------
    // Drawing

    draw(ctx) {
        const { w, h, u } = this;
        ctx.drawImage(this.bg.canvas, 0, 0, w, h);
        this.drawBarnLife(ctx);

        // The animals, the farthest first, each in its lane.
        const placed = this.animals.map((a) => this.place(a));
        placed.sort((p, q) => p.y - q.y);
        for (const p of placed) this.drawAnimal(ctx, p);
        this.rail(ctx, this.front + 22 * u);

        drawDrum(ctx, this.drum.x, this.drum.y, this.drum.r, u, this.drum.press.value, this.drum.ring);
        if (this.tambourine) {
            const tb = this.tambourine;
            drawTambourine(ctx, tb.x, tb.y, tb.r, u, tb.shake.value, tb.ring);
        }
        // Until the first beat, and when all is still for a while, a slow ring round the drum asks
        // for one, the way the bud asks for a first touch.
        const quiet = this.time - Math.max(this.touched, this.tempo.drum.last);
        if (quiet > 3 && quiet < IDLE) {
            const k = (this.time * 0.6) % 1;
            ctx.strokeStyle = `rgba(221, 148, 140, ${(0.6 * (1 - k)).toFixed(3)})`;
            ctx.lineWidth = 4 * u;
            ellipse(
                ctx,
                this.drum.x,
                this.drum.y - this.drum.r * 0.3,
                this.drum.r * (1.1 + k * 0.5),
                this.drum.r * (0.4 + k * 0.2)
            );
            ctx.stroke();
        }
    }

    drawBarnLife(ctx) {
        // The barn's door swings open as the parade comes home past it, and the rooster on its
        // roof stretches up to crow.
        const b = this.barnAt;
        const door = this.door.value;
        if (door > 0.01) farm.barn(ctx, b.x - b.s / 2, b.y - b.s * 0.87, b.s, { door });
        const rx = b.x + b.s * 0.02;
        const ry = b.y - b.s * 0.77;
        const stretch = Math.max(0, -this.rooster.value) * 0.04;
        farm.hen(ctx, rx, ry - stretch * b.s, b.s * 1.3, { rooster: true, facing: 1 });
    }

    // Where an animal is drawn: on the loop, in its lane, the ducks and the tortoise on the inside
    // and the hare on the outside, so one can pass another; and how big, nearer being bigger.
    place(a) {
        const at = this.at(a.s);
        const scale = lerp(0.72, 1, at.depth);
        const lane = a.lane * 26 * this.u * scale;
        return {
            a,
            at,
            k: this.k * SIZE[a.name] * scale,
            x: at.x - at.dy * lane,
            y: at.y + at.dx * lane * 0.5,
        };
    }

    drawAnimal(ctx, { a, at, k, x, y }) {
        const facing = at.dx >= 0 ? 1 : -1;
        const moving = a.t < 1 ? Math.sin(Math.PI * a.t) : 0;
        const hopping = a.name === 'hare' ? moving * 0.22 : a.name === 'duck' ? 0 : moving * 0.025;
        const sneeze = a.sneeze < 0 ? 0 : sneezeCurve(a.sneeze);
        const pose = {
            stride: a.phase * moving * (a.name === 'hare' ? 1 : 1),
            lift: hopping + Math.max(0, -a.hop.value) * 0.03,
            freeze: clamp(a.freeze.value, 0, 1.2),
            style: a.style,
            tilt: a.wobble.value * 0.06 + (a.name === 'duck' ? a.phase * moving * 0.12 : 0),
            sneeze,
            sit: clamp(a.sit.value, 0, 1),
            blink: this.time > a.blinkAt - 0.12 || a.state === 'rest',
            mouth: Math.max(a.mouth, sneeze < -0.5 ? 0.8 : 0),
            carry: this.stage.band ? CARRY[a.name] : null,
            hit: a.hit,
        };
        ellipse(ctx, x, y, k * 0.36, k * 0.08);
        ctx.fillStyle = 'rgba(92, 70, 58, 0.14)';
        ctx.fill();
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(facing, 1);
        DRAW[a.name](ctx, k, pose);
        ctx.restore();
    }

    exit() {
        freeLayer(this.bg);
        this.bg = null;
        this.invalidate();
    }
}

// A sneeze over time: the head goes back for "ah", back again further, then forward for "choo",
// and settles. Positive is back.
function sneezeCurve(t) {
    if (t < 0.25) return Math.sin((t / 0.25) * (Math.PI / 2)) * 0.6;
    if (t < 0.55) return 0.6 + Math.sin(((t - 0.25) / 0.3) * (Math.PI / 2)) * 0.4;
    if (t < 0.68) return 1 - ((t - 0.55) / 0.13) * 2;
    if (t < 1.3) return -1 + (t - 0.68) / 0.62;
    return 0;
}

function icon(ctx, x, y, w, h, u) {
    // A drum, and the cow and the duck marching past it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ellipse(ctx, x + w * 0.5, y + h * 0.62, w * 0.6, h * 0.1);
    ctx.fillStyle = '#E6D2B0';
    ctx.fill();
    ctx.save();
    ctx.translate(x + w * 0.38, y + h * 0.64);
    DRAW.cow(ctx, w * 0.42, { stride: 0.7, freeze: 0 });
    ctx.restore();
    ctx.save();
    ctx.translate(x + w * 0.78, y + h * 0.64);
    DRAW.duck(ctx, w * 0.3, { freeze: 1 });
    ctx.restore();
    ctx.restore();
    drawDrum(ctx, x + w * 0.5, y + h * 0.84, w * 0.13, u * 0.5);
}

export const toy = {
    id: 'parade',
    title: 'Freeze parade',
    about: 'The farm animals march round the meadow to the beat on a big drum: quick beats hurry them, slow ones slow them, and when the drum stops they freeze, in silly poses, until it starts again. At Sprout two ducks march to a tambourine; at Bloom a hare hops only to a quick beat, a tortoise walks only to a slow one, and the parade plays along as a band.',
    stages: [
        'One drum, and a cow, a sheep and a pig',
        'And a tambourine for two ducks',
        'And a quick hare, a slow tortoise, and a band that plays along',
    ],
    isNew: true,
    mat: shade(PALETTE.sage, 0.35),
    icon,
    create: (app) => new ParadeScene(app),
    sounds(level) {
        const stage = STAGES[level];
        const list = [
            ['drum', {}],
            ['pat', {}],
            ['wood', { f: noteHz(3, 60) }],
            ['wood', { f: noteHz(4, 72) }],
            ['wood', { f: noteHz(0, 72) }],
            ['crow', {}],
        ];
        for (const name of new Set(stage.animals)) {
            list.push(VOICES[name], ['sneeze', { f: SNEEZE[name] }]);
        }
        if (stage.tambourine) list.push(['jingle', {}]);
        if (stage.band) {
            list.push(['cymbal', {}]);
            for (const degree of new Set(MARCH)) list.push(['toot', { f: noteHz(degree, 60) }]);
        }
        return list;
    },
    signature() {
        audio.play('drum', {}, { gain: 0.6, delay: 0.05 });
        audio.play('drum', {}, { gain: 0.5, delay: 0.35 });
    },
};
