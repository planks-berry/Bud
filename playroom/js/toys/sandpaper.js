// Sandpaper letters and numerals.
//
// The Montessori material is a smooth board with a letter cut from fine sandpaper glued to it:
// blue boards for vowels, pink for consonants, green for numerals. The child traces the letter
// with two fingers, in the direction it is written. The feedback is entirely in the material: the
// sand is rough under the fingers and the board is smooth, so a finger that wanders off the letter
// knows it at once, and nobody needs to say so.
//
// Here the same is done with sound. On the sand, a finger makes a soft sandy scratch whose loudness
// follows its speed, and it leaves the sand a little darker where it has passed. Off the sand, on
// the smooth board, there is silence. Nothing is checked or scored, and nothing is said aloud: the
// letters are silent, as asked.
//
//   touch  - choose a board from the box; trace it.
//   move   - the guide's finger shows how each one is written, once, when it is opened, and again
//            from the two-finger button. Arrows at either side go to the next board.
//   make   - at the numerals, the bowl lays out that many counters in pairs, Montessori's cards
//            and counters, and each one sounds the next note up as it lands.

import { Scene } from '../stage.js';
import {
    PALETTE,
    SHADOW,
    SHADOW_SOFT,
    makeLayer,
    freeLayer,
    grain,
    fillRound,
    disc,
    ellipse,
    bead,
} from '../draw.js';
import { Spring, clamp, dist, shade, rng, easeInOutCubic, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import { LETTER_LIST, NUMERAL_LIST, pointAlong, nearest } from './glyphs.js';
import * as audio from '../audio.js';

const BOARD = { vowel: '#AECBEA', consonant: '#EEB9BE', numeral: '#B9D7AB' };
const SAND = '#D9C39E';
const SAND_EDGE = '#C3A77E';
const WIDTH = 0.26;
const DEMO_SPEED = 1.35;
const TRAIL_LIFE = 2.6;

let sandTile = null;

// Fine grit at one speck per device pixel.
function grit() {
    if (sandTile) return sandTile;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const next = rng(55);
    for (let i = 0; i < 5200; i++) {
        const tone = next();
        ctx.fillStyle =
            tone < 0.45
                ? 'rgba(160, 128, 88, 0.55)'
                : tone < 0.8
                  ? 'rgba(245, 232, 205, 0.7)'
                  : 'rgba(120, 96, 66, 0.4)';
        ctx.fillRect(Math.floor(next() * 128), Math.floor(next() * 128), 1, 1);
    }
    sandTile = canvas;
    return canvas;
}

function strokePath(ctx, glyph, s, ox, oy) {
    ctx.beginPath();
    for (const points of glyph.strokes) {
        points.forEach((p, i) => {
            const x = ox + p[0] * s;
            const y = oy + p[1] * s;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
    }
}

// A whole board, drawn once into a layer: the board, its sand glyph, and the grit on the sand.
function boardLayer(glyph, w, h, scale, u, numerals) {
    const layer = makeLayer(w + 16 * u, h + 16 * u, scale);
    const ctx = layer.ctx;
    const pad = 8 * u;
    fillRound(ctx, pad + 3 * u, pad + 7 * u, w, h, 18 * u, SHADOW);
    fillRound(ctx, pad, pad, w, h, 18 * u, BOARD[glyph.kind]);
    fillRound(ctx, pad, pad, w, h * 0.06, 18 * u, 'rgba(255,255,255,0.25)');
    grain(ctx, pad, pad, w, h, 0.2, scale);

    const g = glyphPlacement(glyph, w, h, numerals);
    const ox = pad + g.ox;
    const oy = pad + g.oy;

    // The sand is drawn in its own layer so the grit can be laid only on it.
    const sand = makeLayer(w + 16 * u, h + 16 * u, scale);
    const sctx = sand.ctx;
    sctx.lineCap = 'round';
    sctx.lineJoin = 'round';
    strokePath(sctx, glyph, g.s, ox, oy);
    sctx.strokeStyle = SAND;
    sctx.lineWidth = WIDTH * g.s;
    sctx.stroke();
    sctx.save();
    sctx.globalCompositeOperation = 'source-atop';
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = sctx.createPattern(grit(), 'repeat');
    sctx.fillRect(0, 0, sand.canvas.width, sand.canvas.height);
    sctx.restore();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    strokePath(ctx, glyph, g.s, ox, oy + 2 * u);
    ctx.strokeStyle = SAND_EDGE;
    ctx.lineWidth = WIDTH * g.s + 3 * u;
    ctx.stroke();
    ctx.drawImage(sand.canvas, 0, 0, sand.w, sand.h);
    freeLayer(sand);
    layer.pad = pad;
    return layer;
}

// Glyph scale and origin within a board of size w x h. Letters share a baseline so ascenders
// and descenders read as such; numerals are centred.
function glyphPlacement(glyph, w, h, numerals) {
    const s = numerals ? (h * 0.84) / 2.05 : (h * 0.86) / 2.75;
    const oy = numerals ? h * 0.5 + 0.75 * s : h * 0.07 + 1.85 * s;
    const ox = w / 2 - ((glyph.box.x0 + glyph.box.x1) / 2) * s;
    return { s, ox, oy };
}

class SandpaperScene extends Scene {
    constructor(app, numerals) {
        super(app);
        this.numerals = numerals;
        this.level = app.level();
        this.glyphs = numerals ? NUMERAL_LIST : LETTER_LIST;
        this.view = 'box';
        this.index = 0;
        this.zoom = 0;
        this.zoomDir = 0;
        this.slide = 1;
        this.slideDir = 1;
        this.oldLayer = null;
        this.boardImage = null;
        this.trail = [];
        this.demo = null;
        this.tracers = new Set();
        this.sand = new audio.Texture('sand');
        this.counters = [];
        this.bowl = { wiggle: new Spring(0, 300, 10) };
        this.pressedTile = -1;
        this.time = 0;
        this.box = null;
    }

    layout() {
        this.release();
        const { w, h, u } = this;
        const landscape = w >= h;

        // The box: every board at once, in rows.
        const n = this.glyphs.length;
        const area = { x: 30 * u, y: 96 * u, w: w - 60 * u, h: h - 126 * u };
        let best = null;
        for (let cols = 2; cols <= 9; cols++) {
            const rows = Math.ceil(n / cols);
            const tw = Math.min((area.w / cols) * 0.86, (area.h / rows) * 0.86 * 0.78);
            if (!best || tw > best.tw) best = { cols, rows, tw };
        }
        const tw = best.tw;
        const th = tw / 0.78;
        const gapX = (area.w - best.cols * tw) / (best.cols + 1);
        const gapY = Math.min(gapX, (area.h - best.rows * th) / (best.rows + 1));
        const top = area.y + (area.h - best.rows * th - (best.rows - 1) * gapY) / 2;
        this.tiles = this.glyphs.map((glyph, i) => {
            const col = i % best.cols;
            const row = Math.floor(i / best.cols);
            const inRow = Math.min(best.cols, n - row * best.cols);
            const rowW = inRow * tw + (inRow - 1) * gapX;
            return { x: (w - rowW) / 2 + col * (tw + gapX), y: top + row * (th + gapY), w: tw, h: th };
        });

        // One board, large, clear of the home button above and with room for buttons below. The
        // numerals share the screen with their counters, side by side in either orientation.
        const boardTop = 96 * u;
        const below = 112 * u;
        const availH = h - boardTop - below;
        let bw;
        let bx;
        if (this.numerals) {
            const regionW = w * 0.54;
            bw = Math.min(availH * 0.78, regionW - 40 * u);
            bx = 20 * u + (regionW - 20 * u - bw) / 2;
        } else {
            bw = Math.min(availH * 0.78, landscape ? w - 320 * u : w - 120 * u);
            bx = (w - bw) / 2;
        }
        const bh = bw / 0.78;
        const by = boardTop + (availH - bh) / 2;
        this.board = { x: bx, y: by, w: bw, h: bh };

        const cx = bx + bw / 2;
        const cy = by + bh / 2;
        const under = by + bh + 56 * u;
        const beside = !this.numerals && Math.min(bx, w - bx - bw) >= 120 * u;
        this.arrows = [-1, 1].map((dir) => ({
            dir,
            x: beside ? (dir < 0 ? bx - 72 * u : bx + bw + 72 * u) : cx + dir * 124 * u,
            y: beside ? cy : under,
            r: 40 * u,
            press: new Spring(0, 500, 20),
        }));
        this.demoButton = { x: cx, y: under, r: 34 * u };
        this.boxButton = { x: w - 56 * u, y: 52 * u, r: 36 * u };
        if (this.numerals) {
            this.tray = { x: w * 0.56, y: by, w: w * 0.44 - 30 * u, h: bh };
            this.bowl.x = this.tray.x + this.tray.w / 2;
            this.bowl.y = this.tray.y + 46 * u;
            this.bowl.r = 46 * u;
        }

        this.drawBox();
        this.boardImage = boardLayer(this.glyphs[this.index], bw, bh, this.scale, u, this.numerals);
        // Counters were laid out for the old size; put them away rather than leave them adrift.
        this.counters = [];
    }

    drawBox() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        ctx.fillStyle = '#F4EDE2';
        ctx.fillRect(0, 0, w, h);
        grain(ctx, 0, 0, w, h, 0.25, this.scale);
        this.glyphs.forEach((glyph, i) => {
            const t = this.tiles[i];
            const tile = boardLayer(glyph, t.w, t.h, this.scale, u * 0.45, this.numerals);
            ctx.drawImage(tile.canvas, t.x - tile.pad, t.y - tile.pad, tile.w, tile.h);
            freeLayer(tile);
        });
        this.box = layer;
    }

    //--------------------------------------------------------------------------

    glyph() {
        return this.glyphs[this.index];
    }

    placement() {
        return glyphPlacement(this.glyph(), this.board.w, this.board.h, this.numerals);
    }

    // Screen point -> glyph units on the current board.
    toGlyph(x, y) {
        const g = this.placement();
        return { x: (x - this.board.x - g.ox) / g.s, y: (y - this.board.y - g.oy) / g.s };
    }

    openBoard(index) {
        this.index = index;
        this.trail = [];
        this.counters = [];
        freeLayer(this.boardImage);
        this.boardImage = boardLayer(
            this.glyph(),
            this.board.w,
            this.board.h,
            this.scale,
            this.u,
            this.numerals
        );
        this.view = 'board';
        this.zoomFrom = this.tiles[index];
        this.zoom = 0;
        this.zoomDir = 1;
        this.demo = { t: -0.75, auto: true };
        audio.play('wood', { f: 659 }, { gain: 0.7 });
        audio.play('whoosh', { variant: 'up' }, { gain: 0.45 });
    }

    backToBox() {
        this.zoomFrom = this.tiles[this.index];
        this.zoomDir = -1;
        this.demo = null;
        this.counters = [];
        audio.play('wood', { f: 440 }, { gain: 0.7 });
        audio.play('whoosh', { variant: 'down' }, { gain: 0.45 });
    }

    step(dir) {
        if (this.slide < 1) return;
        const next = (this.index + dir + this.glyphs.length) % this.glyphs.length;
        this.oldLayer = this.boardImage;
        this.boardImage = null;
        this.index = next;
        this.boardImage = boardLayer(
            this.glyph(),
            this.board.w,
            this.board.h,
            this.scale,
            this.u,
            this.numerals
        );
        this.trail = [];
        this.counters = [];
        this.slide = 0;
        this.slideDir = dir;
        this.demo = { t: -0.55, auto: true };
        audio.play('wood', { f: dir > 0 ? 784 : 587 }, { gain: 0.6 });
        audio.play('whoosh', { variant: dir > 0 ? 'up' : 'down' }, { gain: 0.35 });
    }

    // Cards and counters: pairs side by side, an odd one centred beneath the last pair.
    placeCounters() {
        const n = this.numerals ? Number(this.glyph().ch) : 0;
        if (!this.tray) return;
        const u = this.u;
        const sp = Math.min(54 * u, (this.tray.h - 130 * u) / Math.max(1, Math.ceil(n / 2)));
        const cx = this.bowl.x;
        const top = this.bowl.y + 92 * u;
        this.counters = [];
        for (let k = 0; k < n; k++) {
            const row = Math.floor(k / 2);
            const odd = n % 2 === 1 && k === n - 1;
            this.counters.push({
                x: odd ? cx : cx + (k % 2 ? 0.55 : -0.55) * sp,
                y: top + row * sp * 1.02 + (odd ? sp * 0.45 : 0),
                r: sp * 0.36,
                at: this.time + 0.15 + k * 0.2,
                landed: false,
                pop: new Spring(0, 380, 14),
                k,
            });
        }
    }

    //--------------------------------------------------------------------------
    // Touch

    down(p) {
        const u = this.u;
        if (this.zoomDir !== 0 && this.zoom > 0 && this.zoom < 1) return;
        if (this.view === 'box') {
            const i = this.tiles.findIndex(
                (t) =>
                    p.x > t.x - 6 * u &&
                    p.x < t.x + t.w + 6 * u &&
                    p.y > t.y - 6 * u &&
                    p.y < t.y + t.h + 6 * u
            );
            if (i >= 0) {
                this.pressedTile = i;
                p.owner = { kind: 'tile', i };
            }
            return;
        }
        for (const a of this.arrows) {
            if (dist(p.x, p.y, a.x, a.y) < a.r * 1.4) {
                a.press.kick(8);
                this.step(a.dir);
                return;
            }
        }
        if (dist(p.x, p.y, this.boxButton.x, this.boxButton.y) < this.boxButton.r * 1.3) {
            this.backToBox();
            return;
        }
        if (dist(p.x, p.y, this.demoButton.x, this.demoButton.y) < this.demoButton.r * 1.3) {
            this.demo = { t: 0, auto: false };
            this.trail = [];
            audio.play('pop', { f: 600 }, { gain: 0.5 });
            return;
        }
        if (this.tray) {
            if (dist(p.x, p.y, this.bowl.x, this.bowl.y) < this.bowl.r * 1.3) {
                this.bowl.wiggle.kick(6);
                if (this.counters.length) {
                    this.counters.forEach((c, i) =>
                        audio.note('marimba', Math.max(0, this.counters.length - 1 - i), 60, {
                            gain: 0.45,
                            delay: i * 0.05,
                        })
                    );
                    this.counters = [];
                } else if (Number(this.glyph().ch) === 0) {
                    audio.play('wood', { f: 392 }, { gain: 0.7 });
                } else {
                    this.placeCounters();
                }
                return;
            }
            for (const c of this.counters) {
                if (c.landed && dist(p.x, p.y, c.x, c.y) < c.r * 1.4) {
                    c.pop.kick(8);
                    audio.note('marimba', c.k, 60, { gain: 0.95, pan: (c.x / this.w) * 2 - 1 });
                    return;
                }
            }
        }
        const b = this.board;
        if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h && this.slide >= 1) {
            if (this.demo) this.demo = null;
            p.owner = { kind: 'trace' };
            this.tracers.add(p);
            this.trace(p);
        }
    }

    move(p) {
        if (p.owner && p.owner.kind === 'trace') this.trace(p);
        if (p.owner && p.owner.kind === 'tile') {
            const t = this.tiles[p.owner.i];
            if (
                p.x < t.x - 30 * this.u ||
                p.x > t.x + t.w + 30 * this.u ||
                p.y < t.y - 30 * this.u ||
                p.y > t.y + t.h + 30 * this.u
            ) {
                this.pressedTile = -1;
                p.owner = null;
            }
        }
    }

    up(p) {
        if (p.owner && p.owner.kind === 'tile') {
            this.pressedTile = -1;
            this.openBoard(p.owner.i);
        }
        this.tracers.delete(p);
    }

    // Is the finger on the sand? If so, darken the sand under it.
    trace(p) {
        const at = this.toGlyph(p.x, p.y);
        const near = nearest(this.glyph(), at.x, at.y);
        p.onSand = near.d < WIDTH / 2 + 0.08;
        if (!p.onSand) return;
        const last = this.trail[this.trail.length - 1];
        if (!last || Math.hypot(last.x - near.x, last.y - near.y) > 0.025) {
            this.trail.push({ x: near.x, y: near.y, t: this.time });
            if (this.trail.length > 500) this.trail.shift();
        }
    }

    //--------------------------------------------------------------------------

    update(dt) {
        this.time += dt;
        let busy = this.tracers.size > 0;

        if (this.zoomDir !== 0) {
            this.zoom = clamp(this.zoom + (this.zoomDir * dt) / 0.38, 0, 1);
            busy = true;
            if (this.zoomDir < 0 && this.zoom <= 0) {
                this.zoomDir = 0;
                this.view = 'box';
            } else if (this.zoomDir > 0 && this.zoom >= 1) this.zoomDir = 0;
        }
        if (this.slide < 1) {
            this.slide = Math.min(1, this.slide + dt / 0.4);
            busy = true;
            if (this.slide >= 1) {
                freeLayer(this.oldLayer);
                this.oldLayer = null;
            }
        }

        // The sound of sand under the fastest finger that is on it.
        let level = 0;
        const now = performance.now();
        for (const p of this.tracers) {
            if (p.onSand && now - p.time < 90)
                level = Math.max(level, clamp(Math.sqrt(p.vx * p.vx + p.vy * p.vy) / (700 * this.u), 0, 1));
        }

        if (this.demo && this.view === 'board' && this.zoomDir === 0 && this.slide >= 1) {
            busy = true;
            this.demo.t += dt;
            const glyph = this.glyph();
            const where = this.demoPoint();
            if (where && !where.lifted) {
                level = Math.max(level, 0.45);
                // The guide's finger darkens the sand as a child's does, and it fades the same way.
                const last = this.trail[this.trail.length - 1];
                if (!last || Math.hypot(last.x - where.x, last.y - where.y) > 0.025)
                    this.trail.push({ x: where.x, y: where.y, t: this.time });
            }
            if (this.demo.t > glyph.length / DEMO_SPEED + glyph.strokes.length * 0.4 + 0.6) this.demo = null;
        }
        this.sand.set(level);

        if (this.trail.length && this.time - this.trail[0].t > TRAIL_LIFE)
            this.trail = this.trail.filter((pt) => this.time - pt.t < TRAIL_LIFE);
        if (this.trail.length) busy = true;

        for (const a of this.arrows) if (a.press.update(dt)) busy = true;
        if (this.bowl.wiggle.update(dt)) busy = true;
        for (const c of this.counters) {
            if (!c.landed && this.time >= c.at) {
                c.landed = true;
                c.pop.kick(10);
                audio.note('marimba', c.k, 60, { gain: 0.85, pan: (c.x / this.w) * 2 - 1, wet: 0.2 });
            }
            if (c.pop.update(dt) || !c.landed) busy = true;
        }
        return busy;
    }

    // Where the guide's finger is: travelling the strokes in order, lifting briefly between them.
    demoPoint() {
        if (!this.demo || this.demo.t < 0) return null;
        const glyph = this.glyph();
        let t = this.demo.t;
        let travelled = 0;
        for (let s = 0; s < glyph.strokes.length; s++) {
            const time = glyph.lengths[s] / DEMO_SPEED;
            if (t <= time) {
                const pt = pointAlong(glyph, travelled + t * DEMO_SPEED);
                return pt ? { x: pt.x, y: pt.y, lifted: false } : null;
            }
            t -= time;
            travelled += glyph.lengths[s];
            if (t <= 0.4) return { lifted: true };
            t -= 0.4;
        }
        return { lifted: true };
    }

    //--------------------------------------------------------------------------

    draw(ctx) {
        const u = this.u;
        if (this.view === 'box' || this.zoom < 1) {
            ctx.drawImage(this.box.canvas, 0, 0, this.w, this.h);
            if (this.pressedTile >= 0) {
                const t = this.tiles[this.pressedTile];
                fillRound(ctx, t.x, t.y, t.w, t.h, 10 * u, 'rgba(255,255,255,0.35)');
            }
        }
        if (this.view === 'box' && this.zoomDir === 0) return;

        const e = easeInOutCubic(this.zoom);
        if (e < 1) {
            ctx.fillStyle = `rgba(244, 237, 226, ${e * 0.92})`;
            ctx.fillRect(0, 0, this.w, this.h);
        } else {
            ctx.fillStyle = '#F4EDE2';
            ctx.fillRect(0, 0, this.w, this.h);
        }

        const b = this.board;
        const from = this.zoomFrom || b;
        const rect = {
            x: from.x + (b.x - from.x) * e,
            y: from.y + (b.y - from.y) * e,
            w: from.w + (b.w - from.w) * e,
            h: from.h + (b.h - from.h) * e,
        };

        const k = rect.w / b.w;
        const img = this.boardImage;
        const pad = img.pad * k;
        if (this.slide < 1 && this.oldLayer) {
            const s = easeInOutCubic(this.slide);
            const shift = (b.w + 160 * u) * this.slideDir;
            ctx.drawImage(this.oldLayer.canvas, rect.x - pad - shift * s, rect.y - pad, img.w * k, img.h * k);
            ctx.drawImage(img.canvas, rect.x - pad + shift * (1 - s), rect.y - pad, img.w * k, img.h * k);
        } else {
            ctx.drawImage(img.canvas, rect.x - pad, rect.y - pad, img.w * k, img.h * k);
        }
        if (e < 1) return;

        this.drawTrail(ctx);
        this.drawDemo(ctx);
        this.drawControls(ctx);
        if (this.tray) this.drawCounters(ctx);
    }

    drawTrail(ctx) {
        if (!this.trail.length) return;
        const g = this.placement();
        const ox = this.board.x + g.ox;
        const oy = this.board.y + g.oy;
        const r = WIDTH * g.s * 0.42;
        for (const pt of this.trail) {
            const age = (this.time - pt.t) / TRAIL_LIFE;
            disc(ctx, ox + pt.x * g.s, oy + pt.y * g.s, r, `rgba(150, 118, 80, ${0.32 * (1 - age)})`);
        }
    }

    drawDemo(ctx) {
        const where = this.demoPoint();
        if (!where || where.lifted) return;
        const g = this.placement();
        const x = this.board.x + g.ox + where.x * g.s;
        const y = this.board.y + g.oy + where.y * g.s;
        const r = WIDTH * g.s * 0.55;
        disc(ctx, x + 3 * this.u, y + 5 * this.u, r, 'rgba(112,84,58,0.15)');
        disc(ctx, x, y, r, 'rgba(255, 250, 240, 0.92)');
        ctx.strokeStyle = 'rgba(150, 118, 80, 0.5)';
        ctx.lineWidth = 2 * this.u;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
    }

    drawControls(ctx) {
        const u = this.u;
        for (const a of this.arrows) {
            const s = 1 - a.press.value * 0.02;
            disc(ctx, a.x, a.y + 5 * u, a.r * s, SHADOW);
            disc(ctx, a.x, a.y, a.r * s, '#FBF6EE');
            ctx.strokeStyle = PALETTE.ink;
            ctx.lineWidth = 6 * u;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(a.x - a.dir * 6 * u, a.y - 13 * u);
            ctx.lineTo(a.x + a.dir * 8 * u, a.y);
            ctx.lineTo(a.x - a.dir * 6 * u, a.y + 13 * u);
            ctx.stroke();
        }

        // The box the boards live in.
        const bx = this.boxButton;
        disc(ctx, bx.x, bx.y + 5 * u, bx.r, SHADOW);
        disc(ctx, bx.x, bx.y, bx.r, '#FBF6EE');
        const colours = this.numerals
            ? [BOARD.numeral, BOARD.numeral, BOARD.numeral]
            : [BOARD.consonant, BOARD.vowel, BOARD.consonant];
        colours.forEach((c, i) =>
            fillRound(
                ctx,
                bx.x - 15 * u + i * 9 * u,
                bx.y - 18 * u + (i % 2) * 3 * u,
                12 * u,
                22 * u,
                3 * u,
                c
            )
        );
        fillRound(ctx, bx.x - 20 * u, bx.y - 2 * u, 40 * u, 18 * u, 4 * u, PALETTE.woodDark);

        // Two fingers, side by side: "show me how".
        const d = this.demoButton;
        disc(ctx, d.x, d.y + 5 * u, d.r, SHADOW);
        disc(ctx, d.x, d.y, d.r, '#FBF6EE');
        fillRound(ctx, d.x - 11 * u, d.y - 16 * u, 10 * u, 30 * u, 5 * u, '#F2CDB5');
        fillRound(ctx, d.x + 1 * u, d.y - 19 * u, 10 * u, 33 * u, 5 * u, '#F2CDB5');
        fillRound(ctx, d.x - 9 * u, d.y - 14 * u, 6 * u, 6 * u, 3 * u, '#FBE8DC');
        fillRound(ctx, d.x + 3 * u, d.y - 17 * u, 6 * u, 6 * u, 3 * u, '#FBE8DC');
    }

    drawCounters(ctx) {
        const u = this.u;
        const b = this.bowl;
        const tilt = b.wiggle.value * 0.04;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(tilt);
        ellipse(ctx, 4 * u, b.r * 0.5 + 6 * u, b.r * 1.05, b.r * 0.25);
        ctx.fillStyle = SHADOW_SOFT;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-b.r, -b.r * 0.1);
        ctx.quadraticCurveTo(-b.r, b.r * 0.65, 0, b.r * 0.65);
        ctx.quadraticCurveTo(b.r, b.r * 0.65, b.r, -b.r * 0.1);
        ctx.closePath();
        ctx.fillStyle = PALETTE.woodDark;
        ctx.fill();
        ellipse(ctx, 0, -b.r * 0.1, b.r, b.r * 0.28);
        ctx.fillStyle = shade(PALETTE.woodDark, -0.12);
        ctx.fill();
        if (!this.counters.length) {
            for (let i = 0; i < 5; i++)
                disc(ctx, (i - 2) * b.r * 0.3, -b.r * 0.14 + (i % 2) * b.r * 0.06, b.r * 0.16, '#E59A93');
        }
        ctx.restore();

        for (const c of this.counters) {
            if (!c.landed) continue;
            const s = 1 + c.pop.value * 0.04;
            bead(ctx, c.x, c.y, c.r * s, '#E59A93', 3 * u);
        }
    }

    release() {
        freeLayer(this.box);
        freeLayer(this.boardImage);
        freeLayer(this.oldLayer);
        this.box = null;
        this.boardImage = null;
        this.oldLayer = null;
    }

    exit() {
        this.sand.stop();
        this.release();
    }
}

