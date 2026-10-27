// Torch in the Dark: the garden at night. His finger is a torch's beam, and where it rests things
// wake, gently: an owl on its branch opens its eyes and hoots, a hedgehog uncurls and sniffs, a snail
// pulls its eyes in and slowly puts them out again, a frog sings, a mouse peeks out, a cricket
// chirps. Each one woken lights a lantern on the string across the sky, and once every lantern is
// lit, they all sing a night song together, and go back to sleep for the next night. Nothing jumps
// out. The dark is friendly: shapes can still be made out in it, and the eyes of anything awake catch
// the light.
//
//   touch  - tap the torch to click it on and off. Touch the garden and the beam goes there.
//   move   - sweep the beam slowly: a creature wakes only when the light rests on it. Let go, and the
//            beam stays where it was, so it can rest on something by itself. Moths come to a beam
//            left still.
//   make   - the longer he looks, the more lanterns glow and creatures wake, until they sing.
//
// Edmark's hardest Oranga Banga game is played in the dark, by ear; Humongous hid its surprises in
// new places each time (Putt-Putt); Mister Rogers made fears mentionable. Watch for: does he move the
// light slowly to find things? Slow searching is focus.
//
// Seed: a wide beam, and four creatures who sleep in the same places every night. Sprout: a
// narrower beam, six creatures, and new hiding places each night. Bloom: the moon rises slowly and
// lights the garden as it climbs, and the fireflies blink a rhythm for him to blink back with the
// torch.
//
// The rules, who hides where and how the light wakes them, are hiding.js; the pictures torchart.js.

