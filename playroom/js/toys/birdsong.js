// Bird Song: a bird on a branch sings a short tune, then raises a wing to its ear and waits.
// Whatever he plays on the bell flowers below is his answer, for as long as he likes; when he has
// finished, he taps the bird to hand it the turn. The bird sings his notes back, and then a new tune
// that begins on the note he ended with. A conversation in music, and practice at the thing a
// conversation needs: taking turns, and a clear way to trade them.
//
//   touch  - tap a flower for its note. The colours keep the notes they have in every game: red C,
//            yellow E, green G, blue A, purple the C above. Tap the bird: once he has played, that
//            hands it the turn; before, it sings its tune again.
//   move   - run a finger along the flowers for a glide, and the bird glides it back.
//   make   - a song of turns, his and the bird's.
//
// Never wrong: whatever he plays is sung back, and nothing is ever marked. A tune grows by a note
// after three answered turns in a row, and never shrinks. While the bird sings, the flowers close
// a little and ring only softly, and the bird finishes its tune before it listens; when it is his
// turn they open again with a ripple. When he pauses, a slow ring round the bird, the one the bud
// asks for a first touch with, and a hop ask him for the bird's turn. Quiet is fine too: after a
// while the bird sings its tune again, or, if he has played, chirps to ask for its turn, twice, and
// then tucks its head in and rests until a flower or the bird is touched; woken by a tap, it still
// sings back what he played.
//
// At Bloom a second bird joins: it answers the first bird's tune before both listen to him, and
// the two take turns to lead. Taking turns, shown rather than told.

