// The building site: a board to build a site on, and a tray of pieces to build it with.
//
// The farm's board and the farm's grammar (board.js): pieces are dragged from the tray, snap to a
// tile, move, swap and go back. What is new is that the site's machines work in chains. A digger
// beside a marked-out plot digs it out and loads the earth into a truck beside it; the truck drives
// the road and tips the earth onto a pile; a mixer beside the hole fills it with concrete; and a
// crane beside the set foundation lifts a building onto it, a floor at a time, each floor a note
// higher and the next of the playroom's colours, until it is topped out with a little tree. None
// of it has to happen in order, and none of it is a goal: every piece answers a tap whatever stands
// beside it, and a building is finished only when it is as tall as the crane can reach.
//
// Every piece does three things, as on the farm:
//   - it connects: roads join, and plots join plots at the same step, so two buildings side by
//     side are one wide building; each machine works the pieces beside it;
//   - it reacts to a tap: the digger digs, the truck drives, the mixer turns, the crane lifts, the
//     cones wobble down the line, a building plays its floors from the ground up;
//   - it hides something: pigeons on the road, a bone at the bottom of a hole, a cat's paws across
//     wet concrete, a worm in the pile, a hedgehog behind the cones, a radio in the hut, moths at
//     the lamp, a bird that nests on the crane.
//
// The foreman's hut holds the whistle: a tap, and every machine on the site has a go, one after
// another. The sun in the corner turns day to night: the windows light, the beacons turn, and the
// work lamps light the ground around them.
//
//   touch  - tap anything: every piece answers.
//   move   - drag pieces from the tray, and around the board.
//   make   - a site that works: dig, carry, pour and build, and a building that grows.

