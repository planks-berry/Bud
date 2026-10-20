// Tone bars: a small marimba on a wooden frame.
//
// Every bar is a note of the pentatonic scale, so there is no wrong note and no wrong order. The
// bars are as long as their pitch makes them on a real instrument (length goes with the inverse
// square root of frequency), so the shape of the frame is the shape of the scale: a property of
// the material, not a rule anyone enforces.
//
// Layers, found by playing rather than unlocked:
//   touch  - tap a bar; drag across them for a glissando; several fingers make chords.
//   move   - two mallets lie below the frame; choosing one turns the bars from wood to metal.
//   make   - the shell keeps the last phrase you played and plays it back when touched.
//            At Bloom, a bar held still lifts off the frame and can be put back anywhere.

import { Scene } from '../stage.js';
import {
    PALETTE,
    RAINBOW,
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
import { Spring, clamp, shade, approach, hexToRgb, mixRgb, rgbString } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';

const COUNTS = [5, 8, 10];
const HOLD_TO_LIFT = 0.5;
const PHRASE_GAP = 2.5;
const MATERIALS = {
    wood: { recipe: 'marimba', base: 60, wet: 0.18 },
    metal: { recipe: 'glock', base: 72, wet: 0.3 },
};

function metalTone(hex) {
    return rgbString(mixRgb(hexToRgb(hex), [236, 238, 242], 0.55));
}

class BarsScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.count = COUNTS[this.level];
        this.material = 'wood';
        this.morph = new Spring(0, 160, 20);
        this.time = 0;
        this.bars = [];
        for (let i = 0; i < this.count; i++) {
            this.bars.push({
                degree: i,
                colour: RAINBOW[i],
                metal: metalTone(RAINBOW[i]),
                x: 0,
                press: new Spring(0, 900, 20),
                lift: new Spring(0, 320, 22),
                glow: 0,
            });
        }
        this.order = this.bars.slice();
        this.holds = new Set();
        this.echo = { notes: [], last: -10, playing: false, t: 0, index: 0, pulse: new Spring(0, 240, 12) };
        this.mallets = [
            { material: 'wood', lift: new Spring(1, 300, 20) },
            { material: 'metal', lift: new Spring(0, 300, 20) },
        ];
        this.bg = null;
    }

    layout() {
        freeLayer(this.bg);
        const { w, h, u } = this;
        this.table = h * 0.74;
        // Clear of the home button in the top-left corner.
        const top = Math.max(h * 0.1, 96 * u);
        const bottom = this.table - 22 * u;
        this.cy = (top + bottom) / 2;
        const longest = bottom - top;

        let gap = Math.min(w * 0.86, 940 * u) * 0.02;
        let barW = (Math.min(w * 0.86, 940 * u) - gap * (this.count - 1)) / this.count;
        barW = Math.min(barW, 104 * u);
        gap = Math.min(gap, barW * 0.3);
        this.barW = barW;
        this.gap = gap;
        this.frameW = barW * this.count + gap * (this.count - 1);
        this.x0 = (w - this.frameW) / 2;

        const lowest = noteHz(0, 60);
        for (const bar of this.bars) bar.len = longest * Math.sqrt(lowest / noteHz(bar.degree, 60));
        this.order.forEach((bar, slot) => {
            bar.x = this.slotX(slot);
        });

        const malletY = this.table + (h - this.table) * 0.48;
        this.mallets[0].x = w * 0.2;
        this.mallets[1].x = w * 0.36;
        for (const m of this.mallets) m.y = malletY;
        this.shell = { x: w * 0.8, y: malletY, r: 46 * u };

        this.drawBackground();
    }

    slotX(slot) {
        return this.x0 + slot * (this.barW + this.gap);
    }

    drawBackground() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        ctx.fillStyle = shade(PALETTE.lavender, 0.72);
        ctx.fillRect(0, 0, w, h);
        woodPanel(ctx, -20, this.table, w + 40, h - this.table + 20, 0, PALETTE.wood, 21, this.scale);
        ctx.fillStyle = SHADOW_SOFT;
        ctx.fillRect(0, this.table, w, 6 * u);

        // The frame: two rails that converge as the bars shorten, resting on end blocks.
        const first = this.bars[0];
        const last = this.bars[this.bars.length - 1];
        const left = this.x0 - 26 * u;
        const right = this.x0 + this.frameW + 26 * u;
        for (const side of [-1, 1]) {
            const yl = this.cy + side * (first.len / 2 - first.len * 0.224);
            const yr = this.cy + side * (last.len / 2 - last.len * 0.224);
            ctx.lineCap = 'round';
            ctx.strokeStyle = SHADOW;
            ctx.lineWidth = 20 * u;
            ctx.beginPath();
            ctx.moveTo(left, yl + 8 * u);
            ctx.lineTo(right, yr + 8 * u);
            ctx.stroke();
            ctx.strokeStyle = PALETTE.woodDark;
            ctx.lineWidth = 18 * u;
            ctx.beginPath();
            ctx.moveTo(left, yl);
            ctx.lineTo(right, yr);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 4 * u;
            ctx.beginPath();
            ctx.moveTo(left, yl - 4 * u);
            ctx.lineTo(right, yr - 4 * u);
            ctx.stroke();
        }
        grain(ctx, 0, 0, w, this.table, 0.25, this.scale);
        this.bg = layer;
    }

    //--------------------------------------------------------------------------

    barRect(bar) {
        const lift = bar.lift.value;
        const len = bar.len * (1 - bar.press.value * 0.025);
        return { x: bar.x, y: this.cy - len / 2 - lift * 18 * this.u, w: this.barW, h: len };
    }

    barAt(x, y) {
        const half = this.gap / 2;
        for (const bar of this.order) {
            const r = this.barRect(bar);
            if (
                x >= r.x - half &&
                x < r.x + r.w + half &&
                y >= r.y - 14 * this.u &&
                y <= r.y + r.h + 14 * this.u
            )
                return bar;
        }
        return null;
    }

    strike(bar, record = true) {
        const spec = MATERIALS[this.material];
        bar.press.value = 1;
        bar.press.velocity = 0;
        bar.glow = 1;
        const pan = ((bar.x + this.barW / 2) / this.w) * 2 - 1;
        audio.note(spec.recipe, bar.degree, spec.base, { gain: 1, pan, wet: spec.wet });
        if (!record) return;
        if (this.time - this.echo.last > PHRASE_GAP && !this.echo.playing) this.echo.notes = [];
        if (this.echo.notes.length >= 24) this.echo.notes.shift();
        this.echo.notes.push({ bar, t: this.time });
        this.echo.last = this.time;
    }

    choose(material) {
        if (this.material === material) return;
        this.material = material;
        this.morph.target = material === 'metal' ? 1 : 0;
        for (const m of this.mallets) m.lift.target = m.material === material ? 1 : 0;
        audio.play(
            material === 'metal' ? 'tink' : 'wood',
            { f: material === 'metal' ? 2093 : 523 },
            { gain: 0.6 }
        );
        // A rolled chord, so the new sound is heard at once.
        const spec = MATERIALS[material];
        [0, 2, 4].forEach((degree, i) => {
            if (degree < this.count)
                audio.note(spec.recipe, degree, spec.base, { gain: 0.55, delay: i * 0.07, wet: spec.wet });
        });
    }

    playEcho() {
        const echo = this.echo;
        echo.pulse.value = 1;
        if (!echo.notes.length) {
            audio.play('pop', { f: 500 }, { gain: 0.6 });
            return;
        }
        echo.playing = true;
        echo.t = 0;
        echo.index = 0;
    }

    //--------------------------------------------------------------------------

    down(p) {
        const bar = this.barAt(p.x, p.y);
        if (bar) {
            p.owner = { bar, last: bar, held: 0, lifted: false, dx: p.x - bar.x };
            this.holds.add(p);
            this.strike(bar);
            return;
        }
        for (const m of this.mallets) {
            if (Math.abs(p.x - m.x) < 70 * this.u && Math.abs(p.y - m.y) < 50 * this.u) {
                this.choose(m.material);
                return;
            }
        }
        const s = this.shell;
        if ((p.x - s.x) * (p.x - s.x) + (p.y - s.y) * (p.y - s.y) < s.r * 1.4 * (s.r * 1.4)) {
            this.playEcho();
            return;
        }
        // Starting off the bars still allows a sweep across them.
        p.owner = { bar: null, last: null, held: 0, lifted: false };
    }

    move(p) {
        const o = p.owner;
        if (!o) return;
        if (o.lifted) {
            o.bar.x = clamp(p.x - o.dx, this.x0 - this.barW * 0.5, this.x0 + this.frameW - this.barW * 0.5);
            const slot = clamp(Math.round((o.bar.x - this.x0) / (this.barW + this.gap)), 0, this.count - 1);
            const from = this.order.indexOf(o.bar);
            if (slot !== from) {
                this.order.splice(from, 1);
                this.order.splice(slot, 0, o.bar);
                audio.play('wood', { f: 784 }, { gain: 0.27 });
            }
            return;
        }
        if (p.travel > 12 * this.u) o.held = -1;
        const bar = this.barAt(p.x, p.y);
        if (bar && bar !== o.last) this.strike(bar);
        o.last = bar;
    }

    up(p) {
        const o = p.owner;
        this.holds.delete(p);
        if (!o || !o.lifted) return;
        o.bar.lift.target = 0;
        o.lifted = false;
        audio.play('wood', { f: noteHz(o.bar.degree, 60) * 2 }, { gain: 0.6 });
    }

    update(dt) {
        this.time += dt;
        let busy = this.morph.update(dt);

        // At Bloom, a finger resting on a bar lifts it off the frame.
        if (this.level >= 2) {
            for (const p of this.holds) {
                const o = p.owner;
                if (!o || !o.bar || o.lifted || o.held < 0) continue;
                o.held += dt;
                if (o.held > HOLD_TO_LIFT) {
                    o.lifted = true;
                    o.bar.lift.target = 1;
                    o.dx = p.x - o.bar.x;
                    audio.play('wood', { f: 1175 }, { gain: 0.45 });
                }
            }
        }

        for (let slot = 0; slot < this.order.length; slot++) {
            const bar = this.order[slot];
            const lifted = bar.lift.target > 0;
            if (!lifted) {
                const target = this.slotX(slot);
                bar.x = approach(bar.x, target, 14, dt);
                if (Math.abs(bar.x - target) > 0.2) busy = true;
            }
            if (bar.press.update(dt)) busy = true;
            if (bar.lift.update(dt)) busy = true;
            if (bar.glow > 0.003) {
                bar.glow *= Math.exp(-dt * 3.2);
                busy = true;
            }
        }

        const echo = this.echo;
        if (echo.playing) {
            busy = true;
            echo.t += dt;
            const start = echo.notes[0].t;
            while (echo.index < echo.notes.length && echo.notes[echo.index].t - start <= echo.t) {
                this.strike(echo.notes[echo.index].bar, false);
                echo.index++;
            }
            if (echo.index >= echo.notes.length) echo.playing = false;
        }
        if (echo.pulse.update(dt)) busy = true;
        for (const m of this.mallets) if (m.lift.update(dt)) busy = true;
        // While a phrase is waiting in the shell, it breathes.
        if (echo.notes.length) busy = true;
        return busy || this.holds.size > 0;
    }

    //--------------------------------------------------------------------------

    draw(ctx) {
        const u = this.u;
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);
        const metal = this.morph.value;

        // Lifted bars draw last, above the others.
        const order = this.order.slice().sort((a, b) => a.lift.value - b.lift.value);
        for (const bar of order) {
            const r = this.barRect(bar);
            const radius = this.barW * 0.24;
            const lift = bar.lift.value;
            fillRound(ctx, r.x + 3 * u, r.y + (7 + lift * 16) * u, r.w, r.h, radius, SHADOW);
            fillRound(ctx, r.x, r.y, r.w, r.h, radius, bar.colour);
            if (metal > 0.01) {
                ctx.globalAlpha = metal;
                fillRound(ctx, r.x, r.y, r.w, r.h, radius, bar.metal);
                ctx.globalAlpha = 1;
            }
            fillRound(
                ctx,
                r.x + r.w * 0.14,
                r.y + radius * 0.7,
                r.w * 0.16,
                r.h - radius * 1.4,
                r.w * 0.08,
                `rgba(255,255,255,${0.25 + metal * 0.35})`
            );
            const nail = Math.max(3, 4 * u);
            const nailColour = shade(PALETTE.ink, 0.25 + metal * 0.2);
            disc(ctx, r.x + r.w / 2, r.y + r.h * 0.224, nail, nailColour);
            disc(ctx, r.x + r.w / 2, r.y + r.h * 0.776, nail, nailColour);
            if (bar.glow > 0.01) {
                const grow = (1 - bar.glow) * 10 * u;
                ctx.strokeStyle = `rgba(255,255,255,${bar.glow * 0.8})`;
                ctx.lineWidth = 4 * u;
                roundRect(ctx, r.x - grow, r.y - grow, r.w + grow * 2, r.h + grow * 2, radius + grow);
                ctx.stroke();
            }
        }

        for (const m of this.mallets) this.drawMallet(ctx, m);
        this.drawShell(ctx);
    }

    drawMallet(ctx, m) {
        const u = this.u;
        const lift = m.lift.value;
        // The shadow is the same shape drawn first, offset straight down in screen space: offsetting
        // inside the rotation would slide it along the handle and read as a second stick.
        this.malletShape(ctx, m.x + 2 * u, m.y + (5 + lift * 6) * u, SHADOW, SHADOW);
        this.malletShape(
            ctx,
            m.x,
            m.y - lift * 8 * u,
            PALETTE.woodDark,
            m.material === 'wood' ? PALETTE.peach : '#D9DDE3',
            true
        );
    }

    malletShape(ctx, x, y, handle, head, shine = false) {
        const u = this.u;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-0.5);
        fillRound(ctx, -70 * u, -5 * u, 110 * u, 10 * u, 5 * u, handle);
        disc(ctx, 52 * u, 0, 22 * u, head);
        if (shine) {
            ellipse(ctx, 46 * u, -7 * u, 8 * u, 5 * u, -0.4);
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fill();
        }
        ctx.restore();
    }

    // A scallop shell: a fan of ribs. It breathes while it holds a phrase, and brightens while it
    // plays one back.
    drawShell(ctx) {
        const u = this.u;
        const s = this.shell;
        const holding = this.echo.notes.length > 0;
        const breathe = holding ? 1 + Math.sin(this.time * 2.4) * 0.03 : 1;
        const pop = 1 + this.echo.pulse.value * 0.12;
        const r = s.r * breathe * pop;
        ctx.save();
        ctx.translate(s.x, s.y);
        ellipse(ctx, 4 * u, r * 0.55 + 6 * u, r * 0.95, r * 0.25);
        ctx.fillStyle = SHADOW;
        ctx.fill();
        const ribs = 7;
        for (let i = 0; i < ribs; i++) {
            const a0 = Math.PI + (i / ribs) * Math.PI;
            const a1 = Math.PI + ((i + 1) / ribs) * Math.PI;
            ctx.beginPath();
            ctx.moveTo(0, r * 0.45);
            ctx.arc(0, r * 0.45, r, a0, a1);
            ctx.closePath();
            ctx.fillStyle = i % 2 ? PALETTE.peach : '#F7D6BC';
            ctx.fill();
        }
        fillRound(ctx, -r * 0.22, r * 0.38, r * 0.44, r * 0.2, r * 0.08, PALETTE.peachDeep);
        if (this.echo.playing) {
            ctx.strokeStyle = 'rgba(255,255,255,0.75)';
            ctx.lineWidth = 3 * u;
            ctx.beginPath();
            ctx.arc(0, r * 0.45, r * 1.12, Math.PI, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    exit() {
        freeLayer(this.bg);
        this.bg = null;
    }
}

function icon(ctx, x, y, w, h, u) {
    const n = 5;
    const barW = w * 0.12;
    const gap = w * 0.035;
    const total = n * barW + (n - 1) * gap;
    const x0 = x + (w - total) / 2;
    const cy = y + h * 0.5;
    ctx.strokeStyle = PALETTE.woodDark;
    ctx.lineWidth = 6 * u;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x0 - 8 * u, cy + side * h * 0.22);
        ctx.lineTo(x0 + total + 8 * u, cy + side * h * 0.14);
        ctx.stroke();
    }
    for (let i = 0; i < n; i++) {
        const len = h * 0.72 * Math.sqrt(1 / (1 + i * 0.28));
        const bx = x0 + i * (barW + gap);
        fillRound(ctx, bx + 2 * u, cy - len / 2 + 4 * u, barW, len, barW * 0.25, SHADOW);
        fillRound(ctx, bx, cy - len / 2, barW, len, barW * 0.25, RAINBOW[i]);
    }
}

export const toy = {
    id: 'bars',
    title: 'Tone bars',
    about: 'A pentatonic marimba: no wrong notes. The shell plays back the last tune.',
    stages: ['5 bars', '8 bars', '10 bars, which lift and move'],
    mat: shade(PALETTE.lavender, 0.35),
    icon,
    create: (app) => new BarsScene(app),
    sounds(level) {
        const list = [];
        for (let i = 0; i < COUNTS[level]; i++) {
            list.push(['marimba', { f: noteHz(i, 60) }]);
            list.push(['glock', { f: noteHz(i, 72) }]);
        }
        return list;
    },
    signature() {
        audio.note('marimba', 5, 60, { gain: 0.5, delay: 0.05 });
    },
};