import { Scene } from '../stage.js';
import { PALETTE, makeLayer, freeLayer, grain, ellipse, disc } from '../draw.js';
import { Spring, clamp, dist, shade, hexToRgb, mixRgb, rgbString, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { COLOURS } from './cubes.js';
import { STAGES, OPENERS, FINISHED, REMIND, REMINDERS, compose, echo, grown } from './tunes.js';

// The pause between the parts of the birds' turn, how far the flowers close while the birds sing,
// how far a listening head is cocked, and how often the bird asks for its turn with a ring and a
// hop once he has paused.
const PAUSE = 0.5;
const CLOSED = 0.3;
const LISTEN = 0.45;
const ASK_EVERY = 2.6;

// The birds: a robin who leads, an octave above the flowers, and at Bloom a blue friend at the
// flowers' own pitch.
const BIRDS = [
    { body: '#EFA77E', belly: '#F9DFC6', wing: '#D98C64', base: 84 },
    { body: '#9DB6D8', belly: '#E8EFF7', wing: '#7D9BC6', base: 72 },
];
const BEAK = '#E8B04E';

class BirdScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.stage = STAGES[this.level];
        this.time = 0;
        this.flowers = this.stage.flowers.map((name, index) => {
            const kind = COLOURS.find((c) => c.name === name);
            return {
                index,
                name,
                degree: kind.degree,
                colour: kind.colour,
                pale: rgbString(mixRgb(hexToRgb(kind.colour), [251, 246, 238], 0.45)),
                swing: new Spring(0, 120, 5),
                open: new Spring(CLOSED, 90, 13),
                lit: 0,
                waveAt: -1,
            };
        });
        this.birds = BIRDS.slice(0, this.stage.birds).map((look, i) => ({
            look,
            facing: i === 0 ? 1 : -1,
            tilt: new Spring(0, 140, 14),
            bob: new Spring(0, 260, 12),
            ruffle: new Spring(0, 300, 10),
            sleep: new Spring(0, 40, 12),
            // A wing to the ear while it waits for him, the way Ms Rachel waits for an answer.
            cup: new Spring(0, 120, 16),
            beak: 0,
            eye: { x: 0.4, y: 0.6 },
            blinkAt: 1.5 + Math.random() * 3,
        }));
        this.lead = 0;
        this.length = this.stage.first;
        this.tune = OPENERS[this.level].map((name) => this.stage.flowers.indexOf(name));
        this.heard = [];
        this.quiet = 0;
        this.lastNote = -10;
        this.reminders = 0;
        this.asked = -1;
        this.streak = 0;
        this.holds = new Set();
        this.notes = [];
        this.bg = null;
        this.mode = 'birds';
        this.timeline = null;
        this.perform(this.opening(), 0.9);
    }

    //--------------------------------------------------------------------------
    // Layout

    layout() {
        freeLayer(this.bg);
        const { w, h, u } = this;
        const portrait = h > w;
        this.ground = h * 0.9;

        // The branch comes in from the left, across the top third, clear of the home button.
        const top = portrait ? 0.36 : 0.3;
        this.branch = {
            x0: -30 * u,
            y0: h * top + 30 * u,
            cx: w * 0.45,
            cy: h * top + 52 * u,
            x1: w * 0.86,
            y1: h * top - 6 * u,
        };
        this.r = 54 * u;
        const spots = this.birds.length === 1 ? [0.5] : portrait ? [0.33, 0.66] : [0.4, 0.6];
        this.birds.forEach((bird, i) => {
            bird.x = w * spots[i];
            bird.y = this.branchY(bird.x) - this.r * 0.98;
        });

        const n = this.flowers.length;
        const spread = Math.min(w * 0.9, n * 200 * u);
        this.slot = spread / n;
        this.bellW = Math.min(this.slot * 0.7, (n === 3 ? 140 : 116) * u);
        this.bellH = this.bellW * 0.9;
        this.hookY = portrait ? h * 0.6 : h * 0.56;
        const x0 = (w - spread) / 2;
        this.flowers.forEach((flower, i) => {
            flower.x = x0 + this.slot * (i + 0.5);
            flower.y = this.hookY;
        });

        this.drawBackground();
    }

    // The branch's upper edge at x, where a bird's feet grip it.
    branchY(x) {
        const b = this.branch;
        // Solve the quadratic's x(t) = x by bisection: it is monotonic along the branch.
        let lo = 0;
        let hi = 1;
        for (let i = 0; i < 24; i++) {
            const t = (lo + hi) / 2;
            const bx = (1 - t) * (1 - t) * b.x0 + 2 * (1 - t) * t * b.cx + t * t * b.x1;
            if (bx < x) lo = t;
            else hi = t;
        }
        const t = (lo + hi) / 2;
        const y = (1 - t) * (1 - t) * b.y0 + 2 * (1 - t) * t * b.cy + t * t * b.y1;
        return y - this.thickness(t) / 2;
    }

    thickness(t) {
        return (24 - 15 * t) * this.u;
    }

    drawBackground() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const sky = ctx.createLinearGradient(0, 0, 0, this.ground);
        sky.addColorStop(0, '#D9E9F3');
        sky.addColorStop(1, '#F7F0E4');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);
        // Clouds, each one path so its puffs do not show through one another.
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        for (const [cx, cy, s] of [
            [0.2, 0.12, 1],
            [0.78, 0.1, 0.8],
            [0.47, 0.06, 0.55],
        ]) {
            ctx.beginPath();
            for (const [dx, dy, r] of [
                [-40, 6, 30],
                [0, -6, 40],
                [44, 6, 28],
            ]) {
                const x = w * cx + dx * s * u;
                const y = h * cy + dy * s * u;
                ctx.moveTo(x + r * s * u, y);
                ctx.arc(x, y, r * s * u, 0, TAU);
            }
            ctx.fill();
        }

        // The meadow, and the flowers' stems: each rises from the grass and bends over, and its
        // bell hangs from the tip.
        ctx.fillStyle = PALETTE.sage;
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(0, this.ground);
        for (let i = 0; i <= 16; i++) {
            const x = (w * i) / 16;
            ctx.quadraticCurveTo(x - w / 32, this.ground - 10 * u, x, this.ground + (i % 2 ? 4 : -2) * u);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        const bw = this.bellW;
        for (const flower of this.flowers) {
            const baseX = flower.x - bw * 0.42;
            ctx.strokeStyle = PALETTE.sageDeep;
            ctx.lineWidth = Math.max(4, bw * 0.07);
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(baseX, this.ground + 8 * u);
            ctx.quadraticCurveTo(flower.x - bw * 0.55, flower.y - bw * 0.6, flower.x, flower.y - 2 * u);
            ctx.stroke();
            for (const [t, side] of [
                [0.35, -1],
                [0.6, 1],
            ]) {
                const lx = baseX + (flower.x - bw * 0.5 - baseX) * t;
                const ly = this.ground + (flower.y - this.ground) * t * 0.9;
                ellipse(ctx, lx + side * bw * 0.16, ly, bw * 0.17, bw * 0.06, side * -0.6);
                ctx.fillStyle = PALETTE.sageDeep;
                ctx.fill();
            }
        }

        // The branch: a tapering bough with a few leaves.
        const b = this.branch;
        const left = [];
        const right = [];
        for (let i = 0; i <= 32; i++) {
            const t = i / 32;
            const x = (1 - t) * (1 - t) * b.x0 + 2 * (1 - t) * t * b.cx + t * t * b.x1;
            const y = (1 - t) * (1 - t) * b.y0 + 2 * (1 - t) * t * b.cy + t * t * b.y1;
            const dx = 2 * (1 - t) * (b.cx - b.x0) + 2 * t * (b.x1 - b.cx);
            const dy = 2 * (1 - t) * (b.cy - b.y0) + 2 * t * (b.y1 - b.cy);
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const half = this.thickness(t) / 2;
            left.push([x + (dy / len) * half, y - (dx / len) * half]);
            right.push([x - (dy / len) * half, y + (dx / len) * half]);
        }
        const bough = (dx, dy, colour) => {
            ctx.beginPath();
            left.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
            for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0] + dx, right[i][1] + dy);
            ctx.closePath();
            ctx.fillStyle = colour;
            ctx.fill();
        };
        bough(3 * u, 8 * u, 'rgba(112, 84, 58, 0.1)');
        bough(0, 0, PALETTE.woodEdge);
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 3 * u;
        ctx.beginPath();
        left.forEach(([x, y], i) => (i ? ctx.lineTo(x, y + 3 * u) : ctx.moveTo(x, y + 3 * u)));
        ctx.stroke();
        for (const [t, side, size] of [
            [0.18, 1, 1],
            [0.3, -1, 0.8],
            [0.72, 1, 0.9],
            [0.9, -1, 0.75],
            [0.99, 1, 0.8],
        ]) {
            const p = left[Math.round(t * 32)];
            const q = right[Math.round(t * 32)];
            const x = side > 0 ? p[0] : q[0];
            const y = side > 0 ? p[1] : q[1];
            ellipse(
                ctx,
                x + 14 * size * u,
                y + side * 16 * size * u,
                24 * size * u,
                11 * size * u,
                side * 0.7
            );
            ctx.fillStyle = side > 0 ? PALETTE.sage : PALETTE.sageDeep;
            ctx.fill();
        }
        grain(ctx, 0, 0, w, h, 0.22, this.scale);
        this.bg = layer;
    }

    //--------------------------------------------------------------------------
    // Turns

    // The first tune, and at Bloom the second bird's answer to it.
    opening() {
        const tune = this.tuneNotes();
        if (this.birds.length === 1) return [{ birds: [0], notes: tune }];
        return [
            { birds: [0], notes: tune },
            { birds: [1], notes: tune },
        ];
    }

    tuneNotes() {
        return this.tune.map((index, i) => ({ index, at: i * this.stage.step }));
    }

    // Queue what the birds sing next as one timeline; once it has played, it is his turn.
    perform(segments, leadIn) {
        const events = [];
        let at = leadIn;
        segments.forEach((segment, k) => {
            if (k > 0) at += PAUSE;
            for (const n of segment.notes) {
                events.push({
                    at: at + n.at,
                    birds: segment.birds,
                    index: n.index,
                    short: !!n.short,
                    glide: n.glide === undefined ? -1 : n.glide,
                });
            }
            at += segment.notes[segment.notes.length - 1].at;
        });
        this.timeline = { t: 0, next: 0, events, end: at + 0.42 };
        this.mode = 'birds';
        for (const flower of this.flowers) flower.open.target = CLOSED;
        for (const bird of this.birds) {
            bird.tilt.target = 0;
            bird.sleep.target = 0;
            bird.cup.target = 0;
        }
    }

    sing(event) {
        const flower = this.flowers[event.index];
        for (const b of event.birds) {
            const bird = this.birds[b];
            const params = { f: noteHz(flower.degree, bird.look.base) };
            if (event.short) params.variant = 'short';
            if (event.glide >= 0) params.from = noteHz(this.flowers[event.glide].degree, bird.look.base);
            audio.play('warble', params, {
                gain: event.birds.length > 1 ? 0.75 : 1,
                pan: (bird.x / this.w) * 2 - 1,
                wet: 0.3,
            });
            bird.beak = 1;
            bird.tilt.target = -0.12;
            bird.bob.kick(-1.2);
            this.lookAt(bird, flower.x, flower.y);
            const beak = this.beakOf(bird);
            this.fly(beak.x, beak.y, flower.x, flower.y + this.bellH * 0.5, flower.colour);
        }
        flower.lit = Math.max(flower.lit, 0.9);
    }

    // His turn: the flowers open with a ripple, and the birds cock their heads to listen.
    listen() {
        this.mode = 'turn';
        this.timeline = null;
        this.heard = [];
        this.quiet = 0;
        this.flowers.forEach((flower, i) => {
            flower.open.target = 1;
            flower.waveAt = this.time + 0.05 + i * 0.07;
        });
        for (const bird of this.birds) {
            bird.tilt.target = LISTEN;
            bird.cup.target = 1;
            bird.eye = { x: 0.3, y: 0.9 };
        }
    }

    // He has handed the bird its turn: the birds sing his notes back, then a new tune from where he
    // ended.
    answer() {
        const heard = this.heard;
        const grew = grown(this.streak, this.length, this.stage.most);
        this.streak = grew.streak;
        this.length = grew.length;
        this.tune = compose(heard[heard.length - 1].index, this.length, this.flowers.length);
        const back = echo(heard);
        let segments;
        if (this.birds.length === 1) {
            segments = [
                { birds: [0], notes: back },
                { birds: [0], notes: this.tuneNotes() },
            ];
        } else {
            this.lead = 1 - this.lead;
            segments = [
                { birds: [0, 1], notes: back },
                { birds: [this.lead], notes: this.tuneNotes() },
                { birds: [1 - this.lead], notes: this.tuneNotes() },
            ];
        }
        for (const bird of this.birds) bird.bob.kick(3);
        this.perform(segments, 0.35);
    }

    // Nothing played for a while: the tune again, and after that a rest.
    remind() {
        this.streak = 0;
        if (this.reminders >= REMINDERS) {
            this.rest();
            return;
        }
        this.reminders++;
        this.perform([{ birds: [this.lead], notes: this.tuneNotes() }], 0);
    }

    // He has played, and gone quiet without handing the bird its turn: it asks, with a chirp and a
    // hop, twice, and then rests, keeping what he played for when it is woken.
    nudge() {
        if (this.reminders >= REMINDERS) {
            this.rest();
            return;
        }
        this.reminders++;
        this.quiet = FINISHED;
        const bird = this.birds[this.lead];
        bird.bob.kick(4);
        bird.ruffle.kick(4);
        audio.play('chirp', { f: noteHz(2, 96) }, { gain: 0.6, pan: (bird.x / this.w) * 2 - 1, wet: 0.3 });
    }

    // He has played and paused: the bird asks for its turn.
    inviting() {
        return this.mode === 'turn' && this.heard.length > 0 && this.quiet >= FINISHED;
    }

    rest() {
        this.mode = 'rest';
        for (const bird of this.birds) {
            bird.sleep.target = 1;
            bird.tilt.target = 0;
            bird.cup.target = 0;
        }
    }

    wake() {
        this.reminders = 0;
        for (const bird of this.birds) bird.sleep.target = 0;
    }

    //--------------------------------------------------------------------------
    // Touch

    flowerAt(x, y) {
        if (y < this.hookY - this.bellW * 0.65 || y > this.ground + 30 * this.u) return null;
        for (const flower of this.flowers) if (Math.abs(x - flower.x) <= this.slot / 2) return flower;
        return null;
    }

    birdAt(x, y) {
        for (const bird of this.birds)
            if (dist(x, y, bird.x, bird.y - this.r * 0.3) < this.r * 1.7) return bird;
        return null;
    }

    ring(flower, way) {
        if (this.mode === 'rest') {
            this.wake();
            this.listen();
        }
        const counted = this.mode === 'turn';
        audio.play(
            'glock',
            { f: noteHz(flower.degree, 72) },
            { gain: counted ? 1 : 0.4, pan: (flower.x / this.w) * 2 - 1, wet: 0.3 }
        );
        flower.swing.kick(way * (counted ? 2.6 : 1.4));
        flower.lit = Math.max(flower.lit, counted ? 1 : 0.5);
        for (const bird of this.birds) this.lookAt(bird, flower.x, flower.y);
        if (!counted) return;
        this.heard.push({ index: flower.index, t: this.time });
        this.quiet = 0;
        this.lastNote = this.time;
        this.reminders = 0;
        const bird = this.birds[this.lead];
        this.fly(flower.x, flower.y + this.bellH * 0.3, bird.x, bird.y - this.r * 0.9, flower.colour);
        // He is playing now: the wing comes down, and the birds nod along.
        for (const b of this.birds) {
            b.cup.target = 0;
            b.bob.kick(1.2);
        }
    }

    // Once he has played, a tap on a bird hands the birds their turn, even after it has dozed off;
    // before, it sings its tune again. While they sing, it only ruffles its feathers.
    tapBird(bird) {
        bird.ruffle.kick(5);
        if (this.mode !== 'turn' && this.mode !== 'rest') return;
        const resting = this.mode === 'rest';
        this.wake();
        if (this.heard.length) this.answer();
        else
            this.perform(
                [{ birds: [this.birds.indexOf(bird)], notes: this.tuneNotes() }],
                resting ? 0.5 : 0.15
            );
    }

    down(p) {
        const flower = this.flowerAt(p.x, p.y);
        if (flower) {
            p.owner = { flower };
            this.holds.add(p);
            this.ring(flower, p.x < flower.x ? 1 : -1);
            return;
        }
        const bird = this.birdAt(p.x, p.y);
        if (bird) {
            this.tapBird(bird);
            return;
        }
        // Anywhere else, the birds look to see what that was.
        for (const b of this.birds) this.lookAt(b, p.x, p.y);
        p.owner = { flower: null };
        this.holds.add(p);
    }

    move(p) {
        const o = p.owner;
        if (!o) return;
        const flower = this.flowerAt(p.x, p.y);
        if (flower && flower !== o.flower) this.ring(flower, p.x > p.px ? -1 : 1);
        o.flower = flower;
    }

    up(p) {
        this.holds.delete(p);
    }

    //--------------------------------------------------------------------------
    // Time

    update(dt) {
        this.time += dt;
        let busy = this.mode !== 'rest';

        if (this.mode === 'birds') {
            const line = this.timeline;
            line.t += dt;
            while (line.next < line.events.length && line.events[line.next].at <= line.t) {
                this.sing(line.events[line.next]);
                line.next++;
            }
            if (line.t >= line.end) this.listen();
        } else if (this.mode === 'turn') {
            // A finger still on the flowers is still playing, for a while.
            const playing = this.holds.size > 0 && this.time - this.lastNote < 2.5;
            if (!playing) this.quiet += dt;
            if (this.quiet >= REMIND) {
                if (this.heard.length) this.nudge();
                else this.remind();
            }
            // Asking for its turn: each time round the ring, a hop, looking out at him.
            if (this.inviting()) {
                const round = Math.floor((this.quiet - FINISHED) / ASK_EVERY);
                if (round !== this.asked) {
                    this.asked = round;
                    const bird = this.birds[this.lead];
                    bird.bob.kick(2.5);
                    bird.eye = { x: 0.1, y: 0.3 };
                }
            } else this.asked = -1;
        }

        for (const flower of this.flowers) {
            if (flower.waveAt >= 0 && this.time >= flower.waveAt) {
                flower.waveAt = -1;
                flower.swing.kick(1.6);
            }
            if (flower.swing.update(dt)) busy = true;
            if (flower.open.update(dt)) busy = true;
            if (flower.lit > 0.003) {
                flower.lit *= Math.exp(-dt * 3);
                busy = true;
            } else flower.lit = 0;
        }
        for (const bird of this.birds) {
            for (const spring of [bird.tilt, bird.bob, bird.ruffle, bird.sleep, bird.cup])
                if (spring.update(dt)) busy = true;
            if (bird.beak > 0.003) {
                bird.beak *= Math.exp(-dt * 7);
                busy = true;
            } else bird.beak = 0;
            if (this.time > bird.blinkAt) bird.blinkAt = this.time + 2.5 + Math.random() * 3;
        }
        for (const note of this.notes) note.t += dt;
        this.notes = this.notes.filter((note) => note.t < note.life);
        if (this.notes.length) busy = true;
        return busy;
    }

    lookAt(bird, x, y) {
        const dx = (x - bird.x) * bird.facing;
        const dy = y - bird.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        bird.eye = { x: dx / len, y: dy / len };
    }

    // A note flying between a beak and a flower, in the flower's colour.
    fly(x0, y0, x1, y1, colour) {
        if (this.notes.length > 24) this.notes.shift();
        this.notes.push({ x0, y0, x1, y1, colour, t: 0, life: 0.5 });
    }

    beakOf(bird) {
        const r = this.r;
        return { x: bird.x + bird.facing * r * 1.05, y: bird.y - r * 0.85 };
    }

    //--------------------------------------------------------------------------
    // Drawing

    draw(ctx) {
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);
        for (const flower of this.flowers) this.drawFlower(ctx, flower);
        // Asking for its turn: rings spreading out from the bird, two at a time so one is always
        // there, stronger than the bud's, since here there is more to look at.
        if (this.inviting()) {
            const bird = this.birds[this.lead];
            const start = ((this.quiet - FINISHED) % ASK_EVERY) / ASK_EVERY;
            ctx.lineWidth = 5 * this.u;
            for (const phase of [start, (start + 0.5) % 1]) {
                const ring = this.r * (1.2 + phase * 1.1);
                ctx.strokeStyle = `rgba(221, 148, 140, ${0.7 * (1 - phase)})`;
                ellipse(ctx, bird.x, bird.y - this.r * 0.3, ring, ring * 0.92);
                ctx.stroke();
            }
        }
        for (const bird of this.birds) {
            ctx.save();
            ctx.translate(bird.x, bird.y + bird.bob.value * 40 * this.u);
            ctx.scale(bird.facing, 1);
            drawBird(ctx, bird.look, this.r, {
                tilt: bird.tilt.value,
                beak: bird.beak,
                squash: bird.ruffle.value * 0.3 + Math.sin(this.time * 2.2) * 0.015,
                sleep: bird.sleep.value,
                blink: bird.blinkAt - this.time < 0.12,
                eye: bird.eye,
                flap: clamp(-bird.bob.velocity * 0.15, -0.4, 0.6),
                cup: bird.cup.value,
            });
            ctx.restore();
        }
        for (const note of this.notes) this.drawNote(ctx, note);
    }

    drawFlower(ctx, flower) {
        const u = this.u;
        const bw = this.bellW;
        const bh = this.bellH;
        const open = flower.open.value;
        ctx.save();
        ctx.translate(flower.x, flower.y);
        ctx.rotate(flower.swing.value * 0.8);
        if (flower.lit > 0.01) {
            const glow = ctx.createRadialGradient(0, bh * 0.55, bw * 0.2, 0, bh * 0.55, bw * 0.85);
            glow.addColorStop(0, `rgba(255, 251, 236, ${flower.lit * 0.9})`);
            glow.addColorStop(1, 'rgba(255, 251, 236, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(-bw, -bh * 0.3, bw * 2, bh * 1.7);
        }
        // The clapper hangs below the mouth and lags the bell's swing.
        ctx.save();
        ctx.rotate(-flower.swing.value * 0.5);
        ctx.strokeStyle = shade(flower.colour, -0.25);
        ctx.lineWidth = Math.max(2, bw * 0.025);
        ctx.beginPath();
        ctx.moveTo(0, bh * 0.6);
        ctx.lineTo(0, bh * 1.04);
        ctx.stroke();
        disc(ctx, 0, bh * 1.06, bw * 0.075, PALETTE.butter);
        ctx.restore();
        bellPath(ctx, bw, bh, open);
        ctx.fillStyle = flower.colour;
        ctx.fill();
        if (open < 1) {
            ctx.globalAlpha = (1 - open) * 0.7;
            ctx.fillStyle = flower.pale;
            ctx.fill();
            ctx.globalAlpha = 1;
        }
        ellipse(ctx, -bw * 0.17, bh * 0.45, bw * 0.06, bh * 0.24, 0.12);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fill();
        // The green cap where the bell meets its stem.
        ellipse(ctx, 0, bh * 0.06, bw * 0.19, bh * 0.08);
        ctx.fillStyle = PALETTE.sageDeep;
        ctx.fill();
        disc(ctx, 0, -1 * u, Math.max(3, bw * 0.05), PALETTE.sageDeep);
        ctx.restore();
    }

    drawNote(ctx, note) {
        const u = this.u;
        const k = clamp(note.t / note.life, 0, 1);
        const e = 1 - (1 - k) * (1 - k);
        const cx = (note.x0 + note.x1) / 2;
        const cy = Math.min(note.y0, note.y1) - 60 * u;
        const x = (1 - e) * (1 - e) * note.x0 + 2 * (1 - e) * e * cx + e * e * note.x1;
        const y = (1 - e) * (1 - e) * note.y0 + 2 * (1 - e) * e * cy + e * e * note.y1;
        ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) / 0.25;
        ctx.strokeStyle = shade(note.colour, -0.3);
        ctx.lineWidth = 2.4 * u;
        ctx.beginPath();
        ctx.moveTo(x + 6 * u, y);
        ctx.lineTo(x + 6 * u, y - 20 * u);
        ctx.quadraticCurveTo(x + 13 * u, y - 16 * u, x + 15 * u, y - 10 * u);
        ctx.stroke();
        ellipse(ctx, x, y, 8 * u, 6.5 * u, -0.35);
        ctx.fillStyle = note.colour;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2 * u;
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    exit() {
        freeLayer(this.bg);
        this.bg = null;
    }
}

