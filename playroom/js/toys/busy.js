// The busy board: switches, a dial, a slider, a little door, a zipper and a music box, mounted on
// a wooden board.
//
// Montessori's dressing frames and bolt boards are practical life: the hand learns a fastening by
// doing it again and again, for its own sake. Pok Pok's switch toys are the same idea for a child
// who is not yet three, with cause and effect at its plainest. Every control here answers at once,
// and every one can be undone, so nothing can be left wrong.
//
//   touch  - the lamp switch, the door, a tap on the music box.
//   move   - the colour dial clicks round through the scale; the sun slides from dawn to night
//            and the slide whistle follows it; the zipper opens on whatever is inside.
//   make   - crank the music box at any speed and it plays at that speed. At Bloom the door has a
//            bolt, which has to be slid before the door will open.

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
    bead,
    stitches,
} from '../draw.js';
import {
    Spring,
    clamp,
    dist,
    angleDelta,
    approach,
    shade,
    hexToRgb,
    mixRgb,
    rgbString,
    TAU,
} from '../util.js';
import { noteHz, midiHz } from '../synth.js';
import * as audio from '../audio.js';

// Twinkle, Twinkle, Little Star: the traditional French melody, in the public domain.
const TWINKLE = [
    72, 72, 79, 79, 81, 81, 79, 77, 77, 76, 76, 74, 74, 72, 79, 79, 77, 77, 76, 76, 74, 79, 79, 77, 77, 76,
    76, 74, 72, 72, 79, 79, 81, 81, 79, 77, 77, 76, 76, 74, 74, 72,
];

const LAYOUTS = {
    0: ['lamp', 'door', 'sky', 'musicbox'],
    1: ['lamp', 'dial', 'sky', 'door', 'zipper', 'musicbox'],
    2: ['lamp', 'dial', 'sky', 'door', 'zipper', 'musicbox'],
};

const PLATES = {
    lamp: '#F7EBC8',
    dial: '#D9EDE5',
    sky: '#DCE8F4',
    door: '#F6DCD8',
    zipper: '#E6DEF1',
    musicbox: '#F8E2CF',
};

function pan(scene, x) {
    return (x / scene.w) * 2 - 1;
}

//==============================================================================

class Widget {
    constructor(scene) {
        this.scene = scene;
        this.active = null;
    }

    place(x, y, w, h, u) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.u = u;
        this.cx = x + w / 2;
        this.cy = y + h / 2;
        this.layout();
    }

    layout() {}

    contains(px, py) {
        return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
    }

    update() {
        return false;
    }

    down() {}
    move() {}
    up() {}
    draw() {}
}

//------------------------------------------------------------------------------
// A lamp and its switch. The whole plate is the switch: a toddler's aim is generous.

class Lamp extends Widget {
    constructor(scene) {
        super(scene);
        this.on = false;
        this.flip = new Spring(0, 600, 22);
        this.glow = 0;
    }

    layout() {
        const { x, y, w, h } = this;
        this.bulb = { x: this.cx, y: y + h * 0.36, r: Math.min(w, h) * 0.1 };
        this.plate = {
            x: this.cx - Math.min(w, h) * 0.13,
            y: y + h * 0.6,
            w: Math.min(w, h) * 0.26,
            h: h * 0.3,
        };
    }

    down(p) {
        this.on = !this.on;
        this.flip.target = this.on ? 1 : 0;
        audio.play('click', { variant: this.on ? 'on' : 'off' }, { gain: 1, pan: pan(this.scene, this.cx) });
        if (this.on) audio.note('chime', 9, 60, { gain: 0.3, delay: 0.04, wet: 0.4 });
    }

    update(dt) {
        const target = this.on ? 1 : 0;
        const before = this.glow;
        this.glow = approach(this.glow, target, this.on ? 9 : 5, dt);
        return this.flip.update(dt) || Math.abs(this.glow - before) > 1e-4;
    }

    draw(ctx) {
        const u = this.u;
        const b = this.bulb;
        if (this.glow > 0.01) {
            const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, this.h * 0.55);
            g.addColorStop(0, `rgba(255, 232, 170, ${0.7 * this.glow})`);
            g.addColorStop(1, 'rgba(255, 232, 170, 0)');
            ctx.fillStyle = g;
            ctx.save();
            roundRect(ctx, this.x, this.y, this.w, this.h, 18 * u);
            ctx.clip();
            ctx.fillRect(this.x, this.y, this.w, this.h);
            ctx.restore();
        }
        // Cord and shade.
        ctx.strokeStyle = shade(PALETTE.ink, 0.35);
        ctx.lineWidth = 3 * u;
        ctx.beginPath();
        ctx.moveTo(b.x, this.y + 8 * u);
        ctx.lineTo(b.x, b.y - b.r * 1.6);
        ctx.stroke();
        const bulbColour = rgbString(mixRgb([238, 232, 220], [255, 236, 170], this.glow));
        disc(ctx, b.x, b.y + 4 * u, b.r, SHADOW_SOFT);
        disc(ctx, b.x, b.y, b.r, bulbColour);
        if (this.glow > 0.05)
            disc(ctx, b.x - b.r * 0.25, b.y - b.r * 0.2, b.r * 0.4, `rgba(255,255,255,${0.8 * this.glow})`);
        ctx.beginPath();
        ctx.moveTo(b.x - b.r * 2.1, b.y - b.r * 0.4);
        ctx.quadraticCurveTo(b.x, b.y - b.r * 3.4, b.x + b.r * 2.1, b.y - b.r * 0.4);
        ctx.closePath();
        ctx.fillStyle = PALETTE.sageDeep;
        ctx.fill();

