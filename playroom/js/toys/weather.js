// Weather Song: a small friend sits on a hill, and the music he makes is the friend's weather. The
// rain-stick brings a drizzle, and the friend gets sleepy under a leaf; the bells bring the sun, and
// a dance; the big drum brings thunder, and a stamping, cross friend. Then the thunder rolls away,
// and the friend sighs, and smiles. Every mood is allowed, and every mood passes.
//
//   touch  - tip the rain-stick, ring a bell, beat the drum: each is a weather. Tap the friend and it
//            hops; tap the sun and it shines.
//   move   - push the cloud along: wind, and the friend's scarf flies out.
//   make   - a whole day of weather, morning to night, as a song. At night the friend sleeps; a tap
//            on it, or on the moon, brings the morning again.
//
// Mister Rogers sang "What do you do with the mad that you feel?", and Margaret McFarland held that
// anything mentionable is manageable. Here the friend's feelings are weather he can make, watch
// pass, and make again: the thunder is never wrong, and it always rolls away.
//
// Seed has the rain-stick and three bells: sunny and sleepy. Sprout adds the big drum: cross, and
// calm after. Bloom adds fog, when nothing is played for a while, and the friend is shy in it; a
// rainbow when the sun comes out in the rain, and the friend is proud of it; and the day so far,
// painted as a strip of sky along the top.
//
// The weather itself, what each touch brings and how long it stays, is skies.js.