// A bell flower hanging from its hook at the origin, mouth down: `open` flares the rim's lobes.
function bellPath(ctx, bw, bh, open) {
    const rim = bw * 0.5 * (0.8 + 0.2 * open);
    const tip = bh * (0.97 - 0.08 * open);
    ctx.beginPath();
    ctx.moveTo(-bw * 0.17, bh * 0.05);
    ctx.bezierCurveTo(-bw * 0.36, bh * 0.1, -bw * 0.37, bh * 0.52, -bw * 0.38, bh * 0.7);
    ctx.quadraticCurveTo(-bw * 0.4, bh * 0.88, -rim, tip);
    const lobes = 5;
    for (let i = 0; i < lobes; i++) {
        const mid = -rim + (2 * rim * (i + 0.5)) / lobes;
        const end = -rim + (2 * rim * (i + 1)) / lobes;
        ctx.quadraticCurveTo(mid, bh * 1.07, end, i === lobes - 1 ? tip : bh * 0.99);
    }
    ctx.quadraticCurveTo(bw * 0.4, bh * 0.88, bw * 0.38, bh * 0.7);
    ctx.bezierCurveTo(bw * 0.37, bh * 0.52, bw * 0.36, bh * 0.1, bw * 0.17, bh * 0.05);
    ctx.closePath();
}

