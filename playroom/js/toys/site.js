// The building site: an island of earth to build a site on, a tile at a time, and a tray of pieces
// to build it with.
//
// The farm's board and the farm's grammar (board.js): an empty table to start, tiles of earth put
// down on it make the island bigger, a road or a plot put down on a tile changes it, and pieces are
// dragged from the tray, snap to a tile, move, swap and go back. Unlike the farm's, the site's
// board is layered: its pieces stand on the ground rather than taking its place, so a truck put
// down on a road stands on the road, and the road is still there when it drives off. They stand
// only on flat ground, earth or road. A plot is for building on, and a machine put down there goes
// back where it came from.
//
// The machines work in chains, a step at a time, and each step is one machine's job:
//   - a building: a plot is marked out with pegs and string; the digger digs it out a tile at a
//     time; the crane lowers the forms into the hole; the mixer pours the concrete into the forms,
//     where it sets; and the crane lifts the building onto the foundation, a floor at a time, each
//     floor a note higher and the next of the playroom's colours, until it is topped out with a
//     little tree;
//   - at Bloom, a road: marked out with a string down its middle, the bulldozer scrapes it into a
//     dirt road, the roller rolls the bumps flat, and the paver lays the asphalt;
//   - and the earth that comes out of a hole always has somewhere to go: into a truck beside the
//     digger, which drives it to the edge of the site and tips it over, or onto a pile; at Bloom the
//     bulldozer pushes a pile into a hole the digger has dug, or over the edge if there is none to
//     reach, and the roller rolls the filled hole flat.
// None of it is a goal. A machine with nothing to do answers a tap anyway, with its engine and a
// little of its work, and a building is finished only when it is as tall as the crane can reach.
//
// Every piece does three things, as on the farm:
//   - it connects: roads join, and plots join plots at the same step, so two buildings side by
//     side are one wide building; each machine works the pieces beside it, or the road it is on;
//   - it reacts to a tap: the digger digs, the truck takes its load away, the mixer turns, the
//     crane lifts, the cones wobble down the line, a building plays its floors from the ground up;
//   - it hides something: pigeons on the road, a bone at the bottom of a hole, a cat's paws across
//     wet concrete, a worm in the pile, a hedgehog behind the cones, a radio in the hut, moths at
//     the lamp, a bird that nests on the crane, ducks that cross a new road.
//
// The foreman's hut holds the whistle: a tap, and every machine on the site has a go, one after
// another. The sun in the corner turns day to night: the windows light, the beacons turn, and the
// work lamps light the ground around them.
//
//   touch  - tap anything: every piece answers.
//   move   - drag tiles and pieces from the tray, and around the island.
//   make   - a site that works: dig, carry, pour and build, and lay a road.

import { fillRound, disc, ellipse, makeLayer } from '../draw.js';
import { Spring, clamp, lerp, TAU, shade, hexToRgb, rgbString } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { BoardScene, SIDES, N, E, S, W, key, FOOT } from './board.js';
import * as iso from './iso.js';
import { cat, bird, dog, sparkle } from './farmart.js';
import { SITE, worker, digger, dumpTruck, bulldozer, diggerSolve, toWorld, stripes } from './machines.js';
import { drawDuck } from './paradeart.js';
import { route, walk } from './routes.js';
import * as art from './siteart.js';

const { GROUND, FLOORS, FLOOR, FORMS_H } = art;

// What lies flat on a tile: a road, a plot, and a hole filled back in. Everything else stands on
// the ground, and only on flat ground: bare earth, or a road.
const FLAT = ['road', 'plot', 'fill'];

// The machines that machines.js draws, at their size on a tile, and the crane's mast at its least,
// in tile widths.
const MACHINE_K = 0.62;
const CRANE_MAST = 0.92;
// How far down its frame each upright piece's drawing begins, for touching it (machines: 0.35).
const REACH = { plot: 0, crane: 0, hut: 0.42, pile: 0.5, cones: 0.45, lamp: 0.12 };
const MACHINES = ['digger', 'truck', 'mixer', 'crane', 'roller', 'dozer', 'paver'];

// A plot's steps: marked out with pegs and string, dug, the forms in, poured, set; then a building,
// a floor a step.
const MARKED = 0;
const DUG = 1;
const FORMED = 2;
const POURED = 3;
const SET = 4;

// A road's steps at Bloom, each the next machine's work: marked out, scraped to dirt by the
// bulldozer, rolled flat by the roller, and paved by the paver. At Seed and Sprout, with none of
// those machines in the tray, a road is put down paved.
const ROADWORK = {
    dozer: ['marked', 'dirt'],
    roller: ['dirt', 'rolled'],
    paver: ['rolled', 'paved'],
};

// How fast each machine drives, in tiles a second; and how much more a tile of bare earth costs
// a truck than a tile of road, so it keeps to the road where there is one.
const SPEED = { truck: 1.9, dozer: 1.0, roller: 1.1, paver: 0.8 };
const OFFROAD = 1.6;

// The lumps of a filled hole, across its tile, and how big each is.
const LUMPS = [
    [0.3, 0.32, 1],
    [0.64, 0.28, 0.8],
    [0.47, 0.52, 1.2],
    [0.74, 0.6, 0.9],
    [0.3, 0.7, 0.85],
    [0.58, 0.78, 0.7],
];

// What each stage puts in the tray, how big the table is, how tall the crane can build, and how a
// road is put down.
const PLANS = [
    {
        cols: 5,
        rows: 4,
        kinds: ['earth', 'road', 'plot', 'digger', 'truck', 'crane', 'mixer'],
        floors: 3,
        road: 'paved',
    },
    {
        cols: 6,
        rows: 5,
        kinds: ['earth', 'road', 'plot', 'pile', 'digger', 'truck', 'crane', 'mixer', 'cones', 'hut'],
        floors: 4,
        road: 'paved',
    },
    {
        cols: 7,
        rows: 5,
        kinds: [
            'earth',
            'road',
            'plot',
            'pile',
            'digger',
            'truck',
            'crane',
            'mixer',
            'dozer',
            'roller',
            'paver',
            'cones',
            'hut',
            'lamp',
        ],
        floors: 4,
        road: 'marked',
    },
];

// When the foreman's whistle sets each kind of machine going, in seconds: the work of a site in
// order, the truck waiting until the digger has loaded it.
const WORK_ORDER = [
    ['digger', 0],
    ['crane', 0.5],
    ['mixer', 1.1],
    ['truck', 2.4],
    ['dozer', 3.0],
    ['roller', 3.8],
    ['paver', 4.6],
];

// The radio's tune: a phrase on the scale, as degrees from C5, with rests as nulls.
const TUNE = [5, 7, 8, 7, 5, null, 3, 5, 7, null, 8, 9, 10];

class SiteScene extends BoardScene {
    constructor(app) {
        super(app, PLANS, 'earth');
        this.maxFloors = this.plan.floors;
        this.look = {
            sky: GROUND.sky,
            table: 'rgba(255, 252, 244, 0.42)',
            tableLine: 'rgba(170, 145, 110, 0.3)',
            base: GROUND.earth,
            alt: GROUND.earthAlt,
            lip: GROUND.edge,
            lipDark: shade(GROUND.edge, -0.1),
            side: SITE.earth,
            sideDark: shade(SITE.earth, -0.12),
            deep: SITE.earthDeep,
            deepDark: shade(SITE.earthDeep, -0.12),
            dust: '226, 210, 180',
        };
        this.workId = 0;
        // Road tiles a machine has worked since the ground was last drawn, drawn over it each frame
        // until the work is done: drawing the whole ground again for each tile costs an old iPad
        // more than a frame.
        this.relaid = new Set();
        this.begin();
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
            p.state = this.plan.road;
            p.twang = new Spring(0, 900, 5);
            p.steam = 0;
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
        } else if (kind === 'fill') {
            p.flat = new Spring(0, 140, 13);
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
            p.lit = false;
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
                // The jib's heading on the ground, in radians (0 down the column, a quarter turn down
                // the row), the trolley from the mast out to the jib's end, the hook below the jib, and
                // the mast's height, all in tile widths.
                p.slew = new Spring(-Math.PI / 2, 22, 8);
                p.trolley = new Spring(0.6, 30, 9);
                p.drop = new Spring(0.3, 30, 9);
                p.mast = new Spring(CRANE_MAST, 20, 9);
                p.carry = null;
            }
            if (kind === 'dozer') {
                p.blade = new Spring(1, 90, 10);
                p.push = new Spring(0, 40, 9);
            }
            if (kind === 'paver') p.screed = new Spring(1, 90, 10);
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

    // Pieces stand on the ground, and only on flat ground: bare earth, or a road.
    layered() {
        return true;
    }

    standsOn(kind, ground) {
        return !ground || ground.kind === 'road';
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

    // Move plots on to a step.
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

    // A plot beside (c, r) that passes `test`.
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

    isHole(c, r) {
        const p = this.at(c, r);
        return !!p && p.kind === 'plot' && p.step === DUG;
    }

    // Which way to face, across the screen, to look from (c, r) at a tile beside it: down the column
    // is to the right, down the row to the left.
    facingTo(c, r, cell, otherwise) {
        if (!cell) return otherwise;
        const across = cell[0] - c - (cell[1] - r);
        return across ? (across > 0 ? 1 : -1) : otherwise;
    }

    // A picked-up machine stops what it was doing; a digger keeps hold of what is in its bucket.
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
    // Where machines can go: across flat ground with nothing standing on it, from tile to tile.

    // Ground a machine can drive onto: land, bare or road, and nothing else standing there but,
    // perhaps, `self`.
    open(c, r, self) {
        if (!this.isLand(c, r)) return false;
        const p = this.at(c, r);
        if (!p || p === self) return true;
        if (this.isGround(p.kind)) return p.kind === 'road';
        return false;
    }

    // The sides of a tile that are the island's edge, the front ones first: what goes over the front
    // falls in sight.
    openSides(c, r) {
        const out = [];
        for (const [dc, dr] of [
            [1, 0],
            [0, 1],
            [-1, 0],
            [0, -1],
        ])
            if (!this.isLand(c + dc, r + dr)) out.push([dc, dr]);
        return out;
    }

    // The way for something at (c, r) to the edge of the site, over flat, empty ground, to an edge
    // at the front if it can and the back if it must. `self` is what is going; `not` a tile it may
    // not cross. A truck keeps to the roads.
    wayToEdge(from, self, not, roads = false) {
        const enter = (c, r) => !(not && c === not[0] && r === not[1]) && this.open(c, r, self);
        const cost = roads ? (c, r) => (this.is(c, r, 'road') ? 1 : OFFROAD) : undefined;
        const front = (c, r) => enter(c, r) && this.openSides(c, r).some(([dc, dr]) => dc > 0 || dr > 0);
        const any = (c, r) => enter(c, r) && this.openSides(c, r).length > 0;
        return route(from, front, enter, cost) || route(from, any, enter, cost);
    }

    // The side of the edge tile at the end of `way` to go over: at the front, and straight on if
    // that is the edge.
    overSide(way) {
        const [c, r] = way[way.length - 1];
        const sides = this.openSides(c, r);
        if (way.length > 1) {
            const [pc, pr] = way[way.length - 2];
            const on = sides.find(([dc, dr]) => dc === c - pc && dr === r - pr);
            if (on && (on[0] > 0 || on[1] > 0)) return on;
        }
        return sides[0];
    }

    // A machine sets off: along `points`, at its speed, doing what `stops` says on the points it
    // names, and home.
    trip(p, points, speed) {
        const s = this.cell;
        p.trip = {
            points,
            d: 0,
            speed,
            beat: 0,
            last: -1,
            dir: null,
            pause: 0,
            stops: {},
            x: (points[0][0] + 0.5) * s,
            y: (points[0][1] + 0.5) * s,
        };
        p.away = 'trip';
        return p.trip;
    }

    //--------------------------------------------------------------------------
    // The ground: roads, drawn once into the layer. Plots and filled holes change too often for
    // that, and are drawn each frame under everything standing.

    paintGround(ctx) {
        const s = this.cell;
        for (const [c, r] of this.tiles()) {
            for (let i = 0; i < 4; i++) {
                const n = (c * 7 + r * 13 + i * 29) % 37;
                disc(
                    ctx,
                    c * s + s * (0.12 + ((n * 0.37) % 0.76)),
                    r * s + s * (0.15 + ((n * 0.53) % 0.7)),
                    s * 0.012,
                    GROUND.speck
                );
            }
        }
        this.paintRoads(ctx);
    }

    drawGround() {
        if (this.relaid) this.relaid.clear();
        super.drawGround();
    }

    // The roads, each tile in its own surface and joined to the road beside it, whatever that one's
    // surface: half a strip from each tile's middle out to each side it joins, so one surface ends
    // just where the next begins. With `only`, a set of tiles' keys, just those tiles, and the
    // dashes into them.
    paintRoads(ctx, only) {
        const s = this.cell;
        const every = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const g = this.floorAt(c, r);
                if (g && g.kind === 'road') every.push({ c, r, g, m: this.mask(c, r, 'road') });
            }
        }
        const roads = only ? every.filter((t) => only.has(key(t.c, t.r))) : every;
        const halves = (list, offset, each) => {
            for (const { c, r, m } of list) {
                const x = (c + 0.5) * s;
                const y = (r + 0.5) * s;
                for (const [dc, dr, bit] of SIDES) {
                    if (!(m & bit)) continue;
                    // Across the strip: offset to one side of its middle.
                    const ox = -dr * offset;
                    const oy = dc * offset;
                    each(x + ox, y + oy, x + ox + dc * s * 0.5, y + oy + dr * s * 0.5);
                }
            }
        };
        const strip = (list, width, colour) => {
            ctx.lineWidth = width;
            ctx.strokeStyle = colour;
            ctx.lineCap = 'butt';
            for (const { c, r } of list) disc(ctx, (c + 0.5) * s, (r + 0.5) * s, width / 2, colour);
            ctx.beginPath();
            halves(list, 0, (x0, y0, x1, y1) => {
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
            });
            ctx.stroke();
        };
        const lines = (list, offset, width, colour) => {
            ctx.lineWidth = width;
            ctx.strokeStyle = colour;
            ctx.lineCap = 'round';
            ctx.beginPath();
            halves(list, offset, (x0, y0, x1, y1) => {
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
            });
            ctx.stroke();
        };
        const of = (state) => roads.filter((t) => t.g.state === state);