import { Scene } from '../stage.js';
import { PALETTE, makeLayer, freeLayer, grain, ellipse, disc, fillRound } from '../draw.js';
import { Spring, clamp, lerp, dist, shade, hexToRgb, mixRgb, rgbString, rng, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { COLOURS } from './cubes.js';
import { Friend } from '../friend.js';
import { Weather, STAGES, NIGHT, EVENING, STRIP } from './skies.js';
import { drawDrum } from './instruments.js';

// The sky through the day, top and bottom: dawn, morning, noon, afternoon, evening, dusk and night.
const SKY = [
    [0, '#C9C3E3', '#F7D9BF'],
    [0.1, '#A9CDEB', '#E9F1F2'],
    [0.5, '#9CC8EA', '#E2EEF2'],
    [0.72, '#A7C4E4', '#EEE6D2'],
    [0.82, '#B8A6D4', '#F3BE9E'],
    [0.89, '#55608F', '#9C88AE'],
    [0.94, '#2E3862', '#4E5885'],
    [1, '#2E3862', '#4E5885'],
];
const GREY = hexToRgb('#AEB8C2');
const SLATE = hexToRgb('#7E8698');
const MIST = hexToRgb('#E8EBEA');
const WARM = hexToRgb('#FFE7B5');
// The colours of the day's strip of sky, for each kind of weather.
const STRIP_COLOURS = {
    clear: '#BBDAF0',
    evening: '#F1BFA2',
    night: '#5A6492',
    sun: '#F6D77E',
    rain: '#A9BCCB',
    storm: '#7E8698',
    fog: '#E3E5E2',
};
const BOW = ['#EDA6A1', '#F4C59A', '#F3DE97', '#BCD3A8', '#ABCDEA', '#C9BBE3'];

const at = (list, name) => list.find((kind) => kind.name === name);

class WeatherScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.stage = STAGES[this.level];
        this.weather = new Weather(this.level);
        this.friend = new Friend();
        this.time = 0;
        this.drops = [];
        this.glow = 0;
        this.bolt = null;
        this.thunderAt = -1;
        this.cloud = { x: 0, y: 0, hx: 0, hy: 0, vx: 0, held: null, dx: 0, dy: 0 };
        this.wind = 0;
        this.stick = { turn: new Spring(0, 60, 11), press: new Spring(0, 400, 18), flips: 0 };
        const names = this.stage.bells === 3 ? ['red', 'yellow', 'green'] : COLOURS.map((c) => c.name);
        this.bells = names.map((name) => {
            const kind = at(COLOURS, name);
            return {
                colour: kind.colour,
                degree: kind.degree,
                x: 0,
                y: 0,
                r: 0,
                swing: new Spring(0, 90, 4),
            };
        });
        this.drum = this.stage.drum ? { x: 0, y: 0, r: 0, press: new Spring(0, 520, 16), ring: 0 } : null;
        this.sunPress = new Spring(0, 300, 12);
        this.flowers = [];
        this.stars = [];
        this.sparkles = [];
        this.mood = 'content';
        this.lastTouch = 0;
        this.rainSound = new audio.Texture('rain');
        this.windSound = new audio.Texture('wind');
        this.land = null;
        this.night = null;
    }

    layout() {
        const { w, h, u } = this;
        const portrait = h > w;
        this.hillY = h * (portrait ? 0.6 : 0.6);
        this.groundY = h * (portrait ? 0.8 : 0.78);
        this.r = (portrait ? 66 : 62) * u;
        this.fx = w / 2;
        this.fy = this.hillY + 4 * u;
        const c = this.cloud;
        c.hx = w * (portrait ? 0.34 : 0.36);
        c.hy = h * (portrait ? 0.24 : 0.22);
        if (!c.x) {
            c.x = c.hx;
            c.y = c.hy;
        }
        c.w = (portrait ? 150 : 170) * u;

        // The instruments stand on the meadow in front of the hill: the rain-stick to the left, the
        // bells in the middle, the drum to the right.
        const iy = h * (portrait ? 0.885 : 0.875);
        // Without the drum, at Seed, the two that are there share the meadow.
        const middle = this.drum ? w / 2 : w * 0.66;
        this.stick.x = this.drum ? w * 0.17 : w * 0.26;
        this.stick.y = iy;
        this.stick.len = Math.min(230 * u, w * 0.26);
        this.stick.thick = 34 * u;
        const count = this.bells.length;
        const spread = Math.min(54 * u, (w * 0.32) / count);
        this.frame = { x: middle, y: iy - 62 * u, w: spread * count + 30 * u, h: 112 * u };
        this.bells.forEach((bell, i) => {
            bell.x = middle + (i - (count - 1) / 2) * spread;
            bell.y = this.frame.y + 22 * u;
            bell.r = Math.min(spread * 0.42, 22 * u);
            bell.len = (34 + (i % 2) * 10) * u;
        });
        if (this.drum) {
            this.drum.x = w * 0.83;
            this.drum.y = iy - 8 * u;
            this.drum.r = Math.min(74 * u, w * 0.1);
        }

        // Flowers on the hill, in the playroom's colours: they open in the sun.
        const seed = rng(12);
        this.flowers = [-0.36, -0.24, -0.15, 0.17, 0.26, 0.37].map((k, i) => {
            const x = w / 2 + k * w;
            return {
                x,
                y: this.hillAt(x) + (8 + seed() * 24) * u,
                colour: COLOURS[i % COLOURS.length].colour,
                open: 0.5,
                sway: seed() * TAU,
            };
        });
        const sky = rng(7);
        this.stars = Array.from({ length: 34 }, () => ({
            x: sky() * w,
            y: sky() * h * 0.5,
            r: (0.8 + sky() * 1.6) * u,
            phase: sky() * TAU,
        }));

        freeLayer(this.land);
        freeLayer(this.night);
        this.land = this.drawLand(false);
        this.night = this.drawLand(true);
    }

    // The top of the hill at x.
    hillAt(x) {
        const { w, h } = this;
        const rx = w * 0.62;
        const ry = h * 0.3;
        const k = clamp((x - w / 2) / rx, -1, 1);
        return this.hillY + ry - ry * Math.sqrt(1 - k * k);
    }

    // The hills and the meadow, drawn once by day and once by night, so the night can fade in over
    // the day without drawing either again.
    drawLand(night) {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        const tone = (hex) => (night ? rgbString(mixRgb(hexToRgb(hex), [44, 56, 98], 0.62)) : hex);
        ellipse(ctx, w * 0.12, this.hillY + h * 0.2, w * 0.42, h * 0.24);
        ctx.fillStyle = tone('#CFE2BE');
        ctx.fill();
        ellipse(ctx, w * 0.9, this.hillY + h * 0.17, w * 0.38, h * 0.22);
        ctx.fillStyle = tone('#C7DDB5');
        ctx.fill();
        ellipse(ctx, w / 2, this.hillY + h * 0.3, w * 0.62, h * 0.3);
        ctx.fillStyle = tone('#B4D29E');
        ctx.fill();
        // A lighter crown on the hill, where the light falls.
        ctx.save();
        ellipse(ctx, w / 2, this.hillY + h * 0.3, w * 0.62, h * 0.3);
        ctx.clip();
        ellipse(ctx, w * 0.44, this.hillY + h * 0.06, w * 0.3, h * 0.08);
        ctx.fillStyle = tone('#C2DCAD');
        ctx.fill();
        ctx.restore();
        // The meadow in front, where the instruments stand.
        ctx.beginPath();
        ctx.moveTo(0, this.groundY);
        ctx.quadraticCurveTo(w * 0.25, this.groundY - 14 * u, w * 0.5, this.groundY);
        ctx.quadraticCurveTo(w * 0.75, this.groundY + 14 * u, w, this.groundY - 4 * u);
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fillStyle = tone('#A8C98F');
        ctx.fill();
        const tufts = rng(5);
        ctx.strokeStyle = tone('#93B97C');
        ctx.lineWidth = 2 * u;
        ctx.lineCap = 'round';
        for (let i = 0; i < 70; i++) {
            const x = tufts() * w;
            const y = this.groundY + 12 * u + tufts() * (h - this.groundY - 16 * u);
            ctx.beginPath();
            ctx.moveTo(x - 4 * u, y);
            ctx.lineTo(x - 6 * u, y - 7 * u);
            ctx.moveTo(x, y);
            ctx.lineTo(x, y - 9 * u);
            ctx.moveTo(x + 4 * u, y);
            ctx.lineTo(x + 6 * u, y - 7 * u);
            ctx.stroke();
        }
        grain(ctx, 0, this.hillY - 20 * u, w, h - this.hillY + 20 * u, 0.2, this.scale);
        return layer;
    }

    //--------------------------------------------------------------------------
    // Playing

    pan(x) {
        return clamp((x / this.w) * 2 - 1, -1, 1) * 0.7;
    }

    tip() {
        const s = this.stick;
        s.flips++;
        s.turn.target = s.flips * Math.PI;
        s.press.kick(-6);
        audio.play('rainstick', {}, { pan: this.pan(s.x), wet: 0.3 });
        this.weather.play('rain');
        this.heard(s.x, s.y);
    }

    ring(bell) {
        bell.swing.kick(bell.swing.value > 0 ? -5 : 5);
        audio.play('chime', { f: noteHz(bell.degree, 72) }, { pan: this.pan(bell.x), wet: 0.35 });
        this.weather.play('sun');
        this.sparkle(bell.x, bell.y + bell.len, bell.colour);
        this.heard(bell.x, bell.y);
    }

    beat() {
        const d = this.drum;
        d.press.kick(-10);
        d.ring = 1;
        audio.play('drum', {}, { pan: this.pan(d.x) });
        audio.play('thud', { f: 85 }, { gain: 0.5, pan: this.pan(d.x) });
        this.weather.play('storm');
        // The cloud lights up at once, and the thunder follows.
        this.glow = 1;
        this.bolt = this.makeBolt();
        if (this.thunderAt < 0) this.thunderAt = this.time + 0.3;
        this.heard(d.x, d.y);
    }

    heard(x, y) {
        this.lastTouch = this.time;
        this.friend.look(x - this.fx, y - (this.fy - this.r * 1.3));
    }

    sparkle(x, y, colour) {
        for (let i = 0; i < 4; i++) {
            const a = -Math.PI / 2 + (i - 1.5) * 0.5;
            this.sparkles.push({ x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 90, t: 0, colour });
        }
    }

    makeBolt() {
        const c = this.cloud;
        const next = rng(Math.floor(this.time * 1000) + 3);
        const points = [[c.x + (next() - 0.5) * c.w * 0.4, c.y + c.w * 0.18]];
        for (let i = 0; i < 4; i++) {
            const [x, y] = points[points.length - 1];
            points.push([
                x + (i % 2 ? 1 : -1) * (10 + next() * 14) * this.u,
                y + (18 + next() * 10) * this.u,
            ]);
        }
        return points;
    }

    //--------------------------------------------------------------------------
    // Time

    update(dt) {
        this.time += dt;
        const weather = this.weather;
        weather.step(dt);
        for (const event of weather.events) {
            if (event === 'calm') {
                this.friend.sigh();
                audio.play('sigh', {}, { pan: this.pan(this.fx), wet: 0.2, delay: 0.25 });
            } else if (event === 'rainbow') {
                [0, 2, 3, 4, 5].forEach((degree, i) =>
                    audio.play(
                        'musicBox',
                        { f: noteHz(degree, 72) },
                        { gain: 0.6, wet: 0.4, delay: i * 0.11 }
                    )
                );
            } else if (event === 'night') {
                audio.play('hoot', { f: noteHz(2, 60) }, { gain: 0.5, wet: 0.5, pan: -0.5, delay: 1.2 });
            } else if (event === 'dawn') {
                audio.play('chirp', { f: noteHz(2, 96) }, { gain: 0.5, wet: 0.4, pan: 0.4, delay: 0.4 });
                audio.play(
                    'chirp',
                    { f: noteHz(0, 96), variant: 'peep' },
                    { gain: 0.4, wet: 0.4, pan: 0.5, delay: 0.75 }
                );
            }
        }
        if (this.thunderAt >= 0 && this.time >= this.thunderAt) {
            this.thunderAt = -1;
            audio.play('thunder', {}, { pan: this.pan(this.cloud.x), wet: 0.5 });
        }

        // How the friend feels is the weather's; the leaf comes up while it drizzles.
        const friend = this.friend;
        const mood = weather.mood();
        if (mood !== this.mood) {
            this.mood = mood;
            friend.feel(mood);
        }
        friend.shelter(mood === 'sleepy' && weather.rain > 0.2);
        if (friend.stomped) audio.play('pat', {}, { gain: 0.45, pan: this.pan(this.fx) });
        if (this.time - this.lastTouch > 2.5) friend.look(0, 1);
        if (mood === 'shy' && Math.floor(this.time / 2.4) % 2) friend.look(0.9, 0.2);

        // The cloud: in a hand, it goes where it is pushed, and its speed is the wind; let go, it
        // drifts slowly home.
        const c = this.cloud;
        // Where it was last frame: a finger may have moved it since.
        const before = c.last === undefined ? c.x : c.last;
        if (!c.held) {
            const k = 1 - Math.exp(-dt / 2.2);
            c.x += (c.hx - c.x) * k;
            c.y += (c.hy - c.y) * k;
            // Home: it settles there, rather than creeping closer for ever.
            if (Math.abs(c.hx - c.x) < 2 * this.u && Math.abs(c.hy - c.y) < 2 * this.u) {
                c.x = c.hx;
                c.y = c.hy;
            }
        }
        const speed = dt > 0 ? (c.x - before) / dt : 0;
        c.last = c.x;
        c.vx += (speed - c.vx) * (1 - Math.exp(-dt / 0.12));
        const gust = clamp(c.vx / (360 * this.u), -1, 1);
        this.wind +=
            (gust - this.wind) * (1 - Math.exp(-dt / (Math.abs(gust) > Math.abs(this.wind) ? 0.15 : 0.9)));
        friend.windTo(this.wind);
        this.windSound.set(Math.min(1, Math.abs(this.wind) * 1.1), 380 + Math.abs(this.wind) * 520);
        this.rainSound.set(Math.min(1, weather.rain * 0.9 + weather.storm * 0.5));

        // Rain falls from the cloud, and more in a storm; the wind slants it.
        const rate = (weather.rain * 70 + weather.storm * 50) * (weather.rain + weather.storm > 0.06 ? 1 : 0);
        this.spawn = (this.spawn || 0) + rate * dt;
        while (this.spawn >= 1) {
            this.spawn--;
            this.drops.push({
                x: c.x + (Math.random() - 0.5) * c.w * 0.8,
                y: c.y + c.w * 0.12,
                v: (520 + Math.random() * 160) * this.u,
            });
        }
        for (const drop of this.drops) {
            drop.y += drop.v * dt;
            drop.x += this.wind * 260 * this.u * dt;
        }
        this.drops = this.drops.filter((drop) => drop.y < this.groundY + 40 * this.u);

        this.glow = Math.max(0, this.glow - dt / 0.55);
        for (const s of this.sparkles) {
            s.t += dt;
            s.x += s.vx * this.u * dt;
            s.y += s.vy * this.u * dt;
            s.vy += 120 * dt;
        }
        this.sparkles = this.sparkles.filter((s) => s.t < 0.8);

        for (const flower of this.flowers) {
            const target = clamp(0.35 + weather.sun * 0.8 - weather.rain * 0.5 - weather.storm * 0.4, 0, 1);
            const night = weather.day >= NIGHT ? 1 : 0;
            flower.open += (target * (1 - night) - flower.open) * (1 - Math.exp(-dt / 0.8));
        }

        let busy = friend.update(dt);
        for (const spring of [this.stick.turn, this.stick.press, this.sunPress])
            if (spring.update(dt)) busy = true;
        for (const bell of this.bells) if (bell.swing.update(dt)) busy = true;
        if (this.drum) {
            if (this.drum.press.update(dt)) busy = true;
            this.drum.ring = Math.max(0, this.drum.ring - dt / 0.6);
        }
        // The day goes on while it is day; once the night is over and all is still, nothing moves.
        if (!weather.over()) busy = true;
        if (!weather.settled() || this.drops.length || this.sparkles.length || this.glow > 0 || c.held)
            busy = true;
        // A breath of wind too faint to lift the scarf is none.
        if (Math.abs(this.wind) < 0.02 && Math.abs(gust) < 0.02) this.wind = 0;
        if (this.wind !== 0 || c.x !== c.hx || c.y !== c.hy) busy = true;
        return busy;
    }

    //--------------------------------------------------------------------------
    // Touch

    down(p) {
        const { u } = this;
        this.lastTouch = this.time;
        const s = this.stick;
        if (this.onStick(p.x, p.y)) {
            p.owner = { type: 'stick' };
            this.tip();
            return;
        }
        for (const bell of this.bells) {
            const bx = bell.x;
            const by = bell.y + bell.len;
            if (dist(p.x, p.y, bx, by) < bell.r * 1.35 + 6 * u) {
                p.owner = { type: 'bell' };
                this.ring(bell);
                return;
            }
        }
        const d = this.drum;
        if (d && Math.abs(p.x - d.x) < d.r * 1.1 && p.y > d.y - d.r * 0.55 && p.y < d.y + d.r * 0.9) {
            p.owner = { type: 'drum' };
            this.beat();
            return;
        }
        const night = this.weather.day >= NIGHT;
        if (dist(p.x, p.y, this.fx, this.fy - this.r) < this.r * 1.25) {
            p.owner = { type: 'friend' };
            if (night) this.morning();
            else {
                this.friend.bob(2);
                audio.play('pop', { f: 700 }, { gain: 0.6, pan: this.pan(this.fx) });
            }
            return;
        }
        const c = this.cloud;
        if (Math.abs(p.x - c.x) < c.w * 0.62 && Math.abs(p.y - c.y) < c.w * 0.32) {
            c.held = p;
            c.dx = p.x - c.x;
            c.dy = p.y - c.y;
            p.owner = { type: 'cloud' };
            return;
        }
        const sky = this.skyBody();
        if (sky && dist(p.x, p.y, sky.x, sky.y) < sky.r * 1.6) {
            p.owner = { type: 'sky' };
            this.sunPress.kick(-5);
            if (sky.moon) this.morning();
            else {
                this.weather.play('sun');
                audio.play('tink', { f: 2000 }, { gain: 0.6, pan: this.pan(sky.x), wet: 0.4 });
                this.sparkle(sky.x, sky.y, '#F6D77E');
            }
            return;
        }
        if (night && this.weather.over()) this.morning();
        void s;
    }

    onStick(x, y) {
        const s = this.stick;
        const a = -0.32 + s.turn.value;
        const dx = x - s.x;
        const dy = y - s.y;
        const along = dx * Math.cos(a) + dy * Math.sin(a);
        const across = -dx * Math.sin(a) + dy * Math.cos(a);
        return Math.abs(along) < s.len / 2 + 10 * this.u && Math.abs(across) < s.thick + 14 * this.u;
    }

    move(p) {
        const c = this.cloud;
        if (c.held !== p) return;
        const { w, h } = this;
        c.x = clamp(p.x - c.dx, c.w * 0.2, w - c.w * 0.2);
        c.y = clamp(p.y - c.dy, h * 0.1, h * 0.38);
    }

    up(p) {
        if (this.cloud.held === p) this.cloud.held = null;
    }

    // A new day: the sun comes up, and the friend wakes.
    morning() {
        if (this.weather.day < NIGHT) return;
        this.weather.dawn();
        this.friend.yawn();
    }

    // The sun by day, or the moon by night: where it is in the sky.
    skyBody() {
        const { w, h, u } = this;
        const day = this.weather.day;
        if (day < NIGHT) {
            const k = day / NIGHT;
            return {
                x: lerp(w * 0.1, w * 0.9, k),
                y: h * 0.42 - Math.sin(Math.PI * k) * h * 0.3,
                r: 40 * u,
                moon: false,
            };
        }
        const k = clamp((day - NIGHT) / (1 - NIGHT), 0, 1);
        return {
            x: lerp(w * 0.78, w * 0.7, k),
            y: lerp(h * 0.3, h * 0.16, Math.min(1, k * 2)),
            r: 30 * u,
            moon: true,
        };
    }

    //--------------------------------------------------------------------------
    // Drawing

    // How far into the night it is, 0 by day to 1.
    nightness() {
        return clamp((this.weather.day - (NIGHT - 0.03)) / 0.06, 0, 1);
    }

    skyColours() {
        const { day, rain, storm, fog, sun } = this.weather;
        let i = 0;
        while (i < SKY.length - 2 && day > SKY[i + 1][0]) i++;
        const [d0, t0, b0] = SKY[i];
        const [d1, t1, b1] = SKY[i + 1];
        const k = clamp((day - d0) / Math.max(1e-6, d1 - d0), 0, 1);
        let top = mixRgb(hexToRgb(t0), hexToRgb(t1), k);
        let bottom = mixRgb(hexToRgb(b0), hexToRgb(b1), k);
        const night = day >= NIGHT ? 0.4 : 1;
        top = mixRgb(top, GREY, rain * 0.45 * night);
        bottom = mixRgb(bottom, GREY, rain * 0.35 * night);
        top = mixRgb(top, SLATE, storm * 0.55 * night);
        bottom = mixRgb(bottom, SLATE, storm * 0.45 * night);
        top = mixRgb(top, MIST, fog * 0.55);
        bottom = mixRgb(bottom, MIST, fog * 0.7);
        bottom = mixRgb(bottom, WARM, sun * 0.4 * (day < NIGHT ? 1 : 0));
        this.skyTop = top;
        this.skyBottom = bottom;
        return [rgbString(top), rgbString(bottom)];
    }

    draw(ctx) {
        const { w, h, u } = this;
        const weather = this.weather;
        const [top, bottom] = this.skyColours();
        const sky = ctx.createLinearGradient(0, 0, 0, this.groundY);
        sky.addColorStop(0, top);
        sky.addColorStop(1, bottom);
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h);

        const nightness = this.nightness();
        if (nightness > 0) this.drawStars(ctx, nightness);
        this.drawSkyBody(ctx);
        if (weather.rainbow > 0.01 && nightness < 1) this.drawRainbow(ctx, weather.rainbow * (1 - nightness));
        this.drawCloud(ctx);

        ctx.drawImage(this.land.canvas, 0, 0, w, h);
        if (nightness > 0) {
            ctx.globalAlpha = nightness;
            ctx.drawImage(this.night.canvas, 0, 0, w, h);
            ctx.globalAlpha = 1;
        }
        this.drawFlowers(ctx);
        this.friend.draw(ctx, this.fx, this.fy, this.r);
        this.drawRain(ctx);
        if (weather.fog > 0.01) this.drawFog(ctx, weather.fog);
        if (nightness > 0) {
            ctx.fillStyle = `rgba(30, 40, 84, ${(nightness * 0.24).toFixed(3)})`;
            ctx.fillRect(0, 0, w, h);
        }
        // Rain and thunder grey the whole scene a little; the evening warms it.
        const grey = weather.rain * 0.08 + weather.storm * 0.16;
        if (grey > 0.005) {
            ctx.fillStyle = `rgba(90, 100, 120, ${grey.toFixed(3)})`;
            ctx.fillRect(0, 0, w, h);
        }
        const evening = clamp((weather.day - EVENING) / 0.06, 0, 1) * (1 - nightness);
        if (evening > 0) {
            ctx.fillStyle = `rgba(240, 160, 110, ${(evening * 0.1).toFixed(3)})`;
            ctx.fillRect(0, 0, w, h);
        }

        this.drawStick(ctx);
        this.drawBells(ctx);
        if (this.drum) this.drawDrum(ctx);
        for (const s of this.sparkles) {
            const a = 1 - s.t / 0.8;
            ctx.globalAlpha = a;
            disc(ctx, s.x, s.y, 4 * u * (0.6 + a * 0.6), s.colour);
        }
        ctx.globalAlpha = 1;
        if (this.stage.strip) this.drawStrip(ctx);
    }

    drawStars(ctx, nightness) {
        const t = this.time;
        for (const star of this.stars) {
            ctx.globalAlpha = nightness * (0.55 + 0.45 * Math.sin(t * 1.3 + star.phase));
            disc(ctx, star.x, star.y, star.r, '#FFF6D6');
        }
        ctx.globalAlpha = 1;
    }

    drawSkyBody(ctx) {
        const body = this.skyBody();
        const { u } = this;
        const weather = this.weather;
        const r = body.r * (1 + this.sunPress.value * -0.04);
        if (body.moon) {
            disc(ctx, body.x, body.y, r * 1.6, 'rgba(255, 246, 214, 0.12)');
            disc(ctx, body.x, body.y, r, '#F6EBC8');
            // The bite out of it is the sky behind.
            const behind = mixRgb(this.skyTop, this.skyBottom, clamp(body.y / this.groundY, 0, 1));
            disc(ctx, body.x + r * 0.42, body.y - r * 0.18, r * 0.86, rgbString(behind));
            return;
        }
        // Low in the evening the sun sinks behind the hill; the hill is drawn after it.
        const shine = weather.sun;
        const hidden = Math.max(weather.rain, weather.storm) * (1 - shine);
        ctx.globalAlpha = 1 - hidden * 0.55;
        disc(
            ctx,
            body.x,
            body.y,
            r * (1.6 + shine * 0.5),
            `rgba(255, 233, 160, ${(0.18 + shine * 0.3).toFixed(3)})`
        );
        if (shine > 0.04) {
            ctx.save();
            ctx.translate(body.x, body.y);
            ctx.rotate(this.time * 0.25);
            ctx.strokeStyle = '#F8D876';
            ctx.lineWidth = 5 * u;
            ctx.lineCap = 'round';
            ctx.beginPath();
            for (let i = 0; i < 12; i++) {
                const a = (i / 12) * TAU;
                const inner = r * 1.25;
                const outer = r * (1.35 + shine * 0.55 * (i % 2 ? 0.7 : 1));
                ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
                ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
            }
            ctx.stroke();
            ctx.restore();
        }
        disc(ctx, body.x, body.y, r, '#F6D36B');
        disc(ctx, body.x - r * 0.25, body.y - r * 0.25, r * 0.45, 'rgba(255, 245, 205, 0.5)');
        ctx.globalAlpha = 1;
    }

    drawRainbow(ctx, k) {
        const { w, h } = this;
        const cx = w / 2;
        const cy = this.hillY + h * 0.12;
        const r = Math.min(w * 0.44, h * 0.56);
        const band = r * 0.045;
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 1.3) * 0.8;
        ctx.lineWidth = band;
        BOW.forEach((colour, i) => {
            ctx.beginPath();
            ctx.arc(cx, cy, r - i * band, Math.PI, TAU);
            ctx.strokeStyle = colour;
            ctx.stroke();
        });
        ctx.restore();
    }

    // The cloud: white on a fair day, grey with rain, dark and heaped with thunder, lit from inside
    // when the drum is beaten.
    drawCloud(ctx) {
        const c = this.cloud;
        const { rain, storm } = this.weather;
        const { u } = this;
        let colour = mixRgb([252, 252, 250], [184, 194, 204], Math.min(1, rain * 1.2));
        colour = mixRgb(colour, [118, 126, 146], Math.min(1, storm * 1.4));
        colour = mixRgb(colour, [96, 106, 146], this.nightness() * 0.6);
        colour = mixRgb(colour, [255, 238, 190], this.glow * 0.5);
        const size = c.w * (1 + rain * 0.18 + storm * 0.35);
        const puffs = [
            [-0.38, 0.06, 0.24],
            [-0.16, -0.08, 0.3],
            [0.1, -0.12, 0.33],
            [0.34, 0.02, 0.25],
            [0, 0.08, 0.3],
        ];
        if (storm > 0.04)
            puffs.push(
                [-0.28, -0.18, 0.2 * Math.min(1, storm * 2)],
                [0.3, -0.2, 0.22 * Math.min(1, storm * 2)]
            );
        const under = rgbString(mixRgb(colour, [90, 96, 116], 0.18));
        for (const [px, py, pr] of puffs)
            disc(ctx, c.x + px * size, c.y + py * size + size * 0.04, pr * size, under);
        for (const [px, py, pr] of puffs)
            disc(ctx, c.x + px * size, c.y + py * size, pr * size, rgbString(colour));
        if (this.glow > 0 && this.bolt) {
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            this.bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.strokeStyle = `rgba(246, 205, 110, ${this.glow.toFixed(3)})`;
            ctx.lineWidth = 9 * u;
            ctx.stroke();
            ctx.strokeStyle = `rgba(255, 250, 225, ${this.glow.toFixed(3)})`;
            ctx.lineWidth = 3.5 * u;
            ctx.stroke();
        }
    }

    drawRain(ctx) {
        if (!this.drops.length) return;
        const { u } = this;
        const slant = this.wind * 0.45;
        ctx.strokeStyle = 'rgba(120, 150, 190, 0.7)';
        ctx.lineWidth = 2.2 * u;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const drop of this.drops) {
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(drop.x - slant * 14 * u, drop.y - 14 * u);
        }
        ctx.stroke();
    }

    drawFog(ctx, k) {
        const { w, h } = this;
        const t = this.time;
        ctx.save();
        ctx.globalAlpha = k * 0.6;
        for (let i = 0; i < 4; i++) {
            const y = this.hillY - h * 0.12 + i * h * 0.1;
            const x = ((t * (12 + i * 5) * this.u + i * w * 0.31) % (w * 1.6)) - w * 0.3;
            ellipse(ctx, x, y, w * 0.5, h * 0.07);
            ctx.fillStyle = '#F4F5F2';
            ctx.fill();
            ellipse(ctx, x - w * 0.8, y, w * 0.5, h * 0.07);
            ctx.fill();
        }
        ctx.restore();
    }

    drawFlowers(ctx) {
        const { u } = this;
        const t = this.time;
        for (const f of this.flowers) {
            const sway = Math.sin(t * 1.4 + f.sway) * 0.06 + this.wind * 0.35;
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.rotate(sway);
            ctx.strokeStyle = '#7FA36C';
            ctx.lineWidth = 3 * u;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, -22 * u);
            ctx.stroke();
            const open = f.open;
            const pr = (4 + open * 5) * u;
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * TAU - Math.PI / 2;
                disc(ctx, Math.cos(a) * pr * open, -22 * u + Math.sin(a) * pr * open, pr * 0.9, f.colour);
            }
            disc(ctx, 0, -22 * u, 3.5 * u, '#F6E3A2');
            ctx.restore();
        }
    }

    // The rain-stick: a long dry tube on a little stand. Each tap tips it end over end.
    drawStick(ctx) {
        const s = this.stick;
        const { u } = this;
        // The stand.
        fillRound(ctx, s.x - 34 * u, s.y + 30 * u, 68 * u, 10 * u, 5 * u, '#C9A47A');
        ellipse(ctx, s.x, s.y + 44 * u, s.len * 0.42, 9 * u);
        ctx.fillStyle = 'rgba(92, 70, 58, 0.12)';
        ctx.fill();
        ctx.save();
        ctx.translate(s.x, s.y + s.press.value * 0.6 * u);
        ctx.rotate(-0.32 + s.turn.value);
        const L = s.len;
        const T = s.thick;
        fillRound(ctx, -L / 2, -T / 2, L, T, T / 2, '#D8B17B');
        fillRound(ctx, -L / 2, -T / 2, L, T * 0.4, T * 0.2, 'rgba(255, 245, 225, 0.35)');
        ctx.fillStyle = '#B88B57';
        for (let i = 1; i < 6; i++) ctx.fillRect(-L / 2 + (L * i) / 6 - 2 * u, -T / 2, 4 * u, T);
        // Its two ends are capped, one red and one yellow, so the turn can be seen.
        disc(ctx, -L / 2 + T * 0.35, 0, T * 0.42, at(COLOURS, 'red').colour);
        disc(ctx, L / 2 - T * 0.35, 0, T * 0.42, at(COLOURS, 'yellow').colour);
        ctx.restore();
    }

    drawBells(ctx) {
        const f = this.frame;
        const { u } = this;
        // A little wooden frame: two posts and a bar.
        const left = f.x - f.w / 2;
        const right = f.x + f.w / 2;
        ellipse(ctx, f.x, f.y + f.h + 2 * u, f.w * 0.55, 9 * u);
        ctx.fillStyle = 'rgba(92, 70, 58, 0.12)';
        ctx.fill();
        fillRound(ctx, left, f.y, 10 * u, f.h, 5 * u, PALETTE.woodDark);
        fillRound(ctx, right - 10 * u, f.y, 10 * u, f.h, 5 * u, PALETTE.woodDark);
        fillRound(ctx, left - 6 * u, f.y - 4 * u, f.w + 12 * u, 12 * u, 6 * u, PALETTE.wood);
        for (const bell of this.bells) {
            const a = bell.swing.value * 0.18;
            ctx.save();
            ctx.translate(bell.x, bell.y);
            ctx.rotate(a);
            ctx.strokeStyle = PALETTE.woodEdge;
            ctx.lineWidth = 2 * u;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, bell.len - bell.r * 0.9);
            ctx.stroke();
            ctx.translate(0, bell.len);
            const r = bell.r;
            // A hand bell, mouth down, and its clapper swinging the other way.
            disc(ctx, -a * r * 2, r * 0.75, r * 0.22, shade(bell.colour, -0.35));
            ctx.beginPath();
            ctx.moveTo(-r * 0.55, -r * 0.6);
            ctx.quadraticCurveTo(-r * 0.6, r * 0.35, -r, r * 0.65);
            ctx.lineTo(r, r * 0.65);
            ctx.quadraticCurveTo(r * 0.6, r * 0.35, r * 0.55, -r * 0.6);
            ctx.quadraticCurveTo(0, -r * 1.05, -r * 0.55, -r * 0.6);
            ctx.closePath();
            ctx.fillStyle = bell.colour;
            ctx.fill();
            fillRound(ctx, -r * 1.02, r * 0.55, r * 2.04, r * 0.22, r * 0.11, shade(bell.colour, -0.15));
            ellipse(ctx, -r * 0.28, -r * 0.15, r * 0.12, r * 0.32, 0.2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fill();
            ctx.restore();
        }
    }

    drawDrum(ctx) {
        const d = this.drum;
        drawDrum(ctx, d.x, d.y, d.r, this.u, d.press.value, d.ring);
    }

    // The day so far, as a strip of sky: painted along the top in dabs, one for each piece of the
    // day gone by, in the weather it had; the sun, or the moon, at the end where it is painting now.
    // Only what has been: there is nothing to fill, as there would be in a bar.
    drawStrip(ctx) {
        const { w, u } = this;
        const x0 = 128 * u;
        const x1 = w - 40 * u;
        const y = 40 * u;
        const hgt = 20 * u;
        const piece = (x1 - x0) / STRIP;
        const strip = this.weather.strip;
        strip.forEach((kind, i) => {
            const x = x0 + (i + 0.5) * piece;
            // A dab, a little higher or lower than the last, as a brush goes.
            const wobble = Math.sin(i * 1.7) * 1.6 * u;
            if (kind === 'rainbow') {
                BOW.forEach((colour, j) => {
                    ellipse(
                        ctx,
                        x,
                        y + wobble - hgt / 2 + ((j + 0.5) * hgt) / BOW.length,
                        piece * 0.8,
                        hgt / BOW.length / 1.6
                    );
                    ctx.fillStyle = colour;
                    ctx.fill();
                });
            } else {
                ellipse(ctx, x, y + wobble, piece * 0.85, hgt / 2);
                ctx.fillStyle = STRIP_COLOURS[kind];
                ctx.fill();
            }
        });
        if (!strip.length) return;
        const now = x0 + strip.length * piece;
        const night = this.weather.day >= NIGHT;
        disc(ctx, now, y, hgt * 0.7, 'rgba(255, 252, 246, 0.7)');
        disc(ctx, now, y, hgt * 0.55, night ? '#F6EBC8' : '#F6D36B');
    }

    exit() {
        this.rainSound.stop();
        this.windSound.stop();
        freeLayer(this.land);
        freeLayer(this.night);
        this.land = null;
        this.night = null;
        this.invalidate();
    }
}

