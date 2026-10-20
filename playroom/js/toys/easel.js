// The easel: watercolour on textured paper, and the Montessori metal insets.
//
// Paint is laid down as many soft, faint dabs blended with `multiply`, which is how transparent
// watercolour behaves: colours glaze over each other rather than covering, so yellow over blue
// makes green, and a slow stroke pools darker than a quick one. The paper's tooth shows through.
//
// The metal insets are the Montessori material that prepares the hand for writing: pink frames
// with a shape cut out of each. Lay one on the paper and paint goes only through the hole; lift it
// and a clean shape is left behind. A child scribbling across a frame makes a perfect circle,
// which is a lovely thing to discover by accident.
//
//   touch  - paint with a finger, or several. Touch a pot to change colour.
//   move   - lay a frame on the paper and paint through it; slide it about; tap it in the tray to
//            lift it off. A fresh sheet comes from the stack in the corner.
//   make   - shapes built from shapes, colours mixed on the paper.
//
// The painting stays on the easel while the playroom is open, so a trip to the shelf does not
// throw it away.

import { Scene } from '../stage.js';
import {
    PALETTE,
    SHADOW,
    SHADOW_SOFT,
    makeLayer,
    freeLayer,
    grain,
    roundRect,
    fillRound,
    woodPanel,
    disc,
    ellipse,
} from '../draw.js';
import { Spring, clamp, dist, shade, rng, easeInOutCubic, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';

const PAPER_W = 1000;
const PAPER_H = 750;
const PAPER_SCALE = 1.6;
const PLATE = 300;

const PAINTS = [
    { colour: '#E79A98', degree: 5 },
    { colour: '#F1CF5E', degree: 7 },
    { colour: '#7FB2DE', degree: 9 },
    { colour: '#8EBF7A', degree: 8 },
    { colour: '#AE93D6', degree: 10 },
    { colour: '#9A7B63', degree: 3 },
];
const PAINT_COUNTS = [3, 6, 6];
const BRUSH = [30, 22, 17];
const STENCIL_SETS = [
    [],
    ['circle', 'square', 'triangle', 'quatrefoil'],
    ['circle', 'square', 'triangle', 'quatrefoil', 'ellipse', 'curved', 'pentagon', 'trapezoid'],
];

// Each shape, centred on the origin, about `s` across: the hole in a metal inset frame.
const SHAPES = {
    circle(ctx, s) {
        ctx.arc(0, 0, s * 0.5, 0, TAU);
    },
    square(ctx, s) {
        const h = s * 0.44;
        ctx.moveTo(-h, -h);
        ctx.lineTo(h, -h);
        ctx.lineTo(h, h);
        ctx.lineTo(-h, h);
        ctx.closePath();
    },
    triangle(ctx, s) {
        const r = s * 0.56;
        for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + (i / 3) * TAU;
            const x = Math.cos(a) * r;
            const y = Math.sin(a) * r + s * 0.08;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    },
    ellipse(ctx, s) {
        ctx.ellipse(0, 0, s * 0.56, s * 0.36, 0, 0, TAU);
    },
    // Four overlapping circles, traced as one outline so it can be cut and clipped cleanly.
    quatrefoil(ctx, s) {
        const d = s * 0.2;
        const r = s * 0.26;
        const q = (d + Math.sqrt(2 * r * r - d * d)) / 2;
        const alpha = Math.atan2(q, q - d);
        for (let k = 0; k < 4; k++) {
            const phi = (k * Math.PI) / 2;
            ctx.arc(Math.cos(phi) * d, Math.sin(phi) * d, r, phi - alpha, phi + alpha);
        }
        ctx.closePath();
    },
    // The curvilinear triangle: each side an arc centred on the opposite corner.
    curved(ctx, s) {
        const side = s * 0.86;
        const R = side / Math.sqrt(3);
        const v = [];
        for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + (i / 3) * TAU;
            v.push([Math.cos(a) * R, Math.sin(a) * R + s * 0.06]);
        }
        const angle = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0]);
        ctx.moveTo(v[1][0], v[1][1]);
        ctx.arc(v[0][0], v[0][1], side, angle(v[0], v[1]), angle(v[0], v[2]));
        ctx.arc(v[1][0], v[1][1], side, angle(v[1], v[2]), angle(v[1], v[0]));
        ctx.arc(v[2][0], v[2][1], side, angle(v[2], v[0]), angle(v[2], v[1]));
        ctx.closePath();
    },
    pentagon(ctx, s) {
        const r = s * 0.52;
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (i / 5) * TAU;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r + s * 0.03);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r + s * 0.03);
        }
        ctx.closePath();
    },
    trapezoid(ctx, s) {
        ctx.moveTo(-s * 0.26, -s * 0.31);
        ctx.lineTo(s * 0.26, -s * 0.31);
        ctx.lineTo(s * 0.46, s * 0.31);
        ctx.lineTo(-s * 0.46, s * 0.31);
        ctx.closePath();
    },
};