        // The switch plate and its lever.
        const pl = this.plate;
        fillRound(ctx, pl.x + 3 * u, pl.y + 5 * u, pl.w, pl.h, 10 * u, SHADOW);
        fillRound(ctx, pl.x, pl.y, pl.w, pl.h, 10 * u, PALETTE.cream);
        disc(ctx, pl.x + pl.w / 2, pl.y + 10 * u, 3 * u, '#D8CDBE');
        disc(ctx, pl.x + pl.w / 2, pl.y + pl.h - 10 * u, 3 * u, '#D8CDBE');
        const angle = (this.flip.value - 0.5) * -1.1;
        ctx.save();
        ctx.translate(pl.x + pl.w / 2, pl.y + pl.h / 2);
        fillRound(ctx, -pl.w * 0.22, -pl.w * 0.12, pl.w * 0.44, pl.w * 0.24, 6 * u, '#E9DFD0');
        ctx.rotate(angle);
        fillRound(ctx, -pl.w * 0.13, -pl.h * 0.34, pl.w * 0.26, pl.h * 0.34, pl.w * 0.12, PALETTE.roseDeep);
        disc(ctx, 0, -pl.h * 0.3, pl.w * 0.16, PALETTE.rose);
        ctx.restore();
    }
}

//------------------------------------------------------------------------------
// A dial with eight detents. Each click is the next note up the scale and the next colour in the
// window, so turning it is playing it.

class Dial extends Widget {
    constructor(scene) {
        super(scene);
        this.angle = 0;
        this.snap = null;
        this.index = 0;
        this.from = hexToRgb(RAINBOW[0]);
        this.to = this.from;
        this.fade = 1;
    }

    layout() {
        const m = Math.min(this.w, this.h);
        this.window = { x: this.cx, y: this.y + this.h * 0.25, r: m * 0.14 };
        this.knob = { x: this.cx, y: this.y + this.h * 0.64, r: m * 0.22 };
    }

    step() {
        return TAU / 8;
    }

    settleIndex() {
        const index = ((Math.round(this.angle / this.step()) % 8) + 8) % 8;
        if (index !== this.index) {
            this.index = index;
            this.from = this.currentRgb();
            this.to = hexToRgb(RAINBOW[index]);
            this.fade = 0;
            audio.note('tick', index, 72, { gain: 1, pan: pan(this.scene, this.cx) });
        }
    }

    currentRgb() {
        return mixRgb(this.from, this.to, clamp(this.fade, 0, 1));
    }

    down(p) {
        if (this.active) return;
        this.active = p;
        this.last = Math.atan2(p.y - this.knob.y, p.x - this.knob.x);
        this.snap = null;
    }

    move(p) {
        if (this.active !== p) return;
        const now = Math.atan2(p.y - this.knob.y, p.x - this.knob.x);
        // Near the centre the angle is meaningless; ignore it rather than spin wildly.
        if (dist(p.x, p.y, this.knob.x, this.knob.y) > this.knob.r * 0.25) {
            this.angle += angleDelta(this.last, now);
            this.settleIndex();
        }
        this.last = now;
    }

    up(p) {
        if (this.active !== p) return;
        this.active = null;
        if (p.travel < 8 * this.u) {
            this.angle = Math.round(this.angle / this.step()) * this.step() + this.step();
            this.settleIndex();
        }
        this.snap = Math.round(this.angle / this.step()) * this.step();
    }

    update(dt) {
        let busy = false;
        if (this.snap !== null) {
            this.angle = approach(this.angle, this.snap, 18, dt);
            if (Math.abs(this.angle - this.snap) < 1e-3) {
                this.angle = this.snap;
                this.snap = null;
            } else busy = true;
        }
        if (this.fade < 1) {
            this.fade = Math.min(1, this.fade + dt * 6);
            busy = true;
        }
        return busy;
    }

    draw(ctx) {
        const u = this.u;
        const win = this.window;
        disc(ctx, win.x, win.y + 4 * u, win.r + 8 * u, SHADOW);
        disc(ctx, win.x, win.y, win.r + 8 * u, PALETTE.cream);
        disc(ctx, win.x, win.y, win.r, rgbString(this.currentRgb()));
        ellipse(ctx, win.x - win.r * 0.3, win.y - win.r * 0.35, win.r * 0.35, win.r * 0.18, -0.5);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fill();

        const k = this.knob;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU - Math.PI / 2;
            disc(
                ctx,
                k.x + Math.cos(a) * (k.r + 14 * u),
                k.y + Math.sin(a) * (k.r + 14 * u),
                5 * u,
                RAINBOW[i]
            );
        }
        disc(ctx, k.x + 3 * u, k.y + 7 * u, k.r, SHADOW);
        disc(ctx, k.x, k.y, k.r, PALETTE.wood);
        ctx.save();
        ctx.translate(k.x, k.y);
        ctx.rotate(this.angle);
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * TAU;
            disc(ctx, Math.cos(a) * k.r * 0.92, Math.sin(a) * k.r * 0.92, k.r * 0.09, PALETTE.woodDark);
        }
        disc(ctx, 0, 0, k.r * 0.78, shade(PALETTE.wood, 0.2));
        fillRound(ctx, -k.r * 0.08, -k.r * 0.72, k.r * 0.16, k.r * 0.5, k.r * 0.08, PALETTE.ink);
        ctx.restore();
    }
}

//------------------------------------------------------------------------------
// A window onto the sky and a slider under it: drag the sun from dawn, across the day, to night.
// A slide whistle follows the knob, rising towards noon.

