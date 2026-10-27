// The Fix-it Shop: broken toys come in through a little door onto the workbench, one at a time: a car
// with a wheel off, a drum with no skin, a music box with no handle, a robot short of an arm, a train
// with no chimney, a boat with no sail. The drawer holds parts. A part that fits clicks in, and the
// toy springs to life: it drives, drums, plays its tune, waves, toots or sails, and then hops up to
// the shelf, where the mended toys play together as a band. A part that does not fit slides gently
// back where it came from, as a Montessori puzzle piece will not go into the wrong hole: the toy
// says no by being a shape, never with a sound that means wrong.
//
//   touch  - tap a broken toy and a dream bubble shows what it does when it works. Tap a part and it
//            turns a quarter. Tap a mended toy on the shelf and it plays its part of the band.
//   move   - carry a part to the gap it leaves; from Sprout, turn it to fit. At Bloom, carry the
//            screwdriver to the screw and hold it there, or turn it round, until the screw is home.
//   make   - a shelf of mended toys that play together: each one fixed joins the band, and the band
//            plays, the newest with it.
//
// Mister Rogers took his visitors to see how crayons and shoes are made; Edmark's Fripple Shop asked
// a child to work out what a customer wanted; Montessori's control of error is physical, never a
// verdict. Watch for: after a part does not fit, does he try another without upset? That is
// confidence growing.
//
// Seed: one part missing, big and plain, and a drawer of two to choose from. Sprout: three in the
// drawer, and the part must be turned to fit. Bloom: two parts missing, four in the drawer, and the
// first is held by a screw the screwdriver turns home.
//
// The rules, what is missing and what fits, are repairs.js; the pictures are fixitart.js.

