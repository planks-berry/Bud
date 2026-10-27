// The Bakery: flour and water, a bowl, and an oven with a window. He pours and stirs in circles,
// kneads with presses, and puts the bun in the oven, where it rises and browns slowly to a soft
// ticking song. Meanwhile he can make the next one, or decorate the last. Then the animals line up
// for a piece.
//
//   touch  - tap a jar for a puff of flour, the jug for a splash; tap the dough to knead it; tap
//            what has come out of the oven to share it, a piece each; tap an animal and it calls.
//   move   - carry a jar over the bowl and it pours; stir round and round; carry the dough to the
//            oven. From Sprout, roll it out with the rolling pin, cut it with a cutter, sprinkle
//            things on it from a jar held over it.
//   make   - bread, buns, and at Bloom a cake with candles for the friend's birthday.
//
// Cookie Monster learns ways to wait for his cookies: something to watch, something to do meanwhile;
// Mister Rogers' factory visits; Montessori's practical life. Watch for: does he stay with the oven,
// or go off and come back for it? Both are waiting well.
//
// Seed: one bun, and twenty seconds in the oven. Sprout: rolls and shapes and toppings, and two in the
// oven at once. Bloom: a recipe on the wall in pictures, three steps for a cake; a cake with no eggs in
// it comes out flat, and is eaten just as happily.
//
// The rules are baking.js; the pictures bakeryart.js; the animals Freeze Parade's.

import { Scene } from '../stage.js';
import { PALETTE, makeLayer, freeLayer, grain, ellipse, disc } from '../draw.js';
import { Spring, clamp, lerp, dist, shade, easeOutCubic, TAU } from '../util.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { Friend } from '../friend.js';
import { DRAW, SIZE } from './paradeart.js';
import {
    STAGES,
    pantry,
    POUR,
    mixOf,
    stirred,
    stirNeeded,
    CUTTERS,
    TOPPINGS,
    ROLL,
    MOST_TOPPINGS,
    baking,
    TICK,
    OVEN_SONG,
    STIR_TUNE,
    BIRTHDAY,
    TUNE_BEAT,
    timings,
    piecesFor,
    CANDLES,
} from './baking.js';
import {
    drawKitchen,
    drawJar,
    drawPuff,
    drawStream,
    drawBowlBack,
    drawBowlInside,
    drawBowlFront,
    drawSpoon,
    drawDough,
    drawCake,
    drawCandles,
    drawCandleBox,
    drawRollingPin,
    drawCutter,
    drawBoard,
    drawRack,
    drawOvenBody,
    drawOvenFront,
    drawOvenLight,
    drawRecipe,
} from './bakeryart.js';

// Untouched this long, with nothing in the oven, the kitchen rests.
const IDLE = 40;
// How far a finger moves before a touch is a carry rather than a tap.
const CARRY = 14;
// Each ingredient's note, when the bowl has enough of it.
const FULL_NOTE = { flour: 0, water: 2, egg: 3, sugar: 4 };
// The animals' voices, as in the parade.
const VOICES = {
    cow: ['moo', { f: noteHz(-5, 60) }],
    sheep: ['baa', { f: noteHz(0, 60) }],
    pig: ['oink', { f: noteHz(-4, 60) }],
    duck: ['quack', { f: noteHz(1, 60) }],
};
const DROPS = [noteHz(2, 72), noteHz(3, 72), noteHz(4, 72)];

function emptyBowl() {
    return { flour: 0, water: 0, egg: 0, sugar: 0, stir: 0, angle: 0, ready: null, readyAt: 0 };
}

class BakeryScene extends Scene {
    constructor(app) {
        super(app);
        this.level = app.level();
        this.stage = STAGES[this.level];
        this.time = 0;
        this.touched = 0;
        this.mix = emptyBowl();
        this.dough = null;
        this.slots = [];
        for (let i = 0; i < this.stage.oven; i++) this.slots.push(null);
        this.rackItems = [null, null];
        this.animals = [];
        this.friend = null;
        this.friendRise = new Spring(0, 90, 13);
        this.tune = null;
        this.puffs = [];
        this.flying = [];
        this.held = null;
        this.hints = [];
        this.door = new Spring(0, 120, 16);
        this.doorShutAt = 0;
        this.glow = 0;
        this.ticks = 0;
        this.tickAt = 0;
        this.bowlWobble = new Spring(0, 260, 12);
        this.recipe = 0;
        this.jarShake = {};
        this.bg = null;
    }

    //--------------------------------------------------------------------------
    // The kitchen

    layout() {
        const { w, h, u } = this;
        const portrait = h > w;
        this.portrait = portrait;
        // Whatever was in his hand goes back to its place.
        this.held = null;
        const at = portrait
            ? { back: h * 0.5, front: h * 0.68, face: h * 0.8, floor: h * 0.96 }
            : { back: h * 0.5, front: h * 0.74, face: h * 0.86, floor: h * 0.975 };
        at.shelf = portrait
            ? { y: h * 0.26, x0: w * 0.02, x1: w * 0.6 }
            : { y: h * 0.3, x0: w * 0.02, x1: w * 0.66 };
        this.at = at;
        const ov = portrait
            ? { x: w * 0.64, y: h * 0.06, w: w * 0.33, h: h * 0.33 }
            : { x: w * 0.7, y: h * 0.06, w: w * 0.27, h: h * 0.41 };
        ov.panel = ov.h * 0.2;
        ov.window = {
            x: ov.x + ov.w * 0.12,
            y: ov.y + ov.panel + ov.h * 0.05,
            w: ov.w * 0.76,
            h: ov.h * 0.6,
        };
        this.oven = ov;
        this.bowl = portrait
            ? { x: w * 0.17, y: h * 0.57, r: w * 0.12 }
            : { x: w * 0.13, y: h * 0.6, r: w * 0.075 };
        this.board = portrait
            ? { x: w * 0.47, y: h * 0.585, w: w * 0.32, h: h * 0.1 }
            : { x: w * 0.42, y: h * 0.62, w: w * 0.26, h: h * 0.15 };
        this.rack = portrait
            ? { x: w * 0.805, y: h * 0.575, w: w * 0.3, h: h * 0.07 }
            : { x: w * 0.835, y: h * 0.6, w: w * 0.22, h: h * 0.1 };
        this.dk = (portrait ? 84 : 96) * u;
        this.jk = (portrait ? 58 : 66) * u;
        // The jars along the shelf: what goes in the bowl, then from Sprout what goes on top.
        const kinds = pantry(this.level).concat(this.stage.toppings ? TOPPINGS : []);
        const span = at.shelf.x1 - at.shelf.x0 - 40 * u;
        this.jars = kinds.map((kind, i) => {
            const x = at.shelf.x0 + 20 * u + (span * (i + 0.5)) / kinds.length;
            const old = (this.jars || []).find((j) => j.kind === kind);
            return {
                kind,
                home: { x, y: at.shelf.y - 4 * u },
                x,
                y: at.shelf.y - 4 * u,
                tilt: old ? old.tilt : new Spring(0, 160, 14),
                topping: TOPPINGS.indexOf(kind) >= 0,
            };
        });
        // From Sprout, the cutters hang under the shelf and the rolling pin lies by the board.
        this.cutters = [];
        if (this.stage.shapes) {
            CUTTERS.forEach((shape, i) => {
                const x = portrait ? w * (0.08 + i * 0.1) : w * (0.24 + i * 0.07);
                this.cutters.push({ shape, home: { x, y: portrait ? h * 0.36 : h * 0.405 }, k: 44 * u });
            });
            this.pin = {
                home: portrait ? { x: w * 0.47, y: h * 0.655 } : { x: w * 0.42, y: h * 0.725 },
                k: (portrait ? 150 : 170) * u,
            };
        } else this.pin = null;
        this.candleBox = this.stage.cake
            ? portrait
                ? { x: w * 0.81, y: h * 0.665, k: 64 * u }
                : { x: w * 0.62, y: h * 0.72, k: 70 * u }
            : null;
        this.card = this.stage.cake
            ? portrait
                ? { x: w * 0.13, y: h * 0.03, w: w * 0.47, h: h * 0.1 }
                : { x: w * 0.1, y: h * 0.04, w: w * 0.34, h: h * 0.15 }
            : null;
        // Where the animals wait for a piece: in a line on the floor, up to the rack.
        this.ak = (portrait ? 84 : 96) * u;
        const step = portrait ? w * 0.15 : w * 0.105;
        this.line = [0, 1, 2, 3].map((i) => ({
            x: this.rack.x - (portrait ? w * 0.12 : w * 0.05) - i * step,
            y: at.floor,
        }));
        this.friendAt = portrait
            ? { x: w * 0.6, y: at.back + 14 * u, r: 36 * u }
            : { x: w * 0.62, y: at.back + 16 * u, r: 42 * u };
        for (const a of this.animals) a.y = at.floor;
        freeLayer(this.bg);
        this.bg = this.drawKitchenLayer();
        // Each jar and cutter drawn once into a small layer of its own; each frame only places it,
        // tipped as it pours.
        this.freeSprites();
        this.sprites = {};
        const jk = this.jk;
        for (const jar of this.jars) {
            const layer = makeLayer(jk * 1.3, jk * 1.35, this.scale);
            drawJar(layer.ctx, jar.kind, jk * 0.65, jk * 1.25, jk, 0, this.levelOf(jar.kind));
            this.sprites[jar.kind] = layer;
        }
        const win = this.oven.window;
        const light = makeLayer(win.w, win.h, this.scale);
        drawOvenLight(light.ctx, win.w, win.h);
        this.sprites.light = light;
        for (const c of this.cutters) {
            const layer = makeLayer(c.k * 1.3, c.k * 1.3, this.scale);
            drawCutter(layer.ctx, c.shape, c.k * 0.65, c.k * 0.65, c.k);
            this.sprites[c.shape] = layer;
        }
    }