const SKY = [
    [0, '#7F8BB5'],
    [0.16, '#F2C3B5'],
    [0.32, '#B9D9EE'],
    [0.68, '#B4D6EE'],
    [0.84, '#EAB6C6'],
    [1, '#7F8BB5'],
];

function skyColour(s) {
    for (let i = 1; i < SKY.length; i++) {
        if (s <= SKY[i][0]) {
            const t = (s - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]);
            return mixRgb(hexToRgb(SKY[i - 1][1]), hexToRgb(SKY[i][1]), t);
        }
    }
    return hexToRgb(SKY[SKY.length - 1][1]);
}

class Sky extends Widget {
    constructor(scene) {
        super(scene);
        this.s = 0.42;
        this.speed = 0;
        this.whistle = new audio.Whistle();
    }

    layout() {
        const { x, y, w, h } = this;
        this.window = { x: x + w * 0.12, y: y + h * 0.1, w: w * 0.76, h: h * 0.52 };
        this.track = { x0: x + w * 0.16, x1: x + w * 0.84, y: y + h * 0.8 };
    }

    knobX() {
        return this.track.x0 + (this.track.x1 - this.track.x0) * this.s;
    }

    down(p) {
        if (this.active) return;
        this.active = p;
        this.offset = Math.abs(p.x - this.knobX()) < 50 * this.u ? this.knobX() - p.x : 0;
        this.lastTime = performance.now();
        this.move(p);
        audio.play('wood', { f: 659 }, { gain: 0.36 });
    }

    move(p) {
        if (this.active !== p) return;
        const t = this.track;
        const s = clamp((p.x + this.offset - t.x0) / (t.x1 - t.x0), 0, 1);
        const now = performance.now();
        const dt = Math.max(0.008, (now - this.lastTime) / 1000);
        this.speed = Math.max(this.speed, Math.abs(s - this.s) / dt);
        this.lastTime = now;
        this.s = s;
    }

    up(p) {
        if (this.active === p) this.active = null;
    }

    update(dt) {
        // Pitch climbs to noon and falls again towards night, over an octave and a half.
        const height = Math.sin(this.s * Math.PI);
        const frequency = 330 * Math.pow(2, height * 1.5);
        const level = clamp(this.speed * 0.9, 0, 1);
        this.whistle.set(this.active ? level : 0, frequency);
        this.speed *= Math.exp(-dt * 10);
        return this.speed > 0.01;
    }

    draw(ctx) {
        const u = this.u;
        const win = this.window;
        const sky = skyColour(this.s);
        const day = Math.sin(this.s * Math.PI);

        fillRound(ctx, win.x + 3 * u, win.y + 6 * u, win.w, win.h, 16 * u, SHADOW);
        ctx.save();
        roundRect(ctx, win.x, win.y, win.w, win.h, 16 * u);
        ctx.fillStyle = rgbString(sky);
        ctx.fill();
        ctx.clip();
        // Stars, out at either end of the day.
        const night = clamp(1 - day * 2.2, 0, 1);
        if (night > 0.02) {
            for (let i = 0; i < 9; i++) {
                const sx = win.x + win.w * ((i * 0.37 + 0.1) % 1);
                const sy = win.y + win.h * (0.1 + ((i * 0.53) % 0.55));
                disc(ctx, sx, sy, 2.2 * u, `rgba(255, 250, 230, ${night})`);
            }
        }
        // The sun on its arc, or the moon at night.
        const arcR = win.w * 0.42;
        const a = Math.PI + this.s * Math.PI;
        const bx = win.x + win.w / 2 + Math.cos(a) * arcR;
        const by = win.y + win.h * 0.92 + Math.sin(a) * win.h * 0.72;
        if (night > 0.5) {
            disc(ctx, bx, by, 16 * u, '#FBF3DD');
            disc(ctx, bx + 7 * u, by - 4 * u, 13 * u, rgbString(sky));
        } else {
            disc(ctx, bx, by, 24 * u, `rgba(255, 240, 190, ${0.5 * day})`);
            disc(ctx, bx, by, 17 * u, '#F7D97E');
        }
        ellipse(ctx, win.x + win.w * 0.25, win.y + win.h * 1.05, win.w * 0.45, win.h * 0.32);
        ctx.fillStyle = rgbString(mixRgb(hexToRgb(PALETTE.sage), [110, 120, 150], night * 0.5));
        ctx.fill();
        ellipse(ctx, win.x + win.w * 0.85, win.y + win.h * 1.1, win.w * 0.4, win.h * 0.3);
        ctx.fillStyle = rgbString(mixRgb(hexToRgb(PALETTE.sageDeep), [100, 110, 140], night * 0.5));
        ctx.fill();
        ctx.restore();

        const t = this.track;
        ctx.lineCap = 'round';
        ctx.strokeStyle = SHADOW;
        ctx.lineWidth = 14 * u;
        ctx.beginPath();
        ctx.moveTo(t.x0, t.y + 3 * u);
        ctx.lineTo(t.x1, t.y + 3 * u);
        ctx.stroke();
        ctx.strokeStyle = shade(PALETTE.woodDark, -0.05);
        ctx.lineWidth = 12 * u;
        ctx.beginPath();
        ctx.moveTo(t.x0, t.y);
        ctx.lineTo(t.x1, t.y);
        ctx.stroke();
        bead(ctx, this.knobX(), t.y, 24 * u, PALETTE.butter, 5 * u);
    }

    stop() {
        this.whistle.stop();
    }
}

//------------------------------------------------------------------------------
// A little door. Behind it is a picture, a different one each time it opens: for a child at the
// age of object permanence, finding something behind a door is the whole game.