// The painting outlives the scene: going to the shelf and back finds it where it was left.
let keptPaper = null;

function makePaper() {
    const canvas = document.createElement('canvas');
    canvas.width = PAPER_W * PAPER_SCALE;
    canvas.height = PAPER_H * PAPER_SCALE;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FBF7EF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Cold-press tooth: soft, irregular, and fixed, so paint settles into it the same way each time.
    const next = rng(Date.now() % 1000);
    for (let i = 0; i < 9000; i++) {
        const light = next() < 0.5;
        ctx.fillStyle = light ? 'rgba(255,255,255,0.7)' : 'rgba(150,130,110,0.10)';
        const size = 1 + next() * 2.5;
        ctx.fillRect(next() * canvas.width, next() * canvas.height, size, size);
    }
    ctx.setTransform(PAPER_SCALE, 0, 0, PAPER_SCALE, 0, 0);
    return { canvas, ctx };
}

function makeStamp(colour) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, colour);
    g.addColorStop(0.55, colour);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return canvas;
}

class EaselScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.paints = PAINTS.slice(0, PAINT_COUNTS[this.level]).map((p) => ({
            colour: p.colour,
            degree: p.degree,
            stamp: makeStamp(p.colour),
            lift: new Spring(0, 400, 18),
        }));
        this.current = 0;
        this.paints[0].lift.set(1);
        this.brush = BRUSH[this.level];
        this.stencils = STENCIL_SETS[this.level].map((name) => ({
            name,
            on: false,
            glow: new Spring(0, 300, 16),
        }));
        this.plate = null;
        if (!keptPaper) keptPaper = makePaper();
        this.paper = keptPaper;
        this.old = null;
        this.swap = 1;
        this.strokes = new Map();
        this.brushSound = new audio.Texture('brush');
        this.hand = null;
        this.bg = null;
        this.scratch = document.createElement('canvas').getContext('2d');
    }

    layout() {
        freeLayer(this.bg);
        const { w, h, u } = this;
        const landscape = w >= h;
        const side = this.stencils.length ? 132 * u : 0;
        const top = 92 * u;
        const bottom = 118 * u;
        const availW = landscape ? w - 40 * u - side - 24 * u : w - 48 * u;
        const availH = landscape ? h - top - bottom : h - top - bottom - (this.stencils.length ? 120 * u : 0);
        const k = Math.min(availW / PAPER_W, availH / PAPER_H);
        this.sheet = { x: 0, y: top, w: PAPER_W * k, h: PAPER_H * k, k };
        this.sheet.x = landscape ? 24 * u + (availW - this.sheet.w) / 2 : (w - this.sheet.w) / 2;

        const potY = this.sheet.y + this.sheet.h + 60 * u;
        const potGap = Math.min(96 * u, (this.sheet.w - 40 * u) / this.paints.length);
        const potX0 = this.sheet.x + this.sheet.w / 2 - (potGap * (this.paints.length - 1)) / 2;
        this.paints.forEach((p, i) => {
            p.x = potX0 + i * potGap;
            p.y = potY;
            p.r = 32 * u;
        });

        this.stencils.forEach((s, i) => {
            if (landscape) {
                const cols = this.stencils.length > 4 ? 2 : 1;
                const cell = 62 * u;
                const x0 = w - 20 * u - cols * cell;
                s.x = x0 + (i % cols) * cell + cell / 2;
                s.y = this.sheet.y + 120 * u + Math.floor(i / cols) * (cell + 8 * u);
                s.size = cell * 0.86;
            } else {
                const cell = Math.min(80 * u, (w - 48 * u) / this.stencils.length);
                s.x = (w - cell * this.stencils.length) / 2 + i * cell + cell / 2;
                s.y = h - 70 * u;
                s.size = cell * 0.84;
            }
        });
        this.stack =
            landscape && this.stencils.length
                ? { x: w - 20 * u - 66 * u, y: this.sheet.y + 34 * u }
                : { x: w - 66 * u, y: 46 * u };

        this.drawBackground();
        if (this.plate) this.buildPlateImage();
    }

    drawBackground() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        ctx.fillStyle = '#F2ECE3';
        ctx.fillRect(0, 0, w, h);
        woodPanel(ctx, 0, this.sheet.y + this.sheet.h + 18 * u, w, h, 0, PALETTE.wood, 81, this.scale);
        const s = this.sheet;
        fillRound(
            ctx,
            s.x - 14 * u + 5 * u,
            s.y - 14 * u + 9 * u,
            s.w + 28 * u,
            s.h + 28 * u,
            16 * u,
            SHADOW
        );
        woodPanel(
            ctx,
            s.x - 14 * u,
            s.y - 14 * u,
            s.w + 28 * u,
            s.h + 28 * u,
            16 * u,
            PALETTE.woodDark,
            82,
            this.scale
        );
        // The palette board under the pots.
        if (this.paints.length) {
            const first = this.paints[0];
            const last = this.paints[this.paints.length - 1];
            fillRound(
                ctx,
                first.x - 54 * u,
                first.y - 44 * u,
                last.x - first.x + 108 * u,
                88 * u,
                44 * u,
                'rgba(255,255,255,0.35)'
            );
        }
        if (this.stencils.length) {
            const xs = this.stencils.map((st) => st.x);
            const ys = this.stencils.map((st) => st.y);
            const x0 = Math.min(...xs) - 40 * u;
            const y0 = Math.min(...ys) - 40 * u;
            fillRound(
                ctx,
                x0 + 3 * u,
                y0 + 6 * u,
                Math.max(...xs) - x0 + 40 * u,
                Math.max(...ys) - y0 + 40 * u,
                18 * u,
                SHADOW_SOFT
            );
            fillRound(
                ctx,
                x0,
                y0,
                Math.max(...xs) - x0 + 40 * u,
                Math.max(...ys) - y0 + 40 * u,
                18 * u,
                '#E8DCCB'
            );
        }
        grain(ctx, 0, 0, w, h, 0.25, this.scale);
        this.bg = layer;
    }

    //--------------------------------------------------------------------------
    // Coordinates: screen <-> paper units.

    toPaper(x, y) {
        const s = this.sheet;
        return { x: (x - s.x) / s.k, y: (y - s.y) / s.k };
    }

    onPaper(x, y) {
        const s = this.sheet;
        return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
    }

    holePath(ctx, plate) {
        ctx.save();
        ctx.translate(plate.x, plate.y);
        ctx.beginPath();
        SHAPES[plate.name](ctx, PLATE * 0.66);
        ctx.restore();
    }

    inHole(px, py) {
        const ctx = this.scratch;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.holePath(ctx, this.plate);
        return ctx.isPointInPath(px, py);
    }

    onPlate(px, py) {
        const p = this.plate;
        return p && Math.abs(px - p.x) < PLATE / 2 && Math.abs(py - p.y) < PLATE / 2;
    }

    // The frame drawn once, at screen resolution, with its hole cut out.
    buildPlateImage() {
        const k = this.sheet.k;
        const size = PLATE * k;
        const layer = makeLayer(size + 20, size + 20, this.scale);
        const ctx = layer.ctx;
        ctx.translate(10 + size / 2, 10 + size / 2);
        ctx.scale(k, k);
        fillRound(ctx, -PLATE / 2 + 6, -PLATE / 2 + 10, PLATE, PLATE, 22, 'rgba(112, 84, 58, 0.22)');
        fillRound(ctx, -PLATE / 2, -PLATE / 2, PLATE, PLATE, 22, '#EDB1BA');
        fillRound(ctx, -PLATE / 2 + 10, -PLATE / 2 + 10, PLATE - 20, PLATE - 20, 16, '#F2C0C7');
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        SHAPES[this.plate.name](ctx, PLATE * 0.66);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
        ctx.beginPath();
        SHAPES[this.plate.name](ctx, PLATE * 0.66);
        ctx.strokeStyle = '#D9939E';
        ctx.lineWidth = 6;
        ctx.stroke();
        if (this.plate.image) freeLayer(this.plate.image);
        this.plate.image = layer;
        this.plate.pad = 10;
    }

    //--------------------------------------------------------------------------
    // Paint

    dab(stroke, x, y, pressure) {
        const ctx = this.paper.ctx;
        const paint = this.paints[stroke.paint];
        const r = this.brush * pressure;
        ctx.drawImage(
            paint.stamp,
            x - r + (Math.random() - 0.5) * 2,
            y - r + (Math.random() - 0.5) * 2,
            r * 2,
            r * 2
        );
    }

    paintTo(stroke, x, y, speed) {
        const ctx = this.paper.ctx;
        const pressure = clamp(1.15 - speed / 3200, 0.7, 1.15);
        const spacing = this.brush * 0.32;
        const d = dist(stroke.x, stroke.y, x, y);
        const steps = Math.max(1, Math.ceil(d / spacing));
        ctx.save();
        if (this.plate) {
            // Paint reaches the paper everywhere except under the metal: the paper, minus the
            // frame, plus its hole. Under the even-odd rule those three nested shapes are exactly
            // that.
            const plate = this.plate;
            this.holePath(ctx, plate);
            ctx.rect(-50, -50, PAPER_W + 100, PAPER_H + 100);
            ctx.rect(plate.x - PLATE / 2, plate.y - PLATE / 2, PLATE, PLATE);
            ctx.clip('evenodd');
        }
        ctx.globalCompositeOperation = 'multiply';
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            ctx.globalAlpha = 0.11 + Math.random() * 0.03;
            this.dab(stroke, stroke.x + (x - stroke.x) * t, stroke.y + (y - stroke.y) * t, pressure);
        }
        ctx.restore();
        stroke.x = x;
        stroke.y = y;
    }

    choose(index) {
        if (index === this.current) {
            this.paints[index].lift.kick(6);
        }
        this.paints[this.current].lift.target = 0;
        this.current = index;
        this.paints[index].lift.target = 1;
        audio.play(
            'gulp',
            { f: noteHz(this.paints[index].degree, 48) },
            { gain: 1.1, pan: (this.paints[index].x / this.w) * 2 - 1 }
        );
    }

    toggleStencil(s) {
        const wasOn = s.on;
        for (const other of this.stencils) other.on = false;
        if (this.plate && this.plate.image) freeLayer(this.plate.image);
        this.plate = null;
        if (wasOn) {
            audio.play('tink', { f: noteHz(9, 60) }, { gain: 0.6 });
            s.glow.kick(4);
            return;
        }
        s.on = true;
        s.glow.kick(6);
        this.plate = { name: s.name, x: PAPER_W / 2, y: PAPER_H / 2, image: null, held: null };
        this.buildPlateImage();
        audio.play('tink', { f: noteHz(11, 60) }, { gain: 0.6 });
        audio.play('latch', {}, { gain: 0.25, delay: 0.05 });
    }

    newSheet() {
        if (this.swap < 1) return;
        this.old = this.paper;
        keptPaper = makePaper();
        this.paper = keptPaper;
        this.swap = 0;
        audio.play('rustle', {}, { gain: 1 });
    }

    //--------------------------------------------------------------------------
    // Touch

    down(p) {
        const u = this.u;
        for (let i = 0; i < this.paints.length; i++) {
            const pot = this.paints[i];
            if (dist(p.x, p.y, pot.x, pot.y) < pot.r + 14 * u) {
                this.choose(i);
                return;
            }
        }
        for (const s of this.stencils) {
            if (Math.abs(p.x - s.x) < s.size * 0.6 && Math.abs(p.y - s.y) < s.size * 0.6) {
                this.toggleStencil(s);
                return;
            }
        }
        if (Math.abs(p.x - this.stack.x) < 44 * u && Math.abs(p.y - this.stack.y) < 40 * u) {
            this.newSheet();
            return;
        }
        if (!this.onPaper(p.x, p.y) || this.swap < 1) return;

        const at = this.toPaper(p.x, p.y);
        if (this.plate && this.onPlate(at.x, at.y) && !this.inHole(at.x, at.y)) {
            // The frame itself: slide it.
            this.plate.held = p;
            p.owner = { kind: 'plate', dx: this.plate.x - at.x, dy: this.plate.y - at.y };
            audio.play('tink', { f: noteHz(10, 60) }, { gain: 0.35 });
            return;
        }
        const stroke = { kind: 'paint', paint: this.current, x: at.x, y: at.y };
        p.owner = stroke;
        this.strokes.set(p, stroke);
        this.paintTo(stroke, at.x + 0.01, at.y, 0);
        audio.play('pat', {}, { gain: 0.15, pan: (p.x / this.w) * 2 - 1 });
    }

    move(p) {
        const o = p.owner;
        if (!o) return;
        const at = this.toPaper(p.x, p.y);
        if (o.kind === 'plate') {
            this.plate.x = clamp(at.x + o.dx, 0, PAPER_W);
            this.plate.y = clamp(at.y + o.dy, 0, PAPER_H);
            return;
        }
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) / this.sheet.k;
        this.paintTo(o, clamp(at.x, -20, PAPER_W + 20), clamp(at.y, -20, PAPER_H + 20), speed);
    }

    up(p) {
        const o = p.owner;
        if (!o) return;
        if (o.kind === 'plate') {
            this.plate.held = null;
            audio.play('tink', { f: noteHz(8, 60) }, { gain: 0.35 });
        }
        this.strokes.delete(p);
    }

    update(dt) {
        let busy = this.strokes.size > 0 || (this.plate && this.plate.held);
        let speed = 0;
        const now = performance.now();
        for (const p of this.strokes.keys()) {
            if (now - p.time < 90) speed = Math.max(speed, Math.sqrt(p.vx * p.vx + p.vy * p.vy));
        }
        this.brushSound.set(clamp(speed / (1400 * this.u), 0, 1), 0);

        for (const paint of this.paints) if (paint.lift.update(dt)) busy = true;
        for (const s of this.stencils) if (s.glow.update(dt)) busy = true;
        if (this.swap < 1) {
            this.swap = Math.min(1, this.swap + dt / 0.6);
            busy = true;
            if (this.swap >= 1) this.old = null;
        }
        return busy;
    }

    //--------------------------------------------------------------------------

    draw(ctx) {
        const u = this.u;
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);
        const s = this.sheet;

        ctx.save();
        roundRect(ctx, s.x, s.y, s.w, s.h, 4 * u);
        ctx.clip();
        if (this.swap < 1 && this.old) {
            const e = easeInOutCubic(this.swap);
            ctx.drawImage(this.old.canvas, s.x - e * (s.w + 40 * u), s.y, s.w, s.h);
            ctx.drawImage(this.paper.canvas, s.x + (1 - e) * (s.w + 40 * u), s.y, s.w, s.h);
        } else {
            ctx.drawImage(this.paper.canvas, s.x, s.y, s.w, s.h);
        }
        if (this.plate && this.plate.image) {
            const img = this.plate.image;
            const size = img.w;
            ctx.drawImage(
                img.canvas,
                s.x + this.plate.x * s.k - size / 2,
                s.y + this.plate.y * s.k - size / 2,
                size,
                img.h
            );
        }
        ctx.restore();

        for (let i = 0; i < this.paints.length; i++) this.drawPot(ctx, this.paints[i], i === this.current);
        for (const st of this.stencils) this.drawStencilIcon(ctx, st);
        this.drawStack(ctx);
    }

    drawPot(ctx, pot, chosen) {
        const u = this.u;
        const lift = pot.lift.value;
        const y = pot.y - lift * 8 * u;
        ellipse(ctx, pot.x + 3 * u, pot.y + 10 * u, pot.r * 1.05, pot.r * 0.45);
        ctx.fillStyle = SHADOW;
        ctx.fill();
        disc(ctx, pot.x, y, pot.r + 5 * u, '#FBF7EF');
        disc(ctx, pot.x, y, pot.r, pot.colour);
        ellipse(ctx, pot.x - pot.r * 0.3, y - pot.r * 0.35, pot.r * 0.35, pot.r * 0.2, -0.4);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
        if (chosen) {
            ctx.strokeStyle = shade(pot.colour, -0.25);
            ctx.lineWidth = 4 * u;
            ctx.beginPath();
            ctx.arc(pot.x, y, pot.r + 11 * u, 0, TAU);
            ctx.stroke();
        }
    }

    drawStencilIcon(ctx, st) {
        const u = this.u;
        const size = st.size * (1 + st.glow.value * 0.04);
        fillRound(ctx, st.x - size / 2 + 2 * u, st.y - size / 2 + 4 * u, size, size, 8 * u, SHADOW_SOFT);
        fillRound(ctx, st.x - size / 2, st.y - size / 2, size, size, 8 * u, st.on ? '#F6D9DD' : '#EDB1BA');
        ctx.save();
        ctx.translate(st.x, st.y);
        ctx.beginPath();
        SHAPES[st.name](ctx, size * 0.66);
        ctx.fillStyle = st.on ? 'rgba(237,177,186,0.5)' : '#A9C3E4';
        ctx.fill();
        ctx.restore();
    }

    drawStack(ctx) {
        const u = this.u;
        const { x, y } = this.stack;
        for (let i = 2; i >= 0; i--) {
            fillRound(
                ctx,
                x - 36 * u + i * 4 * u,
                y - 26 * u + i * 4 * u,
                72 * u,
                52 * u,
                5 * u,
                i === 0 ? '#FFFDF8' : '#EFE8DC'
            );
        }
        ctx.strokeStyle = 'rgba(160, 130, 100, 0.35)';
        ctx.lineWidth = 2 * u;
        roundRect(ctx, x - 36 * u, y - 26 * u, 72 * u, 52 * u, 5 * u);
        ctx.stroke();
        // A corner turned up, the universal sign for "another one".
        ctx.beginPath();
        ctx.moveTo(x + 36 * u, y + 6 * u);
        ctx.lineTo(x + 16 * u, y + 26 * u);
        ctx.lineTo(x + 36 * u, y + 26 * u);
        ctx.closePath();
        ctx.fillStyle = '#E3D9CA';
        ctx.fill();
    }

    exit() {
        this.brushSound.stop();
        freeLayer(this.bg);
        this.bg = null;
        if (this.plate && this.plate.image) freeLayer(this.plate.image);
    }
}