// A round little bird facing +x, its feet on y = r, body radius r. `pose`: tilt (head, radians),
// beak (0 shut to 1 open), squash, sleep (0 to 1), blink, eye (where it looks, a unit vector) and
// flap (the wing, -1 to 1). Shared with the shelf's icon.
export function drawBird(ctx, look, r, pose = {}) {
    const sleep = pose.sleep || 0;
    const squash = pose.squash || 0;
    ctx.lineCap = 'round';
    ctx.strokeStyle = PALETTE.woodEdge;
    ctx.lineWidth = r * 0.07;
    for (const x of [-0.12, 0.2]) {
        ctx.beginPath();
        ctx.moveTo(r * x, r * 0.62);
        ctx.lineTo(r * x, r * 0.98);
        ctx.moveTo(r * (x - 0.1), r * 0.98);
        ctx.lineTo(r * (x + 0.12), r * 0.98);
        ctx.stroke();
    }
    ctx.fillStyle = look.wing;
    for (const [a, l] of [
        [-0.3, 1],
        [-0.08, 1.12],
        [0.14, 0.94],
    ]) {
        ctx.save();
        ctx.translate(-r * 0.6, r * 0.1);
        ctx.rotate(Math.PI + a - 0.3);
        ellipse(ctx, r * 0.48 * l, 0, r * 0.5 * l, r * 0.15);
        ctx.fill();
        ctx.restore();
    }
    ctx.save();
    ctx.translate(0, r * 0.86);
    ctx.scale(1 + squash, 1 - squash);
    ctx.translate(0, -r * 0.86);
    ellipse(ctx, 0, 0, r, r * 0.86);
    ctx.fillStyle = look.body;
    ctx.fill();
    ellipse(ctx, r * 0.28, r * 0.24, r * 0.6, r * 0.55);
    ctx.fillStyle = look.belly;
    ctx.fill();
    const cup = clamp(pose.cup || 0, 0, 1);
    if (cup < 0.5) wing(ctx, look, r, cup, pose.flap || 0);

    // The head turns about the neck: cocked to listen, lifted to sing, tucked to sleep.
    ctx.save();
    ctx.translate(r * 0.36, -r * 0.42);
    ctx.rotate((pose.tilt || 0) * (1 - sleep) + sleep * 0.42);
    ctx.translate(-sleep * r * 0.12, sleep * r * 0.16);
    disc(ctx, r * 0.12, -r * 0.3, r * 0.56, look.body);
    disc(ctx, r * 0.34, -r * 0.12, r * 0.3, look.belly);
    const open = (pose.beak || 0) * (1 - sleep);
    ctx.fillStyle = BEAK;
    ctx.save();
    ctx.translate(r * 0.62, -r * 0.3);
    ctx.rotate(-open * 0.34);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.11);
    ctx.quadraticCurveTo(r * 0.22, -r * 0.08, r * 0.36, 0);
    ctx.lineTo(0, r * 0.01);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(r * 0.62, -r * 0.3);
    ctx.rotate(open * 0.34);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 0.3, r * 0.01);
    ctx.quadraticCurveTo(r * 0.14, r * 0.08, 0, r * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const ex = r * 0.36;
    const ey = -r * 0.42;
    if (sleep > 0.5 || pose.blink) {
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = r * 0.06;
        ctx.beginPath();
        ctx.arc(ex, ey - r * 0.03, r * 0.08, 0.2, Math.PI - 0.2);
        ctx.stroke();
    } else {
        const eye = pose.eye || { x: 0.4, y: 0.4 };
        disc(ctx, ex + eye.x * r * 0.035, ey + eye.y * r * 0.035, r * 0.095, PALETTE.ink);
        disc(
            ctx,
            ex + eye.x * r * 0.035 - r * 0.03,
            ey + eye.y * r * 0.035 - r * 0.035,
            r * 0.032,
            '#FFFFFF'
        );
    }
    ellipse(ctx, r * 0.26, -r * 0.17, r * 0.1, r * 0.06);
    ctx.fillStyle = 'rgba(232, 140, 130, 0.35)';
    ctx.fill();
    ctx.restore();
    if (cup >= 0.5) wing(ctx, look, r, cup, 0);
    ctx.restore();
}

