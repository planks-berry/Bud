// The colour tower: wooden cubes in graduated sizes and a few colours, on a work rug.
//
// It began as the Montessori pink tower, which is built largest at the bottom and corrects itself:
// a big cube on a small one looks wrong and wobbles. This playroom chose open-ended play, so the
// sizes stay graduated but no order is the right one. What a cube sounds is its colour. Each colour
// has its own note, the note it has as a paint on the easel, and the colours are mixed across the
// sizes, so building by size plays nothing special. A tower or a row of colours is a pattern, and a
// tapped cube plays the pattern from there: itself, what stands on it, then each column standing
// against it on the right.
//
//   touch  - tap a cube: it hops and sounds, then everything stacked on it, then the columns
//            touching on its right, in turn.
//   move   - carry cubes and stack them or line them up; they settle with a knock, and one set
//            down beside another slides up against it. Pull one from the middle and the ones above
//            it drop.
//   make   - build a pattern in colour and hear it played; or throw a cube at a tower.

import { Scene } from '../stage.js';
import {
    PALETTE,
    SHADOW_SOFT,
    makeLayer,
    freeLayer,
    grain,
    fillRound,
    ellipse,
    stitches,
    woodPanel,
} from '../draw.js';
import { Spring, clamp, shade, shuffle, rng, approach } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';

// Each colour's note is the one it has as a paint on the easel: red C, yellow E, green G, blue A,
// purple the C above.
const RED = { colour: '#E79A98', degree: 0 };
const YELLOW = { colour: '#F1CF5E', degree: 2 };
const GREEN = { colour: '#8EBF7A', degree: 3 };
const BLUE = { colour: '#7FB2DE', degree: 4 };
const PURPLE = { colour: '#AE93D6', degree: 5 };

// Largest first, for each stage: 2 colours of 3 cubes, 3 of 3, then 5 of 2. Every colour comes both
// large and small, and the sizes in order spell no repeating pattern, so a tower built by size
// plays nothing that a tower built any other way does not.
const SETS = [
    [RED, BLUE, BLUE, RED, RED, BLUE],
    [RED, BLUE, YELLOW, YELLOW, RED, BLUE, BLUE, YELLOW, RED],
    [RED, BLUE, YELLOW, GREEN, PURPLE, PURPLE, YELLOW, GREEN, RED, BLUE],
];
const SMALLEST = [0.42, 0.26, 0.1];

// The time between two cubes of a pattern playing back, in seconds.
const STEP = 0.18;

class TowerScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        const set = SETS[this.level];
        this.count = set.length;
        this.time = 0;
        this.sequence = [];
        this.cubes = [];
        for (let rank = 0; rank < this.count; rank++) {
            this.cubes.push({
                rank,
                x: 0,
                y: 0,
                s: 0,
                d: 0,
                vx: 0,
                vy: 0,
                angle: 0,
                va: 0,
                state: 'rest',
                below: null,
                ignore: null,
                ignoreTime: 0,
                alignTo: null,
                slideTo: null,
                placing: false,
                squash: new Spring(0, 520, 14),
                settle: new Spring(0, 260, 12),
                colour: set[rank].colour,
                degree: set[rank].degree,
            });
        }
        this.bg = null;
        this.placed = false;
    }

    layout() {
        freeLayer(this.bg);
        const { w, h, u } = this;
        this.floor = h * 0.84;
        this.left = w * 0.03;
        this.right = w * 0.97;
        this.gravity = 2600 * u;

        // The largest size that lets every cube stand on the rug side by side, and the whole tower
        // stand below the top of the screen.
        const minRatio = SMALLEST[this.level];
        const meanRatio = (1 + minRatio) / 2;
        const gaps = 18 * u * (this.count + 1);
        const byWidth = (w * 0.92 - gaps) / (this.count * meanRatio);
        const byHeight = (this.floor - 100 * u) / (this.count * meanRatio * 1.05);
        const largest = Math.min(byWidth, byHeight, 170 * u);
        this.largest = largest;
        for (const c of this.cubes) {
            const t = this.count > 1 ? c.rank / (this.count - 1) : 0;
            c.s = largest * (1 - t * (1 - minRatio));
            c.d = c.s * 0.22;
        }

        // Laid out on the rug in no particular order, the way a child might find them.
        const order = this.placed
            ? this.cubes.slice().sort((a, b) => a.x - b.x)
            : shuffle(this.cubes, rng(Date.now() % 100000));
        const total = order.reduce((sum, c) => sum + c.s, 0);
        const gap = Math.max(6 * u, (w * 0.92 - total) / (this.count + 1));
        let x = w * 0.04 + gap;
        for (const c of order) {
            c.x = x + c.s / 2;
            c.y = this.floor;
            c.vx = 0;
            c.vy = 0;
            c.angle = 0;
            c.state = 'rest';
            c.below = null;
            x += c.s + gap;
        }
        this.placed = true;
        this.drawBackground();
    }

    drawBackground() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const wall = ctx.createLinearGradient(0, 0, 0, this.floor);
        wall.addColorStop(0, '#FBF1EC');
        wall.addColorStop(1, '#F5E6DE');
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, h);
        woodPanel(
            ctx,
            -10,
            this.floor - 46 * u,
            w + 20,
            h - this.floor + 60 * u,
            0,
            PALETTE.wood,
            33,
            this.scale
        );

        // The work rug: where the work happens, and where it stays until it is put away.
        const rx = w * 0.03;
        const ry = this.floor - 30 * u;
        const rw = w * 0.94;
        const rh = 74 * u;
        fillRound(ctx, rx, ry + 6 * u, rw, rh, 16 * u, SHADOW_SOFT);
        fillRound(ctx, rx, ry, rw, rh, 16 * u, '#EADFCB');
        stitches(
            ctx,
            rx + 9 * u,
            ry + 9 * u,
            rw - 18 * u,
            rh - 18 * u,
            10 * u,
            'rgba(160, 130, 100, 0.35)',
            2 * u,
            8 * u
        );
        grain(ctx, 0, 0, w, h, 0.3, this.scale);
        this.bg = layer;
    }

    //--------------------------------------------------------------------------
    // Physics: just enough to stack, slide off an edge, tumble and land. Cubes collide as their
    // front faces; the top face is drawn, never hit.

    // Where `upper`'s bottom rests when it sits centred in depth on `lower`'s top face.
    surface(lower, upper) {
        return lower.y - lower.s - (lower.d - upper.d) / 2;
    }

    overlapX(a, b) {
        return (a.s + b.s) / 2 - Math.abs(a.x - b.x);
    }

    support(c, from) {
        let best = { y: this.floor, under: [] };
        for (const o of this.cubes) {
            if (o === c || o.state !== 'rest') continue;
            if (c.ignore === o && this.time < c.ignoreTime) continue;
            if (this.overlapX(c, o) <= 1) continue;
            const top = this.surface(o, c);
            if (top < from - 2) continue;
            if (top < best.y - 0.5) best = { y: top, under: [o] };
            else if (Math.abs(top - best.y) <= 0.5) best.under.push(o);
        }
        return best;
    }

    balanced(c, under) {
        if (!under.length) return true;
        let lo = Infinity;
        let hi = -Infinity;
        for (const o of under) {
            lo = Math.min(lo, o.x - o.s / 2);
            hi = Math.max(hi, o.x + o.s / 2);
        }
        return c.x >= lo && c.x <= hi;
    }

    knock(o, vx) {
        if (o.state !== 'rest') return;
        o.state = 'fall';
        o.placing = false;
        o.vx = vx;
        o.vy = -140 * this.u;
        o.va = Math.sign(vx) * (2 + Math.random() * 2);
        o.below = null;
    }

    // A big cube knocks fuller than a small one; that, and the thud on the rug, is all size does to
    // the sound. The note is the colour's.
    fullness(c) {
        return 0.55 + 0.45 * (c.s / this.largest);
    }

    sound(c, gain, wet) {
        audio.note('wood', c.degree, 60, {
            gain: gain * this.fullness(c),
            pan: (c.x / this.w) * 2 - 1,
            wet,
        });
    }

    land(c, impact, onFloor) {
        // Harder landings knock louder, from a soft settle to a little above a tap.
        const strength = clamp(impact / (1400 * this.u), 0.2, 1.4);
        c.squash.kick(clamp(impact / (300 * this.u), 1, 9));
        this.sound(c, strength * 0.85, 0.15);
        if (onFloor && impact > 700 * this.u && c.rank < this.count / 2) {
            audio.play('thud', { f: 85 }, { gain: strength * 0.5, pan: (c.x / this.w) * 2 - 1 });
        }
    }

    rest(c, sup) {
        c.state = 'rest';
        c.vx = 0;
        c.vy = 0;
        c.va = 0;
        // Settle onto the nearest face: a tumbling cube lands flat, with a little rock.
        const quarter = Math.PI / 2;
        const remainder = c.angle - Math.round(c.angle / quarter) * quarter;
        c.angle = 0;
        c.settle.value = remainder;
        c.settle.target = 0;
        c.below = sup.under.length ? sup.under[0] : null;
        // Near enough to centred is taken as centred, which is how a careful hand builds.
        if (sup.under.length === 1) {
            const o = sup.under[0];
            if (Math.abs(c.x - o.x) < o.s * 0.16) c.alignTo = o;
        }
        // And set down on the rug near enough to another is taken as against it, so a row is easy
        // to make. Only a cube put down by a hand: one thrown or knocked flying lands where it lands.
        if (!sup.under.length && c.placing) c.slideTo = this.besideOnRug(c);
        c.placing = false;
    }

    // Where `c` would stand against its nearest neighbour on the rug, if one is near enough and it
    // is not already against another.
    besideOnRug(c) {
        let best = null;
        let bestGap = Infinity;
        for (const o of this.cubes) {
            if (o === c || o.state !== 'rest' || o.y < this.floor - 0.5) continue;
            const gap = Math.abs(c.x - o.x) - (c.s + o.s) / 2;
            if (gap <= 0.5) return null;
            const reach = Math.max(14 * this.u, 0.3 * Math.min(c.s, o.s));
            if (gap > reach || gap >= bestGap) continue;
            bestGap = gap;
            best = o.x + ((c.x < o.x ? -1 : 1) * (c.s + o.s)) / 2;
        }
        return best;
    }

    stepFalling(c, dt) {
        const u = this.u;
        const from = c.y;
        c.vy += this.gravity * dt;
        c.x += c.vx * dt;
        c.y += c.vy * dt;
        c.angle += c.va * dt;
        c.vx *= Math.exp(-dt * 0.4);

        if (c.x - c.s / 2 < this.left) {
            c.x = this.left + c.s / 2;
            c.vx = Math.abs(c.vx) * 0.35;
        } else if (c.x + c.s / 2 > this.right) {
            c.x = this.right - c.s / 2;
            c.vx = -Math.abs(c.vx) * 0.35;
        }

        // Side hits: push out sideways; a fast one knocks the other cube over.
        for (const o of this.cubes) {
            if (o === c || o.state !== 'rest') continue;
            const ox = this.overlapX(c, o);
            if (ox <= 0) continue;
            const overlapY = Math.min(c.y, o.y) - Math.max(c.y - c.s, o.y - o.s);
            if (overlapY <= 0) continue;
            if (from <= this.surface(o, c) + 1) continue;
            const dir = c.x < o.x ? -1 : 1;
            c.x += dir * ox;
            if (Math.abs(c.vx) > 320 * u) {
                this.sound(o, 0.7, 0.15);
                this.knock(o, c.vx * 0.55 * Math.sqrt(c.s / o.s));
            }
            c.vx = dir * Math.abs(c.vx) * 0.3;
        }

        const sup = this.support(c, from);
        if (c.y < sup.y) return;
        c.y = sup.y;
        const impact = c.vy;
        if (!this.balanced(c, sup.under)) {
            // Over the edge: slide off and keep falling.
            let lo = Infinity;
            let hi = -Infinity;
            for (const o of sup.under) {
                lo = Math.min(lo, o.x);
                hi = Math.max(hi, o.x);
            }
            const dir = c.x < (lo + hi) / 2 ? -1 : 1;
            c.vx = dir * (110 * u + Math.abs(c.vx));
            c.va = dir * 4.5;
            c.vy = -40 * u;
            c.ignore = sup.under[0];
            c.ignoreTime = this.time + 0.35;
            this.land(c, impact * 0.6, false);
            return;
        }
        if (impact > 650 * u) {
            c.vy = -impact * 0.22;
            c.vx *= 0.6;
            c.va *= 0.5;
            this.land(c, impact, !sup.under.length);
            return;
        }
        this.rest(c, sup);
        this.land(c, impact, !sup.under.length);
    }

    stillSupported(c) {
        if (c.y >= this.floor - 0.5) return { ok: true, under: [] };
        const under = [];
        for (const o of this.cubes) {
            if (o === c || o.state !== 'rest') continue;
            if (this.overlapX(c, o) <= 1) continue;
            if (Math.abs(this.surface(o, c) - c.y) < 1.5) under.push(o);
        }
        return { ok: under.length > 0 && this.balanced(c, under), under };
    }

    // The cube at the bottom of the column `c` stands in.
    baseOf(c) {
        let base = c;
        for (let i = 0; i < this.count; i++) {
            const under = this.stillSupported(base).under;
            if (!under.length) break;
            base = under.reduce((best, o) => (this.overlapX(base, o) > this.overlapX(base, best) ? o : best));
        }
        return base;
    }

    // The column standing against `base` on its right, on the rug, if there is one.
    rightOf(base) {
        if (base.y < this.floor - 0.5) return null;
        const edge = base.x + base.s / 2;
        let best = null;
        for (const o of this.cubes) {
            if (o === base || o.state !== 'rest' || o.y < this.floor - 0.5 || o.x <= base.x) continue;
            if (o.x - o.s / 2 - edge > 3 * this.u) continue;
            if (!best || o.x < best.x) best = o;
        }
        return best;
    }

    // What a tap on `c` plays, in order: `c` and what stands on it, then each column standing
    // against it on the right, bottom to top, until the row ends. A cube resting on two columns
    // plays once.
    playOrder(c) {
        const order = [];
        const add = (cubes) => {
            for (const o of cubes) if (order.indexOf(o) < 0) order.push(o);
        };
        add(this.above(c));
        for (let next = this.rightOf(this.baseOf(c)); next; next = this.rightOf(next)) add(this.above(next));
        return order;
    }

    // The chain of cubes resting on `c`, then on those, upwards.
    above(c) {
        const chain = [c];
        let level = [c];
        while (level.length && chain.length < this.count) {
            const next = [];
            for (const o of this.cubes) {
                if (o.state !== 'rest' || chain.indexOf(o) >= 0) continue;
                for (const l of level) {
                    if (this.overlapX(o, l) > 1 && Math.abs(this.surface(l, o) - o.y) < 1.5) {
                        next.push(o);
                        break;
                    }
                }
            }
            next.sort((a, b) => a.x - b.x);
            for (const o of next) chain.push(o);
            level = next;
        }
        return chain;
    }

    //--------------------------------------------------------------------------
    // Touch

    cubeAt(x, y) {
        const order = this.drawOrder();
        for (let i = order.length - 1; i >= 0; i--) {
            const c = order[i];
            const pad = 10 * this.u;
            if (
                x > c.x - c.s / 2 - pad &&
                x < c.x + c.s / 2 + pad &&
                y > c.y - c.s - c.d - pad &&
                y < c.y + pad
            )
                return c;
        }
        return null;
    }

    down(p) {
        const c = this.cubeAt(p.x, p.y);
        if (!c || c.state === 'held') return;
        p.owner = { cube: c, dx: c.x - p.x, dy: c.y - p.y, lifted: false };
        c.squash.kick(2);
    }

    move(p) {
        const o = p.owner;
        if (!o) return;
        const c = o.cube;
        const u = this.u;
        if (!o.lifted) {
            if (p.travel < 8 * u) return;
            o.lifted = true;
            c.state = 'held';
            c.below = null;
            c.alignTo = null;
            c.slideTo = null;
            c.angle = 0;
            c.settle.set(0);
            audio.play('tick', { f: noteHz(c.degree, 72) }, { gain: 0.25, pan: (c.x / this.w) * 2 - 1 });
        }
        c.x = clamp(p.x + o.dx, this.left + c.s / 2, this.right - c.s / 2);
        c.y = clamp(p.y + o.dy, c.s + c.d + 4 * u, this.floor);

        // Swept fast through a resting cube, the held one knocks it over.
        if (Math.abs(p.vx) > 450 * u) {
            for (const other of this.cubes) {
                if (other === c || other.state !== 'rest') continue;
                const overlapY = Math.min(c.y, other.y) - Math.max(c.y - c.s, other.y - other.s);
                if (this.overlapX(c, other) > 4 * u && overlapY > 4 * u) {
                    this.sound(other, 0.75, 0.15);
                    this.knock(other, p.vx * 0.5);
                }
            }
        }
    }

    up(p) {
        const o = p.owner;
        if (!o) return;
        const c = o.cube;
        const u = this.u;
        if (!o.lifted) {
            // A tap plays the pattern from here. Taps can overlap, so the queue is kept in time order.
            this.playOrder(c).forEach((cube, i) => this.sequence.push({ cube, at: this.time + i * STEP }));
            this.sequence.sort((a, b) => a.at - b.at);
            return;
        }
        c.state = 'fall';
        const limit = 1800 * u;
        c.vx = clamp(p.vx, -limit, limit);
        c.vy = clamp(p.vy, -limit, limit * 0.6);
        c.va = clamp(c.vx / (260 * u), -6, 6);
        // Set down, not thrown.
        c.placing = Math.abs(c.vx) < 500 * u && Math.abs(c.vy) < 500 * u;
    }

    cancel(p) {
        if (!p.owner || !p.owner.lifted) return;
        p.owner.cube.state = 'fall';
        p.owner.cube.placing = true;
    }

    //--------------------------------------------------------------------------

    update(dt) {
        this.time += dt;
        let busy = this.sequence.length > 0;

        const steps = Math.ceil(dt / (1 / 120));
        const h = dt / steps;
        for (let s = 0; s < steps; s++) {
            for (const c of this.cubes) if (c.state === 'fall') this.stepFalling(c, h);
            // Anything whose support has gone, falls; it carries a little of its support's motion.
            for (const c of this.cubes) {
                if (c.state !== 'rest') continue;
                const sup = this.stillSupported(c);
                if (!sup.ok) {
                    c.state = 'fall';
                    c.vy = 0;
                    if (c.below) {
                        c.vx = c.below.vx * 0.7;
                        c.va = c.below.va * 0.5;
                    }
                    c.below = null;
                }
            }
        }

        for (const c of this.cubes) {
            if (c.state === 'fall' || c.state === 'held') busy = true;
            if (c.alignTo) {
                if (c.state !== 'rest' || c.alignTo.state !== 'rest') c.alignTo = null;
                else {
                    c.x = approach(c.x, c.alignTo.x, 16, dt);
                    if (Math.abs(c.x - c.alignTo.x) < 0.1) c.alignTo = null;
                    busy = true;
                }
            }
            if (c.slideTo !== null) {
                if (c.state !== 'rest') c.slideTo = null;
                else {
                    c.x = approach(c.x, c.slideTo, 16, dt);
                    // Exactly against it at the end, so the row is a row.
                    if (Math.abs(c.x - c.slideTo) < 0.1) {
                        c.x = c.slideTo;
                        c.slideTo = null;
                    }
                    busy = true;
                }
            }
            if (c.squash.update(dt)) busy = true;
            if (c.settle.update(dt)) busy = true;
        }

        while (this.sequence.length && this.sequence[0].at <= this.time) {
            const c = this.sequence.shift().cube;
            c.squash.kick(7);
            this.sound(c, 1, 0.2);
        }
        return busy;
    }

    //--------------------------------------------------------------------------

    drawOrder() {
        const resting = this.cubes.filter((c) => c.state === 'rest').sort((a, b) => b.y - a.y);
        const moving = this.cubes.filter((c) => c.state !== 'rest');
        return resting.concat(moving);
    }

    draw(ctx) {
        const u = this.u;
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);

        // Shadows on the rug, shrinking as a cube rises.
        for (const c of this.cubes) {
            const height = this.floor - c.y;
            const fade = clamp(1 - height / (this.floor * 0.8), 0.25, 1);
            ellipse(ctx, c.x + 4 * u, this.floor + 4 * u, (c.s / 2 + 6 * u) * fade, 9 * u * fade);
            ctx.fillStyle = `rgba(112, 84, 58, ${0.14 * fade})`;
            ctx.fill();
        }

        for (const c of this.drawOrder()) this.drawCube(ctx, c);
    }

    drawCube(ctx, c) {
        const s = c.s;
        const d = c.d;
        const r = Math.max(2, s * 0.06);
        const squash = c.squash.value * 0.012;
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.angle + c.settle.value);
        ctx.scale(1 + squash, 1 - squash * 1.3);
        ctx.translate(0, -s / 2);
        if (c.state === 'held') {
            fillRound(
                ctx,
                -s / 2 + 6 * this.u,
                -s / 2 - d + 10 * this.u,
                s,
                s + d,
                r,
                'rgba(112, 84, 58, 0.12)'
            );
        }
        fillRound(ctx, -s / 2, -s / 2 - d, s, d + r * 2, r, shade(c.colour, 0.38));
        fillRound(ctx, -s / 2, -s / 2, s, s, r, c.colour);
        fillRound(ctx, -s / 2, s / 2 - s * 0.12, s, s * 0.12, r, shade(c.colour, -0.08));
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(-s / 2 + r, -s / 2 + 1, s - r * 2, Math.max(1.5, s * 0.025));
        ctx.restore();
    }

    exit() {
        freeLayer(this.bg);
        this.bg = null;
    }
}