const PICTURES = [
    { draw: drawCat, motif: [5, 7, 9] },
    { draw: drawBird, motif: [7, 9, 10] },
    { draw: drawStar, motif: [8, 10, 12] },
    { draw: drawFlower, motif: [5, 8, 10] },
    { draw: drawFish, motif: [4, 7, 9] },
    { draw: drawMoon, motif: [10, 9, 7] },
];

class Door extends Widget {
    constructor(scene, latch) {
        super(scene);
        this.open = new Spring(0, 90, 11);
        this.rattle = new Spring(0, 900, 12);
        this.picture = 0;
        this.hasLatch = latch;
        this.latched = latch;
        this.bolt = new Spring(latch ? 0 : 1, 400, 24);
    }

    layout() {
        const fw = Math.min(this.w * 0.46, this.h * 0.5);
        const fh = this.h * 0.74;
        this.frame = { x: this.cx - fw / 2, y: this.y + this.h * 0.13, w: fw, h: fh };
        this.latchBox = {
            x: this.frame.x + fw + 6 * this.u,
            y: this.frame.y + fh * 0.42,
            w: 50 * this.u,
            h: 30 * this.u,
        };
    }

    down(p) {
        const u = this.u;
        const lb = this.latchBox;
        if (
            this.hasLatch &&
            p.x > lb.x - 20 * u &&
            p.x < lb.x + lb.w + 20 * u &&
            p.y > lb.y - 24 * u &&
            p.y < lb.y + lb.h + 24 * u &&
            this.open.target === 0
        ) {
            this.latched = !this.latched;
            this.bolt.target = this.latched ? 0 : 1;
            audio.play('latch', {}, { gain: 1, pan: pan(this.scene, this.cx) });
            return;
        }
        if (this.latched) {
            this.rattle.kick(14);
            audio.play('wood', { f: 880 }, { gain: 0.64, pan: pan(this.scene, this.cx) });
            audio.play('wood', { f: 880 }, { gain: 0.45, delay: 0.09, pan: pan(this.scene, this.cx) });
            return;
        }
        const opening = this.open.target === 0;
        this.open.target = opening ? 1 : 0;
        if (opening) {
            audio.play('creak', {}, { gain: 1, pan: pan(this.scene, this.cx) });
            PICTURES[this.picture].motif.forEach((d, i) =>
                audio.note('chime', d, 60, { gain: 0.83, delay: 0.25 + i * 0.12, wet: 0.4 })
            );
        } else {
            audio.play('wood', { f: 330 }, { gain: 1, delay: 0.18, pan: pan(this.scene, this.cx) });
            audio.play('thud', { f: 110 }, { gain: 0.4, delay: 0.18 });
            this.closing = true;
        }
    }

    update(dt) {
        const busy = this.open.update(dt) | this.rattle.update(dt) | this.bolt.update(dt);
        // Swap the picture while the door is shut, so the next opening finds something new.
        if (this.closing && this.open.value < 0.05) {
            this.closing = false;
            this.picture = (this.picture + 1) % PICTURES.length;
        }
        return !!busy;
    }

    draw(ctx) {
        const u = this.u;
        const f = this.frame;
        const r = f.w * 0.5;
        const archPath = (x, y, w, h) => {
            ctx.beginPath();
            ctx.moveTo(x, y + h);
            ctx.lineTo(x, y + w / 2);
            ctx.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0);
            ctx.lineTo(x + w, y + h);
            ctx.closePath();
        };

        archPath(f.x - 12 * u + 4 * u, f.y - 12 * u + 6 * u, f.w + 24 * u, f.h + 12 * u);
        ctx.fillStyle = SHADOW;
        ctx.fill();
        archPath(f.x - 12 * u, f.y - 12 * u, f.w + 24 * u, f.h + 12 * u);
        ctx.fillStyle = PALETTE.woodDark;
        ctx.fill();

        // Behind the door.
        ctx.save();
        archPath(f.x, f.y, f.w, f.h);
        ctx.fillStyle = '#FDF7EC';
        ctx.fill();
        ctx.clip();
        PICTURES[this.picture].draw(ctx, f.x + f.w / 2, f.y + f.h * 0.55, f.w * 0.72, u);
        ctx.restore();

        // The door, swinging on its left hinge: foreshortened as it turns.
        const swing = clamp(this.open.value, -0.05, 1.08) * 1.32;
        const scaleX = Math.cos(swing);
        const shake = Math.sin(this.rattle.value * 3) * this.rattle.value * 0.6 * u;
        ctx.save();
        ctx.translate(f.x + shake, f.y);
        if (scaleX > 0.02) {
            ctx.scale(scaleX, 1);
            archPath(0, 0, f.w, f.h);
            ctx.fillStyle = PALETTE.rose;
            ctx.fill();
            ctx.save();
            archPath(0, 0, f.w, f.h);
            ctx.clip();
            fillRound(ctx, f.w * 0.18, f.h * 0.2, f.w * 0.64, f.h * 0.3, 8 * u, 'rgba(255,255,255,0.22)');
            fillRound(ctx, f.w * 0.18, f.h * 0.58, f.w * 0.64, f.h * 0.3, 8 * u, 'rgba(255,255,255,0.22)');
            ctx.restore();
            ctx.scale(1 / scaleX, 1);
            bead(ctx, f.w * scaleX * 0.8, f.h * 0.56, 10 * u, PALETTE.butter, 3 * u);
        }
        // The door's edge, visible as it turns.
        const edge = Math.sin(swing) * 14 * u;
        if (edge > 1) fillRound(ctx, f.w * scaleX - 1, 4 * u, edge, f.h - 4 * u, 3 * u, PALETTE.roseDeep);
        ctx.restore();

