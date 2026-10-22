// The turntable: a record player to scratch, after a DJ's deck.
//
// A record turns on the platter, playing its loop, and a finger on it takes hold of it the way a
// DJ's hand does: the record goes where the finger takes it, forwards or backwards, fast or slow,
// and the music goes with it, so rubbing it to and fro is a scratch. Let go, and it spins back up
// to speed; flicked, it races and settles. The button winds the turntable down to a stop, the music
// sliding down with it, and up again. At Sprout a crate holds three records to swap, and two pads
// add a horn and a boom; at Bloom a slider sets the turntable's speed, and the pitch with it.
//
// The records are pressed from the playroom's own sounds (records.js) and play through a deck
// (audio.js) that can run a loop backwards. The record's turn and the music's place in its loop are
// one: wherever the record is turned to is where the music is, so a scratch can be found again.
//
//   touch  - tap the button: the record winds down, or spins up. Tap a pad for its sound.
//   move   - hold the record and move it, to and fro: a scratch. At Bloom, slide the speed.
//   make   - a scratch over a loop; a record chosen from the crate; a horn in the right place.

import { Scene } from '../stage.js';
import { PALETTE, makeLayer, freeLayer, grain, fillRound, disc, ellipse, woodPanel } from '../draw.js';
import {
    Spring,
    clamp,
    lerp,
    dist,
    shade,
    hexToRgb,
    mixRgb,
    rgbString,
    easeInOutCubic,
    TAU,
} from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { recordsFor, press, STEP, LENGTH } from './records.js';
import { COLOURS, BEATS } from './cubes.js';

// The platter at full speed: 33 1/3 turns a minute, in radians a second.
const SPIN = (TAU * 100) / 3 / 60;
// How quickly the record comes up to speed, settles from a flick, and winds down, in seconds.
const SPIN_UP = 0.18;
const SETTLE = 0.35;
const WIND_DOWN = 0.75;
// Untouched this long, in seconds, the turntable winds down and rests.
const IDLE = 180;
// The speed slider's range, at Bloom.
const SLOWEST = 0.6;
const FASTEST = 1.5;
// How long a record takes to go back to the crate, and the next to come onto the platter.
const SWAP = 0.36;

// The pads: a horn on yellow, which toots yellow's note, as a yellow cube does in the colour beats,
// and a boom on the plain wood of their drum.
const YELLOW = COLOURS.find((kind) => kind.name === 'yellow');
const PADS = [
    { name: 'horn', colour: YELLOW.colour, f: noteHz(YELLOW.degree, 60) },
    { name: 'boom', colour: BEATS.find((beat) => beat.name === 'drum').colour },
];

const mod = (a, n) => ((a % n) + n) % n;

class TurntableScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.records = recordsFor(this.level);
        this.current = 0;
        this.pressed = {};
        this.deck = new audio.Deck();
        this.time = 0;
        this.touched = 0;
        // The record: whether the motor runs, how fast the record goes now (1 is playing at speed,
        // below 0 backwards), what the speed slider asks for, and how far it has turned.
        this.motor = true;
        this.rate = 0;
        this.speed = 1;
        this.angle = 0;
        // A finger holding the record, and a record on its way to or from the crate.
        this.hand = null;
        this.swap = null;
        this.arm = new Spring(0, 140, 18);
        this.button = new Spring(0, 420, 18);
        this.knob = new Spring(0, 420, 18);
        this.beat = { at: -1, glow: 0 };
        this.pads = (this.level >= 1 ? PADS : []).map((pad) =>
            Object.assign({ x: 0, y: 0, r: 0, press: new Spring(0, 520, 16), glow: 0 }, pad)
        );
        this.bg = null;
        this.sprites = {};
        this.load(0);
    }

    // Put a record on: pressed the first time it is played, and played from its start.
    load(index) {
        this.current = index;
        const record = this.records[index];
        if (!this.pressed[record.name]) this.pressed[record.name] = press(record, audio.RATE, audio.samples);
        this.deck.load(this.pressed[record.name]);
        this.angle = 0;
    }

    layout() {
        const { w, h, u } = this;
        const crate = this.records.length > 1;
        const extra = this.pads.length ? 0.95 : 0;
        const portrait = h > w;
        // The platter's radius, R: the turntable is 2.4 R wide (and a strip for the pads beside it)
        // and 2.24 R tall; the crate stands beside it, or below it on a tall screen.
        const top = 92 * u;
        const bottom = h - 30 * u;
        let R;
        if (portrait) {
            const height = 2.24 + (crate ? 1.0 : 0);
            R = Math.min((w * 0.94) / (2.4 + extra), (bottom - top) / height, 250 * u);
        } else {
            const width = 2.4 + extra + (crate ? 0.98 : 0);
            R = Math.min((w * 0.94) / width, (bottom - top) / 2.3, 250 * u);
        }
        this.R = R;
        const plinthW = (2.4 + extra) * R;
        const plinthH = 2.24 * R;
        const totalW = portrait || !crate ? plinthW : plinthW + 0.98 * R;
        const totalH = portrait && crate ? plinthH + 1.0 * R : plinthH;
        const left = (w - totalW) / 2;
        const upper = top + Math.max(0, (bottom - top - totalH) / 2);
        this.plinth = { x: left, y: upper, w: plinthW, h: plinthH };
        this.cx = left + 1.2 * R;
        this.cy = upper + 1.12 * R;
        this.recordR = 0.94 * R;
        this.labelR = 0.33 * R;
        this.pivot = { x: this.cx + 1.0 * R, y: this.cy - 0.82 * R };
        this.buttonAt = { x: this.cx - 0.92 * R, y: this.cy + 0.86 * R, r: 0.16 * R };
        this.pads.forEach((pad, i) => {
            pad.x = this.cx + 1.6 * R;
            pad.y = this.cy - 0.3 * R + i * 0.64 * R;
            pad.r = 0.25 * R;
        });
        this.fader =
            this.level >= 2
                ? { x: this.cx + 1.98 * R, y0: this.cy - 0.78 * R, y1: this.cy + 0.78 * R, w: 0.13 * R }
                : null;
        // The crate's sleeves, beside the turntable or under it.
        const S = 0.68 * R;
        this.sleeves = this.records.map((record, i) =>
            portrait
                ? { x: (w - (3 * S + 0.3 * R)) / 2 + i * (S + 0.15 * R), y: upper + plinthH + 0.2 * R, s: S }
                : { x: left + plinthW + 0.24 * R, y: upper + i * (S + 0.1 * R), s: S }
        );
        freeLayer(this.bg);
        this.freeSprites();
        this.drawBackground();
    }

    //--------------------------------------------------------------------------
    // The record

    setMotor(on) {
        this.motor = on;
        audio.play('click', { variant: on ? 'on' : 'off' }, { gain: 0.6, pan: this.pan(this.buttonAt.x) });
    }

    // Swap the record on the platter for one from the crate: the arm lifts, the record goes home, the
    // other comes over, the arm comes down, and it plays from the start.
    choose(index) {
        if (this.swap || index === this.current) return;
        this.swap = { t: 0, from: this.current, to: index, loaded: false };
        this.arm.target = 1;
        this.hand = null;
        audio.play('whoosh', { variant: 'up' }, { gain: 0.5, pan: this.pan(this.sleeves[index].x) });
    }

    pan(x) {
        return clamp((x / this.w) * 2 - 1, -1, 1) * 0.6;
    }

    // Where the music is in the loop, from how far the record has turned.
    place() {
        return mod(this.angle / SPIN, LENGTH);
    }

    update(dt) {
        this.time += dt;
        if (this.motor && this.time - this.touched > IDLE) this.setMotor(false);

        // In the hand, the record goes where the finger takes it, a moment behind, which smooths a
        // touch's steps, and its speed is how fast that is. Let go, it comes to the motor's speed:
        // quickly up, a flick settling, slowly down.
        if (this.hand) {
            const before = this.angle;
            this.angle += (this.hand.angle - this.angle) * (1 - Math.exp(-dt / 0.03));
            this.rate = (this.angle - before) / Math.max(dt, 1e-3) / SPIN;
        } else {
            const target = this.swap ? 0 : this.motor ? this.speed : 0;
            const faster =
                Math.abs(target) > Math.abs(this.rate) && Math.sign(target) !== -Math.sign(this.rate);
            const tau = this.swap ? 0.08 : faster ? SPIN_UP : this.motor ? SETTLE : WIND_DOWN;
            this.rate += (target - this.rate) * (1 - Math.exp(-dt / tau));
            if (Math.abs(this.rate - target) < 0.002) this.rate = target;
            this.angle += this.rate * SPIN * dt;
        }
        // The music is wherever the record is turned to. While it plays, the deck keeps time by the
        // audio clock, which a slow frame does not stop, and the record follows it, gently, so the
        // beat lights stay on the beat.
        this.deck.set(this.rate, this.swap ? 0 : 1, this.place());
        const heard = this.deck.place();
        if (heard !== null && !this.hand && !this.swap) {
            const behind = mod(heard - this.place() + LENGTH / 2, LENGTH) - LENGTH / 2;
            const k = Math.abs(behind) > 0.3 ? 1 : 1 - Math.exp(-dt / 0.4);
            this.angle += behind * k * SPIN;
        }

        // A light round the platter for each beat of the loop, lit as the needle passes it, which
        // way ever the record is going.
        const beat = Math.floor(this.place() / (STEP * 2));
        if (beat !== this.beat.at) {
            this.beat.at = beat;
            this.beat.glow = 1;
        }
        this.beat.glow = Math.max(0, this.beat.glow - dt / 0.4);

        if (this.swap) {
            const sw = this.swap;
            sw.t += dt;
            if (!sw.loaded && sw.t >= SWAP) {
                sw.loaded = true;
                this.load(sw.to);
                audio.play('whoosh', { variant: 'down' }, { gain: 0.45, pan: this.pan(this.cx) });
            }
            if (sw.t >= SWAP * 2) {
                this.swap = null;
                this.arm.target = 0;
                this.motor = true;
                audio.play('tick', { f: noteHz(0, 72) }, { gain: 0.4, pan: this.pan(this.pivot.x) });
            }
        }

        let busy = this.motor || Math.abs(this.rate) > 0 || !!this.hand || !!this.swap || this.beat.glow > 0;
        for (const spring of [this.arm, this.button, this.knob]) if (spring.update(dt)) busy = true;
        for (const pad of this.pads) {
            if (pad.press.update(dt)) busy = true;
            if (pad.glow > 0) {
                pad.glow = Math.max(0, pad.glow - dt / 0.5);
                busy = true;
            }
        }
        return busy;
    }

    //--------------------------------------------------------------------------
    // Touch

    down(p) {
        const R = this.R;
        this.touched = this.time;
        const b = this.buttonAt;
        if (dist(p.x, p.y, b.x, b.y) < b.r + 14 * this.u) {
            p.owner = { type: 'button' };
            this.button.kick(-8);
            return;
        }
        for (const pad of this.pads) {
            if (dist(p.x, p.y, pad.x, pad.y) < pad.r + 8 * this.u) {
                p.owner = { type: 'pad' };
                this.hit(pad);
                return;
            }
        }
        const f = this.fader;
        if (f && Math.abs(p.x - f.x) < f.w * 2.2 && p.y > f.y0 - 0.15 * R && p.y < f.y1 + 0.15 * R) {
            p.owner = { type: 'fader' };
            this.knob.kick(-6);
            this.slide(p.y);
            return;
        }
        const sleeve = this.sleeves.findIndex(
            (s) => p.x > s.x && p.x < s.x + s.s && p.y > s.y - s.s * 0.2 && p.y < s.y + s.s
        );
        if (this.records.length > 1 && sleeve >= 0) {
            this.choose(sleeve);
            return;
        }
        const r = dist(p.x, p.y, this.cx, this.cy);
        if (r < this.recordR + 6 * this.u && !this.hand && !this.swap) {
            // A spinning record caught slides on a little under the finger.
            this.hand = { pointer: p, x: p.x, y: p.y, angle: this.angle + this.rate * SPIN * 0.03 };
            p.owner = { type: 'record' };
        }
    }

    move(p) {
        const o = p.owner;
        if (!o) return;
        if (o.type === 'fader') {
            this.slide(p.y);
            return;
        }
        if (o.type !== 'record' || !this.hand || this.hand.pointer !== p) return;
        // The record turns by the finger's movement across it, about the spindle. Near the middle a
        // small movement would be a wild turn, so the turn is measured as if no nearer than a third
        // of the way out.
        const h = this.hand;
        const ax = h.x - this.cx;
        const ay = h.y - this.cy;
        const r = Math.max(Math.sqrt(ax * ax + ay * ay), this.R * 0.45);
        const across = (ax * (p.y - h.y) - ay * (p.x - h.x)) / Math.max(1, Math.sqrt(ax * ax + ay * ay));
        h.angle += across / r;
        h.x = p.x;
        h.y = p.y;
    }

    up(p) {
        const o = p.owner;
        if (!o) return;
        if (o.type === 'record' && this.hand && this.hand.pointer === p) {
            // Let go: it keeps the speed it had in the hand, and settles from there.
            this.hand = null;
        } else if (o.type === 'button') {
            const b = this.buttonAt;
            if (dist(p.x, p.y, b.x, b.y) < b.r + 24 * this.u) {
                this.button.kick(8);
                this.setMotor(!this.motor);
            }
        } else if (o.type === 'fader') {
            this.knob.kick(4);
        }
    }

    cancel(p) {
        if (this.hand && this.hand.pointer === p) this.hand = null;
    }

    // The speed slider: up is faster and higher, down slower and lower, and near the middle it
    // settles on the record's own speed.
    slide(y) {
        const f = this.fader;
        const k = clamp((f.y1 - y) / (f.y1 - f.y0), 0, 1);
        const speed = k < 0.5 ? lerp(SLOWEST, 1, k * 2) : lerp(1, FASTEST, (k - 0.5) * 2);
        this.speed = Math.abs(speed - 1) < 0.06 ? 1 : speed;
    }

    hit(pad) {
        pad.press.kick(-9);
        pad.glow = 1;
        const pan = this.pan(pad.x);
        if (pad.name === 'horn') {
            audio.play('toot', { f: pad.f }, { gain: 0.9, pan });
            audio.play('toot', { f: pad.f }, { gain: 0.8, pan, delay: 0.17 });
        } else {
            audio.play('drum', {}, { gain: 1, pan });
            audio.play('thud', { f: 85 }, { gain: 0.6, pan });
        }
    }

    //--------------------------------------------------------------------------
    // Drawing

    drawBackground() {
        const { w, h, u, R } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const desk = Math.min(h - 40 * u, this.plinth.y + this.plinth.h * 0.55);
        const wall = ctx.createLinearGradient(0, 0, 0, desk);
        wall.addColorStop(0, '#F3EEF6');
        wall.addColorStop(1, '#E9E2EF');
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, h);
        woodPanel(ctx, -10, desk, w + 20, h - desk + 20, 0, PALETTE.wood, 27, this.scale);

        // The turntable's body: a soft shadow, the plinth, and the well the platter sits in.
        const pl = this.plinth;
        fillRound(ctx, pl.x + 6 * u, pl.y + 10 * u, pl.w, pl.h, R * 0.12, 'rgba(92, 70, 58, 0.16)');
        fillRound(ctx, pl.x, pl.y, pl.w, pl.h, R * 0.12, '#F6EFE6');
        fillRound(ctx, pl.x, pl.y + pl.h - R * 0.06, pl.w, R * 0.06, R * 0.03, 'rgba(160, 130, 100, 0.18)');
        disc(ctx, this.cx, this.cy, R * 1.02, '#E4DACD');
        disc(ctx, this.cx, this.cy + R * 0.02, R * 1.0, 'rgba(92, 70, 58, 0.18)');
        // The platter, and its spindle, which shows while a record changes.
        disc(ctx, this.cx, this.cy, R, '#8F8780');
        disc(ctx, this.cx, this.cy, R * 0.975, '#5F5853');
        disc(ctx, this.cx, this.cy, R * 0.03, '#CFC9C2');
        if (this.pads.length) {
            // The pads' strip.
            const x = this.cx + 1.25 * R;
            fillRound(
                ctx,
                x,
                pl.y + R * 0.18,
                pl.x + pl.w - x - R * 0.12,
                pl.h - R * 0.36,
                R * 0.1,
                '#EFE5D8'
            );
        }
        if (this.fader) {
            const f = this.fader;
            fillRound(ctx, f.x - f.w / 2, f.y0, f.w, f.y1 - f.y0, f.w / 2, '#D9CCBC');
            fillRound(
                ctx,
                f.x - f.w * 0.18,
                f.y0 + f.w * 0.2,
                f.w * 0.36,
                f.y1 - f.y0 - f.w * 0.4,
                f.w * 0.18,
                '#7E7068'
            );
            for (let i = 0; i <= 8; i++) {
                const y = lerp(f.y0 + f.w * 0.3, f.y1 - f.w * 0.3, i / 8);
                const long = i === 4;
                ctx.fillStyle = long ? 'rgba(126, 112, 104, 0.8)' : 'rgba(126, 112, 104, 0.4)';
                ctx.fillRect(f.x - f.w * (long ? 1.25 : 0.95), y - 1, f.w * (long ? 0.55 : 0.35), 2);
            }
        }
        // The crate: a wooden stand the sleeves lean in.
        if (this.records.length > 1) {
            const first = this.sleeves[0];
            const last = this.sleeves[this.sleeves.length - 1];
            const x0 = first.x - 0.08 * R;
            const y0 = first.y + first.s * 0.55;
            const x1 = last.x + last.s + 0.08 * R;
            const y1 = last.y + last.s + 0.08 * R;
            fillRound(ctx, x0 + 5 * u, y0 + 8 * u, x1 - x0, y1 - y0, R * 0.08, 'rgba(92, 70, 58, 0.14)');
            woodPanel(ctx, x0, y0, x1 - x0, y1 - y0, R * 0.08, PALETTE.woodDark, 9, this.scale);
        }
        grain(ctx, 0, 0, w, h, 0.25, this.scale);
        this.bg = layer;
    }

    // A record's pictures, made once a layout: the coloured vinyl with its grooves, which looks the
    // same however far it has turned, and the label, which shows the turning. Only the label is
    // drawn turned, which is a small picture to turn every frame instead of a large one.
    sprite(record) {
        let pair = this.sprites[record.name];
        if (pair) return pair;
        const r = this.recordR;
        const vinyl = makeLayer(r * 2, r * 2, this.scale);
        let ctx = vinyl.ctx;
        ctx.translate(r, r);
        const colour = hexToRgb(record.colour);
        disc(ctx, 0, 0, r, rgbString(mixRgb(colour, [70, 56, 50], 0.25)));
        disc(ctx, 0, 0, r * 0.97, record.colour);
        ctx.lineWidth = Math.max(1, r * 0.006);
        for (let k = 0; k < 26; k++) {
            const rr = lerp(r * 0.42, r * 0.93, k / 25);
            ctx.beginPath();
            ctx.arc(0, 0, rr, 0, TAU);
            ctx.strokeStyle = rgbString(mixRgb(colour, [60, 48, 44], 0.25), k % 3 === 0 ? 0.35 : 0.18);
            ctx.stroke();
        }
        // A smooth band between two tracks, and the run-out by the label.
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.66, 0, TAU);
        ctx.lineWidth = r * 0.025;
        ctx.strokeStyle = rgbString(mixRgb(colour, [255, 255, 255], 0.25), 0.5);
        ctx.stroke();
        disc(ctx, 0, 0, this.labelR * 1.12, rgbString(mixRgb(colour, [60, 48, 44], 0.15)));
        const lr = this.labelR;
        const label = makeLayer(lr * 2, lr * 2, this.scale);
        ctx = label.ctx;
        ctx.translate(lr, lr);
        disc(ctx, 0, 0, lr, rgbString(mixRgb(colour, [255, 250, 240], 0.72)));
        this.drawLabel(ctx, record, lr);
        disc(ctx, 0, 0, lr * 0.1, '#5D5651');
        pair = { vinyl, label };
        this.sprites[record.name] = pair;
        return pair;
    }

    // A record with its middle at (x, y), `r` across the vinyl, the label turned by `angle`.
    drawDisc(ctx, record, x, y, r, angle) {
        const { vinyl, label } = this.sprite(record);
        ctx.drawImage(vinyl.canvas, x - r, y - r, r * 2, r * 2);
        const lr = (r * this.labelR) / this.recordR;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.drawImage(label.canvas, -lr, -lr, lr * 2, lr * 2);
        ctx.restore();
    }

    // What a label shows: a note for the tune, a drum for the beat, a cow for the animals. Drawn
    // off the middle, so the label's turning shows.
    drawLabel(ctx, record, r) {
        const ink = shade(record.colour, -0.35);
        ctx.save();
        ctx.translate(0, -r * 0.45);
        const s = r * 0.42;
        if (record.label === 'note') {
            ellipse(ctx, -s * 0.18, s * 0.35, s * 0.3, s * 0.22, -0.4);
            ctx.fillStyle = ink;
            ctx.fill();
            ctx.fillRect(s * 0.08, -s * 0.55, s * 0.09, s * 0.9);
            ctx.beginPath();
            ctx.moveTo(s * 0.17, -s * 0.55);
            ctx.quadraticCurveTo(s * 0.55, -s * 0.35, s * 0.42, -s * 0.05);
            ctx.lineWidth = s * 0.1;
            ctx.strokeStyle = ink;
            ctx.stroke();
        } else if (record.label === 'drum') {
            ellipse(ctx, 0, -s * 0.15, s * 0.55, s * 0.24, 0);
            ctx.fillStyle = 'rgba(255, 252, 245, 0.95)';
            ctx.fill();
            ctx.lineWidth = s * 0.08;
            ctx.strokeStyle = ink;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-s * 0.55, -s * 0.15);
            ctx.lineTo(-s * 0.55, s * 0.35);
            ctx.quadraticCurveTo(0, s * 0.62, s * 0.55, s * 0.35);
            ctx.lineTo(s * 0.55, -s * 0.15);
            ctx.stroke();
        } else {
            // A cow's face: white, with a patch, two ears and a pink muzzle.
            disc(ctx, 0, 0, s * 0.55, '#FBF8F2');
            ellipse(ctx, s * 0.22, -s * 0.18, s * 0.2, s * 0.16, 0.4);
            ctx.fillStyle = '#6E5B52';
            ctx.fill();
            ellipse(ctx, -s * 0.62, -s * 0.28, s * 0.2, s * 0.1, -0.4);
            ctx.fill();
            ellipse(ctx, s * 0.62, -s * 0.28, s * 0.2, s * 0.1, 0.4);
            ctx.fill();
            ellipse(ctx, 0, s * 0.28, s * 0.36, s * 0.22, 0);
            ctx.fillStyle = '#F2B6BE';
            ctx.fill();
            disc(ctx, -s * 0.12, s * 0.28, s * 0.05, '#C98A92');
            disc(ctx, s * 0.12, s * 0.28, s * 0.05, '#C98A92');
            disc(ctx, -s * 0.2, -s * 0.12, s * 0.06, '#4E4440');
            disc(ctx, s * 0.2, -s * 0.12, s * 0.06, '#4E4440');
        }
        ctx.restore();
    }

    draw(ctx) {
        const { R } = this;
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);

        // The beat lights round the platter: the one for the beat under the needle is lit.
        const lit = mod(this.beat.at, 8);
        for (let i = 0; i < 8; i++) {
            const a = -Math.PI / 2 + (i / 8) * TAU;
            const x = this.cx + Math.cos(a) * R * 1.09;
            const y = this.cy + Math.sin(a) * R * 1.09;
            const on = i === lit ? 0.35 + 0.65 * this.beat.glow : 0;
            disc(ctx, x, y, R * 0.035, '#D8CCBE');
            if (on > 0) {
                disc(ctx, x, y, R * 0.07, `rgba(255, 214, 120, ${0.35 * on})`);
                disc(ctx, x, y, R * 0.035, `rgba(255, 196, 92, ${on})`);
            }
        }

        // The platter's strobe dots, turning with it.
        for (let i = 0; i < 36; i++) {
            const a = this.angle + (i / 36) * TAU;
            disc(
                ctx,
                this.cx + Math.cos(a) * R * 0.988,
                this.cy + Math.sin(a) * R * 0.988,
                R * 0.008,
                '#D9D3CC'
            );
        }

        // The record: on the platter, or on its way to or from the crate.
        const sw = this.swap;
        if (sw) {
            const k = easeInOutCubic(clamp(sw.loaded ? 1 - (sw.t - SWAP) / SWAP : sw.t / SWAP, 0, 1));
            const index = sw.loaded ? sw.to : sw.from;
            const s = this.sleeves[index];
            const x = lerp(this.cx, s.x + s.s / 2, k);
            const y = lerp(this.cy, s.y + s.s * 0.2, k);
            this.drawRecord(
                ctx,
                this.records[index],
                x,
                y,
                lerp(1, (s.s * 0.45) / this.recordR, k),
                this.angle
            );
        } else {
            this.drawRecord(ctx, this.records[this.current], this.cx, this.cy, 1, this.angle);
        }

        this.drawArm(ctx);
        this.drawButton(ctx);
        for (const pad of this.pads) this.drawPad(ctx, pad);
        if (this.fader) this.drawKnob(ctx);
        if (this.records.length > 1) this.drawSleeves(ctx);
    }

    drawRecord(ctx, record, x, y, scale, angle) {
        const r = this.recordR * scale;
        this.drawDisc(ctx, record, x, y, r, angle);
        // The light catches it in the same place however it turns.
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, r * 0.95, -2.5, -1.95);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, r * 0.95, 0.64, 1.19);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fill();
        ctx.restore();
    }

    // The tonearm, from its pivot to the needle in the groove, or swung aside while a record changes.
    drawArm(ctx) {
        const R = this.R;
        const p = this.pivot;
        disc(ctx, p.x + R * 0.02, p.y + R * 0.04, R * 0.15, 'rgba(92, 70, 58, 0.16)');
        disc(ctx, p.x, p.y, R * 0.15, '#D8D2CB');
        disc(ctx, p.x, p.y, R * 0.09, '#B9B2AB');
        // On the record the arm points down to the right of the label; aside, to the rest.
        const on = Math.atan2(this.cy + 0.32 * R - p.y, this.cx + 0.52 * R - p.x);
        const a = on - this.arm.value * 0.55;
        const length = R * 1.18;
        const nx = p.x + Math.cos(a) * length;
        const ny = p.y + Math.sin(a) * length;
        ctx.save();
        ctx.lineCap = 'round';
        // The counterweight, behind the pivot.
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.cos(a) * R * 0.24, p.y - Math.sin(a) * R * 0.24);
        ctx.lineWidth = R * 0.1;
        ctx.strokeStyle = '#8F8780';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x + R * 0.01, p.y + R * 0.03);
        ctx.lineTo(nx + R * 0.01, ny + R * 0.03);
        ctx.lineWidth = R * 0.04;
        ctx.strokeStyle = 'rgba(92, 70, 58, 0.18)';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(nx, ny);
        ctx.lineWidth = R * 0.035;
        ctx.strokeStyle = '#CFC9C2';
        ctx.stroke();
        // The headshell.
        ctx.translate(nx, ny);
        ctx.rotate(a + 0.35);
        fillRound(ctx, -R * 0.05, -R * 0.07, R * 0.1, R * 0.16, R * 0.02, '#6E6661');
        ctx.restore();
    }

    drawButton(ctx) {
        const b = this.buttonAt;
        const press = this.button.value * 0.01;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(1 + press, 1 + press);
        disc(ctx, 2, 4, b.r, 'rgba(92, 70, 58, 0.16)');
        disc(ctx, 0, 0, b.r, '#DCD2C6');
        disc(ctx, 0, 0, b.r * 0.8, '#F4ECE2');
        // A light that shows the motor is on, and a play mark.
        const on = this.motor;
        disc(ctx, 0, 0, b.r * 0.42, on ? 'rgba(142, 191, 122, 0.95)' : 'rgba(190, 180, 170, 0.8)');
        ctx.beginPath();
        ctx.moveTo(-b.r * 0.12, -b.r * 0.2);
        ctx.lineTo(b.r * 0.2, 0);
        ctx.lineTo(-b.r * 0.12, b.r * 0.2);
        ctx.closePath();
        ctx.fillStyle = '#FBF8F2';
        ctx.fill();
        ctx.restore();
    }

    drawPad(ctx, pad) {
        const press = pad.press.value * 0.012;
        ctx.save();
        ctx.translate(pad.x, pad.y);
        ctx.scale(1 + press, 1 + press);
        if (pad.glow > 0)
            disc(
                ctx,
                0,
                0,
                pad.r * (1.15 + 0.15 * pad.glow),
                rgbString(hexToRgb(pad.colour), 0.35 * pad.glow)
            );
        disc(ctx, 2, 5, pad.r, 'rgba(92, 70, 58, 0.18)');
        disc(ctx, 0, 0, pad.r, shade(pad.colour, -0.12));
        disc(ctx, 0, -pad.r * 0.05, pad.r * 0.9, pad.colour);
        const ink = 'rgba(255, 252, 245, 0.95)';
        const s = pad.r * 0.5;
        if (pad.name === 'horn') {
            // A bulb horn: the rubber bulb, and the bell it honks through.
            disc(ctx, -s * 0.55, 0, s * 0.32, ink);
            ctx.beginPath();
            ctx.moveTo(-s * 0.3, -s * 0.1);
            ctx.lineTo(s * 0.35, -s * 0.22);
            ctx.quadraticCurveTo(s * 0.62, -s * 0.62, s * 0.82, -s * 0.66);
            ctx.lineTo(s * 0.82, s * 0.66);
            ctx.quadraticCurveTo(s * 0.62, s * 0.62, s * 0.35, s * 0.22);
            ctx.lineTo(-s * 0.3, s * 0.1);
            ctx.closePath();
            ctx.fillStyle = ink;
            ctx.fill();
            ellipse(ctx, s * 0.82, 0, s * 0.14, s * 0.62, 0);
            ctx.fillStyle = shade(pad.colour, -0.18);
            ctx.fill();
        } else {
            ellipse(ctx, 0, -s * 0.3, s * 0.7, s * 0.28, 0);
            ctx.fillStyle = ink;
            ctx.fill();
            ctx.fillRect(-s * 0.7, -s * 0.3, s * 1.4, s * 0.75);
            ellipse(ctx, 0, s * 0.45, s * 0.7, s * 0.28, 0);
            ctx.fill();
            ellipse(ctx, 0, -s * 0.3, s * 0.6, s * 0.2, 0);
            ctx.fillStyle = pad.colour;
            ctx.fill();
        }
        ctx.restore();
    }

    drawKnob(ctx) {
        const f = this.fader;
        const k =
            this.speed <= 1
                ? ((this.speed - SLOWEST) / (1 - SLOWEST)) * 0.5
                : 0.5 + ((this.speed - 1) / (FASTEST - 1)) * 0.5;
        const y = lerp(f.y1, f.y0, k);
        const press = this.knob.value * 0.01;
        ctx.save();
        ctx.translate(f.x, y);
        ctx.scale(1 + press, 1 + press);
        fillRound(
            ctx,
            -f.w * 1.1 + 2,
            -f.w * 0.6 + 4,
            f.w * 2.2,
            f.w * 1.2,
            f.w * 0.3,
            'rgba(92, 70, 58, 0.2)'
        );
        fillRound(ctx, -f.w * 1.1, -f.w * 0.6, f.w * 2.2, f.w * 1.2, f.w * 0.3, '#F7F1E8');
        ctx.fillStyle = '#7E7068';
        ctx.fillRect(-f.w * 0.9, -1.5, f.w * 1.8, 3);
        ctx.restore();
    }

    // The crate's sleeves: each record's own, with its record peeping out of the top, except the
    // one on the turntable.
    drawSleeves(ctx) {
        const sw = this.swap;
        this.sleeves.forEach((s, i) => {
            const record = this.records[i];
            const away = sw ? i === sw.from || i === sw.to : i === this.current;
            if (!away) {
                const r = s.s * 0.45;
                ctx.save();
                ctx.beginPath();
                ctx.rect(s.x - 4, s.y - s.s * 0.4, s.s + 8, s.s * 0.62);
                ctx.clip();
                this.drawDisc(ctx, record, s.x + s.s / 2, s.y + s.s * 0.2, r, 0);
                ctx.restore();
            }
            const sleeve = rgbString(mixRgb(hexToRgb(record.colour), [252, 246, 236], 0.55));
            fillRound(
                ctx,
                s.x + 3,
                s.y + s.s * 0.2 + 5,
                s.s,
                s.s * 0.8,
                s.s * 0.06,
                'rgba(92, 70, 58, 0.16)'
            );
            fillRound(ctx, s.x, s.y + s.s * 0.2, s.s, s.s * 0.8, s.s * 0.06, sleeve);
            ctx.save();
            ctx.translate(s.x + s.s / 2, s.y + s.s * 0.62);
            this.drawLabel(ctx, record, s.s * 0.5);
            ctx.restore();
        });
    }

    freeSprites() {
        for (const name of Object.keys(this.sprites)) {
            freeLayer(this.sprites[name].vinyl);
            freeLayer(this.sprites[name].label);
        }
        this.sprites = {};
    }

    exit() {
        this.deck.stop();
        freeLayer(this.bg);
        this.bg = null;
        this.freeSprites();
    }
}