        // Marked out: a pale strip, with a string down its middle on a peg in each tile.
        const marked = of('marked');
        strip(marked, s * 0.56, GROUND.plot);
        lines(marked, 0, Math.max(1, s * 0.012), GROUND.string);
        for (const { c, r } of marked) {
            const x = (c + 0.5) * s;
            const y = (r + 0.5) * s;
            fillRound(ctx, x - s * 0.018, y - s * 0.07, s * 0.036, s * 0.08, s * 0.01, GROUND.peg);
            disc(ctx, x, y - s * 0.07, s * 0.02, GROUND.string);
        }

        // Dirt: a strip of bare scraped earth, two ruts along it and clods.
        const dirt = of('dirt');
        strip(dirt, s * 0.62, GROUND.dirtEdge);
        strip(dirt, s * 0.54, GROUND.dirt);
        for (const offset of [-0.12, 0.12]) lines(dirt, s * offset, Math.max(1, s * 0.028), GROUND.rut);
        for (const { c, r } of dirt) {
            for (let i = 0; i < 4; i++) {
                const n = (c * 11 + r * 7 + i * 23) % 19;
                disc(
                    ctx,
                    (c + 0.3 + ((n * 0.21) % 0.4)) * s,
                    (r + 0.3 + ((n * 0.37) % 0.4)) * s,
                    s * (0.018 + (n % 3) * 0.006),
                    i % 2 ? GROUND.clod : GROUND.dirtEdge
                );
            }
        }

        // Rolled: the same earth pressed smooth and pale, a sheen along it.
        const rolled = of('rolled');
        strip(rolled, s * 0.62, GROUND.rolledEdge);
        strip(rolled, s * 0.54, GROUND.rolled);
        lines(rolled, 0, s * 0.14, GROUND.rolledLight);