// The wing, folded on the bird's side (`cup` 0) or raised with its tip at the side of the head
// (`cup` 1), and anywhere between.
function wing(ctx, look, r, cup, flap) {
    const k = cup * cup * (3 - 2 * cup);
    const mix = (a, b) => a + (b - a) * k;
    ctx.save();
    ctx.translate(mix(-r * 0.2, r * 0.2), mix(r * 0.08, -r * 0.5));
    ctx.rotate(mix(-0.28 - flap * 0.5, -1.0));
    ellipse(ctx, 0, 0, mix(r * 0.6, r * 0.42), mix(r * 0.38, r * 0.2));
    ctx.fillStyle = look.wing;
    ctx.fill();
    ctx.restore();
}

function icon(ctx, x, y, w, h, u) {
    // A branch, the robin on it, and three bells below.
    ctx.strokeStyle = PALETTE.woodEdge;
    ctx.lineCap = 'round';
    ctx.lineWidth = 7 * u;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + h * 0.44);
    ctx.quadraticCurveTo(x + w * 0.5, y + h * 0.5, x + w * 0.9, y + h * 0.36);
    ctx.stroke();
    const r = Math.min(w, h) * 0.13;
    ctx.save();
    ctx.translate(x + w * 0.42, y + h * 0.46 - r * 1.02);
    drawBird(ctx, BIRDS[0], r, { tilt: LISTEN, eye: { x: 0.3, y: 0.9 } });
    ctx.restore();
    const bw = w * 0.14;
    ['red', 'yellow', 'green'].forEach((name, i) => {
        const colour = COLOURS.find((c) => c.name === name).colour;
        ctx.save();
        ctx.translate(x + w * (0.3 + i * 0.2), y + h * 0.64);
        bellPath(ctx, bw, bw * 0.9, 1);
        ctx.fillStyle = colour;
        ctx.fill();
        ctx.restore();
    });
}