// The shelf's picture: the turntable, a record on it, the arm down.
function icon(ctx, x, y, w, h) {
    const R = Math.min(w, h) * 0.36;
    const cx = x + w * 0.44;
    const cy = y + h * 0.52;
    fillRound(
        ctx,
        cx - R * 1.25 + 3,
        cy - R * 1.15 + 5,
        R * 2.75,
        R * 2.3,
        R * 0.15,
        'rgba(92, 70, 58, 0.16)'
    );
    fillRound(ctx, cx - R * 1.25, cy - R * 1.15, R * 2.75, R * 2.3, R * 0.15, '#F6EFE6');
    disc(ctx, cx, cy, R, '#5F5853');
    disc(ctx, cx, cy, R * 0.92, '#E79A98');
    for (const k of [0.55, 0.7, 0.85]) {
        ctx.beginPath();
        ctx.arc(cx, cy, R * k, 0, TAU);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(120, 70, 70, 0.3)';
        ctx.stroke();
    }
    disc(ctx, cx, cy, R * 0.34, '#F8E3DF');
    disc(ctx, cx, cy, R * 0.05, '#5D5651');
    const px = cx + R * 1.12;
    const py = cy - R * 0.8;
    disc(ctx, px, py, R * 0.14, '#D8D2CB');
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(cx + R * 0.5, cy + R * 0.35);
    ctx.lineWidth = Math.max(2, R * 0.06);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#B9B2AB';
    ctx.stroke();
    disc(ctx, cx - R * 0.95, cy + R * 0.85, R * 0.14, 'rgba(142, 191, 122, 0.95)');
}