        if (this.hasLatch) {
            const lb = this.latchBox;
            fillRound(ctx, lb.x, lb.y, lb.w, lb.h, 8 * u, '#E2DCD3');
            const slide = this.bolt.value;
            const boltX = lb.x - 30 * u + slide * 34 * u;
            fillRound(ctx, boltX, lb.y + lb.h * 0.3, 54 * u, lb.h * 0.4, lb.h * 0.2, '#C9C3BC');
            bead(ctx, boltX + 34 * u, lb.y + lb.h * 0.5, 9 * u, '#D8D2CA', 2 * u);
        }
    }
}

function drawCat(ctx, x, y, s) {
    const fur = '#E9C7A2';
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + side * s * 0.36, y - s * 0.05);
        ctx.lineTo(x + side * s * 0.34, y - s * 0.42);
        ctx.lineTo(x + side * s * 0.1, y - s * 0.24);
        ctx.closePath();
        ctx.fillStyle = fur;
        ctx.fill();
    }
    disc(ctx, x, y, s * 0.36, fur);
    disc(ctx, x - s * 0.13, y - s * 0.04, s * 0.04, PALETTE.ink);
    disc(ctx, x + s * 0.13, y - s * 0.04, s * 0.04, PALETTE.ink);
    disc(ctx, x, y + s * 0.07, s * 0.035, PALETTE.roseDeep);
    ctx.strokeStyle = shade(PALETTE.ink, 0.3);
    ctx.lineWidth = s * 0.012;
    for (const side of [-1, 1]) {
        for (const dy of [0.06, 0.12]) {
            ctx.beginPath();
            ctx.moveTo(x + side * s * 0.08, y + s * dy);
            ctx.lineTo(x + side * s * 0.36, y + s * (dy - 0.04 + dy * 0.4));
            ctx.stroke();
        }
    }
}

function drawBird(ctx, x, y, s) {
    ellipse(ctx, x, y, s * 0.32, s * 0.26);
    ctx.fillStyle = PALETTE.sky;
    ctx.fill();
    ellipse(ctx, x - s * 0.06, y + s * 0.02, s * 0.18, s * 0.11, -0.4);
    ctx.fillStyle = PALETTE.skyDeep;
    ctx.fill();
    disc(ctx, x + s * 0.16, y - s * 0.07, s * 0.035, PALETTE.ink);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.3, y - s * 0.05);
    ctx.lineTo(x + s * 0.44, y);
    ctx.lineTo(x + s * 0.3, y + s * 0.05);
    ctx.closePath();
    ctx.fillStyle = PALETTE.butterDeep;
    ctx.fill();
}

function drawStar(ctx, x, y, s) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.17 : s * 0.4;
        const a = -Math.PI / 2 + (i / 10) * TAU;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = PALETTE.butter;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PALETTE.butterDeep;
    ctx.lineWidth = s * 0.03;
    ctx.stroke();
}

function drawFlower(ctx, x, y, s) {
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        disc(
            ctx,
            x + Math.cos(a) * s * 0.17,
            y + Math.sin(a) * s * 0.17,
            s * 0.13,
            i % 2 ? PALETTE.lavender : PALETTE.lavenderDeep
        );
    }
    disc(ctx, x, y, s * 0.1, PALETTE.butter);
}

function drawFish(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x + s * 0.3, y);
    ctx.quadraticCurveTo(x, y - s * 0.26, x - s * 0.22, y);
    ctx.quadraticCurveTo(x, y + s * 0.26, x + s * 0.3, y);
    ctx.fillStyle = PALETTE.peach;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.18, y);
    ctx.lineTo(x - s * 0.38, y - s * 0.16);
    ctx.lineTo(x - s * 0.38, y + s * 0.16);
    ctx.closePath();
    ctx.fill();
    disc(ctx, x + s * 0.16, y - s * 0.04, s * 0.03, PALETTE.ink);
}

function drawMoon(ctx, x, y, s) {
    disc(ctx, x, y, s * 0.3, '#F3E3AE');
    disc(ctx, x + s * 0.13, y - s * 0.08, s * 0.26, '#FDF7EC');
    disc(ctx, x - s * 0.28, y - s * 0.3, s * 0.03, PALETTE.butterDeep);
    disc(ctx, x + s * 0.3, y + s * 0.26, s * 0.025, PALETTE.butterDeep);
}

//------------------------------------------------------------------------------
// A zip across a fabric pouch. Each tooth that passes the pull clicks, so the sound runs as fast as
// the finger. Inside, something peeks out.

class Zipper extends Widget {
    constructor(scene) {
        super(scene);
        this.z = 0;
        this.teeth = 24;
        this.lastTooth = 0;
        this.wobble = new Spring(0, 300, 9);
        this.lastClick = 0;
    }

    layout() {
        const { x, y, w, h } = this;
        this.pouch = { x: x + w * 0.1, y: y + h * 0.2, w: w * 0.8, h: h * 0.62 };
        this.x0 = this.pouch.x + 22 * this.u;
        this.x1 = this.pouch.x + this.pouch.w - 22 * this.u;
        this.ty = this.pouch.y + this.pouch.h * 0.5;
    }

    pullX() {
        return this.x0 + (this.x1 - this.x0) * this.z;
    }

    down(p) {
        if (this.active) return;
        if (Math.abs(p.x - this.pullX()) < 46 * this.u && Math.abs(p.y - this.ty) < 50 * this.u) {
            this.active = p;
            this.offset = this.pullX() - p.x;
            audio.play('tick', { f: 1568 }, { gain: 0.2 });
        } else {
            this.wobble.kick(5);
            audio.play('pat', {}, { gain: 1, pan: pan(this.scene, p.x) });
        }
    }

