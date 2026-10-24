// The shelf: the home of the playroom, and the place every toy goes back to.
//
// A Montessori room keeps its materials on low open shelves, one activity to a tray, ordered from
// simple to complex, left to right and top to bottom, with nothing hidden in a menu. This is that
// shelf. Each toy sits on a felt mat in a wooden tray, drawn as a small picture of itself, and
// touching the tray lifts the toy out of it; going home puts it back.
//
// There is no text. A child who cannot read can see every choice, and the grown-up's settings are
// behind a press-and-hold on the leaf in the corner.
//
// The shelf opens and closes the day the same way each time, as a ritual does. Hello: arriving
// from the bud, the trays wake one by one, each with a note, climbing the scale. Goodnight: the
// picture on the wall is a window, and a tap on its moon brings the night. The sun sets, the room
// dims, and the toys fall asleep one by one, the last tray first, each to the next note of a
// lullaby; a tap on a tray tucks it in at once. Or, if a grown-up has chosen so, each toy stays
// awake until the child tucks it in, and the night waits for him. When the last is asleep the
// lullaby ends and the playroom closes to its bud. A grown-up's goodnight timer (see main.js) sets
// the sun in the window as it runs, and brings the night when it ends.

import { Scene } from './stage.js';
import {
    PALETTE,
    SHADOW,
    SHADOW_SOFT,
    makeLayer,
    freeLayer,
    grain,
    fillRound,
    roundRect,
    woodPanel,
    ellipse,
    disc,
} from './draw.js';
import { Spring, shade, clamp, lerp, mixRgb, hexToRgb, rgbString } from './util.js';
import { noteHz } from './synth.js';
import * as audio from './audio.js';

// Hello climbs the scale, a tray a note, quickly; goodnight's lullaby is slower, a tray a note,
// and ends with its own three notes once every tray is asleep. Both stay on the playroom's scale.
const HELLO_GAP = 0.11;
const LULLABY = [3, 2, 3, 4, 3, 2, 3, 2, 1, 0, 2, 3, 4, 5, 4, 3];
const LULLABY_END = [2, 1, 0];
const SLEEP_GAP = 0.9;
const DUSK = 1.5;

// Every sound the hello and goodnight ask for, so the shelf can have them ready.
export function shelfSounds() {
    const list = [];
    for (let d = 0; d <= 12; d++) list.push(['marimba', { f: noteHz(d, 60) }]);
    for (const d of LULLABY.concat(LULLABY_END)) list.push(['musicBox', { f: noteHz(d, 72) }]);
    list.push(['hoot', { f: noteHz(2, 60) }]);
    return list;
}

export class ShelfScene extends Scene {
    constructor(app) {
        super(app);
        this.items = [];
        this.bg = null;
        // The hello in progress, and the night: null while it is day.
        this.greeting = null;
        this.night = null;
        this.ticker = 0;
    }

    // Arriving from the bud: the trays wake one by one, if the hello is on.
    greet() {
        this.night = null;
        this.greeting = this.app.settings.extras.hello ? { t: 0, woken: 0 } : null;
    }

