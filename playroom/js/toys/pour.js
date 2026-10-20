// Pouring: pitchers of coloured water, empty glasses, a bowl to empty into and a sponge.
//
// Pouring is among the first Montessori practical life activities, offered from about two: a small
// pitcher, a glass, a tray and a sponge for what goes astray. Here the water behaves the way water
// does, which is the whole of the lesson:
//
//   - A held pitcher over a glass tilts until the water reaches its spout, and pours. An emptier
//     pitcher has to tilt further, as a real one does.
//   - The pouring sound rises as the glass fills: it is the air column above the water ringing,
//     and it shortens. Every child who has filled a bottle at a tap knows the sound.
//   - A tapped glass rings, lower the fuller it is.
//   - Colours mix the way paint does: blue and yellow make green.
//   - A glass poured past full overflows onto the tray, and the sponge wipes it up. A pitcher put
//     back on its place fills up again.
//
// None of it is a task. There is nothing to fill to a line and no spill is a mistake: spilling is
// just what happens when you keep pouring, and wiping is its own small pleasure.

import { Scene } from '../stage.js';
import {
    PALETTE,
    SHADOW,
    makeLayer,
    freeLayer,
    grain,
    roundRect,
    fillRound,
    woodPanel,
    disc,
    ellipse,
} from '../draw.js';
import { Spring, clamp, approach, pigmentColour, rgbString, mixRgb, random, rng, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';

const RATE = 0.55;
const SETS = [
    { pitchers: [[0, 0, 1]], glasses: 2 },
    {
        pitchers: [
            [0, 1, 0],
            [0, 0, 1],
        ],
        glasses: 3,
    },
    {
        pitchers: [
            [0, 1, 0],
            [0, 0, 1],
            [1, 0, 0],
        ],
        glasses: 4,
    },
];

// Fuller rings lower: an empty glass at A6, a full one an octave and a half down.
function ringDegree(v) {
    const fill = clamp(v.vol / v.cap, 0, 1);
    return v.kind === 'glass' ? Math.round(14 - fill * 6) : Math.round(11 - fill * 5);
}

function mixLoad(a, va, b, vb) {
    const total = va + vb;
    if (total <= 1e-9) return [0, 0, 0];
    return [
        (a[0] * va + b[0] * vb) / total,
        (a[1] * va + b[1] * vb) / total,
        (a[2] * va + b[2] * vb) / total,
    ];
}

class PourScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.time = 0;
        this.vessels = [];
        const set = SETS[this.level];
        set.pitchers.forEach((src) => this.vessels.push(this.makeVessel('pitcher', src)));
        for (let i = 0; i < set.glasses; i++) this.vessels.push(this.makeVessel('glass', null));
        // Alternate pitchers and glasses along the tray.
        const pitchers = this.vessels.filter((v) => v.kind === 'pitcher');
        const glasses = this.vessels.filter((v) => v.kind === 'glass');
        this.order = [];
        for (let i = 0; i < Math.max(pitchers.length, glasses.length); i++) {
            if (pitchers[i]) this.order.push(pitchers[i]);
            if (glasses[i]) this.order.push(glasses[i]);
        }
        this.basin = { vol: 0, pig: [0, 0, 0], ripple: 0 };
        this.sponge = {
            wet: 0,
            tint: [255, 226, 140],
            held: null,
            squish: new Spring(0, 300, 12),
            lastSqueak: 0,
        };
        this.puddles = [];
        this.stream = null;
        this.pourSound = new audio.Texture('pour');
        this.lastGlug = 0;
        this.bg = null;
        this.placed = false;
    }

    makeVessel(kind, src) {
        return {
            kind,
            src,
            pig: src ? src.slice() : [0, 0, 0],
            vol: 0,
            cap: kind === 'pitcher' ? 2.4 : 1,
            x: 0,
            y: 0,
            vy: 0,
            home: 0,
            angle: 0,
            side: -1,
            flip: new Spring(1, 260, 22),
            lift: new Spring(0, 300, 20),
            slosh: new Spring(0, 90, 4),
            held: null,
            dx: 0,
            dy: 0,
            lastX: 0,
            vx: 0,
            refill: 0,
            ring: 0,
            slideTo: null,
        };
    }

    layout() {
        freeLayer(this.bg);
        const { w, h, u } = this;
        this.table = h * 0.72;
        this.tray = { x: w * 0.03, y: this.table - 8 * u, w: w * 0.94, h: 54 * u };

        const sizes = { pitcher: [112, 150, 14, 14], glass: [74, 112, 10, 12] };
        const basinW = 190;
        const spongeW = 100;
        const gaps = this.order.length + 3;
        const needed = this.order.reduce((sum, v) => sum + sizes[v.kind][0], 0) + basinW + spongeW;
        const k = Math.min(1.15, (this.tray.w - gaps * 22 * u) / (needed * u));
        this.k = k;
        for (const v of this.order) {
            const s = sizes[v.kind];
            v.w = s[0] * u * k;
            v.h = s[1] * u * k;
            v.iw = v.w - s[2] * u * k;
            v.bottom = s[3] * u * k;
            v.ih = v.h - v.bottom;
        }

        this.basin.w = basinW * u * k;
        this.basin.h = 70 * u * k;
        this.sponge.w = spongeW * u * k * 0.9;
        this.sponge.h = 54 * u * k;

        const gap = (this.tray.w - needed * u * k) / gaps;
        let x = this.tray.x + gap * 1.5;
        this.basin.x = x + this.basin.w / 2;
        this.basin.y = this.table;
        x += this.basin.w + gap;
        for (const v of this.order) {
            if (!this.placed) {
                v.x = x + v.w / 2;
                v.y = this.table;
                if (v.src) v.vol = v.cap * 0.85;
            } else {
                v.x = clamp((v.x / this.lastW) * w, this.tray.x + v.w, this.tray.x + this.tray.w - v.w);
                v.y = this.table;
            }
            v.home = x + v.w / 2;
            x += v.w + gap;
        }
        this.sponge.home = { x: x + this.sponge.w / 2, y: this.table - this.sponge.h / 2 };
        this.sponge.x = this.sponge.home.x;
        this.sponge.y = this.sponge.home.y;
        this.placed = true;
        this.lastW = w;
        this.puddles = [];
        this.drawBackground();
    }

    drawBackground() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const wall = ctx.createLinearGradient(0, 0, 0, this.table);
        wall.addColorStop(0, '#EEF5F1');
        wall.addColorStop(1, '#E4EEE9');
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, h);
        // A window's light falling across the wall.
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(w * 0.55, 0);
        ctx.lineTo(w * 0.8, 0);
        ctx.lineTo(w * 0.62, this.table);
        ctx.lineTo(w * 0.3, this.table);
        ctx.closePath();
        ctx.fill();
        woodPanel(
            ctx,
            -10,
            this.table - 20 * u,
            w + 20,
            h - this.table + 40 * u,
            0,
            PALETTE.wood,
            71,
            this.scale
        );
        const t = this.tray;
        fillRound(ctx, t.x + 3 * u, t.y + 8 * u, t.w, t.h, 18 * u, SHADOW);
        fillRound(ctx, t.x, t.y, t.w, t.h, 18 * u, '#DCE6E2');
        fillRound(ctx, t.x + 8 * u, t.y + 6 * u, t.w - 16 * u, t.h - 18 * u, 12 * u, '#E9F0ED');
        grain(ctx, 0, 0, w, h, 0.22, this.scale);
        this.bg = layer;
    }

    //--------------------------------------------------------------------------
    // Geometry. A vessel's local frame has its origin at the middle of its base, y upwards
    // negative, and it tilts about its centre.

    toWorld(v, lx, ly) {
        const cx = 0;
        const cy = -v.h / 2;
        const c = Math.cos(v.angle);
        const s = Math.sin(v.angle);
        const x = lx - cx;
        const y = ly - cy;
        return { x: v.x + cx + x * c - y * s, y: v.y + cy + x * s + y * c };
    }

    // How deep the water stands in a vessel, in pixels.
    depth(v) {
        return clamp(v.vol / v.cap, 0, 1) * v.ih;
    }

    // The tilt at which the water just reaches the rim. For a straight-sided vessel, tilting
    // about the middle of the surface conserves the water's area, so the surface rises at the
    // rim by half the width times the tangent of the tilt.
    neededTilt(v) {
        const headroom = v.ih - this.depth(v);
        return Math.atan2(headroom, v.iw / 2);
    }

    spout(v) {
        const lip = v.kind === 'pitcher' ? 12 * this.u * this.k : 2 * this.u;
        return this.toWorld(v, v.side * (v.iw / 2 + lip), -v.h);
    }

    opening(t) {
        if (t === this.basin) return { x0: t.x - t.w * 0.42, x1: t.x + t.w * 0.42, rim: t.y - t.h };
        return { x0: t.x - t.iw / 2, x1: t.x + t.iw / 2, rim: t.y - t.h };
    }

    surfaceY(t) {
        if (t === this.basin) return t.y - t.h * 0.25;
        return t.y - t.bottom - this.depth(t);
    }

    receive(t, amount, pig) {
        if (t === this.basin) {
            t.pig = mixLoad(t.pig, t.vol, pig, amount);
            t.vol = Math.min(1.5, t.vol + amount);
            return;
        }
        t.pig = mixLoad(t.pig, t.vol, pig, amount);
        t.vol += amount;
        t.slosh.kick(0.6 * (Math.random() - 0.5));
        if (t.vol > t.cap) {
            const extra = t.vol - t.cap;
            t.vol = t.cap;
            const side = t.x < this.w / 2 ? 1 : -1;
            this.spill(t.x + side * (t.w / 2 + 10 * this.u), extra, t.pig);
        }
    }

    spill(x, amount, pig) {
        const y = this.table + 14 * this.u;
        let puddle = this.puddles.find((p) => Math.abs(p.x - x) < this.puddleRadius(p) + 20 * this.u);
        if (!puddle) {
            if (this.puddles.length > 8) this.puddles.shift();
            puddle = { x, y, vol: 0, pig: pig.slice(), seed: Math.floor(Math.random() * 1000) };
            this.puddles.push(puddle);
        }
        puddle.pig = mixLoad(puddle.pig, puddle.vol, pig, amount);
        puddle.vol = Math.min(2.5, puddle.vol + amount);
        if (Math.random() < 0.08) audio.note('drop', 0, 48, { gain: 0.5, pan: (x / this.w) * 2 - 1 });
    }

    puddleRadius(p) {
        return (16 + 50 * Math.sqrt(p.vol)) * this.u;
    }

    //--------------------------------------------------------------------------
    // Touch

    vesselAt(x, y) {
        for (let i = this.vessels.length - 1; i >= 0; i--) {
            const v = this.vessels[i];
            const pad = 16 * this.u;
            if (x > v.x - v.w / 2 - pad && x < v.x + v.w / 2 + pad && y > v.y - v.h - pad && y < v.y + pad)
                return v;
        }
        return null;
    }

    down(p) {
        const u = this.u;
        const sp = this.sponge;
        if (
            !sp.held &&
            Math.abs(p.x - sp.x) < sp.w / 2 + 14 * u &&
            Math.abs(p.y - sp.y) < sp.h / 2 + 14 * u
        ) {
            sp.held = p;
            sp.dx = sp.x - p.x;
            sp.dy = sp.y - p.y;
            sp.squish.kick(4);
            audio.play('pat', {}, { gain: 0.3 });
            p.owner = { kind: 'sponge' };
            return;
        }
        const v = this.vesselAt(p.x, p.y);
        if (v && !v.held) {
            v.held = p;
            v.dx = v.x - p.x;
            v.dy = v.y - p.y;
            v.lastX = v.x;
            v.slideTo = null;
            v.lift.target = 1;
            v.refill = 0;
            // Bring it to the front.
            this.vessels.splice(this.vessels.indexOf(v), 1);
            this.vessels.push(v);
            p.owner = { kind: 'vessel', v };
            return;
        }
        if (
            Math.abs(p.x - this.basin.x) < this.basin.w / 2 &&
            Math.abs(p.y - (this.basin.y - this.basin.h / 2)) < this.basin.h
        ) {
            this.basin.ripple = 1;
            audio.play('gulp', { f: 220 }, { gain: 0.65 });
        }
    }

    move(p) {
        const o = p.owner;
        if (!o) return;
        const u = this.u;
        if (o.kind === 'sponge') {
            const sp = this.sponge;
            sp.x = clamp(p.x + sp.dx, sp.w / 2, this.w - sp.w / 2);
            sp.y = clamp(p.y + sp.dy, 90 * u, this.table + 10 * u - sp.h / 2);
            return;
        }
        const v = o.v;
        v.x = clamp(p.x + v.dx, this.tray.x + v.w / 2, this.tray.x + this.tray.w - v.w / 2);
        v.y = clamp(p.y + v.dy, v.h + 70 * u, this.table);
    }

    up(p) {
        const o = p.owner;
        if (!o) return;
        if (o.kind === 'sponge') {
            const sp = this.sponge;
            sp.held = null;
            if (Math.abs(sp.x - this.basin.x) < this.basin.w / 2 && sp.wet > 0.05) {
                // Wrung out over the bowl.
                this.receive(this.basin, sp.wet * 0.5, [0, 0, 0]);
                for (let i = 0; i < 4; i++)
                    audio.play('drop', { f: noteHz(i, 60) }, { gain: 0.5, delay: i * 0.09 });
                sp.wet = 0;
                sp.squish.kick(8);
            }
            return;
        }
        const v = o.v;
        v.held = null;
        v.lift.target = 0;
        if (p.travel < 10 * this.u) {
            // A tap on a glass rings it, lower the fuller it is: a glass harp, tuned to the same
            // pentatonic scale as everything else.
            audio.note('tink', ringDegree(v), 60, { gain: 1, pan: (v.x / this.w) * 2 - 1, wet: 0.3 });
            v.ring = 1;
        }
    }

    //--------------------------------------------------------------------------
    // Time

    update(dt) {
        const u = this.u;
        this.time += dt;
        let busy = false;
        let pouring = null;

        for (const v of this.vessels) {
            if (v.lift.update(dt)) busy = true;
            if (v.flip.update(dt)) busy = true;
            if (v.slosh.update(dt)) busy = true;
            v.slosh.value = clamp(v.slosh.value, -0.4, 0.4);
            if (v.ring > 0) {
                v.ring = Math.max(0, v.ring - dt * 2);
                busy = true;
            }

            // Water lags behind a moving vessel and sloshes.
            const vx = (v.x - v.lastX) / Math.max(dt, 1e-3);
            const accel = (vx - v.vx) / Math.max(dt, 1e-3);
            v.vx = vx;
            v.lastX = v.x;
            if (Math.abs(accel) > 1) v.slosh.kick(clamp((-accel * 0.000012) / u, -0.25, 0.25));

            if (v.held) {
                busy = true;
                const target = this.findTarget(v);
                if (target && v.vol > 0.002) {
                    const side = target.x < v.x ? -1 : 1;
                    if (side !== v.side) {
                        v.side = side;
                        if (v.kind === 'pitcher') v.flip.target = -side;
                    }
                    const need = this.neededTilt(v);
                    const goal = side * Math.min(need + 0.12, 1.42);
                    v.angle = approach(v.angle, goal, 5, dt);
                    const tilt = Math.abs(v.angle);
                    // A forgiving hand: drift the vessel so its spout comes over the opening.
                    // The finger stays where it is; only the hold shifts.
                    const open = this.opening(target);
                    const aim = this.spout(v);
                    const want = clamp(aim.x, open.x0 + 8 * u, open.x1 - 8 * u) - aim.x;
                    const shift = want * Math.min(1, dt * 6);
                    v.dx += shift;
                    v.x = clamp(v.x + shift, this.tray.x + v.w / 2, this.tray.x + this.tray.w - v.w / 2);

                    if (
                        tilt >= need - 0.02 &&
                        (v.kind !== 'pitcher' || Math.abs(v.flip.value + side) < 0.3)
                    ) {
                        const flow = RATE * clamp((tilt - need) / 0.12 + 0.35, 0.35, 1);
                        const amount = Math.min(v.vol, flow * dt);
                        v.vol -= amount;
                        const tip = this.spout(v);
                        // Near enough to the opening is in: a stream bends a little on its way down.
                        const landX = clamp(tip.x + v.side * 6 * u, open.x0 - 40 * u, open.x1 + 40 * u);
                        const into = landX > open.x0 - 30 * u && landX < open.x1 + 30 * u;
                        const lands = into ? clamp(landX, open.x0 + 6 * u, open.x1 - 6 * u) : landX;
                        if (into) this.receive(target, amount, v.pig);
                        else this.spill(landX, amount, v.pig);
                        pouring = {
                            from: v,
                            tip,
                            to: into ? target : null,
                            landX: lands,
                            landY: into ? this.surfaceY(target) : this.table + 6 * u,
                            flow: flow / RATE,
                        };
                    }
                } else {
                    v.angle = approach(v.angle, 0, 7, dt);
                }
            } else {
                if (Math.abs(v.angle) > 1e-3) {
                    v.angle = approach(v.angle, 0, 8, dt);
                    busy = true;
                } else v.angle = 0;
                if (v.y < this.table) {
                    v.vy += 2600 * u * dt;
                    v.y += v.vy * dt;
                    busy = true;
                    if (v.y >= this.table) this.setDown(v);
                }
                if (v.slideTo !== null) {
                    v.x = approach(v.x, v.slideTo, 12, dt);
                    if (Math.abs(v.x - v.slideTo) < 0.3) v.slideTo = null;
                    busy = true;
                }
                if (v.src && Math.abs(v.x - v.home) < 40 * u && v.y >= this.table && v.vol < v.cap * 0.85) {
                    // Back in its place, a pitcher fills up again.
                    v.refill += dt;
                    if (v.refill > 0.7) {
                        const amount = Math.min(v.cap * 0.85 - v.vol, 0.9 * dt);
                        v.pig = mixLoad(v.pig, v.vol, v.src, amount * 2);
                        v.vol += amount;
                        if (Math.random() < dt * 7)
                            audio.play(
                                'bubble',
                                { f: 1400 + Math.round((v.vol / v.cap) * 4) * 200 },
                                { gain: 0.55, rate: random(0.9, 1.1) }
                            );
                    }
                    busy = true;
                } else v.refill = 0;
            }
        }

        this.stream = pouring;
        if (pouring) {
            busy = true;
            let pitch = 320;
            if (pouring.to === this.basin) pitch = 260;
            else if (pouring.to)
                pitch = clamp(420 / Math.max(0.12, 1 - pouring.to.vol / pouring.to.cap), 420, 3600);
            this.pourSound.set(0.35 + pouring.flow * 0.65, pitch);
            if (pouring.from.kind === 'pitcher' && this.time - this.lastGlug > 0.4 + Math.random() * 0.4) {
                this.lastGlug = this.time;
                audio.play('gulp', { f: 300 }, { gain: 0.8, rate: random(0.85, 1.2) });
            }
        } else this.pourSound.set(0, 0);

        // The bowl drains slowly.
        if (this.basin.vol > 0) {
            this.basin.vol = Math.max(0, this.basin.vol - dt * 0.25);
            busy = true;
        }
        if (this.basin.ripple > 0) {
            this.basin.ripple = Math.max(0, this.basin.ripple - dt * 1.5);
            busy = true;
        }

        if (this.updateSponge(dt)) busy = true;
        return busy;
    }

    findTarget(v) {
        const u = this.u;
        let best = null;
        let bestDist = Infinity;
        const candidates = this.vessels.filter((t) => t !== v && !t.held).concat([this.basin]);
        for (const t of candidates) {
            const open = this.opening(t);
            if (v.y > open.rim - 8 * u) continue;
            const reach = (open.x1 - open.x0) / 2 + v.w * 0.75 + 26 * u;
            const d = Math.abs(t.x - v.x);
            if (d < reach && d < bestDist) {
                best = t;
                bestDist = d;
            }
        }
        return best;
    }

    setDown(v) {
        const u = this.u;
        const impact = v.vy;
        v.y = this.table;
        v.vy = 0;
        v.slosh.kick(clamp(impact / (2000 * u), 0.05, 0.5) * (Math.random() < 0.5 ? -1 : 1));
        audio.play(
            'tink',
            { f: v.kind === 'glass' ? 2000 : 1300 },
            { gain: clamp(impact / (2000 * u), 0.25, 0.9), pan: (v.x / this.w) * 2 - 1 }
        );
        if (v.vol > v.cap * 0.92 && impact > 600 * u) this.spill(v.x + v.w * 0.6, 0.05, v.pig);
        // Do not set it down inside another: slide to the nearest free place on the tray.
        const blocked = (x) => {
            if (Math.abs(x - this.basin.x) < (this.basin.w + v.w) / 2 + 4 * u) return true;
            if (Math.abs(x - this.sponge.home.x) < (this.sponge.w + v.w) / 2) return true;
            for (const o of this.vessels) {
                if (o === v || o.held) continue;
                const ox = o.slideTo !== null ? o.slideTo : o.x;
                if (Math.abs(x - ox) < (o.w + v.w) / 2 + 6 * u) return true;
            }
            return x < this.tray.x + v.w / 2 || x > this.tray.x + this.tray.w - v.w / 2;
        };
        if (!blocked(v.x)) return;
        for (let step = 4 * u; step < this.w; step += 4 * u) {
            if (!blocked(v.x - step)) {
                v.slideTo = v.x - step;
                return;
            }
            if (!blocked(v.x + step)) {
                v.slideTo = v.x + step;
                return;
            }
        }
    }

    updateSponge(dt) {
        const sp = this.sponge;
        const u = this.u;
        let busy = sp.squish.update(dt);
        if (!sp.held) {
            sp.x = approach(sp.x, sp.home.x, 8, dt);
            sp.y = approach(sp.y, sp.home.y, 8, dt);
            if (Math.abs(sp.x - sp.home.x) > 0.5 || Math.abs(sp.y - sp.home.y) > 0.5) busy = true;
            sp.wet = Math.max(0, sp.wet - dt * 0.03);
            return busy;
        }
        busy = true;
        const low = sp.y + sp.h / 2 > this.table - 12 * u;
        if (!low) return busy;
        const moving =
            Math.abs(sp.held.vx) + Math.abs(sp.held.vy) > 40 * u && performance.now() - sp.held.time < 90;
        for (const puddle of this.puddles) {
            if (Math.abs(puddle.x - sp.x) > this.puddleRadius(puddle) + sp.w / 2) continue;
            const take = Math.min(puddle.vol, (moving ? 1.6 : 0.5) * dt);
            puddle.vol -= take;
            sp.wet = Math.min(1, sp.wet + take * 0.6);
            sp.tint = mixRgb(sp.tint, pigmentColour(puddle.pig), clamp(take * 3, 0, 1));
            if (moving && this.time - sp.lastSqueak > 0.12) {
                sp.lastSqueak = this.time;
                audio.play(
                    'squeak',
                    { f: 1400 },
                    { gain: 1, rate: random(0.85, 1.25), pan: (sp.x / this.w) * 2 - 1 }
                );
            }
        }
        this.puddles = this.puddles.filter((p) => p.vol > 0.01);
        return busy;
    }

    //--------------------------------------------------------------------------
    // Drawing

    draw(ctx) {
        const u = this.u;
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);
        for (const puddle of this.puddles) this.drawPuddle(ctx, puddle);
        this.drawBasin(ctx);
        this.drawSponge(ctx);

        const order = this.vessels.slice().sort((a, b) => (a.held ? 1 : 0) - (b.held ? 1 : 0));
        for (const v of order) {
            if (!v.held) this.drawVessel(ctx, v);
        }
        if (this.stream) this.drawStream(ctx, this.stream);
        for (const v of order) {
            if (v.held) this.drawVessel(ctx, v);
        }
    }

    drawPuddle(ctx, puddle) {
        const r = this.puddleRadius(puddle);
        const next = rng(puddle.seed);
        ctx.beginPath();
        for (let i = 0; i <= 16; i++) {
            const a = (i / 16) * TAU;
            const wobble = 1 + (next() - 0.5) * 0.25;
            const x = puddle.x + Math.cos(a) * r * wobble;
            const y = puddle.y + Math.sin(a) * r * 0.32 * wobble;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = rgbString(pigmentColour(puddle.pig), 0.7);
        ctx.fill();
        ellipse(ctx, puddle.x - r * 0.3, puddle.y - r * 0.08, r * 0.3, r * 0.06);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();
    }

    drawBasin(ctx) {
        const u = this.u;
        const b = this.basin;
        const top = b.y - b.h;
        ellipse(ctx, b.x + 4 * u, b.y + 2 * u, b.w * 0.42, b.h * 0.14);
        ctx.fillStyle = SHADOW;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(b.x - b.w / 2, top + b.h * 0.18);
        ctx.quadraticCurveTo(b.x - b.w * 0.48, b.y, b.x - b.w * 0.25, b.y);
        ctx.lineTo(b.x + b.w * 0.25, b.y);
        ctx.quadraticCurveTo(b.x + b.w * 0.48, b.y, b.x + b.w / 2, top + b.h * 0.18);
        ctx.closePath();
        ctx.fillStyle = '#F4EDE2';
        ctx.fill();
        ellipse(ctx, b.x, top + b.h * 0.18, b.w / 2, b.h * 0.2);
        ctx.fillStyle = '#E2D9CC';
        ctx.fill();
        const fill = clamp(b.vol / 1.5, 0, 1);
        if (fill > 0.01 || b.ripple > 0) {
            ellipse(
                ctx,
                b.x,
                top + b.h * 0.22,
                b.w * 0.44 * (0.4 + 0.6 * fill),
                b.h * 0.15 * (0.4 + 0.6 * fill)
            );
            ctx.fillStyle = rgbString(pigmentColour(b.pig), 0.35 + 0.5 * fill);
            ctx.fill();
        }
        ctx.strokeStyle = PALETTE.sky;
        ctx.lineWidth = 4 * u;
        ellipse(ctx, b.x, top + b.h * 0.18, b.w / 2 - 2 * u, b.h * 0.2 - 2 * u);
        ctx.stroke();
    }

    drawSponge(ctx) {
        const u = this.u;
        const sp = this.sponge;
        const squish = sp.squish.value * 0.02;
        const w = sp.w * (1 + squish);
        const h = sp.h * (1 - squish);
        const x = sp.x - w / 2;
        const y = sp.y - h / 2;
        fillRound(ctx, x + 3 * u, y + 6 * u, w, h, 12 * u, SHADOW);
        const dry = [246, 221, 140];
        const colour = mixRgb(dry, mixRgb(sp.tint, [200, 175, 110], 0.3), sp.wet);
        fillRound(ctx, x, y, w, h, 12 * u, rgbString(colour));
        fillRound(ctx, x, y + h * 0.62, w, h * 0.38, 10 * u, PALETTE.sageDeep);
        const next = rng(9);
        for (let i = 0; i < 9; i++)
            disc(
                ctx,
                x + w * (0.12 + next() * 0.76),
                y + h * (0.12 + next() * 0.38),
                (2 + next() * 3) * u,
                'rgba(200,160,80,0.35)'
            );
    }

    drawStream(ctx, s) {
        const u = this.u;
        const colour = rgbString(pigmentColour(s.from.pig), 0.85);
        const width = (3 + 6 * s.flow) * u * this.k;
        ctx.strokeStyle = colour;
        ctx.lineCap = 'round';
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(s.tip.x, s.tip.y);
        ctx.quadraticCurveTo(s.tip.x + s.from.side * 10 * u, s.tip.y + 8 * u, s.landX, s.landY);
        ctx.stroke();
        // Splashes where it lands.
        for (let i = 0; i < 4; i++) {
            const a = this.time * 9 + i * 1.7;
            const r = (6 + 10 * ((this.time * 3 + i * 0.25) % 1)) * u;
            disc(ctx, s.landX + Math.cos(a) * r, s.landY - Math.abs(Math.sin(a)) * r * 0.6, 2.4 * u, colour);
        }
    }

    drawVessel(ctx, v) {
        const u = this.u;
        const lift = v.lift.value;

        // Shadow on the tray, smaller the higher it is held.
        const height = this.table - v.y;
        const fade = clamp(1 - height / 400, 0.3, 1);
        ellipse(ctx, v.x + 5 * u, this.table + 2 * u, v.w * 0.52 * fade, 7 * u * fade);
        ctx.fillStyle = `rgba(80, 100, 95, ${0.18 * fade})`;
        ctx.fill();

        ctx.save();
        ctx.translate(v.x, v.y - v.h / 2);
        ctx.rotate(v.angle);
        ctx.translate(0, v.h / 2);
        if (lift > 0.01) ctx.scale(1 + lift * 0.03, 1 + lift * 0.03);

        const iw = v.iw;
        const top = -v.h;
        const floor = -v.bottom;
        const r = 10 * u * this.k;

        // The water, its surface level in the world, not the glass.
        const level = this.depth(v);
        if (level > 0.3) {
            ctx.save();
            roundRect(ctx, -iw / 2, top + 2 * u, iw, v.ih - 2 * u, r * 0.6);
            ctx.clip();
            ctx.translate(0, floor - level);
            ctx.rotate(-v.angle - v.slosh.value);
            const colour = pigmentColour(v.pig);
            ctx.fillStyle = rgbString(colour, 0.88);
            ctx.fillRect(-v.h * 2, 0, v.h * 4, v.h * 3);
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillRect(-v.h * 2, 0, v.h * 4, 3 * u);
            ctx.restore();
        }

        if (v.kind === 'pitcher') this.drawPitcher(ctx, v, r);
        else this.drawGlass(ctx, v, r);

        if (v.ring > 0) {
            ctx.strokeStyle = `rgba(255,255,255,${v.ring * 0.8})`;
            ctx.lineWidth = 3 * u;
            const grow = (1 - v.ring) * 12 * u;
            roundRect(ctx, -v.w / 2 - grow, top - grow, v.w + grow * 2, v.h + grow * 2, r + grow);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawGlass(ctx, v, r) {
        const u = this.u;
        const top = -v.h;
        roundRect(ctx, -v.w / 2, top, v.w, v.h, r);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(110, 150, 160, 0.55)';
        ctx.lineWidth = 3 * u;
        ctx.stroke();
        fillRound(
            ctx,
            -v.w / 2 + 2 * u,
            -v.bottom,
            v.w - 4 * u,
            v.bottom - 2 * u,
            r * 0.6,
            'rgba(255,255,255,0.45)'
        );
        fillRound(
            ctx,
            -v.w / 2 + v.w * 0.14,
            top + v.h * 0.1,
            v.w * 0.1,
            v.h * 0.7,
            v.w * 0.05,
            'rgba(255,255,255,0.55)'
        );
    }

    drawPitcher(ctx, v, r) {
        const u = this.u;
        const top = -v.h;
        ctx.save();
        // The spout faces the way it pours; the handle swaps to the other side by turning the
        // pitcher round, which the flip spring animates through zero width.
        ctx.scale(v.flip.value, 1);
        ctx.strokeStyle = 'rgba(110, 150, 160, 0.55)';
        ctx.lineWidth = 9 * u * this.k;
        ctx.beginPath();
        ctx.arc(v.w / 2, top + v.h * 0.45, v.h * 0.2, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3 * u;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-v.w / 2, top + 10 * u);
        ctx.lineTo(-v.w / 2 - 16 * u * this.k, top - 2 * u);
        ctx.lineTo(-v.w / 2 + 14 * u * this.k, top);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(110, 150, 160, 0.55)';
        ctx.lineWidth = 3 * u;
        ctx.stroke();

        roundRect(ctx, -v.w / 2, top, v.w, v.h, r);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fill();
        ctx.stroke();
        fillRound(
            ctx,
            -v.w / 2 + 2 * u,
            -v.bottom,
            v.w - 4 * u,
            v.bottom - 2 * u,
            r * 0.6,
            'rgba(255,255,255,0.45)'
        );
        fillRound(
            ctx,
            -v.w / 2 + v.w * 0.12,
            top + v.h * 0.12,
            v.w * 0.08,
            v.h * 0.66,
            v.w * 0.04,
            'rgba(255,255,255,0.55)'
        );
        ctx.restore();
        // A coloured band says which water this pitcher brings, even when it is empty.
        if (v.src)
            fillRound(
                ctx,
                -v.w * 0.32,
                top + 8 * u,
                v.w * 0.64,
                7 * u,
                3.5 * u,
                rgbString(pigmentColour(v.src))
            );
    }

    exit() {
        this.pourSound.stop();
        freeLayer(this.bg);
        this.bg = null;
    }
}

function icon(ctx, x, y, w, h, u) {
    const base = y + h * 0.84;
    const pw = w * 0.26;
    const ph = h * 0.46;
    const px = x + w * 0.3;
    ctx.save();
    ctx.translate(px, base - ph / 2);
    ctx.rotate(-0.55);
    fillRound(
        ctx,
        -pw / 2,
        -ph / 2 + ph * 0.35,
        pw,
        ph * 0.65,
        6 * u,
        rgbString(pigmentColour([0, 0, 1]), 0.9)
    );
    roundRect(ctx, -pw / 2, -ph / 2, pw, ph, 6 * u);
    ctx.strokeStyle = 'rgba(110, 150, 160, 0.7)';
    ctx.lineWidth = 3 * u;
    ctx.stroke();
    ctx.restore();
    const gx = x + w * 0.66;
    const gw = w * 0.18;
    const gh = h * 0.3;
    fillRound(
        ctx,
        gx - gw / 2,
        base - gh * 0.55,
        gw,
        gh * 0.55,
        4 * u,
        rgbString(pigmentColour([0, 0, 1]), 0.9)
    );
    roundRect(ctx, gx - gw / 2, base - gh, gw, gh, 4 * u);
    ctx.strokeStyle = 'rgba(110, 150, 160, 0.7)';
    ctx.stroke();
    ctx.strokeStyle = rgbString(pigmentColour([0, 0, 1]), 0.9);
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.46, y + h * 0.36);
    ctx.quadraticCurveTo(x + w * 0.6, y + h * 0.4, gx - gw * 0.1, base - gh * 0.5);
    ctx.stroke();
}

export const toy = {
    id: 'pour',
    title: 'Pouring',
    about: 'Pitchers of coloured water, glasses, a bowl and a sponge. Colours mix; spills wipe up.',
    mat: '#DDEBE6',
    icon,
    create: (app) => new PourScene(app),
    sounds() {
        const list = [
            ['gulp', { f: 300 }],
            ['gulp', { f: 220 }],
            ['squeak', { f: 1400 }],
            ['pat', {}],
            ['tink', { f: 2000 }],
            ['tink', { f: 1300 }],
            ['drop', { f: noteHz(0, 48) }],
        ];
        for (let i = 0; i < 4; i++) list.push(['drop', { f: noteHz(i, 60) }]);
        for (let d = 6; d <= 14; d++) list.push(['tink', { f: noteHz(d, 60) }]);
        return list;
    },
    signature() {
        audio.play('gulp', { f: 300 }, { gain: 0.75, delay: 0.05 });
        audio.play('tink', { f: 2000 }, { gain: 0.45, delay: 0.2 });
    },
};