export const toy = {
    id: 'turntable',
    title: 'Turntable',
    about: 'A record player to scratch: hold the record and move it to and fro, and the music goes with it, backwards and forwards. The button winds it down and up again. At Sprout, three records to swap and two pads; at Bloom, a speed slider.',
    stages: [
        'one record and the button',
        'three records in a crate, and a horn and a boom',
        'and a slider for the speed',
    ],
    mat: '#EFE3F1',
    icon,
    create: (app) => new TurntableScene(app),
    // The records' sounds, so a record is pressed from sounds already rendered, and the pads'.
    sounds(level) {
        const list = [
            ['click', { variant: 'on' }],
            ['click', { variant: 'off' }],
            ['toot', { f: PADS[0].f }],
            ['thud', { f: 85 }],
            ['tick', { f: noteHz(0, 72) }],
            ['whoosh', { variant: 'up' }],
            ['whoosh', { variant: 'down' }],
        ];
        for (const record of recordsFor(level)) {
            for (const [, name, params] of record.events) list.push([name, params]);
        }
        return list;
    },
    signature() {
        audio.play('drum', {}, { gain: 0.6, delay: 0.05 });
        audio.note('marimba', 5, 60, { gain: 0.5, delay: 0.2 });
        audio.note('marimba', 3, 60, { gain: 0.5, delay: 0.36 });
    },
};