function icon(ctx, x, y, w, h, u) {
    const px = x + w * 0.14;
    const py = y + h * 0.12;
    const pw = w * 0.72;
    const ph = h * 0.56;
    fillRound(ctx, px + 2 * u, py + 4 * u, pw, ph, 4 * u, SHADOW);
    fillRound(ctx, px, py, pw, ph, 4 * u, '#FBF7EF');
    ctx.globalAlpha = 0.6;
    disc(ctx, px + pw * 0.38, py + ph * 0.5, ph * 0.28, '#7FB2DE');
    disc(ctx, px + pw * 0.58, py + ph * 0.45, ph * 0.26, '#F1CF5E');
    disc(ctx, px + pw * 0.72, py + ph * 0.62, ph * 0.18, '#E79A98');
    ctx.globalAlpha = 1;
    const colours = ['#E79A98', '#F1CF5E', '#7FB2DE', '#8EBF7A'];
    colours.forEach((c, i) => disc(ctx, x + w * (0.26 + i * 0.16), y + h * 0.84, w * 0.055, c));
}

export const toy = {
    id: 'easel',
    title: 'Easel',
    about: 'Watercolour that mixes on the paper, and Montessori metal insets to paint through.',
    mat: '#F1E8DA',
    icon,
    create: (app) => new EaselScene(app),
    sounds() {
        const list = [
            ['rustle', {}],
            ['latch', {}],
            ['pat', {}],
        ];
        for (const p of PAINTS) list.push(['gulp', { f: noteHz(p.degree, 48) }]);
        for (const d of [8, 9, 10, 11]) list.push(['tink', { f: noteHz(d, 60) }]);
        return list;
    },
    signature() {
        audio.play('rustle', {}, { gain: 0.65, delay: 0.05 });
    },
};