    drawKitchenLayer() {
        const { w, h, u } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;
        drawKitchen(ctx, w, h, u, this.at);
        grain(ctx, 0, 0, w, h, 0.12, this.scale);
        drawOvenBody(ctx, this.oven, u);
        const b = this.board;
        drawBoard(ctx, b.x, b.y, b.w, b.h, u);
        const r = this.rack;
        drawRack(ctx, r.x, r.y, r.w, r.h, u);
        if (this.card) drawRecipe(ctx, this.card.x, this.card.y, this.card.w, this.card.h, u, 0);
        // The hooks the cutters hang on.
        for (const c of this.cutters) disc(ctx, c.home.x, c.home.y - c.k * 0.55, 3 * u, '#B59670');
        return layer;
    }

    //--------------------------------------------------------------------------
    // Sounds

    pan(x) {
        return clamp((x / this.w) * 2 - 1, -1, 1) * 0.7;
    }

    //--------------------------------------------------------------------------
    // Time

    update(dt) {
        this.time += dt;
        let busy = false;
        const resting = this.time - this.touched > IDLE;
        for (const spring of [this.door, this.bowlWobble, this.friendRise])
            if (spring.update(dt)) busy = true;
        if (this.held) busy = true;
        for (const jar of this.jars) {
            if (jar.tilt.update(dt)) busy = true;
            if (jar !== (this.held && this.held.jar) && (jar.x !== jar.home.x || jar.y !== jar.home.y)) {
                // Back to its place on the shelf.
                jar.x = lerp(jar.x, jar.home.x, Math.min(1, dt * 12));
                jar.y = lerp(jar.y, jar.home.y, Math.min(1, dt * 12));
                if (dist(jar.x, jar.y, jar.home.x, jar.home.y) < 0.5) {
                    jar.x = jar.home.x;
                    jar.y = jar.home.y;
                }
                busy = true;
            }
        }
        if (this.dough && this.dough.squash.update(dt)) busy = true;
        if (this.pourFrom(dt)) busy = true;

        // The mix, come together, leaves the bowl for the board once the board is free.
        const m = this.mix;
        if (m.ready) {
            busy = true;
            if (this.time > m.readyAt && !this.dough && !(this.held && this.held.item)) this.toBoard();
        }

        if (this.bake(dt)) busy = true;
        if (this.serve(dt)) busy = true;
        if (this.birthday(dt, resting)) busy = true;

        // Puffs, things in the air, and hints fade.
        for (const puff of this.puffs) puff.t += dt / 0.9;
        this.puffs = this.puffs.filter((puff) => puff.t < 1);
        for (const f of this.flying) f.t += dt / f.length;
        for (const f of this.flying.filter((f) => f.t >= 1)) f.land();
        this.flying = this.flying.filter((f) => f.t < 1);
        for (const hint of this.hints) hint.t += dt;
        this.hints = this.hints.filter((hint) => hint.t < 1.2);
        if (this.puffs.length || this.flying.length || this.hints.length) busy = true;
        // A bun waiting to go in: the oven's light blinks now and then to show where.
        if (this.dough && this.dough.smooth && !this.held && !resting && this.slots.indexOf(null) >= 0)
            busy = true;
        return busy || (!resting && this.animals.length > 0);
    }

    // A jar held over the bowl pours into it.
    pourFrom(dt) {
        const held = this.held;
        if (!held || !held.jar) return false;
        const jar = held.jar;
        const over = held.moved && this.overBowl(jar.x, jar.y);
        const mix = this.mix;
        if (jar.topping) {
            jar.tilt.target = this.toppingTarget(jar.x, jar.y) ? 1.9 * (jar.x < this.board.x ? 1 : -1) : 0;
            const target = this.toppingTarget(jar.x, jar.y);
            if (target && Math.abs(jar.tilt.value) > 1.2) {
                held.every = (held.every || 0) + dt;
                if (held.every > 0.14) {
                    held.every = 0;
                    this.sprinkle(target, jar.kind);
                }
            }
            return true;
        }
        const room = jar.kind !== 'egg' && mix[jar.kind] < 1 && !mix.ready;
        jar.tilt.target = over && room ? 1.6 * (jar.x < this.bowl.x ? 1 : -1) : 0;
        if (!over || mix.ready) return true;
        if (jar.kind === 'egg') {
            if (!held.cracked && mix.egg < 1) {
                held.cracked = true;
                mix.egg = 1;
                this.bowlWobble.kick(-4);
                audio.play('crunch', { seed: 3 }, { gain: 0.25, pan: this.pan(this.bowl.x) });
                audio.play('drop', { f: DROPS[1] }, { gain: 0.4, pan: this.pan(this.bowl.x), delay: 0.12 });
                this.filled('egg');
            }
            return true;
        }
        if (!room || Math.abs(jar.tilt.value) < 1.1) return true;
        mix[jar.kind] = Math.min(1, mix[jar.kind] + POUR * dt);
        held.every = (held.every || 0) + dt;
        if (held.every > (jar.kind === 'water' ? 0.13 : 0.22)) {
            held.every = 0;
            if (jar.kind === 'water')
                audio.play(
                    'drop',
                    { f: DROPS[Math.floor(Math.random() * 3)] },
                    { gain: 0.35, pan: this.pan(this.bowl.x) }
                );
            else audio.play('rustle', {}, { gain: 0.22, pan: this.pan(this.bowl.x) });
        }
        if (mix[jar.kind] >= 1) this.filled(jar.kind);
        return true;
    }

