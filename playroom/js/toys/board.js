// The board: a grid of tiles to build on and a tray of pieces to build it with, shared by the farm
// and the building site.
//
// After Pok Pok's builder. Pieces are dragged from the tray onto the board, where they snap to a
// tile; dragged again, they move, swap places, or go back to the tray. One piece to a tile. Flat
// pieces (a path, a field, a road) join the neighbours of their own kind and are drawn into the
// ground; standing pieces are drawn on top, row by row, like the cut-out figures of a board game.
// The sun in the corner turns day to night and back.
//
// A board game supplies its pieces and what they do, through the hooks at the end of this class:
// `make` a piece, which kinds are ground, what a tap on each does, how each is drawn and how it
// sounds. Everything about holding, carrying, dropping and joining is here, so a pond on the farm
// and a road on the site are picked up, swapped and put back in exactly the same way.

import { Scene } from '../stage.js';
import { SHADOW, makeLayer, freeLayer, grain, fillRound, disc, woodPanel, PALETTE } from '../draw.js';
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

export function key(c, r) {
    return c * 100 + r;
}

export class BoardScene extends Scene {
    // `plans` has one entry a stage: { cols, rows, kinds, start }, where `start` is the board it
    // begins as, a row of letter codes to a line.
    constructor(app, plans) {
        super(app);
        this.level = app.level();
        this.plan = plans[this.level];
        this.cols = this.plan.cols;
        this.rows = this.plan.rows;
        this.kinds = this.plan.kinds;
        this.rand = Math.random;
        this.time = 0;
        this.queue = [];
        this.fx = [];
        this.drag = null;
        this.ground = null;
        this.sprites = {};
        this.press = this.kinds.map(() => new Spring(0, 420, 18));
        this.sunPress = new Spring(0, 420, 18);
        this.night = 0;
        this.nightTarget = 0;
        // Which hidden things have shown themselves this time out.
        this.found = new Set();
        this.cells = [];
    }

    // Set out the board the stage begins as. A fresh one every time it comes off the shelf: the
    // building is the game, so nothing is kept, not even while the playroom is open.
    begin(codes) {
        this.cells = [];
        for (let r = 0; r < this.rows; r++) {
            const row = [];
            for (let c = 0; c < this.cols; c++) {
                const code = this.plan.start[r][c];
                const piece = codes[code] ? this.make(codes[code]) : null;
                if (piece) this.starting(piece);
                row.push(piece);
            }
            this.cells.push(row);
        }
    }

    //--------------------------------------------------------------------------
    // Pieces and their neighbours

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

    // Every tile of one kind on the board.
    every(kind) {
        const out = [];
        for (let r = 0; r < this.rows; r++)
            for (let c = 0; c < this.cols; c++) if (this.is(c, r, kind)) out.push([c, r]);
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
        this.laidOut();
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
    // The ground: the board and the flat pieces on it, drawn once into a layer and again whenever a
    // ground piece moves. `look` gives its colours; `paintGround` draws what lies on it.

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

        const s = this.cell;
        const pad = 12 * u;
        const frame = (inset, radius, colour, drop = 0) =>
            fillRound(
                ctx,
                this.bx - pad + inset,
                this.by - pad + inset + drop,
                this.boardW + (pad - inset) * 2,
                this.boardH + (pad - inset) * 2,
                radius,
                colour
            );
        frame(0, 26 * u, SHADOW, 7 * u);
        frame(0, 26 * u, look.edge);
        frame(pad * 0.5, 20 * u, look.base);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if ((r + c) % 2) {
                    ctx.fillStyle = look.alt;
                    ctx.fillRect(this.bx + c * s, this.by + r * s, s, s);
                }
            }
        }
        this.paintGround(ctx);
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

    // A joined line through the middle of each tile of a kind: paths, roads.
    drawPaths(ctx, width, colour, kind = 'path') {
        const s = this.cell;
        ctx.strokeStyle = colour;
        ctx.fillStyle = colour;
        ctx.lineWidth = width;
        ctx.lineCap = 'round';
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.is(c, r, kind)) continue;
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
            this.cells[o.r][o.c] = null;
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
            const piece = this.at(o.c, o.r);
            if (!piece || piece.away) return;
            piece.bounce.kick(5);
            this.tap(o.c, o.r, piece, p);
        } else if (o.type === 'empty') {
            this.tapEmpty(o.c, o.r, p);
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
            if (this.isGround(d.piece.kind)) this.drawGround();
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
        const cleared = this.clearTile(c, r);
        const ground = this.isGround(piece.kind);
        if (ground || cleared) this.drawGround();
        this.normalise(quiet);
        this.placed(c, r, piece, quiet);
        if (quiet) return;
        const rect = this.cellRect(c, r);
        this.voice(piece.kind, rect.x + rect.s / 2, 1);
        if (this.joins(piece.kind)) {
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

    // A few stars above the board.
    drawStars(ctx) {
        const k = this.night;
        for (let i = 0; i < 9; i++) {
            const sx = ((i * 37 + 11) % 100) / 100;
            const sy = ((i * 61 + 23) % 100) / 100;
            const x = this.w * (0.12 + 0.76 * sx);
            const y = Math.max(8, this.by - 18) * (0.2 + 0.6 * sy);
            const twinkle = 0.6 + 0.4 * Math.sin(this.time * 2 + i);
            sparkle(ctx, x, y, 5 * twinkle, `rgba(255, 250, 225, ${0.9 * k})`);
        }
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

        this.drawBelow(ctx);

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const p = this.cells[r][c];
                if (!p || p.away || !this.stands(p)) continue;
                const rect = this.cellRect(c, r);
                this.drawPiece(ctx, p, c, r, rect.x, rect.y, s);
            }
        }

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
        if (this.night < 0.5) sun(ctx, 0, 0, 12);
        else moon(ctx, -2, 2, 14, back);
        ctx.restore();
    }

    exit() {
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

    // A piece the board begins with, before anyone has touched it.
    starting() {}

    // Flat pieces: drawn into the ground layer, under everything standing.
    isGround() {
        return false;
    }

    // Whether a piece is drawn standing on its tile, in row order.
    stands(p) {
        return !this.isGround(p.kind);
    }

    // Kinds whose neighbours bounce in a climbing ripple when one is put beside them.
    joins(kind) {
        return this.isGround(kind);
    }

    // After any change to the board.
    normalise() {}

    // After layout, before the ground is drawn.
    laidOut() {}

    // A piece picked up from (c, r).
    lifted() {}

    // A piece put on (c, r).
    placed() {}

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

    // Something to touch that is not a piece, or null.
    targetAt() {
        return null;
    }

    tap() {}

    tapEmpty() {}

    voice() {}

    paintGround() {}

    drawBelow() {}

    drawPiece() {}

    drawAbove() {}

    drawNight() {}

    drawLoose() {}

    dusk() {}

    dawn() {}
}
