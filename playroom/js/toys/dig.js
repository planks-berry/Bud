// The dig: a sandpit, and a digger whose bucket goes wherever a finger goes.
//
// Seen from the side, the way a child watches a real one through the site fence. The finger is
// the bucket: the arm follows it, folding and reaching by itself, and the digger crawls along on
// its tracks when the finger goes further than the arm can, or turns round when it goes behind.
// Down into the sand the bucket fills; lifted, it holds what it took; let go, and it tips and
// pours where it is. Sand behaves like sand: it heaps, it slides until it rests at its own slope,
// and none of it is ever made or lost. What the bucket takes is what it carries, and what it
// pours is what lands.
//
// There is a dump truck to fill, drive and tip, a bulldozer that pushes, and things buried in the
// sand: a bone, a shell, a worm, a mole, a fossil, a toy car. The first proper bite of the bucket
// finds one, every time the dig comes out, so the finding is certain and the rest is luck.
//
//   touch  - tap the sand and it sprays; tap a machine and it answers: a horn, a beep, a blade.
//   move   - the bucket follows a finger: dig, carry, pour. Drag the truck and the bulldozer.
//   make   - the ground itself: heaps, holes, ramps, a truck-load tipped out somewhere new.
//
// The ground is a row of columns, each a stack of layers (sand, and at Bloom a darker earth under
// it), so what is dug from low down and poured on top stays what it was: a heap built from both is
// striped.