import { fillRound, disc, ellipse } from '../draw.js';
import { Spring, clamp, lerp, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { BoardScene, SIDES, E, S, W, key } from './board.js';
import { cat, bird, dog, sparkle } from './farmart.js';
import { SITE, worker, digger, dumpTruck, bulldozer, diggerSolve, toWorld } from './machines.js';
import * as art from './siteart.js';

const { GROUND, FLOORS, FLOOR_H } = art;

const FLAT = ['road', 'plot'];

// The machines that machines.js draws, at their size on a tile.
const MACHINE_K = 0.62;
const MACHINES = ['digger', 'truck', 'mixer', 'crane', 'roller', 'dozer'];

// A plot's steps: marked out with pegs and string, dug, poured, set; then a building, a floor a step.
const MARKED = 0;
const DUG = 1;
const POURED = 2;
const SET = 3;

// What each stage puts in the tray, how big the site is, the little site it starts as, and how
// tall the crane can build. In the plans, H is a plot already dug, F one already set, and B one
// with its first floor on.
const CODES = {
    R: 'road',
    P: 'plot',
    H: 'plot',
    F: 'plot',
    B: 'plot',
    L: 'pile',
    D: 'digger',
    T: 'truck',
    M: 'mixer',
    C: 'crane',
    K: 'cones',
    O: 'hut',
    Y: 'roller',
    Z: 'dozer',
    J: 'lamp',
};
const STEPS = { P: MARKED, H: DUG, F: SET, B: SET + 1 };

const PLANS = [
    {
        cols: 5,
        rows: 4,
        kinds: ['road', 'plot', 'digger', 'truck', 'mixer', 'crane'],
        start: ['PDT..', 'RRRRR', 'MHHCB', '.....'],
        floors: 3,
    },
    {
        cols: 6,
        rows: 5,
        kinds: ['road', 'plot', 'pile', 'digger', 'truck', 'mixer', 'crane', 'cones', 'hut'],
        start: ['L.PDT.', 'RRRRRR', 'MHH.CB', 'KK.O..', '......'],
        floors: 4,
    },
    {
        cols: 7,
        rows: 5,
        kinds: [
            'road',
            'plot',
            'pile',
            'digger',
            'truck',
            'mixer',
            'crane',
            'cones',
            'hut',
            'roller',
            'dozer',
            'lamp',
        ],
        start: ['LZPPDTY', 'RRRRRRR', 'MHH.CBB', 'KK.O.J.', '.......'],
        floors: 5,
    },
];

// When the foreman's whistle sets each kind of machine going, in seconds: the work of a site in
// order, the truck waiting until the digger has loaded it.
const WORK_ORDER = [
    ['digger', 0],
    ['dozer', 0.6],
    ['mixer', 1.2],
    ['truck', 2.4],
    ['crane', 3.0],
    ['roller', 3.8],
];

// The radio's tune: a phrase on the scale, as degrees from C5, with rests as nulls.
const TUNE = [5, 7, 8, 7, 5, null, 3, 5, 7, null, 8, 9, 10];

class SiteScene extends BoardScene {
    constructor(app) {
        super(app, PLANS);
        this.maxFloors = this.plan.floors;
        this.look = { sky: GROUND.sky, edge: GROUND.edge, base: GROUND.earth, alt: GROUND.earthAlt };
        this.workId = 0;
        this.begin(CODES);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.at(c, r);
                if (p && p.kind === 'plot') p.step = STEPS[this.plan.start[r][c]];
            }
        }
        this.normalise(true);
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
        if (kind === 'road') {
            p.fresh = 0;
        } else if (kind === 'plot') {
            p.step = MARKED;
            p.pop = new Spring(0, 260, 12);
            p.twang = new Spring(0, 900, 5);
            p.prints = [];
            p.setting = 0;
            p.find = false;
            p.tree = false;
            p.glow = -1;
            p.residents = false;
        } else if (kind === 'pile') {
            p.size = 2;
            p.worm = 0;
            p.slide = new Spring(0, 160, 7);
        } else if (kind === 'cones') {
            p.wobble = new Spring(0, 200, 4);
        } else if (kind === 'hut') {
            p.door = new Spring(0, 80, 13);
            p.out = 0;
            p.radio = 0;
        } else if (kind === 'lamp') {
            p.on = false;
            p.light = new Spring(0, 60, 12);
        } else if (MACHINES.indexOf(kind) >= 0) {
            p.facing = 1;
            p.work = null;
            p.trip = null;
            p.load = 0;
            p.loadColour = SITE.earth;
            p.act = new Spring(0, 260, 9);
            p.travel = 0;
            p.roll = 0;
            p.bird = 0;
            if (kind === 'truck') p.tip = new Spring(0, 70, 11);
            if (kind === 'mixer') {
                p.drum = this.rand() * TAU;
                p.spin = 0.6;
                p.pour = new Spring(0, 60, 11);
            }
            if (kind === 'crane') {
                p.swing = new Spring(1, 22, 8);
                p.trolley = new Spring(0.7, 30, 9);
                p.drop = new Spring(0.45, 30, 9);
                p.mast = new Spring(0.62, 20, 9);
                p.carry = null;
            }
            if (kind === 'dozer') {
                p.blade = new Spring(1, 90, 10);
                p.push = new Spring(0, 40, 9);
            }
        }
        return p;
    }

    isGround(kind) {
        return FLAT.indexOf(kind) >= 0;
    }

    // A plot with a building on it stands, like any other piece.
    stands(p) {
        return !this.isGround(p.kind) || (p.kind === 'plot' && p.step > SET);
    }

    joins(kind) {
        return kind === 'road' || kind === 'plot' || kind === 'cones';
    }

    // Plots join only plots at the same step, so a building and the bare plot beside it stay two
    // things until the plot catches up, and two buildings of a height side by side are one.
    plotMask(c, r) {
        const p = this.at(c, r);
        if (!p || p.kind !== 'plot') return 0;
        let m = 0;
        for (const [dc, dr, bit] of SIDES) {
            const n = this.at(c + dc, r + dr);
            if (n && n.kind === 'plot' && n.step === p.step) m |= bit;
        }
        return m;
    }

    group(c, r) {
        const p = this.at(c, r);
        if (!p || p.kind !== 'plot') return [];
        const seen = new Set([key(c, r)]);
        const out = [[c, r]];
        for (let i = 0; i < out.length; i++) {
            const [cc, rr] = out[i];
            for (const [dc, dr] of SIDES) {
                const nc = cc + dc;
                const nr = rr + dr;
                const n = this.at(nc, nr);
                if (!seen.has(key(nc, nr)) && n && n.kind === 'plot' && n.step === p.step) {
                    seen.add(key(nc, nr));
                    out.push([nc, nr]);
                }
            }
        }
        return out;
    }

    // Move a whole joined plot on to a step.
    advance(cells, step) {
        for (const [c, r] of cells) {
            const p = this.at(c, r);
            if (!p || p.kind !== 'plot') continue;
            p.step = step;
            p.setting = 0;
            p.pop.kick(8);
            if (step !== POURED) p.prints = [];
            if (step !== DUG) p.find = false;
            if (step <= SET) {
                p.tree = false;
                p.residents = false;
            }
        }
    }

    // Plots of a step beside (c, r): the first joined group found, or null.
    plotBeside(c, r, test) {
        for (const [dc, dr] of SIDES) {
            const n = this.at(c + dc, r + dr);
            if (n && n.kind === 'plot' && test(n)) return [c + dc, r + dr];
        }
        return null;
    }

    pieceBeside(c, r, kind, test = () => true) {
        for (const [dc, dr] of SIDES) {
            const n = this.at(c + dc, r + dr);
            if (n && n.kind === kind && !n.away && test(n)) return [c + dc, r + dr];
        }
        return null;
    }

    // A picked-up machine stops what it was doing.
    lifted(c, r, piece) {
        piece.work = null;
        if (piece.kind === 'crane') piece.carry = null;
        if (piece.kind === 'mixer') piece.pour.target = 0;
    }

    // Whether a piece is still where it was, doing what it was asked: work scheduled for later
    // checks this, since a child may carry a machine off half way through.
    still(p, c, r, id) {
        return this.at(c, r) === p && (id === undefined || (p.work && p.work.id === id));
    }

    //--------------------------------------------------------------------------
    // The ground: roads, drawn once into the layer. Plots change too often for that, and are drawn
    // each frame under everything standing.

    paintGround(ctx) {
        const s = this.cell;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                for (let i = 0; i < 4; i++) {
                    const n = (c * 7 + r * 13 + i * 29) % 37;
                    disc(
                        ctx,
                        this.bx + c * s + s * (0.12 + ((n * 0.37) % 0.76)),
                        this.by + r * s + s * (0.15 + ((n * 0.53) % 0.7)),
                        s * 0.012,
                        GROUND.speck
                    );
                }
            }
        }
        this.drawPaths(ctx, s * 0.62, GROUND.roadEdge, 'road');
        this.drawPaths(ctx, s * 0.54, GROUND.road, 'road');
        ctx.save();
        ctx.setLineDash([s * 0.09, s * 0.09]);
        ctx.lineWidth = Math.max(1, s * 0.028);
        ctx.strokeStyle = GROUND.roadLine;
        ctx.lineCap = 'butt';
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, 'road')) continue;
                const x = this.bx + (c + 0.5) * s;
                const y = this.by + (r + 0.5) * s;
                const m = this.mask(c, r);
                if (m & E) {
                    ctx.lineDashOffset = -c * s;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + s, y);
                    ctx.stroke();
                }
                if (m & S) {
                    ctx.lineDashOffset = -r * s;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, y + s);
                    ctx.stroke();
                }
                if (!m) {
                    ctx.lineDashOffset = 0;
                    ctx.beginPath();
                    ctx.moveTo(x - s * 0.14, y);
                    ctx.lineTo(x + s * 0.14, y);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    //--------------------------------------------------------------------------
    // Time

    updatePiece(p, c, r, dt) {
        p.bounce.update(dt);
        for (const name of ['pop', 'twang', 'slide', 'wobble', 'door', 'light', 'act', 'tip', 'pour']) {
            if (p[name]) p[name].update(dt);
        }
        if (p.kind === 'road') {
            if (p.fresh > 0) p.fresh -= dt;
        } else if (p.kind === 'plot') {
            // Wet concrete sets by itself, a few seconds after the pour.
            if (p.step === POURED) {
                p.setting += dt;
                if (p.setting > 7) this.setConcrete(c, r);
            }
        } else if (p.kind === 'pile') {
            if (p.worm > 0) p.worm -= dt;
        } else if (p.kind === 'hut') {
            if (p.out > 0) {
                p.out -= dt;
                if (p.out <= 0) p.door.target = 0;
            }
            if (p.radio > 0) p.radio -= dt;
        }
        if (MACHINES.indexOf(p.kind) < 0) return;
        if (p.bird > 0) p.bird -= dt;
        if (p.work) {
            p.work.t += dt;
            if (p.work.t >= p.work.life) p.work = null;
        }
        if (p.kind === 'mixer') {
            const idle = this.night > 0.5 ? 0.15 : 0.6;
            p.spin = idle + (p.spin - idle) * Math.exp(-dt / 1.5);
            p.drum += p.spin * dt;
        } else if (p.kind === 'crane') {
            p.swing.update(dt);
            p.trolley.update(dt);
            p.drop.update(dt);
            p.mast.update(dt);
        } else if (p.kind === 'dozer') {
            p.blade.update(dt);
            const before = p.push.value;
            p.push.update(dt);
            p.travel += (p.push.value - before) * this.cell * 0.6 * p.facing;
        }
        if (p.trip) this.drive(p, c, r, dt);
    }

    setConcrete(c, r) {
        const cells = this.group(c, r);
        this.advance(cells, SET);
        const rect = this.cellRect(c, r);
        [5, 7, 9].forEach((d, i) =>
            audio.note('glock', d, 72, { gain: 0.3, pan: this.pan(rect.x), delay: i * 0.08 })
        );
        for (const [cc, rr] of cells.slice(0, 4)) {
            const q = this.cellRect(cc, rr);
            this.sparkleAt(q.x + q.s * 0.5, q.y + q.s * 0.45);
        }
    }

    //--------------------------------------------------------------------------
    // Sounds

    // Each kind's own sound, for being placed, or tapped in the tray.
    voice(kind, x, gain) {
        const pan = this.pan(x);
        if (kind === 'road') audio.play('crunch', {}, { gain: gain * 0.6, pan });
        else if (kind === 'plot') {
            audio.play('pat', {}, { gain, pan });
            audio.note('musicBox', 7, 60, { gain: gain * 0.4, pan, delay: 0.05 });
        } else if (kind === 'pile') audio.play('rumble', { variant: 'short' }, { gain: gain * 0.7, pan });
        else if (kind === 'truck') {
            audio.note('beep', 4, 72, { gain, pan });
            audio.note('beep', 4, 72, { gain, pan, delay: 0.32 });
        } else if (kind === 'mixer') audio.play('slosh', {}, { gain, pan });
        else if (kind === 'crane') {
            audio.play('rattle', {}, { gain: gain * 0.8, pan });
            audio.note('clank', 5, 60, { gain: gain * 0.5, pan, delay: 0.2 });
        } else if (kind === 'cones') audio.note('wood', 7, 60, { gain: gain * 0.8, pan });
        else if (kind === 'hut') {
            audio.play('creak', {}, { gain: gain * 0.6, pan });
            audio.play('latch', {}, { gain: gain * 0.5, pan, delay: 0.25 });
        } else if (kind === 'lamp') audio.play('click', { variant: 'on' }, { gain: gain * 0.5, pan });
        else {
            // The machines with engines: a start, and a beat or two.
            for (let i = 0; i < 3; i++) audio.play('putt', {}, { gain: gain * 0.8, pan, delay: i * 0.14 });
            audio.play('hiss', {}, { gain: gain * 0.5, pan, delay: 0.4 });
        }
    }

    //--------------------------------------------------------------------------
    // Taps

    tap(c, r, piece, p) {
        const kind = piece.kind;
        if (kind === 'road') this.tapRoad(c, r, p.x, p.y);
        else if (kind === 'plot') this.tapPlot(c, r, piece, p.x, p.y);
        else if (kind === 'pile') this.tapPile(c, r, piece);
        else if (kind === 'digger') this.tapDigger(c, r, piece);
        else if (kind === 'truck') this.tapTruck(c, r, piece);
        else if (kind === 'mixer') this.tapMixer(c, r, piece);
        else if (kind === 'crane') this.tapCrane(c, r, piece);
        else if (kind === 'cones') this.tapCones(c, r);
        else if (kind === 'hut') this.tapHut(c, r, piece);
        else if (kind === 'roller') this.tapRoller(c, r, piece);
        else if (kind === 'dozer') this.tapDozer(c, r, piece);
        else if (kind === 'lamp') this.tapLamp(c, r, piece);
    }

    // The bare ground: a little dust.
    tapEmpty(c, r, p) {
        this.puff(p.x, p.y, 0.6, '226, 210, 180');
        audio.play('pat', {}, { gain: 0.4, pan: this.pan(p.x) });
    }

    //--------------------------------------------------------------------------
    // Roads: a crunch underfoot, and pigeons who come down to see what fell.

    tapRoad(c, r, x, y) {
        this.puff(x, y, 0.7, '226, 218, 204');
        audio.play('crunch', {}, { gain: 0.5, pan: this.pan(x) });
        if (this.surprise('pigeons', 0.6)) this.pigeons(c, r);
    }

    pigeons(c, r) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const life = 4.2;
        [0, 1].forEach((i) => {
            const land = { x: rect.x + s * (0.35 + i * 0.3), y: rect.y + s * (0.55 + i * 0.08) };
            const from = { x: land.x + (i ? 1 : -1) * s * 1.4, y: rect.y - s * 1.2 };
            const to = { x: land.x + (i ? -1 : 1) * s * 1.6, y: rect.y - s * 1.4 };
            this.fx.push({
                t: -i * 0.25,
                life,
                kind: 'pigeons',
                draw: (ctx, f) => {
                    if (f.t < 0) return;
                    let px;
                    let py;
                    let facing;
                    if (f.t < 0.7) {
                        const k = f.t / 0.7;
                        px = lerp(from.x, land.x, k);
                        py = lerp(from.y, land.y, k) - Math.sin(k * Math.PI) * s * 0.2;
                        facing = land.x > from.x ? 1 : -1;
                        bird(ctx, px, py, s * 1.5, { facing, flap: f.t * 22 });
                        return;
                    }
                    if (f.t > life - 0.7) {
                        const k = (f.t - (life - 0.7)) / 0.7;
                        px = lerp(land.x, to.x, k);
                        py = lerp(land.y, to.y, k);
                        bird(ctx, px, py, s * 1.5, { facing: to.x > land.x ? 1 : -1, flap: f.t * 22 });
                        return;
                    }
                    const peck = Math.max(0, Math.sin(f.t * 7 + i * 2));
                    art.pigeon(ctx, land.x + Math.sin(f.t * 1.3 + i) * s * 0.03, land.y, s * 1.8, {
                        facing: Math.sin(f.t * 0.8 + i) > 0 ? 1 : -1,
                        peck,
                    });
                },
            });
        });
        this.later(0.8, () =>
            audio.play('chirp', { variant: 'peep', f: noteHz(0, 84) }, { gain: 0.3, pan: this.pan(rect.x) })
        );
        this.later(life - 0.6, () =>
            audio.play('whoosh', { variant: 'up' }, { gain: 0.25, pan: this.pan(rect.x) })
        );
    }

    //--------------------------------------------------------------------------
    // Plots: pegs and string, then a hole, wet concrete, a foundation, and a building.

    tapPlot(c, r, p, x, y) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const pan = this.pan(x);
        if (p.step === MARKED) {
            // The string between the pegs, plucked.
            for (const [cc, rr] of this.group(c, r)) this.at(cc, rr).twang.kick(30);
            audio.note('musicBox', 5 + ((c + r) % 5), 60, { gain: 0.6, pan });
        } else if (p.step === DUG) {
            audio.play('crunch', { seed: 3 }, { gain: 0.5, pan });
            this.puff(x, y, 0.5, '190, 160, 130');
            // Something at the bottom of the hole.
            if (!p.find && this.surprise('bone', 0.5)) {
                p.find = true;
                this.later(0.2, () => audio.note('glock', 9, 72, { gain: 0.45, pan, wet: 0.4 }));
                this.sparkleAt(rect.x + s * 0.5, rect.y + s * 0.58, 0.2);
            } else if (p.find) {
                audio.note('glock', 7, 72, { gain: 0.35, pan, wet: 0.4 });
                this.sparkleAt(rect.x + s * 0.5, rect.y + s * 0.58);
            }
        } else if (p.step === POURED) {
            // A hand pressed into wet concrete leaves its print.
            if (p.prints.length >= 4) p.prints.shift();
            p.prints.push({
                x: clamp((x - rect.x) / s, 0.2, 0.8),
                y: clamp((y - rect.y) / s, 0.25, 0.8),
                hand: true,
            });
            audio.play('slosh', {}, { gain: 0.45, pan });
        } else if (p.step === SET) {
            audio.note('clank', 0, 60, { gain: 0.5, pan });
            this.puff(x, y, 0.5, '220, 214, 206');
        } else {
            this.playBuilding(c, r);
        }
    }

    // A building played from the ground up: each floor its colour's note, lit as it sounds. The
    // first time, it is found to be lived in.
    playBuilding(c, r) {
        const cells = this.group(c, r);
        const p = this.at(c, r);
        if (!p || p.step <= SET) return;
        const floors = p.step - SET;
        const step = p.step;
        const pan = this.pan(this.cellRect(c, r).x);
        for (let i = 0; i < floors; i++) {
            this.later(i * 0.3, () => {
                for (const [cc, rr] of cells) {
                    const t = this.at(cc, rr);
                    if (t && t.kind === 'plot' && t.step === step) t.glow = i;
                }
                audio.note('wood', FLOORS[i].degree, 60, { gain: 0.9, pan });
            });
        }
        this.later(floors * 0.3 + 0.15, () => {
            for (const [cc, rr] of cells) {
                const t = this.at(cc, rr);
                if (t && t.kind === 'plot') t.glow = -1;
            }
        });
        if (!cells.some(([cc, rr]) => this.at(cc, rr).residents) && this.surprise('residents', 0.5)) {
            this.later(floors * 0.3 + 0.3, () => {
                for (const [cc, rr] of cells) {
                    const t = this.at(cc, rr);
                    if (t && t.kind === 'plot' && t.step === step) t.residents = true;
                }
                audio.play('meow', { f: noteHz(6, 60) }, { gain: 0.6, pan });
            });
        }
    }

    //--------------------------------------------------------------------------
    // The pile: sand that slides, and a worm who lives in it.

    tapPile(c, r, p) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        p.slide.kick(12);
        audio.play('rumble', { variant: 'short' }, { gain: 0.55, pan: this.pan(rect.x) });
        this.puff(rect.x + s * 0.5, rect.y + s * 0.78, 0.8, '232, 214, 176');
        if (p.worm <= 0 && this.surprise('worm', 0.6)) {
            p.worm = 3.5;
            this.later(0.3, () => audio.play('squeak', { f: 2600 }, { gain: 0.3, pan: this.pan(rect.x) }));
        }
    }

    //--------------------------------------------------------------------------
    // The digger: it digs a marked plot beside it, or takes from a pile, and loads the earth into a
    // truck beside it, or onto a pile, or tips it back if there is nowhere for it to go.

    tapDigger(c, r, p) {
        if (p.work) return;
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const pan = this.pan(rect.x);
        const plot = this.plotBeside(c, r, (n) => n.step === MARKED);
        const heap = plot ? null : this.pieceBeside(c, r, 'pile');
        const from = plot || heap;
        const truck = this.pieceBeside(c, r, 'truck', (n) => !n.trip && !n.load);
        const onto = truck || this.pieceBeside(c, r, 'pile', (n) => !heap || n !== this.at(heap[0], heap[1]));
        const id = ++this.workId;
        const face = (cell) => (cell && cell[0] !== c ? (cell[0] > c ? 1 : -1) : p.facing);
        p.facing = face(from);
        const back = face(onto);
        p.work = { id, type: 'dig', t: 0, life: 2.6, turn: back !== p.facing ? back : 0 };
        for (let i = 0; i < 3; i++) audio.play('putt', {}, { gain: 0.7, pan, delay: i * 0.15 });
        audio.play('hiss', {}, { gain: 0.4, pan, delay: 0.3 });
        this.later(0.75, () => {
            if (!this.still(p, c, r, id)) return;
            audio.play('crunch', {}, { gain: 0.8, pan });
            if (plot && this.at(plot[0], plot[1]) && this.at(plot[0], plot[1]).step === MARKED) {
                const cells = this.group(plot[0], plot[1]);
                this.advance(cells, DUG);
                for (const [cc, rr] of cells) {
                    const q = this.cellRect(cc, rr);
                    this.puff(q.x + s * 0.5, q.y + s * 0.5, 1, '190, 160, 130');
                }
                p.loadColour = SITE.earth;
            } else if (heap && this.at(heap[0], heap[1]) && this.at(heap[0], heap[1]).kind === 'pile') {
                const pile = this.at(heap[0], heap[1]);
                pile.size = Math.max(1, pile.size - 1);
                pile.slide.kick(8);
                p.loadColour = SITE.sand;
            } else {
                p.loadColour = SITE.earth;
            }
            p.load = 1;
        });
        this.later(1.35, () => {
            if (this.still(p, c, r, id)) p.facing = back;
        });
        this.later(1.95, () => {
            if (!this.still(p, c, r, id)) return;
            p.load = 0;
            const target = onto && this.at(onto[0], onto[1]);
            if (target && target.kind === 'truck' && !target.trip && !target.away) {
                target.load = 1;
                target.loadColour = p.loadColour;
                target.bounce.kick(8);
                audio.play('rumble', { variant: 'short' }, { gain: 0.6, pan });
            } else if (target && target.kind === 'pile') {
                target.size = Math.min(3, target.size + 1);
                target.slide.kick(10);
                audio.play('rumble', { variant: 'short' }, { gain: 0.6, pan });
            } else {
                audio.play('rumble', { variant: 'short' }, { gain: 0.45, pan });
                this.puff(rect.x + s * (0.5 + p.facing * 0.4), rect.y + s * 0.7, 0.8, '190, 160, 130');
            }
        });
        this.later(2.6, () => {
            if (this.at(c, r) === p && this.night < 0.5 && this.surprise('perch', 0.5)) {
                p.bird = 6;
                audio.play('chirp', {}, { gain: 0.45, pan });
            }
        });
    }

    // The digger's arm through its dig, as where the bucket is in the digger's own frame (facing
    // right, in its own size) and the bucket's angle: down into the tile ahead teeth first, a bite,
    // up holding the load, out over the truck, tipped, and home.
    diggerPose(p) {
        const REST = [0.55, -0.33, 0.2];
        const DIG = [1.12, 0.04, 1.1];
        const BITE = [1.0, -0.02, 0];
        const LIFT = [0.72, -0.8, 0];
        const OVER = [1.05, -0.72, 0];
        const TIP = [1.05, -0.72, 2.2];
        const w = p.work;
        if (!w || w.type !== 'dig') return REST;
        const t = w.t;
        const ease = (a, b, x) => {
            const k = 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
            return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
        };
        if (t < 0.6) return ease(REST, DIG, t / 0.6);
        if (t < 0.9) return ease(DIG, BITE, (t - 0.6) / 0.3);
        if (t < 1.35) return ease(BITE, LIFT, (t - 0.9) / 0.45);
        if (t < 1.75) return ease(LIFT, OVER, (t - 1.35) / 0.4);
        if (t < 2.1) return ease(OVER, TIP, (t - 1.75) / 0.35);
        return ease(TIP, REST, (t - 2.1) / 0.5);
    }

    drawDigger(ctx, p, cx, by, k) {
        const [lx, ly, bucket] = this.diggerPose(p);
        const frame = { facing: p.facing };
        const aim = toWorld(cx, by, k, frame, lx, ly);
        const arm = diggerSolve(cx, by, k, frame, aim.x, aim.y);
        digger(ctx, cx, by, k, {
            facing: p.facing,
            boom: arm.boom,
            stick: arm.stick,
            bucket,
            load: p.load,
            loadColour: p.loadColour,
            beacon: this.beaconGlow(p),
            travel: p.travel,
        });
    }

    //--------------------------------------------------------------------------
    // The dump truck: two beeps, and then the whole road it stands beside, tipping its load onto a
    // pile beside the road if it has one; beeping, as trucks do, whenever it backs up.

    tapTruck(c, r, p) {
        if (p.trip) return;
        const rect = this.cellRect(c, r);
        const pan = this.pan(rect.x);
        audio.note('beep', 4, 72, { gain: 0.9, pan });
        audio.note('beep', 4, 72, { gain: 0.9, pan, delay: 0.32 });
        const start = this.beside(c, r, 'road')[0];
        if (!start) {
            // Nowhere to go: tip the bed where it stands.
            p.tip.target = 1;
            audio.play('hiss', {}, { gain: 0.5, pan, delay: 0.2 });
            this.later(0.6, () => {
                if (this.at(c, r) !== p) return;
                if (p.load) this.tipLoad(p, c, r);
            });
            this.later(1.4, () => (p.tip.target = 0));
            return;
        }
        const route = this.tour(start, 'road');
        p.trip = {
            points: [[c, r]].concat(route, [[c, r]]),
            d: 0,
            beat: 0,
            last: -1,
            dir: null,
            pause: 0,
            tiles: 0,
            dog: this.surprise('dog', 0.6),
        };
        p.away = 'trip';
        if (p.trip.dog) audio.play('woof', {}, { gain: 0.7, pan, delay: 0.4 });
    }

    // Tip a truck's load: onto a pile beside it, or out onto the ground.
    tipLoad(p, c, r, roadC = c, roadR = r) {
        const rect = this.cellRect(roadC, roadR);
        const s = this.cell;
        const heap = this.pieceBeside(roadC, roadR, 'pile');
        audio.play('rumble', {}, { gain: 0.75, pan: this.pan(rect.x) });
        if (heap) {
            const pile = this.at(heap[0], heap[1]);
            pile.size = Math.min(3, pile.size + 1);
            pile.slide.kick(12);
            const q = this.cellRect(heap[0], heap[1]);
            this.puff(q.x + s * 0.5, q.y + s * 0.7, 1, '232, 214, 176');
        } else {
            this.puff(rect.x + s * 0.5, rect.y + s * 0.75, 1, '226, 210, 180');
        }
        p.load = 0;
    }

    drive(p, c, r, dt) {
        const trip = p.trip;
        const s = this.cell;
        const roller = p.kind === 'roller';
        if (trip.pause > 0) {
            trip.pause -= dt;
            return;
        }
        const speed = roller ? 1.1 : 1.9;
        trip.d += dt * speed;
        p.travel += dt * speed * s;
        p.roll += dt * speed * 5 * p.facing;
        trip.beat -= dt;
        if (trip.beat <= 0) {
            trip.beat = roller ? 0.24 : 0.17;
            audio.play(
                'putt',
                {},
                { gain: 0.7, pan: this.pan(this.bx + (trip.x || 0)), rate: roller ? 0.8 : 1 }
            );
        }
        const i = Math.floor(trip.d);
        if (i >= trip.points.length - 1) {
            p.trip = null;
            p.away = null;
            p.bounce.kick(8);
            const pan = this.pan(this.cellRect(c, r).x);
            if (roller) audio.note('toot', 0, 60, { gain: 0.7, pan });
            else {
                audio.note('beep', 4, 72, { gain: 0.8, pan });
                if (p.load) this.tipLoad(p, c, r);
            }
            return;
        }
        const k = trip.d - i;
        const [ac, ar] = trip.points[i];
        const [bc, br] = trip.points[i + 1];
        trip.x = (lerp(ac, bc, k) + 0.5) * s;
        trip.y = (lerp(ar, br, k) + 0.5) * s;
        if (bc !== ac) p.facing = bc > ac ? 1 : -1;
        if (i === trip.last) return;
        // Arriving on a tile.
        trip.last = i;
        const pan = this.pan(this.bx + trip.x);
        const dir = [bc - ac, br - ar];
        if (trip.dir && dir[0] === -trip.dir[0] && dir[1] === -trip.dir[1] && !roller) {
            // Backing up the way it came.
            audio.note('beep', 2, 72, { gain: 0.6, pan });
            audio.note('beep', 2, 72, { gain: 0.6, pan, delay: 0.3 });
        }
        trip.dir = dir;
        if (roller) {
            const road = this.at(ac, ar);
            if (road && road.kind === 'road') road.fresh = 9;
            audio.note('marimba', 5 + (trip.tiles % 7), 60, { gain: 0.45, pan });
            trip.tiles++;
        } else if (p.load && this.pieceBeside(ac, ar, 'pile')) {
            trip.pause = 1.3;
            p.tip.target = 1;
            audio.play('hiss', {}, { gain: 0.45, pan });
            this.later(0.45, () => {
                if (p.trip === trip) this.tipLoad(p, c, r, ac, ar);
            });
            this.later(1.05, () => (p.tip.target = 0));
        }
    }

    //--------------------------------------------------------------------------
    // The mixer: its drum turns all day; tapped, it spins up, and pours a hole beside it full of
    // concrete. The first time, a cat walks across the wet concrete.

    tapMixer(c, r, p) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const pan = this.pan(rect.x);
        p.spin = 7;
        audio.play('slosh', {}, { gain: 0.8, pan });
        audio.play('slosh', { seed: 4 }, { gain: 0.6, pan, delay: 0.5 });
        const hole = this.plotBeside(c, r, (n) => n.step === DUG);
        if (hole && !(p.work && p.work.type === 'pour')) {
            const id = ++this.workId;
            p.work = { id, type: 'pour', t: 0, life: 2.6 };
            if (hole[0] !== c) p.facing = hole[0] > c ? -1 : 1;
            p.pour.target = 1;
            for (let i = 0; i < 3; i++)
                audio.play('gulp', { f: 220 }, { gain: 0.5, pan, delay: 0.6 + i * 0.35 });
            this.later(0.9, () => {
                const h = this.at(hole[0], hole[1]);
                if (!this.still(p, c, r, id) || !h || h.kind !== 'plot' || h.step !== DUG) return;
                const cells = this.group(hole[0], hole[1]);
                this.advance(cells, POURED);
                this.later(2.2, () => {
                    const t = this.at(hole[0], hole[1]);
                    if (t && t.kind === 'plot' && t.step === POURED && this.surprise('paws', 0.7))
                        this.catAcross(this.group(hole[0], hole[1]));
                });
            });
            this.later(2.2, () => (p.pour.target = 0));
        } else if (!p.work) {
            p.work = { id: ++this.workId, type: 'turn', t: 0, life: 1.2 };
            p.pour.target = 0.6;
            this.later(0.9, () => (p.pour.target = 0));
            this.later(0.5, () =>
                this.puff(rect.x + s * (0.5 - p.facing * 0.42), rect.y + s * 0.8, 0.6, '185, 179, 171')
            );
        }
    }

    // A cat crossing the wet concrete, leaving a line of paw prints, and a meow at the far side.
    catAcross(cells) {
        const s = this.cell;
        const row = cells.filter(([, rr]) => rr === cells[0][1]).sort((a, b) => a[0] - b[0]);
        const first = this.cellRect(row[0][0], row[0][1]);
        const last = this.cellRect(row[row.length - 1][0], row[row.length - 1][1]);
        const y = first.y + s * 0.62;
        const x0 = first.x - s * 0.2;
        const x1 = last.x + s * 1.2;
        const life = 1.2 + 0.6 * row.length;
        let printed = 0;
        this.fx.push({
            t: 0,
            life,
            kind: 'cat',
            draw: (ctx, f) => {
                const x = lerp(x0, x1, f.t / f.life);
                cat(ctx, x, y + Math.abs(Math.sin(f.t * 9)) * s * -0.01, s * 0.9, {
                    facing: 1,
                    stretch: 0.6,
                });
            },
            update: (dt, f) => {
                const x = lerp(x0, x1, f.t / f.life);
                const due = Math.floor((x - x0) / (s * 0.16));
                for (; printed < due; printed++) {
                    const px = x0 + (printed + 0.5) * s * 0.16;
                    const cell = this.cellAt(px, y);
                    if (!cell) continue;
                    const t = this.at(cell[0], cell[1]);
                    if (!t || t.kind !== 'plot' || t.step !== POURED) continue;
                    const rect = this.cellRect(cell[0], cell[1]);
                    t.prints.push({
                        x: (px - rect.x) / s,
                        y: (y - rect.y) / s + (printed % 2 ? 0.04 : -0.04),
                    });
                    if (t.prints.length > 12) t.prints.shift();
                }
            },
        });
        this.later(life * 0.8, () =>
            audio.play('meow', { f: noteHz(5, 60) }, { gain: 0.6, pan: this.pan(x1) })
        );
    }

    //--------------------------------------------------------------------------
    // The crane: a floor at a time onto a foundation or a building beside it, each one a note
    // higher, up to as tall as it builds; then the topping-out tree. Its mast climbs with what it
    // builds, as a real tower crane's does.

    tapCrane(c, r, p) {
        if (p.work) return;
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const pan = this.pan(rect.x);
        audio.play('rattle', {}, { gain: 0.7, pan });
        let target = null;
        let tree = false;
        for (const [dc, dr] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ]) {
            const n = this.at(c + dc, r + dr);
            if (!n || n.kind !== 'plot' || n.step < SET) continue;
            const cells = this.group(c + dc, r + dr);
            if (n.step - SET < this.maxFloors) {
                target = [c + dc, r + dr];
                break;
            }
            if (!target && !cells.some(([cc, rr]) => this.at(cc, rr).tree)) {
                target = [c + dc, r + dr];
                tree = true;
            }
        }
        const id = ++this.workId;
        if (!target) {
            // Nothing to build on: a swing round and back.
            p.work = { id, type: 'swing', t: 0, life: 2.4 };
            const home = p.swing.target >= 0 ? 1 : -1;
            p.swing.target = -home;
            this.later(1.2, () => {
                if (this.still(p, c, r, id)) p.swing.target = home;
            });
            this.later(0.6, () => audio.play('rattle', { seed: 3 }, { gain: 0.4, pan }));
            return;
        }
        const [tc, tr] = target;
        const goal = this.at(tc, tr);
        const step = goal.step;
        const floors = step - SET;
        const side = tc - c;
        const roofY = this.cellRect(tc, tr).y + s * 0.84 - floors * FLOOR_H * s;
        // The mast climbs if the building would otherwise reach the jib.
        const needTop = roofY - (FLOOR_H + 0.42) * s;
        p.mast.target = Math.max(0.62, (rect.y - needTop) / s);
        const jy = rect.y - s * p.mast.target - s * 0.02;
        const hookFor = (y) => (y - jy - s * 0.05) / s;
        const ground = hookFor(rect.y + s * 0.84 - s * 0.26);
        const land = hookFor(roofY - s * (0.04 + FLOOR_H * 0.9));
        p.work = { id, type: 'lift', t: 0, life: 3.8 };
        p.swing.target = side;
        p.trolley.target = 0.05;
        p.drop.target = 0.5;
        this.later(0.7, () => {
            if (this.still(p, c, r, id)) p.drop.target = ground;
        });
        this.later(1.25, () => {
            if (!this.still(p, c, r, id)) return;
            p.carry = tree ? 'tree' : FLOORS[Math.min(floors, FLOORS.length - 1)];
            audio.note('clank', 2, 60, { gain: 0.3, pan });
            audio.play('rattle', { seed: 2 }, { gain: 0.5, pan, delay: 0.1 });
            p.drop.target = Math.min(land - 0.3, 0.25);
        });
        this.later(1.9, () => {
            if (!this.still(p, c, r, id)) return;
            p.trolley.target = side ? 1 : 0.5;
            p.drop.target = land - 0.25;
        });
        this.later(2.6, () => {
            if (this.still(p, c, r, id)) p.drop.target = land;
        });
        this.later(3.05, () => {
            if (!this.still(p, c, r, id)) return;
            p.carry = null;
            const t = this.at(tc, tr);
            if (!t || t.kind !== 'plot' || t.step !== step) return;
            const cells = this.group(tc, tr);
            const q = this.cellRect(tc, tr);
            if (tree) {
                let mid = cells[0];
                for (const cell of cells) if (Math.abs(cell[0] - c) < Math.abs(mid[0] - c)) mid = cell;
                this.at(mid[0], mid[1]).tree = true;
                [5, 7, 9, 10].forEach((d, i) =>
                    audio.note('glock', d, 72, { gain: 0.45, pan, delay: i * 0.12, wet: 0.4 })
                );
                this.sparkleAt(q.x + s * 0.5, roofY - s * 0.2);
            } else {
                this.advance(cells, step + 1);
                audio.note('clank', FLOORS[floors].degree, 60, { gain: 0.9, pan });
                audio.note('wood', FLOORS[floors].degree, 60, { gain: 0.6, pan, delay: 0.05 });
                this.puff(q.x + s * 0.5, roofY, 0.8, '230, 224, 214');
            }
            for (const [cc, rr] of cells) this.at(cc, rr).bounce.kick(6);
            p.drop.target = 0.45;
            p.trolley.target = 0.7;
            if (this.night < 0.5 && this.surprise('nest', 0.5)) {
                this.later(0.8, () => {
                    if (this.at(c, r) !== p) return;
                    p.bird = 8;
                    audio.play('chirp', {}, { gain: 0.5, pan });
                });
            }
        });
    }

    //--------------------------------------------------------------------------
    // Cones: a line of them wobbles one after another, climbing the scale; behind one, a hedgehog.

    tapCones(c, r) {
        const line = this.component(c, r, 'cones').slice(0, 10);
        line.forEach(([cc, rr], i) =>
            this.later(i * 0.12, () => {
                const n = this.at(cc, rr);
                if (!n || n.kind !== 'cones') return;
                n.wobble.kick(i % 2 ? -26 : 26);
                audio.note('wood', 5 + i, 60, { gain: 0.6, pan: this.pan(this.cellRect(cc, rr).x) });
            })
        );
        if (this.surprise('hedgehog', 0.6)) this.hedgehog(c, r);
    }

    hedgehog(c, r) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const x0 = rect.x + s * 0.5;
        const y = rect.y + s * 0.86;
        this.fx.push({
            t: 0,
            life: 4,
            kind: 'hedgehog',
            draw: (ctx, f) => {
                const out = f.t < 2 ? Math.min(1, f.t / 1.2) : Math.max(0, 1 - (f.t - 2.4) / 1.2);
                hedgehogAt(ctx, x0 + out * s * 0.34, y, s, f.t < 2 ? 1 : -1, f.t);
            },
        });
        this.later(1.3, () => audio.play('squeak', { f: 1400 }, { gain: 0.25, pan: this.pan(rect.x) }));
    }

    //--------------------------------------------------------------------------
    // The hut: the foreman comes out and blows the whistle, and every machine on the site has a go.
    // Sometimes the radio is on.

    tapHut(c, r, p) {
        const rect = this.cellRect(c, r);
        const pan = this.pan(rect.x);
        p.door.target = 1;
        p.out = 5.5;
        audio.play('creak', {}, { gain: 0.6, pan });
        audio.play('whistle', {}, { gain: 0.8, pan, delay: 0.55 });
        audio.play('whistle', { variant: 'long' }, { gain: 0.8, pan, delay: 0.85 });
        this.whistleUp(1.5);
        if (p.radio <= 0 && this.surprise('radio', 0.6)) {
            p.radio = TUNE.length * 0.28 + 0.4;
            TUNE.forEach((d, i) => {
                if (d !== null) audio.note('musicBox', d, 60, { gain: 0.4, pan, delay: 0.2 + i * 0.28 });
            });
        }
    }

    // Every machine on the site has a go, in the order a building's work goes.
    whistleUp(delay) {
        for (const [kind, at] of WORK_ORDER) {
            this.every(kind)
                .slice(0, 4)
                .forEach(([c, r], i) => {
                    const p = this.at(c, r);
                    this.later(delay + at + i * 0.3, () => {
                        if (this.at(c, r) !== p || p.away || p.work) return;
                        p.bounce.kick(5);
                        this.tap(c, r, p, { x: this.cellRect(c, r).x, y: this.cellRect(c, r).y });
                    });
                });
        }
    }

    //--------------------------------------------------------------------------
    // The roller: along the road at a walk, leaving it fresh and shining, its drum playing the scale
    // as it goes. A cat sometimes rides on the roof.

    tapRoller(c, r, p) {
        if (p.trip) return;
        const rect = this.cellRect(c, r);
        const pan = this.pan(rect.x);
        audio.note('toot', 0, 60, { gain: 0.8, pan });
        const start = this.beside(c, r, 'road')[0];
        if (!start) {
            p.act.kick(10);
            for (let i = 0; i < 5; i++)
                audio.play('putt', {}, { gain: 0.6, pan, delay: 0.3 + i * 0.2, rate: 0.8 });
            return;
        }
        p.trip = {
            points: [[c, r]].concat(this.tour(start, 'road'), [[c, r]]),
            d: 0,
            beat: 0,
            last: -1,
            dir: null,
            pause: 0,
            tiles: 0,
            cat: this.night < 0.5 && this.surprise('rider', 0.6),
        };
        p.away = 'trip';
    }

    //--------------------------------------------------------------------------
    // The bulldozer: blade down and a push at a pile beside it, or at a hole, which it fills back
    // in. Under the sand, a lost ball.

    tapDozer(c, r, p) {
        if (p.work) return;
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const pan = this.pan(rect.x);
        const heap = this.pieceBeside(c, r, 'pile');
        const hole = heap ? null : this.plotBeside(c, r, (n) => n.step === DUG);
        const at = heap || hole;
        if (at && at[0] !== c) p.facing = at[0] > c ? 1 : -1;
        const id = ++this.workId;
        p.work = { id, type: 'push', t: 0, life: 2.2 };
        p.blade.target = 0;
        p.push.target = 1;
        for (let i = 0; i < 4; i++) audio.play('putt', {}, { gain: 0.7, pan, delay: i * 0.16 });
        this.later(0.8, () => {
            if (!this.still(p, c, r, id)) return;
            audio.play('crunch', {}, { gain: 0.8, pan });
            if (heap && this.is(heap[0], heap[1], 'pile')) {
                const pile = this.at(heap[0], heap[1]);
                pile.size = Math.max(1, pile.size - 1);
                pile.slide.kick(14);
                const q = this.cellRect(heap[0], heap[1]);
                this.puff(q.x + s * 0.5, q.y + s * 0.75, 1, '232, 214, 176');
                if (this.surprise('ball', 0.5)) this.ballOut(q.x + s * 0.5, q.y + s * 0.6);
            } else if (hole) {
                const h = this.at(hole[0], hole[1]);
                if (h && h.kind === 'plot' && h.step === DUG) {
                    const cells = this.group(hole[0], hole[1]);
                    this.advance(cells, MARKED);
                    for (const [cc, rr] of cells) {
                        const q = this.cellRect(cc, rr);
                        this.puff(q.x + s * 0.5, q.y + s * 0.5, 1, '190, 160, 130');
                    }
                }
            } else {
                this.puff(rect.x + s * (0.5 + p.facing * 0.45), rect.y + s * 0.78, 0.8, '226, 210, 180');
            }
        });
        this.later(1.1, () => {
            if (!this.still(p, c, r, id)) return;
            p.blade.target = 1;
            p.push.target = 0;
        });
    }

    ballOut(x, y) {
        const s = this.cell;
        const dir = this.rand() < 0.5 ? -1 : 1;
        const colour = ['#ABCDEA', '#F2BAC3', '#F3DE97'][Math.floor(this.rand() * 3)];
        this.fx.push({
            t: 0,
            life: 1.8,
            kind: 'ball',
            top: true,
            draw: (ctx, f) => {
                const k = f.t / f.life;
                const bounce = Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k) * s * 0.45;
                ctx.globalAlpha = 1 - clamp((k - 0.8) / 0.2, 0, 1);
                art.ball(ctx, x + dir * k * s * 1.1, y - bounce, s * 1.8, colour);
                ctx.globalAlpha = 1;
            },
        });
        [0, 0.35, 0.65].forEach((d, i) =>
            this.later(d + 0.3, () =>
                audio.play('pop', { f: 500 + i * 50 }, { gain: 0.5 - i * 0.12, pan: this.pan(x) })
            )
        );
    }

    //--------------------------------------------------------------------------
    // The work lamp: on and off; at night it lights the ground around it, and moths come.

    tapLamp(c, r, p) {
        p.on = !p.on;
        p.light.target = p.on ? 1 : 0;
        audio.play(
            'click',
            { variant: p.on ? 'on' : 'off' },
            { gain: 0.7, pan: this.pan(this.cellRect(c, r).x) }
        );
    }

    //--------------------------------------------------------------------------
    // Things to touch that are not pieces: a building's upper floors, which stand over the tiles
    // behind it, and a bird perched on a machine.

    targetAt(x, y) {
        const s = this.cell;
        for (let r = this.rows - 1; r >= 0; r--) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.at(c, r);
                if (!p || p.away) continue;
                const rect = this.cellRect(c, r);
                if (p.kind === 'plot' && p.step > SET) {
                    const roof = rect.y + s * 0.84 - (p.step - SET) * FLOOR_H * s - s * 0.06;
                    if (y < rect.y && y >= roof && x > rect.x + s * 0.08 && x < rect.x + s * 0.92) {
                        return {
                            tap: () => {
                                p.bounce.kick(5);
                                this.playBuilding(c, r);
                            },
                        };
                    }
                }
            }
        }
        return null;
    }

    //--------------------------------------------------------------------------
    // Day and night

    // At dusk the foreman goes in; at dawn, out with the whistle, and the work begins again.
    dusk() {
        for (const [c, r] of this.every('hut')) {
            const p = this.at(c, r);
            p.out = 0;
            p.door.target = 0;
        }
    }

    dawn() {
        const huts = this.every('hut');
        if (!huts.length) return;
        const [c, r] = huts[0];
        const p = this.at(c, r);
        this.later(0.6, () => {
            if (this.at(c, r) !== p) return;
            p.door.target = 1;
            p.out = 4;
            audio.play('whistle', { variant: 'long' }, { gain: 0.7, pan: this.pan(this.cellRect(c, r).x) });
        });
    }

    // A beacon's glow: turning at night, and while the machine works.
    beaconGlow(p) {
        const busy = p.work || p.trip ? 1 : 0;
        const k = Math.max(this.night, busy);
        if (k <= 0) return 0;
        return k * (0.5 + 0.5 * Math.sin(this.time * 6 + p.seed));
    }

    //--------------------------------------------------------------------------
    // Drawing

    // Plots at every step, then anything that lies on the ground, under everything standing.
    drawBelow(ctx) {
        const s = this.cell;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.cells[r][c];
                if (!p) continue;
                const { x, y } = this.cellRect(c, r);
                if (p.kind === 'road' && p.fresh > 0) {
                    // Freshly rolled: smooth and dark, joined to the fresh road beside it.
                    const k = clamp(p.fresh / 2, 0, 1);
                    const mx = x + s / 2;
                    const my = y + s / 2;
                    const half = s * 0.25;
                    // One shape, filled once, so the overlaps do not darken.
                    ctx.globalAlpha = 0.5 * k;
                    ctx.beginPath();
                    ctx.arc(mx, my, half, 0, TAU);
                    for (const [dc, dr] of SIDES) {
                        const n = this.at(c + dc, r + dr);
                        if (!n || n.kind !== 'road' || !(n.fresh > 0)) continue;
                        if (dc) ctx.rect(Math.min(mx, mx + dc * s * 0.5), my - half, s * 0.5, half * 2);
                        else ctx.rect(mx - half, Math.min(my, my + dr * s * 0.5), half * 2, s * 0.5);
                    }
                    ctx.fillStyle = GROUND.fresh;
                    ctx.fill();
                    ctx.globalAlpha = 0.6 * k;
                    fillRound(ctx, mx - s * 0.22, my - s * 0.17, s * 0.3, s * 0.025, s * 0.012, '#FBF6EE');
                    ctx.globalAlpha = 1;
                }
                if (p.kind !== 'plot') continue;
                const m = this.plotMask(c, r);
                const lift = clamp(p.pop.value, -20, 20) * s * 0.001;
                if (p.step === MARKED) art.plotMarked(ctx, x, y - lift, s, m, p.twang.value * s * 0.0015);
                else if (p.step === DUG) {
                    art.plotHole(ctx, x, y, s, m);
                    if (p.find) art.bone(ctx, x + s * 0.5, y + s * 0.6, s * 2);
                } else if (p.step === POURED) {
                    art.plotWet(ctx, x, y, s, m);
                    for (const print of p.prints) {
                        if (print.hand) art.handprint(ctx, x + print.x * s, y + print.y * s, s);
                        else art.pawprint(ctx, x + print.x * s, y + print.y * s, s);
                    }
                } else if (p.step === SET) art.plotSlab(ctx, x, y - lift, s, m, true);
            }
        }
        for (const f of this.fx) if (f.below) f.draw(ctx, f);
    }

    drawPiece(ctx, p, c, r, x, y, s) {
        const b = p.bounce.value * 0.01;
        ctx.save();
        ctx.translate(x + s / 2, y + s * 0.86);
        ctx.scale(1 + b, 1 - b * 1.2);
        ctx.translate(-(x + s / 2), -(y + s * 0.86));
        const kind = p.kind;
        const cx = x + s / 2;
        const by = y + s * 0.84;
        if (kind === 'plot') {
            const m = this.plotMask(c, r);
            const floors = p.step - SET;
            art.building(ctx, x, y, s, floors, !!(m & W), !!(m & E), {
                glow: p.glow,
                plants: p.residents,
            });
            const roof = by - floors * FLOOR_H * s;
            if (p.residents && !(m & W))
                cat(ctx, x + s * 0.33, by - FLOOR_H * s * 0.3, s * 0.8, { facing: 1 });
            if (p.tree) art.toppingTree(ctx, cx, roof - s * 0.04, s);
        } else if (kind === 'pile') {
            const slide = clamp(p.slide.value, -30, 30) * 0.004;
            ctx.save();
            ctx.translate(cx, by);
            ctx.scale(1 + slide, 1 - slide);
            ctx.translate(-cx, -by);
            art.pile(ctx, x, y, s, p.size, {
                worm: p.worm > 0 ? Math.min(1, p.worm, 3.5 - p.worm) * 1.5 : 0,
            });
            ctx.restore();
        } else if (kind === 'digger') {
            this.drawDigger(ctx, p, cx, by, s * MACHINE_K);
            if (p.bird > 0)
                bird(ctx, cx + p.facing * s * 0.08, by - s * 0.47, s * 0.9, {
                    facing: -p.facing,
                    flap: Math.PI / 2,
                });
        } else if (kind === 'truck') {
            dumpTruck(ctx, cx, by, s * MACHINE_K, {
                facing: p.facing,
                tip: clamp(p.tip.value, 0, 1),
                load: p.load,
                loadColour: p.loadColour,
                beacon: this.beaconGlow(p),
            });
        } else if (kind === 'mixer') {
            art.mixer(ctx, cx, by, s * 0.92, {
                facing: p.facing,
                drum: p.drum,
                pour: clamp(p.pour.value, 0, 1),
                glow: this.beaconGlow(p),
            });
        } else if (kind === 'crane') {
            art.crane(ctx, x, y, s, {
                swing: p.swing.value,
                trolley: clamp(p.trolley.value, 0, 1),
                drop: p.drop.value,
                mast: p.mast.value,
                load: p.carry && p.carry !== 'tree' ? p.carry : null,
                tree: p.carry === 'tree',
                glow: this.beaconGlow(p),
            });
            if (p.bird > 0) {
                const top = y - s * p.mast.value;
                const end = x + s * 0.5 + p.swing.value * s * 1.0;
                bird(ctx, end, top - s * 0.05, s * 0.9, { facing: -1, flap: Math.PI / 2 });
            }
        } else if (kind === 'cones') {
            art.cone(ctx, x, y, s, this.mask(c, r), { wobble: p.wobble.value * 0.012 });
        } else if (kind === 'hut') {
            art.hut(ctx, x, y, s, { door: clamp(p.door.value, 0, 1), radio: p.radio > 0 });
            if (p.out > 0 && p.door.value > 0.5)
                worker(ctx, x + s * 0.3, by + s * 0.02, s, { wave: this.time * 9 });
            if (p.radio > 0) {
                const k = (this.time * 1.4) % 1;
                sparkle(
                    ctx,
                    x + s * (0.6 + k * 0.12),
                    by - s * (0.3 + k * 0.25),
                    s * 0.02 * (1 - k),
                    '#FBF6EE'
                );
            }
        } else if (kind === 'roller') {
            art.roller(ctx, cx, by, s * 0.92, { facing: p.facing, roll: p.roll, glow: this.beaconGlow(p) });
        } else if (kind === 'dozer') {
            const push = clamp(p.push.value, 0, 1) * s * 0.22 * p.facing;
            bulldozer(ctx, cx + push, by, s * MACHINE_K, {
                facing: p.facing,
                lift: clamp(p.blade.value, 0, 1),
                load: p.push.value > 0.3 ? 0.5 : 0,
                loadColour: SITE.sand,
                travel: p.travel,
                beacon: this.beaconGlow(p),
            });
        } else if (kind === 'lamp') {
            art.lamp(ctx, x, y, s, { on: clamp(p.light.value, 0, 1) });
        }
        ctx.restore();
    }

    // The truck and the roller out on the road, over everything standing.
    drawAbove(ctx) {
        const s = this.cell;
        for (const row of this.cells) {
            for (const p of row) {
                if (!p || !p.trip || p.trip.x === undefined) continue;
                const x = this.bx + p.trip.x;
                const y = this.by + p.trip.y + s * 0.3;
                if (p.kind === 'truck') {
                    if (p.trip.dog)
                        dog(ctx, x - p.facing * s * 0.55, y, s, { facing: p.facing, run: this.time * 14 });
                    dumpTruck(ctx, x, y, s * MACHINE_K, {
                        facing: p.facing,
                        tip: clamp(p.tip.value, 0, 1),
                        load: p.load,
                        loadColour: p.loadColour,
                        roll: p.roll,
                        beacon: this.beaconGlow(p),
                    });
                } else {
                    art.roller(ctx, x, y, s * 0.85, {
                        facing: p.facing,
                        roll: p.roll,
                        glow: this.beaconGlow(p),
                    });
                    if (p.trip.cat)
                        cat(ctx, x - p.facing * s * 0.12, y - s * 0.47, s * 0.8, { facing: p.facing });
                }
            }
        }
    }

    // What is lit at night: windows, the hut, the lamps and the pools of ground they light, the
    // machines' beacons; moths at the lamps; the stars.
    drawNight(ctx) {
        const s = this.cell;
        const k = this.night;
        const glowCol = (alpha) => `rgba(255, 226, 154, ${alpha * k})`;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.cells[r][c];
                if (!p || p.away) continue;
                const { x, y } = this.cellRect(c, r);
                const by = y + s * 0.84;
                if (p.kind === 'lamp' && p.on) {
                    const head = { x: x + s / 2, y: by - s * 0.7 };
                    ctx.globalCompositeOperation = 'screen';
                    ellipse(ctx, x + s / 2, by - s * 0.02, s * 0.95, s * 0.5);
                    ctx.fillStyle = `rgba(150, 105, 35, ${0.32 * k})`;
                    ctx.fill();
                    ellipse(ctx, x + s / 2, by - s * 0.02, s * 0.55, s * 0.28);
                    ctx.fillStyle = `rgba(170, 120, 40, ${0.38 * k})`;
                    ctx.fill();
                    ctx.globalCompositeOperation = 'source-over';
                    disc(ctx, head.x, head.y + s * 0.0, s * 0.16, glowCol(0.3));
                    fillRound(
                        ctx,
                        head.x - s * 0.075,
                        head.y - s * 0.04,
                        s * 0.15,
                        s * 0.09,
                        s * 0.02,
                        glowCol(0.95)
                    );
                    for (let i = 0; i < 3; i++) {
                        const t = this.time * (1.6 + i * 0.3) + i * 2.1 + p.seed;
                        art.moth(
                            ctx,
                            head.x + Math.cos(t) * s * 0.18,
                            head.y - s * 0.02 + Math.sin(t * 1.3) * s * 0.12,
                            s,
                            this.time * 25 + i
                        );
                    }
                } else if (p.kind === 'hut') {
                    fillRound(ctx, x + s * 0.45, by - s * 0.35, s * 0.32, s * 0.18, s * 0.04, glowCol(0.25));
                    fillRound(ctx, x + s * 0.48, by - s * 0.32, s * 0.26, s * 0.12, s * 0.015, glowCol(0.9));
                    if (p.door.value > 0.4)
                        fillRound(
                            ctx,
                            x + s * 0.17,
                            by - s * 0.35,
                            s * 0.12,
                            s * 0.29,
                            s * 0.02,
                            glowCol(0.6)
                        );
                } else if (p.kind === 'plot' && p.step > SET) {
                    art.windowsLit(ctx, x, y, s, p.step - SET, glowCol);
                } else if (MACHINES.indexOf(p.kind) >= 0 && !p.trip) {
                    this.beaconAt(ctx, p, x + s / 2, by, s);
                }
            }
        }
        // The truck and the roller out on the road.
        for (const row of this.cells) {
            for (const p of row) {
                if (p && p.trip && p.trip.x !== undefined)
                    this.beaconAt(ctx, p, this.bx + p.trip.x, this.by + p.trip.y + s * 0.3, s);
            }
        }
        this.drawStars(ctx);
    }

    // A machine's beacon, lit over the night: where each drawing puts it.
    beaconAt(ctx, p, cx, by, s) {
        const g = this.beaconGlow(p);
        if (g < 0.05) return;
        let at;
        if (p.kind === 'crane') at = { x: cx, y: by - s * 0.84 - s * p.mast.value - s * 0.17 };
        else if (p.kind === 'mixer') at = { x: cx + p.facing * s * 0.25, y: by - s * 0.41 };
        else if (p.kind === 'roller') at = { x: cx - p.facing * s * 0.13, y: by - s * 0.52 };
        else {
            const local = { digger: [0.05, -0.725], truck: [0.295, -0.575], dozer: [-0.235, -0.655] }[p.kind];
            const push = p.kind === 'dozer' ? clamp(p.push.value, 0, 1) * s * 0.22 * p.facing : 0;
            at = toWorld(cx + push, by, s * MACHINE_K, { facing: p.facing }, local[0], local[1]);
        }
        disc(ctx, at.x, at.y, s * 0.07, `rgba(255, 214, 140, ${0.25 * g})`);
        disc(ctx, at.x, at.y, s * 0.025, `rgba(255, 226, 160, ${0.9 * g})`);
    }

    // A piece away from the board: in the tray, in a finger, or flying back.
    drawLoose(ctx, p, x, y, s) {
        const kind = p.kind;
        const cx = x + s / 2;
        const by = y + s * 0.84;
        if (kind === 'road') {
            fillRound(ctx, x + s * 0.08, y + s * 0.1, s * 0.84, s * 0.84, s * 0.2, GROUND.roadEdge);
            fillRound(ctx, x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, s * 0.18, GROUND.road);
            for (let i = 0; i < 3; i++)
                fillRound(
                    ctx,
                    x + s * (0.2 + i * 0.24),
                    y + s * 0.49,
                    s * 0.12,
                    s * 0.03,
                    s * 0.01,
                    GROUND.roadLine
                );
        } else if (kind === 'plot') {
            art.plotMarked(ctx, x, y, s, 0, 0);
        } else if (kind === 'pile') art.pile(ctx, x, y, s, 2);
        else if (kind === 'digger')
            digger(ctx, cx - s * 0.12, by, s * 0.66, { boom: -0.9, stick: 1.6, bucket: 0.2 });
        else if (kind === 'truck') dumpTruck(ctx, cx, by, s * 0.8, {});
        else if (kind === 'mixer') art.mixer(ctx, cx, by, s * 0.9, { drum: 0.6 });
        else if (kind === 'crane')
            art.crane(ctx, x - s * 0.02, y + s * 0.44, s * 0.6, { swing: 1, trolley: 0.6, drop: 0.5 });
        else if (kind === 'cones') art.cone(ctx, x, y, s, 0, {});
        else if (kind === 'hut') art.hut(ctx, x, y, s, {});
        else if (kind === 'roller') art.roller(ctx, cx, by, s * 0.9, {});
        else if (kind === 'dozer') bulldozer(ctx, cx - s * 0.04, by, s * 0.8, { lift: 1 });
        else if (kind === 'lamp') art.lamp(ctx, x, y, s, { on: 0 });
    }
}