import { Scene } from '../stage.js';
import {
    PALETTE,
    makeLayer,
    freeLayer,
    grain,
    ellipse,
    disc,
    fillRound,
    woodPanel,
    SHADOW_SOFT,
} from '../draw.js';
import { Spring, clamp, lerp, dist, shade, rng, easeInOutSine, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { KINDS, STAGES, missing, fits, drawer, round, BEAT, BARS, SCORE, bandNotes } from './repairs.js';
import {
    COLOURS,
    SLOTS,
    drawPart,
    drawPartShadow,
    drawToy,
    drawWaves,
    drawScrewdriver,
    drawScrew,
    drawBubble,
} from './fixitart.js';

// Seconds: a toy coming in through the door, working once mended, hopping up to the shelf, and a
// dream of it working.
const ARRIVE = 1.4;
const ALIVE = 2.4;
const HOP = 0.9;
const DREAM = 3.4;
// Untouched this long, the gaps glow to show where something goes; this long, the shop rests.
const ASK = 5;
const IDLE = 40;
// The band's length, two bars of four.
const BAND = BARS * 4 * BEAT;

// How big each part is on its toy, in the toy's units.
const PART_SIZE = {};
for (const kind of KINDS)
    for (const name of Object.keys(SLOTS[kind])) PART_SIZE[name] = SLOTS[kind][name].size;

// What a mended toy does, as it comes to life and in its dream: sounds at times, each with a kick
// to the picture (a struck skin rings, a squeezed horn honks, a chimney puffs).
const WORK = {
    car: [0, 0.18, 0.36, 0.54, 0.72, 0.9, 1.08, 1.26]
        .map((at) => ({ at, sound: ['putt', {}], gain: 0.45 }))
        .concat([
            { at: 1.55, sound: ['beep', { f: noteHz(3, 60) }], gain: 0.55, kick: 'honk' },
            { at: 1.8, sound: ['beep', { f: noteHz(3, 60) }], gain: 0.55, kick: 'honk' },
        ]),
    drum: [0, 0.3, 0.6, 0.75, 0.9, 1.4].map((at, i) => ({
        at,
        sound: ['drum', {}],
        gain: i === 5 ? 0.85 : 0.55,
        kick: 'ring',
    })),
    musicbox: [2, 3, 4, 3, 2, 1, 0].map((degree, i) => ({
        at: i * 0.28,
        sound: ['musicBox', { f: noteHz(degree, 72) }],
        gain: 0.7,
    })),
    robot: [0, 2, 4, 5, 4, 5].map((degree, i) => ({
        at: 0.15 + i * 0.2,
        sound: ['glock', { f: noteHz(degree, 84) }],
        gain: 0.5,
    })),
    train: [
        { at: 0, sound: ['hiss', {}], gain: 0.5, kick: 'puff' },
        { at: 0.35, sound: ['putt', {}], gain: 0.45, kick: 'puff' },
        { at: 0.7, sound: ['putt', {}], gain: 0.45, kick: 'puff' },
        { at: 1.0, sound: ['toot', { f: noteHz(2, 72) }], gain: 0.55, kick: 'puff' },
        { at: 1.38, sound: ['toot', { f: noteHz(0, 72) }], gain: 0.55, kick: 'puff' },
    ],
    boat: [
        { at: 0.1, sound: ['chime', { f: noteHz(0, 60) }], gain: 0.55 },
        { at: 0.75, sound: ['toot', { f: noteHz(0, 48) }], gain: 0.6 },
        { at: 1.5, sound: ['chime', { f: noteHz(3, 60) }], gain: 0.5 },
    ],
};

// How the band plays each toy's notes.
function bandSound(kind, note) {
    switch (kind) {
        case 'drum':
            return [['drum', {}], note.soft ? 0.32 : 0.6];
        case 'musicbox':
            return [['musicBox', { f: noteHz(note.degree, 72) }], 0.62];
        case 'boat':
            return [['chime', { f: noteHz(note.degree, 60) }], 0.42];
        case 'robot':
            return [['glock', { f: noteHz(note.degree, 84) }], 0.38];
        case 'car':
            return [['beep', { f: noteHz(3, 60) }], 0.36];
        case 'train':
            return [['toot', { f: noteHz(note.degree, 72) }], 0.42];
    }
    return null;
}

// How strongly a kick is still showing, `t` seconds into a toy's work.
function kicked(kind, kick, t) {
    let level = 0;
    for (const event of WORK[kind]) {
        if (event.kick !== kick || t < event.at) continue;
        level = Math.max(level, Math.exp(-(t - event.at) / 0.22));
    }
    return level;
}

class FixitScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.stage = STAGES[this.level];
        this.next = rng(Math.floor(Math.random() * 1e9));
        this.time = 0;
        this.touched = 0;
        this.rounds = 0;
        this.last = null;
        this.queue = round(null, this.next);
        this.toy = null;
        this.parts = [];
        this.shelf = {};
        this.leaving = [];
        this.band = null;
        this.dream = null;
        this.sparkles = [];
        this.puffs = [];
        this.hatch = new Spring(0, 90, 13);
        this.bell = new Spring(0, 120, 5);
        this.driver = this.stage.screw ? { x: 0, y: 0, angle: 0, held: null, on: false, lift: 0 } : null;
        this.nextAt = 0.6;
        this.bg = null;
    }

    //--------------------------------------------------------------------------
    // The shop

    layout() {
        const { w, h, u } = this;
        const portrait = h > w;
        this.shelfY = h * (portrait ? 0.2 : 0.25);
        this.benchY = h * (portrait ? 0.64 : 0.65);
        this.S = Math.min(w * (portrait ? 0.4 : 0.3), h * (portrait ? 0.24 : 0.3));
        this.cx = w * 0.5;
        const shelfW = w * 0.88;
        this.ss = Math.min(h * (portrait ? 0.09 : 0.12), (shelfW / KINDS.length) * 0.62);
        this.spots = {};
        KINDS.forEach((kind, i) => {
            this.spots[kind] = { x: w * 0.06 + (i + 0.5) * (shelfW / KINDS.length), y: this.shelfY };
        });
        this.door = {
            x: w * 0.9,
            y: this.benchY - this.S * 0.82,
            w: Math.min(w * 0.13, 120 * u),
            h: this.S * 0.82,
        };
        this.door.x = w - this.door.w - 10 * u;
        const dw = w * (portrait ? 0.86 : 0.72);
        this.drawerBox = {
            x: (w - dw) / 2,
            y: h * (portrait ? 0.77 : 0.775),
            w: dw,
            h: h * (portrait ? 0.15 : 0.19),
        };
        this.dreamAt = portrait
            ? { x: w * 0.5, y: h * 0.335, r: Math.min(h * 0.075, w * 0.17) }
            : { x: w * 0.2, y: h * 0.44, r: Math.min(h * 0.12, w * 0.13) };
        if (this.driver) {
            this.driver.k = 150 * u;
            this.driver.hx = portrait ? w * 0.06 : w * 0.08;
            this.driver.hy = this.benchY - 9 * u;
            if (!this.driver.held) {
                this.driver.x = this.driver.hx;
                this.driver.y = this.driver.hy;
            }
        }
        this.placeDrawer(true);
        freeLayer(this.bg);
        this.bg = this.drawShop();
    }

    drawShop() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const wall = ctx.createLinearGradient(0, 0, 0, this.benchY);
        wall.addColorStop(0, '#F1E2CF');
        wall.addColorStop(1, '#F6EBDD');
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = PALETTE.floor;
        ctx.fillRect(0, this.drawerBox.y - 4 * u, w, h);

        // The pegboard behind the bench, with the tools that are not needed hung on it.
        const peg = {
            x: w * 0.04,
            y: this.shelfY + 26 * u,
            w: w * 0.92,
            h: this.benchY - this.shelfY - 30 * u,
        };
        fillRound(ctx, peg.x, peg.y, peg.w, peg.h, 10 * u, '#E8D2B0');
        ctx.fillStyle = 'rgba(150, 120, 90, 0.28)';
        const gap = 22 * u;
        for (let y = peg.y + gap * 0.6; y < peg.y + peg.h - 6 * u; y += gap)
            for (let x = peg.x + gap * 0.6; x < peg.x + peg.w - 6 * u; x += gap) {
                ctx.beginPath();
                ctx.arc(x, y, 2.4 * u, 0, TAU);
                ctx.fill();
            }
        this.drawTools(ctx, peg);

        // The shelf for mended toys, along the top.
        woodPanel(ctx, w * 0.03, this.shelfY, w * 0.94, 16 * u, 4 * u, PALETTE.wood, 4, this.scale);
        fillRound(ctx, w * 0.03, this.shelfY + 14 * u, w * 0.94, 8 * u, 3 * u, SHADOW_SOFT);
        for (const x of [w * 0.08, w * 0.92])
            fillRound(ctx, x - 6 * u, this.shelfY + 14 * u, 12 * u, 18 * u, 3 * u, PALETTE.woodDark);

        // The door the broken toys come in by: a frame in the wall at the end of the bench.
        const d = this.door;
        fillRound(ctx, d.x - 8 * u, d.y - 10 * u, d.w + 16 * u, d.h + 10 * u, 14 * u, PALETTE.woodDark);
        fillRound(ctx, d.x, d.y, d.w, d.h, 10 * u, '#6F5C4C');

        // The bench: a thick top and a front, on legs.
        const top = this.benchY;
        fillRound(ctx, 0, top + 6 * u, w, 22 * u, 4 * u, SHADOW_SOFT);
        woodPanel(ctx, -10 * u, top, w + 20 * u, 26 * u, 6 * u, PALETTE.wood, 7, this.scale);
        woodPanel(
            ctx,
            -10 * u,
            top + 24 * u,
            w + 20 * u,
            this.drawerBox.y - top - 24 * u,
            4 * u,
            PALETTE.woodDark,
            8,
            this.scale
        );

        // The drawer, pulled out: a tray in front of the bench with a place for each part.
        const b = this.drawerBox;
        fillRound(ctx, b.x + 6 * u, b.y + 8 * u, b.w, b.h, 12 * u, SHADOW_SOFT);
        woodPanel(ctx, b.x, b.y, b.w, b.h, 12 * u, PALETTE.wood, 11, this.scale);
        fillRound(ctx, b.x + 12 * u, b.y + 12 * u, b.w - 24 * u, b.h - 24 * u, 8 * u, '#CDB088');
        fillRound(ctx, b.x + b.w / 2 - 34 * u, b.y + b.h - 9 * u, 68 * u, 6 * u, 3 * u, PALETTE.woodEdge);
        grain(ctx, 0, 0, w, h, 0.18, this.scale);
        return layer;
    }

    // A hammer, a wrench and a saw, as shapes on the pegboard: there to be seen, not used.
    drawTools(ctx, peg) {
        const u = this.u;
        const tone = 'rgba(160, 130, 100, 0.55)';
        ctx.fillStyle = tone;
        const left = peg.x + peg.w * 0.08;
        const y = peg.y + 26 * u;
        fillRound(ctx, left, y, 12 * u, 76 * u, 5 * u, tone);
        fillRound(ctx, left - 18 * u, y - 4 * u, 48 * u, 20 * u, 6 * u, tone);
        const wx = peg.x + peg.w * 0.9;
        fillRound(ctx, wx - 5 * u, y + 6 * u, 10 * u, 70 * u, 5 * u, tone);
        ctx.beginPath();
        ctx.arc(wx, y + 4 * u, 15 * u, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#E8D2B0';
        ctx.fillRect(wx - 5 * u, y - 14 * u, 10 * u, 18 * u);
    }

    //--------------------------------------------------------------------------
    // Toys coming and going

    pan(x) {
        return clamp((x / this.w) * 2 - 1, -1, 1) * 0.7;
    }

    arrive() {
        if (!this.queue.length) {
            this.rounds++;
            this.queue = round(this.last, this.next);
        }
        const kind = this.queue.shift();
        this.last = kind;
        const colours = COLOURS[kind];
        this.toy = {
            kind,
            colour: colours[this.rounds % colours.length],
            phase: 'arrive',
            t: 0,
            x: this.door.x + this.door.w / 2,
            has: {},
            need: missing(kind, this.level),
            screw: null,
            on: 0,
            spin: 0,
        };
        this.hatch.target = 1;
        this.bell.kick(6);
        audio.play('creak', {}, { gain: 0.4, pan: 0.7 });
        audio.play('chime', { f: noteHz(4, 84) }, { gain: 0.45, pan: 0.7, wet: 0.3, delay: 0.05 });
        audio.play('chime', { f: noteHz(2, 84) }, { gain: 0.4, pan: 0.7, wet: 0.3, delay: 0.22 });
        this.parts = drawer(kind, this.level, this.next).map((item, i) => ({
            part: item.part,
            rot: item.rot,
            angle: new Spring((item.rot * Math.PI) / 2, 170, 15),
            size: new Spring(0, 200, 15),
            wiggle: new Spring(0, 80, 5),
            index: i,
            state: 'drawer',
            x: 0,
            y: 0,
            held: null,
            delay: 0.5 + i * 0.12,
        }));
        this.placeDrawer(true);
    }

    // Where each part in the drawer lies, and how big it shows there.
    placeDrawer(jump) {
        const b = this.drawerBox;
        const n = Math.max(1, this.parts.length);
        for (const part of this.parts) {
            part.hx = b.x + ((part.index + 0.5) * b.w) / n;
            part.hy = b.y + b.h * 0.52;
            part.drawerK = clamp(
                PART_SIZE[part.part] * this.S * 1.15,
                62 * this.u,
                Math.min((b.w / n) * 0.72, b.h * 0.8)
            );
            if (jump && part.state === 'drawer') {
                part.x = part.hx;
                part.y = part.hy;
            }
        }
    }

    // Where a part goes on the toy on the bench, on the screen.
    slotAt(name) {
        const at = SLOTS[this.toy.kind][name];
        return { x: this.toy.x + at.x * this.S, y: this.benchY + at.y * this.S, k: at.size * this.S };
    }

    // The toy is mended: it comes to life.
    mended() {
        const toy = this.toy;
        toy.phase = 'alive';
        toy.t = 0;
        toy.played = 0;
        toy.bx = toy.x;
        this.dream = null;
        for (const part of this.parts) if (part.state !== 'in') part.state = 'gone';
        this.sparkle(toy.x, this.benchY - this.S * 0.5, toy.colour[0]);
    }

    hop() {
        const toy = this.toy;
        toy.phase = 'hop';
        toy.t = 0;
        toy.on = 0;
        const old = this.shelf[toy.kind];
        if (old) {
            old.leave = 0;
            this.leaving.push(old);
        }
        audio.play('whoosh', { variant: 'up' }, { gain: 0.4, pan: this.pan(toy.x) });
    }

    landed() {
        const toy = this.toy;
        const spot = this.spots[toy.kind];
        this.shelf[toy.kind] = {
            kind: toy.kind,
            colour: toy.colour,
            bounce: new Spring(0, 260, 12),
            on: 0,
            t: 0,
            ring: 0,
            honk: 0,
            spin: 0,
        };
        audio.play('wood', { f: 520 }, { gain: 0.5, pan: this.pan(spot.x) });
        this.toy = null;
        // The band plays with its newest member; the whole band, the first time it is all there,
        // plays twice.
        const kinds = KINDS.filter((kind) => this.shelf[kind]);
        const full = kinds.length === KINDS.length && !this.fullOnce;
        if (full) this.fullOnce = true;
        this.band = { t: -0.35, notes: bandNotes(kinds), i: 0, repeat: full ? 2 : 1 };
        this.nextAt = this.time + 0.35 + BAND * this.band.repeat - 1.2;
    }

    //--------------------------------------------------------------------------
    // Time

    update(dt) {
        this.time += dt;
        let busy = false;
        // The next toy comes in once the last is on the shelf, as its band finishes: until then
        // the shop keeps time.
        if (!this.toy) {
            busy = true;
            if (this.time >= this.nextAt) this.arrive();
        }

        if (this.toy) {
            const t = this.toy;
            t.t += dt;
            // A broken toy waiting draws nothing, but for the glow that shows where its parts go.
            busy = busy || t.phase !== 'fix' || this.askingFor();
            if (t.phase === 'arrive') {
                const k = clamp(t.t / ARRIVE, 0, 1);
                const from = this.door.x + this.door.w / 2;
                t.x = lerp(from, this.cx, easeInOutSine(k));
                if (k >= 0.75) this.hatch.target = 0;
                if (k >= 1) {
                    t.phase = 'fix';
                    t.t = 0;
                    audio.play('wood', { f: 330 }, { gain: 0.35, pan: this.pan(t.x) });
                    this.dreamOf();
                }
            } else if (t.phase === 'alive') {
                t.on = Math.min(1, t.on + dt * 6);
                this.work(t, dt);
                if (t.t >= ALIVE) this.hop();
            } else if (t.phase === 'hop') {
                if (t.t >= HOP) this.landed();
            }
        }

        // The parts: popping into the drawer, carried, turning, sliding home.
        for (const part of this.parts) {
            if (part.delay > 0) {
                part.delay -= dt;
                if (part.delay <= 0) {
                    part.size.target = 1;
                    audio.play('pop', { f: 520 + part.index * 90 }, { gain: 0.3, pan: this.pan(part.hx) });
                }
                busy = true;
                continue;
            }
            if (part.state === 'gone') {
                part.size.target = 0;
            } else if (!part.held) {
                const tx = part.state === 'bench' ? part.bx : part.hx;
                const ty = part.state === 'bench' ? part.by : part.hy;
                const k = 1 - Math.exp(-dt / 0.09);
                part.x += (tx - part.x) * k;
                part.y += (ty - part.y) * k;
                if (Math.abs(tx - part.x) > 0.5 || Math.abs(ty - part.y) > 0.5) busy = true;
                else {
                    part.x = tx;
                    part.y = ty;
                }
            }
            if (part.size.update(dt)) busy = true;
            if (part.angle.update(dt)) busy = true;
            if (part.wiggle.update(dt)) busy = true;
        }
        this.parts = this.parts.filter((part) => !(part.state === 'gone' && part.size.value < 0.02));

        if (this.driver && this.driverUpdate(dt)) busy = true;

        // The dream bubble.
        if (this.dream) {
            this.dream.t += dt;
            busy = true;
            if (this.dream.t > DREAM) this.dream = null;
        }

        // The band on the shelf.
        if (this.band) {
            busy = true;
            this.playBand(dt);
        }
        for (const kind of KINDS) {
            const toyOn = this.shelf[kind];
            if (!toyOn) continue;
            if (toyOn.bounce.update(dt)) busy = true;
            if (toyOn.on > 0) {
                toyOn.on = Math.max(0, toyOn.on - dt / 0.5);
                toyOn.t += dt;
                toyOn.spin += dt * 7;
                busy = true;
            }
            toyOn.ring = Math.max(0, toyOn.ring - dt / 0.3);
            toyOn.honk = Math.max(0, toyOn.honk - dt / 0.25);
        }
        for (const old of this.leaving) old.leave += dt;
        this.leaving = this.leaving.filter((old) => old.leave < HOP);
        if (this.leaving.length) busy = true;

        if (this.hatch.update(dt)) busy = true;
        if (this.bell.update(dt)) busy = true;
        for (const s of this.sparkles) {
            s.t += dt;
            s.x += s.vx * this.u * dt;
            s.y += s.vy * this.u * dt;
            s.vy += 160 * dt;
        }
        this.sparkles = this.sparkles.filter((s) => s.t < 0.9);
        for (const p of this.puffs) {
            p.t += dt;
            p.y -= 40 * this.u * dt;
            p.x -= 10 * this.u * dt;
        }
        this.puffs = this.puffs.filter((p) => p.t < 1.2);
        if (this.sparkles.length || this.puffs.length) busy = true;
        return busy;
    }

    // While a broken toy waits, its gaps glow now and then to show where something goes, and a part
    // held by a screw not yet home wobbles; until the shop has been left alone a long while.
    askingFor() {
        const quiet = this.time - this.touched;
        return quiet > ASK && quiet < IDLE;
    }

    // A mended toy at work: its sounds on time, and how it moves.
    work(toy, dt) {
        const events = WORK[toy.kind];
        while (toy.played < events.length && events[toy.played].at <= toy.t) {
            const event = events[toy.played++];
            audio.play(event.sound[0], event.sound[1], { gain: event.gain, pan: this.pan(toy.x), wet: 0.2 });
            if (event.kick === 'puff') this.puff(toy);
        }
        if (toy.kind === 'car') {
            // Out along the bench and back again, the wheels turning as it goes.
            const k = clamp(toy.t / (ALIVE * 0.85), 0, 1);
            const before = toy.x;
            toy.x = toy.bx + Math.sin(Math.PI * k) * this.S * 0.55;
            toy.spin += (toy.x - before) / (0.135 * this.S);
        } else toy.spin += dt * 8;
    }

    puff(toy) {
        const at = SLOTS.train.chimney;
        this.puffs.push({
            x: toy.x + at.x * this.S,
            y: this.benchY + (at.y - 0.12) * this.S,
            t: 0,
            r: 12 * this.u,
        });
    }

    playBand(dt) {
        const band = this.band;
        band.t += dt;
        const total = band.notes.length * band.repeat;
        while (band.i < total) {
            const note = band.notes[band.i % band.notes.length];
            const lap = Math.floor(band.i / band.notes.length);
            const at = lap * BAND + note.beat * BEAT;
            if (at > band.t) break;
            band.i++;
            const toy = this.shelf[note.kind];
            const sound = bandSound(note.kind, note.note);
            if (!toy || !sound) continue;
            const spot = this.spots[note.kind];
            audio.play(sound[0][0], sound[0][1], { gain: sound[1], pan: this.pan(spot.x), wet: 0.25 });
            toy.on = 1;
            toy.bounce.kick(-4);
            if (note.kind === 'drum') toy.ring = 1;
            if (note.kind === 'car') toy.honk = 1;
        }
        if (band.t > BAND * band.repeat + 0.4) this.band = null;
    }

    dreamOf() {
        const toy = this.toy;
        if (!toy || toy.phase !== 'fix') return;
        if (this.dream && this.dream.t < 1) return;
        this.dream = { t: 0 };
        audio.play('bubble', { f: 600 }, { gain: 0.4, pan: this.pan(this.dreamAt.x) });
        // The dream sounds as the toy will, far off.
        for (const event of WORK[toy.kind])
            audio.play(event.sound[0], event.sound[1], {
                gain: event.gain * 0.4,
                pan: this.pan(this.dreamAt.x),
                wet: 0.6,
                delay: 0.35 + event.at,
            });
    }

    sparkle(x, y, colour) {
        for (let i = 0; i < 8; i++) {
            const a = -Math.PI / 2 + (i - 3.5) * 0.32;
            this.sparkles.push({
                x,
                y,
                vx: Math.cos(a) * 120,
                vy: Math.sin(a) * 170,
                t: 0,
                colour: i % 2 ? colour : '#F6D77E',
            });
        }
    }

    //--------------------------------------------------------------------------
    // The screwdriver, at Bloom

    driverUpdate(dt) {
        const d = this.driver;
        let busy = false;
        const screw = this.toy && this.toy.screw;
        if (d.held) {
            busy = true;
            if (screw && screw.home < 1 && d.on) {
                // Held on the screw, it turns the screw home: by itself, slowly, and faster as the
                // hand turns it round.
                const before = screw.home;
                screw.home = Math.min(1, screw.home + dt * 0.42 + d.turned);
                d.turned = 0;
                const step = 0.125;
                if (Math.floor(screw.home / step) > Math.floor(before / step)) {
                    const degree = Math.floor(screw.home / step) % 6;
                    audio.play('tick', { f: noteHz(degree, 84) }, { gain: 0.5, pan: this.pan(d.x) });
                }
                if (screw.home >= 1) this.screwed();
            }
        } else {
            const k = 1 - Math.exp(-dt / 0.1);
            d.x += (d.hx - d.x) * k;
            d.y += (d.hy - d.y) * k;
            if (Math.abs(d.hx - d.x) > 0.5 || Math.abs(d.hy - d.y) > 0.5) busy = true;
            d.on = false;
        }
        const lift = d.held ? 1 : 0;
        d.lift += (lift - d.lift) * (1 - Math.exp(-dt / 0.08));
        if (Math.abs(lift - d.lift) > 0.01) busy = true;
        return busy;
    }

    screwed() {
        const toy = this.toy;
        audio.play('latch', {}, { gain: 0.6, pan: this.pan(toy.x) });
        if (this.complete()) this.mended();
    }

    complete() {
        const toy = this.toy;
        return toy.need.every((name) => toy.has[name]) && (!toy.screw || toy.screw.home >= 1);
    }

    // The screwdriver's tip, while held: below the hand that holds its handle.
    tipOf(p) {
        return { x: p.x - 4 * this.u, y: p.y + this.driver.k * 0.62 };
    }

    //--------------------------------------------------------------------------
    // Touch

    partAt(x, y) {
        for (let i = this.parts.length - 1; i >= 0; i--) {
            const part = this.parts[i];
            if (part.state !== 'drawer' && part.state !== 'bench') continue;
            if (part.delay > 0) continue;
            const k = this.shownK(part);
            if (dist(x, y, part.x, part.y) < Math.max(k * 0.55, 36 * this.u)) return part;
        }
        return null;
    }

    // How big a part shows: its size on the toy while carried or near it, bigger in the drawer.
    shownK(part) {
        const real = PART_SIZE[part.part] * this.S;
        const k = part.held || part.state === 'bench' ? real * (part.held ? 1.08 : 1) : part.drawerK;
        return k * part.size.value;
    }

    down(p) {
        this.touched = this.time;
        const part = this.partAt(p.x, p.y);
        if (part) {
            part.held = p;
            part.dx = part.x - p.x;
            part.dy = part.y - p.y;
            part.from = part.state;
            p.owner = { part, x0: p.x, y0: p.y, t0: this.time };
            audio.play('wood', { f: 880 }, { gain: 0.3, pan: this.pan(p.x) });
            return;
        }
        const d = this.driver;
        if (d && !d.held) {
            const hx = d.x + Math.cos(d.angle) * d.k * 0.72;
            const hy = d.y + Math.sin(d.angle) * d.k * 0.72;
            if (dist(p.x, p.y, hx, hy) < 46 * this.u || dist(p.x, p.y, d.x + d.k * 0.4, d.y) < 50 * this.u) {
                d.held = p;
                d.turned = 0;
                d.px = p.x;
                d.py = p.y;
                p.owner = { driver: true };
                this.moveDriver(p);
                audio.play('wood', { f: 700 }, { gain: 0.3, pan: this.pan(p.x) });
                return;
            }
        }
        for (const kind of KINDS) {
            const toy = this.shelf[kind];
            if (!toy) continue;
            const spot = this.spots[kind];
            if (
                Math.abs(p.x - spot.x) < this.ss * 0.6 &&
                p.y > spot.y - this.ss * 1.05 &&
                p.y < spot.y + 10 * this.u
            ) {
                p.owner = { shelf: kind };
                this.playOne(kind);
                return;
            }
        }
        const toy = this.toy;
        if (toy && toy.phase === 'fix') {
            if (
                Math.abs(p.x - toy.x) < this.S * 0.55 &&
                p.y > this.benchY - this.S * 1.05 &&
                p.y < this.benchY + 10 * this.u
            ) {
                p.owner = { toy: true };
                this.dreamOf();
            }
        }
    }

    // A tap on a mended toy on the shelf: its first note in the band, and a bounce.
    playOne(kind) {
        const toy = this.shelf[kind];
        const sound = bandSound(kind, SCORE[kind][0]);
        audio.play(sound[0][0], sound[0][1], {
            gain: sound[1] + 0.1,
            pan: this.pan(this.spots[kind].x),
            wet: 0.2,
        });
        toy.on = 1;
        toy.bounce.kick(-5);
        if (kind === 'drum') toy.ring = 1;
        if (kind === 'car') toy.honk = 1;
    }

    move(p) {
        const owner = p.owner;
        if (!owner) return;
        if (owner.part) {
            const part = owner.part;
            part.x = clamp(p.x + part.dx, 0, this.w);
            part.y = clamp(p.y + part.dy, 0, this.h);
        } else if (owner.driver) this.moveDriver(p);
    }

    moveDriver(p) {
        const d = this.driver;
        const tip = this.tipOf(p);
        // How far the hand has moved since last time: turning it round turns the screw faster.
        const moved = dist(d.px, d.py, p.x, p.y);
        d.px = p.x;
        d.py = p.y;
        d.angle = -Math.PI / 2 + 0.08;
        d.x = tip.x;
        d.y = tip.y;
        const screw = this.toy && this.toy.screw;
        d.on = false;
        if (screw && screw.home < 1) {
            const at = this.slotAt(screw.name);
            if (dist(tip.x, tip.y, at.x, at.y) < 44 * this.u) {
                d.on = true;
                d.x = at.x;
                d.y = at.y;
                d.turned = (d.turned || 0) + moved / (900 * this.u);
            }
        }
    }

    up(p) {
        const owner = p.owner;
        if (!owner) return;
        if (owner.driver) {
            this.driver.held = null;
            this.driver.angle = 0;
            return;
        }
        if (!owner.part) return;
        const part = owner.part;
        part.held = null;
        const tap = dist(p.x, p.y, owner.x0, owner.y0) < 12 * this.u && this.time - owner.t0 < 0.45;
        if (tap) {
            // A tap turns it a quarter, where it lies.
            part.rot = (part.rot + 1) % 4;
            part.angle.target += Math.PI / 2;
            part.state = part.from;
            audio.play('tick', { f: noteHz(part.rot + 1, 72) }, { gain: 0.5, pan: this.pan(part.x) });
            return;
        }
        this.drop(part);
    }

    // A part let go of: into its gap if it fits; beside the toy if it is the right part the wrong
    // way round; otherwise back to the drawer, gently.
    drop(part) {
        const toy = this.toy;
        if (toy && toy.phase === 'fix') {
            for (const name of toy.need) {
                if (toy.has[name]) continue;
                const at = this.slotAt(name);
                const reach = Math.max(at.k * 0.55, 46 * this.u) * (this.level === 0 ? 1.4 : 1.1);
                if (dist(part.x, part.y, at.x, at.y) > reach) continue;
                if (fits(part.part, part.rot, name, this.level)) {
                    this.fit(part, name);
                    return;
                }
                if (part.part === name) {
                    // The right part, turned the wrong way: it tries, rocks, and lies by the toy.
                    part.state = 'bench';
                    const k = PART_SIZE[part.part] * this.S;
                    const right = toy.x + this.S * 0.62 + k / 2 < this.door.x - 6 * this.u;
                    part.bx = toy.x + (right ? 1 : -1) * (this.S * 0.62 + k * 0.35);
                    part.by = this.benchY - k * 0.5 - 4 * this.u;
                    part.wiggle.kick(6);
                    audio.play('wood', { f: 440 }, { gain: 0.4, pan: this.pan(part.x) });
                    return;
                }
            }
        }
        part.state = 'drawer';
        audio.play('rustle', {}, { gain: 0.3, pan: this.pan(part.x) });
    }

    fit(part, name) {
        const toy = this.toy;
        toy.has[name] = true;
        part.state = 'in';
        this.parts = this.parts.filter((p) => p !== part);
        const at = this.slotAt(name);
        audio.play('click', {}, { gain: 0.7, pan: this.pan(at.x) });
        audio.play('wood', { f: 660 }, { gain: 0.45, pan: this.pan(at.x), delay: 0.03 });
        this.sparkle(at.x, at.y, '#FFF6D6');
        // At Bloom the first part is held by a screw, which the screwdriver turns home.
        if (this.stage.screw && name === toy.need[0]) toy.screw = { name, home: 0 };
        if (this.complete()) this.mended();
    }

    //--------------------------------------------------------------------------
    // Drawing

    draw(ctx) {
        const { w, h, u } = this;
        ctx.drawImage(this.bg.canvas, 0, 0, w, h);
        this.drawShelf(ctx);
        this.drawDoor(ctx);
        const toy = this.toy;
        if (toy && toy.phase !== 'hop') this.drawBenchToy(ctx, toy);
        if (toy && toy.phase === 'hop') this.drawHop(ctx, toy);
        // The parts, the ones lying still first and the one in a hand last.
        const held = [];
        for (const part of this.parts) {
            if (part.held) held.push(part);
            else this.drawOnePart(ctx, part);
        }
        if (this.driver) this.drawDriver(ctx);
        if (this.dream) this.drawDream(ctx);
        for (const part of held) this.drawOnePart(ctx, part);
        for (const p of this.puffs) {
            const k = p.t / 1.2;
            disc(ctx, p.x, p.y, p.r * (1 + k * 1.6), `rgba(255, 253, 248, ${(0.85 * (1 - k)).toFixed(3)})`);
        }
        for (const s of this.sparkles) {
            ctx.globalAlpha = clamp(1 - s.t / 0.9, 0, 1);
            disc(ctx, s.x, s.y, 4.5 * u, s.colour);
        }
        ctx.globalAlpha = 1;
    }

    drawShelf(ctx) {
        const ss = this.ss;
        for (const kind of KINDS) {
            const toy = this.shelf[kind];
            if (!toy) continue;
            const spot = this.spots[kind];
            this.drawSmall(ctx, kind, toy, spot.x, spot.y + toy.bounce.value * 3 * this.u, ss);
        }
        for (const old of this.leaving) {
            // Off home: up and away, over the top.
            const spot = this.spots[old.kind];
            const k = clamp(old.leave / HOP, 0, 1);
            ctx.globalAlpha = 1 - k;
            this.drawSmall(
                ctx,
                old.kind,
                old,
                spot.x + k * 60 * this.u,
                spot.y - Math.sin(k * Math.PI * 0.6) * 120 * this.u,
                ss * (1 - k * 0.3)
            );
            ctx.globalAlpha = 1;
        }
    }

    drawSmall(ctx, kind, toy, x, y, s) {
        ellipse(ctx, x, y + 1 * this.u, s * 0.42, s * 0.06);
        ctx.fillStyle = 'rgba(92, 70, 58, 0.14)';
        ctx.fill();
        const has = {};
        for (const name of Object.keys(SLOTS[kind])) has[name] = true;
        const st = {
            has,
            need: [],
            colour: toy.colour,
            on: toy.on,
            t: this.time,
            spin: toy.spin,
            ring: toy.ring,
            honk: toy.honk,
        };
        if (kind === 'boat' && toy.on > 0) drawWaves(ctx, x, y - s * 0.02, s, this.time, toy.on);
        const tilt = kind === 'boat' ? Math.sin(this.time * 3) * 0.06 * toy.on : 0;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(tilt);
        drawToy(ctx, kind, 0, 0, s, st);
        ctx.restore();
    }

    drawDoor(ctx) {
        const d = this.door;
        const u = this.u;
        const open = clamp(this.hatch.value, 0, 1);
        // The door swings in; through it, the dark of the back room.
        fillRound(ctx, d.x + 4 * u, d.y + 4 * u, d.w - 8 * u, d.h - 4 * u, 8 * u, '#4E4038');
        const dw = (d.w - 8 * u) * (1 - open * 0.85);
        fillRound(ctx, d.x + 4 * u, d.y + 4 * u, dw, d.h - 4 * u, 8 * u, '#E8A97C');
        if (dw > 20 * u) {
            fillRound(ctx, d.x + 12 * u, d.y + 14 * u, dw - 16 * u, d.h * 0.3, 6 * u, '#F4C8A2');
            disc(ctx, d.x + 4 * u + dw - 12 * u, d.y + d.h * 0.55, 4 * u, '#C9A64A');
        }
        // The shop bell over the door rings as a toy comes in.
        const bx = d.x + d.w / 2;
        const by = d.y - 18 * u;
        ctx.save();
        ctx.translate(bx, by - 10 * u);
        ctx.rotate(this.bell.value * 0.08);
        ctx.strokeStyle = '#C9A64A';
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.moveTo(0, -8 * u);
        ctx.lineTo(0, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-10 * u, 16 * u);
        ctx.quadraticCurveTo(-9 * u, 0, 0, 0);
        ctx.quadraticCurveTo(9 * u, 0, 10 * u, 16 * u);
        ctx.closePath();
        ctx.fillStyle = '#E5C766';
        ctx.fill();
        disc(ctx, 0, 17 * u, 3 * u, '#C9A64A');
        ctx.restore();
    }

    toyState(toy) {
        const st = {
            has: toy.has,
            need: toy.need,
            colour: toy.colour,
            on: toy.on,
            t: toy.phase === 'alive' ? toy.t : this.time,
            spin: toy.spin,
            ring: toy.phase === 'alive' ? kicked(toy.kind, 'ring', toy.t) : 0,
            honk: toy.phase === 'alive' ? kicked(toy.kind, 'honk', toy.t) : 0,
            glow: 0,
        };
        if (toy.phase === 'fix' && this.askingFor()) st.glow = 0.5 + 0.5 * Math.sin(this.time * 4);
        return st;
    }

    drawBenchToy(ctx, toy) {
        const S = this.S;
        const y = this.benchY;
        ellipse(ctx, toy.x, y + 2 * this.u, S * 0.5, S * 0.06);
        ctx.fillStyle = 'rgba(92, 70, 58, 0.16)';
        ctx.fill();
        const st = this.toyState(toy);
        if (toy.kind === 'boat' && toy.on > 0) drawWaves(ctx, toy.x, y - S * 0.02, S, toy.t, toy.on);
        ctx.save();
        ctx.translate(toy.x, y);
        if (toy.kind === 'boat') ctx.rotate(Math.sin(toy.t * 3) * 0.07 * toy.on);
        if (toy.kind === 'train' && toy.on > 0) ctx.translate(Math.sin(toy.t * 9) * 0.02 * S, 0);
        drawToy(ctx, toy.kind, 0, 0, S, st);
        ctx.restore();
        // The screw holding the first part, until it is home.
        const screw = toy.screw;
        if (screw && screw.home < 1) {
            const at = this.slotAt(screw.name);
            drawScrew(ctx, at.x, at.y, 10 * this.u, screw.home * TAU * 3, screw.home);
        }
    }

    drawHop(ctx, toy) {
        const k = easeInOutSine(clamp(toy.t / HOP, 0, 1));
        const spot = this.spots[toy.kind];
        const x = lerp(toy.x, spot.x, k);
        const y = lerp(this.benchY, spot.y, k) - Math.sin(k * Math.PI) * this.S * 0.5;
        const s = lerp(this.S, this.ss, k);
        const has = {};
        for (const name of Object.keys(SLOTS[toy.kind])) has[name] = true;
        drawToy(ctx, toy.kind, x, y, s, {
            has,
            need: [],
            colour: toy.colour,
            on: 0,
            t: this.time,
            spin: toy.spin,
        });
    }

    drawOnePart(ctx, part) {
        const k = this.shownK(part);
        if (k < 1) return;
        const wobble = part.wiggle.value * 0.05;
        if (part.held)
            drawPartShadow(ctx, part.part, part.x + 6 * this.u, part.y + 10 * this.u, k, part.angle.value);
        drawPart(ctx, part.part, part.x, part.y, k, part.angle.value + wobble, this.partLook(part));
    }

    partLook(part) {
        if (part.part === 'arm' || part.part === 'sail') {
            const owner = this.toy ? this.toy.colour : COLOURS.robot[0];
            return part.part === 'arm' ? { colour: owner } : { stripe: owner[1] };
        }
        return {};
    }

    drawDriver(ctx) {
        const d = this.driver;
        const u = this.u;
        if (d.lift > 0.05)
            drawScrewdriver(ctx, d.x + 6 * u, d.y + 10 * u, d.k * (1 + d.lift * 0.05), d.angle);
        drawScrewdriver(ctx, d.x, d.y, d.k * (1 + d.lift * 0.05), d.angle);
        // While it turns a screw, the screw's slot turns with it.
        if (d.on && this.toy && this.toy.screw) {
            const at = this.slotAt(this.toy.screw.name);
            drawScrew(ctx, at.x, at.y, 10 * u, this.toy.screw.home * TAU * 3, this.toy.screw.home);
        }
    }

    drawDream(ctx) {
        const toy = this.toy;
        if (!toy) return;
        const t = this.dream.t;
        const k = Math.min(1, t / 0.25) * clamp((DREAM - t) / 0.4, 0, 1);
        const at = this.dreamAt;
        drawBubble(ctx, at.x, at.y, at.r, { x: toy.x - this.S * 0.2, y: this.benchY - this.S * 0.85 }, k);
        if (k < 0.05) return;
        // Inside, the toy, mended and working.
        const s = at.r * 0.95;
        const has = {};
        for (const name of Object.keys(SLOTS[toy.kind])) has[name] = true;
        const wt = Math.max(0, t - 0.35);
        const st = {
            has,
            need: [],
            colour: toy.colour,
            on: 1,
            t: wt,
            spin: wt * 8,
            ring: kicked(toy.kind, 'ring', wt),
            honk: kicked(toy.kind, 'honk', wt),
        };
        ctx.save();
        ctx.globalAlpha = k;
        const y = at.y + s * 0.45;
        const drive =
            toy.kind === 'car' ? Math.sin(Math.min(1, wt / (ALIVE * 0.85)) * Math.PI) * s * 0.25 : 0;
        if (toy.kind === 'boat') drawWaves(ctx, at.x, y, s, wt, 1);
        ctx.translate(at.x - s * 0.12 + drive, y);
        if (toy.kind === 'boat') ctx.rotate(Math.sin(wt * 3) * 0.07);
        drawToy(ctx, toy.kind, 0, 0, s, st);
        ctx.restore();
    }

    exit() {
        freeLayer(this.bg);
        this.bg = null;
        this.invalidate();
    }
}