    // The bowl has enough of something: its note; and with the last of what it needs, a chord.
    filled(kind) {
        audio.play('chime', { f: noteHz(FULL_NOTE[kind], 72) }, { gain: 0.35, pan: this.pan(this.bowl.x) });
        if (this.stage.cake && this.mix.flour >= 1 && this.mix.egg >= 1 && this.mix.sugar >= 1)
            this.recipe = Math.max(this.recipe, 1);
    }

    // Held just over the bowl: close enough that the stream lands in it.
    overBowl(x, y) {
        const b = this.bowl;
        return Math.abs(x - b.x) < b.r * 1.3 && y < b.y + b.r * 0.2 && y > b.y - b.r * 2.2;
    }

    // Stirred enough, the bowl's mix comes together: dough into a ball, batter smooth and ready to
    // pour into its tin.
    together() {
        const m = this.mix;
        m.ready = mixOf(m);
        m.readyAt = this.time + 0.7;
        m.eggs = m.egg >= 1;
        this.bowlWobble.kick(-7);
        audio.play('pop', { f: 520 }, { gain: 0.5, pan: this.pan(this.bowl.x) });
        audio.play('chime', { f: noteHz(5, 72) }, { gain: 0.35, pan: this.pan(this.bowl.x), delay: 0.1 });
        if (m.ready === 'batter') this.recipe = Math.max(this.recipe, 2);
    }

    // Out of the bowl and onto the board: a lump of dough to knead, or the batter poured into a tin.
    toBoard() {
        const m = this.mix;
        const b = this.board;
        const cake = m.ready === 'batter';
        this.dough = {
            kind: cake ? 'cake' : 'dough',
            shape: 'bun',
            toppings: [],
            presses: 0,
            smooth: cake,
            rolled: 0,
            eggs: !!m.eggs,
            squash: new Spring(0, 220, 11),
            since: this.time,
        };
        this.flying.push({
            t: 0,
            length: 0.45,
            from: { x: this.bowl.x, y: this.bowl.y },
            to: { x: b.x, y: b.y },
            draw: (ctx, x, y) => this.drawItem(ctx, this.dough, x, y, this.dk * 0.8, {}),
            land: () => {
                this.dough.landed = true;
                this.dough.squash.kick(-5);
                audio.play('pat', {}, { gain: 0.5, pan: this.pan(b.x) });
            },
        });
        this.dough.landed = false;
        this.mix = emptyBowl();
        audio.play('whoosh', { variant: 'up' }, { gain: 0.2, pan: this.pan(b.x) });
    }

    // The oven: what is in it bakes, to its ticking song; done, the bell, and out it comes onto the
    // rack, as soon as there is room on it.
    bake(dt) {
        let baking = false;
        let soonest = null;
        this.slots.forEach((slot, i) => {
            if (!slot) return;
            slot.t += dt;
            if (slot.t < slot.total) {
                baking = true;
                if (!soonest || slot.total - slot.t < soonest.total - soonest.t) soonest = slot;
                return;
            }
            if (!slot.rang) {
                slot.rang = true;
                slot.doneAt = this.time;
                audio.play(
                    'chime',
                    { f: noteHz(5, 84) },
                    { gain: 0.5, pan: this.pan(this.oven.x + this.oven.w / 2) }
                );
                audio.play(
                    'chime',
                    { f: noteHz(7, 84) },
                    { gain: 0.4, pan: this.pan(this.oven.x + this.oven.w / 2), delay: 0.18 }
                );
            }
            const free = this.rackItems.indexOf(null);
            if (free >= 0 && this.time > slot.doneAt + 0.6) {
                this.slots[i] = null;
                freeLayer(slot.sprite);
                this.takeOut(slot, free);
            }
        });
        this.glow = lerp(this.glow, baking ? 1 : 0, Math.min(1, dt * 3));
        this.dial = soonest ? soonest.t / soonest.total : 0;
        if (this.door.target > 0 && this.time > this.doorShutAt) {
            this.door.target = 0;
            audio.play('latch', {}, { gain: 0.35, pan: this.pan(this.oven.x + this.oven.w / 2) });
        }
        if (baking) {
            this.tickAt -= dt;
            if (this.tickAt <= 0) {
                this.tickAt += TICK;
                const x = this.oven.x + this.oven.w / 2;
                audio.play('tick', { f: this.ticks % 2 ? 1175 : 1568 }, { gain: 0.18, pan: this.pan(x) });
                if (this.ticks % 2 === 0) {
                    const degree = OVEN_SONG[(this.ticks / 2) % OVEN_SONG.length];
                    audio.play(
                        'musicBox',
                        { f: noteHz(degree, 72) },
                        { gain: 0.32, pan: this.pan(x), wet: 0.3 }
                    );
                }
                this.ticks++;
            }
        } else this.tickAt = 0;
        // Done and waiting for room on the rack, it keeps warm without keeping the kitchen awake.
        return baking || this.glow > 0.02 || this.door.target > 0;
    }

    putIn(item) {
        const i = this.slots.indexOf(null);
        if (i < 0) return false;
        const flat = item.kind === 'cake' && !item.eggs;
        this.slots[i] = { item, t: 0, total: this.stage.bake, flat, rang: false, doneAt: 0 };
        this.openDoor(0.9);
        audio.play('whoosh', { variant: 'down' }, { gain: 0.2, pan: this.pan(this.oven.x) });
        if (item.kind === 'cake') this.recipe = Math.max(this.recipe, 3);
        return true;
    }

    openDoor(forHowLong) {
        if (this.door.target < 1)
            audio.play('creak', {}, { gain: 0.3, pan: this.pan(this.oven.x + this.oven.w / 2) });
        this.door.target = 1;
        this.doorShutAt = this.time + forHowLong;
    }

    takeOut(slot, i) {
        this.openDoor(1.2);
        const look = baking(slot.total, slot.total, slot.flat);
        const item = slot.item;
        const birthday = item.kind === 'cake' && this.stage.cake;
        const out = {
            item,
            look,
            flat: slot.flat,
            birthday,
            candles: 0,
            lit: 0,
            sung: false,
            left: null,
            landed: false,
        };
        this.rackItems[i] = out;
        const to = this.rackSpot(i);
        this.flying.push({
            t: 0,
            length: 0.6,
            from: this.slotSpot(this.slots.length > 1 ? i : 0),
            to,
            draw: (ctx, x, y) => this.drawItem(ctx, item, x, y, this.dk * 0.85, look),
            land: () => {
                out.landed = true;
                audio.play('pat', {}, { gain: 0.4, pan: this.pan(to.x) });
                if (birthday) this.friendComes();
                this.callAnimals();
            },
        });
    }

    slotSpot(i) {
        const win = this.oven.window;
        return { x: win.x + (win.w * (i + 0.5)) / this.slots.length, y: win.y + win.h * 0.7 };
    }