import { Scene } from '../stage.js';
import { freeLayer, makeLayer, grain, ellipse } from '../draw.js';
import { Spring, clamp, approach, dist, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import {
    SITE,
    DIGGER,
    TRUCK,
    DOZER,
    digger,
    diggerJoints,
    diggerSolve,
    diggerCupOffset,
    dumpTruck,
    truckBed,
    bulldozer,
    toLocal,
} from './machines.js';
import * as art from './digart.js';

const COLUMNS = 150;
// The steepest slope sand rests at, rise over run: about 35 degrees.
const REPOSE = 0.7;
const SAND = 0;
const EARTH = 1;
const TONES = [
    { top: SITE.sandLight, body: SITE.sand },
    { top: '#CDAA88', body: SITE.earth },
];
// In u per second squared: grains fall a little slower than stones would, so a pour can be seen.
const GRAVITY = 1500;
const MAX_GRAINS = 260;

// What each stage puts out. Positions are fractions of the width.
const STAGES = [
    { truck: false, dozer: false, finds: 0, earth: false, reach: 1.2, digger: 0.27, heap: 0.66 },
    { truck: true, dozer: false, finds: 3, earth: false, reach: 1, digger: 0.2, heap: 0.5, truckAt: 0.83 },
    {
        truck: true,
        dozer: true,
        finds: 4,
        earth: true,
        reach: 1,
        digger: 0.14,
        heap: 0.6,
        truckAt: 0.87,
        dozerAt: 0.38,
    },
];

// Each find's note when it comes up into the light: a step of the scale from C5.
const NOTES = { bone: 0, shell: 4, worm: 2, mole: 3, fossil: 5, car: 6 };
// How big a find is, beside the digger: big enough to spot from across the room.
const FIND = 0.2;

//==============================================================================
// Layers
//
// A stack is a list of [material, height] from the bottom up: a column of ground, a bucket's load,
// a truck's. Taking from the top of one and adding to the top of another, in order, keeps what
// was low down below what was on top.

function stackSum(stack) {
    let sum = 0;
    for (let i = 0; i < stack.length; i++) sum += stack[i][1];
    return sum;
}

function stackAdd(stack, m, amount) {
    if (amount <= 0) return;
    const last = stack[stack.length - 1];
    if (last && last[0] === m) last[1] += amount;
    else stack.push([m, amount]);
}

// Take up to `amount` off the top of a stack, adding what comes off, in order, to `into` (if
// given). Returns how much came off.
function stackTake(stack, amount, into) {
    let left = amount;
    let got = 0;
    while (left > 1e-9 && stack.length) {
        const last = stack[stack.length - 1];
        let a = Math.min(left, last[1]);
        // Never leave a sliver too thin to matter: it would only be rounding.
        if (last[1] - a < 1e-7) a = last[1];
        last[1] -= a;
        if (last[1] <= 0) stack.pop();
        left -= a;
        got += a;
        if (into) stackAdd(into, last[0], a);
    }
    return got;
}

function topMaterial(stack) {
    return stack.length ? stack[stack.length - 1][0] : SAND;
}

// The ground: a column of layers for every slice of the pit, and each column's height, in u.
class Pit {
    constructor(n) {
        this.n = n;
        this.cols = [];
        for (let i = 0; i < n; i++) this.cols.push([]);
        this.tops = new Float64Array(n);
        this.scratch = [];
    }

    add(i, m, amount) {
        const col = this.cols[i];
        stackAdd(col, m, amount);
        if (col.length > 8) this.merge(col);
        this.tops[i] = stackSum(col);
    }

    take(i, amount, into) {
        const got = stackTake(this.cols[i], amount, into);
        this.tops[i] = stackSum(this.cols[i]);
        return got;
    }

    // Too many thin layers in one column: fold the thinnest (below the top) into its neighbour,
    // which keeps whichever colour there is more of. Nothing is lost, only a stripe.
    merge(col) {
        let thin = 0;
        for (let j = 1; j < col.length - 1; j++) if (col[j][1] < col[thin][1]) thin = j;
        const other = thin === 0 ? 1 : thin - 1;
        const keep = col[other][1] >= col[thin][1] ? col[other][0] : col[thin][0];
        col[other][1] += col[thin][1];
        col[other][0] = keep;
        col.splice(thin, 1);
        for (let j = col.length - 1; j > 0; j--) {
            if (col[j][0] === col[j - 1][0]) {
                col[j - 1][1] += col[j][1];
                col.splice(j, 1);
            }
        }
    }

    // Move `amount` from the top of one column to the top of another, in order.
    shift(from, to, amount) {
        const moved = this.scratch;
        moved.length = 0;
        const got = this.take(from, amount, moved);
        for (const [m, a] of moved) this.add(to, m, a);
        return got;
    }

    // Wherever a column stands steeper over its neighbour than sand can, some of the excess slides
    // down onto it. Half-measures in alternating directions settle a hole or a heap over a few
    // frames, which is what sand sliding looks like, and stop the moment nothing moves.
    relax(limit, passes) {
        let moved = 0;
        for (let p = 0; p < passes; p++) {
            let pass = 0;
            const forward = p % 2 === 0;
            for (let k = 0; k < this.n - 1; k++) {
                const i = forward ? k : this.n - 2 - k;
                const d = this.tops[i] - this.tops[i + 1];
                if (d > limit) pass += this.shift(i, i + 1, (d - limit) * 0.42);
                else if (-d > limit) pass += this.shift(i + 1, i, (-d - limit) * 0.42);
            }
            moved += pass;
            if (pass < 1e-3) break;
        }
        return moved;
    }

    total() {
        let sum = 0;
        for (let i = 0; i < this.n; i++) sum += this.tops[i];
        return sum;
    }
}

//==============================================================================

class DigScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.plan = STAGES[this.level];
        this.rand = Math.random;
        this.time = 0;
        this.queue = [];
        this.fx = [];
        this.grains = [];
        this.pit = new Pit(COLUMNS);
        this.finds = [];
        // Which finds have come up this time out: the first proper bite always finds one.
        this.found = new Set();
        this.settled = false;
        this.groundDirty = true;
        this.background = null;
        this.raster = null;
        this.built = false;
        this.lastW = 0;
        this.motor = new audio.Motor('hydraulic');
        this.grit = new audio.Texture('grit');
        this.motorLevel = 0;
        this.gritLevel = 0;
        this.flow = 0;
        this.digger = {
            kind: 'digger',
            x: 0,
            by: 0,
            tilt: 0,
            facing: 1,
            travel: 0,
            boom: -0.55,
            stick: 0.95,
            bucket: 0.5,
            load: [],
            bounce: new Spring(0, 300, 12),
            squash: new Spring(0, 260, 14),
            glow: 0,
            aim: null,
            pointer: null,
            driving: false,
            pressed: 0,
            pouring: false,
            poured: 0,
            landed: false,
            inSand: false,
            bite: 0,
            speed: 0,
            turned: -1,
            cx: 0,
            cy: 0,
            putt: 0,
            seated: false,
        };
        const machine = (kind) => ({
            kind,
            x: 0,
            by: 0,
            tilt: 0,
            facing: 1,
            travel: 0,
            roll: 0,
            load: [],
            bounce: new Spring(0, 300, 12),
            glow: 0,
            pointer: null,
            target: null,
            putt: 0,
            beep: 0,
            seated: false,
        });
        this.truck = this.plan.truck
            ? Object.assign(machine('truck'), { tip: 0, tipTo: 0, dumped: 0 })
            : null;
        this.dozer = this.plan.dozer ? Object.assign(machine('dozer'), { lift: 0, liftTo: 0 }) : null;
        this.machines = [this.digger, this.truck, this.dozer].filter(Boolean);
    }

    //--------------------------------------------------------------------------
    // Layout

    layout() {
        const { w, h, u } = this;
        freeLayer(this.background);
        this.background = null;
        this.freeRaster();
        this.floor = Math.round(h - 18 * u);
        this.cw = w / COLUMNS;
        this.limit = (REPOSE * this.cw) / u;
        this.k = Math.min(250 * u, w * 0.29);
        // A bucket holds what fills its cup; a truck's bed, three or four bucketfuls.
        const k = this.k;
        this.bucketCap = ((DIGGER.bucketW * k) / this.cw) * ((DIGGER.bucketD * k) / u) * 0.85;
        this.truckCap = this.bucketCap * 3.2;
        this.bladeCap = this.bucketCap * 1.6;
        this.grainSize = this.bucketCap / 70;
        if (!this.built) {
            this.build();
        } else {
            for (const m of this.machines) m.x *= w / this.lastW;
            for (const f of this.finds) f.x *= w / this.lastW;
            for (const m of this.machines) m.seated = false;
            this.grains = [];
        }
        this.lastW = w;
        this.groundDirty = true;
        this.settled = false;
    }

    // The pit as it comes off the shelf: level sand with a gentle roll to it, a heap rising out of
    // it, and at Bloom a layer of darker earth underneath.
    build() {
        this.built = true;
        const { u, w } = this;
        const plan = this.plan;
        const tall = this.floor / u;
        const base = tall * 0.2;
        const peak = tall * 0.22;
        const middle = plan.heap * COLUMNS;
        for (let i = 0; i < COLUMNS; i++) {
            const run = Math.abs(i + 0.5 - middle);
            const f = clamp(1 - (run * this.limit * 0.8) / peak, 0, 1);
            const heap = peak * f * f * (3 - 2 * f);
            const roll = Math.sin(i * 0.09) * 3 + Math.sin(i * 0.23 + 1) * 1.5;
            const top = base + roll + heap;
            if (plan.earth) {
                const earth = base * 0.55 + Math.sin(i * 0.05 + 2) * 6;
                this.pit.add(i, EARTH, earth);
                this.pit.add(i, SAND, top - earth);
            } else {
                this.pit.add(i, SAND, top);
            }
        }
        this.pit.relax(this.limit, 400);

        const k = this.k;
        this.digger.x = plan.digger * w;
        if (this.truck) this.truck.x = plan.truckAt * w;
        if (this.dozer) this.dozer.x = plan.dozerAt * w;
        // Inside the walls and clear of each other, whatever the screen's shape.
        for (const m of this.machines) this.moveMachine(m, 0);
        for (let i = 0; i < plan.finds; i++) this.bury(this.freshKind(), true);
        this.k = k;
    }

    freeRaster() {
        if (this.raster) {
            this.raster.width = 1;
            this.raster.height = 1;
        }
        this.raster = null;
    }

    pan(x) {
        return clamp((x / this.w) * 2 - 1, -1, 1);
    }

    //--------------------------------------------------------------------------
    // The ground

    index(x) {
        return clamp(Math.floor(x / this.cw), 0, COLUMNS - 1);
    }

    // The height of the ground at x, in u, smooth between the columns' middles.
    heightAt(x) {
        const f = x / this.cw - 0.5;
        const i = Math.floor(f);
        const t = f - i;
        const a = this.pit.tops[clamp(i, 0, COLUMNS - 1)];
        const b = this.pit.tops[clamp(i + 1, 0, COLUMNS - 1)];
        return a + (b - a) * t;
    }

    surfaceY(x) {
        return this.floor - this.heightAt(x) * this.u;
    }

    groundVolume() {
        return this.pit.total();
    }

    bucketLoad() {
        return stackSum(this.digger.load);
    }

    truckLoad() {
        return this.truck ? stackSum(this.truck.load) : 0;
    }

    // Everything there is: the ground, what the machines hold, and what is in the air.
    volume() {
        let sum = this.pit.total() + stackSum(this.digger.load);
        if (this.truck) sum += stackSum(this.truck.load);
        if (this.dozer) sum += stackSum(this.dozer.load);
        for (const g of this.grains) sum += g.v;
        return sum;
    }

    changed() {
        this.groundDirty = true;
        this.settled = false;
    }

    // A grain landing: it settles over a column and a little either side.
    deposit(x, m, v) {
        const i = this.index(x);
        const left = i > 0 ? i - 1 : i;
        const right = i < COLUMNS - 1 ? i + 1 : i;
        this.pit.add(left, m, v * 0.25);
        this.pit.add(i, m, v * 0.5);
        this.pit.add(right, m, v * 0.25);
        this.changed();
    }

    // Sand on the move, of any kind: what the grit sound follows.
    moved(amount) {
        this.flow += amount;
    }

    //--------------------------------------------------------------------------
    // Machines on the ground

    // The span of ground a machine stands over, left to right, and the parts of it that rest on
    // the ground, in its own frame.
    extent(m) {
        const k = this.k;
        const box = m.kind === 'digger' ? [-0.44, 0.24] : m.kind === 'truck' ? [-0.49, 0.48] : [-0.4, 0.47];
        const a = m.x + box[0] * k * m.facing;
        const b = m.x + box[1] * k * m.facing;
        return [Math.min(a, b), Math.max(a, b)];
    }

    feet(m) {
        if (m.kind === 'truck') return TRUCK.wheels;
        if (m.kind === 'dozer') return [-0.34, -0.17, 0, 0.17, 0.24];
        return [-0.38, -0.19, 0, 0.19, 0.38];
    }

    // Move a machine along the ground by up to dx, stopping at the pit's walls and at the other
    // machines. Returns how far it went.
    moveMachine(m, dx) {
        const gap = 6 * this.u;
        let [a, b] = this.extent(m);
        let lo = gap - a;
        let hi = this.w - gap - b;
        for (const other of this.machines) {
            if (other === m) continue;
            const [oa, ob] = this.extent(other);
            if (ob <= a + 1) lo = Math.max(lo, ob + gap - a);
            else if (oa >= b - 1) hi = Math.min(hi, oa - gap - b);
        }
        const step = clamp(dx, Math.min(lo, 0), Math.max(hi, 0));
        m.x += step;
        return step;
    }

    // Each machine rests on the ground under it: level with the highest of its feet along the
    // slope they make, easing onto a bump rather than jumping.
    seat(m, dt) {
        const k = this.k;
        const feet = this.feet(m).map((lx) => {
            const x = m.x + lx * k * m.facing;
            return [x, this.surfaceY(x)];
        });
        feet.sort((p, q) => p[0] - q[0]);
        const first = feet[0];
        const last = feet[feet.length - 1];
        const tilt = clamp(Math.atan2(last[1] - first[1], last[0] - first[0]), -0.33, 0.33);
        let by = Infinity;
        for (const [x, y] of feet) by = Math.min(by, y - (x - m.x) * Math.tan(tilt));
        if (!m.seated) {
            m.by = by;
            m.tilt = tilt;
            m.seated = true;
            return true;
        }
        const was = m.by;
        const leant = m.tilt;
        m.by = approach(m.by, by, 16, dt);
        m.tilt = approach(m.tilt, tilt, 12, dt);
        return Math.abs(m.by - was) > 0.05 || Math.abs(m.tilt - leant) > 1e-4;
    }

    pose(m) {
        return { facing: m.facing, tilt: m.tilt };
    }

    diggerPose() {
        const d = this.digger;
        return {
            facing: d.facing,
            tilt: d.tilt,
            boom: d.boom,
            stick: d.stick,
            bucket: d.bucket,
            reach: this.plan.reach,
        };
    }

    joints() {
        const d = this.digger;
        return diggerJoints(d.x, d.by, this.k, this.diggerPose());
    }

    //--------------------------------------------------------------------------
    // Time

    later(delay, fn) {
        this.queue.push({ at: this.time + delay, fn });
    }

    update(dt) {
        this.time += dt;
        const due = this.queue.filter((q) => q.at <= this.time);
        if (due.length) {
            this.queue = this.queue.filter((q) => q.at > this.time);
            for (const q of due) q.fn();
        }

        let busy = false;
        this.flow = 0;
        if (this.updateDigger(dt)) busy = true;
        if (this.truck && this.updateTruck(dt)) busy = true;
        if (this.dozer && this.updateDozer(dt)) busy = true;
        if (this.updateGrains(dt)) busy = true;
        if (!this.settled) {
            const slid = this.pit.relax(this.limit, 6);
            if (slid > 1e-3) {
                this.groundDirty = true;
                busy = true;
            } else {
                this.settled = true;
            }
        }
        for (const m of this.machines) if (this.seat(m, dt)) busy = true;
        if (this.updateFinds(dt)) busy = true;

        this.fx = this.fx.filter((f) => {
            f.t += dt;
            return f.update ? f.update(dt, f) !== false && f.t < f.life : f.t < f.life;
        });
        if (this.fx.length || this.queue.length) busy = true;

        // The grit follows how much sand is moving, the way the sandpaper's sound follows a finger.
        const flow = clamp(this.flow / Math.max(dt, 1e-3) / (this.bucketCap * 2.2), 0, 1);
        this.gritLevel = approach(this.gritLevel, flow, flow > this.gritLevel ? 30 : 9, dt);
        if (this.gritLevel < 0.01 && flow === 0) this.gritLevel = 0;
        else busy = true;
        this.grit.set(this.gritLevel * 0.9);
        return busy;
    }

    //--------------------------------------------------------------------------
    // The digger

    updateDigger(dt) {
        const d = this.digger;
        const k = this.k;
        const u = this.u;
        let busy = false;
        if (d.bounce.update(dt)) busy = true;
        if (d.squash.update(dt)) busy = true;
        if (d.glow > 0) {
            d.glow = Math.max(0, d.glow - dt * 0.8);
            busy = true;
        }

        // A finger held still for a moment, or moved, drives the bucket. A quick tap does not.
        if (d.pointer && !d.driving && (this.time - d.pressed > 0.18 || d.pointer.travel > 8 * u)) {
            d.driving = true;
            d.pouring = false;
        }
        if (d.pointer && d.driving) d.aim = { x: d.pointer.x, y: d.pointer.y, held: true };

        let crawl = 0;
        if (d.aim) {
            busy = true;
            const ax = clamp(d.aim.x, 0, this.w);
            const ay = clamp(d.aim.y, 70 * u, this.floor - DIGGER.bucketD * k * 0.55);
            const local = toLocal(d.x, d.by, k, this.pose(d), ax, ay);
            // Behind the digger: it turns round to face the finger.
            if (local.x < -0.3 && this.time - d.turned > 0.9) this.turn();
            // Further than the arm reaches: it crawls towards the finger.
            const reach = this.plan.reach;
            const far = DIGGER.pivot[0] + (DIGGER.boom + DIGGER.stick) * reach * 0.9;
            if (local.x > far) crawl = Math.min(1, (local.x - far) * 4);
            if (crawl > 0) {
                const went = this.moveMachine(d, d.facing * crawl * k * 0.6 * dt);
                d.travel += went * d.facing;
                if (Math.abs(went) > 0.01) {
                    d.glow = 1;
                    d.putt -= dt;
                    if (d.putt <= 0) {
                        d.putt = 0.15;
                        audio.play('putt', {}, { gain: 0.55, pan: this.pan(d.x), rate: 0.85 });
                    }
                }
            }
            // The cup goes to the finger, so the wrist is aimed a cup's offset away from it, and
            // never behind the boom's own foot.
            const off = diggerCupOffset(k, { facing: d.facing, tilt: d.tilt, bucket: d.bucket });
            let tx = ax - off.x;
            const ty = ay - off.y;
            const front = toLocal(d.x, d.by, k, this.pose(d), tx, ty);
            if (front.x < DIGGER.pivot[0] + 0.06) tx = d.x + (DIGGER.pivot[0] + 0.06) * k * d.facing;
            const sol = diggerSolve(d.x, d.by, k, this.diggerPose(), tx, ty);
            const before = d.boom + d.stick;
            const ease = (from, to) => {
                const next = approach(from, to, 9, dt);
                return from + clamp(next - from, -3 * dt, 3 * dt);
            };
            d.boom = ease(d.boom, sol.boom);
            d.stick = ease(d.stick, sol.stick);
            d.speed = Math.abs(d.boom + d.stick - before) / Math.max(dt, 1e-3);
            // A tap in the air sends the arm there once; a held finger keeps it.
            if (!d.aim.held && Math.abs(d.boom - sol.boom) + Math.abs(d.stick - sol.stick) < 0.01 && !crawl)
                d.aim = null;
        } else {
            d.speed = 0;
        }

        const j = this.joints();
        const ground = this.surfaceY(j.bottom.x);
        const inSand = j.bottom.y > ground + 2 * u;

        // How the bucket holds itself: teeth first in the sand, cupped when carrying, tipped right
        // over when pouring.
        const load = stackSum(d.load);
        const want = d.pouring ? 2.3 : inSand && d.pointer ? 1.0 : load > 0.01 ? -0.12 : 0.45;
        const was = d.bucket;
        d.bucket = approach(d.bucket, want, d.pouring ? 9 : 6, dt);
        if (Math.abs(d.bucket - was) > 1e-4) busy = true;

        // The bucket digs only while a finger drives it: left resting in the sand, it waits.
        if (d.pouring) this.pour(d, j, dt);
        else if (d.pointer || d.aim) this.scoop(d, j, inSand, dt);
        else {
            d.cx = j.cup.x;
            d.cy = j.cup.y;
            d.bite = 0;
        }
        d.inSand = inSand;

        // The motor sings the arm's height along the scale, loud as the arm is quick.
        const height = clamp((this.floor - j.wrist.y) / (this.floor - 90 * u), 0, 1);
        const level = clamp(d.speed / 2.4 + crawl * 0.4, 0, 1);
        this.motorLevel = approach(this.motorLevel, level, level > this.motorLevel ? 20 : 7, dt);
        if (this.motorLevel < 0.01 && level === 0) this.motorLevel = 0;
        else busy = true;
        this.motor.set(this.motorLevel * 0.9, noteHz(Math.round(height * 8), 48));
        if (d.pouring) busy = true;
        return busy;
    }

    turn() {
        const d = this.digger;
        d.turned = this.time;
        const flipped = d.facing;
        d.facing = -d.facing;
        // Turned in place: nudge it back inside the walls if the other way round does not fit.
        if (this.moveMachine(d, 0) === 0 && this.extent(d)[0] < 0) d.facing = flipped;
        d.squash.value = 0.5;
        d.squash.target = 0;
        audio.play('hiss', {}, { gain: 0.6, pan: this.pan(d.x) });
    }

    // The bucket in the sand takes what lies above the bottom of its cup, until it is full; full, it
    // ploughs the rest aside. The sand it takes is the sand the ground loses, layer by layer.
    scoop(d, j, inSand, dt) {
        const k = this.k;
        const u = this.u;
        const vx = (j.cup.x - d.cx) / Math.max(dt, 1e-3);
        const vy = (j.cup.y - d.cy) / Math.max(dt, 1e-3);
        d.cx = j.cup.x;
        d.cy = j.cup.y;
        if (!inSand) {
            d.bite = 0;
            return;
        }
        const cut = (this.floor - (j.bottom.y - DIGGER.bucketD * k * 0.3)) / u;
        const half = DIGGER.bucketW * k * 0.55;
        const i0 = this.index(j.cup.x - half);
        const i1 = this.index(j.cup.x + half);
        let room = this.bucketCap - stackSum(d.load);
        let took = 0;
        for (let i = i0; i <= i1; i++) {
            const excess = this.pit.tops[i] - cut;
            if (excess <= 1e-6) continue;
            if (room > 1e-6) {
                const got = this.pit.take(i, Math.min(excess, room), d.load);
                room -= got;
                took += got;
            } else if (Math.abs(vx) + Math.abs(vy) > 20 * u) {
                const sideways = Math.abs(vx) > Math.abs(vy) * 0.5;
                if (sideways) {
                    const to = vx > 0 ? i1 + 1 : i0 - 1;
                    if (to >= 0 && to < COLUMNS) took += this.pit.shift(i, to, excess);
                } else {
                    if (i0 > 0) took += this.pit.shift(i, i0 - 1, excess / 2);
                    if (i1 < COLUMNS - 1) took += this.pit.shift(i, i1 + 1, excess / 2);
                }
            }
        }
        if (took > 0) {
            this.changed();
            this.moved(took);
            if (!d.inSand) audio.play('crunch', {}, { gain: 0.8, pan: this.pan(j.cup.x) });
        }
        d.bite += took;
        // The first proper bite of the outing always turns something up.
        if (this.plan.finds && !this.found.size && d.bite > this.bucketCap * 0.15)
            this.plantUnder(j.cup.x, cut);
        this.nudgeFinds(j.cup.x, half);
    }

    // Open the bucket and let the load run out of its lip.
    pour(d, j, dt) {
        const left = stackSum(d.load);
        if (left <= 1e-9) {
            d.load.length = 0;
            d.pouring = false;
            return;
        }
        const vx = (j.lip.x - d.cx) / Math.max(dt, 1e-3);
        d.cx = j.cup.x;
        d.cy = j.cup.y;
        // Tipping over takes a moment before anything comes out.
        if (d.bucket < 1.5) return;
        const amount = Math.min(left, this.bucketCap * 1.6 * dt);
        this.emit(j.lip.x, j.lip.y, clamp(vx * 0.3, -200, 200), 40 * this.u, amount, d.load, 6);
        this.moved(amount);
        d.poured += amount;
    }

    //--------------------------------------------------------------------------
    // Grains in the air

    // Let `amount` of a stack out at (x, y) as grains, each its own material.
    emit(x, y, vx, vy, amount, source, spread) {
        const u = this.u;
        let left = amount;
        while (left > 1e-9 && source.length) {
            const top = source[source.length - 1];
            const m = top[0];
            const v = stackTake(source, Math.min(left, this.grainSize, top[1]), null);
            left -= v;
            if (v <= 0) break;
            if (this.grains.length >= MAX_GRAINS) {
                // Never drop sand on the floor of the code: a full sky makes the newest grain fatter.
                const last = this.grains[this.grains.length - 1];
                if (last.m === m) {
                    last.v += v;
                    continue;
                }
            }
            this.grains.push({
                x: x + (this.rand() - 0.5) * spread * u,
                y: y + (this.rand() - 0.5) * spread * u * 0.5,
                vx: vx + (this.rand() - 0.5) * 60 * u,
                vy: vy + this.rand() * 40 * u,
                v,
                m,
                r: (2.4 + this.rand() * 1.8) * u,
            });
        }
    }

    updateGrains(dt) {
        if (!this.grains.length) return false;
        const u = this.u;
        const g0 = GRAVITY * u;
        const keep = [];
        let landed = 0;
        for (const g of this.grains) {
            g.vy += g0 * dt;
            g.x += g.vx * dt;
            g.y += g.vy * dt;
            if (g.x < 2) {
                g.x = 2;
                g.vx = Math.abs(g.vx) * 0.3;
            } else if (g.x > this.w - 2) {
                g.x = this.w - 2;
                g.vx = -Math.abs(g.vx) * 0.3;
            }
            if (g.vy > 0 && this.catches(g)) {
                stackAdd(this.truck.load, g.m, g.v);
                this.truck.bounce.kick(-0.4);
                continue;
            }
            if (g.y >= this.surfaceY(g.x)) {
                this.deposit(g.x, g.m, g.v);
                landed += g.v;
                continue;
            }
            keep.push(g);
        }
        this.grains = keep;
        // A bucketful landing is heard once, as it lands.
        const d = this.digger;
        if (landed > 0 && d.poured > this.bucketCap * 0.25 && !d.landed) {
            d.landed = true;
            audio.play('rumble', { variant: 'short' }, { gain: 0.9, pan: this.pan(d.cx) });
        }
        return true;
    }

    // The truck's bed catches what falls into it, until it is full.
    catches(g) {
        const t = this.truck;
        if (!t || t.tip > 0.15 || stackSum(t.load) >= this.truckCap) return false;
        const bed = truckBed(t.x, t.by, this.k, this.pose(t));
        const x0 = Math.min(bed.back.x, bed.front.x) + 6 * this.u;
        const x1 = Math.max(bed.back.x, bed.front.x) - 6 * this.u;
        if (g.x < x0 || g.x > x1) return false;
        const rim = (bed.back.y + bed.front.y) / 2;
        const heap = (stackSum(t.load) / this.truckCap) * this.k * 0.12;
        return g.y >= rim - heap - 4 * this.u && g.y <= bed.floor.y;
    }

    //--------------------------------------------------------------------------
    // The truck

    updateTruck(dt) {
        const t = this.truck;
        const k = this.k;
        const u = this.u;
        let busy = t.bounce.update(dt);
        if (t.glow > 0) {
            t.glow = Math.max(0, t.glow - dt * 0.8);
            busy = true;
        }
        if (this.drive(t, dt)) busy = true;

        const was = t.tip;
        t.tip = approach(t.tip, t.tipTo, t.tipTo > t.tip ? 2.4 : 1.8, dt);
        if (Math.abs(t.tip - was) > 1e-4) busy = true;
        const load = stackSum(t.load);
        if (t.tipTo === 1 && t.tip > 0.45 && load > 1e-9) {
            // Up and over: the load slides out over the back.
            const bed = truckBed(t.x, t.by, k, this.pose(t));
            const amount = Math.min(load, this.truckCap * 0.9 * dt);
            this.emit(bed.lip.x, bed.lip.y, -t.facing * 70 * u, 30 * u, amount, t.load, 14);
            this.moved(amount);
            t.dumped += amount;
            if (!t.rumbled && t.dumped > this.bucketCap * 0.3) {
                t.rumbled = true;
                this.later(0.25, () => audio.play('rumble', {}, { gain: 1, pan: this.pan(t.x) }));
            }
            busy = true;
        } else if (t.tipTo === 1 && t.tip > 0.97) {
            t.tipTo = 0;
            audio.play('hiss', {}, { gain: 0.8, pan: this.pan(t.x) });
        }
        if (load <= 1e-9) t.load.length = 0;
        return busy;
    }

    tip() {
        const t = this.truck;
        if (t.tipTo === 1 || t.tip > 0.1) return;
        t.tipTo = 1;
        t.dumped = 0;
        t.rumbled = false;
        t.glow = 1;
        audio.play('hiss', {}, { gain: 0.9, pan: this.pan(t.x) });
    }

    // A dragged truck or bulldozer follows the finger along the ground, as fast as it can drive.
    drive(m, dt) {
        if (!m.pointer || !m.dragging) return false;
        const k = this.k;
        const want = m.pointer.x + m.grab - m.x;
        const step = clamp(want * Math.min(1, dt * 10), -k * 1.4 * dt, k * 1.4 * dt);
        const went = this.moveMachine(m, step);
        if (Math.abs(went) < 0.01) return true;
        m.travel += went * m.facing;
        m.roll += went / (TRUCK.wheelR * k);
        m.glow = 1;
        m.putt -= dt;
        if (m.putt <= 0) {
            m.putt = 0.16;
            audio.play('putt', {}, { gain: 0.5, pan: this.pan(m.x) });
        }
        // Going backwards, it beeps.
        if (m.kind === 'truck' && went * m.facing < 0) {
            m.beep -= dt;
            if (m.beep <= 0) {
                m.beep = 0.45;
                audio.play('beep', { f: noteHz(4, 72) }, { gain: 0.8, pan: this.pan(m.x) });
            }
        } else {
            m.beep = 0;
        }
        return true;
    }

    //--------------------------------------------------------------------------
    // The bulldozer: driven forwards, its blade takes what stands above the ground under its tracks
    // and carries it along in front, dropping some ahead as it goes, so a heap rolls before it.

    updateDozer(dt) {
        const z = this.dozer;
        const k = this.k;
        const u = this.u;
        let busy = z.bounce.update(dt);
        if (z.glow > 0) {
            z.glow = Math.max(0, z.glow - dt * 0.8);
            busy = true;
        }
        const before = z.x;
        if (this.drive(z, dt)) busy = true;
        const went = z.x - before;
        const forward = went * z.facing > 0.01;
        if (z.pointer && z.dragging) z.liftTo = forward ? 0 : went * z.facing < -0.01 ? 1 : z.liftTo;
        const was = z.lift;
        z.lift = approach(z.lift, z.liftTo, 8, dt);
        if (Math.abs(z.lift - was) > 1e-4) busy = true;

        const edge = (a) => z.x + a * k * z.facing;
        if (forward && z.lift < 0.3) {
            // The blade swept from where it was to where it is now: everything above its edge.
            const cut = (this.floor - z.by) / u + 1.5;
            const from = edge(DOZER.blade[0]) - went;
            const to = edge(DOZER.blade[1]);
            const ia = this.index(Math.min(from, to));
            const ib = this.index(Math.max(from, to));
            let took = 0;
            for (let i = ia; i <= ib; i++) {
                const excess = this.pit.tops[i] - cut;
                if (excess > 1e-6) took += this.pit.take(i, excess, z.load);
            }
            if (took > 0) {
                this.changed();
                this.moved(took);
            }
        }
        // What the blade is pushing spills out ahead of it, more when it is heaped high.
        const held = stackSum(z.load);
        if (held > 1e-9 && (forward || !z.dragging || z.lift > 0.5)) {
            const spill =
                z.lift > 0.5 || !z.dragging ? held : held * clamp((held / this.bladeCap) * 6 * dt, 0, 1);
            const front = edge(DOZER.blade[1] + 0.06);
            const scratch = [];
            stackTake(z.load, spill, scratch);
            const i = this.index(front);
            const step = z.facing > 0 ? 1 : -1;
            for (const [m, a] of scratch) {
                this.pit.add(i, m, a * 0.6);
                this.pit.add(clamp(i + step, 0, COLUMNS - 1), m, a * 0.4);
            }
            this.changed();
            busy = true;
        }
        return busy;
    }

    //--------------------------------------------------------------------------
    // Finds: buried things that come up when the digging reaches them.

    freshKind() {
        const inPlay = new Set(this.finds.map((f) => f.kind));
        const unfound = art.FINDS.filter((kind) => !inPlay.has(kind) && !this.found.has(kind));
        const free = art.FINDS.filter((kind) => !inPlay.has(kind));
        const pool = unfound.length ? unfound : free.length ? free : art.FINDS;
        return pool[Math.floor(this.rand() * pool.length) % pool.length];
    }

    // Bury a find somewhere it will take some digging to reach, away from the others.
    bury(kind, first = false, item = null) {
        const w = this.w;
        let x = 0;
        for (let tries = 0; tries < 12; tries++) {
            x = w * (0.08 + this.rand() * 0.84);
            if (this.finds.every((f) => f === item || Math.abs(f.x - x) > w * 0.1)) break;
        }
        const top = this.heightAt(x);
        const depth = Math.max(top * (0.35 + this.rand() * 0.3), top - (first ? 70 : 110));
        const f = item || {
            kind,
            squash: new Spring(0, 260, 10),
            facing: this.rand() < 0.5 ? -1 : 1,
            roll: 0,
        };
        Object.assign(f, { x, h: Math.min(depth, top - 28), state: 'buried', t: 0, up: 0, rest: 0 });
        if (!item) this.finds.push(f);
        return f;
    }

    // The first bite of the outing: whatever is buried nearest was just under the bucket, and comes
    // up now, before the sand can slide back over it.
    plantUnder(x, cut) {
        const buried = this.finds.filter((f) => f.state === 'buried');
        let f = buried.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
        if (!f) f = this.bury(this.freshKind());
        f.x = x;
        f.h = Math.max(1, cut - 2);
        this.unearth(f);
    }

    updateFinds(dt) {
        if (!this.finds.length) return false;
        const u = this.u;
        let busy = false;
        const size = this.k * FIND;
        for (const f of this.finds) {
            if (f.squash.update(dt)) busy = true;
            f.t += dt;
            const top = this.heightAt(f.x);
            if (f.state === 'buried') {
                if (top < f.h + 6) this.unearth(f);
                continue;
            }
            busy = true;
            if (f.state === 'rising') {
                if (f.t >= f.fly) {
                    f.state = 'out';
                    f.t = 0;
                    f.x = f.x1;
                    f.rest = this.heightAt(f.x);
                }
            } else if (f.state === 'out') {
                // Sitting on the sand, it rides the sand: down a hole, up a heap, and buried again
                // under a pour.
                if (top > f.rest + (size * 1.2) / u) {
                    f.state = 'buried';
                    f.h = f.rest;
                    continue;
                }
                f.rest = top;
                if (f.kind === 'mole') f.up = Math.min(1, f.up + dt * 4);
                if (f.kind === 'worm' || f.kind === 'mole') {
                    if (f.t > (f.kind === 'worm' ? 6 : 4.5)) {
                        f.state = 'leaving';
                        f.t = 0;
                    }
                }
                if (f.kind === 'car' && f.rolling > 0) {
                    const step = Math.min(f.rolling, this.k * 0.5 * dt);
                    f.rolling -= step;
                    f.x = clamp(f.x + step * f.facing, 10 * u, this.w - 10 * u);
                    f.roll += (step / (size * 0.1)) * f.facing;
                }
            } else if (f.state === 'leaving') {
                if (f.kind === 'mole') f.up = Math.max(0, f.up - dt * 3);
                if (f.t > (f.kind === 'mole' ? 0.4 : 1.1)) this.bury(f.kind, false, f);
            }
        }
        return busy;
    }

    // A find comes up into the light: it hops out of the hole onto the sand beside it, with a note.
    unearth(f) {
        const u = this.u;
        const size = this.k * FIND;
        this.found.add(f.kind);
        f.t = 0;
        if (f.kind === 'mole') {
            // A mole comes up by itself, from its own hole.
            f.state = 'out';
            f.up = 0;
            f.x1 = f.x;
            f.rest = this.heightAt(f.x);
            this.later(0.2, () => audio.play('squeak', { f: 2600 }, { gain: 0.6, pan: this.pan(f.x) }));
        } else {
            f.state = 'rising';
            f.x0 = f.x;
            f.y0 = this.floor - f.h * u;
            const side = this.digger.x < f.x ? 1 : -1;
            f.x1 = clamp(f.x + side * size * (1.4 + this.rand()), size, this.w - size);
            f.fly = 0.55;
        }
        audio.note('glock', NOTES[f.kind] + 5, 72, { gain: 0.8, pan: this.pan(f.x), wet: 0.3 });
        this.later(0.18, () =>
            audio.note('glock', NOTES[f.kind] + 7, 72, { gain: 0.55, pan: this.pan(f.x), wet: 0.3 })
        );
        this.twinkles(f.x, this.surfaceY(f.x) - size * 0.4);
        // Keep something buried for the next dig, but never crowd the sand.
        const buried = this.finds.filter((g) => g.state === 'buried').length;
        if (buried < this.plan.finds - 1 && this.finds.length < 6) this.bury(this.freshKind());
    }

    // The bucket coming down on a find that is out: it hops out of the way rather than being dug.
    nudgeFinds(x, half) {
        for (const f of this.finds) {
            if (f.state !== 'out' || Math.abs(f.x - x) > half * 1.3) continue;
            if (f.kind === 'mole') {
                f.state = 'leaving';
                f.t = 0;
                continue;
            }
            f.state = 'rising';
            f.t = 0;
            f.x0 = f.x;
            f.y0 = this.surfaceY(f.x);
            f.x1 = clamp(f.x + (f.x > x ? 1 : -1) * half * 2.2, 10 * this.u, this.w - 10 * this.u);
            f.fly = 0.4;
            audio.play('pop', { f: 600 }, { gain: 0.5, pan: this.pan(f.x) });
        }
    }

    tapFind(f) {
        const pan = this.pan(f.x);
        f.squash.kick(6);
        if (f.kind === 'bone') audio.play('wood', { f: noteHz(0, 60) }, { gain: 0.8, pan });
        else if (f.kind === 'shell') audio.note('glock', 7, 72, { gain: 0.7, pan, wet: 0.3 });
        else if (f.kind === 'fossil') audio.note('chime', 4, 60, { gain: 0.7, pan });
        else if (f.kind === 'worm') audio.play('squeak', { f: 1400 }, { gain: 0.35, pan });
        else if (f.kind === 'mole') {
            audio.play('squeak', { f: 2600 }, { gain: 0.6, pan });
            f.blink = this.time + 0.25;
            f.t = Math.min(f.t, 1.5);
        } else if (f.kind === 'car') {
            audio.play('beep', { f: noteHz(2, 72) }, { gain: 0.6, pan });
            f.rolling = this.k * 0.5;
        }
        this.twinkles(f.x, this.surfaceY(f.x) - this.k * 0.08);
    }

    twinkles(x, y) {
        const u = this.u;
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + this.rand();
            this.fx.push({
                t: -i * 0.05,
                life: 0.7,
                draw: (ctx, f) => {
                    if (f.t < 0) return;
                    const k = f.t / f.life;
                    const r = 30 * u * k;
                    art.twinkle(ctx, x + Math.cos(a) * r, y + Math.sin(a) * r * 0.7, (6 - 4 * k) * u, 1 - k);
                },
            });
        }
    }

    findAt(x, y) {
        const size = this.k * FIND;
        for (const f of this.finds) {
            if (f.state !== 'out') continue;
            if (dist(x, y, f.x, this.surfaceY(f.x) - size * 0.3) < size * 0.75) return f;
        }
        return null;
    }

    //--------------------------------------------------------------------------
    // Input

    // Which machine, if any, is under a point: a point in a machine's own frame, inside its box.
    machineAt(x, y) {
        const k = this.k;
        const inside = (m, box) => {
            const p = toLocal(m.x, m.by, k, this.pose(m), x, y);
            return p.x > box[0] && p.x < box[1] && p.y > box[2] && p.y < box[3] ? p : null;
        };
        if (this.truck) {
            const p = inside(this.truck, [-0.5, 0.48, -0.56 - this.truck.tip * 0.4, 0.02]);
            if (p) return { m: this.truck, part: p.x > TRUCK.cab[0] ? 'cab' : 'bed' };
        }
        if (this.dozer && inside(this.dozer, DOZER.body)) return { m: this.dozer };
        const d = this.digger;
        if (inside(d, [DIGGER.house[0], DIGGER.tracks[1], DIGGER.house[2], 0.02])) return { m: d };
        return null;
    }

    down(p) {
        const f = this.findAt(p.x, p.y);
        if (f) {
            p.owner = { type: 'find', find: f };
            return;
        }
        const hit = this.machineAt(p.x, p.y);
        if (hit && hit.m !== this.digger) {
            const m = hit.m;
            if (m.pointer) return;
            m.pointer = p;
            m.dragging = false;
            m.grab = m.x - p.x;
            p.owner = { type: 'machine', m, part: hit.part };
            return;
        }
        const d = this.digger;
        if (hit) {
            p.owner = { type: 'digger' };
            return;
        }
        if (d.pointer) {
            p.owner = { type: 'sand' };
            return;
        }
        d.pointer = p;
        d.driving = false;
        d.pressed = this.time;
        p.owner = { type: 'bucket' };
    }

    move(p) {
        const o = p.owner;
        if (!o) return;
        if (o.type === 'machine' && !o.m.dragging && p.travel > 8 * this.u) o.m.dragging = true;
    }

    up(p) {
        const o = p.owner;
        if (!o) return;
        if (o.type === 'find') {
            this.tapFind(o.find);
        } else if (o.type === 'machine') {
            const m = o.m;
            m.pointer = null;
            if (!m.dragging) this.tapMachine(m, o.part);
            m.dragging = false;
            if (m.kind === 'dozer') m.liftTo = 0;
        } else if (o.type === 'digger') {
            this.horn();
        } else if (o.type === 'sand') {
            this.tapSand(p.x, p.y);
        } else if (o.type === 'bucket') {
            const d = this.digger;
            d.pointer = null;
            if (!d.driving) {
                // A tap: on the sand it sprays; in the air the arm reaches to it.
                if (p.y > this.surfaceY(p.x)) this.tapSand(p.x, p.y);
                else d.aim = { x: p.x, y: p.y, held: false };
            } else {
                d.driving = false;
                d.aim = null;
                if (stackSum(d.load) > 1e-6) {
                    d.pouring = true;
                    d.poured = 0;
                    d.landed = false;
                    audio.play('hiss', {}, { gain: 0.35, pan: this.pan(d.cx) });
                }
            }
        }
    }

    cancel(p) {
        const o = p.owner;
        if (!o) return;
        if (o.type === 'machine') {
            o.m.pointer = null;
            o.m.dragging = false;
        } else if (o.type === 'bucket') {
            const d = this.digger;
            d.pointer = null;
            d.driving = false;
            d.aim = null;
        }
    }

    horn() {
        const d = this.digger;
        d.bounce.kick(-7);
        d.glow = 1;
        audio.play('toot', { f: noteHz(0, 48) }, { gain: 1, pan: this.pan(d.x) });
    }

    tapMachine(m, part) {
        m.bounce.kick(-6);
        m.glow = 1;
        const pan = this.pan(m.x);
        if (m.kind === 'truck') {
            if (part === 'bed') this.tip();
            else {
                audio.play('beep', { f: noteHz(4, 72) }, { gain: 0.8, pan });
                audio.play('beep', { f: noteHz(4, 72) }, { gain: 0.8, pan, delay: 0.3 });
            }
        } else {
            audio.play('toot', { f: noteHz(2, 48) }, { gain: 0.9, pan });
            m.liftTo = m.liftTo > 0.5 ? 0 : 1;
        }
    }

    // A tap on the sand: a little of it jumps up and patters down again.
    tapSand(x, y) {
        const u = this.u;
        const i = this.index(x);
        const spray = [];
        for (let j = Math.max(0, i - 1); j <= Math.min(COLUMNS - 1, i + 1); j++) {
            this.pit.take(j, Math.min(3, Math.max(0, this.pit.tops[j] - 4)), spray);
        }
        this.changed();
        const top = this.surfaceY(x);
        let left = stackSum(spray);
        const each = left / 12;
        while (left > 1e-9 && spray.length) {
            const a = -Math.PI / 2 + (this.rand() - 0.5) * 1.6;
            const speed = (260 + this.rand() * 220) * u;
            const v = stackTake(spray, Math.min(each, left), null);
            left -= v;
            this.grains.push({
                x: x + (this.rand() - 0.5) * 10 * u,
                y: top - 2 * u,
                vx: Math.cos(a) * speed * 0.6,
                vy: Math.sin(a) * speed,
                v,
                m: SAND,
                r: (2.2 + this.rand() * 1.6) * u,
            });
        }
        // What was sprayed keeps its colour.
        if (this.plan.earth) {
            const col = this.pit.cols[i];
            const m = topMaterial(col);
            for (const g of this.grains.slice(-12)) g.m = m;
        }
        audio.play('crunch', { seed: 3 }, { gain: 0.6, pan: this.pan(x) });
        void y;
    }

    //--------------------------------------------------------------------------
    // Drawing

    draw(ctx) {
        if (!this.background) this.drawBackground();
        ctx.drawImage(this.background.canvas, 0, 0, this.w, this.h);
        this.drawGround(ctx);
        this.drawFinds(ctx);
        if (this.truck) this.drawTruck(ctx);
        if (this.dozer) this.drawDozer(ctx);
        this.drawDigger(ctx);
        this.drawGrains(ctx);
        for (const f of this.fx) f.draw(ctx, f);
    }

    drawBackground() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const horizon = this.floor - (this.floor / u) * 0.2 * u - 30 * u;
        art.background(ctx, w, h, horizon, u);
        // The pit's floor: firm, packed and darker, under all the sand.
        ctx.fillStyle = '#B49478';
        ctx.fillRect(0, this.floor - 2 * u, w, h - this.floor + 2 * u);
        ctx.fillStyle = 'rgba(112, 84, 58, 0.16)';
        ctx.fillRect(0, this.floor - 2 * u, w, 4 * u);
        grain(ctx, 0, this.floor, w, h - this.floor, 0.4, this.scale);
        this.background = layer;
    }

    // The ground's colours are painted a column to a pixel into a narrow canvas, layer by layer,
    // and stretched across the screen: the stretch blends neighbouring columns, so stripes run as
    // smooth bands rather than steps. The smooth outline of the surface then cuts it to shape.
    drawRaster() {
        const u = this.u;
        const tall = Math.ceil(this.floor);
        if (!this.raster) {
            this.raster = document.createElement('canvas');
            this.raster.width = COLUMNS;
            this.raster.height = tall;
            this.depth = null;
        }
        const ctx = this.raster.getContext('2d');
        for (let i = 0; i < COLUMNS; i++) {
            const col = this.pit.cols[i];
            let y = tall;
            for (let j = 0; j < col.length; j++) {
                const hp = col[j][1] * u;
                ctx.fillStyle = TONES[col[j][0]].body;
                ctx.fillRect(i, y - hp - 0.5, 1, hp + 1);
                y -= hp;
            }
            // A lit skin along the top, carried a little above it for the stretch to blend with.
            ctx.fillStyle = TONES[topMaterial(col)].top;
            ctx.fillRect(i, Math.max(0, y - 20 * u), 1, 20 * u + 4 * u);
        }
        if (!this.depth) {
            this.depth = ctx.createLinearGradient(0, tall * 0.45, 0, tall);
            this.depth.addColorStop(0, 'rgba(112, 84, 58, 0)');
            this.depth.addColorStop(1, 'rgba(112, 84, 58, 0.2)');
        }
        ctx.fillStyle = this.depth;
        ctx.fillRect(0, 0, COLUMNS, tall);
        this.groundDirty = false;
    }

    surfacePath(ctx) {
        const cw = this.cw;
        const tops = this.pit.tops;
        const u = this.u;
        const y = (i) => this.floor - tops[i] * u;
        ctx.beginPath();
        ctx.moveTo(0, this.floor);
        ctx.lineTo(0, y(0));
        for (let i = 0; i < COLUMNS - 1; i++) {
            ctx.quadraticCurveTo((i + 0.5) * cw, y(i), (i + 1) * cw, (y(i) + y(i + 1)) / 2);
        }
        ctx.lineTo(this.w, y(COLUMNS - 1));
        ctx.lineTo(this.w, this.floor);
        ctx.closePath();
    }

    drawGround(ctx) {
        if (this.groundDirty || !this.raster) this.drawRaster();
        let highest = 0;
        for (let i = 0; i < COLUMNS; i++) highest = Math.max(highest, this.pit.tops[i]);
        const top = this.floor - highest * this.u - 4;
        ctx.save();
        this.surfacePath(ctx);
        ctx.clip();
        ctx.drawImage(this.raster, 0, 0, COLUMNS, this.raster.height, 0, 0, this.w, this.raster.height);
        grain(ctx, 0, top, this.w, this.floor - top, 0.32, this.scale);
        ctx.restore();
    }

    drawFinds(ctx) {
        const size = this.k * FIND;
        const u = this.u;
        for (const f of this.finds) {
            if (f.state === 'buried') continue;
            let x = f.x;
            let y = this.surfaceY(f.x) + 2 * u;
            const o = {
                squash: f.squash.value * 0.05,
                facing: f.facing,
                roll: f.roll,
                wriggle: this.time * (f.kind === 'worm' ? 9 : 0),
                up: f.up,
                blink: f.blink && this.time < f.blink,
            };
            if (f.state === 'rising') {
                const k = clamp(f.t / f.fly, 0, 1);
                const y1 = this.surfaceY(f.x1) + 2 * u;
                x = f.x0 + (f.x1 - f.x0) * k;
                y = f.y0 + (y1 - f.y0) * k - Math.sin(k * Math.PI) * size * 1.6;
                o.tilt = (1 - k) * 0.8 * (f.x1 > f.x0 ? 1 : -1);
            } else if (f.state === 'leaving' && f.kind === 'worm') {
                o.down = clamp(f.t / 1.1, 0, 1);
            }
            art.find(ctx, f.kind, x, y, size, o);
        }
    }

    loadColour(stack) {
        return TONES[topMaterial(stack)].body;
    }

    beacon(m) {
        return m.glow > 0 ? m.glow * (0.55 + 0.45 * Math.sin(this.time * 9)) : 0;
    }

    drawDigger(ctx) {
        const d = this.digger;
        const o = this.diggerPose();
        o.travel = d.travel;
        o.beacon = this.beacon(d);
        o.bounce = d.bounce.value;
        o.load = stackSum(d.load) / this.bucketCap;
        o.loadColour = this.loadColour(d.load);
        if (Math.abs(d.squash.value) > 0.001) {
            ctx.save();
            ctx.translate(d.x, d.by);
            ctx.scale(1 - Math.abs(d.squash.value), 1);
            ctx.translate(-d.x, -d.by);
            digger(ctx, d.x, d.by, this.k, o);
            ctx.restore();
        } else {
            digger(ctx, d.x, d.by, this.k, o);
        }
    }

    drawTruck(ctx) {
        const t = this.truck;
        dumpTruck(ctx, t.x, t.by, this.k * 0.95, {
            facing: t.facing,
            tilt: t.tilt,
            tip: t.tip,
            load: stackSum(t.load) / this.truckCap,
            loadColour: this.loadColour(t.load),
            roll: t.roll,
            beacon: this.beacon(t),
            bounce: t.bounce.value,
        });
    }

    drawDozer(ctx) {
        const z = this.dozer;
        bulldozer(ctx, z.x, z.by, this.k * 0.88, {
            facing: z.facing,
            tilt: z.tilt,
            lift: z.lift,
            load: stackSum(z.load) / this.bladeCap,
            loadColour: this.loadColour(z.load),
            travel: z.travel,
            beacon: this.beacon(z),
            bounce: z.bounce.value,
        });
    }

    // Grains batched by colour: one shape each, filled once.
    drawGrains(ctx) {
        if (!this.grains.length) return;
        for (const m of [SAND, EARTH]) {
            ctx.beginPath();
            let any = false;
            for (const g of this.grains) {
                if (g.m !== m) continue;
                any = true;
                ctx.moveTo(g.x + g.r, g.y);
                ctx.arc(g.x, g.y, g.r, 0, TAU);
            }
            if (!any) continue;
            ctx.fillStyle = m === SAND ? SITE.sandDeep : SITE.earthDeep;
            ctx.fill();
        }
    }

    exit() {
        freeLayer(this.background);
        this.background = null;
        this.freeRaster();
        this.motor.stop();
        this.grit.stop();
        this.fx = [];
        this.queue = [];
        this.grains = [];
    }
}