import { Scene } from '../stage.js';
import { PALETTE, makeLayer, freeLayer, ellipse } from '../draw.js';
import { Spring, clamp, lerp, dist, rng, shade, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { COLOURS as NOTE_COLOURS } from './cubes.js';
import {
    STAGES,
    SPOTS,
    hide,
    rest,
    SLOW,
    SONG,
    SONG_BEAT,
    VOICE_AT,
    call,
    echo,
    grown,
    FIRST,
} from './hiding.js';
import {
    LIT,
    DARK,
    drawGarden,
    drawCreature,
    GLINTS,
    drawLantern,
    drawFirefly,
    drawMoth,
    drawMoon,
    drawTorch,
} from './torchart.js';

// Untouched this long, the garden rests: the fireflies settle and nothing moves.
const IDLE = 40;
// A creature already awake does its thing again when the light rests on it this long, but not more
// often than once in COOLDOWN seconds.
const AGAIN = 0.35;
const COOLDOWN = 2.5;
// How long the moon takes to rise, at Bloom.
const MOONRISE = 150;
// The lanterns' colours: the playroom's five, and a sixth.
const LANTERNS = NOTE_COLOURS.map((c) => c.colour).concat(['#F2BAC3']);

// Each creature's voice when it wakes or is found again: soft, and with the night's echo.
function voice(who, pan, gain = 1) {
    const opts = (g, delay = 0) => ({ gain: g * gain, pan, wet: 0.45, delay });
    switch (who) {
        case 'owl':
            audio.play('hoot', { f: noteHz(2, 60) }, opts(0.5));
            break;
        case 'hedgehog':
            audio.play('rustle', {}, opts(0.25));
            for (let i = 0; i < 3; i++) audio.play('pop', { f: 1100 }, opts(0.18, 0.3 + i * 0.12));
            break;
        case 'snail':
            audio.play('gulp', { f: 260 }, opts(0.45));
            break;
        case 'frog':
            audio.play('ribbit', {}, opts(0.5));
            break;
        case 'mouse':
            audio.play('chirp', { f: noteHz(4, 96), variant: 'peep' }, opts(0.35));
            audio.play('chirp', { f: noteHz(4, 96), variant: 'peep' }, opts(0.3, 0.22));
            break;
        case 'cricket':
            for (let i = 0; i < 6; i++) audio.play('tick', { f: noteHz(5, 96) }, opts(0.3, i * 0.06));
            break;
    }
}

class TorchScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.stage = STAGES[this.level];
        this.next = rng(Math.floor(Math.random() * 1e9));
        this.time = 0;
        this.touched = 0;
        this.places = hide(this.level, null, this.next);
        this.creatures = this.stage.creatures.map((who, i) => ({
            who,
            index: i,
            lit: 0,
            awake: new Spring(0, 14, 7),
            act: 0,
            eyes: new Spring(1, 40, 9),
            state: 'asleep',
            rested: 0,
            last: -10,
        }));
        this.lanterns = this.creatures.map((c, i) => ({ colour: LANTERNS[i], glow: new Spring(0, 30, 9) }));
        this.beam = { x: 0, y: 0, on: false, held: null, glow: new Spring(0, 160, 18), speed: 0, still: 0 };
        this.torchPress = new Spring(0, 400, 16);
        this.song = null;
        this.fireflies = [];
        this.moths = [];
        this.moon = 0;
        // At Bloom: the fireflies' rhythm, and what he blinks back.
        this.flies = this.stage.answer
            ? { state: 'rest', t: 2, length: FIRST, streak: 0, times: [], i: 0, clicks: [] }
            : null;
        this.lit = null;
        this.dark = null;
    }

    //--------------------------------------------------------------------------
    // The garden

    layout() {
        const { w, h, u } = this;
        this.k = (this.level === 0 ? 72 : 62) * u;
        this.r = this.stage.beam * u;
        for (const c of this.creatures) this.place(c);
        if (!this.beam.placed) {
            this.beam.placed = true;
            this.beam.x = w * 0.5;
            this.beam.y = h * 0.62;
        }
        this.torchAt = { x: w - 78 * u, y: h - 58 * u, k: 120 * u };
        this.string = { x0: w * 0.42, y0: h * 0.05, x1: w * 0.98, y1: h * 0.07, sag: h * 0.06 };
        if (!this.fireflies.length) {
            const n = this.stage.answer ? 5 : 6;
            for (let i = 0; i < n; i++)
                this.fireflies.push({
                    x: w * (0.15 + this.next() * 0.7),
                    y: h * (0.55 + this.next() * 0.35),
                    a: this.next() * TAU,
                    phase: this.next() * 4,
                    on: 0,
                });
        }
        freeLayer(this.lit);
        freeLayer(this.dark);
        this.lit = makeLayer(w, h, this.scale);
        drawGarden(this.lit.ctx, w, h, u, LIT, false);
        this.dark = makeLayer(w, h, this.scale);
        drawGarden(this.dark.ctx, w, h, u, DARK, true);
    }

    place(c) {
        const spot = SPOTS[this.places[c.who]];
        c.x = spot.x * this.w;
        c.y = spot.y * this.h;
    }

    pan(x) {
        return clamp((x / this.w) * 2 - 1, -1, 1) * 0.7;
    }

    // Where a lantern hangs on the string.
    lanternAt(i) {
        const n = this.lanterns.length;
        const s = this.string;
        const k = (i + 0.5) / n;
        return {
            x: lerp(s.x0, s.x1, k),
            y: lerp(s.y0, s.y1, k) + Math.sin(k * Math.PI) * s.sag,
            r: Math.min(30 * this.u, ((s.x1 - s.x0) / n) * 0.36),
        };
    }

    //--------------------------------------------------------------------------
    // Time

    update(dt) {
        this.time += dt;
        const quiet = this.time - this.touched;
        const resting = quiet < IDLE;
        let busy = false;
        const beam = this.beam;

        // How fast the beam is moving, steadied: a beam that has stopped rests.
        const moved = beam.last ? dist(beam.last.x, beam.last.y, beam.x, beam.y) : 0;
        beam.last = { x: beam.x, y: beam.y };
        const speed = dt > 0 ? moved / dt / this.u : 0;
        beam.speed += (speed - beam.speed) * (1 - Math.exp(-dt / 0.08));
        beam.still = beam.on && beam.speed < SLOW ? beam.still + dt : 0;
        if (beam.glow.update(dt)) busy = true;
        if (beam.held) busy = true;

        // The creatures: the light resting on one wakes it; on one awake, it does its thing again.
        for (const c of this.creatures) {
            const inBeam = beam.on && dist(beam.x, beam.y, c.x, c.y - this.k * 0.4) < this.r * 0.78;
            if (c.state === 'asleep' && !this.song) {
                c.lit = rest(c.lit, dt, inBeam, beam.speed);
                // A snail feels the light before it wakes, and pulls its eyes in.
                if (c.who === 'snail' && inBeam && c.lit > 0.1) c.eyes.target = 0;
                if (c.lit >= this.stage.wake) this.wake(c);
            } else if (c.state === 'awake' && !this.song) {
                c.rested = inBeam && beam.speed < SLOW ? c.rested + dt : 0;
                if (c.rested >= AGAIN && this.time - c.last > COOLDOWN) this.again(c);
            }
            c.act = Math.max(0, c.act - dt / 1.4);
            if (c.act > 0) busy = true;
            if (c.awake.update(dt)) busy = true;
            if (c.eyes.update(dt)) busy = true;
            if (c.lit > 0 && c.state === 'asleep') busy = true;
        }
        for (const lantern of this.lanterns) if (lantern.glow.update(dt)) busy = true;

        if (this.song) {
            busy = true;
            this.sing(dt);
        }

        // Moths come to a beam left still, one at a time, and go when it moves on.
        if (
            beam.on &&
            beam.still > 1 &&
            this.moths.length < 3 &&
            (!this.mothAt || this.time - this.mothAt > 1.3)
        ) {
            this.mothAt = this.time;
            const side = this.next() < 0.5 ? -1 : 1;
            this.moths.push({
                x: beam.x + side * this.w * 0.5,
                y: beam.y - this.h * 0.3,
                a: this.next() * TAU,
                t: 0,
                leaving: false,
            });
            audio.play('flutter', { beats: 4, gap: 0.07 }, { gain: 0.25, pan: side * 0.6, wet: 0.35 });
        }
        for (const m of this.moths) {
            m.t += dt;
            // Off they go when the beam goes out or sweeps away, and are gone a moment later.
            if (!m.leaving && (!beam.on || beam.speed > SLOW * 1.5)) {
                m.leaving = true;
                m.goneAt = m.t + 1.2;
            }
            m.a += dt * 3.2;
            const tx = m.leaving
                ? m.x + (m.x > beam.x ? 1 : -1) * 400 * this.u
                : beam.x + Math.cos(m.a) * this.r * 0.45;
            const ty = m.leaving ? m.y - 300 * this.u : beam.y + Math.sin(m.a * 1.3) * this.r * 0.3;
            const k = 1 - Math.exp(-dt / (m.leaving ? 0.5 : 0.35));
            m.x += (tx - m.x) * k;
            m.y += (ty - m.y) * k;
        }
        this.moths = this.moths.filter((m) => !(m.leaving && m.t > m.goneAt));
        if (this.moths.length) busy = true;

        // The fireflies wander and blink while he is about; left alone, they settle.
        if (resting) {
            busy = true;
            for (const f of this.fireflies) {
                f.a += (this.next() - 0.5) * dt * 3;
                f.x = clamp(f.x + Math.cos(f.a) * 14 * this.u * dt, this.w * 0.05, this.w * 0.95);
                f.y = clamp(f.y + Math.sin(f.a) * 10 * this.u * dt, this.h * 0.5, this.h * 0.95);
                if (!this.flies || this.flies.state === 'rest' || this.flies.state === 'listen') {
                    f.phase += dt;
                    const k = (f.phase % 3.2) / 3.2;
                    f.on = k < 0.18 ? Math.sin((k / 0.18) * Math.PI) : 0;
                }
            }
            if (this.flies) this.fireflyRhythm(dt);
        }

        // At Bloom the moon climbs while he plays.
        if (this.stage.moon && resting && this.moon < 1) this.moon = Math.min(1, this.moon + dt / MOONRISE);

        if (this.torchPress.update(dt)) busy = true;
        return busy;
    }

    wake(c) {
        c.state = 'awake';
        c.awake.target = 1;
        c.act = 1;
        c.last = this.time;
        c.eyes.target = 1;
        voice(c.who, this.pan(c.x));
        // Its lantern lights, a note of the scale for each.
        const lantern = this.lanterns[c.index];
        lantern.glow.target = 1;
        const at = this.lanternAt(c.index);
        audio.play(
            'glock',
            { f: noteHz(c.index % 6, 84) },
            { gain: 0.35, pan: this.pan(at.x), wet: 0.5, delay: 0.5 }
        );
        if (this.creatures.every((other) => other.state === 'awake'))
            this.song = { t: -1.6, i: 0, done: false };
    }

    again(c) {
        c.act = 1;
        c.last = this.time;
        c.rested = 0;
        if (c.who === 'snail') {
            c.eyes.value = 0.2;
            c.eyes.target = 1;
        }
        voice(c.who, this.pan(c.x), 0.85);
    }

    // The night song: a lullaby on the music box, a note a beat, each creature's voice on its note;
    // then they go back to sleep one by one, the lanterns go out, and a new night begins.
    sing(dt) {
        const song = this.song;
        song.t += dt;
        while (song.i < SONG.length && song.t >= song.i * SONG_BEAT) {
            const i = song.i++;
            audio.play('musicBox', { f: noteHz(SONG[i], 72) }, { gain: 0.6, wet: 0.5 });
            const lantern = this.lanterns[i % this.lanterns.length];
            lantern.glow.kick(3);
            for (const c of this.creatures) {
                if (VOICE_AT[c.who] !== i) continue;
                c.act = 1;
                voice(c.who, this.pan(c.x), 0.7);
            }
        }
        const end = SONG.length * SONG_BEAT + 0.8;
        const n = this.creatures.length;
        if (song.t >= end) {
            // Goodnight, one by one, the last first.
            const k = Math.floor((song.t - end) / 0.45);
            for (let j = 0; j < Math.min(k, n); j++) {
                const c = this.creatures[n - 1 - j];
                c.awake.target = 0;
                this.lanterns[n - 1 - j].glow.target = 0;
            }
            if (k >= n + 2) this.night();
        }
    }

    // A new night: everyone asleep, somewhere new from Sprout on.
    night() {
        this.song = null;
        this.places = hide(this.level, this.places, this.next);
        for (const c of this.creatures) {
            c.state = 'asleep';
            c.lit = 0;
            c.act = 0;
            c.rested = 0;
            c.awake.target = 0;
            c.eyes.target = 1;
            this.place(c);
        }
    }

    // At Bloom the fireflies blink a rhythm together, then wait for him to blink back with the
    // torch; whatever he blinks, they blink it back to him, come a little nearer, and in time their
    // rhythms grow.
    fireflyRhythm(dt) {
        const flies = this.flies;
        flies.t -= dt;
        if (flies.state === 'rest') {
            if (flies.t <= 0 && !this.song) {
                flies.state = 'call';
                flies.times = call(flies.length, this.next);
                flies.i = 0;
                flies.t = 0;
                flies.at = 0;
            }
        } else if (flies.state === 'call' || flies.state === 'echo') {
            flies.at += dt;
            while (flies.i < flies.times.length && flies.at >= flies.times[flies.i]) {
                flies.i++;
                this.blinkAll(flies.state === 'echo' ? 4 : 2);
            }
            for (const f of this.fireflies) f.on = Math.max(0, f.on - dt / 0.2);
            if (flies.i >= flies.times.length && flies.at > flies.times[flies.times.length - 1] + 0.4) {
                if (flies.state === 'call') {
                    flies.state = 'listen';
                    flies.clicks = [];
                    flies.t = 6;
                } else {
                    flies.state = 'rest';
                    flies.t = 5;
                }
            }
        } else if (flies.state === 'listen') {
            const last = flies.clicks.length ? flies.clicks[flies.clicks.length - 1] : null;
            if (last !== null && this.time - last > 1.2) {
                // He blinked back: they blink his rhythm to him, and come a little nearer.
                flies.state = 'echo';
                flies.times = echo(flies.clicks);
                flies.i = 0;
                flies.at = -0.3;
                const next = grown(flies.streak, flies.length);
                flies.streak = next.streak;
                flies.length = next.length;
                for (const f of this.fireflies) f.y = Math.max(this.h * 0.5, f.y - 20 * this.u);
            } else if (flies.t <= 0) {
                flies.state = 'rest';
                flies.t = 8;
            }
        }
    }

    blinkAll(degree) {
        for (const f of this.fireflies) f.on = 1;
        audio.play('glock', { f: noteHz(degree, 96) }, { gain: 0.22, wet: 0.6 });
    }

    //--------------------------------------------------------------------------
    // Touch

    onTorch(x, y) {
        const t = this.torchAt;
        return dist(x, y, t.x - t.k * 0.5, t.y) < 62 * this.u || dist(x, y, t.x, t.y) < 50 * this.u;
    }

    toggle() {
        const beam = this.beam;
        beam.on = !beam.on;
        beam.glow.target = beam.on ? 1 : 0;
        this.torchPress.kick(-8);
        audio.play('click', { variant: beam.on ? 'on' : 'off' }, { gain: 0.6, pan: 0.7 });
        if (this.flies && this.flies.state === 'listen') this.flies.clicks.push(this.time);
    }

    down(p) {
        this.touched = this.time;
        if (this.onTorch(p.x, p.y)) {
            p.owner = { torch: true };
            this.toggle();
            return;
        }
        // The beam goes where the finger is, a little above it, so the finger does not hide it.
        if (!this.beam.on) this.toggle();
        this.beam.held = p;
        p.owner = { beam: true };
        this.aim(p);
    }

    aim(p) {
        this.beam.x = clamp(p.x, 0, this.w);
        this.beam.y = clamp(p.y - 36 * this.u, 0, this.h);
    }

    move(p) {
        this.touched = this.time;
        if (p.owner && p.owner.beam) this.aim(p);
    }

    up(p) {
        if (p.owner && p.owner.beam) this.beam.held = null;
    }

    //--------------------------------------------------------------------------
    // Drawing

    draw(ctx) {
        const { w, h, u } = this;
        ctx.drawImage(this.dark.canvas, 0, 0, w, h);
        // The moon, at Bloom, rising from behind the fence, and the garden lighter as it climbs.
        if (this.stage.moon) {
            const k = this.moon;
            const mx = lerp(w * 0.6, w * 0.53, k);
            const my = lerp(h * 0.52, h * 0.14, Math.sin((k * Math.PI) / 2));
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, w, h * 0.44);
            ctx.clip();
            drawMoon(ctx, mx, my, 34 * u);
            ctx.restore();
            if (k > 0.02) {
                ctx.globalAlpha = 0.28 * k;
                ctx.drawImage(this.lit.canvas, 0, 0, w, h);
                ctx.globalAlpha = 1;
            }
        }
        // Everyone in the dark, and the eyes of those awake catching what light there is.
        for (const c of this.creatures) {
            drawCreature(ctx, c.who, c.x, c.y, this.k, this.lookOf(c), DARK);
            if (c.awake.value <= 0.5) continue;
            for (const [gx, gy] of GLINTS[c.who]) {
                ellipse(
                    ctx,
                    c.x + gx * this.k,
                    c.y + gy * this.k,
                    2.6 * u,
                    2.6 * u * (c.awake.value - 0.5) * 2
                );
                ctx.fillStyle = 'rgba(255, 244, 200, 0.85)';
                ctx.fill();
            }
        }
        this.drawBeam(ctx);
        for (const f of this.fireflies) drawFirefly(ctx, f.x, f.y, 3.2 * u, f.on);
        for (const m of this.moths) drawMoth(ctx, m.x, m.y, 9 * u, m.t);
        this.drawLanterns(ctx);
        const beam = this.beam;
        const t = this.torchAt;
        const angle = Math.atan2(beam.y - t.y, beam.x - t.x);
        drawTorch(
            ctx,
            t.x,
            t.y,
            t.k,
            clamp(angle, -Math.PI * 0.95, -Math.PI * 0.55),
            beam.on,
            this.torchPress.value
        );
    }

    lookOf(c) {
        return {
            awake: c.awake.value,
            act: c.act,
            t: this.time,
            eyes: c.eyes.value,
            blink: c.awake.value > 0.9 && this.time % 4.3 < 0.13,
        };
    }

    drawBeam(ctx) {
        const beam = this.beam;
        const glow = clamp(beam.glow.value, 0, 1);
        if (glow < 0.02) return;
        const { w, h, u } = this;
        const r = this.r;
        // A faint shaft from the torch to the spot.
        const t = this.torchAt;
        const a = Math.atan2(beam.y - t.y, beam.x - t.x) + Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(t.x + Math.cos(a) * 8 * u, t.y + Math.sin(a) * 8 * u);
        ctx.lineTo(beam.x + Math.cos(a) * r * 0.8, beam.y + Math.sin(a) * r * 0.8);
        ctx.lineTo(beam.x - Math.cos(a) * r * 0.8, beam.y - Math.sin(a) * r * 0.8);
        ctx.lineTo(t.x - Math.cos(a) * 8 * u, t.y - Math.sin(a) * 8 * u);
        ctx.closePath();
        ctx.fillStyle = `rgba(255, 244, 205, ${(0.07 * glow).toFixed(3)})`;
        ctx.fill();
        // Inside the beam, the garden by torchlight, and whoever is there in their own colours.
        ctx.save();
        ctx.globalAlpha = glow;
        ctx.beginPath();
        ctx.arc(beam.x, beam.y, r, 0, TAU);
        ctx.clip();
        const x0 = clamp(beam.x - r, 0, w);
        const y0 = clamp(beam.y - r, 0, h);
        const x1 = clamp(beam.x + r, 0, w);
        const y1 = clamp(beam.y + r, 0, h);
        if (x1 > x0 && y1 > y0) {
            const s = this.lit.scale;
            ctx.drawImage(
                this.lit.canvas,
                x0 * s,
                y0 * s,
                (x1 - x0) * s,
                (y1 - y0) * s,
                x0,
                y0,
                x1 - x0,
                y1 - y0
            );
        }
        for (const c of this.creatures) {
            if (dist(c.x, c.y - this.k * 0.4, beam.x, beam.y) > r + this.k) continue;
            drawCreature(ctx, c.who, c.x, c.y, this.k, this.lookOf(c), LIT);
        }
        // A warm middle, and an edge that fades into the dark.
        const g = ctx.createRadialGradient(beam.x, beam.y, r * 0.55, beam.x, beam.y, r);
        g.addColorStop(0, 'rgba(26, 33, 66, 0)');
        g.addColorStop(1, 'rgba(26, 33, 66, 0.8)');
        ctx.fillStyle = g;
        ctx.fillRect(beam.x - r, beam.y - r, r * 2, r * 2);
        const warm = ctx.createRadialGradient(beam.x, beam.y, 0, beam.x, beam.y, r * 0.6);
        warm.addColorStop(0, 'rgba(255, 236, 190, 0.12)');
        warm.addColorStop(1, 'rgba(255, 236, 190, 0)');
        ctx.fillStyle = warm;
        ctx.fillRect(beam.x - r, beam.y - r, r * 2, r * 2);
        ctx.restore();
    }

    drawLanterns(ctx) {
        const s = this.string;
        ctx.strokeStyle = 'rgba(200, 190, 170, 0.5)';
        ctx.lineWidth = 1.5 * this.u;
        ctx.beginPath();
        ctx.moveTo(s.x0 - 20 * this.u, s.y0 - 6 * this.u);
        ctx.quadraticCurveTo(
            (s.x0 + s.x1) / 2,
            (s.y0 + s.y1) / 2 + s.sag * 2,
            s.x1 + 20 * this.u,
            s.y1 - 6 * this.u
        );
        ctx.stroke();
        this.lanterns.forEach((lantern, i) => {
            const at = this.lanternAt(i);
            drawLantern(ctx, at.x, at.y, at.r, lantern.colour, clamp(lantern.glow.value, 0, 1.3));
        });
    }

    exit() {
        freeLayer(this.lit);
        freeLayer(this.dark);
        this.lit = null;
        this.dark = null;
        this.invalidate();
    }
}

