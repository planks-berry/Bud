// The first screen: a closed bud on its stem. Touching it makes it bloom, and the playroom opens.
//
// It exists for a technical reason as much as a gentle one. iOS will not start audio until the
// page has been touched, so the very first touch must happen somewhere that does not depend on
// sound. Here it is the touch that wakes the sound up, and the bloom answers it.

import { Scene } from './stage.js';
import { PALETTE, makeLayer, freeLayer, grain, ellipse, disc } from './draw.js';
import { Spring, clamp, easeOutBack, TAU } from './util.js';
import { noteHz } from './synth.js';
import * as audio from './audio.js';

// C5, E5, G5, C6: the opening chord, spread out.
const BLOOM_NOTES = [5, 7, 8, 10];

// Rendered while the bud waits, so the bloom sounds the instant it is touched.
export function startSounds() {
    return BLOOM_NOTES.map((degree) => ['chime', { f: noteHz(degree, 60) }]);
}

export class StartScene extends Scene {
    // `options.grain: false` leaves out the paper texture: the launch images use it, because
    // speckle is noise, and noise turns a 200 KB PNG into a 3 MB one.
    constructor(app, options = {}) {
        super(app);
        this.grain = options.grain !== false;
        this.time = 0;
        this.press = new Spring(0, 420, 18);
        this.bloom = 0;
        this.blooming = false;
        this.bloomTime = 0;
        this.left = false;
        this.bg = null;
    }

    layout() {
        freeLayer(this.bg);
        const { w, h, u } = this;
        this.cx = w / 2;
        this.cy = h * 0.42;
        this.r = 64 * u;
        this.ground = h * 0.84;

        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        ctx.fillStyle = PALETTE.wall;
        ctx.fillRect(0, 0, w, h);
        const glow = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, Math.max(w, h) * 0.55);
        glow.addColorStop(0, 'rgba(255, 246, 222, 0.95)');
        glow.addColorStop(1, 'rgba(255, 246, 222, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);

        // A low mound for the stem to grow out of.
        ellipse(ctx, this.cx, this.ground + 70 * u, 260 * u, 90 * u);
        ctx.fillStyle = PALETTE.sage;
        ctx.fill();
        ellipse(ctx, this.cx - 40 * u, this.ground + 58 * u, 150 * u, 40 * u);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fill();
        if (this.grain) grain(ctx, 0, 0, w, h, 0.3, this.scale);
        this.bg = layer;
    }

    update(dt) {
        this.time += dt;
        this.press.update(dt);
        if (this.blooming) {
            this.bloomTime += dt;
            this.bloom = clamp(this.bloomTime / 0.9, 0, 1);
            if (this.bloomTime > 1.25 && !this.left) {
                this.left = true;
                this.app.enterShelf();
            }
        }
        // Always animating: the stem sways and the invitation pulses. It is one screen, seen
        // briefly, and stillness here would read as broken.
        return true;
    }

    down() {
        if (this.blooming) return;
        this.press.target = 1;
    }

    up() {
        this.press.target = 0;
        if (this.blooming) return;
        this.blooming = true;
        BLOOM_NOTES.forEach((degree, i) => {
            audio.note('chime', degree, 60, {
                gain: 1,
                wet: 0.5,
                delay: i * 0.11 + (i === 3 ? 0.03 : 0),
                pan: (i - 1.5) * 0.2,
            });
        });
        this.app.warmUp();
    }

    draw(ctx) {
        const { u, cx } = this;
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);

        const sway = Math.sin(this.time * 0.9) * 0.035 * (1 - this.bloom * 0.6);
        const top = { x: cx + Math.sin(sway) * (this.ground - this.cy), y: this.cy + this.r * 0.85 };

        // Invitation: a slow ring, only while waiting.
        if (!this.blooming) {
            const phase = (this.time % 2.6) / 2.6;
            const ring = this.r * (1.2 + phase * 0.9);
            ctx.strokeStyle = `rgba(221, 148, 140, ${0.28 * (1 - phase)})`;
            ctx.lineWidth = 3 * u;
            ellipse(ctx, top.x, this.cy, ring, ring * 1.1);
            ctx.stroke();
        }

        this.drawStem(ctx, top, sway);

