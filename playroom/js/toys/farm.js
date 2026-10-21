// The farm: a board of grass to build on, and a tray of pieces to build it with.
//
// After Pok Pok's builder rather than any Montessori material. Pieces are dragged from the tray onto
// the board, where they snap to a tile; dragged again, they move, swap places, or go back to the
// tray. Nothing is a goal and nothing is wrong: a pond can go anywhere and a cow can stand in a row
// of barns.
//
// Every piece does three things:
//   - it connects: paths, fields, ponds and fences join their neighbours; animals answer animals of
//     their own kind; a field by water grows on its own; a cow beside a pond drinks from it;
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
//   move   - drag pieces from the tray, and around the board.
//   make   - a farm, joined up: paths for the tractor to drive, fields beside water, a pond big
//            enough for ducks.

import { Scene } from '../stage.js';
import {
    SHADOW,
    makeLayer,
    freeLayer,
    grain,
    fillRound,
    disc,
    ellipse,
    woodPanel,
    PALETTE,
} from '../draw.js';
import { Spring, clamp, lerp, TAU, dist, rgbString, hexToRgb } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import * as art from './farmart.js';

const { FARM } = art;

const N = 1;
const E = 2;
const S = 4;
const W = 8;
const SIDES = [
    [0, -1, N],
    [1, 0, E],
    [0, 1, S],
    [-1, 0, W],
];
const AROUND = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
];

// The ground: flat pieces that join their neighbours and lie under everything else.
const GROUND = ['path', 'field', 'pond'];
const ANIMALS = ['cow', 'sheep', 'pig'];
const CROPS = ['carrot', 'pumpkin', 'sunflower', 'cabbage'];

