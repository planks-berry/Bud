// The farm: an island of grass to build on, a tile at a time, and a tray of pieces to build it with.
//
// After Pok Pok's builder rather than any Montessori material, on the board in board.js: a little
// farm seen from a corner and above, like a model on a table. A tile of grass from the tray, put
// down on the table, makes the island bigger; a path, a field or a pond put down on a tile changes
// it to that; a barn, a tree or a cow stands on it. Dragged again, they move, swap places, or go
// back to the tray. Nothing is a goal and nothing is wrong: a pond can go anywhere and a cow can
// stand in a row of barns.
//
// Every piece does three things:
//   - it connects: paths, fields, ponds, streams and fences join their neighbours; water runs from a
//     pond along a stream to what is at its end; animals answer animals of their own kind; a field
//     by water grows on its own; a cow beside water drinks from it;
//   - it reacts to a tap: the field grows, the tree drops apples, the barn opens, the cow moos;
//   - it hides something, found by playing: a rabbit in the carrots, a frog on a lily pad, ducks
//     that come to a big enough pond, an owl in the hayloft at night, a cow that jumps over the
//     moon.
//
// The sun in the corner turns day to night and back. At night the windows light, the animals
// sleep (in the barn, if they stand beside one), fireflies come out over the water, and some of
// the hidden things only happen then.
//
//   touch  - tap anything: every piece and every patch of grass answers.
//   move   - drag tiles and pieces from the tray, and around the island.
//   make   - a farm, joined up and as big as the table: paths for the tractor to drive, fields
//            beside water, a pond big enough for ducks.

import { fillRound, disc, ellipse } from '../draw.js';
import { Spring, clamp, lerp, TAU, dist, shade } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { BoardScene, AROUND, SIDES, E, W, key, FOOT } from './board.js';
import * as iso from './iso.js';
import * as art from './farmart.js';

const { FARM } = art;

// The ground: flat pieces that join their neighbours and lie under everything else.
const GROUND = ['path', 'field', 'pond', 'stream'];
const ANIMALS = ['cow', 'sheep', 'pig'];
const CROPS = ['carrot', 'pumpkin', 'sunflower', 'cabbage'];

// What each stage puts in the tray, how big the table is, and the little island the farm starts as:
// '.' is grass with nothing on it, ' ' the table still to build on.
const CODES = {
    P: 'path',
    F: 'field',
    W: 'pond',
    T: 'tree',
    C: 'cow',
    R: 'tractor',
    B: 'barn',
    S: 'sheep',
    H: 'coop',
    N: 'fence',
    G: 'pig',
    M: 'windmill',
    O: 'house',
};

const PLANS = [
    {
        cols: 5,
        rows: 4,
        kinds: ['grass', 'path', 'field', 'pond', 'stream', 'tree', 'cow', 'tractor'],
        start: [' T.  ', ' PPP ', ' FRW ', ' FCW '],
    },
    {
        cols: 6,
        rows: 5,
        kinds: [
            'grass',
            'path',
            'field',
            'pond',
            'stream',
            'fence',
            'tree',
            'barn',
            'coop',
            'cow',
            'sheep',
            'tractor',
        ],
        start: ['  T.  ', ' BPPP ', ' .RCN ', ' FFSS ', '  WWH '],
    },
    {
        cols: 7,
        rows: 5,
        kinds: [
            'grass',
            'path',
            'field',
            'pond',
            'stream',
            'fence',
            'tree',
            'barn',
            'house',
            'windmill',
            'coop',
            'cow',
            'sheep',
            'pig',
            'tractor',
        ],
        start: ['  T.BO ', ' PPPPP ', ' FFR.NN', ' FMCSS ', ' GWW.H '],
    },
];

// Each animal's voice, and the scale degree (from C4) of its usual call. Neighbours answer a step
// or more higher, so a herd calling in turn climbs the scale.
const VOICES = {
    cow: ['moo', -5],
    sheep: ['baa', -2],
    pig: ['oink', -4],
};

const FLOWERS = ['#F2BAC3', '#F3DE97', '#C9BBE3', '#FBF6EE', '#ABCDEA'];

// How long water takes to run along one tile of a stream, in seconds; a leaf floats slower.
const STEP = 0.32;
const DRIFT = 0.7;

// What stands tall enough to hide a piece behind it, which then shows through.
const TALL = ['tree', 'barn', 'house', 'windmill', 'coop'];

// How far down its frame each upright piece's drawing begins, for touching it (animals: 0.4).
const REACH = { tree: 0.05, barn: 0.22, house: 0.2, windmill: 0, coop: 0.34, fence: 0.45, tractor: 0.42 };

class FarmScene extends BoardScene {
    constructor(app) {
        super(app, PLANS, 'grass');
        this.ducks = [];
        this.frog = null;
        this.frogClock = 1.5;
        this.growClock = 0;
        this.flowers = {};
        this.leaves = [];
        this.look = {
            sky: ['#EEF2E1', '#E2EAD0'],
            table: 'rgba(255, 255, 248, 0.38)',
            tableLine: 'rgba(140, 170, 115, 0.32)',
            base: FARM.grass,
            alt: FARM.grassAlt,
            lip: FARM.grassEdge,
            lipDark: shade(FARM.grassEdge, -0.1),
            side: FARM.soil,
            sideDark: shade(FARM.soil, -0.12),
            deep: FARM.soilEdge,
            deepDark: shade(FARM.soilEdge, -0.12),
            dust: '232, 222, 196',
        };
        this.begin(CODES);
        this.normalise(true);
    }

    // The starting fields are already sprouting, so there is something to grow at the first tap.
    starting(piece) {
        if (piece.kind === 'field') piece.stage = 2;
    }

    isGround(kind) {
        return GROUND.indexOf(kind) >= 0;
    }

    joins(kind) {
        return this.isGround(kind) || kind === 'fence';
    }

    // A flower in the grass is gone when a piece takes its tile.
    clearTile(c, r) {
        const flowered = !!this.flowers[key(c, r)];
        delete this.flowers[key(c, r)];
        return flowered;
    }

    // An animal put down faces into the farm.
    placed(c, r, piece, quiet) {
        if (!quiet && ANIMALS.indexOf(piece.kind) >= 0)
            piece.facing = this.center(c, r).x < this.w / 2 ? 1 : -1;
    }

    // The ducks were placed before the board had a size, or for another one: put them back on their
    // water.
    laidOut() {
        for (const family of this.ducks) this.seatDucks(family);
    }

    // Each frame: a field beside water grows by itself, a stage every few seconds, the ducks swim
    // and the frog comes and goes.
    tick(dt) {
        this.growClock += dt;
        if (this.growClock > 8) {
            this.growClock = 0;
            this.growByWater();
        }
        this.updateDucks(true, dt);
        this.updateFrog(dt);
        this.stepStreams(dt);
        this.stepLeaves(dt);
    }

    //--------------------------------------------------------------------------
    // Pieces

    make(kind) {
        const p = {
            kind,
            seed: Math.floor(this.rand() * 1000),
            bounce: new Spring(0, 320, 11),
            away: null,
        };
        if (kind === 'field') {
            p.stage = 0;
            p.crop = CROPS[Math.floor(this.rand() * CROPS.length)];
            p.pop = new Spring(0, 260, 12);
            p.giant = false;
        } else if (kind === 'tree') {
            p.apples = [0, 2, 3];
            p.shake = new Spring(0, 140, 5);
            p.grow = 0;
        } else if (kind === 'barn' || kind === 'house') {
            p.door = new Spring(0, 80, 13);
            p.cat = 0;
            p.catClock = 2 + this.rand() * 4;
            p.dark = false;
        } else if (kind === 'windmill') {
            p.angle = this.rand() * TAU;
            p.spin = 0.35;
            p.rider = 0;
            p.cooldown = 0;
        } else if (kind === 'coop') {
            p.egg = false;
            p.out = 0;
        } else if (kind === 'fence') {
            p.bird = 0;
            p.snail = 0;
            p.snailClock = 3 + this.rand() * 4;
        } else if (ANIMALS.indexOf(kind) >= 0) {
            p.facing = this.rand() < 0.5 ? -1 : 1;
            p.act = new Spring(0, 240, 9);
            p.dip = new Spring(0, 60, 10);
            p.thirst = 2 + this.rand() * 6;
            p.jumps = 0;
            p.muddy = false;
            p.clean = 0;
            p.roll = new Spring(0, 80, 10);
        } else if (kind === 'tractor') {
            p.facing = 1;
            p.trip = null;
            p.act = new Spring(0, 260, 9);
        } else if (kind === 'stream') {
            // How full it is, 0 to 1; how many tiles it is from a pond, and which side its water comes
            // from, when it is joined to one; and when its water arrives.
            p.wet = 0;
            p.reach = null;
            p.from = null;
            p.fillAt = Infinity;
        }
        return p;
    }

    // A stream picked up runs dry, so that put down again, the water runs into it again.
    lifted(c, r, piece) {
        if (piece.kind !== 'stream') return;
        piece.wet = 0;
        piece.reach = null;
    }