    rackSpot(i) {
        const r = this.rack;
        return { x: r.x + (i - 0.5) * r.w * 0.5, y: r.y - r.h * 0.12 };
    }

    //--------------------------------------------------------------------------
    // The animals, and the friend's birthday

    // Something out of the oven, and no one waiting for it: they come.
    callAnimals() {
        if (this.animals.some((a) => a.state !== 'leaving')) return;
        this.stage.animals.forEach((name, i) => {
            this.animals.push({
                name,
                x: -this.ak * (0.6 + i * 1.1),
                y: this.at.floor,
                spot: i,
                state: 'coming',
                t: Math.random() * 3,
                stride: 0,
                hop: new Spring(0, 260, 13),
                mouth: 0,
                eatUntil: 0,
            });
        });
        audio.play(VOICES[this.stage.animals[0]][0], VOICES[this.stage.animals[0]][1], {
            gain: 0.4,
            pan: -0.6,
            delay: 0.3,
        });
    }

    serve(dt) {
        let busy = false;
        const speed = 320 * this.u;
        for (const a of this.animals) {
            a.t += dt;
            if (a.hop.update(dt)) busy = true;
            if (a.state === 'coming' || a.state === 'next') {
                const target = this.line[a.spot].x;
                const d = target - a.x;
                if (Math.abs(d) < 2) {
                    a.x = target;
                    a.state = 'waiting';
                    a.stride = 0;
                } else {
                    a.x += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
                    a.stride = Math.sin(a.t * 12);
                }
                busy = true;
            } else if (a.state === 'eating') {
                a.mouth = Math.max(0, Math.sin((this.time - a.ateAt) * 14));
                if (this.time > a.eatUntil) {
                    a.state = 'leaving';
                    a.mouth = 0;
                    a.hop.kick(-6);
                    audio.play(VOICES[a.name][0], VOICES[a.name][1], { gain: 0.45, pan: this.pan(a.x) });
                    // The rest move up the line.
                    for (const b of this.animals) {
                        if (b !== a && b.state !== 'leaving' && b.spot > 0) {
                            b.spot--;
                            if (b.state === 'waiting') b.state = 'next';
                        }
                    }
                }
                busy = true;
            } else if (a.state === 'leaving') {
                a.x -= speed * dt;
                a.stride = Math.sin(a.t * 12);
                busy = true;
            }
        }
        this.animals = this.animals.filter((a) => a.state !== 'leaving' || a.x > -this.ak * 2);
        // When everyone has gone and something is still on the rack, they come again.
        if (!this.animals.length && this.rackItems.some((r) => r && r.landed && !r.gone)) this.callAnimals();
        return busy;
    }

    // A tap on what is on the rack shares it: a piece to whoever is first in line.
    share(r) {
        const first = this.animals.find((a) => a.state === 'waiting' && a.spot === 0);
        const friendWaiting = r.birthday && this.friend && !this.friend.fed && this.friend.ready;
        if (!first && !friendWaiting) {
            audio.play('pat', {}, { gain: 0.3, pan: this.pan(this.rack.x) });
            return;
        }
        if (r.left === null) r.left = piecesFor(this.stage.animals, r.birthday);
        r.left--;
        const from = this.rackSpot(this.rackItems.indexOf(r));
        audio.play('crunch', {}, { gain: 0.25, pan: this.pan(from.x) });
        // The friend has the first piece of its own cake.
        if (friendWaiting) {
            const f = this.friendAt;
            this.friend.fed = true;
            this.flying.push(
                this.piece(r, from, { x: f.x, y: f.y - f.r * 1.4 }, () => {
                    this.friend.feel('happy');
                    this.friend.bob(2);
                    audio.play('pop', { f: 700 }, { gain: 0.5, pan: this.pan(f.x) });
                })
            );
        } else {
            first.state = 'fed';
            const to = {
                x: first.x + this.ak * SIZE[first.name] * 0.45,
                y: first.y - this.ak * SIZE[first.name] * 0.55,
            };
            this.flying.push(
                this.piece(r, from, to, () => {
                    first.state = 'eating';
                    first.ateAt = this.time;
                    first.eatUntil = this.time + 1.3;
                    audio.play('crunch', {}, { gain: 0.3, pan: this.pan(first.x) });
                })
            );
        }
        if (r.left <= 0) {
            r.gone = true;
            this.rackItems[this.rackItems.indexOf(r)] = null;
            if (r.birthday && this.friend) this.friend.leaving = this.time + 2.5;
        }
    }

    piece(r, from, to, land) {
        return {
            t: 0,
            length: 0.45,
            from,
            to,
            arc: true,
            draw: (ctx, x, y) => {
                if (r.item.kind === 'cake') drawCake(ctx, x, y, this.dk * 0.22, r.look, false);
                else
                    drawDough(
                        ctx,
                        { shape: 'bun', toppings: [], smooth: true },
                        x,
                        y,
                        this.dk * 0.22,
                        r.look
                    );
            },
            land,
        };
    }

    // A cake out of the oven at Bloom: the friend comes up behind the counter for its birthday.
    friendComes() {
        if (this.friend) return;
        this.friend = new Friend({ mood: 'happy' });
        this.friend.ready = false;
        this.friend.fed = false;
        this.friendRise.set(0);
        this.friendRise.target = 1;
        this.friend.hop.kick(-6);
        audio.play('pop', { f: 700 }, { gain: 0.5, pan: this.pan(this.friendAt.x), delay: 0.2 });
    }

    // The birthday: candles go on the cake; a tap on it lights them, the friend's tune plays on the
    // music box, and at its end the friend blows them out, and everyone cheers.
    birthday(dt, resting) {
        const f = this.friend;
        let busy = false;
        if (f) {
            f.update(dt);
            // It breathes and blinks while he plays; left alone, it waits, still, like the animals.
            if (!resting || f.leaving) busy = true;
            if (this.friendRise.value > 0.9) f.ready = true;
            const cake = this.rackItems.find((r) => r && r.birthday);
            if (cake) {
                const at = this.rackSpot(this.rackItems.indexOf(cake));
                f.look(at.x - this.friendAt.x, at.y - (this.friendAt.y - this.friendAt.r * 1.2));
            }
            if (f.leaving && this.time > f.leaving) {
                this.friendRise.target = 0;
                if (this.friendRise.value < 0.05) this.friend = null;
            }
        }
        const tune = this.tune;
        if (tune) {
            busy = true;
            tune.t += dt;
            const notes = tune.notes;
            while (tune.i < notes.length && notes[tune.i].at * TUNE_BEAT <= tune.t) {
                const n = notes[tune.i++];
                audio.play(
                    'musicBox',
                    { f: noteHz(n.degree, 72) },
                    { gain: 0.45, pan: this.pan(tune.x), wet: 0.3 }
                );
                if (f) f.bob(1);
            }
            const end = (notes[notes.length - 1].at + notes[notes.length - 1].beats) * TUNE_BEAT;
            if (tune.t > end + 0.4 && !tune.blown) {
                // The friend blows the candles out.
                tune.blown = true;
                tune.cake.lit = 0;
                tune.cake.sung = true;
                if (f) {
                    f.sigh();
                    f.feel('proud');
                }
                audio.play('sigh', {}, { gain: 0.5, pan: this.pan(tune.x) });
                for (let i = 0; i < tune.cake.candles; i++)
                    this.puffs.push({
                        x: tune.x,
                        y: tune.y - this.dk * 0.3,
                        t: 0.3 + i * 0.05,
                        k: this.dk * 0.3,
                    });
                audio.play('jingle', {}, { gain: 0.35, pan: this.pan(tune.x), delay: 0.5 });
                this.animals.forEach((a, i) => {
                    a.hop.kick(-5);
                    audio.play(VOICES[a.name][0], VOICES[a.name][1], {
                        gain: 0.3,
                        pan: this.pan(a.x),
                        delay: 0.6 + i * 0.15,
                    });
                });
            }
            if (tune.t > end + 1.6) this.tune = null;
        }
        return busy;
    }

