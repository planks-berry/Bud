// The colour beats: the colour tower's cubes on a shelf that plays itself.
//
// A low wooden shelf of cubbies stands on the work rug: a column for each beat of a short loop, a
// row for each sound. A light travels along it, column by column, round and round, with a wooden
// ball rolling beneath it, and every cube the light reaches sounds. The colours sound their notes,
// as they always have (red C, yellow E, green G, blue A, purple the C above), a higher row a higher
// note; along the bottom, plain wooden cubes are a drum, a clap and a shaker. What a column holds
// sounds together, so a column is a chord and a row is a tune or a rhythm.
//
// It began as the Montessori pink tower, became the colour tower ("each block is a different
// colour, which is a different tone; a pattern can be built and played"), and is now a step
// sequencer: "a simple step sequencer style music and beat creator. Keep the main theme, but
// something with more creative pattern ability while staying with simple sounds."
//
//   touch  - tap an empty cubby and its cube drops in, sounding; tap a cube and it comes out.
//   move   - draw with a finger: a stroke begun on an empty cubby fills every cubby it crosses, one
//            begun on a cube empties them. Hold the ball, or the board it runs along, and the light
//            goes where the finger takes it, playing each column it reaches.
//   make   - a loop of tune and beat, heard every time round and changed a cube at a time.
//
// The loop keeps time by the audio clock, not the frames: each column's sounds are booked a moment
// ahead, to the sample, so the beat stays even when an old iPad drops a frame, and the light and
// the ball follow the same clock. Left alone for a few minutes, the loop plays to its end and rests
// until the next touch.

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
    bead,
    roundRect,
} from '../draw.js';
import {
    Spring,
    clamp,
    lerp,
    dist,
    approach,
    shade,
    hexToRgb,
    mixRgb,
    rgbString,
    easeInOutSine,
    TAU,
} from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { COLOURS, BEATS, STAGES, pickColours, rowsFor, starter, colourKey } from './cubes.js';

// How far ahead of the clock a column's sounds are booked, in seconds: enough to ride out a
// dropped frame, little enough that a cube put down is heard the next time round.
const AHEAD = 0.12;
// How long a cube glows after it sounds, and a column's light lasts, in seconds.
const GLOW = 0.55;
const BAND = 0.6;
// Left untouched this long, in seconds, the loop plays to its end and rests.
const IDLE = 180;
// The least time between two sounds from one stroke of a finger, so a quick stroke strums rather
// than roars.
const STRUM = 0.06;

const tint = (name) => COLOURS.find((kind) => kind.name === name);

// The last outing's colours, so the next brings different ones.
let lastColours = '';

class TowerScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        const stage = STAGES[this.level];
        const colours = pickColours(this.level, (Math.random() * 4294967296) >>> 0, lastColours);
        lastColours = colourKey(colours);
        this.rows = rowsFor(this.level, colours);
        this.steps = stage.steps;
        this.period = stage.step;
        this.grid = this.rows.map(() => {
            const row = [];
            for (let col = 0; col < this.steps; col++) row.push(null);
            return row;
        });
        for (const [row, col] of starter(this.level)) this.grid[row][col] = this.makeCube(row, col, false);
        this.leaving = [];
        this.bands = [];
        this.time = 0;
        this.touched = 0;
        // The loop: whether it runs, which clock it keeps, the next column to book and when, the
        // columns booked and not yet lit, and the last column lit.
        this.playing = true;
        this.stopping = false;
        this.ended = false;
        this.clock = '';
        this.nextCol = 0;
        this.nextAt = null;
        this.booked = [];
        this.lastCol = -1;
        // The ball: where it last stood and when, where it rests when the loop does, and the finger
        // holding it, with the column it holds it over.
        this.prevX = 0;
        this.prevAt = 0;
        this.rest = 0;
        this.held = null;
        this.heldX = 0;
        this.heldCol = -1;
        this.bg = null;
        this.sprites = {};
        this.placed = false;
    }

    makeCube(row, col, dropping = true) {
        return { row, col, squash: new Spring(0, 520, 14), glow: 0, fall: dropping ? 1 : 0, lift: 0 };
    }

    layout() {
        const { w, h, u } = this;
        this.floor = h * 0.74;
        this.stand = h * 0.9;
        const rows = this.rows.length;
        const top = 96 * u;
        // Cubbies as big as there is room for, up to a size a small hand cannot miss: up to half as
        // wide again as they are tall, or, on a narrow screen, a third as tall again as they are wide.
        let cellH = Math.min((this.stand - top) / (rows + 0.95), 150 * u);
        const cellW = Math.min((w * 0.92) / (this.steps + 0.3), cellH * 1.5, 175 * u);
        cellH = Math.min(cellH, cellW * 1.35);
        this.cellW = cellW;
        this.cellH = cellH;
        const unit = Math.min(cellW, cellH);
        this.board = Math.max(5 * u, unit * 0.14);
        this.inset = this.board * 0.3;
        this.size = unit * 0.64;
        this.depth = this.size * 0.2;
        this.gridW = cellW * this.steps;
        this.gridH = cellH * rows;
        this.x0 = (w - this.gridW) / 2;
        this.plinth = unit * 0.62;
        this.y1 = this.stand - this.plinth;
        this.y0 = this.y1 - this.gridH;
        this.groove = this.y1 + this.plinth * 0.45;
        this.ballR = this.plinth * 0.27;
        if (!this.placed) {
            this.rest = this.restX();
            this.prevX = this.rest;
            this.placed = true;
        } else {
            this.rest = this.restX();
            this.prevX = this.lastCol >= 0 ? this.colX(this.lastCol) : this.rest;
        }
        freeLayer(this.bg);
        for (const name of Object.keys(this.sprites)) freeLayer(this.sprites[name]);
        this.sprites = {};
        this.drawBackground();
    }

    colX(col) {
        return this.x0 + (col + 0.5) * this.cellW;
    }

    // Where the ball waits when the loop rests: the left end of its board.
    restX() {
        return this.x0 + this.cellW * 0.12 + this.ballR;
    }

    panOf(col) {
        return (((col + 0.5) / this.steps) * 2 - 1) * 0.5;
    }

    // A cubby, by its row from the bottom and its column from the left.
    cellRect(row, col) {
        return {
            x: this.x0 + col * this.cellW,
            y: this.y1 - (row + 1) * this.cellH,
            w: this.cellW,
            h: this.cellH,
        };
    }

    cellAt(x, y) {
        if (x < this.x0 || x >= this.x0 + this.gridW || y < this.y0 || y >= this.y1) return null;
        const col = Math.floor((x - this.x0) / this.cellW);
        const row = this.rows.length - 1 - Math.floor((y - this.y0) / this.cellH);
        return { row, col };
    }

    // The middle of a cube's bottom edge, standing in its cubby.
    footOf(c) {
        return { x: this.colX(c.col), y: this.y1 - c.row * this.cellH - this.inset };
    }

    //--------------------------------------------------------------------------
    // The room and the shelf, drawn once a layout.

    drawBackground() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const wall = ctx.createLinearGradient(0, 0, 0, this.floor);
        wall.addColorStop(0, '#FBF1EC');
        wall.addColorStop(1, '#F5E6DE');
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, h);
        woodPanel(ctx, -10, this.floor, w + 20, h - this.floor + 20, 0, PALETTE.wood, 33, this.scale);

        // The work rug, under the shelf.
        const rx = w * 0.03;
        const ry = this.stand - 34 * u;
        const rw = w * 0.94;
        const rh = Math.min(84 * u, h - ry - 8 * u);
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

        const left = this.x0 - this.board;
        const right = this.x0 + this.gridW + this.board;
        const top = this.y0 - this.board;
        ellipse(ctx, (left + right) / 2 + 6 * u, this.stand + 2 * u, (right - left) / 2 + 12 * u, 11 * u);
        ctx.fillStyle = 'rgba(112, 84, 58, 0.16)';
        ctx.fill();
        woodPanel(
            ctx,
            left,
            top,
            right - left,
            this.stand - top,
            this.board * 0.8,
            PALETTE.wood,
            41,
            this.scale
        );

        // The plinth, a shade darker, and the groove along it that the ball runs in.
        ctx.save();
        roundRect(ctx, left, top, right - left, this.stand - top, this.board * 0.8);
        ctx.clip();
        ctx.fillStyle = 'rgba(150, 105, 62, 0.13)';
        ctx.fillRect(left, this.y1, right - left, this.stand - this.y1);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fillRect(left, this.y1, right - left, Math.max(1, this.board * 0.12));
        ctx.restore();
        const r = this.ballR;
        const g0 = this.x0 + this.cellW * 0.12;
        const g1 = this.x0 + this.gridW - this.cellW * 0.12;
        fillRound(ctx, g0, this.groove - r * 1.15, g1 - g0, r * 2.3, r * 1.15, shade(PALETTE.woodDark, -0.1));
        fillRound(ctx, g0, this.groove - r * 1.15, g1 - g0, r * 0.9, r * 0.9, 'rgba(90, 60, 35, 0.16)');

        // The cubbies: each a recess, its back faintly the colour of what goes in it, shadowed under
        // the board above, and showing, fainter still, the cube that belongs there.
        for (let row = 0; row < this.rows.length; row++) {
            const kind = this.rows[row];
            const back = kind.beat
                ? shade(PALETTE.wood, -0.09)
                : rgbString(mixRgb(hexToRgb(kind.colour), [247, 238, 226], 0.8));
            for (let col = 0; col < this.steps; col++) {
                const cell = this.cellRect(row, col);
                const x = cell.x + this.inset;
                const y = cell.y + this.inset;
                const cw = cell.w - this.inset * 2;
                const ch = cell.h - this.inset * 2;
                const radius = this.inset * 1.6;
                fillRound(ctx, x, y, cw, ch, radius, back);
                const shadow = ctx.createLinearGradient(0, y, 0, y + ch * 0.4);
                shadow.addColorStop(0, 'rgba(90, 60, 35, 0.2)');
                shadow.addColorStop(1, 'rgba(90, 60, 35, 0)');
                ctx.fillStyle = shadow;
                roundRect(ctx, x, y, cw, ch, radius);
                ctx.fill();
                this.drawGhost(ctx, kind, cell);
            }
        }
        // A firmer board between the beats and the colours.
        const beats = this.rows.filter((kind) => kind.beat).length;
        if (beats && beats < this.rows.length) {
            const y = this.y1 - beats * this.cellH;
            fillRound(
                ctx,
                left + this.board * 0.4,
                y - this.inset,
                right - left - this.board * 0.8,
                this.inset * 2,
                this.inset,
                shade(PALETTE.woodDark, -0.02)
            );
        }
        grain(ctx, 0, 0, w, h, 0.3, this.scale);
        this.bg = layer;
    }

    // The faint outline of the cube that goes in an empty cubby.
    drawGhost(ctx, kind, cell) {
        const s = this.size;
        const x = cell.x + cell.w / 2;
        const foot = cell.y + cell.h - this.inset;
        const radius = Math.max(2, s * 0.06);
        ctx.save();
        if (kind.beat) {
            ctx.globalAlpha = 0.3;
            this.mark(ctx, kind.mark, x, foot - s / 2, s, shade(kind.colour, -0.3));
        } else {
            // A dashed edge, so the cubby still reads as empty.
            const e = s * 0.92;
            ctx.setLineDash([s * 0.09, s * 0.07]);
            ctx.lineWidth = Math.max(1.5, s * 0.035);
            ctx.strokeStyle = rgbString(mixRgb(hexToRgb(kind.colour), [96, 74, 60], 0.15), 0.55);
            roundRect(ctx, x - e / 2, foot - (s + e) / 2, e, e, radius);
            ctx.stroke();
        }
        ctx.restore();
    }

    // What is burnt into a beat's face: a drum's skin, a clap's burst, a shaker's seeds.
    mark(ctx, mark, x, y, s, colour) {
        ctx.save();
        ctx.strokeStyle = colour;
        ctx.fillStyle = colour;
        ctx.lineWidth = Math.max(1.5, s * 0.06);
        ctx.lineCap = 'round';
        if (mark === 'skin') {
            ctx.beginPath();
            ctx.arc(x, y, s * 0.27, 0, TAU);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, s * 0.08, 0, TAU);
            ctx.fill();
        } else if (mark === 'burst') {
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * TAU;
                ctx.moveTo(x + Math.cos(a) * s * 0.1, y + Math.sin(a) * s * 0.1);
                ctx.lineTo(x + Math.cos(a) * s * 0.27, y + Math.sin(a) * s * 0.27);
            }
            ctx.stroke();
        } else {
            for (const [dx, dy] of [
                [-1, -1],
                [1, -1],
                [0, 0],
                [-1, 1],
                [1, 1],
            ]) {
                ctx.beginPath();
                ctx.arc(x + dx * s * 0.18, y + dy * s * 0.18, s * 0.065, 0, TAU);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // A cube's picture, made once a layout: its top, its face and, for a beat, its mark.
    sprite(kind) {
        let layer = this.sprites[kind.name];
        if (layer) return layer;
        const s = this.size;
        const d = this.depth;
        layer = makeLayer(s, s + d, this.scale);
        const ctx = layer.ctx;
        const r = Math.max(2, s * 0.06);
        fillRound(ctx, 0, 0, s, d + r * 2, r, shade(kind.colour, 0.38));
        fillRound(ctx, 0, d, s, s, r, kind.colour);
        fillRound(ctx, 0, d + s * 0.88, s, s * 0.12, r, shade(kind.colour, -0.08));
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(r, d + 1, s - r * 2, Math.max(1.5, s * 0.025));
        if (kind.beat) this.mark(ctx, kind.mark, s / 2, d + s / 2, s, shade(kind.colour, -0.32));
        this.sprites[kind.name] = layer;
        return layer;
    }

    //--------------------------------------------------------------------------
    // Sound

    // One cube's sound: a colour's note, knocked on wood, or a beat.
    voice(kind, gain, pan, delay) {
        if (kind.beat) audio.play(kind.name, {}, { gain, pan, wet: 0.08, delay });
        else audio.note('wood', kind.degree, 60, { gain, pan, wet: 0.2, delay });
    }

    // What a column holds, sounded together `delay` seconds from now. The notes share their
    // loudness, so a chord of five is fuller than one note, not five times louder.
    sound(col, delay) {
        let notes = 0;
        for (let row = 0; row < this.rows.length; row++) {
            if (this.grid[row][col] && !this.rows[row].beat) notes++;
        }
        const share = 1 / Math.sqrt(Math.max(1, notes));
        const pan = this.panOf(col);
        for (let row = 0; row < this.rows.length; row++) {
            if (!this.grid[row][col]) continue;
            const kind = this.rows[row];
            this.voice(kind, kind.beat ? 0.9 : 0.85 * share, pan, delay);
        }
    }

    //--------------------------------------------------------------------------
    // The loop

    // The clock the loop keeps: the audio context's while sound runs, so what is booked ahead plays
    // to the sample; the frames' otherwise, so the light still travels in silence. A change of
    // clock starts the count again.
    now() {
        const audible = audio.ready() && audio.now() > 0;
        const clock = audible ? 'audio' : 'frames';
        const now = audible ? audio.now() : this.time;
        if (clock !== this.clock) {
            this.clock = clock;
            this.nextAt = null;
            this.booked = [];
            this.prevAt = now;
        }
        return now;
    }

    // Book the columns due in the next moment: their sounds to the sample, their light for when
    // they sound.
    book(now) {
        if (this.nextAt === null || this.nextAt < now - 0.2) {
            // A fresh start, or back from a stall: the ball rolls on from where it is into the next
            // column, which plays when it gets there.
            this.prevAt = now;
            this.nextAt = now + this.period;
            this.booked = [];
        }
        while (!this.ended && this.nextAt < now + AHEAD) {
            if (this.stopping && this.nextCol === 0 && this.lastCol >= 0) {
                this.ended = true;
                break;
            }
            this.sound(this.nextCol, Math.max(0, this.nextAt - now));
            this.booked.push({ col: this.nextCol, at: this.nextAt });
            this.nextCol = (this.nextCol + 1) % this.steps;
            this.nextAt += this.period;
        }
    }

    // A column's time has come: it lights, and every cube in it jumps.
    light(e) {
        this.lastCol = e.col;
        this.prevX = this.colX(e.col);
        this.prevAt = e.at;
        this.bands.push({ col: e.col, at: this.time });
        for (let row = 0; row < this.rows.length; row++) {
            const c = this.grid[row][e.col];
            if (!c) continue;
            c.glow = 1;
            c.squash.kick(this.rows[row].beat ? 9 : 6);
        }
    }

    // A touch keeps the loop going, or starts it again from the first column.
    rouse() {
        this.touched = this.time;
        this.stopping = false;
        if (this.playing) {
            this.ended = false;
            return;
        }
        this.playing = true;
        this.ended = false;
        this.nextCol = 0;
        this.nextAt = null;
        this.booked = [];
        this.lastCol = -1;
        this.prevX = this.rest;
    }

    // The ball held over a column plays it, once each time it comes to it.
    holdAt(x) {
        this.heldX = clamp(x, this.colX(0), this.colX(this.steps - 1));
        const col = clamp(Math.floor((x - this.x0) / this.cellW), 0, this.steps - 1);
        if (col === this.heldCol) return;
        this.heldCol = col;
        this.sound(col, 0);
        this.light({ col, at: this.now() });
    }

    // Let go, the ball rolls on from where it was left into the next column, and the loop with it.
    letGo() {
        const now = this.now();
        this.held = null;
        this.prevX = this.heldX;
        this.prevAt = now;
        this.lastCol = this.heldCol;
        this.nextCol = (this.heldCol + 1) % this.steps;
        this.nextAt = now + this.period;
        this.booked = [];
    }

    // Where the ball is: in the hand; rolling from the last column to the next, with a hop over the
    // front of the shelf when the loop goes round; or resting.
    ballAt(now) {
        if (this.held) return { x: this.heldX, y: this.groove - 3 * this.u };
        if (!this.playing) return { x: this.rest, y: this.groove };
        const next = this.booked.length
            ? this.booked[0]
            : this.nextAt !== null && !this.ended
              ? { col: this.nextCol, at: this.nextAt }
              : null;
        if (!next) return { x: this.prevX, y: this.groove };
        const span = Math.max(0.01, next.at - this.prevAt);
        const f = clamp((now - this.prevAt) / span, 0, 1);
        const to = this.colX(next.col);
        if (to < this.prevX - 1 && this.lastCol >= 0) {
            const k = easeInOutSine(f);
            return { x: lerp(this.prevX, to, k), y: this.groove - Math.sin(Math.PI * k) * this.cellH * 0.7 };
        }
        return { x: lerp(this.prevX, to, f), y: this.groove };
    }

    update(dt) {
        this.time += dt;
        const now = this.now();
        if (this.playing && !this.held) {
            if (!this.stopping && this.time - this.touched > IDLE) this.stopping = true;
            this.book(now);
        }
        while (this.booked.length && this.booked[0].at <= now) this.light(this.booked.shift());
        if (this.playing && this.ended && !this.booked.length && !this.held) {
            // Played to its end, untouched: rest.
            this.playing = false;
            this.rest = this.prevX;
            this.nextAt = null;
        }

        let busy = this.playing || !!this.held;
        for (const row of this.grid) {
            for (const c of row) {
                if (!c) continue;
                if (c.fall > 0) {
                    c.fall = Math.max(0, c.fall - dt / 0.15);
                    if (c.fall === 0) c.squash.kick(9);
                    busy = true;
                }
                // A settled spring is left alone: there are as many as there are cubes.
                const sq = c.squash;
                if ((sq.value !== sq.target || sq.velocity !== 0) && sq.update(dt)) busy = true;
                if (c.glow > 0) {
                    c.glow = Math.max(0, c.glow - dt / GLOW);
                    busy = true;
                }
            }
        }
        this.leaving = this.leaving.filter((c) => {
            c.lift += dt / 0.22;
            return c.lift < 1;
        });
        if (this.leaving.length) busy = true;
        this.bands = this.bands.filter((b) => this.time - b.at < BAND);
        if (this.bands.length) busy = true;
        if (!this.playing && !this.held) {
            // At rest, the ball rolls back to the start of its board.
            const home = this.restX();
            this.rest = approach(this.rest, home, 5, dt);
            if (Math.abs(this.rest - home) < 0.5) this.rest = home;
            else busy = true;
        }
        return busy;
    }

    //--------------------------------------------------------------------------
    // Touch

    // The ball, or anywhere along the board it runs on; not below it, where a hand resting on the
    // rug would hold the loop up.
    onBoard(x, y) {
        return (
            x > this.x0 - this.board &&
            x < this.x0 + this.gridW + this.board &&
            y >= this.y1 &&
            y < this.stand
        );
    }

    down(p) {
        this.rouse();
        if (this.onBoard(p.x, p.y)) {
            if (this.held) return;
            this.held = p;
            this.heldCol = -1;
            this.booked = [];
            p.owner = { ball: true };
            this.holdAt(p.x);
            return;
        }
        const at = this.cellAt(p.x, p.y);
        if (!at) return;
        const fill = !this.grid[at.row][at.col];
        p.owner = { ball: false, fill, x: p.x, y: p.y, sounded: -Infinity };
        this.set(at.row, at.col, fill, p.owner);
    }

    move(p) {
        const o = p.owner;
        if (!o) return;
        if (o.ball) {
            this.holdAt(p.x);
            return;
        }
        // Every cubby the finger crossed since it was last seen, not only the one under it now, so a
        // quick stroke misses none.
        const n = Math.max(
            1,
            Math.ceil(dist(o.x, o.y, p.x, p.y) / (Math.min(this.cellW, this.cellH) * 0.25))
        );
        for (let i = 1; i <= n; i++) {
            const at = this.cellAt(lerp(o.x, p.x, i / n), lerp(o.y, p.y, i / n));
            if (!at) continue;
            const empty = !this.grid[at.row][at.col];
            if (empty === o.fill) this.set(at.row, at.col, o.fill, o);
        }
        o.x = p.x;
        o.y = p.y;
    }

    up(p) {
        if (p.owner && p.owner.ball && this.held === p) this.letGo();
    }

    // Put a cube into a cubby, or take one out. A stroke sounds what it puts in, but no faster than
    // a strum.
    set(row, col, fill, stroke) {
        const kind = this.rows[row];
        const pan = this.panOf(col);
        const sounding = this.time - stroke.sounded >= STRUM;
        if (sounding) stroke.sounded = this.time;
        if (fill) {
            this.grid[row][col] = this.makeCube(row, col);
            if (sounding) this.voice(kind, 0.8, pan, 0);
            return;
        }
        const c = this.grid[row][col];
        this.grid[row][col] = null;
        this.leaving.push(c);
        if (sounding) audio.play('tick', { f: noteHz(kind.beat ? 0 : kind.degree, 72) }, { gain: 0.3, pan });
    }

    //--------------------------------------------------------------------------
    // Drawing

    draw(ctx) {
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);
        const now = this.now();

        // The light on a column as it plays: in at once, out slowly, so it seems to travel.
        for (const b of this.bands) {
            const k = 1 - (this.time - b.at) / BAND;
            const cell = this.cellRect(0, b.col);
            fillRound(
                ctx,
                cell.x + this.inset,
                this.y0 + this.inset,
                cell.w - this.inset * 2,
                this.gridH - this.inset * 2,
                this.inset * 1.6,
                `rgba(255, 250, 228, ${0.55 * k * k})`
            );
        }

        // Every glow goes down before any cube, so none lies over a neighbour.
        for (const row of this.grid) for (const c of row) if (c && c.glow > 0) this.drawGlow(ctx, c);
        for (const row of this.grid) for (const c of row) if (c) this.drawCube(ctx, c, 1);
        for (const c of this.leaving) this.drawCube(ctx, c, 1 - c.lift);

        const ball = this.ballAt(now);
        const r = this.ballR;
        ellipse(ctx, ball.x + r * 0.15, this.groove + r * 0.75, r * 0.9, r * 0.32);
        ctx.fillStyle = 'rgba(80, 52, 30, 0.22)';
        ctx.fill();
        bead(ctx, ball.x, ball.y, r, '#F4E6CC', 0);
    }

    drawGlow(ctx, c) {
        const kind = this.rows[c.row];
        const rgb = mixRgb(hexToRgb(kind.colour), [255, 252, 246], 0.2);
        const foot = this.footOf(c);
        const s = this.size;
        const d = this.depth;
        for (const [reach, alpha] of [
            [0.2, 0.3],
            [0.08, 0.5],
        ]) {
            const pad = s * reach * (0.5 + 0.5 * c.glow);
            fillRound(
                ctx,
                foot.x - s / 2 - pad,
                foot.y - s - d - pad,
                s + pad * 2,
                s + d + pad * 2,
                pad * 1.3,
                rgbString(rgb, alpha * c.glow)
            );
        }
    }

    drawCube(ctx, c, alpha) {
        const kind = this.rows[c.row];
        const s = this.size;
        const d = this.depth;
        const foot = this.footOf(c);
        const sprite = this.sprite(kind).canvas;
        if (c.squash.value === 0 && !c.fall && !c.lift && !c.glow && alpha >= 1) {
            // At rest, as most are: no need to move the canvas for it.
            ctx.drawImage(sprite, foot.x - s / 2, foot.y - s - d, s, s + d);
            return;
        }
        // Dropping in from above the cubby, or lifting out of it.
        const y = foot.y - c.fall * c.fall * this.cellH * 0.45 - c.lift * this.cellH * 0.3;
        const squash = c.squash.value * 0.012;
        ctx.save();
        if (alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
        ctx.translate(foot.x, y);
        ctx.scale(1 + squash, 1 - squash * 1.3);
        ctx.drawImage(sprite, -s / 2, -s - d, s, s + d);
        if (c.glow > 0) {
            fillRound(
                ctx,
                -s / 2,
                -s - d,
                s,
                s + d,
                Math.max(2, s * 0.06),
                `rgba(255, 250, 235, ${0.22 * c.glow})`
            );
        }
        ctx.restore();
    }

    exit() {
        freeLayer(this.bg);
        this.bg = null;
        for (const name of Object.keys(this.sprites)) freeLayer(this.sprites[name]);
        this.sprites = {};
    }
}

// The shelf's picture: a small shelf with a few cubes in it, a column lit, the ball beneath.
function icon(ctx, x, y, w, h) {
    const cols = 4;
    const rows = 3;
    const cw = w * 0.2;
    const ch = h * 0.21;
    const board = cw * 0.1;
    const gx = x + (w - cw * cols) / 2;
    const gy = y + h * 0.1;
    const plinth = ch * 0.5;
    fillRound(
        ctx,
        gx - board + 3,
        gy - board + 4,
        cw * cols + board * 2,
        ch * rows + board + plinth,
        board * 1.5,
        'rgba(112, 84, 58, 0.14)'
    );
    fillRound(
        ctx,
        gx - board,
        gy - board,
        cw * cols + board * 2,
        ch * rows + board + plinth,
        board * 1.5,
        PALETTE.wood
    );
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            fillRound(
                ctx,
                gx + c * cw + board * 0.4,
                gy + r * ch + board * 0.4,
                cw - board * 0.8,
                ch - board * 0.8,
                board,
                shade(PALETTE.wood, -0.1)
            );
        }
    }
    fillRound(
        ctx,
        gx + cw + board * 0.4,
        gy + board * 0.4,
        cw - board * 0.8,
        ch * rows - board * 0.8,
        board,
        'rgba(255, 250, 228, 0.6)'
    );
    const drum = BEATS[0];
    const cubes = [
        [0, 1, tint('blue').colour],
        [1, 0, tint('yellow').colour],
        [1, 1, tint('red').colour],
        [1, 3, tint('yellow').colour],
        [2, 0, drum.colour],
        [2, 2, drum.colour],
    ];
    const s = Math.min(cw, ch) * 0.68;
    const d = s * 0.2;
    for (const [r, c, colour] of cubes) {
        const cx = gx + (c + 0.5) * cw;
        const foot = gy + (r + 1) * ch - board * 0.4;
        fillRound(ctx, cx - s / 2, foot - s - d, s, d + 3, s * 0.06, shade(colour, 0.38));
        fillRound(ctx, cx - s / 2, foot - s, s, s, s * 0.06, colour);
    }
    for (const c of [0, 2]) {
        const cx = gx + (c + 0.5) * cw;
        const cy = gy + 3 * ch - board * 0.4 - s / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 0.27, 0, TAU);
        ctx.lineWidth = Math.max(1, s * 0.07);
        ctx.strokeStyle = shade(drum.colour, -0.32);
        ctx.stroke();
    }
    const by = gy + ch * rows + plinth * 0.45;
    fillRound(
        ctx,
        gx + cw * 0.1,
        by - plinth * 0.3,
        cw * cols - cw * 0.2,
        plinth * 0.6,
        plinth * 0.3,
        shade(PALETTE.woodDark, -0.1)
    );
    bead(ctx, gx + cw * 1.5, by, plinth * 0.26, '#F4E6CC', 0);
}