function icon(ctx, x, y, w, h, u) {
    // The garden at night, a beam of light, and an owl awake in it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#1C2446');
    sky.addColorStop(1, '#2E3A62');
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = DARK('#8DB57B');
    ctx.fillRect(x, y + h * 0.72, w, h * 0.28);
    const bx = x + w * 0.42;
    const by = y + h * 0.56;
    const r = Math.min(w, h) * 0.32;
    const g = ctx.createRadialGradient(bx, by, r * 0.2, bx, by, r);
    g.addColorStop(0, 'rgba(255, 240, 200, 0.55)');
    g.addColorStop(1, 'rgba(255, 240, 200, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(bx - r, by - r, r * 2, r * 2);
    ctx.restore();
    drawCreature(ctx, 'owl', bx, by + r * 0.45, Math.min(w, h) * 0.38, { awake: 1, act: 0, t: 0 }, LIT);
    drawTorch(ctx, x + w * 0.86, y + h * 0.86, Math.min(w, h) * 0.32, -Math.PI * 0.75, true);
    void u;
}

export const toy = {
    id: 'torch',
    title: 'Torch in the dark',
    about: 'The garden at night, and a torch. Where its beam rests, things wake gently: an owl opens its eyes and hoots, a hedgehog uncurls, a snail pulls its eyes in, a frog sings. Each lights a lantern, and when every lantern is lit they sing a night song and go back to sleep. Nothing jumps out. At Sprout they hide somewhere new each night; at Bloom the moon rises, and the fireflies blink a rhythm to answer with the torch.',
    stages: [
        'A wide beam, and four friends asleep in the same places',
        'A narrower beam, six friends, and new hiding places each night',
        'And the moon rising, and fireflies to answer with the torch',
    ],
    isNew: true,
    mat: shade(PALETTE.lavender, 0.2),
    icon,
    create: (app) => new TorchScene(app),
    sounds(level) {
        const list = [
            ['click', { variant: 'on' }],
            ['click', { variant: 'off' }],
            ['hoot', { f: noteHz(2, 60) }],
            ['rustle', {}],
            ['pop', { f: 1100 }],
            ['gulp', { f: 260 }],
            ['ribbit', {}],
            ['chirp', { f: noteHz(4, 96), variant: 'peep' }],
            ['tick', { f: noteHz(5, 96) }],
            ['flutter', { beats: 4, gap: 0.07 }],
        ];
        for (let d = 0; d < 6; d++) list.push(['glock', { f: noteHz(d, 84) }]);
        for (const d of new Set(SONG)) list.push(['musicBox', { f: noteHz(d, 72) }]);
        if (STAGES[level].answer) for (const d of [2, 4]) list.push(['glock', { f: noteHz(d, 96) }]);
        return list;
    },
    signature() {
        audio.play('click', { variant: 'on' }, { gain: 0.5, delay: 0.05 });
        audio.play('hoot', { f: noteHz(2, 60) }, { gain: 0.35, wet: 0.5, delay: 0.25 });
    },
};