    light(cake) {
        const at = this.rackSpot(this.rackItems.indexOf(cake));
        cake.lit = 1;
        audio.play('whoosh', { variant: 'up' }, { gain: 0.25, pan: this.pan(at.x) });
        this.tune = { t: -0.5, i: 0, notes: timings(BIRTHDAY), cake, x: at.x, y: at.y, blown: false };
        if (this.friend) this.friend.feel('happy');
    }

    //--------------------------------------------------------------------------
    // Touch

    jarAt(x, y) {
        const k = this.jk;
        return (
            this.jars.find(
                (j) => Math.abs(x - j.home.x) < k * 0.5 && y > j.home.y - k * 1.05 && y < j.home.y + k * 0.15
            ) || null
        );
    }

    cutterAt(x, y) {
        return this.cutters.find((c) => dist(x, y, c.home.x, c.home.y) < c.k * 0.6) || null;
    }

    onDough(x, y) {
        const d = this.dough;
        if (!d || !d.landed) return false;
        const b = this.board;
        return Math.abs(x - b.x) < this.dk * 0.85 && Math.abs(y - b.y) < this.dk * 0.5;
    }

    rackItemAt(x, y) {
        for (let i = 0; i < this.rackItems.length; i++) {
            const r = this.rackItems[i];
            if (!r || !r.landed) continue;
            const at = this.rackSpot(i);
            if (Math.abs(x - at.x) < this.dk * 0.45 && Math.abs(y - at.y) < this.dk * 0.45) return r;
        }
        return null;
    }

    animalAt(x, y) {
        for (const a of this.animals) {
            const k = this.ak * SIZE[a.name];
            if (Math.abs(x - a.x) < k * 0.6 && y < a.y + 4 && y > a.y - k * 0.9) return a;
        }
        return null;
    }

    inBowl(x, y) {
        const b = this.bowl;
        const dx = (x - b.x) / b.r;
        const dy = (y - b.y) / (b.r * 0.6);
        return dx * dx + dy * dy < 1.2;
    }

    overOven(x, y) {
        const o = this.oven;
        return x > o.x - 20 * this.u && x < o.x + o.w + 20 * this.u && y > o.y && y < o.y + o.h + 30 * this.u;
    }

    down(p) {
        this.touched = this.time;
        if (this.held) return;
        const jar = this.jarAt(p.x, p.y);
        if (jar) {
            this.held = { jar, p, dx: p.x - jar.x, dy: p.y - (jar.y - this.jk * 0.4), moved: false };
            return;
        }
        const cutter = this.cutterAt(p.x, p.y);
        if (cutter) {
            this.held = { cutter, p, x: p.x, y: p.y };
            audio.play('click', { variant: 'on' }, { gain: 0.3, pan: this.pan(p.x) });
            return;
        }
        if (
            this.pin &&
            dist(p.x, p.y, this.pin.home.x, this.pin.home.y) < this.pin.k * 0.45 &&
            Math.abs(p.y - this.pin.home.y) < 30 * this.u
        ) {
            this.held = { pin: true, p, x: p.x, y: p.y, lastX: p.x };
            return;
        }
        if (this.onDough(p.x, p.y)) {
            const d = this.dough;
            if (!d.smooth) this.knead(d);
            else d.squash.kick(-3);
            this.held = { item: d, p, x: p.x, y: p.y, carried: false };
            return;
        }
        const box = this.candleBox;
        if (box && dist(p.x, p.y, box.x, box.y - box.k * 0.2) < box.k * 0.6) {
            this.addCandle();
            return;
        }
        const r = this.rackItemAt(p.x, p.y);
        if (r) {
            if (r.birthday && r.candles > 0 && !r.lit && !r.sung && !this.tune) this.light(r);
            else if (!this.tune || this.tune.blown) this.share(r);
            return;
        }
        if (this.inBowl(p.x, p.y) && !this.mix.ready) {
            this.held = { stir: true, p, a: this.angleIn(p.x, p.y), turned: 0 };
            return;
        }
        if (
            this.friend &&
            dist(p.x, p.y, this.friendAt.x, this.friendAt.y - this.friendAt.r) < this.friendAt.r * 1.3
        ) {
            this.friend.bob(2);
            audio.play('pop', { f: 700 }, { gain: 0.5, pan: this.pan(this.friendAt.x) });
            return;
        }
        const a = this.animalAt(p.x, p.y);
        if (a) {
            a.hop.kick(-5);
            audio.play(VOICES[a.name][0], VOICES[a.name][1], { gain: 0.5, pan: this.pan(a.x) });
            return;
        }
        if (this.overOven(p.x, p.y)) {
            // A peek through the window: the light comes up for a moment.
            this.glow = Math.max(this.glow, 0.6);
            audio.play('tick', { f: 1568 }, { gain: 0.2, pan: this.pan(p.x) });
        }
    }

    angleIn(x, y) {
        return Math.atan2((y - this.bowl.y) / 0.34, x - this.bowl.x);
    }

    knead(d) {
        d.presses++;
        d.squash.kick(-7);
        const degree = Math.min(d.presses - 1, 4);
        audio.play('pat', {}, { gain: 0.5, pan: this.pan(this.board.x) });
        audio.play('marimba', { f: noteHz(degree, 48) }, { gain: 0.4, pan: this.pan(this.board.x) });
        if (d.presses >= this.stage.presses) this.smoothed(d);
    }

    smoothed(d) {
        if (d.smooth) return;
        d.smooth = true;
        d.since = this.time;
        audio.play('chime', { f: noteHz(4, 72) }, { gain: 0.35, pan: this.pan(this.board.x), delay: 0.1 });
        this.puffs.push({ x: this.board.x, y: this.board.y - this.dk * 0.2, t: 0.4, k: this.dk * 0.4 });
    }