function hedgehogAt(ctx, x, y, s, facing, t) {
    art.hedgehog(ctx, x, y, s * 2.4, { facing, step: t * 12 });
}

function icon(ctx, x, y, w, h) {
    const s = Math.min(w, h) * 0.42;
    const cx = x + w / 2;
    const cy = y + h / 2;
    fillRound(ctx, cx - s * 1.08, cy - s * 0.8 + 4, s * 2.16, s * 1.6, s * 0.18, 'rgba(112, 84, 58, 0.14)');
    fillRound(ctx, cx - s * 1.08, cy - s * 0.8, s * 2.16, s * 1.6, s * 0.18, GROUND.earth);
    fillRound(ctx, cx - s * 1.08, cy + s * 0.2, s * 2.16, s * 0.3, s * 0.1, GROUND.road);
    for (let i = 0; i < 4; i++)
        fillRound(
            ctx,
            cx - s * 0.95 + i * s * 0.52,
            cy + s * 0.34,
            s * 0.24,
            s * 0.03,
            s * 0.01,
            GROUND.roadLine
        );
    const k = s * 0.95;
    art.building(ctx, cx + s * 0.08, cy - s * 0.9, k, 2, false, false, {});
    art.crane(ctx, cx - s * 0.9, cy - s * 0.5, k * 0.62, { swing: 1, trolley: 0.55, drop: 0.35 });
    dumpTruck(ctx, cx - s * 0.45, cy + s * 0.62, k * 0.6, { load: 1, loadColour: SITE.earth });
}

