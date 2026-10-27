// Bug Maker: build a bug from parts on a big leaf: a body, a head and legs, and from Sprout wings and
// spots. Each part brings a sound: more legs make a quicker step, wings buzz on a note, each spot
// ticks its colour's note. The bug sings the song its parts make, and carried up off the leaf, walks
// off into the meadow above, where all his bugs sing together, a choir of his own.
//
//   touch  - tap a part for its sound; tap the bug on the leaf and it sings; tap one of its spots for
//            that spot's note; tap a bug in the meadow and it sings alone.
//   move   - carry parts onto the leaf. A part of a kind already on the bug takes the place of the one
//            there, and each time the bug changes it sings what it has become. Carry the bug up into
//            the meadow once it has a body, a head and legs; without them it stays where it is, and
//            ripples ring the parts it is missing.
//   make   - a meadow of bugs he designed, a choir of his own.
//
// Edmark's Feathered Friends let children design their own bird; Mario Paint's composer gave a dog's
// woof and a cat's meow places on a staff. Watch for: does he make a second bug different from the
// first on purpose? Choosing to vary is creativity.
//
// Seed: three bodies, three heads and three sets of legs. Sprout: wings and spots, the spots in the
// playroom's colours and notes. Bloom: one note a spot, so a bug with four spots sings four notes:
// counting, heard, never asked.
//
// The rules, what each part brings to the song, are choir.js; the pictures bugart.js.