    move(p) {
        if (this.active !== p) return;
        this.z = clamp((p.x + this.offset - this.x0) / (this.x1 - this.x0), 0, 1);
        const tooth = Math.round(this.z * this.teeth);
        if (tooth !== this.lastTooth) {
            const now = performance.now();
            // Very fast drags would ask for more clicks than are worth playing.
            if (now - this.lastClick > 14) {
                audio.play(
                    'zip',
                    { seed: 1 + (tooth % 3) },
                    { gain: 1, rate: 0.95 + (tooth % 4) * 0.04, pan: pan(this.scene, this.pullX()) }
                );
                this.lastClick = now;
            }
            if (tooth === 0 || tooth === this.teeth) audio.play('latch', {}, { gain: 0.2 });
            this.lastTooth = tooth;
        }
    }

    up(p) {
        if (this.active === p) this.active = null;
    }

    update(dt) {
        return this.wobble.update(dt);
    }

    draw(ctx) {
        const u = this.u;
        const pc = this.pouch;
        const wob = this.wobble.value * 0.01;
        ctx.save();
        ctx.translate(pc.x + pc.w / 2, pc.y + pc.h / 2);
        ctx.scale(1 + wob, 1 - wob);
        ctx.translate(-(pc.x + pc.w / 2), -(pc.y + pc.h / 2));

        fillRound(ctx, pc.x + 3 * u, pc.y + 7 * u, pc.w, pc.h, 22 * u, SHADOW);
        fillRound(ctx, pc.x, pc.y, pc.w, pc.h, 22 * u, PALETTE.lavender);
        stitches(
            ctx,
            pc.x + 9 * u,
            pc.y + 9 * u,
            pc.w - 18 * u,
            pc.h - 18 * u,
            15 * u,
            'rgba(255,255,255,0.55)',
            2 * u,
            7 * u
        );

        const px = this.pullX();
        const span = px - this.x0;
        const gap = Math.min(pc.h * 0.36, span * 0.32);
        const lens = (k) => {
            ctx.beginPath();
            ctx.moveTo(this.x0, this.ty);
            ctx.quadraticCurveTo(this.x0 + span / 2, this.ty - gap * k, px, this.ty);
            ctx.quadraticCurveTo(this.x0 + span / 2, this.ty + gap * k, this.x0, this.ty);
            ctx.closePath();
        };
        if (span > 4 * u) {
            lens(1.0);
            ctx.fillStyle = PALETTE.butter;
            ctx.fill();
            // Someone lives in here.
            ctx.save();
            lens(1.0);
            ctx.clip();
            const mx = this.x0 + span * 0.5;
            const peek = clamp(gap / (pc.h * 0.3), 0, 1);
            const my = this.ty + (1 - peek) * 30 * u + 6 * u;
            disc(ctx, mx - 22 * u, my - 18 * u, 13 * u, '#C9C1BA');
            disc(ctx, mx + 22 * u, my - 18 * u, 13 * u, '#C9C1BA');
            disc(ctx, mx, my, 28 * u, '#D8D1CB');
            disc(ctx, mx - 10 * u, my - 4 * u, 3.5 * u, PALETTE.ink);
            disc(ctx, mx + 10 * u, my - 4 * u, 3.5 * u, PALETTE.ink);
            disc(ctx, mx, my + 6 * u, 4 * u, PALETTE.roseDeep);
            ctx.restore();
            ctx.strokeStyle = shade(PALETTE.lavenderDeep, -0.1);
            ctx.lineWidth = 3 * u;
            lens(1.0);
            ctx.stroke();
        }

        // Teeth: interlocked to the right of the pull, apart along the opening.
        const toothW = (this.x1 - this.x0) / this.teeth;
        ctx.fillStyle = '#F4EFE8';
        for (let i = 0; i <= this.teeth; i++) {
            const tx = this.x0 + i * toothW;
            if (tx >= px) {
                ctx.fillRect(tx - toothW * 0.3, this.ty - (i % 2 ? 7 : 1) * u, toothW * 0.6, 6 * u);
            } else {
                const t = span > 0 ? (tx - this.x0) / span : 0;
                const off = gap * 2 * t * (1 - t);
                ctx.fillRect(tx - toothW * 0.3, this.ty - off - 6 * u, toothW * 0.6, 5 * u);
                ctx.fillRect(tx - toothW * 0.3, this.ty + off + 1 * u, toothW * 0.6, 5 * u);
            }
        }

        // The pull.
        fillRound(ctx, px - 14 * u + 2 * u, this.ty - 10 * u + 5 * u, 28 * u, 52 * u, 10 * u, SHADOW);
        fillRound(ctx, px - 14 * u, this.ty - 10 * u, 28 * u, 52 * u, 10 * u, '#E8E1D8');
        disc(ctx, px, this.ty + 26 * u, 7 * u, PALETTE.lavender);
        fillRound(ctx, px - 16 * u, this.ty - 12 * u, 32 * u, 16 * u, 6 * u, '#D3CCC4');
        ctx.restore();
    }
}

//------------------------------------------------------------------------------
// A music box with a crank. Every eighth of a turn plays the next note of the tune, in either
// direction, so the tune goes exactly as fast as the hand.

class MusicBox extends Widget {
    constructor(scene) {
        super(scene);
        this.crank = 0;
        this.accum = 0;
        this.index = 0;
        this.hop = new Spring(0, 400, 12);
        this.turn = 0;
        this.notes = [];
    }