        // Paved: asphalt, with a dashed line down it wherever it runs on into more of the same.
        const paved = of('paved');
        strip(paved, s * 0.62, GROUND.roadEdge);
        strip(paved, s * 0.54, GROUND.road);
        ctx.save();
        ctx.setLineDash([s * 0.09, s * 0.09]);
        ctx.lineWidth = Math.max(1, s * 0.028);
        ctx.strokeStyle = GROUND.roadLine;
        ctx.lineCap = 'butt';
        const isPaved = (c, r) => {
            const g = this.floorAt(c, r);
            return !!g && g.kind === 'road' && g.state === 'paved';
        };
        const mine = (c, r) => !only || only.has(key(c, r));
        for (const { c, r, m, g } of every) {
            if (g.state !== 'paved') continue;
            const x = this.bx + (c + 0.5) * s;
            const y = this.by + (r + 0.5) * s;
            const east = m & E && isPaved(c + 1, r) && (mine(c, r) || mine(c + 1, r));
            const south = m & S && isPaved(c, r + 1) && (mine(c, r) || mine(c, r + 1));
            if (east) {
                ctx.lineDashOffset = -c * s;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + s, y);
                ctx.stroke();
            }
            if (south) {
                ctx.lineDashOffset = -r * s;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + s);
                ctx.stroke();
            }
            if (!m && mine(c, r)) {
                ctx.lineDashOffset = 0;
                ctx.beginPath();
                ctx.moveTo(x - s * 0.14, y);
                ctx.lineTo(x + s * 0.14, y);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    //--------------------------------------------------------------------------
    // Time

    updatePiece(p, c, r, dt) {
        if (p.under) this.updatePiece(p.under, c, r, dt);
        p.bounce.update(dt);
        for (const name of [
            'pop',
            'twang',
            'slide',
            'wobble',
            'door',
            'light',
            'act',
            'tip',
            'pour',
            'flat',
            'screed',
        ]) {
            if (p[name]) p[name].update(dt);
        }
        if (p.kind === 'road') {
            if (p.steam > 0) p.steam -= dt;
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
            p.slew.update(dt);
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
            const q = this.center(cc, rr);
            this.sparkleAt(q.x, q.y - this.cell * 0.12);
        }
    }

    // A machine out on the site: along its points at its speed, doing what its trip does at each
    // point it comes to, and home again.
    drive(p, c, r, dt) {
        const trip = p.trip;
        const s = this.cell;
        if (trip.pause > 0) {
            trip.pause -= dt;
            if (trip.drop) this.dropping(trip, dt);
            return;
        }
        trip.d = Math.min(trip.points.length - 1, trip.d + dt * trip.speed);
        p.travel += dt * trip.speed * s;
        p.roll += dt * trip.speed * 5 * p.facing;
        const slow = p.kind !== 'truck';
        trip.beat -= dt;
        if (trip.beat <= 0) {
            trip.beat = slow ? 0.24 : 0.17;
            audio.play(
                'putt',
                {},
                { gain: 0.7, pan: this.pan(this.toScreen(trip.x, trip.y).x), rate: slow ? 0.8 : 1 }
            );
        }
        const i = Math.floor(trip.d);
        if (i >= trip.points.length - 1) {
            // Home.
            p.trip = null;
            p.away = null;
            p.bounce.kick(8);
            if (p.kind === 'dozer' || p.kind === 'paver')
                p[p.kind === 'dozer' ? 'blade' : 'screed'].target = 1;
            const pan = this.pan(this.center(c, r).x);
            if (p.kind === 'truck') audio.note('beep', 4, 72, { gain: 0.8, pan });
            else audio.note('toot', 0, 60, { gain: 0.7, pan });
            if (trip.done) trip.done();
            return;
        }
        const k = trip.d - i;
        const [ac, ar] = trip.points[i];
        const [bc, br] = trip.points[i + 1];
        trip.x = (lerp(ac, bc, k) + 0.5) * s;
        trip.y = (lerp(ar, br, k) + 0.5) * s;
        // Backing up, it still faces the way it came.
        if (!trip.backing) p.facing = this.facingTo(ac, ar, [bc, br], p.facing);
        if (i === trip.last) return;
        // Arriving on a tile.
        trip.last = i;
        const pan = this.pan(this.toScreen(trip.x, trip.y).x);
        const dir = [bc - ac, br - ar];
        const beeps = p.kind === 'truck' || p.kind === 'dozer';
        if (beeps && trip.dir && dir[0] === -trip.dir[0] && dir[1] === -trip.dir[1]) {
            // Backing up the way it came.
            audio.note('beep', 2, 72, { gain: 0.6, pan });
            audio.note('beep', 2, 72, { gain: 0.6, pan, delay: 0.3 });
        }
        if (dir[0] || dir[1]) trip.dir = dir;
        if (trip.arrive) trip.arrive(ac, ar, trip);
        if (trip.stops[i]) trip.stops[i]();
    }

    //--------------------------------------------------------------------------
    // Sounds

    // Each kind's own sound, for being placed, or tapped in the tray.
    voice(kind, x, gain) {
        const pan = this.pan(x);
        if (kind === 'road') {
            if (this.plan.road === 'marked') {
                audio.play('pat', {}, { gain: gain * 0.8, pan });
                audio.note('musicBox', 8, 60, { gain: gain * 0.35, pan, delay: 0.05 });
            } else audio.play('crunch', {}, { gain: gain * 0.6, pan });
        } else if (kind === 'plot') {
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
        else if (kind === 'fill') audio.play('crunch', {}, { gain: gain * 0.6, pan });
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
        if (kind === 'road') this.tapRoad(c, r, piece, p.x, p.y);
        else if (kind === 'plot') this.tapPlot(c, r, piece, p.x, p.y);
        else if (kind === 'fill') this.tapFill(c, r, piece, p.x, p.y);
        else if (kind === 'pile') this.tapPile(c, r, piece);
        else if (kind === 'digger') this.tapDigger(c, r, piece);
        else if (kind === 'truck') this.tapTruck(c, r, piece);
        else if (kind === 'mixer') this.tapMixer(c, r, piece);
        else if (kind === 'crane') this.tapCrane(c, r, piece);
        else if (kind === 'cones') this.tapCones(c, r);
        else if (kind === 'hut') this.tapHut(c, r, piece);
        else if (kind === 'roller') this.tapRoller(c, r, piece);
        else if (kind === 'dozer') this.tapDozer(c, r, piece);
        else if (kind === 'paver') this.tapPaver(c, r, piece);
        else if (kind === 'lamp') this.tapLamp(c, r, piece);
    }

    // The bare ground: a little dust.
    tapEmpty(c, r, p) {
        this.puff(p.x, p.y, 0.6, '226, 210, 180');
        audio.play('pat', {}, { gain: 0.4, pan: this.pan(p.x) });
    }

    //--------------------------------------------------------------------------
    // Roads: the string of a marked one plucked, a crunch underfoot on dirt and asphalt, and pigeons
    // who come down to see what fell.

    tapRoad(c, r, road, x, y) {
        const pan = this.pan(x);
        if (road.state === 'marked') {
            for (const [cc, rr] of this.component(c, r, 'road')) {
                const g = this.floorAt(cc, rr);
                if (g.state === 'marked') g.twang.kick(30);
            }
            audio.note('musicBox', 5 + ((c + r) % 5), 60, { gain: 0.6, pan });
            return;
        }
        if (road.state === 'rolled') audio.play('pat', {}, { gain: 0.5, pan });
        else audio.play('crunch', {}, { gain: 0.5, pan });
        this.puff(x, y, 0.7, road.state === 'dirt' ? '206, 178, 140' : '226, 218, 204');
        if (this.surprise('pigeons', 0.6)) this.pigeons(c, r);
    }

    pigeons(c, r) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const life = 4.2;
        [0, 1].forEach((i) => {
            const land = this.spot(c, r, 0.32 + i * 0.36, 0.5 + i * 0.12);
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
    // Plots: pegs and string, then a hole, forms, wet concrete, a foundation, and a building.

    tapPlot(c, r, p, x, y) {
        const pan = this.pan(x);
        if (p.step === MARKED) {
            // The string between the pegs, plucked.
            for (const [cc, rr] of this.group(c, r)) this.at(cc, rr).twang.kick(30);
            audio.note('musicBox', 5 + ((c + r) % 5), 60, { gain: 0.6, pan });
        } else if (p.step === DUG) {
            audio.play('crunch', { seed: 3 }, { gain: 0.5, pan });
            this.puff(x, y, 0.5, '190, 160, 130');
            // Something at the bottom of the hole.
            const deep = this.center(c, r);
            deep.y += this.tw * 0.1;
            if (!p.find && this.surprise('bone', 0.5)) {
                p.find = true;
                this.later(0.2, () => audio.note('glock', 9, 72, { gain: 0.45, pan, wet: 0.4 }));
                this.sparkleAt(deep.x, deep.y, 0.2);
            } else if (p.find) {
                audio.note('glock', 7, 72, { gain: 0.35, pan, wet: 0.4 });
                this.sparkleAt(deep.x, deep.y);
            }
        } else if (p.step === FORMED) {
            // A knock on the boards.
            audio.note('wood', 3 + ((c + r) % 4), 60, { gain: 0.7, pan });
            audio.note('wood', 3 + ((c + r) % 4), 60, { gain: 0.45, pan, delay: 0.16 });
        } else if (p.step === POURED) {
            // A hand pressed into wet concrete leaves its print.
            if (p.prints.length >= 4) p.prints.shift();
            const g = this.gridAt(x, y);
            p.prints.push({
                x: clamp(g.u - c, 0.2, 0.8),
                y: clamp(g.v - r, 0.25, 0.8),
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

    // A hole filled back in: loose earth, which crunches.
    tapFill(c, r, p, x, y) {
        audio.play('crunch', { seed: 3 }, { gain: 0.55, pan: this.pan(x) });
        this.puff(x, y, 0.7, '206, 178, 140');
    }

    //--------------------------------------------------------------------------
    // The pile: earth that slides, and a worm who lives in it.

    tapPile(c, r, p) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        p.slide.kick(12);
        audio.play('rumble', { variant: 'short' }, { gain: 0.55, pan: this.pan(rect.x) });
        this.puff(rect.x + s * 0.5, rect.y + s * FOOT, 0.8, '206, 178, 140');
        if (p.worm <= 0 && this.surprise('worm', 0.6)) {
            p.worm = 3.5;
            this.later(0.3, () => audio.play('squeak', { f: 2600 }, { gain: 0.3, pan: this.pan(rect.x) }));
        }
    }

    // A pile grows by a load, up to three; taken from, it shrinks, and with nothing left it is gone.
    takeFromPile(c, r) {
        const pile = this.at(c, r);
        if (!pile || pile.kind !== 'pile') return false;
        pile.size--;
        pile.slide.kick(8);
        if (pile.size <= 0) {
            this.cells[r][c] = pile.under || null;
            const q = this.center(c, r);
            this.puff(q.x, q.y, 1, '206, 178, 140');
        }
        return true;
    }

    //--------------------------------------------------------------------------
    // The digger: it digs out a marked plot beside it, one tile at a time, and the earth goes into
    // a truck beside it, onto a pile beside it, or onto bare earth beside it as a new pile. With
    // nowhere at all for it, it keeps it in its bucket until there is. With no plot to dig, it loads
    // a truck from a pile beside both; with nothing to do, it scoops at the air.

    tapDigger(c, r, p) {
        if (p.work) return;
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const pan = this.pan(rect.x);
        for (let i = 0; i < 3; i++) audio.play('putt', {}, { gain: 0.7, pan, delay: i * 0.15 });
        audio.play('hiss', {}, { gain: 0.4, pan, delay: 0.3 });
        const id = ++this.workId;
        if (p.load) {
            // Still holding what it dug before: first, somewhere for that.
            const onto = this.dirtTo(c, r);
            if (!onto) {
                p.act.kick(10);
                return;
            }
            p.work = { id, type: 'dump', t: 0, life: 1.3 };
            this.later(0.15, () => {
                if (this.still(p, c, r, id)) p.facing = this.facingTo(c, r, onto.cell, p.facing);
            });
            this.later(0.7, () => {
                if (this.still(p, c, r, id)) this.tipBucket(c, r, p, onto);
            });
            return;
        }
        const plot = this.plotBeside(c, r, (n) => n.step === MARKED);
        const heap = plot ? null : this.pieceBeside(c, r, 'pile');
        const truck = heap ? this.pieceBeside(c, r, 'truck', (n) => !n.trip && !n.load && !n.work) : null;
        const from = plot || (truck ? heap : null);
        // Where the bucket goes in, in the digger's own frame: the middle of the tile it digs.
        let reach = null;
        if (from) {
            const a = this.center(c, r);
            const b = this.center(from[0], from[1]);
            const k = s * MACHINE_K;
            reach = [Math.abs(b.x - a.x) / k, (b.y - a.y) / k];
            p.facing = this.facingTo(c, r, from, p.facing);
        }
        if (!from) {
            // Nothing to dig: a scoop at the air, and the bucket comes up empty.
            p.work = { id, type: 'scoop', t: 0, life: 1.8, reach };
            return;
        }
        let onto = plot ? this.dirtTo(c, r) : { kind: 'truck', cell: truck };
        const turn = onto ? this.facingTo(c, r, onto.cell, p.facing) : p.facing;
        p.work = { id, type: 'dig', t: 0, life: 2.6, reach };
        this.later(0.75, () => {
            if (!this.still(p, c, r, id)) return;
            audio.play('crunch', {}, { gain: 0.8, pan });
            if (plot) {
                const here = this.at(plot[0], plot[1]);
                if (!here || here.kind !== 'plot' || here.step !== MARKED) return;
                // One tile, however many it is joined to: the rest wait for the next tap.
                this.advance([plot], DUG);
                const q = this.center(plot[0], plot[1]);
                this.puff(q.x, q.y, 1, '190, 160, 130');
            } else if (!this.takeFromPile(heap[0], heap[1])) return;
            p.loadColour = SITE.earth;
            p.load = 1;
        });
        this.later(1.35, () => {
            if (this.still(p, c, r, id) && p.load) p.facing = turn;
        });
        // Just before it tips: is there still somewhere for the earth? If not, it keeps it.
        this.later(1.7, () => {
            if (!this.still(p, c, r, id) || !p.load) return;
            if (!onto || !this.stillFor(onto)) onto = this.dirtTo(c, r);
            if (!onto) p.work.keep = true;
            else p.facing = this.facingTo(c, r, onto.cell, p.facing);
        });
        this.later(1.95, () => {
            if (this.still(p, c, r, id) && p.load && onto) this.tipBucket(c, r, p, onto);
        });
        this.later(2.6, () => {
            if (this.at(c, r) === p && this.night < 0.5 && this.surprise('perch', 0.5)) {
                p.bird = 6;
                audio.play('chirp', {}, { gain: 0.45, pan });
            }
        });
    }

    // Where the earth from a digger at (c, r) can go: into an empty truck beside it, onto a pile
    // beside it with room on it, or onto bare earth beside it, as a new pile. Null if nowhere.
    dirtTo(c, r) {
        const truck = this.pieceBeside(c, r, 'truck', (n) => !n.trip && !n.load && !n.work);
        if (truck) return { kind: 'truck', cell: truck };
        const heap = this.pieceBeside(c, r, 'pile', (n) => n.size < 3);
        if (heap) return { kind: 'pile', cell: heap };
        for (const [dc, dr] of SIDES)
            if (this.bare(c + dc, r + dr)) return { kind: 'new', cell: [c + dc, r + dr] };
        return null;
    }

    // Whether where the earth was going is still there to take it.
    stillFor(onto) {
        const [c, r] = onto.cell;
        const p = this.at(c, r);
        if (onto.kind === 'new') return this.bare(c, r);
        if (onto.kind === 'pile') return !!p && p.kind === 'pile' && p.size < 3;
        return !!p && p.kind === 'truck' && !p.trip && !p.load && !p.work;
    }

    // The bucket tipped: into the truck, onto the pile, or onto the ground as a new pile.
    tipBucket(c, r, p, onto) {
        if (!this.stillFor(onto)) onto = this.dirtTo(c, r);
        if (!onto) return;
        const [tc, tr] = onto.cell;
        const pan = this.pan(this.center(tc, tr).x);
        if (onto.kind === 'truck') {
            const truck = this.at(tc, tr);
            truck.load = 1;
            truck.loadColour = p.loadColour;
            truck.bounce.kick(8);
        } else if (onto.kind === 'pile') {
            const pile = this.at(tc, tr);
            pile.size++;
            pile.slide.kick(10);
        } else {
            const pile = this.make('pile');
            pile.size = 1;
            this.put(tc, tr, pile, true);
            pile.slide.kick(12);
        }
        audio.play('rumble', { variant: 'short' }, { gain: 0.6, pan });
        const q = this.center(tc, tr);
        this.puff(q.x, q.y - this.cell * 0.05, 0.8, '206, 178, 140');
        p.load = 0;
    }

    // The digger's arm through its work, as where the bucket is in the digger's own frame (facing
    // right, in its own size) and the bucket's angle. Digging: down into the tile ahead teeth first,
    // a bite, up holding the load, out over where it goes, tipped, and home; or, with nowhere for
    // the load, home holding it. A scoop at nothing comes straight back down. Holding a load, out
    // over where it goes and tipped.
    diggerPose(p) {
        const REST = [0.55, -0.33, 0.2];
        const HOLD = [0.66, -0.56, 0];
        const w = p.work;
        const rest = p.load ? HOLD : REST;
        if (!w) return rest;
        const [rx, ry] = w.reach || [1.06, 0];
        const DIG = [rx + 0.06, ry + 0.04, 1.1];
        const BITE = [rx - 0.06, ry - 0.02, 0];
        const LIFT = [0.72, -0.8, 0];
        const OVER = [1.05, -0.72, 0];
        const TIP = [1.05, -0.72, 2.2];
        const t = w.t;
        const ease = (a, b, x) => {
            const k = 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
            return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
        };
        if (w.type === 'dump') {
            if (t < 0.4) return ease(HOLD, OVER, t / 0.4);
            if (t < 0.75) return ease(OVER, TIP, (t - 0.4) / 0.35);
            return ease(TIP, REST, (t - 0.75) / 0.5);
        }
        if (t < 0.6) return ease(REST, DIG, t / 0.6);
        if (t < 0.9) return ease(DIG, BITE, (t - 0.6) / 0.3);
        if (t < 1.35) return ease(BITE, LIFT, (t - 0.9) / 0.45);
        if (w.type === 'scoop') return ease(LIFT, REST, (t - 1.35) / 0.45);
        const end = w.keep ? OVER : TIP;
        if (t < 1.75) return ease(LIFT, OVER, (t - 1.35) / 0.4);
        if (t < 2.1) return ease(OVER, end, (t - 1.75) / 0.35);
        return ease(end, rest, (t - 2.1) / 0.5);
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
    // The dump truck: two beeps, and with a load in it, off to the edge of the site over the flat
    // ground, keeping to the roads, beeping as trucks do whenever it backs up. At the edge it turns
    // its back to it, tips the earth over, and comes home. Empty, it lifts its bed to show there is
    // nothing in it.

    tapTruck(c, r, p) {
        if (p.trip || p.work) return;
        const pan = this.pan(this.center(c, r).x);
        audio.note('beep', 4, 72, { gain: 0.9, pan });
        audio.note('beep', 4, 72, { gain: 0.9, pan, delay: 0.32 });
        if (!p.load) {
            p.work = { id: ++this.workId, type: 'show', t: 0, life: 1.3 };
            p.tip.target = 0.55;
            audio.play('hiss', {}, { gain: 0.4, pan, delay: 0.2 });
            this.later(0.6, () => (p.tip.target = 0));
            return;
        }
        const way = this.wayToEdge([c, r], p, null, true);
        if (!way) {
            // Nowhere to take it: it waits, full.
            p.act.kick(10);
            return;
        }
        const side = this.overSide(way);
        if (way.length === 1) {
            this.tipOver(p, c, r, side, null);
            return;
        }
        const end = way[way.length - 1];
        const trip = this.trip(p, way.concat(way.slice(0, -1).reverse()), SPEED.truck);
        trip.dog = this.surprise('dog', 0.6);
        trip.stops[way.length - 1] = () => this.tipOver(p, end[0], end[1], side, trip);
        if (trip.dog) audio.play('woof', {}, { gain: 0.7, pan, delay: 0.4 });
    }

    // At the edge of the site, its back to it, the truck tips its load over.
    tipOver(p, c, r, [dc, dr], trip) {
        const pan = this.pan(this.center(c, r).x);
        p.facing = -this.facingTo(c, r, [c + dc, r + dr], p.facing);
        p.tip.target = 1;
        if (trip) trip.pause = 1.6;
        else p.work = { id: ++this.workId, type: 'tip', t: 0, life: 1.6 };
        audio.play('hiss', {}, { gain: 0.45, pan });
        const here = () => (trip ? p.trip === trip : this.at(c, r) === p);
        this.later(0.5, () => {
            if (!p.load || !here()) return;
            this.spill(c, r, dc, dr, p.loadColour, 1);
            p.load = 0;
        });
        this.later(1.25, () => (p.tip.target = 0));
    }

    // Earth over the edge of the island at (c, r), on the side (dc, dr): it slides off the lip and
    // falls away out of sight. Over the back edge it is gone behind the island at once.
    spill(c, r, dc, dr, colour, size) {
        const s = this.cell;
        const front = dc > 0 || dr > 0;
        const rgb = hexToRgb(colour);
        const lip = this.iso(c + 0.5 + dc * 0.5, r + 0.5 + dr * 0.5);
        const out = this.iso(c + 0.5 + dc, r + 0.5 + dr);
        const n = 7 + size * 3;
        for (let i = 0; i < n; i++) {
            const along = (this.rand() - 0.5) * 0.7;
            const at = this.iso(
                c + 0.5 + dc * 0.42 + Math.abs(dr) * along,
                r + 0.5 + dr * 0.42 + Math.abs(dc) * along
            );
            const vx = (out.x - lip.x) * (0.5 + this.rand() * 0.7);
            const vy = (out.y - lip.y) * 0.5 - s * 0.1;
            const size2 = s * (0.025 + this.rand() * 0.025) * (1 + size * 0.15);
            const shadeK = this.rand() * 0.2 - 0.1;
            this.fx.push({
                t: -i * 0.035,
                life: front ? 1.1 : 0.35,
                draw: (ctx, f) => {
                    if (f.t < 0) return;
                    const t = f.t;
                    const x = at.x + vx * t;
                    const y = at.y + vy * t + 0.5 * s * 3.2 * t * t;
                    const fade = 1 - t / f.life;
                    disc(
                        ctx,
                        x,
                        y,
                        size2,
                        rgbString(
                            rgb.map((v) => clamp(v * (1 + shadeK), 0, 255)),
                            fade
                        )
                    );
                },
            });
        }
        const pan = this.pan(lip.x);
        audio.play('rumble', {}, { gain: 0.7, pan });
        audio.play('whoosh', { variant: 'down' }, { gain: 0.35, pan, delay: 0.15 });
        if (front) audio.play('thud', { f: 70 }, { gain: 0.3, pan, delay: 0.75 });
    }

    //--------------------------------------------------------------------------
    // The mixer: its drum turns all day; tapped, it spins up, and pours the forms in a hole beside
    // it full of concrete. The first time, a cat walks across the wet concrete.

    tapMixer(c, r, p) {
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const pan = this.pan(rect.x);
        p.spin = 7;
        audio.play('slosh', {}, { gain: 0.8, pan });
        audio.play('slosh', { seed: 4 }, { gain: 0.6, pan, delay: 0.5 });
        const forms = this.plotBeside(c, r, (n) => n.step === FORMED);
        if (forms && !(p.work && p.work.type === 'pour')) {
            const id = ++this.workId;
            p.work = { id, type: 'pour', t: 0, life: 2.6 };
            p.facing = -this.facingTo(c, r, forms, -p.facing);
            p.pour.target = 1;
            for (let i = 0; i < 3; i++)
                audio.play('gulp', { f: 220 }, { gain: 0.5, pan, delay: 0.6 + i * 0.35 });
            this.later(0.9, () => {
                const h = this.at(forms[0], forms[1]);
                if (!this.still(p, c, r, id) || !h || h.kind !== 'plot' || h.step !== FORMED) return;
                const cells = this.group(forms[0], forms[1]);
                this.advance(cells, POURED);
                this.later(2.2, () => {
                    const t = this.at(forms[0], forms[1]);
                    if (t && t.kind === 'plot' && t.step === POURED && this.surprise('paws', 0.7))
                        this.catAcross(this.group(forms[0], forms[1]));
                });
            });
            this.later(2.2, () => (p.pour.target = 0));
        } else if (!p.work) {
            p.work = { id: ++this.workId, type: 'turn', t: 0, life: 1.2 };
            p.pour.target = 0.6;
            this.later(0.9, () => (p.pour.target = 0));
            this.later(0.5, () =>
                this.puff(rect.x + s * (0.5 - p.facing * 0.42), rect.y + s * FOOT, 0.6, '185, 179, 171')
            );
        }
    }

    // A cat crossing the wet concrete, leaving a line of paw prints, and a meow at the far side: down
    // the column of the first tile, from its back edge to past its front.
    catAcross(cells) {
        const s = this.cell;
        const [c0] = cells[0];
        const col = cells.filter(([cc]) => cc === c0).sort((a, b) => a[1] - b[1]);
        const v0 = col[0][1] - 0.3;
        const v1 = col[col.length - 1][1] + 1.3;
        const u = c0 + 0.55;
        const life = 1.2 + 0.6 * col.length;
        let printed = 0;
        const step = 0.16;
        this.fx.push({
            t: 0,
            life,
            kind: 'cat',
            draw: (ctx, f) => {
                const at = this.iso(u, lerp(v0, v1, f.t / f.life));
                cat(ctx, at.x, at.y + Math.abs(Math.sin(f.t * 9)) * s * -0.01, s * 0.9, {
                    facing: -1,
                    stretch: 0.6,
                });
            },
            update: (dt, f) => {
                const v = lerp(v0, v1, f.t / f.life);
                const due = Math.floor((v - v0) / step);
                for (; printed < due; printed++) {
                    const pv = v0 + (printed + 0.5) * step;
                    const rr = Math.floor(pv);
                    const t = this.at(c0, rr);
                    if (!t || t.kind !== 'plot' || t.step !== POURED) continue;
                    t.prints.push({ x: u - c0 + (printed % 2 ? 0.04 : -0.04), y: pv - rr });
                    if (t.prints.length > 12) t.prints.shift();
                }
            },
        });
        const end = this.iso(u, v1);
        this.later(life * 0.8, () =>
            audio.play('meow', { f: noteHz(5, 60) }, { gain: 0.6, pan: this.pan(end.x) })
        );
    }

    //--------------------------------------------------------------------------
    // The crane: the forms into a hole beside it; or a floor at a time onto a foundation or a
    // building beside it, each one a note higher, up to as tall as it builds; then the topping-out
    // tree. Its mast climbs with what it builds, as a real tower crane's does.

    tapCrane(c, r, p) {
        if (p.work) return;
        const s = this.cell;
        const pan = this.pan(this.center(c, r).x);
        audio.play('rattle', {}, { gain: 0.7, pan });
        // What there is to do on each plot beside it: the forms into a hole, a floor onto a
        // foundation or a building, or the tree on a building as tall as it builds.
        const jobs = [];
        for (const [dc, dr] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ]) {
            const n = this.at(c + dc, r + dr);
            if (!n || n.kind !== 'plot') continue;
            const cells = this.group(c + dc, r + dr);
            let job = null;
            if (n.step === DUG) job = 'forms';
            else if (n.step >= SET && n.step - SET < this.maxFloors) job = 'floor';
            else if (n.step >= SET && !cells.some(([cc, rr]) => this.at(cc, rr).tree)) job = 'tree';
            if (job) jobs.push({ cell: [c + dc, r + dr], cells, job });
        }
        // One building at a time: it carries on with the one it worked on last, to the tree on
        // top; otherwise the forms first, as a building's work goes, then a floor, then a tree.
        const last = p.building;
        const order = ['forms', 'floor', 'tree'];
        const pick =
            jobs.find((j) => last && j.cells.some(([cc, rr]) => cc === last[0] && rr === last[1])) ||
            jobs.sort((x, y) => order.indexOf(x.job) - order.indexOf(y.job))[0];
        const target = pick ? pick.cell : null;
        const job = pick ? pick.job : null;
        if (pick) p.building = pick.cell;
        const id = ++this.workId;
        if (!target) {
            // Nothing to build on: a swing round and back.
            p.work = { id, type: 'swing', t: 0, life: 2.4 };
            const home = p.slew.target;
            p.slew.target = home + Math.PI;
            this.later(1.2, () => {
                if (this.still(p, c, r, id)) p.slew.target = home;
            });
            this.later(0.6, () => audio.play('rattle', { seed: 3 }, { gain: 0.4, pan }));
            return;
        }
        const [tc, tr] = target;
        const goal = this.at(tc, tr);
        const step = goal.step;
        const floors = Math.max(0, step - SET);
        // Round the short way to face the plot, and up, if the building would reach the jib.
        p.slew.target = towards(p.slew.value, Math.atan2(tr - r, tc - c));
        const forms = job === 'forms';
        // Where what it carries comes to rest: the forms down into the hole, a floor on the roof.
        const roof = forms ? -0.1 : 0.025 + floors * FLOOR;
        p.mast.target = Math.max(CRANE_MAST, roof + FLOOR + 0.34);
        const H = p.mast.target;
        // How far below the jib the hook hangs for what it carries to have its foot at height z.
        const tall = forms ? FORMS_H : FLOOR;
        const hookFor = (z) => H - 0.06 - tall - z;
        const ground = hookFor(0.02);
        const land = hookFor(roof);
        p.work = { id, type: 'lift', t: 0, life: 3.8 };
        p.trolley.target = 0.05;
        p.drop.target = 0.3;
        this.later(0.7, () => {
            if (this.still(p, c, r, id)) p.drop.target = ground;
        });
        this.later(1.25, () => {
            if (!this.still(p, c, r, id)) return;
            p.carry = forms ? 'forms' : job === 'tree' ? 'tree' : FLOORS[Math.min(floors, FLOORS.length - 1)];
            audio.note('clank', 2, 60, { gain: 0.3, pan });
            audio.play('rattle', { seed: 2 }, { gain: 0.5, pan, delay: 0.1 });
            p.drop.target = Math.min(land - 0.25, 0.2);
        });
        this.later(1.9, () => {
            if (!this.still(p, c, r, id)) return;
            p.trolley.target = 0.82;
            p.drop.target = land - 0.2;
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
            const q = this.center(tc, tr);
            const roofY = q.y - roof * this.tw;
            if (forms) {
                this.advance(cells, FORMED);
                [3, 5, 4].forEach((d, i) =>
                    audio.note('wood', d, 60, { gain: 0.7 - i * 0.12, pan, delay: i * 0.13 })
                );
                audio.note('clank', 5, 60, { gain: 0.35, pan, delay: 0.05 });
                this.puff(q.x, q.y, 0.7, '226, 200, 160');
            } else if (job === 'tree') {
                let mid = cells[0];
                for (const cell of cells) if (Math.abs(cell[0] - c) < Math.abs(mid[0] - c)) mid = cell;
                this.at(mid[0], mid[1]).tree = true;
                [5, 7, 9, 10].forEach((d, i) =>
                    audio.note('glock', d, 72, { gain: 0.45, pan, delay: i * 0.12, wet: 0.4 })
                );
                this.sparkleAt(q.x, roofY - s * 0.2);
            } else {
                this.advance(cells, step + 1);
                audio.note('clank', FLOORS[floors].degree, 60, { gain: 0.9, pan });
                audio.note('wood', FLOORS[floors].degree, 60, { gain: 0.6, pan, delay: 0.05 });
                this.puff(q.x, roofY - FLOOR * this.tw, 0.8, '230, 224, 214');
            }
            for (const [cc, rr] of cells) this.at(cc, rr).bounce.kick(6);
            p.drop.target = 0.3;
            p.trolley.target = 0.6;
            if (this.night < 0.5 && this.surprise('nest', 0.5)) {
                this.later(0.8, () => {
                    if (this.at(c, r) !== p) return;
                    p.bird = 8;
                    audio.play('chirp', {}, { gain: 0.5, pan });
                });
            }
        });
    }

    // The crane as its drawing wants it.
    craneState(p) {
        const floor = p.carry && p.carry !== 'tree' && p.carry !== 'forms';
        return {
            slew: p.slew.value,
            reach: 0.22 + 0.95 * clamp(p.trolley.value, 0, 1),
            drop: Math.max(0.04, p.drop.value),
            mast: p.mast.value,
            load: floor ? p.carry : null,
            forms: p.carry === 'forms',
            tree: p.carry === 'tree',
            glow: this.beaconGlow(p),
        };
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
                        this.tap(c, r, p, this.center(c, r));
                    });
                });
        }
    }

    //--------------------------------------------------------------------------
    // The road machines, at Bloom, each with the next step of a road: the bulldozer scrapes a marked
    // road into dirt, the roller rolls the dirt flat, the paver paves what is rolled. Each works the
    // road it stands on, or one beside it, driving out along it to every tile at its step and home.

    // The way out along the road and home, for a machine at (c, r) whose work is the road at step
    // `from`: over any road, past the machines parked on it, but not through cones, which close a
    // road, or anything else standing on it. Null if there is none to work.
    roadWay(c, r, p, from) {
        const along = (nc, nr) => {
            const g = this.floorAt(nc, nr);
            if (!g || g.kind !== 'road') return false;
            const top = this.at(nc, nr);
            return top === g || top === p || MACHINES.indexOf(top.kind) >= 0;
        };
        const wanted = (nc, nr) => {
            const g = this.floorAt(nc, nr);
            return !!g && g.kind === 'road' && g.state === from;
        };
        if (along(c, r)) {
            const way = walk([c, r], along, wanted);
            if (way.length > 1 || wanted(c, r))
                return way.length > 1
                    ? way
                    : [
                          [c, r],
                          [c, r],
                      ];
        }
        for (const [dc, dr] of SIDES) {
            const start = [c + dc, r + dr];
            if (!along(start[0], start[1])) continue;
            const way = walk(start, along, wanted);
            if (way.length > 1 || wanted(start[0], start[1])) return [[c, r]].concat(way, [[c, r]]);
        }
        return null;
    }

    // A road machine sets off along `way`, and each tile at step `from` it comes to goes on a step.
    roadTrip(p, way, from, to, done) {
        const trip = this.trip(p, way, SPEED[p.kind]);
        trip.worked = [];
        trip.arrive = (c, r) => {
            const g = this.floorAt(c, r);
            if (!g || g.kind !== 'road' || g.state !== from) return;
            g.state = to;
            trip.worked.push([c, r]);
            this.relaid.add(key(c, r));
            const q = this.center(c, r);
            const pan = this.pan(q.x);
            audio.note('marimba', 5 + ((trip.worked.length - 1) % 7), 60, { gain: 0.45, pan });
            if (to === 'dirt') {
                audio.play('crunch', {}, { gain: 0.55, pan });
                this.puff(q.x, q.y, 1, '206, 178, 140');
            } else if (to === 'rolled') {
                audio.play('pat', {}, { gain: 0.45, pan });
                this.puff(q.x, q.y, 0.6, '226, 214, 192');
            } else {
                audio.play('hiss', {}, { gain: 0.35, pan });
                g.steam = 6;
            }
        };
        // Home, the ground is drawn again, with the road as it is now.
        trip.done = () => {
            if (this.relaid.size) this.drawGround();
            if (done) done();
        };
        return trip;
    }

    //--------------------------------------------------------------------------
    // The bulldozer: a pile beside it, it pushes along the flat ground to the nearest hole the
    // digger has dug, and into it; with no hole to reach, to the nearest edge, and over. With no
    // pile, it scrapes a marked road into dirt. Under the pile, a lost ball.

    tapDozer(c, r, p) {
        if (p.work || p.trip) return;
        const s = this.cell;
        const pan = this.pan(this.center(c, r).x);
        for (let i = 0; i < 4; i++) audio.play('putt', {}, { gain: 0.7, pan, delay: i * 0.16 });
        const heap = this.pieceBeside(c, r, 'pile');
        const plan = heap ? this.pushWay(c, r, heap) : null;
        if (plan) {
            this.pushPile(c, r, p, heap, plan);
            return;
        }
        const way = this.roadWay(c, r, p, 'marked');
        if (way) {
            p.blade.target = 0;
            this.roadTrip(p, way, 'marked', 'dirt');
            return;
        }
        // Nothing to push: blade down, and a shove.
        const rect = this.cellRect(c, r);
        p.pushDir = [p.facing, 0];
        const id = ++this.workId;
        p.work = { id, type: 'push', t: 0, life: 2.2 };
        p.blade.target = 0;
        p.push.target = 1;
        this.later(0.8, () => {
            if (!this.still(p, c, r, id)) return;
            audio.play('crunch', {}, { gain: 0.6, pan });
            this.puff(rect.x + s * (0.5 + p.facing * 0.45), rect.y + s * FOOT, 0.8, '226, 210, 180');
        });
        this.later(1.1, () => {
            if (!this.still(p, c, r, id)) return;
            p.blade.target = 1;
            p.push.target = 0;
        });
    }

    // Where the bulldozer at (c, r) can push the pile at `heap`: along flat, empty ground to the
    // nearest hole the digger has dug, into it; or, with no hole to reach, to the nearest edge, and
    // over it. The line the bulldozer and the pile go along together, from the bulldozer's tile and
    // the pile's on: last the hole, or the point past the edge.
    pushWay(c, r, heap) {
        const pile = this.at(heap[0], heap[1]);
        const notMe = (nc, nr) => nc !== c || nr !== r;
        const enter = (nc, nr) => notMe(nc, nr) && (this.open(nc, nr, pile) || this.isHole(nc, nr));
        const hole = route(heap, (nc, nr) => this.isHole(nc, nr), enter);
        if (hole) return { line: [[c, r]].concat(hole), into: hole[hole.length - 1] };
        const edge = this.wayToEdge(heap, pile, [c, r]);
        if (!edge) return null;
        const over = this.overSide([[c, r]].concat(edge));
        const end = edge[edge.length - 1];
        return { line: [[c, r]].concat(edge, [[end[0] + over[0], end[1] + over[1]]]), over };
    }

    pushPile(c, r, p, heap, plan) {
        const pile = this.at(heap[0], heap[1]);
        const pan = this.pan(this.center(c, r).x);
        // The pile comes off its tile and goes on ahead of the blade.
        this.cells[heap[1]][heap[0]] = pile.under || null;
        pile.under = null;
        const out = plan.line.slice(0, -1);
        const trip = this.trip(p, out.concat(out.slice(0, -1).reverse()), SPEED.dozer);
        trip.pile = pile;
        trip.line = plan.line;
        p.blade.target = 0;
        audio.play('rumble', { variant: 'short' }, { gain: 0.6, pan, delay: 0.3 });
        trip.stops[out.length - 1] = () => {
            // At the hole, or the edge: the pile goes in, or over, and the blade comes up; then it
            // backs up home, still facing the way it pushed.
            const [ec, er] = out[out.length - 1];
            p.facing = this.facingTo(ec, er, plan.line[plan.line.length - 1], p.facing);
            trip.backing = true;
            trip.pause = 0.9;
            trip.drop = { t: 0, from: this.pileAt(trip), fn: () => this.landPile(pile, plan) };
            this.later(0.5, () => {
                if (p.trip === trip) p.blade.target = 1;
            });
        };
        const q = this.center(heap[0], heap[1]);
        if (this.surprise('ball', 0.5)) this.ballOut(q.x, q.y - this.cell * 0.24);
    }

    // Where the pushed pile is, in tiles: just ahead of the blade, on the line, from the tile it was
    // on.
    pileAt(trip) {
        return Math.max(1, trip.d + 0.62);
    }

    // The pile's last moment: into the hole, or over the edge.
    dropping(trip, dt) {
        const drop = trip.drop;
        drop.t += dt;
        if (drop.t >= 0.35 && !drop.done) {
            drop.done = true;
            trip.pile = null;
            drop.fn();
        }
    }

    landPile(pile, plan) {
        if (plan.into) {
            const [hc, hr] = plan.into;
            const q = this.center(hc, hr);
            const pan = this.pan(q.x);
            if (this.isHole(hc, hr)) {
                // The hole, filled: loose earth heaped in it, for the roller.
                this.cells[hr][hc] = this.make('fill');
                audio.play('rumble', {}, { gain: 0.75, pan });
                audio.play('thud', { f: 90 }, { gain: 0.5, pan, delay: 0.1 });
            }
            this.puff(q.x, q.y, 1.3, '206, 178, 140');
            return;
        }
        const end = plan.line[plan.line.length - 2];
        this.spill(end[0], end[1], plan.over[0], plan.over[1], SITE.earth, pile.size);
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
    // The roller: over a filled hole beside it, pressing the loose earth flat; or along a dirt road,
    // rolling its bumps smooth, its drum playing the scale as it goes. Never over what is already
    // smooth. A cat sometimes rides on the roof.

    tapRoller(c, r, p) {
        if (p.trip) return;
        const pan = this.pan(this.center(c, r).x);
        audio.note('toot', 0, 60, { gain: 0.8, pan });
        const fill = this.fillWay(c, r);
        let trip = null;
        if (fill) {
            trip = this.trip(p, fill, SPEED.roller);
            let n = 0;
            trip.arrive = (fc, fr) => {
                const f = this.at(fc, fr);
                if (!f || f.kind !== 'fill') return;
                f.flat.target = 1;
                const q = this.center(fc, fr);
                audio.play('crunch', {}, { gain: 0.6, pan: this.pan(q.x) });
                audio.note('marimba', 5 + (n++ % 7), 60, { gain: 0.45, pan: this.pan(q.x), delay: 0.3 });
                this.later(0.55, () => {
                    if (this.at(fc, fr) !== f) return;
                    // Pressed flat: bare earth again.
                    this.cells[fr][fc] = null;
                    this.puff(q.x, q.y, 0.8, '226, 210, 180');
                });
            };
        } else {
            const way = this.roadWay(c, r, p, 'dirt');
            if (way) trip = this.roadTrip(p, way, 'dirt', 'rolled');
        }
        if (!trip) {
            // Nothing bumpy to roll: it putters on the spot.
            p.act.kick(10);
            for (let i = 0; i < 5; i++)
                audio.play('putt', {}, { gain: 0.6, pan, delay: 0.3 + i * 0.2, rate: 0.8 });
            return;
        }
        trip.cat = this.night < 0.5 && this.surprise('rider', 0.6);
    }

    // The way from a roller at (c, r) out over the filled holes joined to one beside it, and home.
    fillWay(c, r) {
        const isFill = (nc, nr) => this.is(nc, nr, 'fill');
        for (const [dc, dr] of SIDES) {
            if (!isFill(c + dc, r + dr)) continue;
            const way = walk([c + dc, r + dr], isFill, isFill);
            return [[c, r]].concat(way, [[c, r]]);
        }
        return null;
    }

    //--------------------------------------------------------------------------
    // The paver: along a rolled road, laying the asphalt, steaming, a note higher each tile; a dirt
    // road it waits for the roller to roll first. Ducks cross the new road.

    tapPaver(c, r, p) {
        if (p.trip || p.work) return;
        const pan = this.pan(this.center(c, r).x);
        for (let i = 0; i < 3; i++) audio.play('putt', {}, { gain: 0.7, pan, delay: i * 0.15, rate: 0.8 });
        const way = this.roadWay(c, r, p, 'rolled');
        if (!way) {
            // Nothing rolled to pave: the screed down, and up again.
            p.work = { id: ++this.workId, type: 'ready', t: 0, life: 1.2 };
            p.screed.target = 0;
            audio.play('hiss', {}, { gain: 0.4, pan, delay: 0.3 });
            this.later(0.6, () => (p.screed.target = 1));
            return;
        }
        p.screed.target = 0;
        const trip = this.roadTrip(p, way, 'rolled', 'paved', () => {
            if (trip.worked.length && this.surprise('ducks', 0.5)) this.ducksAcross(trip.worked);
        });
    }

    // A duck and her ducklings, waddling across the new road, from the land on one side of it to
    // the land on the other: across a tile in the middle of what was paved where there is land on
    // both sides, or else along the new road from one end to the other.
    ducksAcross(tiles) {
        const s = this.cell;
        const mid = (list) => list[Math.floor(list.length / 2)];
        const across = tiles.filter(([c, r]) => {
            const m = this.mask(c, r, 'road');
            return m & (E | W)
                ? this.isLand(c, r - 1) && this.isLand(c, r + 1)
                : this.isLand(c - 1, r) && this.isLand(c + 1, r);
        });
        let from;
        let to;
        if (across.length) {
            const [c, r] = mid(across);
            const alongU = this.mask(c, r, 'road') & (E | W);
            from = alongU ? [c + 0.5, r - 0.5] : [c - 0.5, r + 0.5];
            to = alongU ? [c + 0.5, r + 1.5] : [c + 1.5, r + 0.5];
        } else if (tiles.length > 1) {
            from = [tiles[0][0] + 0.5, tiles[0][1] + 0.5];
            to = [tiles[tiles.length - 1][0] + 0.5, tiles[tiles.length - 1][1] + 0.5];
        } else {
            from = [tiles[0][0] + 0.1, tiles[0][1] + 0.5];
            to = [tiles[0][0] + 0.9, tiles[0][1] + 0.5];
        }
        const life = 3.6;
        const a = this.iso(from[0], from[1]);
        const b = this.iso(to[0], to[1]);
        const facing = b.x > a.x ? 1 : -1;
        [0, 1, 2].forEach((i) => {
            this.fx.push({
                t: -i * 0.32,
                life,
                kind: 'ducks',
                draw: (ctx, f) => {
                    if (f.t < 0) return;
                    const k = f.t / f.life;
                    const x = lerp(a.x, b.x, k);
                    const y = lerp(a.y, b.y, k);
                    ctx.save();
                    ctx.globalAlpha = clamp(Math.min(k / 0.08, (1 - k) / 0.08), 0, 1);
                    ctx.translate(x, y);
                    ctx.scale(facing, 1);
                    drawDuck(ctx, s * (i ? 0.32 : 0.48), { stride: Math.sin(f.t * 12 + i) });
                    ctx.restore();
                },
            });
        });
        const pan = this.pan(a.x);
        audio.play('quack', {}, { gain: 0.8, pan, delay: 0.3 });
        audio.play('quack', {}, { gain: 0.5, pan, delay: 0.75, rate: 1.4 });
        audio.play('quack', {}, { gain: 0.45, pan, delay: 1.0, rate: 1.5 });
    }

    //--------------------------------------------------------------------------
    // The work lamp: on and off; at night it lights the ground around it, and moths come.

    tapLamp(c, r, p) {
        p.lit = !p.lit;
        p.light.target = p.lit ? 1 : 0;
        audio.play(
            'click',
            { variant: p.lit ? 'on' : 'off' },
            { gain: 0.7, pan: this.pan(this.cellRect(c, r).x) }
        );
    }

    //--------------------------------------------------------------------------
    // Things to touch that are not pieces: a building's upper floors, which stand over the tiles
    // behind it.

    targetAt(x, y) {
        const tiles = this.tiles();
        for (let i = tiles.length - 1; i >= 0; i--) {
            const [c, r] = tiles[i];
            const p = this.at(c, r);
            if (!p || p.away || p.kind !== 'plot' || p.step <= SET) continue;
            const rect = this.cellRect(c, r);
            const ground = this.center(c, r);
            const top = ground.y - (0.025 + (p.step - SET) * FLOOR) * this.tw - this.th * 0.4;
            if (y < rect.y && y >= top && Math.abs(x - ground.x) < this.tw * 0.4) {
                return {
                    tap: () => {
                        p.bounce.kick(5);
                        this.playBuilding(c, r);
                    },
                };
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

    // Plots at every step, filled holes and new asphalt's steam, and anything that lies on the
    // ground, under everything standing: in the plan, laid at the island's angle, except the holes,
    // which are dug down into it, and the lumps of a filled one, which stand up out of it.
    drawBelow(ctx) {
        const s = this.cell;
        ctx.save();
        this.planView(ctx);
        if (this.relaid.size) this.paintRoads(ctx, this.relaid);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.cells[r][c];
                if (!p) continue;
                const { x, y } = this.mapRect(c, r);
                const g = p.kind === 'road' ? p : p.under;
                if (g && g.kind === 'road' && g.state === 'marked' && Math.abs(g.twang.value) > 0.5) {
                    // A plucked string, quivering over the one painted on the ground, across the
                    // tile the way the road runs.
                    const bow = g.twang.value * s * 0.0015;
                    const m = this.mask(c, r, 'road');
                    const across = !(m & (N | S)) || !!(m & (E | W));
                    const [x0, y0, x1, y1] = across
                        ? [x + s * 0.2, y + s * 0.5, x + s * 0.8, y + s * 0.5]
                        : [x + s * 0.5, y + s * 0.2, x + s * 0.5, y + s * 0.8];
                    ctx.beginPath();
                    ctx.moveTo(x0, y0);
                    ctx.quadraticCurveTo(
                        (x0 + x1) / 2 + (across ? 0 : bow),
                        (y0 + y1) / 2 + (across ? bow : 0),
                        x1,
                        y1
                    );
                    ctx.lineWidth = Math.max(1, s * 0.014);
                    ctx.strokeStyle = GROUND.string;
                    ctx.stroke();
                }
                if (p.kind === 'fill') {
                    art.fillPatch(ctx, x, y, s);
                    continue;
                }
                if (p.kind !== 'plot') continue;
                const m = this.plotMask(c, r);
                const lift = clamp(p.pop.value, -20, 20) * s * 0.001;
                if (p.step === MARKED) art.plotMarked(ctx, x, y - lift, s, m, p.twang.value * s * 0.0015);
                else if (p.step === POURED) {
                    art.plotWet(ctx, x, y, s, m);
                    for (const print of p.prints) {
                        if (print.hand) art.handprint(ctx, x + print.x * s, y + print.y * s, s);
                        else art.pawprint(ctx, x + print.x * s, y + print.y * s, s);
                    }
                } else if (p.step === SET) art.plotSlab(ctx, x, y - lift, s, m, true);
            }
        }
        ctx.restore();
        const seen = new Set();
        for (const [c, r] of this.tiles()) {
            const p = this.cells[r][c];
            if (!p || p.kind !== 'plot' || (p.step !== DUG && p.step !== FORMED) || seen.has(key(c, r)))
                continue;
            const cells = this.group(c, r);
            for (const [cc, rr] of cells) seen.add(key(cc, rr));
            this.hole(ctx, cells, p.step === FORMED);
        }
        for (const [c, r] of this.tiles()) {
            const p = this.cells[r][c];
            if (p && p.kind === 'fill') this.drawLumps(ctx, c, r, p);
            const g = this.floorAt(c, r);
            if (g && g.kind === 'road' && g.steam > 0) this.drawSteam(ctx, c, r, g);
        }
        for (const f of this.fx) if (f.below) f.draw(ctx, f);
    }

    // A dug plot: a hole down into the island, its far walls showing and its floor deep, one hole
    // however many tiles it joins. With its forms in, the walls are boards, their top edges showing
    // round the rim, and the steel is laid across the floor.
    hole(ctx, cells, forms) {
        const ids = new Set(cells.map(([c, r]) => key(c, r)));
        const inset = (c, r, dc, dr) => (ids.has(key(c + dc, r + dr)) ? 0 : 0.09);
        const outline = () => {
            ctx.beginPath();
            for (const [c, r] of cells) {
                const a = this.iso(c + inset(c, r, -1, 0), r + inset(c, r, 0, -1));
                const b = this.iso(c + 1 - inset(c, r, 1, 0), r + inset(c, r, 0, -1));
                const d = this.iso(c + 1 - inset(c, r, 1, 0), r + 1 - inset(c, r, 0, 1));
                const e = this.iso(c + inset(c, r, -1, 0), r + 1 - inset(c, r, 0, 1));
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.lineTo(d.x, d.y);
                ctx.lineTo(e.x, e.y);
                ctx.closePath();
            }
        };
        const depth = this.tw * 0.13;
        ctx.save();
        outline();
        ctx.fillStyle = forms ? GROUND.wood : GROUND.holeEdge;
        ctx.fill();
        ctx.clip();
        if (forms) {
            // The boards' seams, down the walls.
            ctx.strokeStyle = GROUND.woodDeep;
            ctx.lineWidth = Math.max(1, this.tw * 0.006);
            ctx.beginPath();
            for (const [c, r] of cells) {
                for (const k of [0.33, 0.66]) {
                    const p0 = this.iso(c + k, r + inset(c, r, 0, -1));
                    const p1 = this.iso(c + inset(c, r, -1, 0), r + k);
                    ctx.moveTo(p0.x, p0.y);
                    ctx.lineTo(p0.x, p0.y + depth);
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p1.x, p1.y + depth);
                }
            }
            ctx.stroke();
        }
        ctx.translate(0, depth);
        outline();
        ctx.fillStyle = GROUND.hole;
        ctx.fill();
        if (forms) {
            // The steel, a grid across the floor.
            ctx.strokeStyle = GROUND.rebar;
            ctx.lineWidth = Math.max(1, this.tw * 0.008);
            ctx.beginPath();
            for (const [c, r] of cells) {
                for (const k of [0.3, 0.5, 0.7]) {
                    const a0 = this.iso(c + k, r + 0.12);
                    const a1 = this.iso(c + k, r + 0.88);
                    const b0 = this.iso(c + 0.12, r + k);
                    const b1 = this.iso(c + 0.88, r + k);
                    ctx.moveTo(a0.x, a0.y);
                    ctx.lineTo(a1.x, a1.y);
                    ctx.moveTo(b0.x, b0.y);
                    ctx.lineTo(b1.x, b1.y);
                }
            }
            ctx.stroke();
        }
        ctx.translate(0, depth * 0.4);
        outline();
        ctx.fillStyle = 'rgba(112, 84, 58, 0.12)';
        ctx.fill();
        ctx.restore();
        if (forms) {
            // The boards' top edges, round the rim.
            outline();
            ctx.lineWidth = Math.max(1, this.tw * 0.012);
            ctx.strokeStyle = GROUND.woodLight;
            ctx.stroke();
        }
        for (const [c, r] of cells) {
            const p = this.at(c, r);
            if (p && p.find) {
                const at = this.center(c, r);
                art.bone(ctx, at.x, at.y + depth * 0.9, this.cell * 2);
            }
        }
    }

    // The lumps of loose earth heaped in a filled hole, pressed down as the roller goes over them.
    drawLumps(ctx, c, r, p) {
        const s = this.cell;
        const flat = clamp(p.flat.value, 0, 1);
        for (const [fu, fv, size] of LUMPS) {
            const q = this.iso(c + fu, r + fv);
            const w = s * 0.1 * size;
            const h = s * 0.085 * size * (1 - 0.85 * flat);
            ellipse(ctx, q.x + w * 0.15, q.y + s * 0.012, w * 1.1, s * 0.035 * size);
            ctx.fillStyle = 'rgba(112, 84, 58, 0.18)';
            ctx.fill();
            const mound = (inset, lift, colour) => {
                ctx.beginPath();
                ctx.moveTo(q.x - w + inset, q.y);
                ctx.bezierCurveTo(
                    q.x - w * 0.55,
                    q.y - h * 0.15 - lift,
                    q.x - w * 0.4,
                    q.y - h - lift,
                    q.x,
                    q.y - h - lift
                );
                ctx.bezierCurveTo(
                    q.x + w * 0.4,
                    q.y - h - lift,
                    q.x + w * 0.55,
                    q.y - h * 0.15 - lift,
                    q.x + w - inset,
                    q.y
                );
                ctx.closePath();
                ctx.fillStyle = colour;
                ctx.fill();
            };
            mound(0, 0, GROUND.fillDeep);
            mound(w * 0.12, s * 0.008, GROUND.fill);
            ellipse(ctx, q.x - w * 0.25, q.y - h * 0.7, w * 0.22, Math.max(0.5, h * 0.18), -0.4);
            ctx.fillStyle = GROUND.fillLight;
            ctx.fill();
        }
    }

    // Warm asphalt, steaming for a while after it is laid.
    drawSteam(ctx, c, r, g) {
        const s = this.cell;
        const k = clamp(g.steam / 3, 0, 1);
        for (let i = 0; i < 3; i++) {
            const t = (this.time * 0.45 + i / 3 + g.seed * 0.01) % 1;
            const q = this.iso(c + 0.3 + i * 0.2, r + 0.65 - i * 0.15);
            disc(
                ctx,
                q.x + Math.sin(t * 5 + i) * s * 0.02,
                q.y - t * s * 0.3,
                s * (0.03 + t * 0.04),
                `rgba(255, 252, 245, ${0.4 * k * (1 - t)})`
            );
        }
    }

    // Whether a piece's sprites are all of it: not a building with a cat at the door or a tree on
    // top, nor the hut with the foreman out or the radio on.
    solid(p) {
        if (p.kind === 'plot') return !p.residents && !p.tree;
        if (p.kind === 'hut') return !(p.out > 0) && !(p.radio > 0);
        return true;
    }

    // Buildings and the hut stand tall enough to hide what is behind them; the crane's mast, always
    // taller than what it builds, needs no showing through them.
    tall(p) {
        return (p.kind === 'plot' && p.step > SET) || p.kind === 'hut';
    }

    shows(p) {
        return p.kind !== 'crane';
    }

    // A machine's silhouette changes as it works, carries a load or tips it.
    pose(p) {
        const work = p.work ? `${p.work.type}${Math.floor(p.work.t * 4)}` : '';
        const tip = p.tip ? Math.round(p.tip.value * 6) : 0;
        return `${work}:${p.load ? 1 : 0}:${tip}`;
    }

    // How far down its frame each piece's drawing begins, for touching it.
    reach(p) {
        const top = REACH[p.kind];
        return top === undefined ? 0.35 : top;
    }

    // A building at rest, drawn once into a sprite tall enough for its top floor.
    blitTall(ctx, id, x, y, s, draw) {
        const layer = this.cached(id, () => {
            const tall = makeLayer(s * 1.2, s * 2, this.scale);
            tall.ctx.translate(s * 0.1, s);
            draw(tall.ctx);
            return tall;
        });
        ctx.drawImage(layer.canvas, x - s * 0.1, y - s, s * 1.2, s * 2);
        this.marked(layer, x - s * 0.1, y - s, s * 1.2, s * 2);
    }

    drawPiece(ctx, p, c, r, x, y, s) {
        const b = p.bounce.value * 0.01;
        ctx.save();
        ctx.translate(x + s / 2, y + s * FOOT);
        ctx.scale(1 + b, 1 - b * 1.2);
        ctx.translate(-(x + s / 2), -(y + s * FOOT));
        const kind = p.kind;
        const cx = x + s / 2;
        const by = y + s * FOOT;
        const f = this.frameOf(c, r);
        if (kind === 'plot') {
            const m = this.plotMask(c, r);
            const floors = p.step - SET;
            if (p.glow < 0)
                this.blitTall(ctx, `building:${floors}:${m}:${p.residents ? 1 : 0}`, x, y, s, (g) =>
                    art.isoBuilding(g, this.spriteFrame(), floors, m, { plants: p.residents })
                );
            else art.isoBuilding(ctx, f, floors, m, { glow: p.glow, plants: p.residents });
            const spots = art.buildingSpots(f, floors, m);
            if (p.residents && !(m & 4) && !(m & 8))
                cat(ctx, spots.door[0] - s * 0.05, spots.door[1] + s * 0.02, s * 0.7, { facing: -1 });
            if (p.tree) art.toppingTree(ctx, spots.roof[0], spots.roof[1], s);
        } else if (kind === 'pile') {
            this.drawPile(ctx, p, x, y, s);
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
            // The mast stands among the pieces; the jib, over everything, is drawn above them.
            art.isoCraneMast(ctx, f, p.mast.value);
        } else if (kind === 'cones') {
            this.drawCones(ctx, p, c, r, x, y, s);
        } else if (kind === 'hut') {
            const open = clamp(p.door.value, 0, 1);
            if (open < 0.005 && !(p.radio > 0))
                this.blit(ctx, 'hut', x, y, s, (g) => art.isoHut(g, this.spriteFrame(), {}));
            else art.isoHut(ctx, f, { door: open, radio: p.radio > 0 });
            const spots = art.hutSpots(f);
            if (p.out > 0 && p.door.value > 0.5)
                worker(ctx, spots.door[0], spots.door[1] + s * 0.05, s, { wave: this.time * 9 });
            if (p.radio > 0) {
                const k = (this.time * 1.4) % 1;
                sparkle(
                    ctx,
                    spots.window[0] + s * k * 0.12,
                    spots.window[1] - s * (0.05 + k * 0.25),
                    s * 0.02 * (1 - k),
                    '#FBF6EE'
                );
            }
        } else if (kind === 'roller') {
            art.roller(ctx, cx, by, s * 0.92, { facing: p.facing, roll: p.roll, glow: this.beaconGlow(p) });
        } else if (kind === 'dozer') {
            const [px, py] = this.pushed(p);
            bulldozer(ctx, cx + px, by + py, s * MACHINE_K, {
                facing: p.facing,
                lift: clamp(p.blade.value, 0, 1),
                load: p.push.value > 0.3 ? 0.5 : 0,
                loadColour: SITE.earth,
                travel: p.travel,
                beacon: this.beaconGlow(p),
            });
        } else if (kind === 'paver') {
            art.paver(ctx, cx, by, s * 0.9, {
                facing: p.facing,
                screed: clamp(p.screed.value, 0, 1),
                roll: p.roll,
                glow: this.beaconGlow(p),
            });
        } else if (kind === 'lamp') {
            art.lamp(ctx, x, y, s, { on: clamp(p.light.value, 0, 1) });
        }
        ctx.restore();
    }

    drawPile(ctx, p, x, y, s) {
        const cx = x + s / 2;
        const by = y + s * FOOT;
        const slide = clamp(p.slide.value, -30, 30) * 0.004;
        ctx.save();
        ctx.translate(cx, by);
        ctx.scale(1 + slide, 1 - slide);
        ctx.translate(-cx, -by);
        art.pile(ctx, x, y, s, p.size, {
            worm: p.worm > 0 ? Math.min(1, p.worm, 3.5 - p.worm) * 1.5 : 0,
        });
        ctx.restore();
    }

    // How far a bulldozer has pushed out towards what it is pushing, on the screen.
    pushed(p) {
        const amount = clamp(p.push.value, 0, 1) * this.cell * 0.22;
        const [dx, dy] = p.pushDir || [p.facing, 0];
        return [dx * amount, dy * amount];
    }

    // A line of cones: the striped tape to any cone joined in front, then the cone, which hides the
    // tape's end.
    drawCones(ctx, p, c, r, x, y, s) {
        const width = s * 0.04;
        for (const [dc, dr] of [
            [1, 0],
            [0, 1],
        ]) {
            if (!this.is(c + dc, r + dr, 'cones')) continue;
            const a = this.center(c, r);
            const b = this.center(c + dc, r + dr);
            const lift = s * 0.24;
            ctx.save();
            ctx.translate(a.x, a.y - lift);
            ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x));
            stripes(
                ctx,
                0,
                -width / 2,
                Math.hypot(b.x - a.x, b.y - a.y),
                width,
                '#FBF6EE',
                SITE.accent,
                width * 0.9
            );
            ctx.restore();
        }
        art.cone(ctx, x, y, s, 0, { wobble: p.wobble.value * 0.012 });
    }

    // The machines out on the site, among the pieces they pass, and a pile on its way ahead of a
    // bulldozer's blade.
    movers() {
        const out = [];
        const s = this.cell;
        for (const row of this.cells) {
            for (const p of row) {
                if (!p || !p.trip || p.trip.x === undefined) continue;
                const trip = p.trip;
                const u = trip.x / s;
                const v = trip.y / s;
                out.push({ u, v, draw: (ctx) => this.drawMover(ctx, p, u, v) });
                if (trip.pile) {
                    const at = pointOn(trip.line, trip.drop ? trip.drop.from : this.pileAt(trip));
                    const pu = at[0] + 0.5;
                    const pv = at[1] + 0.5;
                    out.push({ u: pu, v: pv, draw: (ctx) => this.drawPushed(ctx, trip, pu, pv) });
                }
            }
        }
        return out;
    }

    drawMover(ctx, p, u, v) {
        const s = this.cell;
        const { x, y } = this.iso(u, v);
        const trip = p.trip;
        if (p.kind === 'truck') {
            if (trip.dog)
                dog(ctx, x - p.facing * s * 0.55, y, s, {
                    facing: p.facing,
                    run: trip.pause > 0 ? 0 : this.time * 14,
                });
            dumpTruck(ctx, x, y, s * MACHINE_K, {
                facing: p.facing,
                tip: clamp(p.tip.value, 0, 1),
                load: p.load,
                loadColour: p.loadColour,
                roll: p.roll,
                beacon: this.beaconGlow(p),
            });
        } else if (p.kind === 'dozer') {
            bulldozer(ctx, x, y, s * MACHINE_K, {
                facing: p.facing,
                lift: clamp(p.blade.value, 0, 1),
                load: trip.pile ? 0.5 : 0,
                loadColour: SITE.earth,
                travel: p.travel,
                beacon: this.beaconGlow(p),
            });
        } else if (p.kind === 'paver') {
            art.paver(ctx, x, y, s * 0.9, {
                facing: p.facing,
                screed: clamp(p.screed.value, 0, 1),
                roll: p.roll,
                glow: this.beaconGlow(p),
                steam: 1,
                steamAt: this.time,
            });
        } else {
            art.roller(ctx, x, y, s * 0.85, {
                facing: p.facing,
                roll: p.roll,
                glow: this.beaconGlow(p),
            });
            if (trip.cat)
                cat(ctx, x - p.facing * s * 0.12, y - s * 0.47, s * 0.8, {
                    facing: p.facing,
                });
        }
    }

    // The pile ahead of the blade; at the end, going down into the hole, or over the edge and down.
    drawPushed(ctx, trip, u, v) {
        const s = this.cell;
        const pile = trip.pile;
        let { x, y } = this.iso(u, v);
        let squash = 1;
        let alpha = 1;
        const drop = trip.drop;
        if (drop) {
            const k = clamp(drop.t / 0.35, 0, 1);
            const end = trip.line[trip.line.length - 1];
            const to = this.iso(end[0] + 0.5, end[1] + 0.5);
            x = lerp(x, to.x, k);
            y = lerp(y, to.y, k);
            if (trip.line.length && this.isHole(end[0], end[1])) squash = 1 - k * 0.8;
            else {
                y += k * k * s * 0.6;
                alpha = 1 - k;
            }
        }
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.scale(1, squash);
        ctx.translate(-x, -y);
        art.pile(ctx, x - s / 2, y - s * FOOT, s, pile.size, {});
        ctx.restore();
    }

    // The cranes' jibs, the tallest things on the site, over everything.
    drawAbove(ctx) {
        for (const [c, r] of this.tiles()) {
            const p = this.cells[r][c];
            if (!p || p.kind !== 'crane' || p.away) continue;
            const f = this.frameOf(c, r);
            const state = this.craneState(p);
            art.isoCraneTop(ctx, f, state);
            if (p.bird > 0) {
                const { perch } = art.craneSpots(f, state);
                bird(ctx, perch[0], perch[1], this.cell * 0.9, { facing: -1, flap: Math.PI / 2 });
            }
        }
    }

    // What is lit at night: windows, the hut, the lamps and the pools of ground they light, the
    // machines' beacons; moths at the lamps; the stars.
    drawNight(ctx) {
        const s = this.cell;
        const k = this.night;
        const glowCol = (alpha) => `rgba(255, 226, 154, ${alpha * k})`;
        for (const [c, r] of this.tiles()) {
            const p = this.cells[r][c];
            if (!p || p.away) continue;
            const { x, y } = this.cellRect(c, r);
            const by = y + s * FOOT;
            const f = this.frameOf(c, r);
            if (p.kind === 'lamp' && p.lit) {
                const head = { x: x + s / 2, y: by - s * 0.7 };
                ctx.globalCompositeOperation = 'screen';
                ellipse(ctx, x + s / 2, by, s * 0.95, s * 0.48);
                ctx.fillStyle = `rgba(150, 105, 35, ${0.32 * k})`;
                ctx.fill();
                ellipse(ctx, x + s / 2, by, s * 0.55, s * 0.27);
                ctx.fillStyle = `rgba(170, 120, 40, ${0.38 * k})`;
                ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
                disc(ctx, head.x, head.y, s * 0.16, glowCol(0.3));
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
                art.hutLights(ctx, f, k, p.door.value);
            } else if (p.kind === 'plot' && p.step > SET) {
                art.isoWindowsLit(ctx, f, p.step - SET, this.plotMask(c, r), glowCol);
            } else if (MACHINES.indexOf(p.kind) >= 0 && !p.trip) {
                this.beaconAt(ctx, p, x + s / 2, by, s, f);
            }
        }
        // The machines out on the site.
        for (const row of this.cells) {
            for (const p of row) {
                if (p && p.trip && p.trip.x !== undefined) {
                    const at = this.toScreen(p.trip.x, p.trip.y);
                    this.beaconAt(ctx, p, at.x, at.y, s);
                }
            }
        }
        this.drawStars(ctx);
    }

    // A machine's beacon, lit over the night: where each drawing puts it.
    beaconAt(ctx, p, cx, by, s, f) {
        const g = this.beaconGlow(p);
        if (g < 0.05) return;
        let at;
        if (p.kind === 'crane') {
            const [bx, bY] = art.craneSpots(f, this.craneState(p)).beacon;
            at = { x: bx, y: bY };
        } else if (p.kind === 'mixer') at = { x: cx + p.facing * s * 0.25, y: by - s * 0.41 };
        else if (p.kind === 'roller') at = { x: cx - p.facing * s * 0.13, y: by - s * 0.52 };
        else if (p.kind === 'paver') at = { x: cx - p.facing * s * 0.09, y: by - s * 0.6 };
        else {
            const local = { digger: [0.05, -0.725], truck: [0.295, -0.575], dozer: [-0.235, -0.655] }[p.kind];
            const [px, py] = p.kind === 'dozer' && !p.trip ? this.pushed(p) : [0, 0];
            at = toWorld(cx + px, by + py, s * MACHINE_K, { facing: p.facing }, local[0], local[1]);
        }
        disc(ctx, at.x, at.y, s * 0.07, `rgba(255, 214, 140, ${0.25 * g})`);
        disc(ctx, at.x, at.y, s * 0.025, `rgba(255, 226, 160, ${0.9 * g})`);
    }

    // A piece away from the board: in the tray, in a finger, or flying back. A road, a plot or a
    // filled hole is drawn as a square, which the board lays flat as the top of a tile.
    drawLoose(ctx, p, x, y, s) {
        const kind = p.kind;
        const cx = x + s / 2;
        const by = y + s * FOOT;
        if (kind === 'road') {
            const state = p.state || this.plan.road;
            if (state === 'marked') {
                fillRound(ctx, x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, s * 0.18, GROUND.plot);
                fillRound(ctx, x + s * 0.12, y + s * 0.49, s * 0.76, s * 0.02, s * 0.01, GROUND.string);
                for (const px of [0.2, 0.5, 0.8]) {
                    fillRound(
                        ctx,
                        x + s * px - s * 0.02,
                        y + s * 0.42,
                        s * 0.04,
                        s * 0.09,
                        s * 0.01,
                        GROUND.peg
                    );
                    disc(ctx, x + s * px, y + s * 0.42, s * 0.022, GROUND.string);
                }
                return;
            }
            const look = {
                dirt: [GROUND.dirtEdge, GROUND.dirt],
                rolled: [GROUND.rolledEdge, GROUND.rolled],
                paved: [GROUND.roadEdge, GROUND.road],
            }[state];
            fillRound(ctx, x + s * 0.08, y + s * 0.1, s * 0.84, s * 0.84, s * 0.2, look[0]);
            fillRound(ctx, x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8, s * 0.18, look[1]);
            if (state === 'paved')
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
        } else if (kind === 'fill') art.fillPatch(ctx, x, y, s);
        else if (kind === 'pile') art.pile(ctx, x, y, s, 2);
        else if (kind === 'digger')
            digger(ctx, cx - s * 0.12, by, s * 0.66, { boom: -0.9, stick: 1.6, bucket: 0.2 });
        else if (kind === 'truck') dumpTruck(ctx, cx, by, s * 0.8, {});
        else if (kind === 'mixer') art.mixer(ctx, cx, by, s * 0.9, { drum: 0.6 });
        else if (kind === 'crane') {
            const f = { cx: x + s * 0.36, cy: y + s * 0.9, tw: s * 0.6 };
            art.isoCraneMast(ctx, f, 0.95);
            art.isoCraneTop(ctx, f, { slew: -Math.PI / 2, reach: 0.85, drop: 0.35, mast: 0.95 });
        } else if (kind === 'cones') art.cone(ctx, x, y, s, 0, {});
        else if (kind === 'hut') art.isoHut(ctx, this.looseFrame(x, y, s), {});
        else if (kind === 'roller') art.roller(ctx, cx, by, s * 0.9, {});
        else if (kind === 'dozer') bulldozer(ctx, cx - s * 0.04, by, s * 0.8, { lift: 1 });
        else if (kind === 'paver') art.paver(ctx, cx + s * 0.02, by, s * 0.92, {});
        else if (kind === 'lamp') art.lamp(ctx, x, y, s, { on: 0 });
    }

    // The bare earth tile, as the tray shows it: a few specks on a square of side s.
    drawPlain(ctx, s) {
        for (const [x, y] of [
            [0.3, 0.3],
            [0.62, 0.26],
            [0.44, 0.56],
            [0.74, 0.66],
            [0.24, 0.72],
            [0.55, 0.82],
        ])
            disc(ctx, x * s, y * s, s * 0.025, GROUND.speck);
    }
}