import { Scene } from '../stage.js';
import { PALETTE, makeLayer, freeLayer, grain, ellipse, woodPanel } from '../draw.js';
import { Spring, clamp, lerp, dist, shade, easeOutCubic, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import {
    BODIES,
    HEADS,
    LEGS,
    WINGS,
    SPOT_COLOURS,
    STAGES,
    BODY_NOTE,
    VOICE,
    WING_BUZZ,
    BEAT,
    BAR,
    BASE,
    stepsOf,
    ready,
    song,
} from './choir.js';
import {
    drawBug,
    stillLayer,
    drawBodyPart,
    drawHeadPart,
    drawLegsPart,
    drawWingsPart,
    drawSpotPot,
    drawSpot,
    drawMeadow,
    onBody,
    toBody,
} from './bugart.js';

// The most bugs the meadow holds; when another comes, the one that has been there longest flies off.
const MEADOW = 6;
// Untouched this long, the meadow rests: its bugs stop wandering.
const IDLE = 40;
// A song's sounds are sent a moment before they are due, the rest of the wait left to the audio
// clock, so a slow frame does not make a bug stumble.
const AHEAD = 0.06;
// How far a finger moves before a touch is a carry rather than a tap.
const CARRY = 14;
// How long a bug takes to walk from where it was let go to its place in the meadow; the choir begins
// once it is there.
const ARRIVE = 0.8;
// After a part goes on, how long before the bug sings what it has become: long enough to hear the
// part's own sound first.
const RESING = 0.35;

function fresh() {
    return { body: null, head: null, legs: null, wings: null, spots: [] };
}

// How many steps a second a bug's legs take, walking or singing.
function stepRate(bug) {
    return bug.legs ? stepsOf(bug.legs) / (BAR * BEAT) : 0;
}

class BugsScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.stage = STAGES[this.level];
        this.time = 0;
        this.touched = 0;
        this.bug = fresh();
        this.meadow = [];
        this.songs = [];
        this.preview = null;
        this.held = null;
        this.lit = null;
        this.hint = null;
        this.bounce = new Spring(0, 260, 12);
        this.bg = null;
    }

    //--------------------------------------------------------------------------
    // The meadow and the table

    layout() {
        const { w, h, u } = this;
        const portrait = h > w;
        this.ground = h * (portrait ? 0.42 : 0.5);
        this.leaf = portrait
            ? { x: w * 0.5, y: h * 0.69, rx: w * 0.2, ry: h * 0.15 }
            : { x: w * 0.5, y: h * 0.77, rx: w * 0.16, ry: h * 0.17 };
        this.k = Math.min(this.leaf.rx * 0.75, 150 * u);
        this.mk = (portrait ? 50 : 56) * u;
        // The trays: bodies and heads on the left, legs and wings on the right, a part to a place.
        const rows = portrait ? [0.56, 0.69, 0.82] : [0.62, 0.76, 0.9];
        const cols = [0.08, 0.2, 0.8, 0.92];
        this.cell = Math.min(w * 0.11, h * 0.12);
        this.trays = [];
        const add = (kind, values, col) =>
            values.forEach((value, i) => this.trays.push({ kind, value, x: w * cols[col], y: h * rows[i] }));
        add('body', BODIES, 0);
        add('head', HEADS, 1);
        add('legs', LEGS, 2);
        if (this.stage.wings) add('wings', WINGS, 3);
        this.pots = [];
        this.potR = Math.min(this.cell * 0.36, 32 * u);
        if (this.stage.spots) {
            const y = portrait ? h * 0.92 : h * 0.565;
            SPOT_COLOURS.forEach((c, i) => {
                this.pots.push({ colour: c.colour, degree: c.degree, x: lerp(w * 0.36, w * 0.64, i / 4), y });
            });
        }
        for (const b of this.meadow) {
            b.y = this.laneY(b.lane);
            freeLayer(b.layer);
            b.layer = null;
        }
        freeLayer(this.bg);
        this.bg = this.drawTable();
    }

    laneY(lane) {
        return this.ground * (0.74 + lane * 0.08);
    }

    drawTable() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        drawMeadow(ctx, w, h, u, this.ground);
        woodPanel(
            ctx,
            -10 * u,
            this.ground,
            w + 20 * u,
            h - this.ground + 10 * u,
            0,
            PALETTE.wood,
            14,
            this.scale
        );
        ctx.fillStyle = 'rgba(112, 84, 58, 0.12)';
        ctx.fillRect(0, this.ground, w, 8 * u);
        // The leaf the bug is built on.
        const l = this.leaf;
        ctx.save();
        ctx.translate(l.x, l.y);
        const outline = () => {
            ctx.beginPath();
            ctx.moveTo(-l.rx * 1.15, 0);
            ctx.quadraticCurveTo(0, -l.ry * 1.5, l.rx * 1.15, 0);
            ctx.quadraticCurveTo(0, l.ry * 1.5, -l.rx * 1.15, 0);
            ctx.closePath();
        };
        ctx.translate(4 * u, 8 * u);
        outline();
        ctx.fillStyle = 'rgba(92, 70, 58, 0.12)';
        ctx.fill();
        ctx.translate(-4 * u, -8 * u);
        outline();
        ctx.fillStyle = '#A8CC8F';
        ctx.fill();
        ctx.strokeStyle = '#93BA7E';
        ctx.lineWidth = 4 * u;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-l.rx * 1.1, 0);
        ctx.lineTo(l.rx * 1.1, 0);
        for (const k of [-0.6, -0.2, 0.2, 0.6]) {
            ctx.moveTo(k * l.rx, 0);
            ctx.lineTo(k * l.rx + l.rx * 0.25, -l.ry * 0.55);
            ctx.moveTo(k * l.rx, 0);
            ctx.lineTo(k * l.rx + l.rx * 0.25, l.ry * 0.55);
        }
        ctx.stroke();
        ctx.restore();
        // A little bed of moss under each part.
        for (const tray of this.trays) {
            ellipse(ctx, tray.x, tray.y + this.cell * 0.32, this.cell * 0.46, this.cell * 0.14);
            ctx.fillStyle = 'rgba(152, 185, 133, 0.5)';
            ctx.fill();
        }
        grain(ctx, 0, this.ground, w, h - this.ground, 0.16, this.scale);
        // The parts and the pots never run out, and never move, so they are drawn here, once.
        for (const tray of this.trays)
            this.drawPart(ctx, tray.kind, tray.value, tray.x, tray.y, this.cell * 0.85);
        for (const pot of this.pots) drawSpotPot(ctx, pot.colour, pot.x, pot.y, this.potR);
        return layer;
    }

    //--------------------------------------------------------------------------
    // Sounds

    pan(x) {
        return clamp((x / this.w) * 2 - 1, -1, 1) * 0.7;
    }

    // A note in a head's voice; a bug with no head yet sings in the round head's.
    voice(head, degree, x, gain, delay = 0) {
        const name = VOICE[head] || VOICE.round;
        audio.play(name, { f: noteHz(degree, BASE) }, { gain, pan: this.pan(x), wet: 0.25, delay });
    }

    // What a part sounds like on its own.
    partSound(kind, value, x, delay = 0) {
        const pan = this.pan(x);
        if (kind === 'body')
            audio.play('wood', { f: noteHz(BODY_NOTE[value], 60) }, { gain: 0.55, pan, delay });
        else if (kind === 'head') this.voice(value, 2, x, 0.55, delay);
        else if (kind === 'legs') {
            // Half a bar of its steps: two pairs of legs walk, four scurry.
            const steps = stepsOf(value) / 2;
            for (let i = 0; i < steps; i++)
                audio.play('pat', {}, { gain: 0.4, pan, delay: delay + (i * 2 * BEAT) / steps });
        } else if (kind === 'wings') {
            const params = { f: noteHz(BODY_NOTE.round, BASE - 12), wings: WING_BUZZ[value] };
            audio.play('buzz', params, { gain: 0.5, pan, delay });
        }
    }

    // A bug sings: its song, round after round, each sound sent as its time comes. `where` says where
    // it is now, for its place between the speakers.
    perform(bug, where, opts = {}) {
        const tune = song(bug, this.level);
        const sung = {
            bug,
            where,
            tune,
            t: -(opts.delay || 0),
            times: opts.times || 1,
            gain: opts.gain === undefined ? 1 : opts.gain,
            steps: opts.steps !== false,
            next: 0,
        };
        sung.length = sung.times * tune.beats * BEAT;
        this.songs.push(sung);
        return sung;
    }

    hush(sung) {
        const i = this.songs.indexOf(sung);
        if (i >= 0) this.songs.splice(i, 1);
    }

    playSongs(dt) {
        for (const sung of this.songs) {
            sung.t += dt;
            const events = sung.tune.events;
            const total = events.length * sung.times;
            while (sung.next < total) {
                const event = events[sung.next % events.length];
                const lap = Math.floor(sung.next / events.length);
                const at = (lap * sung.tune.beats + event.at) * BEAT;
                if (at > sung.t + AHEAD) break;
                sung.next++;
                this.sound(sung, event, Math.max(0, at - sung.t));
            }
        }
        this.songs = this.songs.filter((sung) => sung.t < sung.length + 0.3);
    }

    sound(sung, event, delay) {
        const bug = sung.bug;
        const x = sung.where();
        const pan = this.pan(x);
        const gain = sung.gain;
        if (event.kind === 'step') {
            if (sung.steps) audio.play('tick', { f: 1300 }, { gain: 0.16 * gain, pan, delay });
        } else if (event.kind === 'note' || event.sung)
            this.voice(bug.head, event.degree, x, 0.5 * gain, delay);
        else if (event.kind === 'buzz') {
            const params = { f: noteHz(event.degree, BASE - 12), wings: WING_BUZZ[event.wings] };
            audio.play('buzz', params, { gain: 0.32 * gain, pan, delay });
        } else audio.play('tick', { f: noteHz(event.degree, 96) }, { gain: 0.4 * gain, pan, delay });
    }

    // The bug on the leaf sings what it is now.
    singLeaf(delay = 0) {
        this.hush(this.preview);
        this.preview = this.perform(this.bug, () => this.leaf.x, { delay });
    }

    //--------------------------------------------------------------------------
    // Time

    update(dt) {
        this.time += dt;
        let busy = false;
        const resting = this.time - this.touched > IDLE;
        if (this.bounce.update(dt)) busy = true;
        if (this.held) busy = true;
        if (this.songs.length) {
            this.playSongs(dt);
            busy = true;
        }
        if (this.preview && this.songs.indexOf(this.preview) < 0) this.preview = null;
        if (this.lit) {
            busy = true;
            if (this.time > this.lit.until) this.lit = null;
        }
        if (this.hint) {
            this.hint.t += dt;
            busy = true;
            if (this.hint.t > 1.2) this.hint = null;
        }

        for (const b of this.meadow) {
            if (b.song && this.songs.indexOf(b.song) < 0) b.song = null;
            if (b.hop.update(dt)) busy = true;
            if (b.arrive < 1) {
                b.arrive = Math.min(1, b.arrive + dt / ARRIVE);
                busy = true;
                continue;
            }
            if (b.leaving) {
                b.t += dt;
                b.x += b.dir * 150 * this.u * dt;
                busy = true;
                continue;
            }
            // Singing, a bug stands and steps in time; otherwise it wanders the meadow, quicker the
            // more legs it has, turning at the meadow's edges, until the meadow rests.
            if (b.song || resting) continue;
            b.t += dt;
            b.x += b.dir * stepRate(b.bug) * 0.14 * this.mk * dt;
            if (b.x < this.w * 0.06) b.dir = 1;
            if (b.x > this.w * 0.94) b.dir = -1;
            busy = true;
        }
        const margin = this.mk * 2;
        this.meadow = this.meadow.filter((b) => {
            const gone = b.leaving && (b.x < -margin || b.x > this.w + margin);
            if (gone) freeLayer(b.layer);
            return !gone;
        });
        return busy;
    }

    //--------------------------------------------------------------------------
    // Touch

    trayAt(x, y) {
        const r = this.cell * 0.5;
        return this.trays.find((t) => Math.abs(x - t.x) < r && Math.abs(y - t.y) < r) || null;
    }

    potAt(x, y) {
        const r = Math.min(this.cell * 0.4, 36 * this.u);
        return this.pots.find((p) => dist(x, y, p.x, p.y) < r) || null;
    }

    onLeafBug(x, y) {
        const b = this.bug;
        if (!b.body && !b.head && !b.legs && !b.wings) return false;
        return Math.abs(x - this.leaf.x) < this.k * 0.9 && Math.abs(y - this.leaf.y) < this.k * 0.7;
    }

    meadowBugAt(x, y) {
        for (let i = this.meadow.length - 1; i >= 0; i--) {
            const b = this.meadow[i];
            if (b.leaving || b.arrive < 1) continue;
            if (Math.abs(x - b.x) < this.mk * 0.8 && Math.abs(y - (b.y - this.mk * 0.1)) < this.mk * 0.6)
                return b;
        }
        return null;
    }

    down(p) {
        this.touched = this.time;
        // A second finger can still sound a part or a bug, but only one thing is carried at a time.
        const free = !this.held;
        const tray = this.trayAt(p.x, p.y);
        if (tray) {
            this.partSound(tray.kind, tray.value, tray.x);
            if (free) this.held = { kind: tray.kind, value: tray.value, p, x: p.x, y: p.y };
            return;
        }
        const pot = this.potAt(p.x, p.y);
        if (pot) {
            audio.play('tick', { f: noteHz(pot.degree, 96) }, { gain: 0.45, pan: this.pan(pot.x) });
            if (free) this.held = { kind: 'spot', colour: pot.colour, degree: pot.degree, p, x: p.x, y: p.y };
            return;
        }
        if (free && this.onLeafBug(p.x, p.y)) {
            // A spot sings its own note; the rest of the bug sings its song on letting go, unless it
            // is carried.
            const at = toBody(p.x, p.y, this.leaf.x, this.leaf.y, this.k);
            const spot = this.bug.spots.findIndex((s) => dist(at.x, at.y, s.x, s.y) < 0.14);
            if (spot >= 0) {
                const s = this.bug.spots[spot];
                audio.play('glock', { f: noteHz(s.degree, 84) }, { gain: 0.5, pan: this.pan(p.x) });
                this.lit = { index: spot, until: this.time + 0.45 };
            }
            this.held = { bug: true, p, x: p.x, y: p.y, spot, carried: false, nudged: false };
            return;
        }
        const b = this.meadowBugAt(p.x, p.y);
        if (b) this.tapMeadowBug(b);
    }

    move(p) {
        const held = this.held;
        if (!held || held.p !== p) return;
        held.x = p.x;
        held.y = p.y;
        if (!held.bug || held.carried || held.nudged) return;
        if (dist(p.x, p.y, p.x0, p.y0) < CARRY * this.u) return;
        if (ready(this.bug)) {
            held.carried = true;
            this.hush(this.preview);
            this.preview = null;
            audio.play('whoosh', { variant: 'up' }, { gain: 0.25, pan: this.pan(p.x) });
        } else {
            // Not finished: it stays on its leaf, and ripples ring the parts it is missing.
            held.nudged = true;
            this.bounce.kick(-5);
            audio.play('rustle', {}, { gain: 0.3, pan: this.pan(this.leaf.x) });
            this.hint = { kinds: ['body', 'head', 'legs'].filter((kind) => !this.bug[kind]), t: 0 };
        }
    }

    up(p) {
        const held = this.held;
        if (!held || held.p !== p) return;
        this.held = null;
        const moved = dist(p.x, p.y, p.x0, p.y0) >= CARRY * this.u;
        if (held.bug) {
            if (held.carried) {
                if (p.y < this.ground) this.release(p.x, p.y);
                else {
                    // Let go short of the meadow, it settles back on its leaf.
                    this.bounce.kick(-5);
                    audio.play('pop', { f: 520 }, { gain: 0.35, pan: this.pan(this.leaf.x) });
                }
            } else if (!moved && held.spot < 0) this.singLeaf();
            return;
        }
        if (!moved) return;
        if (held.kind === 'spot') this.addSpot(held, p.x, p.y);
        else this.addPart(held, p.x, p.y);
    }

    cancel(p) {
        if (this.held && this.held.p === p) this.held = null;
    }

    // A part let go of over the leaf goes on the bug, in place of one of its kind.
    addPart(held, x, y) {
        const l = this.leaf;
        const dx = (x - l.x) / (l.rx * 1.25);
        const dy = (y - l.y) / (l.ry * 1.4);
        if (dx * dx + dy * dy > 1) return;
        this.bug[held.kind] = held.value;
        if (held.kind === 'body') this.bug.spots = this.bug.spots.filter((s) => onBody(held.value, s.x, s.y));
        this.bounce.kick(-6);
        audio.play('pop', { f: 520 }, { gain: 0.45, pan: this.pan(l.x) });
        this.partSound(held.kind, held.value, l.x, 0.06);
        this.singLeaf(RESING);
    }

    // A spot let go of on the bug's body stays where it was put; a full back makes room, the spot
    // nearest giving up its place.
    addSpot(held, x, y) {
        const bug = this.bug;
        if (!bug.body) return;
        const at = toBody(x, y, this.leaf.x, this.leaf.y, this.k);
        if (!onBody(bug.body, at.x, at.y)) return;
        if (bug.spots.length >= this.stage.spots) {
            let nearest = 0;
            bug.spots.forEach((s, i) => {
                const n = bug.spots[nearest];
                if (dist(s.x, s.y, at.x, at.y) < dist(n.x, n.y, at.x, at.y)) nearest = i;
            });
            bug.spots.splice(nearest, 1);
        }
        bug.spots.push({ x: at.x, y: at.y, colour: held.colour, degree: held.degree });
        this.bounce.kick(-4);
        audio.play('glock', { f: noteHz(held.degree, 84) }, { gain: 0.5, pan: this.pan(x) });
        this.lit = { index: bug.spots.length - 1, until: this.time + 0.45 };
        this.singLeaf(RESING);
    }

    // Up into the meadow it walks, to a place of its own, and all his bugs sing together.
    release(x, y) {
        const bug = this.bug;
        this.bug = fresh();
        this.hush(this.preview);
        this.preview = null;
        const staying = this.meadow.filter((b) => !b.leaving);
        if (staying.length >= MEADOW) {
            const oldest = staying[0];
            oldest.leaving = true;
            oldest.dir = oldest.x < this.w / 2 ? -1 : 1;
            this.hush(oldest.song);
            oldest.song = null;
            audio.play('flutter', { beats: 4, gap: 0.07 }, { gain: 0.3, pan: this.pan(oldest.x) });
        }
        const lane = this.freeLane();
        const b = {
            bug,
            x: clamp(x, this.w * 0.1, this.w * 0.9),
            y: this.laneY(lane),
            lane,
            from: { x, y, k: this.k },
            dir: x < this.w / 2 ? 1 : -1,
            t: 0,
            arrive: 0,
            song: null,
            leaving: false,
            hop: new Spring(0, 300, 14),
            layer: null,
        };
        this.meadow.push(b);
        audio.play('whoosh', { variant: 'up' }, { gain: 0.3, pan: this.pan(x) });
        this.choir(b);
    }

    // The lane with the fewest bugs in it.
    freeLane() {
        const counts = [0, 0, 0];
        for (const b of this.meadow) if (!b.leaving) counts[b.lane]++;
        let best = 0;
        for (let lane = 1; lane < counts.length; lane++) if (counts[lane] < counts[best]) best = lane;
        return best;
    }

    // Every bug in the meadow sings, twice round the longest song, each as many times round its own
    // as fits; the newest's steps lead.
    choir(newest) {
        const singers = this.meadow.filter((b) => !b.leaving);
        let longest = 0;
        for (const b of singers) longest = Math.max(longest, song(b.bug, this.level).beats);
        for (const b of singers) {
            this.hush(b.song);
            const own = song(b.bug, this.level).beats;
            b.song = this.perform(b.bug, () => b.x, {
                delay: ARRIVE + 0.2,
                times: Math.max(1, Math.floor((longest * 2) / own)),
                gain: singers.length > 3 ? 0.6 : 0.75,
                steps: b === newest,
            });
        }
    }

    tapMeadowBug(b) {
        b.hop.kick(-5);
        if (b.song) {
            // Singing already: it sings out its own note, and carries on.
            this.voice(b.bug.head, BODY_NOTE[b.bug.body], b.x, 0.55);
            return;
        }
        b.song = this.perform(b.bug, () => b.x);
    }

    //--------------------------------------------------------------------------
    // Drawing

    draw(ctx) {
        const { u } = this;
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);
        // The meadow's bugs, the farther behind.
        const order = this.meadow.slice().sort((a, b) => a.y - b.y);
        for (const b of order) {
            const e = easeOutCubic(b.arrive);
            const k = lerp(b.from.k, this.mk, e);
            const x = lerp(b.from.x, b.x, e);
            const y = lerp(b.from.y, b.y, e) + b.hop.value * 40 * u;
            if (b.arrive >= 1) {
                ellipse(ctx, b.x, b.y + k * 0.56, k * 0.5, k * 0.08);
                ctx.fillStyle = 'rgba(92, 70, 58, 0.14)';
                ctx.fill();
            }
            const look = this.lookOf(b.bug, b.song, b.t, b.arrive >= 1 && !b.song);
            if (b.leaving) look.walk = 1;
            if (b.arrive >= 1 && !b.layer) b.layer = stillLayer(b.bug, this.mk, this.scale);
            drawBug(ctx, b.bug, x, y, k, look, b.dir, b.arrive >= 1 ? b.layer : null);
        }
        // Round each part on the bug, a ring; round each it is missing, a moment's ripples.
        for (const tray of this.trays) this.drawTray(ctx, tray);
        // The bug on the leaf, or in his hand.
        const held = this.held;
        const carried = held && held.bug && held.carried;
        const k = this.k * (1 - this.bounce.value * 0.03);
        const bx = carried ? this.leaf.x + held.x - held.p.x0 : this.leaf.x;
        const by = carried ? this.leaf.y + held.y - held.p.y0 : this.leaf.y;
        const look = this.lookOf(this.bug, this.preview, this.time, !!carried);
        if (this.lit && look.lit === undefined) look.lit = this.lit.index;
        drawBug(ctx, this.bug, bx, by, k, look);
        // What is in his hand.
        if (held && !held.bug) {
            if (held.kind === 'spot') drawSpot(ctx, held.colour, held.x, held.y - 12 * u, 0.13 * this.k);
            else this.drawPart(ctx, held.kind, held.value, held.x, held.y - 12 * u, this.cell * 0.95);
        }
    }

    // How a bug moves: walking, its legs step at its own pace; singing, they keep time with its song,
    // its wings buzz, its head bobs and the spot singing now is lit.
    lookOf(bug, sung, t, walking) {
        const rate = stepRate(bug);
        const look = { t: this.time, walk: walking ? 1 : 0, step: t * rate, sing: 0, lit: undefined };
        if (!sung || sung.t < 0) return look;
        look.sing = 1;
        look.walk = 0.7;
        look.step = sung.t * rate;
        const at = (sung.t / BEAT) % sung.tune.beats;
        for (const event of sung.tune.events) {
            if (event.kind !== 'spot') continue;
            if (at >= event.at && at < event.at + (event.sung ? 0.9 : 0.4)) look.lit = event.spot;
        }
        return look;
    }

    drawTray(ctx, tray) {
        const { u } = this;
        const r = this.cell * 0.5;
        if (this.bug[tray.kind] === tray.value) {
            ctx.beginPath();
            ctx.arc(tray.x, tray.y, r, 0, TAU);
            ctx.strokeStyle = 'rgba(255, 250, 236, 0.85)';
            ctx.lineWidth = 4 * u;
            ctx.stroke();
        }
        const hint = this.hint;
        if (hint && hint.kinds.indexOf(tray.kind) >= 0) {
            for (const at of [0, 0.4]) {
                const t = (hint.t - at) / 0.8;
                if (t < 0 || t > 1) continue;
                ctx.beginPath();
                ctx.arc(tray.x, tray.y, r * (0.7 + 0.5 * t), 0, TAU);
                ctx.strokeStyle = `rgba(255, 246, 214, ${(0.9 * (1 - t)).toFixed(3)})`;
                ctx.lineWidth = 5 * u;
                ctx.stroke();
            }
        }
    }

    drawPart(ctx, kind, value, x, y, k) {
        if (kind === 'body') drawBodyPart(ctx, value, x, y, k * 0.85);
        else if (kind === 'head') drawHeadPart(ctx, value, x, y + k * 0.12, k * 0.6);
        else if (kind === 'legs') drawLegsPart(ctx, value, x, y - k * 0.12, k * 0.85);
        else if (kind === 'wings') drawWingsPart(ctx, value, x, y, k * 0.8);
    }

    exit() {
        this.songs = [];
        for (const b of this.meadow) freeLayer(b.layer);
        freeLayer(this.bg);
        this.bg = null;
        this.invalidate();
    }
}

