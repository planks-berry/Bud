// The board: land to build on, a tile at a time, and a tray of pieces to build it with, shared by
// the farm and the building site.
//
// After Pok Pok's builder, and seen the way a child sees a model on a table: from a corner and a
// little above, so the land is an island of small blocks of earth, and whatever stands on it shows
// a front and a side. The table is marked out in tiles, and starts empty. The island grows wherever
// a tile or a piece from the tray is put down on the table, and any tile can be changed: a ground
// dropped on it (a pond, a path, a road) takes the place of what was there, and a piece dropped on
// it stands there. Dragged again, pieces move, swap places, or go back to the tray. On the farm,
// one piece to a tile; a layered board (the building site) has its pieces stand on the ground
// instead, as a truck stands on a road, and says what they may stand on. The broom in the corner,
// tapped, sweeps everything off the island back to the tray and leaves it plain; tapped again, it
// sweeps the island away and the table is empty.
//
// What lies flat is drawn as if from straight above, into the plan of the island, and the plan is
// laid at the island's angle by one transform, so a pond is drawn as a pond and comes out lying on
// the land. What stands up is drawn upright, tile by tile from the back of the island to the front,
// so a barn hides what is behind it. The sun in the corner turns day to night and back.
//
// A board game supplies its pieces and what they do, through the hooks at the end of this class:
// `make` a piece, which kinds are ground, what a tap on each does, how each is drawn and how it
// sounds. Everything about the land, and about holding, carrying, dropping and joining, is here, so
// a pond on the farm and a road on the site are put down, swapped and put back in the same way.
//
// Coordinates. A tile is (c, r): c runs down to the right on the screen and r down to the left. The
// plan of the island is a grid of squares of side `cell`, from (0, 0); `iso` takes a point on the
// grid, in tiles, to the screen. `cellRect` is the frame an upright piece is drawn in, a square of
// side `cell` whose ground is at FOOT of its height.

import { Scene } from '../stage.js';
import { SHADOW_SOFT, makeLayer, freeLayer, grain, fillRound, disc, woodPanel, PALETTE } from '../draw.js';
import { Spring, clamp, lerp, TAU, dist, rgbString, hexToRgb } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { sun, moon, sparkle } from './farmart.js';

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;
export const SIDES = [
    [0, -1, N],
    [1, 0, E],
    [0, 1, S],
    [-1, 0, W],
];
export const AROUND = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
];

// Where the ground is in an upright piece's frame, as a fraction of its height from the top.
export const FOOT = 0.84;
// An upright piece's frame, against the width of a tile.
const ART = 0.92;
// How thick the island is, and how far above the back of it the tallest pieces reach, in tile
// widths.
const DEPTH = 0.17;
const HEADROOM = 0.45;
// How many pictures of pieces are kept at most, beyond those on the board.
const SPRITES = 48;
// The largest piece a silhouette is made of, in a piece's frame widths: a building of four floors.
const GHOST = [1.8, 2.6];

export function key(c, r) {
    return c * 100 + r;
}

export class BoardScene extends Scene {
    // `plans` has one entry a stage: { cols, rows, kinds }. The table is cols by rows. `plain` is
    // the kind of the tile that is only land (the farm's grass, the site's earth); it is in the
    // tray, never on the board.
    constructor(app, plans, plain) {
        super(app);
        this.level = app.level();
        this.plan = plans[this.level];
        this.cols = this.plan.cols;
        this.rows = this.plan.rows;
        this.kinds = this.plan.kinds;
        this.plain = plain;
        this.rand = Math.random;
        this.time = 0;
        this.queue = [];
        this.fx = [];
        this.drag = null;
        this.ground = null;
        this.sprites = {};
        this.press = this.kinds.map(() => new Spring(0, 420, 18));
        this.sunPress = new Spring(0, 420, 18);
        // The broom, and its sweep once it has begun.
        this.broomPress = new Spring(0, 420, 18);
        this.sweep = null;
        this.night = 0;
        this.nightTarget = 0;
        // Which hidden things have shown themselves this time out.
        this.found = new Set();
        this.cells = [];
        this.land = [];
        this.bx = 0;
        this.by = 0;
    }

    // An empty table, as the board begins every time it comes off the shelf and as the broom's
    // second sweep leaves it: the building is the game, so nothing is kept, not even while the
    // playroom is open.
    begin() {
        this.cells = [];
        this.land = [];
        for (let r = 0; r < this.rows; r++) {
            const row = [];
            const ground = [];
            for (let c = 0; c < this.cols; c++) {
                row.push(null);
                ground.push(false);
            }
            this.cells.push(row);
            this.land.push(ground);
        }
    }

    //--------------------------------------------------------------------------
    // The land, the pieces on it, and their neighbours

    inside(c, r) {
        return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
    }

    isLand(c, r) {
        return this.inside(c, r) && this.land[r][c];
    }

    landCount() {
        let n = 0;
        for (const row of this.land) for (const v of row) if (v) n++;
        return n;
    }

    at(c, r) {
        if (!this.inside(c, r)) return null;
        return this.cells[r][c];
    }

    // Whether (c, r) is of a kind: its piece, or on a layered board the ground under it.
    is(c, r, kind) {
        const p = this.at(c, r);
        return !!p && (p.kind === kind || (!!p.under && p.under.kind === kind));
    }

    // The ground piece of a tile, under whatever stands on it, or null for bare land.
    floorAt(c, r) {
        const p = this.at(c, r);
        if (!p) return null;
        return this.isGround(p.kind) ? p : p.under || null;
    }

    // Bare land with nothing on it.
    bare(c, r) {
        return this.isLand(c, r) && !this.cells[r][c];
    }

    // The sides on which a tile joins a neighbour of its own kind, or of `kind`: a road under a
    // truck still joins the road beside it.
    mask(c, r, kind) {
        const p = this.at(c, r);
        if (!p) return 0;
        const k = kind || p.kind;
        let m = 0;
        for (const [dc, dr, bit] of SIDES) if (this.is(c + dc, r + dr, k)) m |= bit;
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

    // Every tile of one kind on the board.
    every(kind) {
        const out = [];
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++) if (this.is(c, r, kind)) out.push([c, r]);
        return out;
    }

    // Every tile of land, from the back of the island to the front.
    tiles() {
        const out = [];
        for (let d = 0; d < this.cols + this.rows - 1; d++) {
            for (let c = Math.max(0, d - this.rows + 1); c <= Math.min(d, this.cols - 1); c++) {
                if (this.land[d - c][c]) out.push([c, d - c]);
            }
        }
        return out;
    }