// An angle the short way round from `from` to `to`.
function towards(from, to) {
    let a = to;
    while (a - from > Math.PI) a -= TAU;
    while (from - a > Math.PI) a += TAU;
    return a;
}

// The point `d` of the way along a line of tiles, in tiles.
function pointOn(line, d) {
    const i = clamp(Math.floor(d), 0, line.length - 2);
    const k = clamp(d - i, 0, 1);
    return [lerp(line[i][0], line[i + 1][0], k), lerp(line[i][1], line[i + 1][1], k)];
}

function hedgehogAt(ctx, x, y, s, facing, t) {
    art.hedgehog(ctx, x, y, s * 2.4, { facing, step: t * 12 });
}

// The site's picture on the shelf: a little island with a building, the crane and a truck.
function icon(ctx, x, y, w, h) {
    const tw = Math.min(w * 0.42, h * 0.62);
    const look = {
        base: GROUND.earth,
        alt: GROUND.earthAlt,
        lip: GROUND.edge,
        lipDark: shade(GROUND.edge, -0.1),
        side: SITE.earth,
        sideDark: shade(SITE.earth, -0.12),
    };
    const mid = iso.island(
        ctx,
        x + w / 2,
        y + h * 0.5 - tw * 0.22,
        tw,
        [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
        ],
        look,
        (c, r) => (c === 1 && r === 1 ? GROUND.road : null)
    );
    const [mx, my] = mid(1, 0);
    const crane = { cx: mx, cy: my, tw };
    art.isoCraneMast(ctx, crane, 0.62);
    const [bx, by] = mid(0, 0);
    art.isoBuilding(ctx, { cx: bx, cy: by, tw }, 2, 0, {});
    art.isoCraneTop(ctx, crane, { slew: Math.PI, reach: 0.8, drop: 0.2, mast: 0.62 });
    const [tx, ty] = mid(1, 1);
    dumpTruck(ctx, tx, ty, tw * 0.55, { load: 1, loadColour: SITE.earth });
}

export const toy = {
    id: 'site',
    title: 'Building site',
    about: 'Build a site from tiles on an empty table. Its machines work a step at a time: the digger digs, the crane lowers the forms, the mixer pours, the crane builds a floor at a time, and the trucks take the earth away. Tap the broom to sweep the island clean, and again to clear the table.',
    stages: [
        'a small site, 6 kinds of piece',
        'a bigger site, 9 kinds',
        'the biggest site, all 13 kinds, and roads to build',
    ],
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
            ['quack', {}],
            ['chirp', {}],
            ['chirp', { variant: 'peep', f: noteHz(0, 84) }],
            ['squeak', { f: 2600 }],
            ['squeak', { f: 1400 }],
            ['whoosh', { variant: 'up' }],
            ['whoosh', { variant: 'down' }],
            ['thud', { f: 70 }],
            ['thud', { f: 80 }],
            ['thud', { f: 90 }],
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
        for (let d = 3; d <= 14; d++) list.push(['wood', { f: noteHz(d, 60) }]);
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