function icon(ctx, x, y, w, h) {
    // A spotted bug with wings on a leaf.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#E6F2F0';
    ctx.fillRect(x, y, w, h);
    ellipse(ctx, x + w / 2, y + h * 0.74, w * 0.44, h * 0.16);
    ctx.fillStyle = '#A8CC8F';
    ctx.fill();
    ctx.restore();
    const bug = {
        body: 'round',
        head: 'eyes',
        legs: 3,
        wings: 'round',
        spots: [
            { x: -0.22, y: -0.12, colour: SPOT_COLOURS[1].colour },
            { x: 0.08, y: 0.1, colour: SPOT_COLOURS[3].colour },
            { x: -0.16, y: 0.18, colour: SPOT_COLOURS[4].colour },
        ],
    };
    drawBug(ctx, bug, x + w * 0.42, y + h * 0.54, Math.min(w * 0.62, h * 0.7), { t: 0 });
}

export const toy = {
    id: 'bugs',
    title: 'Bug maker',
    about: 'Build a bug on a leaf from parts: a body, a head and legs, and at Sprout wings and spots. Each part brings a sound: more legs a quicker step, wings a buzz, each spot its colour’s note, and the bug sings the song its parts make. Carried up into the meadow, it walks off to join the others, and they all sing together. At Bloom each spot is a note of its tune: four spots, four notes.',
    stages: [
        'Three bodies, three heads and three sets of legs',
        'And wings, and spots in the five colours, each with its note',
        'And one note a spot: a bug with four spots sings four notes',
    ],
    isNew: true,
    mat: shade(PALETTE.sage, 0.35),
    icon,
    create: (app) => new BugsScene(app),
    sounds(level) {
        const stage = STAGES[level];
        const list = [
            ['pat', {}],
            ['pop', { f: 520 }],
            ['rustle', {}],
            ['tick', { f: 1300 }],
            ['whoosh', { variant: 'up' }],
            ['flutter', { beats: 4, gap: 0.07 }],
        ];
        for (const body of BODIES) list.push(['wood', { f: noteHz(BODY_NOTE[body], 60) }]);
        // The voices sing the bodies' notes, a head's own note, and at Bloom the spots' notes.
        const degrees = [2];
        for (const body of BODIES) degrees.push(BODY_NOTE[body]);
        if (stage.counting) for (const c of SPOT_COLOURS) degrees.push(c.degree);
        for (const head of HEADS)
            for (const degree of degrees.filter((d, i) => degrees.indexOf(d) === i))
                list.push([VOICE[head], { f: noteHz(degree, BASE) }]);
        if (stage.wings)
            for (const wings of WINGS)
                for (const body of BODIES)
                    list.push(['buzz', { f: noteHz(BODY_NOTE[body], BASE - 12), wings: WING_BUZZ[wings] }]);
        if (stage.spots)
            for (const c of SPOT_COLOURS)
                list.push(['tick', { f: noteHz(c.degree, 96) }], ['glock', { f: noteHz(c.degree, 84) }]);
        return list;
    },
    signature() {
        audio.play('pat', {}, { gain: 0.4, delay: 0.05 });
        audio.note('glock', 2, 84, { gain: 0.4, delay: 0.2 });
    },
};