function icon(numerals) {
    return (ctx, x, y, w, h, u) => {
        const glyphs = numerals
            ? [NUMERAL_LIST[1], NUMERAL_LIST[2], NUMERAL_LIST[3]]
            : [LETTER_LIST[0], LETTER_LIST[1], LETTER_LIST[2]];
        const bw = w * 0.26;
        const bh = bw / 0.78;
        glyphs.forEach((glyph, i) => {
            const bx = x + w * 0.1 + i * (bw + w * 0.04);
            const by = y + (h - bh) / 2 + (i === 1 ? -h * 0.04 : h * 0.03);
            fillRound(ctx, bx + 2 * u, by + 4 * u, bw, bh, 6 * u, SHADOW);
            fillRound(ctx, bx, by, bw, bh, 6 * u, BOARD[glyph.kind]);
            const g = glyphPlacement(glyph, bw, bh, numerals);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            strokePath(ctx, glyph, g.s, bx + g.ox, by + g.oy);
            ctx.strokeStyle = SAND;
            ctx.lineWidth = WIDTH * g.s;
            ctx.stroke();
        });
    };
}

function sounds() {
    const list = [
        ['wood', { f: 659 }],
        ['wood', { f: 440 }],
        ['wood', { f: 784 }],
        ['wood', { f: 587 }],
        ['wood', { f: 392 }],
        ['pop', { f: 600 }],
    ];
    for (let d = 0; d <= 9; d++) list.push(['marimba', { f: noteHz(d, 60) }]);
    return list;
}

export const letters = {
    id: 'letters',
    title: 'Sandpaper letters',
    about: 'Lowercase letters to trace with a finger. Only the sand makes a sound; nothing is spoken.',
    mat: '#EEDCE0',
    icon: icon(false),
    create: (app) => new SandpaperScene(app, false),
    sounds,
    signature() {
        audio.play('wood', { f: 659 }, { gain: 0.5, delay: 0.05 });
    },
};

export const numerals = {
    id: 'numerals',
    title: 'Sandpaper numerals',
    about: 'Numerals 0 to 9 to trace, and a bowl of counters that lays out each quantity in pairs.',
    mat: '#DFEAD8',
    icon: icon(true),
    create: (app) => new SandpaperScene(app, true),
    sounds,
    signature() {
        audio.play('wood', { f: 784 }, { gain: 0.5, delay: 0.05 });
    },
};