    move(p) {
        const held = this.held;
        if (!held || held.p !== p) return;
        const far = dist(p.x, p.y, p.x0, p.y0) >= CARRY * this.u;
        if (held.jar) {
            held.moved = held.moved || far;
            if (!held.moved) return;
            held.jar.x = p.x - held.dx;
            held.jar.y = p.y - held.dy + this.jk * 0.4;
        } else if (held.stir) {
            const a = this.angleIn(p.x, p.y);
            const d = stirred(held.a, a);
            held.a = a;
            this.mix.angle = a;
            if (!this.inBowl(p.x, p.y)) return;
            if (mixOf(this.mix)) {
                const before = Math.floor(this.mix.stir / (Math.PI / 2));
                this.mix.stir += d;
                const after = Math.floor(this.mix.stir / (Math.PI / 2));
                if (after > before) {
                    const degree = STIR_TUNE[after % STIR_TUNE.length];
                    audio.play(
                        'marimba',
                        { f: noteHz(degree, 60) },
                        { gain: 0.4, pan: this.pan(this.bowl.x) }
                    );
                }
                if (this.mix.stir >= stirNeeded(this.level)) {
                    this.together();
                    this.held = null;
                }
            } else {
                // Not enough in it yet: the spoon swishes, and the jars it needs nod.
                held.turned += d;
                if (held.turned > Math.PI) {
                    held.turned = 0;
                    audio.play('rustle', {}, { gain: 0.2, pan: this.pan(this.bowl.x) });
                    this.hintMissing();
                }
            }
        } else if (held.item) {
            held.x = p.x;
            held.y = p.y;
            if (!held.carried && far && held.item.smooth) held.carried = true;
        } else if (held.pin) {
            held.x = p.x;
            held.y = p.y;
            const d = this.dough;
            const dx = Math.abs(p.x - held.lastX);
            held.lastX = p.x;
            if (
                d &&
                d.landed &&
                d.kind === 'dough' &&
                this.onDough(p.x, p.y) &&
                d.shape !== 'roll' &&
                CUTTERS.indexOf(d.shape) < 0
            ) {
                d.rolled += dx / this.dk;
                held.every = (held.every || 0) + dx;
                if (held.every > 40 * this.u) {
                    held.every = 0;
                    audio.play('rustle', {}, { gain: 0.25, pan: this.pan(p.x) });
                    d.squash.kick(-2);
                }
                if (d.rolled >= ROLL) {
                    d.shape = 'roll';
                    this.smoothed(d);
                    audio.play('pop', { f: 520 }, { gain: 0.4, pan: this.pan(this.board.x) });
                }
            }
        } else if (held.cutter) {
            held.x = p.x;
            held.y = p.y;
        }
    }

    up(p) {
        const held = this.held;
        if (!held || held.p !== p) return;
        this.held = null;
        if (held.jar) {
            const jar = held.jar;
            jar.tilt.target = 0;
            if (!held.moved) this.tapJar(jar);
            return;
        }
        if (held.item) {
            if (held.carried && this.overOven(p.x, p.y) && this.putIn(held.item)) {
                this.dough = null;
                return;
            }
            if (held.carried) {
                held.item.squash.kick(-4);
                if (this.overOven(p.x, p.y)) audio.play('pat', {}, { gain: 0.3, pan: this.pan(p.x) });
            }
            return;
        }
        if (held.cutter) {
            const d = this.dough;
            if (
                d &&
                d.kind === 'dough' &&
                this.onDough(p.x, p.y) &&
                dist(p.x, p.y, held.cutter.home.x, held.cutter.home.y) > CARRY * this.u
            ) {
                d.shape = held.cutter.shape;
                d.squash.kick(-6);
                this.smoothed(d);
                audio.play('click', { variant: 'off' }, { gain: 0.4, pan: this.pan(this.board.x) });
                audio.play('pop', { f: 520 }, { gain: 0.35, pan: this.pan(this.board.x), delay: 0.08 });
            }
        }
    }

    cancel(p) {
        if (this.held && this.held.p === p) {
            if (this.held.jar) this.held.jar.tilt.target = 0;
            this.held = null;
        }
    }

    // A tap on a jar: a puff of flour or sugar, a splash from the jug, an egg's knock; toppings rattle.
    tapJar(jar) {
        const x = jar.home.x;
        const y = jar.home.y - this.jk;
        jar.tilt.kick(4);
        if (jar.kind === 'flour' || jar.kind === 'sugar') {
            this.puffs.push({ x, y, t: 0, k: this.jk * 0.7 });
            audio.play('whoosh', { variant: 'up' }, { gain: 0.25, pan: this.pan(x) });
        } else if (jar.kind === 'water')
            audio.play('drop', { f: DROPS[0] }, { gain: 0.45, pan: this.pan(x) });
        else if (jar.kind === 'egg')
            audio.play('wood', { f: noteHz(3, 72) }, { gain: 0.35, pan: this.pan(x) });
        else audio.play('tink', { f: noteHz(7, 60) }, { gain: 0.35, pan: this.pan(x) });
    }

    // The jars of what the bowl still needs nod.
    hintMissing() {
        const m = this.mix;
        const needs = [];
        if (m.flour < 1) needs.push('flour');
        if (m.flour >= 1 && m.water < 1 && m.egg < 1 && m.sugar < 1) needs.push('water');
        if (this.stage.cake && m.flour >= 1 && m.water < 1 && m.egg < 1 && m.sugar < 1)
            needs.push('egg', 'sugar');
        for (const kind of needs) {
            const jar = this.jars.find((j) => j.kind === kind);
            if (jar) {
                jar.tilt.kick(3);
                this.hints.push({ jar, t: 0 });
            }
        }
    }

    // What a topping jar held over something would fall on: the dough on the board, or something
    // out of the oven on the rack.
    toppingTarget(x, y) {
        const d = this.dough;
        const b = this.board;
        if (
            d &&
            d.landed &&
            d.kind === 'dough' &&
            Math.abs(x - b.x) < this.dk * 0.8 &&
            y < b.y &&
            y > b.y - this.dk * 2.6
        )
            return { item: d, x: b.x, y: b.y };
        for (let i = 0; i < this.rackItems.length; i++) {
            const r = this.rackItems[i];
            if (!r || !r.landed || r.item.kind === 'cake') continue;
            const at = this.rackSpot(i);
            if (Math.abs(x - at.x) < this.dk * 0.5 && y < at.y && y > at.y - this.dk * 2.4)
                return { item: r.item, x: at.x, y: at.y };
        }
        return null;
    }

    sprinkle(target, kind) {
        const item = target.item;
        if (item.toppings.length >= MOST_TOPPINGS) return;
        const a = Math.random() * TAU;
        const r = Math.sqrt(Math.random()) * 0.3;
        item.toppings.push({ kind, x: Math.cos(a) * r, y: Math.sin(a) * r * 0.6 });
        audio.play(
            'tink',
            { f: noteHz(6 + (item.toppings.length % 4), 60) },
            { gain: 0.3, pan: this.pan(target.x) }
        );
    }

    addCandle() {
        const cake = this.rackItems.find((r) => r && r.birthday && r.landed && !r.sung && !r.lit);
        if (!cake || cake.candles >= CANDLES) {
            audio.play('tink', { f: noteHz(6, 60) }, { gain: 0.2, pan: this.pan(this.candleBox.x) });
            return;
        }
        const to = this.rackSpot(this.rackItems.indexOf(cake));
        cake.flying = (cake.flying || 0) + 1;
        this.flying.push({
            t: 0,
            length: 0.4,
            from: { x: this.candleBox.x, y: this.candleBox.y - this.candleBox.k * 0.4 },
            to: { x: to.x, y: to.y - this.dk * 0.2 },
            arc: true,
            draw: (ctx, x, y) => drawCandles(ctx, 1, x, y + this.dk * 0.1, this.dk * 0.85, 0, this.time),
            land: () => {
                cake.flying--;
                cake.candles = Math.min(CANDLES, cake.candles + 1);
                audio.play('tink', { f: noteHz(6 + cake.candles, 60) }, { gain: 0.35, pan: this.pan(to.x) });
            },
        });
    }

    //--------------------------------------------------------------------------
    // Drawing

