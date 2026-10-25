// The first screen: a closed bud on its stem. Touching it makes it bloom, and the playroom opens.
//
// It exists for a technical reason as much as a gentle one. iOS will not start audio until the
// page has been touched, so the very first touch must happen somewhere that does not depend on
// sound. Here it is the touch that wakes the sound up, and the bloom answers it.
//
// Once a grown-up's goodnight timer has run out, the bud is asleep: night has fallen on it, the
// moon and the stars are out, and it does not open. A tap only stirs it, in silence, and another
// z rises. It sleeps until a grown-up opens the playroom again from the corner (main.js).

import { Scene } from './stage.js';
import { PALETTE, makeLayer, freeLayer, grain, ellipse, disc } from './draw.js';
import { Spring, clamp, easeOutBack, TAU } from './util.js';
import { noteHz } from './synth.js';
import * as audio from './audio.js';

// C5, E5, G5, C6: the opening chord, spread out.
const BLOOM_NOTES = [5, 7, 8, 10];
// Asleep: how far the bud nods, and how long a z takes to rise and fade after a tap.
const NOD = 0.22;
const STIR = 1.6;

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
        this.asleep = this.timeUp();
        this.sky = null;
        // The z's rising after taps, by age in seconds.
        this.stirs = [];
    }

    timeUp() {
        return !!(this.app.timeUp && this.app.timeUp());
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
        // Asleep, the wall is the night, a little lighter than the band's, with moonlight about the
        // bud rather than sunlight. It is lighter still before the dark laid over everything in
        // drawNight, which ends it near the band's blue.
        const light = this.asleep ? '150, 166, 225' : '255, 246, 222';
        ctx.fillStyle = this.asleep ? '#303865' : PALETTE.wall;
        ctx.fillRect(0, 0, w, h);
        const glow = ctx.createRadialGradient(this.cx, this.cy, 0, this.cx, this.cy, Math.max(w, h) * 0.55);
        glow.addColorStop(0, `rgba(${light}, ${this.asleep ? 0.3 : 0.95})`);
        glow.addColorStop(1, `rgba(${light}, 0)`);
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

        freeLayer(this.sky);
        this.sky = this.asleep ? this.drawSky() : null;
    }

    // The night over the sleeping bud: the moon up to the left, away from the leaf to the grown-ups'
    // corner, with a glow about it, and stars, always in the same places.
    drawSky() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const mx = w * 0.2;
        const my = h * 0.18;
        const mr = 44 * u;
        // A crescent: a disc with a disc cut from it.
        disc(ctx, mx, my, mr, '#F7E7A6');
        ctx.globalCompositeOperation = 'destination-out';
        disc(ctx, mx + mr * 0.5, my - mr * 0.3, mr * 0.86, '#000');
        // The glow and the stars go behind the moon.
        ctx.globalCompositeOperation = 'destination-over';
        const glow = ctx.createRadialGradient(mx, my, 0, mx, my, mr * 4.5);
        glow.addColorStop(0, 'rgba(255, 244, 200, 0.2)');
        glow.addColorStop(1, 'rgba(255, 244, 200, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);
        // Spread evenly with no seed to keep: the R2 sequence. None by the moon, the bud or the leaf.
        for (let i = 0; i < 40; i++) {
            const x = ((0.5 + i * 0.7548777) % 1) * w;
            const y = ((0.5 + i * 0.5698403) % 1) * h * 0.66;
            const nearMoon = Math.hypot(x - mx, y - my) < mr * 2.2;
            const nearBud = Math.abs(x - this.cx) < this.r * 2.2 && y > this.cy - this.r * 2.4;
            const nearLeaf = x > w - 110 && y < 110;
            if (nearMoon || nearBud || nearLeaf) continue;
            disc(ctx, x, y, (1.4 + (i % 3) * 0.7) * u, `rgba(255, 246, 214, ${0.5 + (i % 4) * 0.14})`);
        }
        ctx.globalCompositeOperation = 'source-over';
        return layer;
    }

    update(dt) {
        this.time += dt;
        const moving = this.press.update(dt);
        // The bud follows the timer: asleep once the time is up, which can happen while it waits,
        // and awake once a grown-up opens the playroom again. The other bud fades in over this one.
        if (this.timeUp() !== this.asleep && !this.blooming && !this.left) {
            this.left = true;
            this.app.showBud({ kind: 'fade', duration: 1.2 });
        }
        if (this.asleep) {
            // Still, as a sleeper is, but for a stir: it draws only after a tap.
            this.stirs = this.stirs.map((age) => age + dt).filter((age) => age < STIR);
            return moving || this.stirs.length > 0;
        }
        if (this.blooming) {
            this.bloomTime += dt;
            this.bloom = clamp(this.bloomTime / 0.9, 0, 1);
            if (this.bloomTime > 1.25 && !this.left) {
                this.left = true;
                this.app.enterShelf(true);
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
        // Asleep, it only stirs. The time can also have run out a moment ago, before this bud has
        // given way to the sleeping one: it does not open then either.
        if (this.asleep || this.timeUp()) {
            if (this.asleep && this.stirs.length < 3) this.stirs.push(0);
            return;
        }
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

        // Asleep, the stem stands still and the bud nods.
        const sway = this.asleep ? 0 : Math.sin(this.time * 0.9) * 0.035 * (1 - this.bloom * 0.6);
        const top = { x: cx + Math.sin(sway) * (this.ground - this.cy), y: this.cy + this.r * 0.85 };

        // Invitation: a slow ring, only while waiting, and never while asleep.
        if (!this.blooming && !this.asleep) {
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
        ctx.rotate(sway * 1.4 + (this.asleep ? NOD : 0));
        ctx.scale(1 + this.press.value * 0.05, squash);
        ctx.translate(0, -this.r * 0.85);
        if (this.bloom < 1) this.drawBud(ctx, 1 - clamp(this.bloom * 1.6, 0, 1));
        if (this.bloom > 0) this.drawFlower(ctx, easeOutBack(this.bloom));
        ctx.restore();

        if (this.asleep) this.drawNight(ctx, top);
    }

    // Night over the sleeping bud: the dark laid over everything, the bud and its stem with the
    // rest, the sky over that, and the z's of its sleep, one more rising after each tap.
    drawNight(ctx, top) {
        const { u, r } = this;
        ctx.fillStyle = 'rgba(30, 38, 72, 0.45)';
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.drawImage(this.sky.canvas, 0, 0, this.w, this.h);
        const x = top.x + r * 0.95;
        const y = this.cy - r * 0.75;
        drawZ(ctx, x, y, 13 * u, 0.9, u);
        drawZ(ctx, x + 22 * u, y - 28 * u, 18 * u, 0.9, u);
        for (const age of this.stirs) {
            const k = age / STIR;
            const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
            drawZ(ctx, x + (48 + 26 * k) * u, y - (62 + 84 * k) * u, (20 + 8 * k) * u, fade, u);
        }
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
        freeLayer(this.sky);
        this.bg = null;
        this.sky = null;
    }
}

// A sleeper's z, centred on (x, y), z across.
function drawZ(ctx, x, y, z, alpha, u) {
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.strokeStyle = 'rgba(255, 246, 214, 0.95)';
    ctx.lineWidth = 3 * u;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - z / 2, y - z / 2);
    ctx.lineTo(x + z / 2, y - z / 2);
    ctx.lineTo(x - z / 2, y + z / 2);
    ctx.lineTo(x + z / 2, y + z / 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
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