export const toy = {
    id: 'tower',
    title: 'Colour beats',
    about: 'A shelf of cubbies that plays itself: a light runs along it, round and round, and every cube it reaches sounds, each colour its own note, the wooden ones a drum, a clap or a shaker. Tap a cubby to put a cube in or take it out, draw a line of them with a finger, or hold the ball under the shelf and play it by hand.',
    stages: [
        'a loop of 4 beats: 2 colours and a drum',
        'a loop of 8 beats: 3 colours, a drum and a shaker',
        'a loop of 8 beats: all 5 colours, a drum, a clap and a shaker',
    ],
    mat: '#E4ECF3',
    icon,
    create: (app) => new TowerScene(app),
    // Any colour can come out, at any stage; the beats are the stage's.
    sounds(level) {
        const list = [];
        for (const kind of COLOURS)
            list.push(['wood', { f: noteHz(kind.degree, 60) }], ['tick', { f: noteHz(kind.degree, 72) }]);
        for (const name of STAGES[level].beats) list.push([name, {}]);
        return list;
    },
    signature() {
        audio.play('drum', {}, { gain: 0.7, delay: 0.05 });
        ['red', 'blue'].forEach((name, i) =>
            audio.note('wood', tint(name).degree, 60, { gain: 0.6, delay: 0.21 + i * 0.16 })
        );
    },
};