    // After any change to the board: joined fields share one crop and one stage, pigs by water are
    // muddy, and a pond grown big enough gets its ducks.
    normalise(quiet = false) {
        const seen = new Set();
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, 'field') || seen.has(key(c, r))) continue;
                const cells = this.component(c, r, 'field');
                let lead = this.at(c, r);
                for (const [cc, rr] of cells) {
                    seen.add(key(cc, rr));
                    if (this.at(cc, rr).stage > lead.stage) lead = this.at(cc, rr);
                }
                for (const [cc, rr] of cells) {
                    const p = this.at(cc, rr);
                    if (p.stage !== lead.stage) p.pop.kick(6);
                    p.stage = lead.stage;
                    p.crop = lead.crop;
                    if (p.stage < 4) p.giant = false;
                }
            }
        }
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.at(c, r);
                if (p && p.kind === 'pig') p.muddy = !!this.waterBeside(c, r) && this.time >= p.clean;
            }
        }
        this.waterways(quiet);
        this.updateDucks(quiet);
        if (this.frog && !this.is(this.frog.c, this.frog.r, 'pond')) this.frog = null;
    }

    //--------------------------------------------------------------------------
    // The ground: grass, then fields, ponds and paths, drawn once into a layer and again whenever
    // a ground piece moves.

    paintGround(ctx) {
        const s = this.cell;
        // A few tufts, so the grass is grass.
        ctx.strokeStyle = 'rgba(140, 175, 105, 0.45)';
        ctx.lineWidth = Math.max(1, s * 0.012);
        ctx.lineCap = 'round';
        for (const [c, r] of this.tiles()) {
            for (let i = 0; i < 3; i++) {
                const n = (c * 7 + r * 13 + i * 29) % 37;
                const tx = this.bx + c * s + s * (0.15 + ((n * 0.37) % 0.7));
                const ty = this.by + r * s + s * (0.2 + ((n * 0.53) % 0.65));
                ctx.beginPath();
                ctx.moveTo(tx - s * 0.015, ty);
                ctx.lineTo(tx - s * 0.02, ty - s * 0.03);
                ctx.moveTo(tx, ty);
                ctx.lineTo(tx, ty - s * 0.04);
                ctx.moveTo(tx + s * 0.015, ty);
                ctx.lineTo(tx + s * 0.022, ty - s * 0.028);
                ctx.stroke();
            }
        }

        this.blob(ctx, 'field', s * 0.05, s * 0.12, FARM.soilEdge);
        this.blob(ctx, 'field', s * 0.08, s * 0.1, FARM.soil);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, 'field')) continue;
                const m = this.mask(c, r);
                const x0 = this.bx + c * s + (m & W ? 0 : s * 0.12);
                const x1 = this.bx + (c + 1) * s - (m & E ? 0 : s * 0.12);
                for (let j = 0; j < 3; j++) {
                    const fy = this.by + r * s + s * (0.34 + 0.24 * j);
                    fillRound(ctx, x0, fy, x1 - x0, s * 0.03, s * 0.015, FARM.furrow);
                }
            }
        }

        this.drawStreamBeds(ctx, s * 0.42, FARM.reed);
        this.drawStreamBeds(ctx, s * 0.3, FARM.bed);
        for (const [c, r] of this.every('stream')) {
            for (let i = 0; i < 3; i++) {
                const n = (c * 11 + r * 17 + i * 23) % 31;
                disc(
                    ctx,
                    (c + 0.4 + ((n * 0.41) % 0.2)) * s,
                    (r + 0.4 + ((n * 0.67) % 0.2)) * s,
                    s * 0.016,
                    FARM.pebble
                );
            }
        }

        this.blob(ctx, 'pond', s * 0.04, s * 0.2, FARM.reed);
        this.blob(ctx, 'pond', s * 0.07, s * 0.18, FARM.waterDeep);
        this.blob(ctx, 'pond', s * 0.1, s * 0.15, FARM.water);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, 'pond')) continue;
                const { x, y } = this.mapRect(c, r);
                ellipse(ctx, x + s * 0.36, y + s * 0.3, s * 0.12, s * 0.035, -0.2);
                ctx.fillStyle = FARM.waterLight;
                ctx.fill();
                const pad = this.padOf(c, r);
                this.lilyPad(ctx, pad.x, pad.y, s);
            }
        }

        this.drawPaths(ctx, s * 0.5, FARM.pathEdge);
        this.drawPaths(ctx, s * 0.43, FARM.path);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, 'path')) continue;
                const { x, y } = this.mapRect(c, r);
                for (let i = 0; i < 4; i++) {
                    const n = (c * 11 + r * 17 + i * 23) % 31;
                    disc(
                        ctx,
                        x + s * (0.38 + ((n * 0.41) % 0.24)),
                        y + s * (0.38 + ((n * 0.67) % 0.24)),
                        s * 0.014,
                        FARM.pebble
                    );
                }
            }
        }

        // Flowers in the grass, where little fingers have planted them.
        for (const id of Object.keys(this.flowers)) {
            const c = Math.floor(id / 100);
            const r = id % 100;
            if (this.at(c, r) || !this.isLand(c, r)) continue;
            for (const f of this.flowers[id])
                art.flower(ctx, this.bx + (c + f.x) * s, this.by + (r + f.y) * s, s, f.colour);
        }
    }

    // Where a pond tile's lily pad floats, in the plan.
    padOf(c, r) {
        const s = this.cell;
        const n = (c * 13 + r * 7) % 5;
        return {
            x: this.bx + c * s + s * (0.32 + n * 0.08),
            y: this.by + r * s + s * (0.62 - (n % 2) * 0.08),
        };
    }

    lilyPad(ctx, x, y, s) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, s * 0.085, 0.35, TAU - 0.15);
        ctx.closePath();
        ctx.fillStyle = FARM.pad;
        ctx.fill();
    }

    //--------------------------------------------------------------------------
    // Time

    updatePiece(p, c, r, dt) {
        p.bounce.update(dt);
        if (p.pop) p.pop.update(dt);
        if (p.shake) p.shake.update(dt);
        if (p.door) p.door.update(dt);
        if (p.act) p.act.update(dt);
        if (p.dip) p.dip.update(dt);
        if (p.roll) p.roll.update(dt);

        if (p.kind === 'tree') {
            p.grow += dt;
            if (p.grow > 7 && p.apples.length < 3) {
                p.grow = 0;
                const free = [0, 1, 2, 3, 4].filter((i) => p.apples.indexOf(i) < 0);
                p.apples.push(free[Math.floor(this.rand() * free.length)]);
            }
        } else if (p.kind === 'windmill') {
            const idle = this.night > 0.5 ? 0.15 : 0.35;
            p.spin = idle + (p.spin - idle) * Math.exp(-dt / 1.6);
            p.angle += p.spin * dt;
            if (p.rider > 0) p.rider -= dt;
            if (p.cooldown > 0) p.cooldown -= dt;
        } else if (p.kind === 'tractor' && p.trip) {
            this.drive(p, c, r, dt);
        } else if (ANIMALS.indexOf(p.kind) >= 0) {
            // A cow beside a pond stops now and then to drink from it.
            if (p.kind === 'cow' && !p.away) {
                p.thirst -= dt;
                if (p.thirst < 0) {
                    p.thirst = 6 + this.rand() * 8;
                    const water = this.waterBeside(c, r);
                    if (water && this.night < 0.5) {
                        const [wc] = water;
                        if (wc !== c) p.facing = wc > c ? 1 : -1;
                        p.dip.target = 1;
                        this.later(1.6, () => (p.dip.target = 0));
                    }
                }
            }
            if (p.kind === 'pig' && p.muddy === false && this.time >= p.clean && this.waterBeside(c, r)) {
                p.muddy = true;
            }
        } else if (p.kind === 'barn' || p.kind === 'house') {
            if (p.cat > 0) p.cat -= dt;
            else if (this.night < 0.3) {
                p.catClock -= dt;
                if (p.catClock <= 0) {
                    p.cat = 14;
                    p.catClock = 8 + this.rand() * 10;
                }
            }
        } else if (p.kind === 'fence') {
            if (p.snail > 0) p.snail += dt;
            else {
                p.snailClock -= dt;
                if (p.snailClock <= 0) {
                    p.snail = 0.01;
                    p.snailClock = 10 + this.rand() * 10;
                }
            }
            if (p.snail > 30) p.snail = 0;
        }
    }

    //--------------------------------------------------------------------------
    // Sounds

    // Each kind's own sound, for being placed, or tapped in the tray.
    voice(kind, x, gain) {
        const pan = this.pan(x);
        if (kind === 'grass') {
            audio.play('rustle', {}, { gain: gain * 0.6, pan });
            audio.play('thud', { f: 100 }, { gain: gain * 0.5, pan });
        } else if (kind === 'path') audio.play('pat', {}, { gain, pan });
        else if (kind === 'field') {
            audio.play('thud', { f: 110 }, { gain: gain * 0.7, pan });
            audio.play('rustle', {}, { gain: gain * 0.5, pan, delay: 0.05 });
        } else if (kind === 'pond') audio.note('drop', 5, 60, { gain, pan, wet: 0.3 });
        else if (kind === 'stream') {
            audio.note('drop', 7, 60, { gain: gain * 0.8, pan, wet: 0.3 });
            audio.play('bubble', { f: 2200 }, { gain: gain * 0.4, pan, delay: 0.08 });
        } else if (kind === 'tree') audio.play('rustle', {}, { gain, pan });
        else if (kind === 'fence') audio.note('wood', 7, 60, { gain: gain * 0.8, pan });
        else if (kind === 'cow' || kind === 'sheep' || kind === 'pig') {
            const [name, degree] = VOICES[kind];
            audio.play(name, { f: noteHz(degree, 60) }, { gain, pan });
        } else if (kind === 'tractor') audio.play('toot', { f: noteHz(3, 60) }, { gain, pan });
        else if (kind === 'coop') audio.play('cluck', { f: noteHz(4, 60) }, { gain, pan });
        else if (kind === 'windmill') audio.play('whoosh', { variant: 'up' }, { gain, pan });
        else {
            audio.note('wood', 0, 60, { gain, pan });
            audio.play('thud', { f: 85 }, { gain: gain * 0.6, pan });
        }
    }

    //--------------------------------------------------------------------------
    // Taps

    tap(c, r, piece, p) {
        const kind = piece.kind;
        if (kind === 'field') this.tapField(c, r);
        else if (kind === 'pond') this.tapPond(c, r, p.x, p.y);
        else if (kind === 'stream') this.tapStream(c, r, piece, p.x, p.y);
        else if (kind === 'path') this.tapPath(c, r, p.x, p.y);
        else if (kind === 'tree') this.tapTree(c, r, piece);
        else if (kind === 'barn') this.tapBarn(c, r, piece, p);
        else if (kind === 'house') this.tapHouse(c, r, piece);
        else if (kind === 'windmill') this.tapWindmill(c, r, piece);
        else if (kind === 'coop') this.tapCoop(c, r, piece);
        else if (kind === 'fence') this.tapFence(c, r, piece);
        else if (kind === 'tractor') this.tapTractor(c, r, piece);
        else if (ANIMALS.indexOf(kind) >= 0) this.tapAnimal(c, r, piece);
    }

    // A tap on the grass plants a flower.
    tapEmpty(c, r, p) {
        const id = key(c, r);
        const list = this.flowers[id] || (this.flowers[id] = []);
        const s = this.cell;
        const g = this.gridAt(p.x, p.y);
        const fx = clamp(g.u - c, 0.12, 0.88);
        const fy = clamp(g.v - r, 0.15, 0.88);
        const colour = FLOWERS[Math.floor(this.rand() * FLOWERS.length)];
        if (list.length >= 5) list.shift();
        list.push({ x: fx, y: fy, colour });
        this.fx.push({
            t: 0,
            life: 0.3,
            draw: (ctx, f) => {
                const k = 1.4 - 0.4 * (f.t / f.life);
                ctx.save();
                this.planView(ctx);
                ctx.translate((c + fx) * s, (r + fy) * s);
                ctx.scale(k, k);
                art.flower(ctx, 0, 0, s, colour);
                ctx.restore();
            },
        });
        this.later(0.3, () => this.drawGround());
        audio.note('tink', 8 + Math.floor(this.rand() * 4), 60, { gain: 0.4, pan: this.pan(p.x) });
        if (this.night < 0.5 && this.surprise('butterfly', 0.5)) this.butterfly(p.x, p.y);
    }

    //--------------------------------------------------------------------------
    // Fields: tap to grow, tap ripe to harvest. A joined field grows as one, a ripple from the tap.

    tapField(c, r) {
        const cells = this.component(c, r, 'field');
        if (this.at(c, r).stage < 4) this.growField(cells, 0, true);
        else this.harvest(cells);
    }

    growField(cells, delay = 0, loud = false) {
        const stage = this.at(cells[0][0], cells[0][1]).stage;
        if (stage >= 4) return;
        const giant =
            stage === 3 &&
            this.at(cells[0][0], cells[0][1]).crop === 'pumpkin' &&
            this.surprise('giant', 0.5);
        const giantAt = Math.floor(this.rand() * cells.length);
        cells.forEach(([c, r], i) =>
            this.later(delay + i * 0.06, () => {
                const p = this.at(c, r);
                if (!p || p.kind !== 'field' || p.stage !== stage) return;
                p.stage = stage + 1;
                p.pop.kick(12);
                if (giant && i === giantAt) p.giant = true;
                audio.note('marimba', 2 + p.stage + Math.min(i, 5), 60, {
                    gain: loud ? 0.6 : 0.3,
                    pan: this.pan(this.center(c, r).x),
                });
            })
        );
    }

    // Ripe crops pop up and away: into the tractor's trailer if it is passing, else into the air.
    harvest(cells, tractor = null) {
        const crop = this.at(cells[0][0], cells[0][1]).crop;
        const s = this.cell;
        cells.forEach(([c, r], i) =>
            this.later(i * 0.05, () => {
                const p = this.at(c, r);
                if (!p || p.kind !== 'field' || p.stage < 4) return;
                const { x: cx, y: cy } = this.center(c, r);
                if (p.giant) this.rollPumpkin(cx, cy);
                for (let k = 0; k < 3; k++)
                    this.flyCrop(
                        crop,
                        cx + (k - 1) * s * 0.25,
                        cy + (this.rand() - 0.5) * s * 0.3,
                        tractor,
                        k * 0.04
                    );
                p.stage = 0;
                p.giant = false;
                p.pop.kick(8);
                audio.play(
                    'pop',
                    { f: 500 + 50 * Math.min(i, 6) },
                    { gain: 0.8, pan: this.pan(cx), delay: 0.02 }
                );
            })
        );
        const next = CROPS[(CROPS.indexOf(crop) + 1) % CROPS.length];
        this.later(cells.length * 0.05 + 0.1, () => {
            for (const [c, r] of cells) {
                const p = this.at(c, r);
                if (p && p.kind === 'field') p.crop = next;
            }
        });
        // Something lives among the carrots.
        if (crop === 'carrot' && this.surprise('rabbit', 0.7)) {
            const [c, r] = cells[Math.floor(this.rand() * cells.length)];
            this.later(0.4, () => this.rabbit(c, r));
        }
    }

    growByWater() {
        const seen = new Set();
        let wait = 0;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, 'field') || seen.has(key(c, r))) continue;
                const cells = this.component(c, r, 'field');
                for (const [cc, rr] of cells) seen.add(key(cc, rr));
                if (this.at(c, r).stage >= 4) continue;
                const wet = cells.find(([cc, rr]) => this.waterBeside(cc, rr));
                if (!wet) continue;
                const [pc, pr] = this.waterBeside(wet[0], wet[1]);
                const from = this.center(pc, pr);
                const to = this.center(wet[0], wet[1]);
                for (let k = 0; k < 3; k++) {
                    this.travel(from.x, from.y, to.x, to.y, wait + k * 0.12, FARM.waterLight);
                }
                this.growField(cells, wait + 0.5);
                wait += 0.3;
            }
        }
    }

    //--------------------------------------------------------------------------
    // Water

    tapPond(c, r, x, y) {
        this.ripple(x, y);
        // Higher to the right, across the whole table.
        const left = this.ox - (this.rows * this.tw) / 2;
        const across = ((this.cols + this.rows) * this.tw) / 2;
        const degree = 3 + Math.round((9 * (x - left)) / across);
        audio.note('drop', clamp(degree, 3, 12), 60, { gain: 0.9, pan: this.pan(x), wet: 0.3 });
        for (const family of this.ducks) {
            if (family.cells.some(([cc, rr]) => cc === c && rr === r)) {
                family.goal = { x, y };
                family.wait = 0;
            }
        }
    }

    ripple(x, y) {
        const s = this.cell;
        this.fx.push({
            t: 0,
            life: 1.2,
            water: true,
            draw: (ctx, f) => {
                for (let i = 0; i < 2; i++) {
                    const k = clamp(f.t / f.life - i * 0.2, 0, 1);
                    if (k <= 0) continue;
                    ellipse(ctx, x, y, s * (0.04 + 0.3 * k), s * (0.015 + 0.12 * k));
                    ctx.lineWidth = Math.max(1, s * 0.012);
                    ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * (1 - k)})`;
                    ctx.stroke();
                }
            },
        });
    }

    //--------------------------------------------------------------------------
    // Streams: water runs out of every pond into a stream beside it, and on along the stream, a
    // tile at a time, to whatever is at its end. A field it reaches grows; a cow it reaches drinks.
    // Cut off from its pond, a stream runs dry.

    // Water beside a tile: a pond, or a stream with water in it, as [c, r]; or null.
    waterBeside(c, r) {
        for (const [dc, dr] of SIDES) {
            const n = this.at(c + dc, r + dr);
            if (n && (n.kind === 'pond' || (n.kind === 'stream' && n.wet >= 1))) return [c + dc, r + dr];
        }
        return null;
    }

    // Which streams a pond feeds, how far each tile is from one, and which side its water comes in
    // by. Newly joined tiles fill in turn, nearest first, so the water is seen to travel.
    waterways(quiet) {
        const queue = [];
        for (const [c, r] of this.every('stream')) {
            const side = SIDES.find(([dc, dr]) => this.is(c + dc, r + dr, 'pond'));
            if (side) queue.push([c, r, 0, [side[0], side[1]]]);
        }
        const reach = {};
        for (let i = 0; i < queue.length; i++) {
            const [c, r, d, from] = queue[i];
            if (reach[key(c, r)]) continue;
            reach[key(c, r)] = { d, from };
            for (const [dc, dr] of SIDES) {
                if (this.is(c + dc, r + dr, 'stream') && !reach[key(c + dc, r + dr)])
                    queue.push([c + dc, r + dr, d + 1, [-dc, -dr]]);
            }
        }
        const fresh = [];
        for (const [c, r] of this.every('stream')) {
            const p = this.at(c, r);
            const way = reach[key(c, r)];
            if (!way) {
                p.reach = null;
                p.fillAt = Infinity;
                continue;
            }
            if (p.reach === null) fresh.push(p);
            p.reach = way.d;
            p.from = way.from;
        }
        const first = Math.min(...fresh.map((p) => p.reach));
        for (const p of fresh) {
            if (quiet) p.wet = 1;
            else p.fillAt = this.time + (p.reach - first) * STEP;
        }
    }

    stepStreams(dt) {
        for (const [c, r] of this.every('stream')) {
            const p = this.at(c, r);
            if (p.reach === null) {
                p.wet = Math.max(0, p.wet - dt / 0.6);
                continue;
            }
            if (p.wet >= 1 || this.time < p.fillAt) continue;
            p.wet = Math.min(1, p.wet + dt / STEP);
            if (p.wet >= 1) this.streamArrives(c, r, p);
        }
    }

    // The tiles a stream's water runs on to from (c, r).
    downstream(c, r) {
        const p = this.at(c, r);
        return SIDES.map(([dc, dr]) => [c + dc, r + dr]).filter(([nc, nr]) => {
            const n = this.at(nc, nr);
            return n && n.kind === 'stream' && n.reach === p.reach + 1;
        });
    }

    // The water has reached a tile: a note a step higher the further it has come, and what is beside
    // it gets the water.
    streamArrives(c, r, p) {
        const at = this.center(c, r);
        const pan = this.pan(at.x);
        audio.note('drop', clamp(4 + p.reach, 4, 12), 60, { gain: 0.45, pan, wet: 0.3 });
        this.water(c, r, 0.15);
        if (!this.downstream(c, r).length) {
            // The end of the stream: a splash.
            this.ripple(at.x, at.y);
            audio.play('slosh', {}, { gain: 0.35, pan, delay: 0.1 });
        }
    }

    // Water from the stream at (c, r) to what is beside it: a field grows, a cow drinks. (A pig
    // beside it gets muddy by itself.)
    water(c, r, delay) {
        const from = this.center(c, r);
        const seen = new Set();
        for (const [dc, dr] of SIDES) {
            const nc = c + dc;
            const nr = r + dr;
            const n = this.at(nc, nr);
            if (!n || n.away) continue;
            const to = this.center(nc, nr);
            if (n.kind === 'field' && !seen.has(key(nc, nr)) && n.stage < 4) {
                const cells = this.component(nc, nr, 'field');
                for (const [fc, fr] of cells) seen.add(key(fc, fr));
                for (let k = 0; k < 3; k++)
                    this.travel(from.x, from.y, to.x, to.y, delay + k * 0.12, FARM.waterLight);
                this.growField(cells, delay + 0.5);
            } else if (n.kind === 'cow' && this.night < 0.5) {
                if (nc !== c) n.facing = c > nc ? 1 : -1;
                n.dip.target = 1;
                this.later(delay + 1.6, () => (n.dip.target = 0));
            }
        }
    }

    // A tap on a stream with water in it sets a leaf floating down it to the end, where its water
    // goes to whatever is there. A dry stream crunches.
    tapStream(c, r, p, x, y) {
        const pan = this.pan(x);
        if (p.wet < 1) {
            this.puff(x, y, 0.6);
            audio.play('crunch', { seed: 3 }, { gain: 0.4, pan });
            return;
        }
        this.ripple(x, y);
        audio.note('drop', 6, 60, { gain: 0.7, pan, wet: 0.3 });
        const route = [[c, r]];
        for (let i = 0; i < 24; i++) {
            const next = this.downstream(route[route.length - 1][0], route[route.length - 1][1]);
            if (!next.length) break;
            route.push(next[Math.floor(this.rand() * next.length)]);
        }
        const leaf = { route, t: 0, spin: this.rand() * TAU };
        this.leaves.push(leaf);
        route.forEach(([lc, lr], i) =>
            this.later(i * DRIFT, () =>
                audio.note('tink', clamp(6 + i, 6, 13), 60, {
                    gain: 0.3,
                    pan: this.pan(this.center(lc, lr).x),
                })
            )
        );
        const [ec, er] = route[route.length - 1];
        this.later((route.length - 0.5) * DRIFT, () => {
            if (!this.is(ec, er, 'stream')) return;
            const end = this.center(ec, er);
            this.ripple(end.x, end.y);
            audio.play('slosh', {}, { gain: 0.35, pan: this.pan(end.x) });
            this.water(ec, er, 0);
        });
    }

    // Leaves on their way down a stream: where each is, on the screen, and which way it turns.
    stepLeaves(dt) {
        this.leaves = this.leaves.filter((leaf) => {
            leaf.t += dt;
            return leaf.t < (leaf.route.length - 0.3) * DRIFT + 0.6;
        });
    }

    leafAt(leaf) {
        const k = leaf.t / DRIFT;
        const i = Math.min(Math.floor(k), leaf.route.length - 1);
        const a = leaf.route[i];
        const b = leaf.route[Math.min(i + 1, leaf.route.length - 1)];
        const f = i + 1 < leaf.route.length ? k - i : 0;
        const p = this.iso(lerp(a[0], b[0], f) + 0.5, lerp(a[1], b[1], f) + 0.5);
        const fade = clamp(((leaf.route.length - 0.3) * DRIFT + 0.6 - leaf.t) / 0.5, 0, 1);
        return { x: p.x, y: p.y, turn: leaf.spin + leaf.t * 1.4, fade };
    }

    // The beds of the streams, in the plan: a channel along each, into the pond it runs from.
    drawStreamBeds(ctx, width, colour) {
        const s = this.cell;
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        for (const [c, r] of this.every('stream')) {
            const x = (c + 0.5) * s;
            const y = (r + 0.5) * s;
            disc(ctx, x, y, width / 2, colour);
            ctx.beginPath();
            for (const [dc, dr] of SIDES) {
                const n = this.at(c + dc, r + dr);
                if (!n) continue;
                // Each join drawn once; into a pond, as far as its middle, where the pond covers it.
                if (n.kind === 'stream' && (dc > 0 || dr > 0)) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + dc * s, y + dr * s);
                } else if (n.kind === 'pond') {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + dc * s * 0.75, y + dr * s * 0.75);
                }
            }
            ctx.stroke();
        }
    }

    // The water in the streams, in the plan: in from the side it comes by, out to the tiles it runs
    // on to, as far as it has got, with ripples running downstream.
    drawStreams(ctx) {
        const s = this.cell;
        const runs = [];
        for (const [c, r] of this.every('stream')) {
            const p = this.at(c, r);
            if (p.wet <= 0 || !p.from) continue;
            const x = (c + 0.5) * s;
            const y = (r + 0.5) * s;
            const inFrom = [x + p.from[0] * s * 0.5, y + p.from[1] * s * 0.5];
            const k = clamp(p.wet * 2, 0, 1);
            runs.push([inFrom, [lerp(inFrom[0], x, k), lerp(inFrom[1], y, k)], p.wet >= 1]);
            if (p.wet > 0.5) {
                const out = clamp((p.wet - 0.5) * 2, 0, 1);
                for (const [dc, dr] of SIDES) {
                    if (dc === p.from[0] && dr === p.from[1]) continue;
                    const n = this.at(c + dc, r + dr);
                    if (!n || (n.kind !== 'stream' && n.kind !== 'pond')) continue;
                    runs.push([[x, y], [x + dc * s * 0.5 * out, y + dr * s * 0.5 * out], p.wet >= 1]);
                }
            }
        }
        if (!runs.length) return;
        ctx.save();
        this.planView(ctx);
        ctx.lineCap = 'round';
        ctx.strokeStyle = FARM.water;
        ctx.lineWidth = s * 0.2;
        ctx.beginPath();
        for (const [a, b] of runs) {
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(b[0], b[1]);
        }
        ctx.stroke();
        // Ripples, carried along.
        ctx.strokeStyle = FARM.waterLight;
        ctx.lineWidth = s * 0.035;
        ctx.beginPath();
        const gap = s * 0.25;
        const shift = (this.time * s * 0.45) % gap;
        for (const [a, b, full] of runs) {
            if (!full) continue;
            const len = dist(a[0], a[1], b[0], b[1]);
            if (len < 1) continue;
            const ux = (b[0] - a[0]) / len;
            const uy = (b[1] - a[1]) / len;
            for (let d = shift; d < len - s * 0.04; d += gap) {
                const px = a[0] + ux * d;
                const py = a[1] + uy * d;
                ctx.moveTo(px - uy * s * 0.04, py + ux * s * 0.04);
                ctx.lineTo(px + ux * s * 0.05, py + uy * s * 0.05);
            }
        }
        ctx.stroke();
        ctx.restore();
        for (const leaf of this.leaves) {
            const at = this.leafAt(leaf);
            ctx.save();
            ctx.globalAlpha = at.fade;
            ctx.translate(at.x, at.y - s * 0.01);
            ctx.rotate(at.turn);
            ellipse(ctx, 0, 0, s * 0.07, s * 0.035, 0);
            ctx.fillStyle = FARM.leaf;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-s * 0.06, 0);
            ctx.lineTo(s * 0.06, 0);
            ctx.lineWidth = Math.max(1, s * 0.008);
            ctx.strokeStyle = FARM.leafDeep;
            ctx.stroke();
            ctx.restore();
        }
    }

    // A pond of three tiles or more has a duck and her ducklings, who arrive with a quack when it
    // first grows that big, and leave if it shrinks.
    updateDucks(quiet, dt = 0) {
        if (!dt) {
            const bodies = [];
            const seen = new Set();
            for (let r = 0; r < this.rows; r++) {
                for (let c = 0; c < this.cols; c++) {
                    if (!this.is(c, r, 'pond') || seen.has(key(c, r))) continue;
                    const cells = this.component(c, r, 'pond');
                    for (const [cc, rr] of cells) seen.add(key(cc, rr));
                    if (cells.length >= 3) bodies.push(cells);
                }
            }
            const keep = [];
            for (const cells of bodies) {
                const ids = new Set(cells.map(([c, r]) => key(c, r)));
                let family = this.ducks.find(
                    (f) => f.cells.some(([c, r]) => ids.has(key(c, r))) && keep.indexOf(f) < 0
                );
                if (family) {
                    family.cells = cells;
                } else {
                    family = this.newDucks(cells, quiet);
                }
                keep.push(family);
            }
            this.ducks = keep;
            return;
        }
        const s = this.cell;
        for (const f of this.ducks) {
            const lead = f.birds[0];
            f.wait -= dt;
            if (!f.goal || f.wait > 0) {
                if (f.wait <= 0 && !f.goal) {
                    const [c, r] = f.cells[Math.floor(this.rand() * f.cells.length)];
                    f.goal = this.spot(c, r, 0.3 + this.rand() * 0.4, 0.3 + this.rand() * 0.4);
                }
            }
            if (f.goal) {
                const d = dist(lead.x, lead.y, f.goal.x, f.goal.y);
                const speed = s * 0.35;
                if (d < 2) {
                    f.goal = null;
                    f.wait = 1 + this.rand() * 3;
                } else {
                    const step = Math.min(d, speed * dt);
                    const dx = (f.goal.x - lead.x) / d;
                    lead.x += dx * step;
                    lead.y += ((f.goal.y - lead.y) / d) * step;
                    if (Math.abs(dx) > 0.2) lead.facing = dx > 0 ? 1 : -1;
                }
            }
            for (let i = 1; i < f.birds.length; i++) {
                const a = f.birds[i - 1];
                const b = f.birds[i];
                const d = dist(a.x, a.y, b.x, b.y);
                const gap = s * 0.14;
                if (d > gap) {
                    b.x += ((a.x - b.x) / d) * (d - gap) * Math.min(1, dt * 4);
                    b.y += ((a.y - b.y) / d) * (d - gap) * Math.min(1, dt * 4);
                    if (Math.abs(a.x - b.x) > 1) b.facing = a.x > b.x ? 1 : -1;
                }
            }
            // A duck that finds itself on dry land, because the pond moved, hops back in.
            for (const b of f.birds) {
                const cell = this.cellAt(b.x, b.y);
                if (!cell || !this.is(cell[0], cell[1], 'pond')) {
                    const [c, r] = f.cells[0];
                    const at = this.center(c, r);
                    b.x = at.x;
                    b.y = at.y;
                }
            }
        }
    }

    newDucks(cells, quiet) {
        const family = {
            cells,
            goal: null,
            wait: 0.5,
            birds: [0, 1, 2].map((i) => ({ x: 0, y: 0, facing: 1, small: i > 0 })),
        };
        this.seatDucks(family);
        const { x, y } = family.birds[0];
        if (!quiet) {
            this.later(0.3, () => {
                audio.play('quack', {}, { gain: 1, pan: this.pan(x) });
                this.ripple(x, y);
            });
            this.later(0.65, () => audio.play('quack', {}, { gain: 0.6, pan: this.pan(x), rate: 1.25 }));
        }
        return family;
    }

    seatDucks(family) {
        if (!this.cell) return;
        const [c, r] = family.cells[0];
        family.goal = null;
        family.birds.forEach((b, i) => {
            const at = this.spot(c, r, 0.62 - i * 0.12, 0.5);
            b.x = at.x;
            b.y = at.y;
        });
    }

    // The frog: on a lily pad within seconds of there being a pond, and off it with a ribbit and a
    // splash when touched.
    updateFrog(dt) {
        if (this.frog) return;
        this.frogClock -= dt;
        if (this.frogClock > 0) return;
        this.frogClock = 3 + this.rand() * 4;
        const ponds = [];
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++) if (this.is(c, r, 'pond')) ponds.push([c, r]);
        if (!ponds.length) return;
        const [c, r] = ponds[Math.floor(this.rand() * ponds.length)];
        this.frog = { c, r, t: 0 };
    }

    //--------------------------------------------------------------------------
    // Paths

    tapPath(c, r, x, y) {
        this.puff(x, y, 0.7);
        audio.play('pat', {}, { gain: 0.8, pan: this.pan(x) });
        if (this.surprise('mouse', 0.6)) this.mouseRun(c, r);
    }

    // A mouse darts out and runs along the path, turning where it turns, and is gone.
    mouseRun(c, r) {
        const route = [[c, r]];
        let prev = null;
        let at = [c, r];
        for (let i = 0; i < 6; i++) {
            const options = this.beside(at[0], at[1], 'path').filter(
                ([nc, nr]) => !prev || nc !== prev[0] || nr !== prev[1]
            );
            if (!options.length) break;
            prev = at;
            at = options[Math.floor(this.rand() * options.length)];
            route.push(at);
        }
        const s = this.cell;
        const points = route.map(([cc, rr]) => this.center(cc, rr));
        const last = points[points.length - 1];
        const prior = points[points.length - 2] || { x: last.x - s, y: last.y };
        points.push({ x: last.x + (last.x - prior.x) * 0.6, y: last.y + (last.y - prior.y) * 0.6 });
        audio.play('squeak', { f: 2600 }, { gain: 0.5, pan: this.pan(points[0].x) });
        const speed = s * 2.6;
        const lengths = [0];
        for (let i = 1; i < points.length; i++)
            lengths.push(lengths[i - 1] + dist(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y));
        const total = lengths[lengths.length - 1];
        this.fx.push({
            t: 0,
            life: total / speed + 0.1,
            kind: 'mouse',
            draw: (ctx, f) => {
                const d = Math.min(total, f.t * speed);
                let i = 1;
                while (i < points.length - 1 && lengths[i] < d) i++;
                const a = points[i - 1];
                const b = points[i];
                const k = (d - lengths[i - 1]) / Math.max(1, lengths[i] - lengths[i - 1]);
                const fade = clamp((total - d) / (s * 0.4), 0, 1);
                ctx.globalAlpha = fade;
                art.mouse(ctx, lerp(a.x, b.x, k), lerp(a.y, b.y, k) + Math.sin(f.t * 40) * s * 0.004, s, {
                    facing: b.x >= a.x ? 1 : -1,
                });
                ctx.globalAlpha = 1;
            },
        });
    }

    //--------------------------------------------------------------------------
    // Trees

    tapTree(c, r, p, quietly = false) {
        const s = this.cell;
        const rect = this.cellRect(c, r);
        p.shake.kick((this.rand() < 0.5 ? -1 : 1) * (quietly ? 1.5 : 3));
        audio.play('rustle', {}, { gain: quietly ? 0.4 : 0.9, pan: this.pan(rect.x) });
        if (quietly) return;
        const n = Math.min(p.apples.length, 1 + Math.floor(this.rand() * 2));
        for (let i = 0; i < n; i++) {
            const spot = p.apples.splice(Math.floor(this.rand() * p.apples.length), 1)[0];
            const [ax, ay] = art.APPLE_SPOTS[spot];
            this.appleFall(
                rect.x + s / 2 + ax * s,
                rect.y + ay * s,
                rect.y + s * (0.84 + this.rand() * 0.06),
                0.12 + i * 0.18,
                7 - i * 2
            );
        }
        // The orchard: trees beside it rustle too, a moment later.
        this.beside(c, r, 'tree', true).forEach(([tc, tr], i) =>
            this.later(0.18 + i * 0.1, () => {
                const t = this.at(tc, tr);
                if (t && t.kind === 'tree') this.tapTree(tc, tr, t, true);
            })
        );
        if (this.night < 0.5 && this.surprise('bird', 0.6)) this.birdBurst(c, r);
    }

    appleFall(x, y0, ground, delay, degree) {
        const s = this.cell;
        let y = y0;
        let vy = 0;
        let vx = (this.rand() - 0.5) * s * 0.6;
        let x0 = x;
        let landed = 0;
        this.fx.push({
            t: -delay,
            life: 2.8,
            update: (dt, f) => {
                if (f.t < 0) return true;
                if (landed < 2) {
                    vy += s * 9 * dt;
                    y += vy * dt;
                    if (y > ground) {
                        y = ground;
                        vy = -vy * 0.35;
                        landed++;
                        if (landed === 1) audio.note('marimba', degree, 60, { gain: 0.5, pan: this.pan(x0) });
                    }
                } else {
                    vx *= Math.exp(-dt * 3);
                }
                x0 += vx * dt * (landed ? 1 : 0.3);
                return true;
            },
            draw: (ctx, f) => {
                if (f.t < 0) return;
                ctx.globalAlpha = clamp((f.life - f.t) / 0.5, 0, 1);
                disc(ctx, x0, y, s * 0.036, FARM.apple);
                disc(ctx, x0 - s * 0.01, y - s * 0.012, s * 0.011, 'rgba(255,255,255,0.5)');
                ctx.globalAlpha = 1;
            },
        });
    }

    birdBurst(c, r) {
        const s = this.cell;
        const rect = this.cellRect(c, r);
        const from = { x: rect.x + s / 2, y: rect.y + s * 0.3 };
        const trees = [];
        for (let rr = 0; rr < this.rows; rr++)
            for (let cc = 0; cc < this.cols; cc++)
                if ((cc !== c || rr !== r) && this.is(cc, rr, 'tree')) trees.push([cc, rr]);
        let to;
        if (trees.length) {
            const [tc, tr] = trees[Math.floor(this.rand() * trees.length)];
            const tRect = this.cellRect(tc, tr);
            to = { x: tRect.x + s / 2, y: tRect.y + s * 0.1 };
        } else {
            to = { x: from.x + (this.rand() < 0.5 ? -1 : 1) * this.w, y: -s };
        }
        audio.play('chirp', {}, { gain: 0.8, pan: this.pan(from.x) });
        this.flight(from, to, trees.length ? 3 : 0, 'bird');
    }

    // A bird flies from one place to another along an arc, perches for `stay` seconds, and if it
    // perched, flies off the board.
    flight(from, to, stay, kind) {
        const s = this.cell;
        const time = clamp(dist(from.x, from.y, to.x, to.y) / (s * 3), 0.5, 1.6);
        const away = { x: to.x + (to.x > this.w / 2 ? 1 : -1) * this.w * 0.7, y: -s * 2 };
        this.fx.push({
            t: 0,
            life: time + stay + (stay ? 1.4 : 0),
            kind,
            top: true,
            draw: (ctx, f) => {
                let x;
                let y;
                let flap = f.t * 30;
                let facing = to.x >= from.x ? 1 : -1;
                if (f.t < time) {
                    const k = f.t / time;
                    x = lerp(from.x, to.x, k);
                    y = lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * s * 0.4;
                } else if (f.t < time + stay) {
                    x = to.x;
                    y = to.y + Math.sin(f.t * 3) * s * 0.004;
                    flap = Math.PI / 2;
                } else {
                    const k = (f.t - time - stay) / 1.4;
                    x = lerp(to.x, away.x, k);
                    y = lerp(to.y, away.y, k);
                    facing = away.x >= to.x ? 1 : -1;
                }
                art.bird(ctx, x, y, s, { facing, flap });
            },
        });
    }

    //--------------------------------------------------------------------------
    // The barn: doors that open on the dark and the hay, a cow who looks out, an owl in the loft at
    // night, and at night the animals that stand beside it asleep inside.

    tapBarn(c, r, p, pointer) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const [rx, ry] = art.barnSpots(this.frameOf(c, r)).roof;
        if (p.cat > 0 && dist(pointer.x, pointer.y, rx, ry - s * 0.04) < s * 0.14) {
            p.cat = 0.01;
            this.catJump(rx, ry - s * 0.02);
            return;
        }
        if (p.door.target > 0) return;
        p.door.target = 1;
        audio.play('creak', {}, { gain: 0.8, pan: this.pan(rect.x) });
        const sleepers = this.sleepersIn(c, r);
        if (this.night > 0.5 && sleepers.length) {
            this.later(0.5, () =>
                audio.play('oink', { f: noteHz(-6, 60) }, { gain: 0.25, pan: this.pan(rect.x) })
            );
        } else {
            this.later(0.45, () =>
                audio.play('moo', { f: noteHz(-5, 60) }, { gain: 0.9, pan: this.pan(rect.x) })
            );
        }
        this.later(2.1, () => {
            p.door.target = 0;
            this.later(0.55, () => audio.play('latch', {}, { gain: 0.6, pan: this.pan(rect.x) }));
        });
    }

    sleepersIn(c, r) {
        const out = [];
        for (const [dc, dr] of AROUND) {
            const a = this.at(c + dc, r + dr);
            if (a && a.away === 'barn') out.push(a);
        }
        return out;
    }

    catJump(x, y) {
        const s = this.cell;
        audio.play('meow', {}, { gain: 0.9, pan: this.pan(x) });
        this.fx.push({
            t: 0,
            life: 1.6,
            kind: 'cat',
            top: true,
            draw: (ctx, f) => {
                const k = f.t / f.life;
                const px = x + k * s * 0.8;
                const py =
                    y - Math.sin(Math.min(1, k * 2) * Math.PI) * s * 0.15 + Math.max(0, k - 0.5) * s * 0.9;
                ctx.globalAlpha = clamp((f.life - f.t) / 0.4, 0, 1);
                art.cat(ctx, px, py, s, { stretch: 0.5 });
                ctx.globalAlpha = 1;
            },
        });
    }

    //--------------------------------------------------------------------------
    // The farmhouse: the farmer comes out to wave, and waters any field beside the house.

    tapHouse(c, r, p) {
        const rect = this.cellRect(c, r);
        if (this.night > 0.5) {
            // A lullaby, and the lights go out until morning.
            [7, 6, 5, 6, 7, 7, 7].forEach((d, i) =>
                audio.note('musicBox', d, 60, { gain: 0.7, pan: this.pan(rect.x), delay: i * 0.32 })
            );
            this.later(2.4, () => (p.dark = true));
            return;
        }
        if (p.door.target > 0) return;
        p.door.target = 1;
        audio.play('creak', {}, { gain: 0.5, pan: this.pan(rect.x), rate: 1.2 });
        const spots = art.houseSpots(this.frameOf(c, r));
        this.smoke(spots.chimney[0], spots.chimney[1]);
        const front = this.spot(c, r, 0.5, 0.92);
        const door = { x: front.x, y: front.y };
        const fields = [];
        for (const [fc, fr] of this.beside(c, r, 'field')) {
            if (
                fields.some((f) => this.component(f[0], f[1], 'field').some(([a, b]) => a === fc && b === fr))
            )
                continue;
            fields.push([fc, fr]);
        }
        const stops = fields.map(([fc, fr]) => {
            const at = this.center(fc, fr);
            return { x: at.x, y: at.y, cells: this.component(fc, fr, 'field') };
        });
        this.farmerWalk(door, stops, () => {
            p.door.target = 0;
            this.later(0.5, () => audio.play('latch', {}, { gain: 0.4, pan: this.pan(rect.x) }));
        });
    }

    farmerWalk(door, stops, done) {
        const s = this.cell;
        const points = [door];
        for (const stop of stops) points.push(stop);
        points.push(door);
        const speed = s * 0.9;
        const legs = [];
        let t = 0.6;
        for (let i = 1; i < points.length; i++) {
            const d = dist(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
            legs.push({ from: points[i - 1], to: points[i], start: t, end: t + d / speed });
            t += d / speed + (i < points.length - 1 ? 1.1 : 0);
        }
        const life = stops.length ? t + 0.3 : 2.2;
        audio.play('chirp', { variant: 'peep', f: noteHz(0, 96) }, { gain: 0.25, pan: this.pan(door.x) });
        stops.forEach((stop, i) =>
            this.later(legs[i].end + 0.2, () => {
                for (let k = 0; k < 4; k++)
                    this.sparkleAt(stop.x + (k - 1.5) * s * 0.12, stop.y - s * 0.2, k * 0.08);
                audio.note('drop', 8 + i, 60, { gain: 0.5, pan: this.pan(stop.x) });
                audio.note('drop', 10 + i, 60, { gain: 0.4, pan: this.pan(stop.x), delay: 0.15 });
                this.growField(stop.cells, 0.3, true);
            })
        );
        this.later(life, done);
        this.fx.push({
            t: 0,
            life,
            kind: 'farmer',
            draw: (ctx, f) => {
                let x = door.x;
                let y = door.y;
                let facing = 1;
                let walking = false;
                for (const leg of legs) {
                    if (f.t >= leg.start && f.t <= leg.end) {
                        const k = (f.t - leg.start) / (leg.end - leg.start);
                        x = lerp(leg.from.x, leg.to.x, k);
                        y = lerp(leg.from.y, leg.to.y, k);
                        facing = leg.to.x >= leg.from.x ? 1 : -1;
                        walking = true;
                    } else if (f.t > leg.end) {
                        x = leg.to.x;
                        y = leg.to.y;
                    }
                }
                const fade = clamp(Math.min(f.t / 0.3, (f.life - f.t) / 0.3), 0, 1);
                ctx.globalAlpha = fade;
                art.farmer(ctx, x, y, s, {
                    facing,
                    step: walking ? f.t * 12 : 0,
                    wave: stops.length ? 0 : f.t * 9,
                    can: stops.length > 0,
                });
                ctx.globalAlpha = 1;
            },
        });
    }

    smoke(x, y) {
        const s = this.cell;
        for (let i = 0; i < 4; i++) {
            const drift = (this.rand() - 0.3) * s * 0.2;
            this.fx.push({
                t: -i * 0.25,
                life: 1.8,
                top: true,
                draw: (ctx, f) => {
                    if (f.t < 0) return;
                    const k = f.t / f.life;
                    disc(
                        ctx,
                        x + drift * k,
                        y - k * s * 0.4,
                        s * (0.03 + 0.05 * k),
                        `rgba(250, 246, 240, ${0.75 * (1 - k)})`
                    );
                },
            });
        }
    }

    //--------------------------------------------------------------------------
    // The windmill: tap to spin it, and the fields beside it get a stage of wind and water.

    tapWindmill(c, r, p) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const { hub } = art.windmillSpots(this.frameOf(c, r));
        p.spin = 9;
        audio.play('whoosh', { variant: 'up' }, { gain: 0.9, pan: this.pan(rect.x) });
        audio.play('creak', {}, { gain: 0.4, pan: this.pan(rect.x), delay: 0.2, rate: 0.8 });
        if (p.cooldown <= 0) {
            p.cooldown = 2.5;
            const seen = new Set();
            for (const [fc, fr] of this.beside(c, r, 'field', true)) {
                if (seen.has(key(fc, fr))) continue;
                const cells = this.component(fc, fr, 'field');
                for (const [a, b] of cells) seen.add(key(a, b));
                const to = this.center(fc, fr);
                for (let k = 0; k < 4; k++) this.travel(hub[0], hub[1], to.x, to.y, k * 0.1, '#FFF6D6');
                this.growField(cells, 0.5, true);
            }
        }
        if (p.rider <= 0 && this.night < 0.5 && this.surprise('rider', 0.6)) {
            p.rider = 5;
            this.later(5, () => audio.play('chirp', {}, { gain: 0.6, pan: this.pan(rect.x) }));
            this.later(5, () => this.flight({ x: hub[0], y: hub[1] }, { x: hub[0] + s, y: -s }, 0, 'bird'));
        }
    }

    //--------------------------------------------------------------------------
    // The hen house: the hens come out to peck, at a field if there is one beside them, and leave
    // an egg behind (always the first time), which hatches when it is touched.

    tapCoop(c, r, p) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        if (p.out > 0) return;
        p.out = 1;
        audio.play('cluck', { f: noteHz(4, 60) }, { gain: 1, pan: this.pan(rect.x) });
        audio.play('cluck', { f: noteHz(3, 60) }, { gain: 0.7, pan: this.pan(rect.x), delay: 0.45 });
        const [dx, dy] = art.coopSpots(this.frameOf(c, r)).ramp;
        const door = { x: dx, y: dy };
        const field = this.beside(c, r, 'field')[0];
        const spots = [0, 1].map((i) => {
            if (field) return this.spot(field[0], field[1], 0.35 + i * 0.3, 0.6);
            return i ? this.spot(c, r, 0.94, 0.62) : this.spot(c, r, 0.62, 0.96);
        });
        spots.forEach((spot, i) => {
            this.fx.push({
                t: -i * 0.3,
                life: 5,
                kind: 'hen',
                draw: (ctx, f) => {
                    if (f.t < 0) return;
                    const out = clamp(f.t / 0.8, 0, 1);
                    const back = clamp((f.t - 4) / 0.8, 0, 1);
                    const k = out - back;
                    const x = lerp(door.x, spot.x, k);
                    const y = lerp(door.y, spot.y, k);
                    const pecking = f.t > 0.8 && f.t < 4 ? Math.max(0, Math.sin(f.t * 9 + i)) : 0;
                    art.hen(ctx, x, y, s, {
                        facing: back > 0 ? (door.x > x ? 1 : -1) : spot.x >= door.x ? 1 : -1,
                        peck: pecking,
                    });
                },
            });
        });
        this.later(2.2, () =>
            audio.play('cluck', { f: noteHz(4, 60) }, { gain: 0.5, pan: this.pan(rect.x) })
        );
        this.later(5.2, () => {
            p.out = 0;
            if (!p.egg && this.surprise('egg', 0.7)) p.egg = true;
        });
    }

    hatch(c, r, p) {
        const s = this.cell;
        const spots = art.coopSpots(this.frameOf(c, r));
        const [x, y] = spots.egg;
        p.egg = false;
        audio.play('pop', { f: 700 }, { gain: 0.6, pan: this.pan(x) });
        this.later(0.3, () =>
            audio.play('chirp', { variant: 'peep', f: noteHz(0, 96) }, { gain: 0.8, pan: this.pan(x) })
        );
        this.later(0.8, () =>
            audio.play(
                'chirp',
                { variant: 'peep', f: noteHz(0, 96) },
                { gain: 0.6, pan: this.pan(x), rate: 1.1 }
            )
        );
        const door = { x: spots.ramp[0], y: spots.ramp[1] };
        this.fx.push({
            t: 0,
            life: 3,
            kind: 'chick',
            draw: (ctx, f) => {
                if (f.t < 0.4) {
                    art.egg(ctx, x, y, s, 1);
                    return;
                }
                const k = clamp((f.t - 1.6) / 1.2, 0, 1);
                const hop = Math.abs(Math.sin(f.t * 10)) * s * 0.02;
                ctx.globalAlpha = 1 - clamp((f.t - 2.6) / 0.4, 0, 1);
                art.chick(ctx, lerp(x, door.x, k), lerp(y, door.y, k) - hop, s, { facing: k > 0 ? -1 : 1 });
                ctx.globalAlpha = 1;
            },
        });
    }

    //--------------------------------------------------------------------------
    // Fences: a bird comes to sit on the post, and goes again.

    tapFence(c, r, p) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const [px, py] = art.fenceSpots(this.frameOf(c, r)).post;
        const post = { x: px, y: py };
        audio.note('wood', 7, 60, { gain: 0.5, pan: this.pan(rect.x) });
        if (p.bird > 0) {
            p.bird = 0;
            audio.play('chirp', {}, { gain: 0.8, pan: this.pan(rect.x) });
            this.flight(post, { x: post.x + (this.rand() < 0.5 ? -1 : 1) * this.w * 0.6, y: -s }, 0, 'bird');
        } else {
            const from = { x: post.x + (post.x < this.w / 2 ? -1 : 1) * this.w * 0.5, y: -s };
            this.flight(from, post, 0, 'bird');
            this.later(clamp(dist(from.x, from.y, post.x, post.y) / (s * 3), 0.5, 1.6), () => {
                p.bird = 1;
                audio.play('chirp', {}, { gain: 0.9, pan: this.pan(rect.x) });
            });
        }
    }

    //--------------------------------------------------------------------------
    // Animals: a tap, a call, and the call passed along a herd standing together. At night they
    // sleep, and some of them do something else.

    tapAnimal(c, r, p) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        if (this.night > 0.5) {
            if (p.kind === 'cow') this.moonJump(c, r, p);
            else if (p.kind === 'sheep') this.fenceJump(c, r, p);
            else {
                audio.play('oink', { f: noteHz(-6, 60) }, { gain: 0.5, pan: this.pan(rect.x) });
                p.roll.target = p.roll.target ? 0 : 1;
            }
            return;
        }
        if (p.kind === 'pig' && p.muddy) {
            // A shake, and mud everywhere.
            p.muddy = false;
            p.clean = this.time + 8;
            for (let i = 0; i < 8; i++) this.splat(rect.x + s / 2, rect.y + s * 0.6, i);
        } else if (p.kind === 'pig' && this.surprise('roll', 0.5)) {
            p.roll.target = 1;
            this.later(1.4, () => (p.roll.target = 0));
        }
        const herd = this.component(c, r, p.kind);
        herd.slice(0, 6).forEach(([hc, hr], i) =>
            this.later(i * 0.42, () => {
                const a = this.at(hc, hr);
                if (!a || a.kind !== p.kind || a.away) return;
                if (i > 0) {
                    const [pc] = herd[i - 1];
                    if (pc !== hc) a.facing = pc > hc ? 1 : -1;
                }
                a.act.kick(a.kind === 'sheep' ? 14 : 9);
                const [name, degree] = VOICES[a.kind];
                audio.play(
                    name,
                    { f: noteHz(degree + (i % 4), 60) },
                    { gain: i ? 0.75 : 1, pan: this.pan(this.cellRect(hc, hr).x) }
                );
                a.called = this.time;
            })
        );
    }

    // At night, the cow jumps over the moon.
    moonJump(c, r, p) {
        if (p.away) return;
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const from = { x: rect.x + s / 2, y: rect.y + s * 0.82 };
        const moon = { x: this.sunButton.x - 20, y: this.sunButton.y + 10 };
        p.away = 'moon';
        audio.play('moo', { f: noteHz(-3, 60) }, { gain: 0.9, pan: this.pan(from.x) });
        [5, 7, 9, 10, 12].forEach((d, i) =>
            audio.note('glock', d, 72, { gain: 0.45, delay: 0.25 + i * 0.22, wet: 0.5 })
        );
        const life = 2.6;
        this.fx.push({
            t: 0,
            life,
            kind: 'moonJump',
            top: true,
            draw: (ctx, f) => {
                const k = f.t / life;
                const arcK = Math.sin(k * Math.PI);
                const x = lerp(from.x, from.x + (moon.x - from.x) * 0.0, k) + (moon.x - from.x) * arcK * 0.95;
                const y = from.y - (from.y - moon.y + s * 0.5) * arcK;
                const scale = 1 - arcK * 0.45;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(Math.sin(k * TAU) * 0.3);
                art.cow(ctx, 0, 0, s * scale, { facing: k < 0.5 ? 1 : -1 });
                ctx.restore();
            },
        });
        this.later(life, () => {
            p.away = null;
            p.bounce.kick(10);
            audio.play('thud', { f: 85 }, { gain: 0.6, pan: this.pan(from.x) });
        });
    }

    // At night, a sheep beside a fence jumps it, and the jumps are counted up the scale until it falls
    // asleep. A sheep with no fence just bleats softly in its sleep.
    fenceJump(c, r, p) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const fenceAt = this.beside(c, r, 'fence')[0];
        if (!fenceAt || p.away || p.jumps >= 3) {
            audio.play('baa', { f: noteHz(-2, 60) }, { gain: 0.35, pan: this.pan(rect.x) });
            return;
        }
        const fRect = this.cellRect(fenceAt[0], fenceAt[1]);
        const from = { x: rect.x + s / 2, y: rect.y + s * 0.82 };
        const over = { x: fRect.x + s / 2, y: fRect.y + s * 0.82 };
        p.away = 'jump';
        p.jumps++;
        audio.play('baa', { f: noteHz(-1, 60) }, { gain: 0.6, pan: this.pan(from.x) });
        audio.note('chime', 4 + p.jumps * 2, 60, { gain: 0.6, delay: 0.5, wet: 0.4 });
        const life = 1.3;
        this.fx.push({
            t: 0,
            life,
            kind: 'fenceJump',
            top: true,
            draw: (ctx, f) => {
                const k = f.t / life;
                const there = k < 0.5 ? k * 2 : (1 - k) * 2;
                const x = lerp(from.x, over.x, there);
                const y = lerp(from.y, over.y, there) - Math.sin(there * Math.PI) * s * 0.55;
                art.sheep(ctx, x, y, s, {
                    facing: k < 0.5 ? (over.x >= from.x ? 1 : -1) : over.x >= from.x ? -1 : 1,
                    sleep: false,
                });
            },
        });
        this.later(life, () => {
            p.away = null;
            p.bounce.kick(6);
        });
    }

    splat(x, y, i) {
        const s = this.cell;
        const a = (i / 8) * TAU + this.rand() * 0.5;
        const reach = s * (0.25 + this.rand() * 0.2);
        if (i === 0) audio.play('gulp', { f: 220 }, { gain: 0.8, pan: this.pan(x) });
        this.fx.push({
            t: 0,
            life: 0.9,
            draw: (ctx, f) => {
                const k = clamp(f.t / 0.35, 0, 1);
                const px = x + Math.cos(a) * reach * k;
                const py = y + Math.sin(a) * reach * 0.6 * k - Math.sin(k * Math.PI) * s * 0.15;
                ctx.globalAlpha = clamp((f.life - f.t) / 0.4, 0, 1);
                disc(ctx, px, py, s * 0.025, FARM.mud);
                ctx.globalAlpha = 1;
            },
        });
    }

    //--------------------------------------------------------------------------
    // The tractor: a toot, and then the whole length of the path it stands beside, harvesting any
    // ripe field along the way, and home again to tip out the trailer.

    tapTractor(c, r, p) {
        if (p.trip) return;
        const rect = this.cellRect(c, r);
        const s = this.cell;
        audio.play('toot', { f: noteHz(3, 60) }, { gain: 1, pan: this.pan(rect.x) });
        audio.play('toot', { f: noteHz(5, 60) }, { gain: 0.9, pan: this.pan(rect.x), delay: 0.22 });
        this.puff(rect.x + s * 0.62, rect.y + s * 0.42, 0.6);
        const start = this.beside(c, r, 'path')[0];
        if (!start) {
            p.act.kick(10);
            for (let i = 0; i < 6; i++)
                audio.play('putt', {}, { gain: 0.8, pan: this.pan(rect.x), delay: 0.45 + i * 0.15 });
            return;
        }
        const route = this.tour(start);
        const points = [[c, r]].concat(route, [[c, r]]);
        p.trip = {
            points,
            d: 0,
            load: 0,
            beat: 0,
            dog: this.surprise('dog', 0.6),
            visited: new Set(),
            last: -1,
        };
        p.away = 'trip';
        if (p.trip.dog) audio.play('woof', {}, { gain: 0.8, pan: this.pan(rect.x), delay: 0.3 });
    }

    drive(p, c, r, dt) {
        const trip = p.trip;
        const s = this.cell;
        const speed = 2.1;
        trip.d += dt * speed;
        trip.beat -= dt;
        if (trip.beat <= 0) {
            trip.beat = 0.16;
            audio.play('putt', {}, { gain: 0.9, pan: this.pan(this.toScreen(trip.x || 0, trip.y || 0).x) });
        }
        const i = Math.floor(trip.d);
        if (i >= trip.points.length - 1) {
            p.trip = null;
            p.away = null;
            p.bounce.kick(8);
            audio.play('toot', { f: noteHz(5, 60) }, { gain: 0.8, pan: this.pan(this.center(c, r).x) });
            if (trip.load > 0) this.unload(c, r, trip.load);
            return;
        }
        const k = trip.d - i;
        const [ac, ar] = trip.points[i];
        const [bc, br] = trip.points[i + 1];
        trip.x = (lerp(ac, bc, k) + 0.5) * s;
        trip.y = (lerp(ar, br, k) + 0.5) * s;
        // Down the column it goes right across the screen, down the row left.
        const across = bc - ac - (br - ar);
        if (across) p.facing = across > 0 ? 1 : -1;
        // Arriving on a tile: harvest what is ripe beside it.
        if (i !== trip.last) {
            trip.last = i;
            for (const [fc, fr] of this.beside(ac, ar, 'field')) {
                const f = this.at(fc, fr);
                if (f.stage < 4) continue;
                const cells = this.component(fc, fr, 'field');
                trip.load += cells.length * 2;
                this.harvest(cells, p);
            }
            for (const [bcc, brr] of this.beside(ac, ar, 'barn')) {
                if (trip.visited.has(key(bcc, brr))) continue;
                trip.visited.add(key(bcc, brr));
                audio.play(
                    'toot',
                    { f: noteHz(3, 60) },
                    { gain: 0.7, pan: this.pan(this.toScreen(trip.x, trip.y).x) }
                );
            }
        }
    }

    unload(c, r, load) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        for (let i = 0; i < Math.min(8, load); i++) {
            this.later(0.2 + i * 0.08, () => {
                audio.play('pop', { f: 450 + i * 40 }, { gain: 0.5, pan: this.pan(rect.x) });
                this.flyCrop(CROPS[i % CROPS.length], rect.x + s * 0.15, rect.y + s * 0.6, null, 0);
            });
        }
    }

    // A crop leaping out of the ground: to the tractor, if one is collecting, else up and gone.
    flyCrop(crop, x, y, tractor, delay) {
        const s = this.cell;
        this.fx.push({
            t: -delay,
            life: 0.8,
            top: true,
            draw: (ctx, f) => {
                if (f.t < 0) return;
                const k = f.t / f.life;
                let tx = x + (x > this.w / 2 ? 0.3 : -0.3) * s;
                let ty = y - s * 0.9;
                if (tractor && tractor.trip) {
                    const at = this.toScreen(tractor.trip.x, tractor.trip.y);
                    tx = at.x - tractor.facing * s * 0.4;
                    ty = at.y - s * 0.12;
                }
                const px = lerp(x, tx, k);
                const py = lerp(y, ty, k) - Math.sin(k * Math.PI) * s * 0.5;
                ctx.globalAlpha = tractor ? 1 : 1 - k;
                ctx.save();
                ctx.translate(px, py);
                ctx.scale(1.3, 1.3);
                this.drawCropIcon(ctx, crop, s);
                ctx.restore();
                ctx.globalAlpha = 1;
            },
        });
    }

    drawCropIcon(ctx, crop, s) {
        if (crop === 'pumpkin') art.pumpkin(ctx, 0, 0, s * 0.05);
        else if (crop === 'carrot') {
            ellipse(ctx, 0, s * 0.02, s * 0.018, s * 0.05);
            ctx.fillStyle = '#EFA36B';
            ctx.fill();
            ellipse(ctx, 0, -s * 0.04, s * 0.012, s * 0.03);
            ctx.fillStyle = FARM.leafDeep;
            ctx.fill();
        } else if (crop === 'sunflower') {
            for (let k = 0; k < 8; k++) {
                const a = (k / 8) * TAU;
                disc(ctx, Math.cos(a) * s * 0.03, Math.sin(a) * s * 0.03, s * 0.016, '#F3D36A');
            }
            disc(ctx, 0, 0, s * 0.02, '#A9805E');
        } else {
            disc(ctx, 0, 0, s * 0.045, '#A3CC92');
            disc(ctx, 0, -s * 0.004, s * 0.03, '#B9D9A8');
        }
    }

    rollPumpkin(x, y) {
        const s = this.cell;
        const dir = x < this.w / 2 ? -1 : 1;
        audio.play('thud', { f: 85 }, { gain: 1, pan: this.pan(x) });
        this.later(0.35, () => audio.play('thud', { f: 110 }, { gain: 0.6, pan: this.pan(x) }));
        this.fx.push({
            t: 0,
            life: 2.2,
            kind: 'giant',
            top: true,
            draw: (ctx, f) => {
                const k = f.t / f.life;
                const px = x + dir * k * this.w * 0.6;
                const py = y - Math.abs(Math.sin(k * 9)) * s * 0.1 * (1 - k);
                ctx.save();
                ctx.translate(px, py);
                ctx.rotate(dir * k * 8);
                art.pumpkin(ctx, 0, 0, s * 0.24);
                ctx.restore();
            },
        });
    }

    rabbit(c, r) {
        const s = this.cell;
        const { x, y } = this.center(c, r);
        const dir = x < this.w / 2 ? -1 : 1;
        audio.play('pop', { f: 650 }, { gain: 0.6, pan: this.pan(x) });
        this.fx.push({
            t: 0,
            life: 3.2,
            kind: 'rabbit',
            top: true,
            draw: (ctx, f) => {
                if (f.t < 0.9) {
                    const up = clamp(f.t / 0.25, 0, 1);
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(x - s * 0.2, y - s * 0.4, s * 0.4, s * 0.4);
                    ctx.clip();
                    art.rabbit(ctx, x, y + (1 - up) * s * 0.15, s, { facing: dir });
                    ctx.restore();
                    return;
                }
                const k = (f.t - 0.9) / (f.life - 0.9);
                const hop = Math.abs(Math.sin(k * 18)) * s * 0.08;
                ctx.globalAlpha = clamp((f.life - f.t) / 0.5, 0, 1);
                art.rabbit(ctx, x + dir * k * this.w * 0.55, y - hop, s, { facing: dir });
                ctx.globalAlpha = 1;
            },
        });
    }

    butterfly(x, y) {
        const s = this.cell;
        const dir = this.rand() < 0.5 ? -1 : 1;
        this.fx.push({
            t: 0,
            life: 4,
            kind: 'butterfly',
            top: true,
            draw: (ctx, f) => {
                const k = f.t / f.life;
                const px = x + dir * k * s * 3 + Math.sin(f.t * 3) * s * 0.2;
                const py = y - k * s * 2 + Math.sin(f.t * 5) * s * 0.1;
                ctx.globalAlpha = clamp((f.life - f.t) / 0.6, 0, 1);
                art.butterfly(ctx, px, py, s, f.t * 18);
                ctx.globalAlpha = 1;
            },
        });
    }

    //--------------------------------------------------------------------------
    // Things to touch that are not pieces: the frog, an egg, a perched bird, the owl, a cat.

    targetAt(x, y) {
        const s = this.cell;
        const near = (tx, ty, r) => dist(x, y, tx, ty) < r;
        if (this.frog) {
            const p = this.padOf(this.frog.c, this.frog.r);
            const pad = this.toScreen(p.x, p.y);
            if (near(pad.x, pad.y - s * 0.05, s * 0.14)) return { tap: () => this.frogLeap() };
        }
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.at(c, r);
                if (!p) continue;
                const rect = this.cellRect(c, r);
                const f = this.frameOf(c, r);
                if (p.kind === 'coop' && p.egg) {
                    const [ex, ey] = art.coopSpots(f).egg;
                    if (near(ex, ey - s * 0.03, s * 0.12)) return { tap: () => this.hatch(c, r, p) };
                }
                if (p.kind === 'barn' && this.night > 0.5) {
                    const [hx, hy] = art.barnSpots(f).hayloft;
                    if (near(hx, hy - s * 0.03, s * 0.12)) return { tap: () => this.owlHoot(c, r, p) };
                }
                const sill = p.kind === 'house' && art.houseSpots(f).windowFoot(0);
                if (
                    p.kind === 'house' &&
                    p.cat > 0 &&
                    this.night < 0.5 &&
                    near(sill[0], sill[1] - s * 0.05, s * 0.1)
                ) {
                    return {
                        tap: () => {
                            audio.play('meow', { f: noteHz(6, 60) }, { gain: 0.8, pan: this.pan(rect.x) });
                            p.cat = 0.6;
                        },
                    };
                }
                if (p.kind === 'fence' && p.snail > 0 && near(...this.snailAt(f, p), s * 0.1)) {
                    return {
                        tap: () => {
                            p.snail = 25;
                            audio.play('gulp', { f: noteHz(10, 48) }, { gain: 0.4, pan: this.pan(rect.x) });
                        },
                    };
                }
            }
        }
        return null;
    }

    // The snail creeps along the fence's lower rail.
    snailAt(f, p) {
        return art.fenceSpots(f).rail(Math.min(1, p.snail * 0.04));
    }

    frogLeap() {
        const f = this.frog;
        if (!f) return;
        this.frog = null;
        this.frogClock = 3 + this.rand() * 4;
        const s = this.cell;
        const plan = this.padOf(f.c, f.r);
        const pad = this.toScreen(plan.x, plan.y);
        const to = { x: pad.x + (this.rand() < 0.5 ? -1 : 1) * s * 0.35, y: pad.y + s * 0.05 };
        audio.play('ribbit', {}, { gain: 1, pan: this.pan(pad.x) });
        this.later(0.45, () => {
            audio.note('drop', 4, 60, { gain: 0.8, pan: this.pan(to.x), wet: 0.3 });
            this.ripple(to.x, to.y);
        });
        this.fx.push({
            t: 0,
            life: 0.45,
            kind: 'frog',
            water: true,
            draw: (ctx, fx) => {
                const k = fx.t / fx.life;
                art.frog(
                    ctx,
                    lerp(pad.x, to.x, k),
                    lerp(pad.y, to.y, k) - Math.sin(k * Math.PI) * s * 0.25,
                    s,
                    {}
                );
            },
        });
    }

    owlHoot(c, r, p) {
        const rect = this.cellRect(c, r);
        audio.play('hoot', {}, { gain: 1, pan: this.pan(rect.x), wet: 0.5 });
        p.blink = this.time + 0.3;
    }

    //--------------------------------------------------------------------------
    // Day and night

    dusk() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.at(c, r);
                if (!p || ANIMALS.indexOf(p.kind) < 0 || p.away) continue;
                p.jumps = 0;
                const barn = this.beside(c, r, 'barn', true)[0];
                if (barn) this.toBarn(c, r, p, barn, false);
            }
        }
    }

    // In the morning: a rooster on the hen house, if there is one, and everyone out of the barn.
    dawn() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.at(c, r);
                if (!p) continue;
                if (p.kind === 'house') p.dark = false;
                if (p.away === 'barn') {
                    const barn = this.beside(c, r, 'barn', true)[0];
                    if (barn) this.toBarn(c, r, p, barn, true);
                    else p.away = null;
                }
            }
        }
        let coop = null;
        for (let r = 0; r < this.rows && !coop; r++)
            for (let c = 0; c < this.cols && !coop; c++) if (this.is(c, r, 'coop')) coop = [c, r];
        if (coop) {
            const rect = this.cellRect(coop[0], coop[1]);
            const [roofX, roofY] = art.coopSpots(this.frameOf(coop[0], coop[1])).roof;
            const s = this.cell;
            this.later(0.5, () => audio.play('crow', {}, { gain: 1, pan: this.pan(rect.x), wet: 0.4 }));
            this.fx.push({
                t: 0,
                life: 2.6,
                kind: 'rooster',
                top: true,
                draw: (ctx, f) => {
                    const up = clamp(f.t / 0.3, 0, 1) - clamp((f.t - 2.2) / 0.4, 0, 1);
                    ctx.globalAlpha = up;
                    art.hen(ctx, roofX, roofY, s, {
                        rooster: true,
                        peck: f.t > 0.5 && f.t < 1.6 ? -0.6 : 0,
                    });
                    ctx.globalAlpha = 1;
                },
            });
        }
    }

    // An animal walking into the barn for the night, or out of it in the morning.
    toBarn(c, r, p, barn, out) {
        const s = this.cell;
        const a = this.center(c, r);
        const [bx, by] = art.barnSpots(this.frameOf(barn[0], barn[1])).door;
        const b = { x: bx, y: by };
        p.away = 'walking';
        const life = 1.4;
        this.fx.push({
            t: 0,
            life,
            kind: 'barnWalk',
            draw: (ctx, f) => {
                const k = out ? 1 - f.t / life : f.t / life;
                const scale = 1 - 0.5 * k;
                ctx.globalAlpha = 1 - clamp((k - 0.75) / 0.25, 0, 1);
                this.drawAnimal(ctx, p, lerp(a.x, b.x, k), lerp(a.y, b.y, k), s * scale, {
                    facing: (b.x - a.x) * (out ? -1 : 1) >= 0 ? 1 : -1,
                });
                ctx.globalAlpha = 1;
            },
        });
        this.later(life, () => {
            p.away = out ? null : 'barn';
            if (out) p.bounce.kick(6);
        });
    }

    //--------------------------------------------------------------------------
    // Drawing

    // The water's life, under everything standing.
    drawBelow(ctx) {
        const s = this.cell;
        this.drawStreams(ctx);
        for (const f of this.fx) if (f.water) f.draw(ctx, f);
        if (this.frog) {
            const plan = this.padOf(this.frog.c, this.frog.r);
            const pad = this.toScreen(plan.x, plan.y);
            art.frog(ctx, pad.x, pad.y + s * 0.02, s, {});
        }
        for (const family of this.ducks) {
            for (let i = family.birds.length - 1; i >= 0; i--) {
                const b = family.birds[i];
                art.duck(ctx, b.x, b.y + Math.sin(this.time * 2 + i) * s * 0.004, s, {
                    facing: b.facing,
                    small: b.small,
                });
            }
        }
    }

    // Crops stand up out of their field, among everything else that stands. Where they grow in a
    // tile is the same for every tile, so a field tile's crops are drawn once into a sprite.
    drawUpright(ctx, c, r) {
        const p = this.cells[r][c];
        if (!p || p.kind !== 'field' || p.stage <= 0) return;
        const s = this.cell;
        const rect = this.cellRect(c, r);
        const planting = (p.seed + c * 5 + r * 3) % 4;
        const id = `crops:${p.stage}:${p.crop}:${p.giant ? 'giant' : planting}`;
        const lift = clamp(p.pop.value, -20, 20) * s * 0.0015;
        this.blit(ctx, id, rect.x, rect.y - lift, s, (g, ss) => {
            const f = this.spriteFrame();
            art.isoCrops(
                g,
                (fx, fy) => iso.pt(f, fx - 0.5, fy - 0.5),
                ss,
                p.stage,
                p.crop,
                planting,
                0,
                p.giant
            );
        });
    }

    // The tractor out on its rounds, among the pieces it passes.
    movers() {
        const out = [];
        const s = this.cell;
        for (const row of this.cells) {
            for (const p of row) {
                if (!p || p.kind !== 'tractor' || !p.trip || p.trip.x === undefined) continue;
                const u = p.trip.x / s;
                const v = p.trip.y / s;
                out.push({
                    u,
                    v,
                    draw: (ctx) => {
                        const { x, y } = this.iso(u, v);
                        if (p.trip.dog) {
                            const back = p.facing * s * 0.62;
                            art.dog(ctx, x - back, y, s, { facing: p.facing, run: this.time * 14 });
                        }
                        art.tractor(ctx, x, y, s * 0.85, {
                            facing: p.facing,
                            bounce: Math.sin(this.time * 30),
                            wheel: this.time * 8 * p.facing,
                            load: p.trip.load,
                        });
                    },
                });
            }
        }
        return out;
    }

    // Whether a piece's sprites are all of it: not the windmill, whose sails turn on their own, nor
    // anything with a cat, a bird or a snail on it.
    solid(p) {
        if (p.kind === 'windmill') return false;
        if (p.kind === 'barn' || p.kind === 'house') return !(p.cat > 0);
        if (p.kind === 'fence') return !(p.bird > 0 || p.snail > 0);
        return true;
    }

    // The pieces that stand tall enough to hide what is behind them.
    tall(p) {
        return TALL.indexOf(p.kind) >= 0;
    }

    // An animal's silhouette is the same however it moves; the tractor's, as it sets off.
    pose(p) {
        return p.trip ? 'out' : '';
    }

    // How far down its frame each piece's drawing begins, for touching it.
    reach(p) {
        const top = REACH[p.kind];
        return top === undefined ? 0.4 : top;
    }

    drawPiece(ctx, p, c, r, x, y, s) {
        const b = p.bounce.value * 0.01;
        ctx.save();
        ctx.translate(x + s / 2, y + s * FOOT);
        ctx.scale(1 + b, 1 - b * 1.2);
        ctx.translate(-(x + s / 2), -(y + s * FOOT));
        const kind = p.kind;
        const still = (spring) => Math.abs(spring.value) < 0.004 && Math.abs(spring.velocity) < 0.01;
        const f = this.frameOf(c, r);
        if (kind === 'tree') {
            if (still(p.shake)) {
                const apples = p.apples.slice().sort();
                this.blit(ctx, `tree:${apples.join('')}`, x, y, s, (g, ss) =>
                    art.tree(g, 0, 0, ss, { apples: apples.map((i) => art.APPLE_SPOTS[i]) })
                );
            } else {
                art.tree(ctx, x, y, s, {
                    shake: p.shake.value * 0.05,
                    apples: p.apples.map((i) => art.APPLE_SPOTS[i]),
                });
            }
        } else if (kind === 'barn') {
            if (p.door.value < 0.005 && p.door.target === 0)
                this.blit(ctx, 'barn', x, y, s, (g) => art.isoBarn(g, this.spriteFrame(), {}));
            else {
                art.isoBarn(ctx, f, {
                    door: clamp(p.door.value, 0, 1),
                    inside: (inner, dx, dy) => this.barnInside(inner, c, r, dx, dy, s),
                });
            }
            if (p.cat > 0 && this.night < 0.5) {
                const [rx, ry] = art.barnSpots(f).roof;
                art.cat(ctx, rx, ry, s * 0.85, { sleep: true });
            }
        } else if (kind === 'house') {
            if (p.door.value < 0.005 && p.door.target === 0)
                this.blit(ctx, 'house', x, y, s, (g) => art.isoHouse(g, this.spriteFrame(), {}));
            else art.isoHouse(ctx, f, { door: clamp(p.door.value, 0, 1) });
            if (p.cat > 0 && this.night < 0.5) {
                const spots = art.houseSpots(f);
                const [wx, wy] = spots.windowFoot(0);
                ctx.save();
                spots.window(ctx, 0);
                ctx.clip();
                art.cat(ctx, wx, wy + s * 0.012, s * 0.62, {});
                ctx.restore();
            }
        } else if (kind === 'windmill') {
            this.blit(ctx, 'windmill', x, y, s, (g) =>
                art.isoWindmill(g, this.spriteFrame(), { sails: false })
            );
            art.isoSails(ctx, f, p.angle);
            if (p.rider > 0) {
                const { hub, sail } = art.windmillSpots(f);
                const a = p.angle - Math.PI / 2;
                art.bird(
                    ctx,
                    hub[0] + Math.cos(a) * sail * 0.85,
                    hub[1] + Math.sin(a) * sail * 0.85,
                    s * 0.8,
                    {
                        flap: Math.PI / 2,
                    }
                );
            }
        } else if (kind === 'coop') {
            this.blit(ctx, 'coop', x, y, s, (g) => art.isoCoop(g, this.spriteFrame(), {}));
            if (p.egg) {
                const [ex, ey] = art.coopSpots(f).egg;
                art.egg(ctx, ex, ey, s);
            }
        } else if (kind === 'fence') {
            const m = this.mask(c, r);
            this.blit(ctx, `fence:${m}`, x, y, s, (g) => art.isoFence(g, this.spriteFrame(), m));
            const spots = art.fenceSpots(f);
            if (p.bird > 0)
                art.bird(ctx, spots.post[0], spots.post[1] - s * 0.02, s, { facing: 1, flap: Math.PI / 2 });
            if (p.snail > 0) {
                const [sx, sy] = this.snailAt(f, p);
                art.snail(ctx, sx, sy, s, p.snail > 25 ? 1 : 0);
            }
        } else if (kind === 'tractor') {
            if (still(p.act)) {
                this.blit(ctx, `tractor:${p.facing}`, x, y, s, (g, ss) =>
                    art.tractor(g, ss * 0.6, ss * FOOT, ss * 0.85, { facing: p.facing })
                );
            } else {
                const hop = Math.abs(Math.sin(p.act.value)) * s * 0.02;
                art.tractor(ctx, x + s * 0.6, y + s * FOOT - hop, s * 0.85, {
                    facing: p.facing,
                    bounce: p.act.value * 0.3,
                });
            }
        } else if (ANIMALS.indexOf(kind) >= 0) {
            this.drawAnimal(ctx, p, x + s / 2, y + s * FOOT, s, {});
        }
        ctx.restore();
    }

    drawAnimal(ctx, p, x, y, s, extra) {
        const asleep = this.night > 0.6;
        const o = Object.assign(
            {
                facing: p.facing,
                bob: Math.sin(this.time * 2 + p.seed) * (asleep ? 0.3 : 1),
                sleep: asleep,
            },
            extra
        );
        const act = p.act.value;
        if (p.kind === 'cow') {
            art.cow(
                ctx,
                x,
                y,
                s,
                Object.assign(o, {
                    tail: this.time * 1.6 + p.seed + act * 0.2,
                    dip: p.dip.value - act * 0.02,
                })
            );
        } else if (p.kind === 'sheep') {
            art.sheep(ctx, x, y, s, Object.assign(o, { hop: Math.max(0, act * 0.06) }));
        } else {
            art.pig(
                ctx,
                x,
                y,
                s,
                Object.assign(o, { muddy: p.muddy, wiggle: act * 0.6, roll: clamp(p.roll.value, 0, 1) })
            );
        }
    }

    // What the open barn door shows: by day a cow looking out, by night the sleepers in the hay. The
    // barn has already clipped the drawing to its doorway, whose foot is (cx, by).
    barnInside(ctx, c, r, cx, by, s) {
        const sleepers = this.sleepersIn(c, r);
        if (this.night > 0.5 && sleepers.length) {
            sleepers.slice(0, 2).forEach((a, i) =>
                this.drawAnimal(ctx, a, cx + (i - 0.5) * s * 0.1, by, s * 0.42, {
                    sleep: true,
                    facing: i ? -1 : 1,
                })
            );
        } else {
            art.cow(ctx, cx - s * 0.03, by + s * 0.01, s * 0.5, { facing: 1 });
        }
    }

    drawNight(ctx) {
        const s = this.cell;
        const k = this.night;
        for (const [c, r] of this.tiles()) {
            const p = this.cells[r][c];
            if (!p) continue;
            const { x, y } = this.cellRect(c, r);
            const f = this.frameOf(c, r);
            if (p.kind === 'house' && !p.dark) art.houseLights(ctx, f, k);
            else if (p.kind === 'barn') {
                art.barnLights(ctx, f, k);
                // The owl is only there at night.
                const [hx, hy] = art.barnSpots(f).hayloft;
                ctx.globalAlpha = clamp((k - 0.5) * 2, 0, 1);
                art.owl(ctx, hx, hy - s * 0.06, s * 0.7, { blink: p.blink > this.time });
                ctx.globalAlpha = 1;
            } else if (p.kind === 'windmill') art.windmillLights(ctx, f, k);
            else if (p.kind === 'coop') art.coopLights(ctx, f, k * 0.7);
            else if (p.kind === 'pond') {
                // Fireflies over the water.
                for (let i = 0; i < 2; i++) {
                    const t = this.time * 0.6 + p.seed + i * 2.1;
                    const fx = x + s * (0.5 + 0.3 * Math.sin(t * 1.3 + i));
                    const fy = y + s * (0.6 + 0.15 * Math.sin(t * 1.7 + i * 2));
                    const blink = 0.5 + 0.5 * Math.sin(t * 5 + i);
                    disc(ctx, fx, fy, s * 0.03, `rgba(255, 246, 170, ${0.25 * blink * k})`);
                    disc(ctx, fx, fy, s * 0.012, `rgba(255, 250, 200, ${0.95 * blink * k})`);
                }
            } else if (ANIMALS.indexOf(p.kind) >= 0 && !p.away && k > 0.6) {
                art.zzz(ctx, x + s * (p.facing > 0 ? 0.68 : 0.32), y + s * 0.5, s, this.time + p.seed);
            }
        }
        this.drawStars(ctx);
    }

    // A piece away from the board: in the tray, in a finger, or flying back. A ground piece is
    // drawn as a square, which the board lays flat as the top of a tile.
    drawLoose(ctx, p, x, y, s) {
        const kind = p.kind;
        if (kind === 'stream') {
            const line = (width, colour) => {
                ctx.beginPath();
                ctx.moveTo(x + s * 0.12, y + s * 0.58);
                ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.38, x + s * 0.88, y + s * 0.5);
                ctx.lineWidth = width;
                ctx.lineCap = 'round';
                ctx.strokeStyle = colour;
                ctx.stroke();
            };
            line(s * 0.36, FARM.reed);
            line(s * 0.26, FARM.bed);
            line(s * 0.18, FARM.water);
            for (const [rx, ry] of [
                [0.34, 0.5],
                [0.62, 0.45],
            ]) {
                ctx.beginPath();
                ctx.moveTo(x + s * rx, y + s * ry);
                ctx.lineTo(x + s * (rx + 0.08), y + s * (ry - 0.02));
                ctx.lineWidth = s * 0.03;
                ctx.strokeStyle = FARM.waterLight;
                ctx.stroke();
            }
            return;
        }
        if (kind === 'path' || kind === 'field' || kind === 'pond') {
            const colour = { path: FARM.path, field: FARM.soil, pond: FARM.water }[kind];
            const edge = { path: FARM.pathEdge, field: FARM.soilEdge, pond: FARM.waterDeep }[kind];
            fillRound(ctx, x + s * 0.08, y + s * 0.1, s * 0.84, s * 0.84, s * 0.2, edge);
            fillRound(ctx, x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, s * 0.18, colour);
            if (kind === 'field') {
                for (let j = 0; j < 3; j++)
                    fillRound(
                        ctx,
                        x + s * 0.18,
                        y + s * (0.3 + 0.2 * j),
                        s * 0.64,
                        s * 0.035,
                        s * 0.015,
                        FARM.furrow
                    );
            } else if (kind === 'pond') {
                this.lilyPad(ctx, x + s * 0.62, y + s * 0.6, s);
                ellipse(ctx, x + s * 0.38, y + s * 0.32, s * 0.14, s * 0.04, -0.2);
                ctx.fillStyle = FARM.waterLight;
                ctx.fill();
            } else {
                for (let i = 0; i < 4; i++)
                    disc(
                        ctx,
                        x + s * (0.3 + i * 0.13),
                        y + s * (0.42 + (i % 2) * 0.16),
                        s * 0.02,
                        FARM.pebble
                    );
            }
            return;
        }
        const f = this.looseFrame(x, y, s);
        if (kind === 'tree') art.tree(ctx, x, y, s, { apples: [art.APPLE_SPOTS[0], art.APPLE_SPOTS[2]] });
        else if (kind === 'barn') art.isoBarn(ctx, f, {});
        else if (kind === 'house') art.isoHouse(ctx, f, {});
        else if (kind === 'windmill') art.isoWindmill(ctx, f, { angle: 0.4 });
        else if (kind === 'coop') art.isoCoop(ctx, f, {});
        else if (kind === 'fence') art.isoFence(ctx, f, 0);
        else if (kind === 'tractor') art.tractor(ctx, x + s * 0.6, y + s * FOOT, s * 0.85, { facing: 1 });
        else if (kind === 'cow') art.cow(ctx, x + s / 2, y + s * FOOT, s, { facing: 1 });
        else if (kind === 'sheep') art.sheep(ctx, x + s / 2, y + s * FOOT, s, { facing: 1 });
        else if (kind === 'pig') art.pig(ctx, x + s / 2, y + s * FOOT, s, { facing: 1 });
    }

    // The grass tile, as the tray shows it: a few tufts on a square of side s.
    drawPlain(ctx, s) {
        ctx.strokeStyle = 'rgba(140, 175, 105, 0.7)';
        ctx.lineWidth = s * 0.025;
        ctx.lineCap = 'round';
        for (const [tx, ty] of [
            [0.3, 0.32],
            [0.66, 0.3],
            [0.46, 0.6],
            [0.74, 0.7],
            [0.24, 0.74],
        ]) {
            const x = tx * s;
            const y = ty * s;
            ctx.beginPath();
            ctx.moveTo(x - s * 0.03, y);
            ctx.lineTo(x - s * 0.04, y - s * 0.06);
            ctx.moveTo(x, y);
            ctx.lineTo(x, y - s * 0.08);
            ctx.moveTo(x + s * 0.03, y);
            ctx.lineTo(x + s * 0.044, y - s * 0.056);
            ctx.stroke();
        }
    }
}

// The farm's picture on the shelf: a little island with a barn, a tree, a path and a cow.
function icon(ctx, x, y, w, h) {
    const tw = Math.min(w * 0.42, h * 0.62);
    const look = {
        base: FARM.grass,
        alt: FARM.grassAlt,
        lip: FARM.grassEdge,
        lipDark: shade(FARM.grassEdge, -0.1),
        side: FARM.soil,
        sideDark: shade(FARM.soil, -0.12),
    };
    const mid = iso.island(
        ctx,
        x + w / 2,
        y + h * 0.5 - tw * 0.42,
        tw,
        [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ],
        look,
        (c, r) => (r === 1 && c === 1 ? FARM.path : null)
    );
    const s = tw * 0.92;
    const [bx, by] = mid(0, 0);
    art.isoBarn(ctx, { cx: bx, cy: by, tw }, {});
    const [tx, ty] = mid(1, 0);
    art.tree(ctx, tx - s / 2, ty - s * 0.84, s, { apples: [art.APPLE_SPOTS[0], art.APPLE_SPOTS[2]] });
    const [cx, cy] = mid(0, 1);
    art.cow(ctx, cx, cy + s * 0.02, s * 0.8, { facing: 1 });
}

export const toy = {
    id: 'farm',
    title: 'Farm',
    about: 'Build a farm from tiles: paths, fields, ponds, streams, animals, a tractor. Every piece joins up, answers a tap, and hides something; streams carry the water along.',
    stages: ['a small farm, 7 kinds of piece', 'a bigger farm, 11 kinds', 'the biggest farm, all 14 kinds'],
    mat: '#DCEBC9',
    icon,
    create: (app) => new FarmScene(app),
    sounds() {
        const list = [
            ['pat', {}],
            ['rustle', {}],
            ['thud', { f: 110 }],
            ['thud', { f: 85 }],
            ['creak', {}],
            ['latch', {}],
            ['whoosh', { variant: 'up' }],
            ['whoosh', { variant: 'down' }],
            ['putt', {}],
            ['toot', { f: noteHz(3, 60) }],
            ['toot', { f: noteHz(5, 60) }],
            ['quack', {}],
            ['ribbit', {}],
            ['hoot', {}],
            ['chirp', {}],
            ['chirp', { variant: 'peep', f: noteHz(0, 96) }],
            ['crow', {}],
            ['meow', {}],
            ['meow', { f: noteHz(6, 60) }],
            ['woof', {}],
            ['squeak', { f: 2600 }],
            ['gulp', { f: 220 }],
            ['gulp', { f: noteHz(10, 48) }],
            ['cluck', { f: noteHz(4, 60) }],
            ['cluck', { f: noteHz(3, 60) }],
            ['tick', { f: noteHz(5, 72) }],
            ['tick', { f: noteHz(3, 72) }],
            ['bubble', { f: 2200 }],
            ['slosh', {}],
            ['crunch', { seed: 3 }],
        ];
        for (const [name, degree] of Object.values(VOICES)) {
            for (let i = -2; i < 4; i++) list.push([name, { f: noteHz(degree + i, 60) }]);
        }
        for (let d = 3; d <= 12; d++) list.push(['drop', { f: noteHz(d, 60) }]);
        for (let d = 3; d <= 12; d++) list.push(['marimba', { f: noteHz(d, 60) }]);
        for (let d = 6; d <= 13; d++) list.push(['tink', { f: noteHz(d, 60) }]);
        for (let i = 0; i < 8; i++) list.push(['pop', { f: 450 + i * 40 }], ['pop', { f: 500 + i * 50 }]);
        list.push(['pop', { f: 650 }], ['pop', { f: 700 }]);
        for (const d of [0, 7]) list.push(['wood', { f: noteHz(d, 60) }]);
        for (const d of [5, 6, 7]) list.push(['musicBox', { f: noteHz(d, 60) }]);
        for (const d of [5, 7, 9, 10, 12]) list.push(['glock', { f: noteHz(d, 72) }]);
        for (const d of [0, 2, 4]) list.push(['chime', { f: noteHz(d, 48) }]);
        for (const d of [6, 8, 10]) list.push(['chime', { f: noteHz(d, 60) }]);
        return list;
    },
    signature() {
        audio.play('moo', { f: noteHz(-5, 60) }, { gain: 0.5, delay: 0.05 });
        audio.play('chirp', {}, { gain: 0.4, delay: 0.35 });
    },
};