    layout() {
        this.release();
        const previous = this.items;
        const { w, h, u } = this;
        const toys = this.app.visibleToys();
        const n = Math.max(1, toys.length);

        // A low shelf standing on the floor, as tall as its rows of trays need and no taller.
        const floor = h * 0.87;
        const margin = Math.max(20 * u, w * 0.05);
        const available = { w: w - margin * 2, h: floor - h * 0.17 };

        // Choose the grid that gives the largest trays of a sensible shape.
        let best = null;
        for (let rows = 1; rows <= 4; rows++) {
            const cols = Math.ceil(n / rows);
            let trayW = (available.w / cols) * 0.86;
            let trayH = (available.h / rows) * 0.72;
            trayH = Math.min(trayH, trayW * 0.9);
            trayW = Math.min(trayW, trayH * 1.25);
            const area = trayW * trayH;
            if (!best || area > best.area) best = { rows, cols, trayW, trayH, area };
        }
        best.cellW = available.w / best.cols;
        best.cellH = Math.min(available.h / best.rows, best.trayH / 0.72);
        const unit = { x: margin, w: available.w, h: best.cellH * best.rows };
        unit.y = floor - unit.h - 8 * u;
        this.grid = best;
        this.unit = unit;
        this.floor = floor;

        this.items = toys.map((toy, i) => {
            const row = Math.floor(i / best.cols);
            const col = i % best.cols;
            const plankY = unit.y + best.cellH * (row + 1) - 14 * u;
            const x = unit.x + best.cellW * col + (best.cellW - best.trayW) / 2;
            const y = plankY - best.trayH - 4 * u;
            return {
                toy,
                x,
                y,
                w: best.trayW,
                h: best.trayH,
                press: new Spring(0, 520, 24),
                wake: new Spring(1, 260, 13),
                asleep: false,
                asleepAt: 0,
                layer: null,
            };
        });
        // Laid out again mid-hello or mid-goodnight (a rotation): each tray keeps where it was.
        for (const item of this.items) {
            const was = previous.find((old) => old.toy === item.toy);
            if (!was) continue;
            item.wake.value = was.wake.value;
            item.wake.target = was.wake.target;
            item.asleep = was.asleep;
            item.asleepAt = was.asleepAt;
        }
        // The window on the wall, where the picture used to hang, above the shelf's top.
        const ww = 104 * u;
        const wh = 80 * u;
        const wy = clamp(Math.max(64 * u, unit.y * 0.5), wh / 2 + 10 * u, unit.y - 30 * u - wh / 2);
        this.window = { x: w * 0.72 - ww / 2, y: wy - wh / 2, w: ww, h: wh };

        this.drawBackground();
        for (const item of this.items) this.drawTray(item);
    }

    drawBackground() {
        const { w, h, u, unit, grid } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;

        const wall = ctx.createLinearGradient(0, 0, 0, this.floor);
        wall.addColorStop(0, shade(PALETTE.wall, 0.35));
        wall.addColorStop(1, PALETTE.wall);
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, this.floor);
        ctx.fillStyle = PALETTE.floor;
        ctx.fillRect(0, this.floor, w, h - this.floor);
        ctx.fillStyle = shade(PALETTE.floor, -0.12);
        ctx.fillRect(0, this.floor, w, 5 * u);
        ellipse(ctx, w / 2, this.floor + (h - this.floor) * 0.62, w * 0.36, (h - this.floor) * 0.3);
        ctx.fillStyle = 'rgba(188, 211, 168, 0.55)';
        ctx.fill();

        // The unit: two posts and a plank under each row of trays.
        const post = 16 * u;
        for (const x of [unit.x - post * 0.6, unit.x + unit.w - post * 0.4]) {
            fillRound(ctx, x + 5 * u, unit.y + 5 * u, post, this.floor - unit.y - 5 * u, 4 * u, SHADOW_SOFT);
            woodPanel(
                ctx,
                x,
                unit.y - 10 * u,
                post,
                this.floor - unit.y + 10 * u,
                5 * u,
                PALETTE.woodDark,
                3,
                this.scale
            );
        }
        for (let row = 0; row < grid.rows; row++) {
            const y = unit.y + grid.cellH * (row + 1) - 14 * u;
            fillRound(ctx, unit.x, y + 14 * u, unit.w, 10 * u, 3 * u, SHADOW_SOFT);
            woodPanel(
                ctx,
                unit.x - post * 0.5,
                y,
                unit.w + post,
                16 * u,
                4 * u,
                PALETTE.wood,
                10 + row,
                this.scale
            );
            ctx.fillStyle = shade(PALETTE.woodDark, -0.05);
            ctx.fillRect(unit.x - post * 0.5 + 4 * u, y + 12 * u, unit.w + post - 8 * u, 4 * u);
        }
        woodPanel(
            ctx,
            unit.x - post * 0.8,
            unit.y - 22 * u,
            unit.w + post * 1.6,
            16 * u,
            4 * u,
            PALETTE.wood,
            9,
            this.scale
        );