    draw(ctx) {
        const { u } = this;
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);
        if (this.card) this.drawRecipeTicks(ctx);
        this.drawOven(ctx);
        // The shelf's jars, the cutters on their hooks.
        for (const jar of this.jars) {
            if (this.held && this.held.jar === jar) continue;
            this.drawJarAt(ctx, jar);
        }
        for (const c of this.cutters) {
            if (this.held && this.held.cutter === c) continue;
            ctx.drawImage(
                this.sprites[c.shape].canvas,
                c.home.x - c.k * 0.65,
                c.home.y - c.k * 0.65,
                c.k * 1.3,
                c.k * 1.3
            );
        }
        // The bowl, and the spoon in it.
        this.drawBowl(ctx);
        // The board.
        const d = this.dough;
        const heldItem = this.held && this.held.item && this.held.carried;
        if (d && d.landed && !heldItem)
            this.drawItem(ctx, d, this.board.x, this.board.y - this.dk * 0.05, this.dk, {
                squash: d.squash.value * 0.1,
            });
        if (d && d.smooth && !heldItem && this.slots.indexOf(null) >= 0 && this.time - d.since > 4) {
            // A soft blink of the oven's light to show where it goes.
            const blink =
                Math.max(0, Math.sin(((this.time - d.since) % 5) * Math.PI * 1.6)) *
                ((this.time - d.since) % 5 < 1.2 ? 1 : 0);
            if (blink > 0) {
                const win = this.oven.window;
                ctx.fillStyle = `rgba(255, 214, 140, ${(0.35 * blink).toFixed(3)})`;
                ctx.fillRect(win.x, win.y, win.w, win.h);
            }
        }
        if (this.pin && !(this.held && this.held.pin))
            drawRollingPin(ctx, this.pin.home.x, this.pin.home.y, this.pin.k);
        // The rack.
        this.rackItems.forEach((r, i) => {
            if (!r || !r.landed) return;
            const at = this.rackSpot(i);
            this.drawItem(ctx, r.item, at.x, at.y, this.dk * 0.85, r.look);
            if (r.birthday && r.candles)
                drawCandles(
                    ctx,
                    r.candles,
                    at.x,
                    at.y - this.dk * 0.85 * (0.1 + 0.2 * r.look.rise),
                    this.dk * 0.85,
                    r.lit,
                    this.time
                );
        });
        if (this.candleBox) {
            const cake = this.rackItems.find((r) => r && r.birthday && !r.sung);
            drawCandleBox(
                ctx,
                this.candleBox.x,
                this.candleBox.y,
                this.candleBox.k,
                cake ? Math.max(0, CANDLES - cake.candles - (cake.flying || 0)) : CANDLES
            );
        }
        // The friend, behind the counter.
        if (this.friend) {
            const f = this.friendAt;
            const rise = this.friendRise.value;
            this.friend.draw(ctx, f.x, f.y + (1 - rise) * f.r * 3, f.r, this.at.back + 4 * u);
        }
        // The animals on the floor.
        for (const a of this.animals) this.drawAnimal(ctx, a);
        // Things in the air, and puffs.
        for (const f of this.flying) {
            const e = easeOutCubic(clamp(f.t, 0, 1));
            const x = lerp(f.from.x, f.to.x, e);
            const y = lerp(f.from.y, f.to.y, e) - (f.arc ? Math.sin(Math.PI * clamp(f.t, 0, 1)) * 60 * u : 0);
            f.draw(ctx, x, y);
        }
        for (const puff of this.puffs) drawPuff(ctx, puff.x, puff.y, puff.k, puff.t);
        // What is in his hand, over everything.
        const held = this.held;
        if (held && held.jar) this.drawJarAt(ctx, held.jar);
        if (held && held.item && held.carried)
            this.drawItem(ctx, held.item, held.x, held.y - 10 * u, this.dk * 0.9, {});
        if (held && held.pin) drawRollingPin(ctx, held.x, held.y, this.pin.k);
        if (held && held.cutter)
            drawCutter(ctx, held.cutter.shape, held.x, held.y - 10 * u, held.cutter.k * 1.2);
    }

    drawJarAt(ctx, jar) {
        const k = this.jk;
        const tilt = jar.tilt.value;
        const hint = this.hints.find((h) => h.jar === jar);
        let y = jar.y;
        if (hint) y -= Math.abs(Math.sin(hint.t * 9)) * 8 * this.u * (1 - hint.t / 1.2);
        // Held by its middle, it turns about its middle.
        const mx = jar.x;
        const my = y - k * 0.4;
        const bx = mx - k * 0.4 * Math.sin(tilt);
        const by = my + k * 0.4 * Math.cos(tilt);
        const level = this.levelOf(jar.kind);
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(tilt);
        ctx.drawImage(this.sprites[jar.kind].canvas, -k * 0.65, -k * 1.25, k * 1.3, k * 1.35);
        ctx.restore();
        // Pouring: the stream from its mouth into the bowl or onto the dough.
        const held = this.held && this.held.jar === jar;
        if (held && Math.abs(tilt) > 1.1 && jar.kind !== 'egg') {
            const mouthX = bx + k * 0.85 * Math.sin(tilt);
            const mouthY = by - k * 0.85 * Math.cos(tilt);
            const target = jar.topping
                ? this.toppingTarget(jar.x, jar.y)
                : this.overBowl(jar.x, jar.y)
                  ? { x: this.bowl.x, y: this.bowl.y }
                  : null;
            if (target && (jar.topping || this.mix[jar.kind] < 1)) {
                if (jar.topping)
                    drawStream(
                        ctx,
                        'sugar',
                        mouthX,
                        mouthY,
                        target.x,
                        target.y - this.dk * 0.1,
                        k * 0.6,
                        this.time
                    );
                else drawStream(ctx, jar.kind, mouthX, mouthY, target.x, target.y, k, this.time);
            }
        }
    }

    levelOf(kind) {
        return kind === 'water' ? 0.8 : 0.85;
    }

    drawBowl(ctx) {
        const b = this.bowl;
        const m = this.mix;
        const wobble = this.bowlWobble.value * 0.02;
        const r = b.r * (1 - wobble);
        drawBowlBack(ctx, b.x, b.y, r);
        const mix = m.ready || mixOf(m);
        const stir = m.ready ? 1 : Math.min(1, m.stir / stirNeeded(this.level));
        drawBowlInside(ctx, b.x, b.y, r, m, stir, mix, this.time);
        if (m.ready === 'dough')
            this.drawItem(
                ctx,
                { kind: 'dough', shape: 'bun', toppings: [], smooth: false },
                b.x,
                b.y,
                this.dk * 0.85,
                {}
            );
        const stirring = this.held && this.held.stir;
        const a = m.angle;
        const sx = b.x + Math.cos(a) * r * 0.45;
        const sy = b.y + Math.sin(a) * r * 0.45 * 0.34;
        if (!m.ready) drawSpoon(ctx, sx, sy, r, stirring ? a : 0.3);
        drawBowlFront(ctx, b.x, b.y, r);
    }

    // Dough or a cake, raw, baking, or baked.
    drawItem(ctx, item, x, y, k, look) {
        if (item.kind === 'cake') drawCake(ctx, x, y, k * 0.95, look, !look.done);
        else drawDough(ctx, item, x, y, k, look);
    }

    drawOven(ctx) {
        const o = this.oven;
        drawOvenFront(
            ctx,
            o,
            this.u,
            { door: this.door.value, glow: this.glow, dial: this.dial || 0, light: this.sprites.light },
            this.time,
            () => {
                this.slots.forEach((slot, i) => {
                    if (!slot) return;
                    const at = this.slotSpot(i);
                    const look = baking(slot.t, slot.total, slot.flat);
                    const k = this.slots.length > 1 ? this.dk * 0.55 : this.dk * 0.85;
                    const sprite = this.bakingSprite(slot, k, look);
                    ctx.drawImage(sprite.canvas, at.x - k, at.y - k * 0.1 - k * 0.7, k * 2, k * 1.2);
                });
            }
        );
    }

    // Something baking, drawn into a layer of its own and drawn again only when it has visibly changed:
    // it rises and browns slowly, so most frames only place it.
    bakingSprite(slot, k, look) {
        const key = `${Math.round(look.rise * 24)}:${Math.round(look.brown * 24)}:${k}`;
        if (slot.sprite && slot.key === key) return slot.sprite;
        if (!slot.sprite || slot.k !== k) {
            freeLayer(slot.sprite);
            slot.sprite = makeLayer(k * 2, k * 1.2, this.scale);
            slot.k = k;
        }
        const ctx = slot.sprite.ctx;
        ctx.clearRect(0, 0, k * 2, k * 1.2);
        this.drawItem(ctx, slot.item, k, k * 0.7, k, look);
        slot.key = key;
        return slot.sprite;
    }

    drawRecipeTicks(ctx) {
        const c = this.card;
        const u = this.u;
        for (let i = 0; i < Math.min(this.recipe, 3); i++) {
            const step = c.w / 3;
            const tx = c.x + step * (i + 0.5) + Math.min(step * 0.42, c.h * 0.5) * 0.45;
            const ty = c.y + c.h * 0.18;
            disc(ctx, tx, ty, 9 * u, '#8EBF7A');
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2.5 * u;
            ctx.beginPath();
            ctx.moveTo(tx - 4 * u, ty);
            ctx.lineTo(tx - 1 * u, ty + 3 * u);
            ctx.lineTo(tx + 4 * u, ty - 3 * u);
            ctx.stroke();
        }
    }

    drawAnimal(ctx, a) {
        const k = this.ak * SIZE[a.name];
        ctx.save();
        ctx.translate(a.x, a.y + a.hop.value * 4 * this.u);
        ellipse(ctx, 0, 0, k * 0.5, k * 0.07);
        ctx.fillStyle = 'rgba(92, 70, 58, 0.14)';
        ctx.fill();
        if (a.state === 'leaving') ctx.scale(-1, 1);
        const pose = {
            stride: a.stride,
            lift: Math.abs(a.stride) * 0.03,
            mouth: a.mouth,
            blink: a.t % 4 < 0.12,
            tilt: a.state === 'waiting' ? Math.sin(a.t * 2) * 0.02 : 0,
        };
        DRAW[a.name](ctx, k, pose);
        ctx.restore();
    }

    freeSprites() {
        for (const key of Object.keys(this.sprites || {})) freeLayer(this.sprites[key]);
        this.sprites = {};
    }

    exit() {
        freeLayer(this.bg);
        this.bg = null;
        this.freeSprites();
        for (const slot of this.slots) if (slot) freeLayer(slot.sprite);
        this.invalidate();
    }
}