        const squash = 1 - this.press.value * 0.08;
        ctx.save();
        ctx.translate(top.x, this.cy + this.r * 0.85);
        ctx.rotate(sway * 1.4);
        ctx.scale(1 + this.press.value * 0.05, squash);
        ctx.translate(0, -this.r * 0.85);
        if (this.bloom < 1) this.drawBud(ctx, 1 - clamp(this.bloom * 1.6, 0, 1));
        if (this.bloom > 0) this.drawFlower(ctx, easeOutBack(this.bloom));
        ctx.restore();
    }

    drawStem(ctx, top, sway) {
        const { u, cx } = this;
        const base = { x: cx, y: this.ground + 20 * u };
        const control = { x: cx - 30 * u + sway * 200 * u, y: (base.y + top.y) / 2 };
        ctx.strokeStyle = PALETTE.sageDeep;
        ctx.lineWidth = 11 * u;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.quadraticCurveTo(control.x, control.y, top.x, top.y);
        ctx.stroke();

        const at = (t) => ({
            x: (1 - t) * (1 - t) * base.x + 2 * (1 - t) * t * control.x + t * t * top.x,
            y: (1 - t) * (1 - t) * base.y + 2 * (1 - t) * t * control.y + t * t * top.y,
        });
        this.leaf(ctx, at(0.32), -0.75 + sway, 58 * u, PALETTE.sage);
        this.leaf(ctx, at(0.55), Math.PI + 0.65 + sway, 50 * u, PALETTE.sageDeep);
    }

    leaf(ctx, at, angle, length, colour) {
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.rotate(angle);
        drawLeaf(ctx, length, colour, this.u);
        ctx.restore();
    }

    drawBud(ctx, alpha) {
        ctx.globalAlpha = alpha;
        drawBud(ctx, this.r, this.u);
        ctx.globalAlpha = 1;
    }

    drawFlower(ctx, b) {
        const r = this.r;
        const petals = 6;
        for (let i = 0; i < petals; i++) {
            const angle = (i / petals) * TAU + 0.3 + (1 - b) * 0.6;
            const d = r * 0.62 * b;
            ctx.save();
            ctx.rotate(angle);
            ellipse(ctx, 0, -d, r * 0.42 * (0.5 + 0.5 * b), r * 0.68 * (0.55 + 0.45 * b));
            ctx.fillStyle = i % 2 ? PALETTE.rose : '#F1C1BA';
            ctx.fill();
            ellipse(ctx, 0, -d - r * 0.18, r * 0.12, r * 0.24);
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.fill();
            ctx.restore();
        }
        disc(ctx, 0, 0, r * 0.36 * b, PALETTE.butter);
        ctx.fillStyle = PALETTE.butterDeep;
        for (let i = 0; i < 7; i++) {
            const a = i * 2.4;
            const d = r * 0.16 * Math.sqrt(i / 7) * b;
            disc(ctx, Math.cos(a) * d, Math.sin(a) * d, r * 0.045 * b, PALETTE.butterDeep);
        }
    }

    exit() {
        freeLayer(this.bg);
        this.bg = null;
    }
}

// The closed bud, centred on the origin with radius r, and a leaf lying along +x from the origin.
// Shared with tools/icons.mjs, so the home-screen icon is the same bud the playroom opens on.
export function drawBud(ctx, r, u) {
    ellipse(ctx, 3 * u, 7 * u, r * 0.5, r * 0.86, 0);
    ctx.fillStyle = 'rgba(112, 84, 58, 0.06)';
    ctx.fill();
    // Two outer petals wrapped around a central one.
    ellipse(ctx, -r * 0.24, r * 0.12, r * 0.42, r * 0.8, 0.32);
    ctx.fillStyle = PALETTE.roseDeep;
    ctx.fill();
    ellipse(ctx, r * 0.24, r * 0.12, r * 0.42, r * 0.8, -0.32);
    ctx.fill();
    ellipse(ctx, 0, -r * 0.05, r * 0.46, r * 0.92, 0);
    ctx.fillStyle = PALETTE.rose;
    ctx.fill();
    ellipse(ctx, -r * 0.14, -r * 0.42, r * 0.12, r * 0.3, 0.25);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
    // Sepals.
    ctx.fillStyle = PALETTE.sageDeep;
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(0, r * 0.82);
        ctx.quadraticCurveTo(side * r * 0.5, r * 0.75, side * r * 0.42, r * 0.35);
        ctx.quadraticCurveTo(side * r * 0.2, r * 0.7, 0, r * 0.82);
        ctx.fill();
    }
}

export function drawLeaf(ctx, length, colour, u) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(length * 0.5, -length * 0.38, length, 0);
    ctx.quadraticCurveTo(length * 0.5, length * 0.38, 0, 0);
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(length * 0.1, 0);
    ctx.lineTo(length * 0.8, 0);
    ctx.stroke();
}