function icon(ctx, x, y, w, h, u) {
    // A hill under a sky, the sun on one side and a raining cloud on the other, and the friend.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ellipse(ctx, x + w / 2, y + h * 1.05, w * 0.7, h * 0.42);
    ctx.fillStyle = '#B4D29E';
    ctx.fill();
    disc(ctx, x + w * 0.8, y + h * 0.22, Math.min(w, h) * 0.1, '#F6D36B');
    for (const [px, py, pr] of [
        [0.18, 0.24, 0.07],
        [0.27, 0.2, 0.09],
        [0.36, 0.25, 0.07],
    ])
        disc(ctx, x + w * px, y + h * py, Math.min(w, h) * pr, '#D3DAE1');
    ctx.strokeStyle = 'rgba(120, 150, 190, 0.8)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    for (const dx of [0.2, 0.27, 0.34]) {
        ctx.moveTo(x + w * dx, y + h * 0.36);
        ctx.lineTo(x + w * dx - 3 * u, y + h * 0.44);
    }
    ctx.stroke();
    ctx.restore();
    const friend = new Friend({ mood: 'happy' });
    friend.blinkAt = 99;
    friend.time = 0.3;
    friend.draw(ctx, x + w / 2, y + h * 0.7, Math.min(w, h) * 0.17);
}

