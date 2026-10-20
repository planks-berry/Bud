// The pink tower: wooden cubes in graduated sizes, on a work rug.
//
// In a Montessori room the tower is built largest at the bottom, and the material corrects itself:
// a big cube on a small one looks wrong and wobbles. This playroom chose open-ended play, so
// nothing here says right or wrong, and no order sounds better than another. A cube's note is its
// height, not its size: on the rug it plays the lowest note and each tier up plays the next, so a
// tower built in any order climbs the same scale from its base when its lowest cube is tapped.
// Size shows only in how full the knock is.
//
//   touch  - tap a cube: it hops and sounds, and so does every cube stacked on it, in turn.
//   move   - carry cubes and stack them; they settle with a knock. Pull one from the middle and
//            the ones above it drop.
//   make   - build towers; or throw a cube at one and knock it down.

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

const COUNTS = [5, 7, 10];
const SMALLEST = [0.42, 0.26, 0.1];
const PINKS = ['#F2BAC3', '#F4C1C9', '#F0B5BF'];

class TowerScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.count = COUNTS[this.level];
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
                squash: new Spring(0, 520, 14),
                settle: new Spring(0, 260, 12),
                colour: PINKS[rank % PINKS.length],
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
        o.vx = vx;
        o.vy = -140 * this.u;
        o.va = Math.sign(vx) * (2 + Math.random() * 2);
        o.below = null;
    }

    // The tier `c` stands on where it is now: 0 on the rug, otherwise one above the highest cube
    // under it. Its note is that many steps up the scale, whatever size it and its neighbours are.
    tierOf(c) {
        let tier = 0;
        for (const o of this.cubes) {
            if (o === c || o.state !== 'rest') continue;
            if (this.overlapX(c, o) <= 1 || Math.abs(this.surface(o, c) - c.y) >= 1.5) continue;
            tier = Math.max(tier, this.tierOf(o) + 1);
        }
        return tier;
    }

    // A big cube knocks fuller than a small one; that, and the thud on the rug, is all size does.
    fullness(c) {
        return 0.55 + 0.45 * (c.s / this.largest);
    }

    sound(c, gain, wet) {
        audio.note('wood', this.tierOf(c), 60, {
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
            c.angle = 0;
            c.settle.set(0);
            // Lifted off the tier it stood on: a light tick at that height.
            audio.play(
                'tick',
                { f: noteHz(this.tierOf(c), 72) },
                { gain: 0.25, pan: (c.x / this.w) * 2 - 1 }
            );
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
            // A tap: this cube and everything stacked on it sound in turn, bottom to top.
            this.above(c).forEach((cube, i) => this.sequence.push({ cube, at: this.time + i * 0.14 }));
            return;
        }
        c.state = 'fall';
        const limit = 1800 * u;
        c.vx = clamp(p.vx, -limit, limit);
        c.vy = clamp(p.vy, -limit, limit * 0.6);
        c.va = clamp(c.vx / (260 * u), -6, 6);
    }

    cancel(p) {
        if (p.owner && p.owner.lifted) p.owner.cube.state = 'fall';
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
    let bottom = base;
    sizes.forEach((s, i) => {
        const d = s * 0.22;
        const cx = x + w / 2;
        fillRound(ctx, cx - s / 2 + 3, bottom - s + 4, s, s, s * 0.06, 'rgba(112, 84, 58, 0.14)');
        fillRound(ctx, cx - s / 2, bottom - s - d, s, d + 4, s * 0.06, shade(PINKS[i % 3], 0.38));
        fillRound(ctx, cx - s / 2, bottom - s, s, s, s * 0.06, PINKS[i % 3]);
        const next = sizes[i + 1] || 0;
        bottom = bottom - s - (d - next * 0.22) / 2;
    });
    for (let i = 0; i < 2; i++) {
        const s = h * (0.14 - i * 0.04);
        const cx = x + w * (0.2 + i * 0.62);
        fillRound(ctx, cx - s / 2, base - s, s, s, s * 0.06, PINKS[(i + 1) % 3]);
    }
}

export const toy = {
    id: 'tower',
    title: 'Pink tower',
    about: 'Wooden cubes to stack and topple, in any order. The higher a cube sits, the higher its note.',
    stages: ['5 cubes', '7 cubes', '10 cubes, the smallest a tenth the size'],
    mat: '#F6DDE0',
    icon,
    create: (app) => new TowerScene(app),
    // A tower of every cube is the tallest there can be: one note per tier.
    sounds(level) {
        const list = [['thud', { f: 85 }]];
        for (let d = 0; d < COUNTS[level]; d++)
            list.push(['wood', { f: noteHz(d, 60) }], ['tick', { f: noteHz(d, 72) }]);
        return list;
    },
    signature() {
        [0, 1, 2].forEach((d, i) => audio.note('wood', d, 60, { gain: 0.6, delay: 0.05 + i * 0.1 }));
    },
};