export const toy = {
    id: 'site',
    title: 'Building site',
    about: 'Build a site from tiles. Its machines work together: the digger digs, the truck carries, the mixer pours and the crane builds, a floor at a time.',
    stages: ['a small site, 6 kinds of piece', 'a bigger site, 9 kinds', 'the biggest site, all 12 kinds'],
    mat: '#E6E0D5',
    icon,
    create: (app) => new SiteScene(app),
    sounds() {
        const list = [
            ['pat', {}],
            ['crunch', {}],
            ['crunch', { seed: 3 }],
            ['rumble', {}],
            ['rumble', { variant: 'short' }],
            ['rattle', {}],
            ['rattle', { seed: 2 }],
            ['rattle', { seed: 3 }],
            ['hiss', {}],
            ['slosh', {}],
            ['slosh', { seed: 4 }],
            ['whistle', {}],
            ['whistle', { variant: 'long' }],
            ['putt', {}],
            ['creak', {}],
            ['latch', {}],
            ['click', { variant: 'on' }],
            ['click', { variant: 'off' }],
            ['gulp', { f: 220 }],
            ['meow', { f: noteHz(6, 60) }],
            ['meow', { f: noteHz(5, 60) }],
            ['woof', {}],
            ['chirp', {}],
            ['chirp', { variant: 'peep', f: noteHz(0, 84) }],
            ['squeak', { f: 2600 }],
            ['squeak', { f: 1400 }],
            ['whoosh', { variant: 'up' }],
            ['whoosh', { variant: 'down' }],
            ['tick', { f: noteHz(5, 72) }],
            ['tick', { f: noteHz(3, 72) }],
            ['toot', { f: noteHz(0, 60) }],
            ['beep', { f: noteHz(4, 72) }],
            ['beep', { f: noteHz(2, 72) }],
        ];
        for (const f of FLOORS) {
            list.push(['wood', { f: noteHz(f.degree, 60) }], ['clank', { f: noteHz(f.degree, 60) }]);
        }
        list.push(
            ['clank', { f: noteHz(0, 60) }],
            ['clank', { f: noteHz(2, 60) }],
            ['clank', { f: noteHz(5, 60) }]
        );
        for (let d = 5; d <= 14; d++) list.push(['wood', { f: noteHz(d, 60) }]);
        for (let d = 5; d <= 11; d++) list.push(['marimba', { f: noteHz(d, 60) }]);
        for (let d = 3; d <= 10; d++) list.push(['musicBox', { f: noteHz(d, 60) }]);
        for (const d of [5, 7, 9, 10]) list.push(['glock', { f: noteHz(d, 72) }]);
        for (let i = 0; i < 3; i++) list.push(['pop', { f: 500 + i * 50 }]);
        for (const d of [4, 2, 0]) list.push(['chime', { f: noteHz(d, 48) }]);
        return list;
    },
    signature() {
        audio.note('beep', 4, 72, { gain: 0.5, delay: 0.05 });
        audio.note('beep', 4, 72, { gain: 0.5, delay: 0.37 });
    },
};