function icon(ctx, x, y, w, h, u) {
    // The workbench, a car with its wheel beside it, and a robot.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    fillRound(ctx, x, y + h * 0.7, w, h * 0.3, 0, '#D2AF84');
    fillRound(ctx, x, y + h * 0.66, w, h * 0.08, 0, '#E5CBA5');
    ctx.restore();
    const s = Math.min(w, h) * 0.46;
    drawToy(ctx, 'car', x + w * 0.38, y + h * 0.68, s, {
        has: { horn: true },
        need: ['wheel'],
        colour: COLOURS.car[0],
        on: 0,
        t: 0,
    });
    drawPart(ctx, 'wheel', x + w * 0.82, y + h * 0.6, s * 0.27, 0);
    void u;
}

export const toy = {
    id: 'fixit',
    title: 'Fix-it shop',
    about: 'Broken toys come in through a little door onto the workbench: a car with a wheel off, a drum with no skin, a robot short of an arm. A part from the drawer that fits clicks in, and the toy springs to life, then hops up to the shelf, where the mended toys play together as a band. A part that does not fit slides gently back. Tap a broken toy to see what it does when it works.',
    stages: [
        'One part missing, from a drawer of two',
        'A drawer of three, and the part must be turned to fit',
        'Two parts missing, and a screwdriver for the screw',
    ],
    isNew: true,
    mat: shade(PALETTE.peach, 0.3),
    icon,
    create: (app) => new FixitScene(app),
    sounds() {
        const list = [
            ['creak', {}],
            ['chime', { f: noteHz(4, 84) }],
            ['chime', { f: noteHz(2, 84) }],
            ['wood', { f: 330 }],
            ['wood', { f: 440 }],
            ['wood', { f: 520 }],
            ['wood', { f: 660 }],
            ['wood', { f: 700 }],
            ['wood', { f: 880 }],
            ['click', {}],
            ['latch', {}],
            ['rustle', {}],
            ['whoosh', { variant: 'up' }],
            ['bubble', { f: 600 }],
        ];
        for (let i = 0; i < 4; i++) list.push(['pop', { f: 520 + i * 90 }]);
        for (let d = 0; d < 6; d++) list.push(['tick', { f: noteHz(d, 84) }], ['tick', { f: noteHz(d, 72) }]);
        for (const kind of KINDS) {
            for (const event of WORK[kind]) list.push(event.sound);
            for (const note of SCORE[kind]) list.push(bandSound(kind, note)[0]);
        }
        return list;
    },
    signature() {
        audio.play('click', {}, { gain: 0.5, delay: 0.05 });
        audio.note('glock', 4, 84, { gain: 0.4, delay: 0.2 });
    },
};