// What each stage puts in the tray, how big the farm is, and the little farm it starts as.
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
        kinds: ['path', 'field', 'pond', 'tree', 'cow', 'tractor'],
        start: ['T..T.', 'PPPPP', 'FFR.W', 'FF.CW'],
    },
    {
        cols: 6,
        rows: 5,
        kinds: ['path', 'field', 'pond', 'fence', 'tree', 'barn', 'coop', 'cow', 'sheep', 'tractor'],
        start: ['T.B..T', 'PPPPPP', 'FFR.NN', 'FF.CSS', '.WW.H.'],
    },
    {
        cols: 7,
        rows: 5,
        kinds: [
            'path',
            'field',
            'pond',
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
        start: ['T.B..OT', 'PPPPPPP', 'FFR.NN.', 'FFMCSS.', 'GWW.H..'],
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

function key(c, r) {
    return c * 100 + r;
}

class FarmScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        const plan = PLANS[this.level];
        this.cols = plan.cols;
        this.rows = plan.rows;
        this.kinds = plan.kinds;
        this.rand = Math.random;
        this.time = 0;
        this.queue = [];
        this.fx = [];
        this.ducks = [];
        this.frog = null;
        this.frogClock = 1.5;
        this.growClock = 0;
        this.drag = null;
        this.ground = null;
        this.sprites = {};
        this.press = this.kinds.map(() => new Spring(0, 420, 18));
        this.sunPress = new Spring(0, 420, 18);

        // A fresh farm every time it comes off the shelf: the building is the game, so nothing is
        // kept, not even while the playroom is open.
        this.cells = [];
        for (let r = 0; r < this.rows; r++) {
            const row = [];
            for (let c = 0; c < this.cols; c++) {
                const code = plan.start[r][c];
                const piece = CODES[code] ? this.make(CODES[code]) : null;
                if (piece && piece.kind === 'field') piece.stage = 2;
                row.push(piece);
            }
            this.cells.push(row);
        }
        this.flowers = {};
        this.night = 0;
        this.nightTarget = 0;
        // Which hidden things have shown themselves this time out.
        this.found = new Set();
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
        }
        return p;
    }

    at(c, r) {
        if (!(c >= 0 && r >= 0 && c < this.cols && r < this.rows)) return null;
        return this.cells[r][c];
    }

    is(c, r, kind) {
        const p = this.at(c, r);
        return !!p && p.kind === kind;
    }

    // The sides on which a tile joins a neighbour of its own kind.
    mask(c, r) {
        const p = this.at(c, r);
        if (!p) return 0;
        let m = 0;
        for (const [dc, dr, bit] of SIDES) if (this.is(c + dc, r + dr, p.kind)) m |= bit;
        return m;
    }

    // Tiles of one kind joined to (c, r), in order of distance from it.
    component(c, r, kind) {
        if (!this.is(c, r, kind)) return [];
        const seen = new Set([key(c, r)]);
        const out = [[c, r]];
        for (let i = 0; i < out.length; i++) {
            const [cc, rr] = out[i];
            for (const [dc, dr] of SIDES) {
                const nc = cc + dc;
                const nr = rr + dr;
                if (!seen.has(key(nc, nr)) && this.is(nc, nr, kind)) {
                    seen.add(key(nc, nr));
                    out.push([nc, nr]);
                }
            }
        }
        return out;
    }

    beside(c, r, kind, diagonal = false) {
        const list = diagonal ? AROUND : SIDES;
        const out = [];
        for (const [dc, dr] of list) if (this.is(c + dc, r + dr, kind)) out.push([c + dc, r + dr]);
        return out;
    }

    chance(p) {
        return this.rand() < p;
    }

    // A hidden thing shows itself the first time it can, each time the farm comes out, and half the
    // time or more after that: a three-year-old should find them, not hope to.
    surprise(name, p) {
        if (!this.found.has(name)) {
            this.found.add(name);
            return true;
        }
        return this.chance(p);
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
                if (p && p.kind === 'pig')
                    p.muddy = this.beside(c, r, 'pond').length > 0 && this.time >= p.clean;
            }
        }
        this.updateDucks(quiet);
        if (this.frog && !this.is(this.frog.c, this.frog.r, 'pond')) this.frog = null;
    }

    //--------------------------------------------------------------------------
    // Layout

    layout() {
        freeLayer(this.ground);
        const { w, h, u } = this;
        const n = this.kinds.length;
        const margin = 16 * u;
        let trayRows = 1;
        let item = Math.min(80 * u, (w - margin * 2) / n - 10 * u);
        if (item < 58 * u) {
            trayRows = 2;
            item = Math.min(80 * u, (w - margin * 2) / Math.ceil(n / 2) - 10 * u);
        }
        const gap = 10 * u;
        const trayH = trayRows * (item + gap) + 22 * u;
        this.trayTop = h - trayH;
        const top = 92 * u;
        const availH = this.trayTop - top - 18 * u;
        const availW = w - margin * 2;
        const s = Math.floor(Math.min(availW / this.cols, availH / this.rows, 170 * u));
        this.cell = s;
        this.bx = Math.round((w - s * this.cols) / 2);
        this.by = Math.round(top + (availH - s * this.rows) / 2);
        this.boardW = s * this.cols;
        this.boardH = s * this.rows;

        this.tray = [];
        const perRow = Math.ceil(n / trayRows);
        for (let i = 0; i < n; i++) {
            const row = Math.floor(i / perRow);
            const inRow = Math.min(perRow, n - row * perRow);
            const rowW = inRow * (item + gap) - gap;
            const col = i - row * perRow;
            this.tray.push({
                kind: this.kinds[i],
                x: (w - rowW) / 2 + col * (item + gap),
                y: this.trayTop + 14 * u + row * (item + gap),
                s: item,
            });
        }
        this.sunButton = { x: w - 48, y: 48, r: 30 };
        this.freeSprites();
        // The ducks were placed before the board had a size, or for another one: put them back on
        // their water.
        for (const family of this.ducks) this.seatDucks(family);
        this.drawGround();
    }

    // A piece at rest drawn once into its own small layer, and copied from there each frame: an
    // old iPad redraws a barn sixty times a second only if it has to.
    sprite(id, draw) {
        let layer = this.sprites[id];
        if (!layer) {
            const s = this.cell;
            layer = makeLayer(s, s, this.scale);
            draw(layer.ctx, s);
            this.sprites[id] = layer;
        }
        return layer;
    }

    freeSprites() {
        for (const id of Object.keys(this.sprites || {})) freeLayer(this.sprites[id]);
        this.sprites = {};
    }

    blit(ctx, id, x, y, s, draw) {
        ctx.drawImage(this.sprite(id, draw).canvas, x, y, s, s);
    }

    cellRect(c, r) {
        return { x: this.bx + c * this.cell, y: this.by + r * this.cell, s: this.cell };
    }

    cellAt(x, y) {
        const c = Math.floor((x - this.bx) / this.cell);
        const r = Math.floor((y - this.by) / this.cell);
        if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
        return [c, r];
    }

    trayItem(kind) {
        return this.tray.find((t) => t.kind === kind);
    }

    trayAt(x, y) {
        for (let i = 0; i < this.tray.length; i++) {
            const t = this.tray[i];
            if (x > t.x - 4 && x < t.x + t.s + 4 && y > t.y - 4 && y < t.y + t.s + 4) return i;
        }
        return -1;
    }

    pan(x) {
        return clamp((x / this.w) * 2 - 1, -1, 1);
    }

    //--------------------------------------------------------------------------
    // The ground: grass, then fields, ponds and paths, drawn once into a layer and again whenever
    // a ground piece moves.

    drawGround() {
        freeLayer(this.ground);
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, this.trayTop);
        sky.addColorStop(0, '#EEF2E1');
        sky.addColorStop(1, '#E4ECD3');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        const s = this.cell;
        const pad = 12 * u;
        fillRound(
            ctx,
            this.bx - pad,
            this.by - pad + 7 * u,
            this.boardW + pad * 2,
            this.boardH + pad * 2,
            26 * u,
            SHADOW
        );
        fillRound(
            ctx,
            this.bx - pad,
            this.by - pad,
            this.boardW + pad * 2,
            this.boardH + pad * 2,
            26 * u,
            FARM.grassEdge
        );
        fillRound(
            ctx,
            this.bx - pad * 0.5,
            this.by - pad * 0.5,
            this.boardW + pad,
            this.boardH + pad,
            20 * u,
            FARM.grass
        );
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if ((r + c) % 2) {
                    ctx.fillStyle = FARM.grassAlt;
                    ctx.fillRect(this.bx + c * s, this.by + r * s, s, s);
                }
            }
        }
        // A few tufts, so the grass is grass.
        ctx.strokeStyle = 'rgba(140, 175, 105, 0.45)';
        ctx.lineWidth = Math.max(1, s * 0.012);
        ctx.lineCap = 'round';
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
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

        this.blob(ctx, 'pond', s * 0.04, s * 0.2, FARM.reed);
        this.blob(ctx, 'pond', s * 0.07, s * 0.18, FARM.waterDeep);
        this.blob(ctx, 'pond', s * 0.1, s * 0.15, FARM.water);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, 'pond')) continue;
                const { x, y } = this.cellRect(c, r);
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
                const { x, y } = this.cellRect(c, r);
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
            if (this.at(c, r)) continue;
            for (const f of this.flowers[id])
                art.flower(ctx, this.bx + (c + f.x) * s, this.by + (r + f.y) * s, s, f.colour);
        }

        grain(ctx, 0, 0, w, this.trayTop, 0.22, this.scale);
        woodPanel(ctx, -10, this.trayTop, w + 20, h - this.trayTop + 10, 0, PALETTE.wood, 41, this.scale);
        this.ground = layer;
    }

    // A joined shape: each tile a rounded square, pushed out to meet any neighbour of its kind, with
    // only its outside corners rounded.
    blob(ctx, kind, inset, radius, colour) {
        const s = this.cell;
        ctx.fillStyle = colour;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, kind)) continue;
                const m = this.mask(c, r);
                const x0 = this.bx + c * s + (m & W ? 0 : inset);
                const x1 = this.bx + (c + 1) * s - (m & E ? 0 : inset);
                const y0 = this.by + r * s + (m & N ? 0 : inset);
                const y1 = this.by + (r + 1) * s - (m & S ? 0 : inset);
                const tl = m & (N | W) ? 0 : radius;
                const tr = m & (N | E) ? 0 : radius;
                const br = m & (S | E) ? 0 : radius;
                const bl = m & (S | W) ? 0 : radius;
                ctx.beginPath();
                ctx.moveTo(x0 + tl, y0);
                ctx.lineTo(x1 - tr, y0);
                if (tr) ctx.arcTo(x1, y0, x1, y0 + tr, tr);
                ctx.lineTo(x1, y1 - br);
                if (br) ctx.arcTo(x1, y1, x1 - br, y1, br);
                ctx.lineTo(x0 + bl, y1);
                if (bl) ctx.arcTo(x0, y1, x0, y1 - bl, bl);
                ctx.lineTo(x0, y0 + tl);
                if (tl) ctx.arcTo(x0, y0, x0 + tl, y0, tl);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    drawPaths(ctx, width, colour) {
        const s = this.cell;
        ctx.strokeStyle = colour;
        ctx.fillStyle = colour;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, 'path')) continue;
                const x = this.bx + (c + 0.5) * s;
                const y = this.by + (r + 0.5) * s;
                disc(ctx, x, y, width / 2, colour);
                const m = this.mask(c, r);
                ctx.beginPath();
                if (m & E) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + s, y);
                }
                if (m & S) {
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, y + s);
                }
                ctx.stroke();
            }
        }
    }

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

        const was = this.night;
        this.night += (this.nightTarget - this.night) * (1 - Math.exp(-dt / 0.7));
        if (Math.abs(this.night - this.nightTarget) < 0.002) this.night = this.nightTarget;
        if (was < 0.6 && this.night >= 0.6) this.dusk();
        if (was > 0.4 && this.night <= 0.4) this.dawn();

        for (const p of this.press) p.update(dt);
        this.sunPress.update(dt);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.cells[r][c];
                if (p) this.updatePiece(p, c, r, dt);
            }
        }

        // A field beside water grows by itself, a stage every few seconds.
        this.growClock += dt;
        if (this.growClock > 8) {
            this.growClock = 0;
            this.growByWater();
        }

        this.updateDucks(true, dt);
        this.updateFrog(dt);

        this.fx = this.fx.filter((f) => {
            f.t += dt;
            return f.update ? f.update(dt, f) !== false && f.t < f.life : f.t < f.life;
        });
        return true;
    }

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
                    const water = this.beside(c, r, 'pond');
                    if (water.length && this.night < 0.5) {
                        const [wc] = water[0];
                        if (wc !== c) p.facing = wc > c ? 1 : -1;
                        p.dip.target = 1;
                        this.later(1.6, () => (p.dip.target = 0));
                    }
                }
            }
            if (
                p.kind === 'pig' &&
                p.muddy === false &&
                this.time >= p.clean &&
                this.beside(c, r, 'pond').length
            ) {
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
    // Input

    down(p) {
        const u = this.u;
        if (dist(p.x, p.y, this.sunButton.x, this.sunButton.y) < this.sunButton.r + 10 * u) {
            p.owner = { type: 'sun' };
            this.sunPress.kick(-6);
            return;
        }
        const target = this.targetAt(p.x, p.y);
        if (target) {
            p.owner = { type: 'target', target };
            return;
        }
        const t = this.trayAt(p.x, p.y);
        if (t >= 0) {
            p.owner = { type: 'tray', index: t, kind: this.kinds[t] };
            this.press[t].kick(-5);
            return;
        }
        const cell = this.cellAt(p.x, p.y);
        if (!cell) return;
        const [c, r] = cell;
        const piece = this.at(c, r);
        if (piece && piece.away) return;
        p.owner = { type: piece ? 'piece' : 'grass', c, r };
    }

    move(p) {
        if (this.drag) {
            if (this.drag.pointer === p) {
                this.drag.x = p.x;
                this.drag.y = p.y;
            }
            return;
        }
        const o = p.owner;
        if (!o) return;
        if (o.type === 'tray' && p.travel > 6 * this.u) {
            this.drag = { pointer: p, piece: this.make(o.kind), from: null, x: p.x, y: p.y };
            audio.play('tick', { f: noteHz(5, 72) }, { gain: 0.4, pan: this.pan(p.x) });
        } else if (o.type === 'piece' && p.travel > 8 * this.u) {
            const piece = this.at(o.c, o.r);
            if (!piece) return;
            this.cells[o.r][o.c] = null;
            this.drag = { pointer: p, piece, from: [o.c, o.r], x: p.x, y: p.y };
            audio.play('tick', { f: noteHz(3, 72) }, { gain: 0.4, pan: this.pan(p.x) });
            if (GROUND.indexOf(piece.kind) >= 0) this.drawGround();
            this.normalise(true);
        }
    }

    up(p) {
        const o = p.owner;
        if (this.drag && this.drag.pointer === p) {
            this.drop(p);
            return;
        }
        if (!o) return;
        if (o.type === 'sun') {
            if (dist(p.x, p.y, this.sunButton.x, this.sunButton.y) < this.sunButton.r + 20 * this.u)
                this.toggleNight();
        } else if (o.type === 'target') {
            o.target.tap();
        } else if (o.type === 'tray') {
            // A tap on a tray piece lets it speak for itself.
            const t = this.tray[o.index];
            this.press[o.index].kick(8);
            this.voice(o.kind, t.x + t.s / 2, 0.7);
        } else if (o.type === 'piece') {
            this.tap(o.c, o.r, p);
        } else if (o.type === 'grass') {
            this.tapGrass(o.c, o.r, p);
        }
    }

    cancel(p) {
        if (this.drag && this.drag.pointer === p) {
            const d = this.drag;
            this.drag = null;
            if (d.from && !this.at(d.from[0], d.from[1])) this.put(d.from[0], d.from[1], d.piece, true);
        }
    }

    // Where a dragged piece would land: the tile under the piece, which is drawn a little above the
    // finger so the finger does not hide it.
    landing(d) {
        return this.cellAt(d.x, d.y - this.cell * 0.2);
    }

    drop() {
        const d = this.drag;
        this.drag = null;
        const cell = this.landing(d);
        const overTray = d.y > this.trayTop - 4 * this.u;
        if (!cell) {
            if (d.from && overTray) {
                this.poof(d.piece, d.x, d.y);
            } else if (d.from) {
                this.put(d.from[0], d.from[1], d.piece, true);
            }
            if (GROUND.indexOf(d.piece.kind) >= 0) this.drawGround();
            this.normalise();
            return;
        }
        const [c, r] = cell;
        const there = this.at(c, r);
        if (there && there !== d.piece) {
            // Dropped on another piece: from the tray it takes the tile, and the other goes back to the
            // tray; from the board, the two swap places.
            this.cells[r][c] = null;
            if (d.from) this.put(d.from[0], d.from[1], there, true);
            else {
                const rect = this.cellRect(c, r);
                this.poof(there, rect.x + rect.s / 2, rect.y + rect.s / 2);
            }
        }
        this.put(c, r, d.piece);
    }

    // Place a piece and let it, and anything it joins, say so.
    put(c, r, piece, quiet = false) {
        this.cells[r][c] = piece;
        piece.away = null;
        if (piece.trip) piece.trip = null;
        piece.bounce.kick(quiet ? 4 : 10);
        const flowered = !!this.flowers[key(c, r)];
        delete this.flowers[key(c, r)];
        const ground = GROUND.indexOf(piece.kind) >= 0;
        if (ground || flowered) this.drawGround();
        this.normalise(quiet);
        if (quiet) return;
        const rect = this.cellRect(c, r);
        this.voice(piece.kind, rect.x + rect.s / 2, 1);
        if (ground || piece.kind === 'fence') {
            // Joined neighbours bounce one after another, climbing, as if passing the news along.
            const joined = this.component(c, r, piece.kind).slice(1, 9);
            joined.forEach(([cc, rr], i) =>
                this.later(0.1 + i * 0.07, () => {
                    const n = this.at(cc, rr);
                    if (!n || n.kind !== piece.kind) return;
                    n.bounce.kick(7);
                    audio.note('marimba', 5 + i, 60, { gain: 0.35, pan: this.pan(this.cellRect(cc, rr).x) });
                })
            );
        }
        if (ANIMALS.indexOf(piece.kind) >= 0) piece.facing = c < this.cols / 2 ? 1 : -1;
    }

    // A piece going back to the tray, which it flies to as it shrinks.
    poof(piece, x, y) {
        const item = this.trayItem(piece.kind);
        const to = item ? { x: item.x + item.s / 2, y: item.y + item.s / 2 } : { x, y: this.h };
        this.puff(x, y, 1);
        audio.play('whoosh', { variant: 'down' }, { gain: 0.4, pan: this.pan(x) });
        const s = this.cell;
        this.fx.push({
            t: 0,
            life: 0.45,
            draw: (ctx, f) => {
                const k = f.t / f.life;
                const px = lerp(x, to.x, k);
                const py = lerp(y, to.y, k) - Math.sin(k * Math.PI) * s * 0.4;
                ctx.save();
                ctx.translate(px, py);
                ctx.scale(1 - k * 0.6, 1 - k * 0.6);
                this.drawLoose(ctx, piece, -s / 2, -s / 2, s);
                ctx.restore();
            },
        });
    }

    // Each kind's own sound, for being placed, or tapped in the tray.
    voice(kind, x, gain) {
        const pan = this.pan(x);
        if (kind === 'path') audio.play('pat', {}, { gain, pan });
        else if (kind === 'field') {
            audio.play('thud', { f: 110 }, { gain: gain * 0.7, pan });
            audio.play('rustle', {}, { gain: gain * 0.5, pan, delay: 0.05 });
        } else if (kind === 'pond') audio.note('drop', 5, 60, { gain, pan, wet: 0.3 });
        else if (kind === 'tree') audio.play('rustle', {}, { gain, pan });
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

    tap(c, r, p) {
        const piece = this.at(c, r);
        if (!piece || piece.away) return;
        piece.bounce.kick(5);
        const kind = piece.kind;
        if (kind === 'field') this.tapField(c, r);
        else if (kind === 'pond') this.tapPond(c, r, p.x, p.y);
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

    tapGrass(c, r, p) {
        const id = key(c, r);
        const list = this.flowers[id] || (this.flowers[id] = []);
        const s = this.cell;
        const rect = this.cellRect(c, r);
        const fx = clamp((p.x - rect.x) / s, 0.12, 0.88);
        const fy = clamp((p.y - rect.y) / s, 0.15, 0.88);
        const colour = FLOWERS[Math.floor(this.rand() * FLOWERS.length)];
        if (list.length >= 5) list.shift();
        list.push({ x: fx, y: fy, colour });
        this.fx.push({
            t: 0,
            life: 0.3,
            draw: (ctx, f) => {
                const k = 1.4 - 0.4 * (f.t / f.life);
                ctx.save();
                ctx.translate(p.x, p.y);
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
                    pan: this.pan(this.cellRect(c, r).x),
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
                const rect = this.cellRect(c, r);
                const cx = rect.x + s / 2;
                const cy = rect.y + s / 2;
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
                const wet = cells.find(([cc, rr]) => this.beside(cc, rr, 'pond').length);
                if (!wet) continue;
                const [pc, pr] = this.beside(wet[0], wet[1], 'pond')[0];
                const from = this.cellRect(pc, pr);
                const to = this.cellRect(wet[0], wet[1]);
                for (let k = 0; k < 3; k++) {
                    this.travel(
                        from.x + from.s / 2,
                        from.y + from.s / 2,
                        to.x + to.s / 2,
                        to.y + to.s / 2,
                        wait + k * 0.12,
                        FARM.waterLight
                    );
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
        const degree = 3 + Math.round((9 * (x - this.bx)) / this.boardW);
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
                    const rect = this.cellRect(c, r);
                    f.goal = {
                        x: rect.x + s * (0.3 + this.rand() * 0.4),
                        y: rect.y + s * (0.35 + this.rand() * 0.4),
                    };
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
                    const rect = this.cellRect(c, r);
                    b.x = rect.x + s / 2;
                    b.y = rect.y + s / 2;
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
        const s = this.cell;
        const [c, r] = family.cells[0];
        const rect = this.cellRect(c, r);
        family.goal = null;
        family.birds.forEach((b, i) => {
            b.x = rect.x + s / 2 - i * s * 0.14;
            b.y = rect.y + s / 2;
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
        const points = route.map(([cc, rr]) => {
            const rect = this.cellRect(cc, rr);
            return { x: rect.x + s / 2, y: rect.y + s * 0.6 };
        });
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
        if (p.cat > 0 && pointer.y < rect.y + s * 0.24) {
            p.cat = 0.01;
            this.catJump(rect.x + s * 0.7, rect.y + s * 0.18);
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
        const s = this.cell;
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
        this.smoke(rect.x + s * 0.67, rect.y + s * 0.18);
        const door = { x: rect.x + s / 2, y: rect.y + s * 0.88 };
        const fields = [];
        for (const [fc, fr] of this.beside(c, r, 'field')) {
            if (
                fields.some((f) => this.component(f[0], f[1], 'field').some(([a, b]) => a === fc && b === fr))
            )
                continue;
            fields.push([fc, fr]);
        }
        const stops = fields.map(([fc, fr]) => {
            const fRect = this.cellRect(fc, fr);
            return { x: fRect.x + s / 2, y: fRect.y + s * 0.75, cells: this.component(fc, fr, 'field') };
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
                const to = this.cellRect(fc, fr);
                for (let k = 0; k < 4; k++)
                    this.travel(
                        rect.x + s / 2,
                        rect.y + s * 0.35,
                        to.x + to.s / 2,
                        to.y + to.s / 2,
                        k * 0.1,
                        '#FFF6D6'
                    );
                this.growField(cells, 0.5, true);
            }
        }
        if (p.rider <= 0 && this.night < 0.5 && this.surprise('rider', 0.6)) {
            p.rider = 5;
            this.later(5, () => audio.play('chirp', {}, { gain: 0.6, pan: this.pan(rect.x) }));
            this.later(5, () =>
                this.flight({ x: rect.x + s / 2, y: rect.y }, { x: rect.x + s / 2 + s, y: -s }, 0, 'bird')
            );
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
        const door = { x: rect.x + s * 0.62, y: rect.y + s * 0.86 };
        const field = this.beside(c, r, 'field')[0];
        const spots = [0, 1].map((i) => {
            if (field) {
                const fRect = this.cellRect(field[0], field[1]);
                return { x: fRect.x + s * (0.35 + i * 0.3), y: fRect.y + s * 0.8 };
            }
            return { x: rect.x + s * (0.25 + i * 0.5), y: rect.y + s * 0.95 };
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
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const x = rect.x + s * 0.82;
        const y = rect.y + s * 0.9;
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
        const door = { x: rect.x + s * 0.5, y: rect.y + s * 0.7 };
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
        const post = { x: rect.x + s / 2, y: rect.y + s * 0.39 };
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

    // Every tile of the path joined to `start`, walked tile to tile and back again, as a child walks a
    // maze with a finger. Long paths are walked part way and back.
    tour(start) {
        const route = [start];
        const seen = new Set([key(start[0], start[1])]);
        const visit = (c, r) => {
            for (const [dc, dr] of SIDES) {
                const nc = c + dc;
                const nr = r + dr;
                if (seen.has(key(nc, nr)) || !this.is(nc, nr, 'path')) continue;
                seen.add(key(nc, nr));
                route.push([nc, nr]);
                visit(nc, nr);
                route.push([c, r]);
            }
        };
        visit(start[0], start[1]);
        if (route.length > 36) {
            const out = route.slice(0, 18);
            return out.concat(out.slice(0, -1).reverse());
        }
        return route;
    }

    drive(p, c, r, dt) {
        const trip = p.trip;
        const s = this.cell;
        const speed = 2.1;
        trip.d += dt * speed;
        trip.beat -= dt;
        if (trip.beat <= 0) {
            trip.beat = 0.16;
            audio.play('putt', {}, { gain: 0.9, pan: this.pan(this.bx + (trip.x || 0)) });
        }
        const i = Math.floor(trip.d);
        if (i >= trip.points.length - 1) {
            p.trip = null;
            p.away = null;
            p.bounce.kick(8);
            audio.play('toot', { f: noteHz(5, 60) }, { gain: 0.8, pan: this.pan(this.cellRect(c, r).x) });
            if (trip.load > 0) this.unload(c, r, trip.load);
            return;
        }
        const k = trip.d - i;
        const [ac, ar] = trip.points[i];
        const [bc, br] = trip.points[i + 1];
        trip.x = (lerp(ac, bc, k) + 0.5) * s;
        trip.y = (lerp(ar, br, k) + 0.5) * s;
        if (bc !== ac) p.facing = bc > ac ? 1 : -1;
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
                audio.play('toot', { f: noteHz(3, 60) }, { gain: 0.7, pan: this.pan(this.bx + trip.x) });
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
                    tx = this.bx + tractor.trip.x - tractor.facing * s * 0.4;
                    ty = this.by + tractor.trip.y - s * 0.1;
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
        const rect = this.cellRect(c, r);
        const s = this.cell;
        const x = rect.x + s / 2;
        const y = rect.y + s * 0.7;
        const dir = c < this.cols / 2 ? -1 : 1;
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

    puff(x, y, size) {
        const s = this.cell;
        for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TAU + this.rand();
            this.fx.push({
                t: 0,
                life: 0.6,
                draw: (ctx, f) => {
                    const k = f.t / f.life;
                    disc(
                        ctx,
                        x + Math.cos(a) * s * 0.12 * k * size,
                        y + Math.sin(a) * s * 0.05 * k * size - k * s * 0.05,
                        s * 0.04 * size * (1 - k * 0.5),
                        `rgba(240, 230, 210, ${0.8 * (1 - k)})`
                    );
                },
            });
        }
    }

    sparkleAt(x, y, delay = 0) {
        const s = this.cell;
        this.fx.push({
            t: -delay,
            life: 0.7,
            top: true,
            draw: (ctx, f) => {
                if (f.t < 0) return;
                const k = f.t / f.life;
                art.sparkle(ctx, x, y - k * s * 0.1, s * 0.04 * Math.sin(k * Math.PI), '#FFF6D6');
            },
        });
    }

    // Something travelling between two pieces: water from a pond to a field, wind from a windmill.
    travel(x0, y0, x1, y1, delay, colour) {
        const s = this.cell;
        this.fx.push({
            t: -delay,
            life: 0.8,
            top: true,
            draw: (ctx, f) => {
                if (f.t < 0) return;
                const k = f.t / f.life;
                const x = lerp(x0, x1, k);
                const y = lerp(y0, y1, k) - Math.sin(k * Math.PI) * s * 0.25;
                art.sparkle(ctx, x, y, s * 0.035 * (0.6 + 0.4 * Math.sin(k * Math.PI)), colour);
            },
        });
    }

    //--------------------------------------------------------------------------
    // Things to touch that are not pieces: the frog, an egg, a perched bird, the owl, a cat.

    targetAt(x, y) {
        const s = this.cell;
        const near = (tx, ty, r) => dist(x, y, tx, ty) < r;
        if (this.frog) {
            const pad = this.padOf(this.frog.c, this.frog.r);
            if (near(pad.x, pad.y - s * 0.05, s * 0.14)) return { tap: () => this.frogLeap() };
        }
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.at(c, r);
                if (!p) continue;
                const rect = this.cellRect(c, r);
                if (p.kind === 'coop' && p.egg && near(rect.x + s * 0.82, rect.y + s * 0.87, s * 0.12)) {
                    return { tap: () => this.hatch(c, r, p) };
                }
                if (
                    p.kind === 'barn' &&
                    this.night > 0.5 &&
                    near(rect.x + s / 2, rect.y + s * 0.3, s * 0.12)
                ) {
                    return { tap: () => this.owlHoot(c, r, p) };
                }
                if (
                    p.kind === 'house' &&
                    p.cat > 0 &&
                    this.night < 0.5 &&
                    near(rect.x + s * 0.32, rect.y + s * 0.6, s * 0.1)
                ) {
                    return {
                        tap: () => {
                            audio.play('meow', { f: noteHz(6, 60) }, { gain: 0.8, pan: this.pan(rect.x) });
                            p.cat = 0.6;
                        },
                    };
                }
                if (
                    p.kind === 'fence' &&
                    p.snail > 0 &&
                    near(this.snailX(rect, p), rect.y + s * 0.5, s * 0.1)
                ) {
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

    snailX(rect, p) {
        return rect.x + this.cell * (0.15 + Math.min(0.7, p.snail * 0.03));
    }

    frogLeap() {
        const f = this.frog;
        if (!f) return;
        this.frog = null;
        this.frogClock = 3 + this.rand() * 4;
        const s = this.cell;
        const pad = this.padOf(f.c, f.r);
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
                    art.hen(ctx, rect.x + s / 2, rect.y + s * 0.24, s, {
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
        const home = this.cellRect(c, r);
        const door = this.cellRect(barn[0], barn[1]);
        const a = { x: home.x + s / 2, y: home.y + s * 0.82 };
        const b = { x: door.x + s / 2, y: door.y + s * 0.86 };
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

    draw(ctx) {
        const s = this.cell;
        const u = this.u;
        ctx.drawImage(this.ground.canvas, 0, 0, this.w, this.h);

        if (this.drag) {
            const cell = this.landing(this.drag);
            if (cell) {
                const rect = this.cellRect(cell[0], cell[1]);
                fillRound(
                    ctx,
                    rect.x + 4 * u,
                    rect.y + 4 * u,
                    s - 8 * u,
                    s - 8 * u,
                    14 * u,
                    'rgba(255, 252, 240, 0.45)'
                );
            }
        }

        // Crops, then the water's life, then everything standing, row by row.
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.cells[r][c];
                if (!p || p.kind !== 'field' || p.stage <= 0) continue;
                const rect = this.cellRect(c, r);
                const planting = (p.seed + c * 5 + r * 3) % 4;
                const id = `crops:${p.stage}:${p.crop}:${p.giant ? 'giant' : planting}`;
                const lift = clamp(p.pop.value, -20, 20) * s * 0.0015;
                this.blit(ctx, id, rect.x, rect.y - lift, s, (g, ss) =>
                    art.crops(g, 0, 0, ss, p.stage, p.crop, planting, 0, p.giant)
                );
            }
        }
        for (const f of this.fx) if (f.water) f.draw(ctx, f);
        if (this.frog) {
            const pad = this.padOf(this.frog.c, this.frog.r);
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

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.cells[r][c];
                if (!p || GROUND.indexOf(p.kind) >= 0 || p.away) continue;
                const rect = this.cellRect(c, r);
                this.drawPiece(ctx, p, c, r, rect.x, rect.y, s);
            }
        }
        // The tractor out on its rounds.
        for (const row of this.cells) {
            for (const p of row) {
                if (p && p.kind === 'tractor' && p.trip && p.trip.x !== undefined) {
                    const x = this.bx + p.trip.x;
                    const y = this.by + p.trip.y + s * 0.32;
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
                }
            }
        }

        for (const f of this.fx) if (!f.top && !f.water) f.draw(ctx, f);

        // Night: the farm turns moonlit blue (multiplied, so colours deepen rather than grey), and
        // what has a light in it, glows.
        if (this.night > 0.01) {
            const k = this.night;
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = rgbString([255 - 135 * k, 255 - 122 * k, 255 - 62 * k]);
            ctx.fillRect(0, 0, this.w, this.trayTop);
            ctx.globalCompositeOperation = 'source-over';
            this.drawNight(ctx);
        }

        for (const f of this.fx) if (f.top) f.draw(ctx, f);

        this.drawTray(ctx);
        this.drawSun(ctx);

        if (this.drag) {
            const d = this.drag;
            ctx.save();
            ctx.translate(d.x, d.y - s * 0.2);
            ctx.scale(1.08, 1.08);
            fillRound(
                ctx,
                -s * 0.42 + 6 * u,
                -s * 0.42 + 12 * u,
                s * 0.84,
                s * 0.84,
                16 * u,
                'rgba(112, 84, 58, 0.12)'
            );
            this.drawLoose(ctx, d.piece, -s / 2, -s / 2, s);
            ctx.restore();
        }
    }

    drawPiece(ctx, p, c, r, x, y, s) {
        const b = p.bounce.value * 0.01;
        ctx.save();
        ctx.translate(x + s / 2, y + s * 0.86);
        ctx.scale(1 + b, 1 - b * 1.2);
        ctx.translate(-(x + s / 2), -(y + s * 0.86));
        const kind = p.kind;
        const still = (spring) => Math.abs(spring.value) < 0.004 && Math.abs(spring.velocity) < 0.01;
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
                this.blit(ctx, 'barn', x, y, s, (g, ss) => art.barn(g, 0, 0, ss, {}));
            else {
                art.barn(ctx, x, y, s, {
                    door: clamp(p.door.value, 0, 1),
                    inside: (inner, cx2, by2, ss) => this.barnInside(inner, c, r, cx2, by2, ss),
                });
            }
            if (p.cat > 0 && this.night < 0.5) art.cat(ctx, x + s * 0.7, y + s * 0.2, s, { sleep: true });
        } else if (kind === 'house') {
            if (p.door.value < 0.005 && p.door.target === 0)
                this.blit(ctx, 'house', x, y, s, (g, ss) => art.house(g, 0, 0, ss, {}));
            else art.house(ctx, x, y, s, { door: clamp(p.door.value, 0, 1) });
            if (p.cat > 0 && this.night < 0.5) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(x + s * 0.26, y + s * 0.54, s * 0.12, s * 0.11);
                ctx.clip();
                art.cat(ctx, x + s * 0.32, y + s * 0.66, s * 0.8, {});
                ctx.restore();
            }
        } else if (kind === 'windmill') {
            this.blit(ctx, 'windmill', x, y, s, (g, ss) => art.windmill(g, 0, 0, ss, { sails: false }));
            art.windmillSails(ctx, x, y, s, p.angle);
            if (p.rider > 0) {
                const a = p.angle - Math.PI / 2;
                art.bird(
                    ctx,
                    x + s / 2 + Math.cos(a) * s * 0.28,
                    y + s * 0.35 + Math.sin(a) * s * 0.28,
                    s * 0.8,
                    { flap: Math.PI / 2 }
                );
            }
        } else if (kind === 'coop') {
            this.blit(ctx, 'coop', x, y, s, (g, ss) => art.coop(g, 0, 0, ss, {}));
            if (p.egg) art.egg(ctx, x + s * 0.82, y + s * 0.9, s);
        } else if (kind === 'fence') {
            const m = this.mask(c, r);
            this.blit(ctx, `fence:${m}`, x, y, s, (g, ss) => art.fence(g, 0, 0, ss, m));
            if (p.bird > 0) art.bird(ctx, x + s / 2, y + s * 0.37, s, { facing: 1, flap: Math.PI / 2 });
            if (p.snail > 0) art.snail(ctx, this.snailX({ x }, p), y + s * 0.51, s, p.snail > 25 ? 1 : 0);
        } else if (kind === 'tractor') {
            if (still(p.act)) {
                this.blit(ctx, `tractor:${p.facing}`, x, y, s, (g, ss) =>
                    art.tractor(g, ss * 0.6, ss * 0.84, ss * 0.85, { facing: p.facing })
                );
            } else {
                const hop = Math.abs(Math.sin(p.act.value)) * s * 0.02;
                art.tractor(ctx, x + s * 0.6, y + s * 0.84 - hop, s * 0.85, {
                    facing: p.facing,
                    bounce: p.act.value * 0.3,
                });
            }
        } else if (ANIMALS.indexOf(kind) >= 0) {
            this.drawAnimal(ctx, p, x + s / 2, y + s * 0.84, s, {});
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

    // What the open barn door shows: by day a cow looking out, by night the sleepers in the hay.
    barnInside(ctx, c, r, cx, by, s) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(cx - s * 0.19, by - s * 0.32, s * 0.38, s * 0.32);
        ctx.clip();
        const sleepers = this.sleepersIn(c, r);
        if (this.night > 0.5 && sleepers.length) {
            sleepers.slice(0, 2).forEach((a, i) =>
                this.drawAnimal(ctx, a, cx + (i - 0.5) * s * 0.16, by, s * 0.55, {
                    sleep: true,
                    facing: i ? -1 : 1,
                })
            );
        } else {
            art.cow(ctx, cx - s * 0.06, by + s * 0.02, s * 0.75, { facing: 1 });
        }
        ctx.restore();
    }

    drawNight(ctx) {
        const s = this.cell;
        const k = this.night;
        const glowCol = (alpha) => `rgba(255, 226, 154, ${alpha * k})`;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.cells[r][c];
                if (!p) continue;
                const { x, y } = this.cellRect(c, r);
                if (p.kind === 'house' && !p.dark) {
                    for (const wx of [x + s * 0.26, x + s * 0.62]) {
                        fillRound(
                            ctx,
                            wx - s * 0.03,
                            y + s * 0.51,
                            s * 0.18,
                            s * 0.17,
                            s * 0.05,
                            glowCol(0.25)
                        );
                        fillRound(ctx, wx, y + s * 0.54, s * 0.12, s * 0.11, s * 0.015, glowCol(0.95));
                    }
                } else if (p.kind === 'barn') {
                    fillRound(ctx, x + s * 0.39, y + s * 0.21, s * 0.22, s * 0.19, s * 0.05, glowCol(0.25));
                    fillRound(ctx, x + s * 0.425, y + s * 0.24, s * 0.15, s * 0.13, s * 0.02, glowCol(0.9));
                    // The owl is only there at night.
                    ctx.globalAlpha = clamp((k - 0.5) * 2, 0, 1);
                    art.owl(ctx, x + s / 2, y + s * 0.315, s, { blink: p.blink > this.time });
                    ctx.globalAlpha = 1;
                } else if (p.kind === 'windmill') {
                    disc(ctx, x + s / 2, y + s * 0.56, s * 0.06, glowCol(0.3));
                    disc(ctx, x + s / 2, y + s * 0.56, s * 0.035, glowCol(0.95));
                } else if (p.kind === 'pond') {
                    // Fireflies over the water.
                    for (let i = 0; i < 2; i++) {
                        const t = this.time * 0.6 + p.seed + i * 2.1;
                        const fx = x + s * (0.5 + 0.35 * Math.sin(t * 1.3 + i));
                        const fy = y + s * (0.4 + 0.25 * Math.sin(t * 1.7 + i * 2));
                        const blink = 0.5 + 0.5 * Math.sin(t * 5 + i);
                        disc(ctx, fx, fy, s * 0.03, `rgba(255, 246, 170, ${0.25 * blink * k})`);
                        disc(ctx, fx, fy, s * 0.012, `rgba(255, 250, 200, ${0.95 * blink * k})`);
                    }
                } else if (ANIMALS.indexOf(p.kind) >= 0 && !p.away && k > 0.6) {
                    art.zzz(ctx, x + s * (p.facing > 0 ? 0.68 : 0.32), y + s * 0.42, s, this.time + p.seed);
                }
            }
        }
        // A few stars above the farm.
        for (let i = 0; i < 9; i++) {
            const sx = ((i * 37 + 11) % 100) / 100;
            const sy = ((i * 61 + 23) % 100) / 100;
            const x = this.w * (0.12 + 0.76 * sx);
            const y = Math.max(8, this.by - 18) * (0.2 + 0.6 * sy);
            const twinkle = 0.6 + 0.4 * Math.sin(this.time * 2 + i);
            art.sparkle(ctx, x, y, 5 * twinkle, `rgba(255, 250, 225, ${0.9 * k})`);
        }
    }

    // A piece away from the board: in the tray, in a finger, or flying back.
    drawLoose(ctx, p, x, y, s) {
        const kind = p.kind;
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
                art.crops(ctx, x, y - s * 0.04, s, 3, 'carrot', 3);
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
        if (kind === 'tree') art.tree(ctx, x, y, s, { apples: [art.APPLE_SPOTS[0], art.APPLE_SPOTS[2]] });
        else if (kind === 'barn') art.barn(ctx, x, y, s, {});
        else if (kind === 'house') art.house(ctx, x, y, s, {});
        else if (kind === 'windmill') art.windmill(ctx, x, y, s, { angle: 0.4 });
        else if (kind === 'coop') art.coop(ctx, x, y, s, {});
        else if (kind === 'fence') art.fence(ctx, x, y, s, 0);
        else if (kind === 'tractor') art.tractor(ctx, x + s * 0.6, y + s * 0.84, s * 0.85, { facing: 1 });
        else if (kind === 'cow') art.cow(ctx, x + s / 2, y + s * 0.84, s, { facing: 1 });
        else if (kind === 'sheep') art.sheep(ctx, x + s / 2, y + s * 0.84, s, { facing: 1 });
        else if (kind === 'pig') art.pig(ctx, x + s / 2, y + s * 0.84, s, { facing: 1 });
    }

    drawTray(ctx) {
        const u = this.u;
        this.tray.forEach((t, i) => {
            const press = this.press[i].value * 0.012;
            ctx.save();
            ctx.translate(t.x + t.s / 2, t.y + t.s / 2);
            ctx.scale(1 + press, 1 + press);
            ctx.translate(-(t.x + t.s / 2), -(t.y + t.s / 2));
            fillRound(ctx, t.x, t.y + 4 * u, t.s, t.s, 16 * u, 'rgba(112, 84, 58, 0.16)');
            ctx.drawImage(this.traySprite(t).canvas, t.x, t.y, t.s, t.s);
            ctx.restore();
        });
    }

    traySprite(t) {
        const id = `tray:${t.kind}`;
        let layer = this.sprites[id];
        if (!layer) {
            layer = makeLayer(t.s, t.s, this.scale);
            fillRound(layer.ctx, 0, 0, t.s, t.s, 16 * this.u, '#FBF6EE');
            this.drawLoose(layer.ctx, { kind: t.kind }, t.s * 0.06, t.s * 0.02, t.s * 0.88);
            this.sprites[id] = layer;
        }
        return layer;
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
        if (this.night < 0.5) art.sun(ctx, 0, 0, 12);
        else art.moon(ctx, -2, 2, 14, back);
        ctx.restore();
    }

    exit() {
        freeLayer(this.ground);
        this.ground = null;
        this.freeSprites();
        this.fx = [];
        this.queue = [];
    }
}

function icon(ctx, x, y, w, h) {
    const s = Math.min(w, h) * 0.42;
    const cx = x + w / 2;
    const cy = y + h / 2;
    fillRound(ctx, cx - s * 1.08, cy - s * 0.8 + 4, s * 2.16, s * 1.6, s * 0.18, 'rgba(112, 84, 58, 0.14)');
    fillRound(ctx, cx - s * 1.08, cy - s * 0.8, s * 2.16, s * 1.6, s * 0.18, FARM.grass);
    fillRound(ctx, cx - s * 1.08, cy + s * 0.16, s * 2.16, s * 0.3, s * 0.1, FARM.path);
    art.barn(ctx, cx - s * 1.0, cy - s * 0.95, s * 1.15, {});
    art.tree(ctx, cx + s * 0.1, cy - s * 0.95, s * 0.95, {
        apples: [art.APPLE_SPOTS[0], art.APPLE_SPOTS[2]],
    });
    art.cow(ctx, cx + s * 0.55, cy + s * 0.62, s * 0.7, { facing: -1 });
}

export const toy = {
    id: 'farm',
    title: 'Farm',
    about: 'Build a farm from tiles: paths, fields, ponds, animals, a tractor. Every piece joins up, answers a tap, and hides something.',
    stages: ['a small farm, 6 kinds of piece', 'a bigger farm, 10 kinds', 'the biggest farm, all 13 kinds'],
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
        ];
        for (const [name, degree] of Object.values(VOICES)) {
            for (let i = -2; i < 4; i++) list.push([name, { f: noteHz(degree + i, 60) }]);
        }
        for (let d = 3; d <= 12; d++) list.push(['drop', { f: noteHz(d, 60) }]);
        for (let d = 3; d <= 12; d++) list.push(['marimba', { f: noteHz(d, 60) }]);
        for (let d = 8; d <= 11; d++) list.push(['tink', { f: noteHz(d, 60) }]);
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