// The tray: a heap of sand, and the digger with its bucket in it.
function icon(ctx, x, y, w, h) {
    const s = Math.min(w, h);
    const by = y + h * 0.8;
    ctx.fillStyle = SITE.sand;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.04, by);
    ctx.quadraticCurveTo(x + w * 0.62, y + h * 0.2, x + w * 0.96, by);
    ctx.closePath();
    ctx.fill();
    ellipse(ctx, x + w * 0.5, by, w * 0.46, h * 0.05);
    ctx.fillStyle = SITE.sand;
    ctx.fill();
    digger(ctx, x + w * 0.3, by + h * 0.02, s * 0.44, { boom: -0.62, stick: 0.75, bucket: 0.8 });
}

export const toy = {
    id: 'dig',
    title: 'Dig',
    about: 'A sandpit and a digger whose bucket follows a finger: dig, carry, pour, fill the truck and tip it, and find what is buried.',
    stages: [
        'a digger and a heap of sand',
        'and a dump truck, and things buried',
        'and a bulldozer, and earth under the sand',
    ],
    mat: '#EFE4CC',
    icon,
    create: (app) => new DigScene(app),
    sounds() {
        const list = [
            ['crunch', {}],
            ['crunch', { seed: 3 }],
            ['rumble', {}],
            ['rumble', { variant: 'short' }],
            ['hiss', {}],
            ['putt', {}],
            ['beep', { f: noteHz(4, 72) }],
            ['beep', { f: noteHz(2, 72) }],
            ['toot', { f: noteHz(0, 48) }],
            ['toot', { f: noteHz(2, 48) }],
            ['squeak', { f: 2600 }],
            ['squeak', { f: 1400 }],
            ['pop', { f: 600 }],
            ['wood', { f: noteHz(0, 60) }],
            ['chime', { f: noteHz(4, 60) }],
        ];
        for (const d of Object.values(NOTES)) {
            for (const step of [5, 7]) list.push(['glock', { f: noteHz(d + step, 72) }]);
        }
        list.push(['glock', { f: noteHz(7, 72) }]);
        return list;
    },
    signature() {
        audio.play('crunch', {}, { gain: 0.6, delay: 0.05 });
        audio.play('toot', { f: noteHz(0, 48) }, { gain: 0.5, delay: 0.3 });
    },
};