export const toy = {
    id: 'weather',
    title: 'Weather song',
    about: 'A small friend sits on a hill, and the music is its weather: the rain-stick brings a drizzle and a sleepy friend under a leaf, the bells bring the sun and a dance. At Sprout the big drum brings thunder and a cross friend, who sighs and smiles when it rolls away. A whole day of weather, morning to night.',
    stages: [
        'Sunny and sleepy: a rain-stick and three bells',
        'And cross, and calm after: the big drum',
        'And shy in the fog, proud of a rainbow, and the day painted as a strip of sky',
    ],
    isNew: true,
    mat: shade(PALETTE.sky, 0.35),
    icon,
    create: (app) => new WeatherScene(app),
    sounds(level) {
        const stage = STAGES[level];
        const names = stage.bells === 3 ? ['red', 'yellow', 'green'] : COLOURS.map((c) => c.name);
        const list = names.map((name) => ['chime', { f: noteHz(at(COLOURS, name).degree, 72) }]);
        list.push(
            ['rainstick', {}],
            ['sigh', {}],
            ['pop', { f: 700 }],
            ['tink', { f: 2000 }],
            ['hoot', { f: noteHz(2, 60) }],
            ['chirp', { f: noteHz(2, 96) }],
            ['chirp', { f: noteHz(0, 96), variant: 'peep' }],
            ['pat', {}]
        );
        if (stage.drum) list.push(['drum', {}], ['thud', { f: 85 }], ['thunder', {}]);
        if (stage.rainbow)
            for (const degree of [0, 2, 3, 4, 5]) list.push(['musicBox', { f: noteHz(degree, 72) }]);
        return list;
    },
    signature() {
        audio.note('chime', 4, 72, { gain: 0.5, delay: 0.05 });
        audio.note('chime', 2, 72, { gain: 0.45, delay: 0.22 });
    },
};