function icon(ctx, x, y, w, h) {
    const base = y + h * 0.88;
    const sizes = [h * 0.32, h * 0.24, h * 0.17, h * 0.11];
    const tower = [BLUE, RED, YELLOW, RED];
    let bottom = base;
    sizes.forEach((s, i) => {
        const d = s * 0.22;
        const cx = x + w / 2;
        const colour = tower[i].colour;
        fillRound(ctx, cx - s / 2 + 3, bottom - s + 4, s, s, s * 0.06, 'rgba(112, 84, 58, 0.14)');
        fillRound(ctx, cx - s / 2, bottom - s - d, s, d + 4, s * 0.06, shade(colour, 0.38));
        fillRound(ctx, cx - s / 2, bottom - s, s, s, s * 0.06, colour);
        const next = sizes[i + 1] || 0;
        bottom = bottom - s - (d - next * 0.22) / 2;
    });
    [RED, BLUE].forEach((kind, i) => {
        const s = h * (0.14 - i * 0.04);
        const cx = x + w * (0.2 + i * 0.62);
        fillRound(ctx, cx - s / 2, base - s - s * 0.22, s, s * 0.22 + 4, s * 0.06, shade(kind.colour, 0.38));
        fillRound(ctx, cx - s / 2, base - s, s, s, s * 0.06, kind.colour);
    });
}

export const toy = {
    id: 'tower',
    title: 'Colour tower',
    about: 'Graduated cubes in a few colours, each colour its own note. Build a pattern, then tap its first cube to hear it.',
    stages: ['6 cubes in 2 colours', '9 cubes in 3 colours', '10 cubes in 5 colours'],
    mat: '#E4ECF3',
    icon,
    create: (app) => new TowerScene(app),
    sounds(level) {
        const list = [['thud', { f: 85 }]];
        const degrees = [];
        for (const kind of SETS[level]) if (degrees.indexOf(kind.degree) < 0) degrees.push(kind.degree);
        for (const d of degrees) list.push(['wood', { f: noteHz(d, 60) }], ['tick', { f: noteHz(d, 72) }]);
        return list;
    },
    signature() {
        [RED, BLUE, RED].forEach((kind, i) =>
            audio.note('wood', kind.degree, 60, { gain: 0.6, delay: 0.05 + i * 0.12 })
        );
    },
};