function icon(ctx, x, y, w, h) {
    // An oven with a bun inside, glowing, on a pale tiled wall.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = '#F7F0E4';
    ctx.fillRect(x, y, w, h);
    const ox = x + w * 0.18;
    const oy = y + h * 0.16;
    const ow = w * 0.64;
    const oh = h * 0.7;
    ctx.fillStyle = '#A9CFC1';
    ctx.beginPath();
    ctx.rect(ox, oy, ow, oh);
    ctx.fill();
    ctx.fillStyle = '#4E3F3A';
    ctx.fillRect(ox + ow * 0.12, oy + oh * 0.3, ow * 0.76, oh * 0.58);
    const g = ctx.createRadialGradient(x + w / 2, oy + oh * 0.5, 0, x + w / 2, oy + oh * 0.5, ow * 0.6);
    g.addColorStop(0, 'rgba(255, 196, 120, 0.85)');
    g.addColorStop(1, 'rgba(220, 120, 70, 0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(ox + ow * 0.12, oy + oh * 0.3, ow * 0.76, oh * 0.58);
    drawDough(ctx, { shape: 'bun', toppings: [], smooth: true }, x + w / 2, oy + oh * 0.66, ow * 0.5, {
        rise: 1,
        brown: 0.8,
    });
    disc(ctx, x + w / 2, oy + oh * 0.14, oh * 0.08, '#FBF6EE');
    ctx.restore();
}

export const toy = {
    id: 'bakery',
    title: 'Bakery',
    about: 'Flour and water, a bowl and an oven with a window. Pour, stir round and round, knead the dough with presses, and put the bun in the oven, where it rises and browns slowly to a soft ticking song; then the animals line up for a piece. Meanwhile there is the next one to make. From Sprout, rolls and shapes and toppings; at Bloom, a cake from the recipe on the wall, with candles for the friend’s birthday.',
    stages: [
        'One bun, and twenty seconds in the oven',
        'Rolls and shapes and toppings, and two in the oven at once',
        'And a cake from the recipe on the wall, with candles for the friend’s birthday',
    ],
    isNew: true,
    mat: shade(PALETTE.butter, 0.3),
    icon,
    create: (app) => new BakeryScene(app),
    sounds(level) {
        const stage = STAGES[level];
        const list = [
            ['whoosh', { variant: 'up' }],
            ['whoosh', { variant: 'down' }],
            ['rustle', {}],
            ['pat', {}],
            ['pop', { f: 520 }],
            ['pop', { f: 700 }],
            ['crunch', {}],
            ['crunch', { seed: 3 }],
            ['creak', {}],
            ['latch', {}],
            ['tick', { f: 1568 }],
            ['tick', { f: 1175 }],
            ['chime', { f: noteHz(5, 84) }],
            ['chime', { f: noteHz(7, 84) }],
            ['chime', { f: noteHz(5, 72) }],
            ['chime', { f: noteHz(4, 72) }],
            ['wood', { f: noteHz(3, 72) }],
            ['tink', { f: noteHz(7, 60) }],
        ];
        for (const f of DROPS) list.push(['drop', { f }]);
        for (const kind of Object.keys(FULL_NOTE)) list.push(['chime', { f: noteHz(FULL_NOTE[kind], 72) }]);
        for (let d = 0; d < 5; d++)
            list.push(['marimba', { f: noteHz(d, 60) }], ['marimba', { f: noteHz(d, 48) }]);
        for (const d of new Set(OVEN_SONG)) list.push(['musicBox', { f: noteHz(d, 72) }]);
        for (const name of stage.animals) list.push(VOICES[name]);
        if (stage.shapes) list.push(['click', { variant: 'on' }], ['click', { variant: 'off' }]);
        if (stage.toppings) for (let d = 6; d <= 11; d++) list.push(['tink', { f: noteHz(d, 60) }]);
        if (stage.cake) {
            for (const [d] of BIRTHDAY) list.push(['musicBox', { f: noteHz(d, 72) }]);
            list.push(['sigh', {}], ['jingle', {}]);
        }
        return list;
    },
    signature() {
        audio.play('tick', { f: 1568 }, { gain: 0.25, delay: 0.05 });
        audio.note('chime', 5, 84, { gain: 0.35, delay: 0.25 });
    },
};