export const toy = {
    id: 'birdsong',
    title: 'Bird song',
    about: 'A bird sings a little tune and waits for an answer on the bell flowers, then sings it back.',
    stages: ['3 flowers, tunes of 2 notes', '5 flowers, tunes of 3', 'Two birds, tunes growing to 5'],
    isNew: true,
    mat: shade(PALETTE.sky, 0.4),
    icon,
    create: (app) => new BirdScene(app),
    sounds(level) {
        const stage = STAGES[level];
        const flowers = stage.flowers.map((name) => COLOURS.find((c) => c.name === name));
        const list = flowers.map((kind) => ['glock', { f: noteHz(kind.degree, 72) }]);
        list.push(['chirp', { f: noteHz(2, 96) }]);
        for (const look of BIRDS.slice(0, stage.birds)) {
            flowers.forEach((kind, i) => {
                const f = noteHz(kind.degree, look.base);
                list.push(['warble', { f }], ['warble', { f, variant: 'short' }]);
                for (const j of [i - 1, i + 1]) {
                    if (flowers[j])
                        list.push([
                            'warble',
                            { f, variant: 'short', from: noteHz(flowers[j].degree, look.base) },
                        ]);
                }
            });
        }
        return list;
    },
    // A hello from the branch; the first tune follows once the bird is in view.
    signature() {
        audio.note('warble', 3, 84, { gain: 0.5, delay: 0.05 });
    },
};