        this.drawPlant(ctx, unit.x + 60 * u, unit.y - 22 * u);

        grain(ctx, 0, 0, w, h, 0.22, this.scale);
        this.bg = layer;
    }

    // The window: hills under a sun, and, when the goodnight moon is on, a pale moon waiting in its
    // sky. `dusk` 0 is day; towards 1 the sun sets behind the hills, the sky deepens to night, the
    // moon rises and brightens, and stars come out.
    drawWindow(ctx, dusk, moon) {
        const u = this.u;
        const { x, y, w, h } = this.window;
        fillRound(ctx, x + 4 * u, y + 5 * u, w, h, 6 * u, SHADOW_SOFT);
        fillRound(ctx, x, y, w, h, 6 * u, PALETTE.woodDark);
        ctx.save();
        roundRect(ctx, x + 7 * u, y + 7 * u, w - 14 * u, h - 14 * u, 3 * u);
        const day = hexToRgb(PALETTE.cream);
        const evening = [246, 196, 160];
        const night = [47, 58, 99];
        const sky = dusk < 0.5 ? mixRgb(day, evening, dusk * 2) : mixRgb(evening, night, (dusk - 0.5) * 2);
        ctx.fillStyle = rgbString(sky);
        ctx.fill();
        ctx.clip();
        if (dusk > 0.6) {
            const stars = (dusk - 0.6) / 0.4;
            for (const [sx, sy] of [
                [0.2, 0.25],
                [0.42, 0.18],
                [0.8, 0.3],
                [0.58, 0.4],
                [0.3, 0.45],
            ])
                disc(ctx, x + w * sx, y + h * sy, 1.6 * u, `rgba(255, 246, 214, ${stars * 0.9})`);
        }
        disc(ctx, x + w * 0.66, y + h * lerp(0.42, 1.05, clamp(dusk * 1.3, 0, 1)), h * 0.16, PALETTE.butter);
        if (moon) {
            const mx = x + w * lerp(0.28, 0.36, dusk);
            const my = y + h * lerp(0.36, 0.3, dusk);
            const mr = h * lerp(0.12, 0.16, dusk);
            disc(ctx, mx, my, mr, `rgba(255, 244, 200, ${lerp(0.55, 1, dusk)})`);
            disc(ctx, mx + mr * 0.45, my - mr * 0.25, mr * 0.85, rgbString(sky));
        }
        ellipse(ctx, x + w * 0.3, y + h * 0.95, w * 0.45, h * 0.38);
        ctx.fillStyle = rgbString(mixRgb(hexToRgb(PALETTE.sage), [40, 52, 82], dusk * 0.7));
        ctx.fill();
        ellipse(ctx, x + w * 0.8, y + h, w * 0.4, h * 0.3);
        ctx.fillStyle = rgbString(mixRgb(hexToRgb(PALETTE.sageDeep), [34, 44, 72], dusk * 0.7));
        ctx.fill();
        ctx.restore();
    }

    drawPlant(ctx, x, base) {
        const u = this.u;
        const leaves = [
            [-0.9, 44],
            [-0.35, 54],
            [0.25, 50],
            [0.8, 40],
            [-1.4, 30],
            [1.3, 32],
        ];
        for (let i = 0; i < leaves.length; i++) {
            const angle = leaves[i][0] - Math.PI / 2;
            const len = leaves[i][1] * u;
            ctx.save();
            ctx.translate(x, base - 26 * u);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
            ctx.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
            ctx.fillStyle = i % 2 ? PALETTE.sageDeep : PALETTE.sage;
            ctx.fill();
            ctx.restore();
        }
        ctx.beginPath();
        ctx.moveTo(x - 24 * u, base - 32 * u);
        ctx.lineTo(x + 24 * u, base - 32 * u);
        ctx.lineTo(x + 18 * u, base);
        ctx.lineTo(x - 18 * u, base);
        ctx.closePath();
        ctx.fillStyle = PALETTE.peachDeep;
        ctx.fill();
        ctx.fillStyle = shade(PALETTE.peachDeep, -0.1);
        ctx.fillRect(x - 26 * u, base - 36 * u, 52 * u, 8 * u);
    }

    drawTray(item) {
        const u = this.u;
        const pad = 12 * u;
        const layer = makeLayer(item.w + pad * 2, item.h + pad * 2, this.scale);
        const ctx = layer.ctx;
        const x = pad;
        const y = pad;
        const r = 14 * u;

        fillRound(ctx, x + 2 * u, y + 7 * u, item.w, item.h, r, SHADOW);
        woodPanel(ctx, x, y, item.w, item.h, r, PALETTE.wood, item.toy.id.length * 7, this.scale);
        const inset = 9 * u;
        fillRound(
            ctx,
            x + inset,
            y + inset,
            item.w - inset * 2,
            item.h - inset * 2,
            r * 0.6,
            shade(PALETTE.woodDark, -0.04)
        );
        const mat = 12 * u;
        const mx = x + mat;
        const my = y + mat + 1 * u;
        const mw = item.w - mat * 2;
        const mh = item.h - mat * 2;
        fillRound(ctx, mx, my, mw, mh, r * 0.5, item.toy.mat);
        grain(ctx, mx, my, mw, mh, 0.45, this.scale);

        ctx.save();
        roundRect(ctx, mx, my, mw, mh, r * 0.5);
        ctx.clip();
        item.toy.icon(ctx, mx, my, mw, mh, u);
        ctx.restore();

        item.layer = layer;
        item.pad = pad;
    }

    hit(x, y) {
        const slop = 6 * this.u;
        for (const item of this.items) {
            if (
                x > item.x - slop &&
                x < item.x + item.w + slop &&
                y > item.y - slop &&
                y < item.y + item.h + slop
            )
                return item;
        }
        return null;
    }

    rectOf(id) {
        const item = this.items.find((it) => it.toy.id === id);
        if (!item) return { x: this.w / 2 - 50, y: this.h / 2 - 50, w: 100, h: 100, r: 14 };
        return { x: item.x, y: item.y, w: item.w, h: item.h, r: 14 * this.u };
    }

    // The window answers only while the goodnight moon is on; a tap on it brings the night.
    inWindow(x, y) {
        const r = this.window;
        const slop = 10 * this.u;
        return x > r.x - slop && x < r.x + r.w + slop && y > r.y - slop && y < r.y + r.h + slop;
    }

    down(p) {
        if (this.app.settings.extras.goodnight && !this.night && this.inWindow(p.x, p.y)) {
            p.owner = { window: true };
            return;
        }
        const item = this.hit(p.x, p.y);
        if (!item) return;
        if (this.night) {
            // At night a tap tucks a tray in.
            if (!item.asleep) this.tuck(item);
            return;
        }
        p.owner = item;
        item.press.target = 1;
        audio.play('wood', { f: 1046.5 }, { gain: 0.65, wet: 0.1, pan: (p.x / this.w) * 2 - 1 });
    }

    move(p) {
        const item = p.owner;
        if (!item || item.window) return;
        const slop = 24 * this.u;
        if (
            p.x < item.x - slop ||
            p.x > item.x + item.w + slop ||
            p.y < item.y - slop ||
            p.y > item.y + item.h + slop
        ) {
            item.press.target = 0;
            p.owner = null;
        }
    }

    up(p) {
        const item = p.owner;
        if (!item) return;
        if (item.window) {
            if (this.inWindow(p.x, p.y) && !this.app.stage.busy) this.beginNight();
            return;
        }
        item.press.target = 0;
        if (!this.app.stage.busy) {
            // Any tray still to wake wakes now: the hello is over once a toy is chosen.
            this.greeting = null;
            for (const it of this.items) it.wake.value = it.wake.target = 1;
            this.app.openToy(item.toy.id);
        }
    }

    cancel(p) {
        if (p.owner && !p.owner.window) p.owner.press.target = 0;
    }

    //--------------------------------------------------------------------------
    // Hello and goodnight

    beginNight() {
        if (this.night) return;
        this.greeting = null;
        this.duskFrom = this.dusk();
        this.night = { t: 0, tucked: 0, next: SLEEP_GAP + DUSK, lastTuck: -SLEEP_GAP, ending: -1 };
        for (const item of this.items) item.wake.value = item.wake.target = 1;
        audio.play('hoot', { f: noteHz(2, 60) }, { gain: 0.55, wet: 0.45, delay: 0.7 });
    }

    // A tray falls asleep to the lullaby's next note.
    tuck(item) {
        const night = this.night;
        item.asleep = true;
        item.asleepAt = night.t;
        night.lastTuck = night.t;
        const degree = LULLABY[night.tucked % LULLABY.length];
        night.tucked++;
        audio.play(
            'musicBox',
            { f: noteHz(degree, 72) },
            { gain: 0.85, wet: 0.4, pan: ((item.x + item.w / 2) / this.w) * 2 - 1 }
        );
    }

    // A toy still awake at night, when the child is to tuck them in, stirs now and then: this one
    // still wants tucking in.
    stir() {
        const night = this.night;
        if (!night || night.ending >= 0) return;
        const awake = this.items.filter((item) => !item.asleep);
        if (!awake.length) return;
        // A quick hop on the press spring, which settles in half a second.
        awake[Math.floor(Math.random() * awake.length)].press.kick(-5);
        this.app.stage.wake();
    }

    // How far the day has gone: the night's own dusk, or the sun setting as a grown-up's timer runs.
    dusk() {
        if (this.night) return clamp(this.duskFrom + (this.night.t / DUSK) * (1 - this.duskFrom), 0, 1);
        const app = this.app;
        if (!app.bedtime) return 0;
        const span = Math.max(1, app.bedtime - app.bedtimeFrom);
        return clamp((Date.now() - app.bedtimeFrom) / span, 0, 1) * 0.6;
    }

    update(dt) {
        let busy = false;
        for (const item of this.items) {
            if (item.press.update(dt)) busy = true;
            if (item.wake.update(dt)) busy = true;
        }

        const greeting = this.greeting;
        if (greeting) {
            // Every tray starts asleep, and wakes in its turn.
            if (!greeting.started) {
                greeting.started = true;
                for (const item of this.items) item.wake.value = item.wake.target = 0;
            }
            greeting.t += dt;
            busy = true;
            // The trays wake once the shelf has faded in, one by one, climbing the scale: a note a tray,
            // spread over the thirteen there are however many trays are out.
            const climb = Math.max(1, this.items.length - 1);
            while (greeting.woken < this.items.length && greeting.t >= 0.55 + greeting.woken * HELLO_GAP) {
                const item = this.items[greeting.woken];
                item.wake.target = 1;
                item.wake.kick(5);
                const degree = Math.round((greeting.woken * Math.min(12, climb)) / climb);
                audio.note('marimba', degree, 60, {
                    gain: 0.7,
                    wet: 0.25,
                    pan: ((item.x + item.w / 2) / this.w) * 2 - 1,
                });
                greeting.woken++;
            }
            if (greeting.woken >= this.items.length) this.greeting = null;
        }

        // A grown-up's timer has run out: the night comes, once the shelf is out and still, and the
        // grown-ups' corner is closed.
        const app = this.app;
        if (
            !this.night &&
            app.bedtime &&
            Date.now() >= app.bedtime &&
            app.stage.scene === this &&
            !app.stage.busy &&
            !app.cornerOpen
        ) {
            this.beginNight();
        }

        const night = this.night;
        if (night) {
            night.t += dt;
            const themselves = app.settings.tuck !== 'child';
            const awake = this.items.filter((item) => !item.asleep);
            if (night.ending < 0) {
                if (!awake.length) {
                    // A beat after the last is tucked in, the lullaby ends.
                    if (night.t >= night.lastTuck + SLEEP_GAP) {
                        night.ending = night.t;
                        LULLABY_END.forEach((degree, i) =>
                            audio.play(
                                'musicBox',
                                { f: noteHz(degree, 72) },
                                { gain: 0.8, wet: 0.45, delay: 0.6 + i * 0.6 }
                            )
                        );
                    }
                } else if (themselves && night.t >= night.next) {
                    // The toys fall asleep by themselves, the last tray first, unless tucked in sooner.
                    this.tuck(awake[awake.length - 1]);
                    night.next = night.t + SLEEP_GAP;
                }
            }
            // Waiting for the child to tuck the rest in, the shelf is still and draws nothing, but
            // now and then a toy still awake stirs.
            const waiting = !themselves && night.ending < 0 && awake.length > 0 && night.t > DUSK + 0.6;
            if (!waiting) busy = true;
            else if (!this.ticker) {
                this.ticker = setTimeout(() => {
                    this.ticker = 0;
                    this.stir();
                }, 3000);
            }
            if (night.ending >= 0 && night.t >= night.ending + 0.6 + LULLABY_END.length * 0.6 + 1.2) {
                this.night = null;
                for (const item of this.items) item.asleep = false;
                app.sleep();
            }
        } else if (app.bedtime && app.stage.scene === this && !this.ticker) {
            // While the moon a grown-up set is rising, the shelf looks again every second or so.
            this.ticker = setTimeout(() => {
                this.ticker = 0;
                app.stage.wake();
            }, 1000);
        }
        return busy;
    }

    draw(ctx) {
        const u = this.u;
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);
        const dusk = this.dusk();
        // The moon is in the window while the child can tap it, or while a timer brings it.
        const goodnight = this.app.settings.extras.goodnight || !!this.app.bedtime;
        const night = this.night;
        const dim = night ? clamp(night.t / DUSK, 0, 1) : 0;
        for (const item of this.items) {
            const awake = clamp(item.wake.value, 0, 1.2);
            const s = (1 - item.press.value * 0.06) * (0.9 + 0.1 * awake);
            const lw = (item.w + item.pad * 2) * s;
            const lh = (item.h + item.pad * 2) * s;
            const cx = item.x + item.w / 2;
            const cy = item.y + item.h / 2 + item.press.value * 3 * u + (1 - Math.min(1, awake)) * 10 * u;
            ctx.globalAlpha = clamp(0.35 + 0.65 * awake, 0, 1);
            ctx.drawImage(item.layer.canvas, cx - lw / 2, cy - lh / 2, lw, lh);
            ctx.globalAlpha = 1;
        }
        if (dim > 0) {
            ctx.fillStyle = `rgba(30, 38, 72, ${0.34 * dim})`;
            ctx.fillRect(0, 0, this.w, this.h);
            for (const item of this.items)
                if (item.asleep) this.drawAsleep(ctx, item, night.t - item.asleepAt);
        }
        this.drawWindow(ctx, dusk, goodnight);
    }

    // A tray asleep: darker, with a little z rising from it.
    drawAsleep(ctx, item, age) {
        const u = this.u;
        const k = clamp(age / 0.6, 0, 1);
        fillRound(ctx, item.x, item.y, item.w, item.h, 14 * u, `rgba(30, 38, 72, ${0.3 * k})`);
        const zx = item.x + item.w - 26 * u;
        const zy = item.y + 18 * u - k * 10 * u;
        const z = 9 * u;
        ctx.save();
        ctx.globalAlpha = k;
        ctx.strokeStyle = 'rgba(255, 246, 214, 0.95)';
        ctx.lineWidth = 2.6 * u;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(zx - z / 2, zy - z / 2);
        ctx.lineTo(zx + z / 2, zy - z / 2);
        ctx.lineTo(zx - z / 2, zy + z / 2);
        ctx.lineTo(zx + z / 2, zy + z / 2);
        ctx.stroke();
        ctx.restore();
    }

    release() {
        freeLayer(this.bg);
        this.bg = null;
        for (const item of this.items) freeLayer(item.layer);
    }

    // Put away after goodnight: its layers go now, and come back when it is next shown, though at
    // the same size.
    exit() {
        clearTimeout(this.ticker);
        this.ticker = 0;
        this.release();
        this.invalidate();
    }
}