    layout() {
        const { x, y, w, h } = this;
        this.box = { x: x + w * 0.16, y: y + h * 0.44, w: w * 0.54, h: h * 0.4 };
        this.axle = { x: this.box.x + this.box.w + 16 * this.u, y: this.box.y + this.box.h * 0.5 };
        this.arm = Math.min(w, h) * 0.17;
    }

    playNext() {
        const midi = TWINKLE[this.index];
        this.index = (this.index + 1) % TWINKLE.length;
        audio.play('musicBox', { f: midiHz(midi) }, { gain: 1, pan: pan(this.scene, this.cx), wet: 0.35 });
        this.hop.kick(4);
        this.turn += 0.6;
        this.notes.push({
            x: this.box.x + this.box.w * 0.5 + (Math.random() - 0.5) * 40 * this.u,
            y: this.box.y - 20 * this.u,
            t: 0,
            colour: RAINBOW[midi % RAINBOW.length],
        });
        if (this.notes.length > 8) this.notes.shift();
    }

    down(p) {
        if (this.active) return;
        this.active = p;
        this.last = Math.atan2(p.y - this.axle.y, p.x - this.axle.x);
    }

    move(p) {
        if (this.active !== p) return;
        const now = Math.atan2(p.y - this.axle.y, p.x - this.axle.x);
        const delta = angleDelta(this.last, now);
        this.last = now;
        if (dist(p.x, p.y, this.axle.x, this.axle.y) < 12 * this.u) return;
        this.crank += delta;
        this.accum += Math.abs(delta);
        const step = TAU / 8;
        while (this.accum >= step) {
            this.accum -= step;
            this.playNext();
        }
    }

    up(p) {
        if (this.active !== p) return;
        this.active = null;
        if (p.travel < 8 * this.u) {
            this.crank += TAU / 8;
            this.playNext();
        }
    }

    update(dt) {
        for (const n of this.notes) {
            n.t += dt;
            n.y -= 40 * this.u * dt;
        }
        this.notes = this.notes.filter((n) => n.t < 1.4);
        return this.hop.update(dt) || this.notes.length > 0;
    }

    draw(ctx) {
        const u = this.u;
        const b = this.box;
        for (const n of this.notes) {
            ctx.globalAlpha = clamp(1 - n.t / 1.4, 0, 1);
            disc(ctx, n.x, n.y, 7 * u, n.colour);
            ctx.fillStyle = n.colour;
            ctx.fillRect(n.x + 5 * u, n.y - 22 * u, 3 * u, 22 * u);
            ctx.globalAlpha = 1;
        }

        fillRound(ctx, b.x + 4 * u, b.y + 8 * u, b.w, b.h, 12 * u, SHADOW);
        woodPanel(ctx, b.x, b.y, b.w, b.h, 12 * u, PALETTE.woodDark, 44, this.scene.scale);
        fillRound(ctx, b.x, b.y, b.w, b.h * 0.2, 12 * u, shade(PALETTE.woodDark, 0.15));
        fillRound(ctx, b.x + b.w * 0.1, b.y + b.h * 0.42, b.w * 0.8, b.h * 0.16, 6 * u, PALETTE.rose);

        // The figure on top, turning with the tune.
        const hop = this.hop.value * 3 * u;
        const fx = b.x + b.w / 2;
        const fy = b.y - 6 * u;
        ellipse(ctx, fx, fy + 2 * u, 34 * u, 8 * u);
        ctx.fillStyle = PALETTE.butterDeep;
        ctx.fill();
        ctx.save();
        ctx.translate(fx, fy - 22 * u - hop);
        ctx.scale(Math.cos(this.turn) >= 0 ? 1 : -1, 1);
        drawBird(ctx, 0, 0, 72 * u);
        ctx.restore();

        // The crank.
        const a = this.axle;
        disc(ctx, a.x, a.y, 12 * u, shade(PALETTE.woodDark, -0.1));
        const ex = a.x + Math.cos(this.crank) * this.arm;
        const ey = a.y + Math.sin(this.crank) * this.arm;
        ctx.strokeStyle = '#C9C3BC';
        ctx.lineCap = 'round';
        ctx.lineWidth = 10 * u;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        bead(ctx, ex, ey, 15 * u, PALETTE.butter, 4 * u);
        disc(ctx, a.x, a.y, 6 * u, '#E3DDD5');
    }
}

//==============================================================================

const KINDS = {
    lamp: (scene) => new Lamp(scene),
    dial: (scene) => new Dial(scene),
    sky: (scene) => new Sky(scene),
    door: (scene, level) => new Door(scene, level >= 2),
    zipper: (scene) => new Zipper(scene),
    musicbox: (scene) => new MusicBox(scene),
};

class BusyScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.kinds = LAYOUTS[this.level];
        this.widgets = this.kinds.map((kind) => KINDS[kind](this, this.level));
        this.bg = null;
    }

    layout() {
        freeLayer(this.bg);
        const { w, h, u } = this;
        const n = this.widgets.length;
        const landscape = w >= h;
        const cols = n <= 4 ? 2 : landscape ? 3 : 2;
        const rows = Math.ceil(n / cols);
        // Leave the top-left corner to the home button.
        this.board = { x: 20 * u, y: 92 * u, w: w - 40 * u, h: h - 112 * u };
        const pad = 22 * u;
        const gap = 18 * u;
        const cw = (this.board.w - pad * 2 - gap * (cols - 1)) / cols;
        const ch = (this.board.h - pad * 2 - gap * (rows - 1)) / rows;
        this.widgets.forEach((widget, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            widget.place(
                this.board.x + pad + col * (cw + gap),
                this.board.y + pad + row * (ch + gap),
                cw,
                ch,
                u
            );
        });
        this.drawBackground();
    }

    drawBackground() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        ctx.fillStyle = '#F5EEE4';
        ctx.fillRect(0, 0, w, h);
        grain(ctx, 0, 0, w, h, 0.25, this.scale);
        const b = this.board;
        fillRound(ctx, b.x + 4 * u, b.y + 9 * u, b.w, b.h, 28 * u, SHADOW);
        woodPanel(ctx, b.x, b.y, b.w, b.h, 28 * u, PALETTE.wood, 61, this.scale);
        this.widgets.forEach((widget, i) => {
            const colour = PLATES[this.kinds[i]];
            fillRound(ctx, widget.x + 2 * u, widget.y + 5 * u, widget.w, widget.h, 20 * u, SHADOW_SOFT);
            fillRound(ctx, widget.x, widget.y, widget.w, widget.h, 20 * u, colour);
            grain(ctx, widget.x, widget.y, widget.w, widget.h, 0.3, this.scale);
            for (const [sx, sy] of [
                [0, 0],
                [1, 0],
                [0, 1],
                [1, 1],
            ]) {
                const x = widget.x + 16 * u + sx * (widget.w - 32 * u);
                const y = widget.y + 16 * u + sy * (widget.h - 32 * u);
                disc(ctx, x, y, 5 * u, shade(colour, -0.18));
                ctx.strokeStyle = shade(colour, -0.32);
                ctx.lineWidth = 1.5 * u;
                ctx.beginPath();
                ctx.moveTo(x - 3 * u, y - 3 * u);
                ctx.lineTo(x + 3 * u, y + 3 * u);
                ctx.stroke();
            }
        });
        this.bg = layer;
    }

    widgetAt(x, y) {
        return this.widgets.find((widget) => widget.contains(x, y)) || null;
    }

    down(p) {
        const widget = this.widgetAt(p.x, p.y);
        if (!widget) return;
        p.owner = widget;
        widget.down(p);
    }

    move(p) {
        if (p.owner) p.owner.move(p);
    }

    up(p) {
        if (p.owner) p.owner.up(p);
    }

    update(dt) {
        let busy = false;
        for (const widget of this.widgets) if (widget.update(dt)) busy = true;
        return busy;
    }

    draw(ctx) {
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);
        for (const widget of this.widgets) widget.draw(ctx);
    }

    exit() {
        for (const widget of this.widgets) if (widget.stop) widget.stop();
        freeLayer(this.bg);
        this.bg = null;
    }
}

function icon(ctx, x, y, w, h, u) {
    const bx = x + w * 0.12;
    const by = y + h * 0.12;
    const bw = w * 0.76;
    const bh = h * 0.76;
    fillRound(ctx, bx + 2 * u, by + 4 * u, bw, bh, 12 * u, SHADOW);
    fillRound(ctx, bx, by, bw, bh, 12 * u, PALETTE.wood);
    const cw = bw * 0.42;
    const ch = bh * 0.38;
    const cells = [
        [0, 0, '#F7EBC8'],
        [1, 0, '#D9EDE5'],
        [0, 1, '#F6DCD8'],
        [1, 1, '#E6DEF1'],
    ];
    for (const [cx, cy, colour] of cells)
        fillRound(
            ctx,
            bx + bw * 0.06 + cx * (cw + bw * 0.04),
            by + bh * 0.08 + cy * (ch + bh * 0.06),
            cw,
            ch,
            8 * u,
            colour
        );
    fillRound(
        ctx,
        bx + bw * 0.06 + cw * 0.4,
        by + bh * 0.08 + ch * 0.25,
        cw * 0.2,
        ch * 0.5,
        4 * u,
        PALETTE.roseDeep
    );
    disc(ctx, bx + bw * 0.1 + cw * 1.5, by + bh * 0.08 + ch * 0.5, ch * 0.28, PALETTE.woodDark);
    fillRound(
        ctx,
        bx + bw * 0.06 + cw * 0.3,
        by + bh * 0.14 + ch * 1.15,
        cw * 0.4,
        ch * 0.7,
        cw * 0.2,
        PALETTE.rose
    );
    disc(ctx, bx + bw * 0.1 + cw * 1.5, by + bh * 0.14 + ch * 1.5, ch * 0.2, PALETTE.butter);
}

export const toy = {
    id: 'busy',
    title: 'Busy board',
    about: 'Switch, dial, sliding sun, a door with something behind it, a zip and a music box to crank.',
    stages: ['4 controls', '6 controls', '6 controls, and a bolt on the door'],
    mat: '#F3E6CF',
    icon,
    create: (app) => new BusyScene(app),
    sounds() {
        const list = [
            ['click', { variant: 'on' }],
            ['click', { variant: 'off' }],
            ['creak', {}],
            ['latch', {}],
            ['pat', {}],
            ['thud', { f: 110 }],
            ['wood', { f: 330 }],
            ['wood', { f: 880 }],
            ['wood', { f: 659 }],
            ['tick', { f: 1568 }],
        ];
        for (let i = 0; i < 8; i++) list.push(['tick', { f: noteHz(i, 72) }]);
        for (const midi of [72, 74, 76, 77, 79, 81]) list.push(['musicBox', { f: midiHz(midi) }]);
        for (let s = 1; s <= 3; s++) list.push(['zip', { seed: s }]);
        for (const d of [4, 5, 7, 8, 9, 10, 12]) list.push(['chime', { f: noteHz(d, 60) }]);
        return list;
    },
    signature() {
        audio.play('click', { variant: 'on' }, { gain: 0.75, delay: 0.05 });
    },
};