    chance(p) {
        return this.rand() < p;
    }

    // A hidden thing shows itself the first time it can, each time the board comes out, and half the
    // time or more after that: a three-year-old should find them, not hope to.
    surprise(name, p) {
        if (!this.found.has(name)) {
            this.found.add(name);
            return true;
        }
        return this.chance(p);
    }

    //--------------------------------------------------------------------------
    // Layout, and the way from the grid to the screen

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

        const top = 78 * u;
        const bottom = this.trayTop - 16 * u;
        const span = this.cols + this.rows;
        const availW = w - margin * 2;
        const availH = bottom - top;
        const tw = Math.min(availW / (span / 2), availH / (span / 4 + HEADROOM + DEPTH), 230 * u);
        this.tw = tw;
        this.th = tw / 2;
        this.depth = tw * DEPTH;
        this.cell = Math.round(tw * ART);
        const tall = (span * this.th) / 2 + this.depth + HEADROOM * tw;
        this.ox = w / 2 - ((this.cols - this.rows) * tw) / 4;
        this.oy = top + HEADROOM * tw + Math.max(0, (availH - tall) / 2);
        this.skyTop = this.oy - HEADROOM * tw;
        this.boardW = this.cols * this.cell;
        this.boardH = this.rows * this.cell;

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
        this.broomButton = { x: w - 124, y: 48, r: 30 };
        this.freeSprites();
        freeLayer(this.ghostLayer);
        freeLayer(this.maskLayer);
        this.ghostLayer = makeLayer(this.cell * GHOST[0], this.cell * GHOST[1], this.scale);
        this.maskLayer = makeLayer(this.cell * GHOST[0], this.cell * GHOST[1], this.scale);
        this.laidOut();
        this.drawGround();
    }

    // A point on the grid, in tiles, on the screen.
    iso(u, v) {
        return { x: this.ox + ((u - v) * this.tw) / 2, y: this.oy + ((u + v) * this.th) / 2 };
    }

    // The middle of a tile's top, and a point on it, in fractions of the tile.
    center(c, r) {
        return this.iso(c + 0.5, r + 0.5);
    }

    spot(c, r, fx, fy) {
        return this.iso(c + fx, r + fy);
    }

    // A point of the plan, as `paintGround` draws it, on the screen.
    toScreen(x, y) {
        return this.iso(x / this.cell, y / this.cell);
    }

    // The point of the grid under a point on the screen, on the ground.
    gridAt(x, y) {
        const a = (x - this.ox) / (this.tw / 2);
        const b = (y - this.oy) / (this.th / 2);
        return { u: (a + b) / 2, v: (b - a) / 2 };
    }

    // The tile under a point, land or table, if it is on the table at all.
    cellAt(x, y) {
        const { u, v } = this.gridAt(x, y);
        const c = Math.floor(u);
        const r = Math.floor(v);
        return this.inside(c, r) ? [c, r] : null;
    }

    // The frame an upright piece on (c, r) is drawn in.
    cellRect(c, r) {
        const { x, y } = this.center(c, r);
        const s = this.cell;
        return { x: x - s / 2, y: y - s * FOOT, s };
    }

    // A tile's frame for drawing at the island's angle (see iso.js): on the board, in an upright
    // piece's sprite, and for a piece drawn loose in a square of side s.
    frameOf(c, r) {
        const { x, y } = this.center(c, r);
        return { cx: x, cy: y, tw: this.tw };
    }

    spriteFrame() {
        return { cx: this.cell / 2, cy: this.cell * FOOT, tw: this.tw };
    }

    looseFrame(x, y, s) {
        return { cx: x + s / 2, cy: y + s * FOOT, tw: s / ART };
    }

    // A tile's square in the plan, for drawing what lies flat on it.
    mapRect(c, r) {
        const s = this.cell;
        return { x: c * s, y: r * s, s };
    }

    // Draw from here on in the plan, laid at the island's angle.
    planView(ctx) {
        const s = this.cell;
        ctx.transform(
            this.tw / (2 * s),
            this.th / (2 * s),
            -this.tw / (2 * s),
            this.th / (2 * s),
            this.ox,
            this.oy
        );
    }

    // The top of a tile, as a path.
    diamond(ctx, c, r, inset = 0, drop = 0) {
        const a = this.iso(c + inset, r + inset);
        const b = this.iso(c + 1 - inset, r + inset);
        const d = this.iso(c + 1 - inset, r + 1 - inset);
        const e = this.iso(c + inset, r + 1 - inset);
        ctx.moveTo(a.x, a.y + drop);
        ctx.lineTo(b.x, b.y + drop);
        ctx.lineTo(d.x, d.y + drop);
        ctx.lineTo(e.x, e.y + drop);
        ctx.closePath();
    }

    // A piece at rest drawn once into its own small layer, and copied from there each frame: an
    // old iPad redraws a barn sixty times a second only if it has to.
    sprite(id, draw) {
        return this.cached(id, () => {
            const s = this.cell;
            const layer = makeLayer(s, s, this.scale);
            draw(layer.ctx, s);
            return layer;
        });
    }

    // A layer kept under `id`, made by `make` the first time it is wanted.
    cached(id, make) {
        let layer = this.sprites[id];
        if (!layer) {
            layer = make();
            layer.id = id;
            this.sprites[id] = layer;
        }
        layer.frame = this.frame;
        return layer;
    }

    // Past SPRITES kept, the pictures not drawn this frame are let go. A long game would otherwise
    // keep every shape a fence or a field has had, and an old iPad has little room for pictures.
    prune() {
        const ids = Object.keys(this.sprites);
        if (ids.length <= SPRITES) return;
        for (const id of ids) {
            if (this.sprites[id].frame === this.frame) continue;
            freeLayer(this.sprites[id]);
            delete this.sprites[id];
        }
    }

    freeSprites() {
        for (const id of Object.keys(this.sprites || {})) freeLayer(this.sprites[id]);
        this.sprites = {};
        for (const id of Object.keys(this.ghosts || {})) freeLayer(this.ghosts[id].layer);
        this.ghosts = {};
    }

    blit(ctx, id, x, y, s, draw) {
        const layer = this.sprite(id, draw);
        ctx.drawImage(layer.canvas, x, y, s, s);
        this.marked(layer, x, y, s, s);
    }

    // A sprite drawn for the piece being drawn, kept so a touch can be tested against the piece's
    // own pixels rather than a box round it.
    marked(layer, x, y, w, h) {
        if (this.marking) this.marking.push({ layer, x, y, w, h });
    }

    // Whether a piece's sprites have paint at a point of the screen.
    painted(marks, x, y) {
        for (const m of marks) {
            if (x < m.x || y < m.y || x >= m.x + m.w || y >= m.y + m.h) continue;
            const canvas = m.layer.canvas;
            const px = Math.floor(((x - m.x) / m.w) * canvas.width);
            const py = Math.floor(((y - m.y) / m.h) * canvas.height);
            if (m.layer.ctx.getImageData(px, py, 1, 1).data[3] > 24) return true;
        }
        return false;
    }

    // A piece hidden behind a tall one shows through it: a pale silhouette of itself, where the tall
    // one covers it, so nothing put on the island is ever lost behind a building. `order` is the
    // pieces as they were drawn, from the back. Each silhouette is made once, and made again only
    // when what it is made of changes.
    drawGhosts(ctx, order) {
        if (!this.maskLayer) return;
        const boxOf = (marks) => {
            let x0 = Infinity;
            let y0 = Infinity;
            let x1 = -Infinity;
            let y1 = -Infinity;
            for (const m of marks) {
                x0 = Math.min(x0, m.x);
                y0 = Math.min(y0, m.y);
                x1 = Math.max(x1, m.x + m.w);
                y1 = Math.max(y1, m.y + m.h);
            }
            return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
        };
        const sign = (marks) =>
            marks.map((m) => `${m.layer.id}@${Math.round(m.x)},${Math.round(m.y)}`).join(';');
        const used = {};
        for (let i = 0; i < order.length; i++) {
            const back = order[i];
            if (this.tall(back.p) || !this.shows(back.p)) continue;
            const own = this.drawn[key(back.c, back.r)];
            const box = own && own.length ? boxOf(own) : this.looseBox(back.c, back.r);
            let x0 = Infinity;
            let y0 = Infinity;
            let x1 = -Infinity;
            let y1 = -Infinity;
            const covers = [];
            for (let j = i + 1; j < order.length; j++) {
                const front = order[j];
                if (!this.tall(front.p)) continue;
                const marks = this.drawn[key(front.c, front.r)];
                if (!marks || !marks.length) continue;
                const b = boxOf(marks);
                const ix0 = Math.max(box.x, b.x);
                const iy0 = Math.max(box.y, b.y);
                const ix1 = Math.min(box.x + box.w, b.x + b.w);
                const iy1 = Math.min(box.y + box.h, b.y + b.h);
                if (ix1 <= ix0 || iy1 <= iy0) continue;
                covers.push(marks);
                x0 = Math.min(x0, ix0);
                y0 = Math.min(y0, iy0);
                x1 = Math.max(x1, ix1);
                y1 = Math.max(y1, iy1);
            }
            if (!covers.length) continue;
            const area = {
                x: Math.floor(x0),
                y: Math.floor(y0),
                w: Math.min(Math.ceil(x1) - Math.floor(x0), this.maskLayer.w),
                h: Math.min(Math.ceil(y1) - Math.floor(y0), this.maskLayer.h),
            };
            const self =
                own && own.length ? sign(own) : `${back.p.kind}:${back.p.facing || 0}:${this.pose(back.p)}`;
            const sig = `${back.c},${back.r}|${self}|${covers.map(sign).join('|')}|${area.x},${area.y},${area.w},${area.h}`;
            const id = key(back.c, back.r);
            let made = this.ghosts[id];
            if (!made || made.sig !== sig) {
                if (made) freeLayer(made.layer);
                made = this.ghosts[id] = { sig, area, layer: this.makeGhost(back, own, area, covers) };
            }
            used[id] = true;
            ctx.save();
            ctx.globalAlpha = 0.55;
            ctx.drawImage(made.layer.canvas, area.x, area.y, area.w, area.h);
            ctx.restore();
        }
        for (const id of Object.keys(this.ghosts)) {
            if (used[id]) continue;
            freeLayer(this.ghosts[id].layer);
            delete this.ghosts[id];
        }
    }

    // One silhouette: the piece as it was drawn, kept only where the tall pieces in front cover it,
    // in a pale wash.
    makeGhost(back, own, area, covers) {
        const scale = this.scale;
        const layer = makeLayer(area.w, area.h, scale);
        const g = layer.ctx;
        g.save();
        g.translate(-area.x, -area.y);
        if (own && own.length) for (const k of own) g.drawImage(k.layer.canvas, k.x, k.y, k.w, k.h);
        else this.drawPiece(g, back.p, back.c, back.r, back.rect.x, back.rect.y, this.cell);
        g.restore();
        const mask = this.maskLayer;
        const m = mask.ctx;
        m.setTransform(scale, 0, 0, scale, 0, 0);
        m.clearRect(0, 0, mask.w, mask.h);
        m.save();
        m.translate(-area.x, -area.y);
        for (const marks of covers) for (const k of marks) m.drawImage(k.layer.canvas, k.x, k.y, k.w, k.h);
        m.restore();
        // The whole of the silhouette's canvas, which is never larger than the mask's.
        const pw = layer.canvas.width;
        const ph = layer.canvas.height;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(mask.canvas, 0, 0, pw, ph, 0, 0, pw, ph);
        g.globalCompositeOperation = 'source-in';
        g.fillStyle = 'rgb(255, 252, 242)';
        g.fillRect(0, 0, pw, ph);
        g.globalCompositeOperation = 'source-over';
        return layer;
    }

    // What of a piece drawn without sprites changes its silhouette, beyond its kind and which way it
    // faces: nothing, unless a game says.
    pose() {
        return '';
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

    // Tiles of ground, and the bare land tile, go on the board as tiles; everything else stands.
    isTile(kind) {
        return kind === this.plain || this.isGround(kind);
    }

    //--------------------------------------------------------------------------
    // The ground: the table, the island and everything flat on it, drawn once into a layer and
    // again whenever the land or a ground piece changes. `look` gives its colours; `paintGround`
    // draws what lies on the land, in the plan.

    drawGround() {
        freeLayer(this.ground);
        const { w, h, u } = this;
        const look = this.look;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, this.trayTop);
        sky.addColorStop(0, look.sky[0]);
        sky.addColorStop(1, look.sky[1]);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        // The table, marked out where the island can still grow.
        ctx.beginPath();
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++) if (!this.land[r][c]) this.diamond(ctx, c, r, 0.06);
        ctx.fillStyle = look.table;
        ctx.fill();
        ctx.lineWidth = Math.max(1, 1.5 * u);
        ctx.strokeStyle = look.tableLine;
        ctx.stroke();

        // The island's shadow on the table, then its sides wherever it meets the table.
        const tiles = this.tiles();
        ctx.beginPath();
        for (const [c, r] of tiles) this.diamond(ctx, c, r, -0.02, this.depth + 7 * u);
        ctx.fillStyle = SHADOW_SOFT;
        ctx.fill();
        for (const [c, r] of tiles) {
            if (!this.isLand(c + 1, r)) this.side(ctx, c, r, 'right');
            if (!this.isLand(c, r + 1)) this.side(ctx, c, r, 'left');
        }

        // The top, in the plan.
        ctx.save();
        this.planView(ctx);
        const s = this.cell;
        ctx.beginPath();
        for (const [c, r] of tiles) ctx.rect(c * s - 0.5, r * s - 0.5, s + 1, s + 1);
        ctx.fillStyle = look.base;
        ctx.fill();
        ctx.beginPath();
        for (const [c, r] of tiles) if ((c + r) % 2) ctx.rect(c * s, r * s, s, s);
        ctx.fillStyle = look.alt;
        ctx.fill();
        this.paintGround(ctx);
        ctx.restore();

        grain(ctx, 0, 0, w, this.trayTop, 0.22, this.scale);
        woodPanel(ctx, -10, this.trayTop, w + 20, h - this.trayTop + 10, 0, PALETTE.wood, 41, this.scale);
        this.ground = layer;
    }

    // One side of a tile, where nothing is in front of it: a lip of the top's colour, then the
    // earth, darker towards the bottom.
    side(ctx, c, r, which) {
        const a = which === 'right' ? this.iso(c + 1, r) : this.iso(c, r + 1);
        const b = this.iso(c + 1, r + 1);
        const d = this.depth;
        const band = (y0, y1, colour) => {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y + y0);
            ctx.lineTo(b.x, b.y + y0);
            ctx.lineTo(b.x, b.y + y1);
            ctx.lineTo(a.x, a.y + y1);
            ctx.closePath();
            ctx.fillStyle = colour;
            ctx.fill();
        };
        const look = this.look;
        const dark = which === 'left';
        band(-0.5, d * 0.28, dark ? look.lipDark : look.lip);
        band(d * 0.28, d * 0.7, dark ? look.sideDark : look.side);
        band(d * 0.7, d, dark ? look.deepDark : look.deep);
    }

    // A joined shape: each tile a rounded square, pushed out to meet any neighbour of its kind, with
    // only its outside corners rounded. In the plan.
    blob(ctx, kind, inset, radius, colour) {
        const s = this.cell;
        ctx.fillStyle = colour;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, kind)) continue;
                const m = this.mask(c, r);
                const x0 = c * s + (m & W ? 0 : inset);
                const x1 = (c + 1) * s - (m & E ? 0 : inset);
                const y0 = r * s + (m & N ? 0 : inset);
                const y1 = (r + 1) * s - (m & S ? 0 : inset);
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

    // A joined line through the middle of each tile of a kind: paths, roads. In the plan.
    drawPaths(ctx, width, colour, kind = 'path') {
        const s = this.cell;
        ctx.strokeStyle = colour;
        ctx.fillStyle = colour;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, kind)) continue;
                const x = (c + 0.5) * s;
                const y = (r + 0.5) * s;
                disc(ctx, x, y, width / 2, colour);
                const m = this.mask(c, r, kind);
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

    // Every tile of a path (or a road) joined to `start`, walked tile to tile and back again, as a
    // child walks a maze with a finger. Long paths are walked part way and back. What the farm's
    // tractor and the site's trucks drive.
    tour(start, kind = 'path') {
        const route = [start];
        const seen = new Set([key(start[0], start[1])]);
        const visit = (c, r) => {
            for (const [dc, dr] of SIDES) {
                const nc = c + dc;
                const nr = r + dr;
                if (seen.has(key(nc, nr)) || !this.is(nc, nr, kind)) continue;
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

    //--------------------------------------------------------------------------
    // Time

    later(delay, fn) {
        this.queue.push({ at: this.time + delay, fn });
    }

    update(dt) {
        this.time += dt;
        if (this.sweep) return this.sweeping(dt);
        this.broomPress.update(dt);
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

        this.tick(dt);

        this.fx = this.fx.filter((f) => {
            f.t += dt;
            return f.update ? f.update(dt, f) !== false && f.t < f.life : f.t < f.life;
        });
        return true;
    }

    //--------------------------------------------------------------------------
    // Input

    // The upright piece whose drawing is under a point, the nearest first: a tall barn can be
    // touched by its roof, over the tile behind it. Where a tall piece hides one behind it, the
    // hidden one's silhouette shows through, and takes the touch.
    pieceAt(x, y) {
        const tiles = this.tiles();
        let front = null;
        for (let i = tiles.length - 1; i >= 0; i--) {
            const [c, r] = tiles[i];
            const p = this.cells[r][c];
            if (!p || p.away || !this.stands(p)) continue;
            const rect = this.cellRect(c, r);
            const s = rect.s;
            const ground = this.center(c, r).y;
            if (
                !(
                    x > rect.x + s * 0.1 &&
                    x < rect.x + s * 0.9 &&
                    y > rect.y + s * this.reach(p) &&
                    y < ground + this.th * 0.3
                )
            )
                continue;
            if (front) {
                if (!this.tall(p) && this.shows(p) && this.paintedAt(p, c, r, x, y)) return [c, r];
                continue;
            }
            // Drawn from sprites alone, it is only where it has paint: a low hen house in front does
            // not take a touch meant for the sheep behind it. Near its own foot it always counts.
            const marks = this.drawn && this.drawn[key(c, r)];
            if (
                marks &&
                marks.length &&
                this.solid(p) &&
                y < ground - this.th * 0.15 &&
                !this.painted(marks, x, y)
            )
                continue;
            if (!this.tall(p)) return [c, r];
            front = [c, r];
        }
        return front;
    }

    // Whether a piece has paint at a point: from the sprites it was last drawn with, or drawn again,
    // out of sight, to see.
    paintedAt(p, c, r, x, y) {
        const marks = this.drawn && this.drawn[key(c, r)];
        if (marks && marks.length) return this.painted(marks, x, y);
        const layer = this.ghostLayer;
        if (!layer) return false;
        const box = this.looseBox(c, r);
        if (x < box.x || y < box.y || x >= box.x + box.w || y >= box.y + box.h) return false;
        const g = layer.ctx;
        g.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        g.clearRect(0, 0, layer.w, layer.h);
        g.save();
        g.translate(-box.x, -box.y);
        const rect = this.cellRect(c, r);
        this.drawPiece(g, p, c, r, rect.x, rect.y, this.cell);
        g.restore();
        const px = Math.floor((x - box.x) * this.scale);
        const py = Math.floor((y - box.y) * this.scale);
        return g.getImageData(px, py, 1, 1).data[3] > 24;
    }

    // Where a piece drawn without sprites may have paint: its frame and a little round it.
    looseBox(c, r) {
        const rect = this.cellRect(c, r);
        const s = rect.s;
        return { x: rect.x - s * 0.3, y: rect.y - s * 0.4, w: s * 1.6, h: s * 1.5 };
    }

    down(p) {
        const u = this.u;
        if (this.sweep) return;
        const b = this.broomButton;
        if (dist(p.x, p.y, b.x, b.y) < b.r + 10 * u) {
            p.owner = { type: 'broom' };
            this.broomPress.kick(-6);
            return;
        }
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
        const cell = this.pieceAt(p.x, p.y) || this.cellAt(p.x, p.y);
        if (!cell || !this.isLand(cell[0], cell[1])) return;
        const [c, r] = cell;
        const piece = this.at(c, r);
        if (piece && piece.away) return;
        p.owner = { type: piece ? 'piece' : 'empty', c, r };
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
            // Whatever it stood on stays.
            this.cells[o.r][o.c] = piece.under || null;
            piece.under = null;
            this.drag = { pointer: p, piece, from: [o.c, o.r], x: p.x, y: p.y };
            audio.play('tick', { f: noteHz(3, 72) }, { gain: 0.4, pan: this.pan(p.x) });
            this.lifted(o.c, o.r, piece);
            if (this.isGround(piece.kind)) this.drawGround();
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
        if (o.type === 'broom') {
            const b = this.broomButton;
            if (dist(p.x, p.y, b.x, b.y) < b.r + 20 * this.u) this.startSweep();
        } else if (o.type === 'sun') {
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
            const piece = this.at(o.c, o.r);
            if (!piece || piece.away) return;
            piece.bounce.kick(5);
            this.tap(o.c, o.r, piece, p);
        } else if (o.type === 'empty') {
            if (this.bare(o.c, o.r)) this.tapEmpty(o.c, o.r, p);
        }
    }

    cancel(p) {
        if (this.drag && this.drag.pointer === p) {
            const d = this.drag;
            this.drag = null;
            if (d.from && this.room(d.from[0], d.from[1], d.piece))
                this.put(d.from[0], d.from[1], d.piece, true);
        }
    }

    // Whether a piece lifted from (c, r) can go straight back: nothing has taken its place.
    room(c, r, piece) {
        const there = this.at(c, r);
        if (!there) return true;
        return this.layered() && this.isGround(there.kind) && !this.isGround(piece.kind);
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
        if (!cell || overTray) {
            if (d.from && overTray) {
                this.poof(d.piece, d.x, d.y);
            } else if (d.from) {
                this.put(d.from[0], d.from[1], d.piece, true);
            }
            if (this.isGround(d.piece.kind)) this.drawGround();
            this.normalise();
            return;
        }
        const [c, r] = cell;
        if (!this.allows(d.piece, c, r)) {
            this.refuse(d, c, r);
            return;
        }
        // Put down on the table, a tile is new land; so is whatever is put down there, which brings
        // its patch of land with it.
        const grew = !this.isLand(c, r);
        if (grew) this.addLand(c, r);
        const there = this.at(c, r);
        // On a layered board, what stands on the tile and the ground under it are two things.
        const top = this.layered() && there && !this.isGround(there.kind) ? there : null;
        const ground = this.layered() ? this.floorAt(c, r) : there;
        if (d.piece.kind === this.plain) {
            // The bare land tile: on land, it clears the tile back to bare, or on a layered board
            // the ground under whatever stands there.
            if (ground) {
                if (top) top.under = null;
                else this.cells[r][c] = null;
                const at = this.center(c, r);
                this.poof(ground, at.x, at.y);
                this.clearTile(c, r);
                this.drawGround();
                this.normalise();
            }
            if (!grew) this.thump(c, r);
            return;
        }
        if (this.layered() && this.isGround(d.piece.kind)) {
            // A ground goes in under whatever stands there, in place of the ground that was.
            if (ground && ground !== d.piece) {
                if (top) top.under = null;
                else this.cells[r][c] = null;
                const at = this.center(c, r);
                this.poof(ground, at.x, at.y);
            }
            this.put(c, r, d.piece);
            return;
        }
        const other = top || (this.layered() ? null : there);
        if (other && other !== d.piece) {
            // Dropped on another piece: from the tray it takes the tile, and the other goes back to the
            // tray; from the board, the two swap places. The ground stays where it is.
            this.cells[r][c] = top ? ground : null;
            other.under = null;
            if (d.from) this.put(d.from[0], d.from[1], other, true);
            else {
                const at = this.center(c, r);
                this.poof(other, at.x, at.y);
            }
        }
        this.put(c, r, d.piece);
    }

    // Whether a piece may be put down on (c, r): anywhere, on a board that is not layered, and on
    // the table, where it brings new land; on a layered board's land, only where what stands there
    // can stand on the ground there, and not where a machine out on a trip will come home to.
    allows(piece, c, r) {
        if (!this.layered() || !this.isLand(c, r)) return true;
        const there = this.at(c, r);
        if (!there || there === piece) return true;
        const top = this.isGround(there.kind) ? null : there;
        if (top && top.away) return false;
        if (piece.kind === this.plain) return true;
        if (this.isGround(piece.kind)) return !top || this.standsOn(top.kind, piece);
        return this.standsOn(piece.kind, top ? top.under || null : there);
    }

    // A piece put down where it cannot stand goes back where it came from, with a bump: to its
    // tile, or to the tray.
    refuse(d, c, r) {
        const at = this.center(c, r);
        audio.play('thud', { f: 80 }, { gain: 0.45, pan: this.pan(at.x) });
        if (d.from && this.room(d.from[0], d.from[1], d.piece)) {
            this.put(d.from[0], d.from[1], d.piece, true);
            d.piece.bounce.kick(-9);
        } else this.poof(d.piece, d.x, d.y);
        if (this.isGround(d.piece.kind)) this.drawGround();
        this.normalise();
    }

    // New land, rising out of the table with a note: each tile the island grows by a step higher,
    // round the scale.
    addLand(c, r) {
        this.land[r][c] = true;
        const at = this.center(c, r);
        const n = this.landCount();
        audio.note('wood', 3 + (n % 8), 60, { gain: 0.65, pan: this.pan(at.x) });
        audio.play('thud', { f: 95 }, { gain: 0.5, pan: this.pan(at.x) });
        this.puff(at.x, at.y + this.th * 0.3, 1.2, this.look.dust);
        this.fx.push({
            t: 0,
            life: 0.5,
            draw: (ctx, f) => {
                const k = f.t / f.life;
                ctx.beginPath();
                this.diamond(ctx, c, r, 0, (1 - k) * this.depth * 0.6);
                ctx.fillStyle = `rgba(255, 252, 240, ${0.55 * (1 - k)})`;
                ctx.fill();
            },
        });
        this.drawGround();
        this.grown(c, r);
    }

    // A bare tile, patted.
    thump(c, r) {
        const at = this.center(c, r);
        audio.play('thud', { f: 110 }, { gain: 0.5, pan: this.pan(at.x) });
        this.puff(at.x, at.y, 0.8, this.look.dust);
    }

    // Place a piece and let it, and anything it joins, say so. On a layered board a standing piece
    // stands on the ground there, and a ground goes in under whatever stands there.
    put(c, r, piece, quiet = false) {
        if (!this.isLand(c, r)) this.land[r][c] = true;
        const there = this.cells[r][c];
        const layer = this.layered() && there && there !== piece;
        if (layer && this.isGround(piece.kind) && !this.isGround(there.kind)) there.under = piece;
        else {
            if (layer && !this.isGround(piece.kind) && this.isGround(there.kind)) piece.under = there;
            this.cells[r][c] = piece;
        }
        piece.away = null;
        if (piece.trip) piece.trip = null;
        piece.bounce.kick(quiet ? 4 : 10);
        const cleared = this.clearTile(c, r);
        const ground = this.isGround(piece.kind);
        if (ground || cleared) this.drawGround();
        this.normalise(quiet);
        this.placed(c, r, piece, quiet);
        if (quiet) return;
        const at = this.center(c, r);
        this.voice(piece.kind, at.x, 1);
        if (this.joins(piece.kind)) {
            // Joined neighbours bounce one after another, climbing, as if passing the news along.
            const joined = this.component(c, r, piece.kind).slice(1, 9);
            joined.forEach(([cc, rr], i) =>
                this.later(0.1 + i * 0.07, () => {
                    const n = this.at(cc, rr);
                    if (!n || n.kind !== piece.kind) return;
                    n.bounce.kick(7);
                    audio.note('marimba', 5 + i, 60, { gain: 0.35, pan: this.pan(this.center(cc, rr).x) });
                })
            );
        }
    }

    // A piece going back to the tray, which it flies to as it shrinks.
    poof(piece, x, y, gain = 0.4) {
        const item = this.trayItem(piece.kind);
        const to = item ? { x: item.x + item.s / 2, y: item.y + item.s / 2 } : { x, y: this.h };
        this.puff(x, y, 1);
        if (gain > 0) audio.play('whoosh', { variant: 'down' }, { gain, pan: this.pan(x) });
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
                this.drawHeld(ctx, piece, -s / 2, -s / 2, s);
                ctx.restore();
            },
        });
    }

    //--------------------------------------------------------------------------
    // Small effects every board uses

    puff(x, y, size, colour = '240, 230, 210') {
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
                        `rgba(${colour}, ${0.8 * (1 - k)})`
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
                sparkle(ctx, x, y - k * s * 0.1, s * 0.04 * Math.sin(k * Math.PI), '#FFF6D6');
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
                sparkle(ctx, x, y, s * 0.035 * (0.6 + 0.4 * Math.sin(k * Math.PI)), colour);
            },
        });
    }

    //--------------------------------------------------------------------------
    // The broom

    // A tap on the broom sweeps the table: a line of tiles at a time, from the broom's side across.
    // The first sweep takes everything on the island back to the tray, and leaves the land, plain;
    // with only plain land left, the next sweeps the land into the table too. Day comes back, and
    // then the board starts again as it comes off the shelf, with the land the sweep left, so
    // nothing of the old one is left to wake up later: no animal on its way somewhere, no machine
    // halfway through its work.
    startSweep() {
        const pieces = this.cells.some((row) => row.some(Boolean));
        if (!pieces && !this.landCount()) {
            // Nothing to sweep: a brush of the broom.
            this.broomPress.kick(10);
            audio.play('rustle', {}, { gain: 0.4, pan: this.pan(this.broomButton.x) });
            return;
        }
        this.queue = [];
        if (this.drag) {
            const d = this.drag;
            this.drag = null;
            this.poof(d.piece, d.x, d.y, 0);
        }
        // Tiles whose middles are about as far across the screen go together, in a line from the
        // back of the table to the front.
        const tiles = [];
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (this.land[r][c] || this.cells[r][c]) tiles.push({ c, r, x: this.center(c, r).x });
            }
        }
        tiles.sort((a, b) => b.x - a.x);
        const lines = [];
        for (const t of tiles) {
            const last = lines[lines.length - 1];
            if (last && last.x - t.x < this.tw * 0.25) last.tiles.push(t);
            else lines.push({ x: t.x, tiles: [t] });
        }
        lines.forEach((line, i) => (line.at = 0.06 + i * 0.07));
        this.sweep = {
            t: 0,
            lines,
            keep: pieces,
            end: (lines.length ? lines[lines.length - 1].at : 0) + 0.6,
            stroke: 0,
        };
        this.broomPress.kick(10);
        audio.play('whoosh', { variant: 'down' }, { gain: 0.5, pan: this.pan(this.broomButton.x) });
    }

    sweeping(dt) {
        const sw = this.sweep;
        sw.t += dt;
        while (sw.lines.length && sw.lines[0].at <= sw.t) this.sweepLine(sw.lines.shift());
        this.night += (0 - this.night) * (1 - Math.exp(-dt / 0.25));
        this.nightTarget = 0;
        for (const p of this.press) p.update(dt);
        this.sunPress.update(dt);
        this.broomPress.update(dt);
        this.fx = this.fx.filter((f) => {
            f.t += dt;
            return f.t < f.life;
        });
        if (!sw.lines.length && sw.t >= sw.end) {
            // A new board of the same kind, as if just taken off the shelf, on the land that is left.
            audio.note('chime', 4, 60, { gain: 0.35, wet: 0.4 });
            const next = new this.constructor(this.app);
            if (sw.keep) {
                next.land = this.land.map((row) => row.slice());
                next.normalise(true);
            }
            this.app.stage.show(next);
        }
        return true;
    }

    // One line of the table swept: its pieces back to the tray, and on the second sweep its land
    // into the table, with the broom's brush every other line.
    sweepLine(line) {
        for (const { c, r } of line.tiles) {
            const at = this.center(c, r);
            const piece = this.cells[r][c];
            if (piece) {
                this.cells[r][c] = null;
                this.poof(piece, at.x, at.y - this.th * 0.3, 0);
                if (piece.under) this.poof(piece.under, at.x, at.y, 0);
                piece.under = null;
            }
            this.clearTile(c, r);
            if (!this.land[r][c]) continue;
            if (this.sweep.keep) {
                // The land stays, brushed clean.
                if (piece) this.puff(at.x, at.y + this.th * 0.1, 0.7, this.look.dust);
                this.fx.push({
                    t: 0,
                    life: 0.35,
                    draw: (ctx, f) => {
                        const k = f.t / f.life;
                        ctx.beginPath();
                        this.diamond(ctx, c, r, 0.08 + k * 0.1);
                        ctx.fillStyle = `rgba(255, 252, 240, ${0.4 * (1 - k)})`;
                        ctx.fill();
                    },
                });
                continue;
            }
            this.land[r][c] = false;
            this.puff(at.x, at.y + this.th * 0.3, 0.9, this.look.dust);
            const top = hexToRgb(this.look.base);
            this.fx.push({
                t: 0,
                life: 0.35,
                draw: (ctx, f) => {
                    const k = f.t / f.life;
                    ctx.beginPath();
                    this.diamond(ctx, c, r, k * 0.3, k * this.depth);
                    ctx.fillStyle = rgbString(top, 1 - k);
                    ctx.fill();
                },
            });
        }
        // What lived on what has gone goes with it: a frog with its pond, ducks with their water.
        this.normalise(true);
        this.drawGround();
        if (this.sweep.stroke++ % 2 === 0) audio.play('rustle', {}, { gain: 0.45, pan: this.pan(line.x) });
    }

    drawBroom(ctx) {
        const b = this.broomButton;
        const press = this.broomPress.value * 0.012;
        const back = rgbString(
            hexToRgb('#FBF6EE').map((v, i) => lerp(v, [124, 131, 184][i], this.night)),
            0.92
        );
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(1 + press, 1 + press);
        fillRound(ctx, -32, -32 + 4, 64, 64, 20, 'rgba(112, 84, 58, 0.14)');
        fillRound(ctx, -32, -32, 64, 64, 20, back);
        // The broom, rocking as it sweeps.
        ctx.rotate(0.55 + (this.sweep ? Math.sin(this.sweep.t * 16) * 0.16 : 0));
        fillRound(ctx, -2, -19, 4, 24, 2, '#B98A5E');
        ctx.beginPath();
        ctx.moveTo(-6, 3);
        ctx.lineTo(6, 3);
        ctx.lineTo(10, 18);
        ctx.lineTo(-10, 18);
        ctx.closePath();
        ctx.fillStyle = '#EBC872';
        ctx.fill();
        ctx.strokeStyle = '#C9A04E';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (const x of [-5, -1.7, 1.7, 5]) {
            ctx.moveTo(x * 0.75, 7);
            ctx.lineTo(x * 1.25, 17);
        }
        ctx.stroke();
        fillRound(ctx, -6.5, 2, 13, 3.5, 1.5, '#A8744A');
        ctx.restore();
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

    // A few stars above the island.
    drawStars(ctx) {
        const k = this.night;
        for (let i = 0; i < 9; i++) {
            const sx = ((i * 37 + 11) % 100) / 100;
            const sy = ((i * 61 + 23) % 100) / 100;
            const x = this.w * (0.12 + 0.76 * sx);
            const y = Math.max(20, this.skyTop) * (0.25 + 0.6 * sy);
            const twinkle = 0.6 + 0.4 * Math.sin(this.time * 2 + i);
            sparkle(ctx, x, y, 5 * twinkle, `rgba(255, 250, 225, ${0.9 * k})`);
        }
    }

    //--------------------------------------------------------------------------
    // Drawing

    draw(ctx) {
        const s = this.cell;
        this.frame = (this.frame || 0) + 1;
        ctx.drawImage(this.ground.canvas, 0, 0, this.w, this.h);

        if (this.drag) {
            const cell = this.landing(this.drag);
            if (
                cell &&
                this.drag.y <= this.trayTop - 4 * this.u &&
                this.allows(this.drag.piece, cell[0], cell[1])
            ) {
                ctx.beginPath();
                this.diamond(ctx, cell[0], cell[1], 0.04);
                ctx.fillStyle = this.isLand(cell[0], cell[1])
                    ? 'rgba(255, 252, 240, 0.45)'
                    : 'rgba(255, 252, 240, 0.7)';
                ctx.fill();
            }
        }

        this.drawBelow(ctx);

        // Everything upright, from the back of the island to the front: each tile's own, and the
        // things on the move between tiles.
        const items = this.tiles().map(([c, r]) => ({ k: c + r + 1 + c * 0.001, c, r }));
        const drawn = {};
        const order = [];
        for (const m of this.movers()) items.push({ k: m.u + m.v + 0.0005, m });
        items.sort((a, b) => a.k - b.k);
        for (const it of items) {
            if (it.m) {
                it.m.draw(ctx);
                continue;
            }
            const { c, r } = it;
            this.drawUpright(ctx, c, r);
            const p = this.cells[r][c];
            if (!p || p.away || !this.stands(p)) continue;
            const rect = this.cellRect(c, r);
            this.marking = [];
            this.drawPiece(ctx, p, c, r, rect.x, rect.y, s);
            drawn[key(c, r)] = this.marking;
            this.marking = null;
            order.push({ c, r, p, rect });
        }
        this.drawn = drawn;
        this.drawGhosts(ctx, order);

        this.drawAbove(ctx);

        for (const f of this.fx) if (!f.top && !f.water && !f.below) f.draw(ctx, f);

        // Night: the board turns moonlit blue (multiplied, so colours deepen rather than grey), and
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
        this.drawBroom(ctx);

        if (this.drag) {
            const d = this.drag;
            ctx.save();
            ctx.translate(d.x, d.y - s * 0.2);
            ctx.scale(1.08, 1.08);
            this.drawHeld(ctx, d.piece, -s / 2, -s / 2, s, true);
            ctx.restore();
        }
        this.prune();
    }

    // A piece away from the board: in the tray, in a finger, flying back. A tile is a small block
    // of land with its ground on top; anything else is drawn as it stands.
    drawHeld(ctx, p, x, y, s, shadow = false) {
        if (this.isTile(p.kind)) {
            this.drawTileBlock(ctx, p, x + s / 2, y + s * 0.42, s * 0.86, shadow);
            return;
        }
        if (shadow)
            fillRound(
                ctx,
                x + s * 0.08 + 6,
                y + s * 0.08 + 12,
                s * 0.84,
                s * 0.84,
                16,
                'rgba(112, 84, 58, 0.12)'
            );
        this.drawLoose(ctx, p, x, y, s);
    }

    // A loose tile: its top at (cx, cy), `tw` wide, its ground drawn as the game draws it loose,
    // laid flat.
    drawTileBlock(ctx, p, cx, cy, tw, shadow) {
        const th = tw / 2;
        const d = tw * 0.16;
        const look = this.look;
        const face = (x0, y0, x1, y1, colour) => {
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.lineTo(x1, y1 + d);
            ctx.lineTo(x0, y0 + d);
            ctx.closePath();
            ctx.fillStyle = colour;
            ctx.fill();
        };
        if (shadow) {
            ctx.beginPath();
            ctx.moveTo(cx, cy - th / 2 + d + 10);
            ctx.lineTo(cx + tw / 2, cy + d + 10);
            ctx.lineTo(cx, cy + th / 2 + d + 10);
            ctx.lineTo(cx - tw / 2, cy + d + 10);
            ctx.closePath();
            ctx.fillStyle = 'rgba(112, 84, 58, 0.14)';
            ctx.fill();
        }
        face(cx - tw / 2, cy, cx, cy + th / 2, look.sideDark);
        face(cx, cy + th / 2, cx + tw / 2, cy, look.side);
        face(cx - tw / 2, cy - 0.5, cx, cy + th / 2 - 0.5, look.lipDark);
        face(cx, cy + th / 2 - 0.5, cx + tw / 2, cy - 0.5, look.lip);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy - th / 2);
        ctx.lineTo(cx + tw / 2, cy);
        ctx.lineTo(cx, cy + th / 2);
        ctx.lineTo(cx - tw / 2, cy);
        ctx.closePath();
        ctx.fillStyle = look.base;
        ctx.fill();
        ctx.clip();
        // The game's square drawing of the ground, laid at the island's angle.
        const s = 100;
        ctx.translate(cx, cy - th / 2);
        ctx.transform(tw / (2 * s), th / (2 * s), -tw / (2 * s), th / (2 * s), 0, 0);
        if (p.kind !== this.plain) this.drawLoose(ctx, p, 0, 0, s);
        else this.drawPlain(ctx, s);
        ctx.restore();
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
        return this.cached(`tray:${t.kind}`, () => {
            const layer = makeLayer(t.s, t.s, this.scale);
            fillRound(layer.ctx, 0, 0, t.s, t.s, 16 * this.u, '#FBF6EE');
            if (this.isTile(t.kind))
                this.drawTileBlock(layer.ctx, { kind: t.kind }, t.s / 2, t.s * 0.44, t.s * 0.82);
            else this.drawLoose(layer.ctx, { kind: t.kind }, t.s * 0.06, t.s * 0.02, t.s * 0.88);
            return layer;
        });
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
        if (this.night < 0.5) sun(ctx, 0, 0, 12);
        else moon(ctx, -2, 2, 14, back);
        ctx.restore();
    }

    exit() {
        freeLayer(this.ghostLayer);
        freeLayer(this.maskLayer);
        this.ghostLayer = null;
        this.maskLayer = null;
        freeLayer(this.ground);
        this.ground = null;
        this.freeSprites();
        this.fx = [];
        this.queue = [];
    }

    //--------------------------------------------------------------------------
    // What a board game supplies. Only `make`, `tap`, `voice`, `drawPiece` and `drawLoose` are
    // required; the rest default to nothing.

    // A new piece of a kind, with whatever state that kind keeps.
    make(kind) {
        return { kind, bounce: new Spring(0, 320, 11), away: null };
    }

    // Flat pieces: drawn into the ground layer, under everything standing.
    isGround() {
        return false;
    }

    // Whether a piece is drawn standing on its tile, back to front.
    stands(p) {
        return !this.isGround(p.kind);
    }

    // How far down its frame an upright piece's drawing begins, for touching it.
    reach() {
        return 0.12;
    }

    // Whether the sprites a piece was last drawn with are all of it, so a touch can be tested
    // against their paint; not when something else is drawn with it, a cat on a roof.
    solid() {
        return true;
    }

    // Whether a piece is tall enough to hide what stands behind it, which then shows through it.
    tall() {
        return false;
    }

    // Whether a piece hidden behind a tall one shows through it.
    shows() {
        return true;
    }

    // Kinds whose neighbours bounce in a climbing ripple when one is put beside them.
    joins(kind) {
        return this.isGround(kind);
    }

    // Whether pieces stand on the ground of a tile, as a truck stands on a road, rather than taking
    // its place, as a cow put down on the farm's path does.
    layered() {
        return false;
    }

    // On a layered board, whether a piece of a kind can stand on a ground piece, or on bare land
    // (null).
    standsOn(kind, ground) {
        return !ground;
    }

    // After any change to the board.
    normalise() {}

    // After layout, before the ground is drawn.
    laidOut() {}

    // A piece picked up from (c, r).
    lifted() {}

    // A piece put on (c, r).
    placed() {}

    // New land at (c, r).
    grown() {}

    // Clear whatever lay on an empty tile now taken (the farm's flowers); true if the ground must be
    // redrawn.
    clearTile() {
        return false;
    }

    // Each frame, after the pieces.
    tick() {}

    updatePiece(p, c, r, dt) {
        p.bounce.update(dt);
    }

    // Things on the move between tiles, drawn among the upright pieces where they are: each
    // { u, v, draw(ctx) }, at grid point (u, v).
    movers() {
        return [];
    }

    // Something to touch that is not a piece, or null.
    targetAt() {
        return null;
    }

    tap() {}

    tapEmpty() {}

    voice() {}

    paintGround() {}

    // The bare land tile's own top, in a square of side s, for the tray.
    drawPlain() {}

    drawBelow() {}

    // Whatever stands up out of a flat piece on (c, r): crops in a field.
    drawUpright() {}

    drawPiece() {}

    drawAbove() {}

    drawNight() {}

    drawLoose() {}

    dusk() {}

    dawn() {}
}
