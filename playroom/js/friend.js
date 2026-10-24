// The friend: a small make-believe creature who comes back across the games, round as a seed, with
// a sprout of two leaves on its head and a scarf. It is the playroom's one character with feelings:
// sleepy, happy, cross, calm again, shy, proud. They show the way a three-year-old's do, in the
// whole body, and they pass, as weather does. Feelings are never a lesson here; the friend simply
// has them, and they are all allowed.
//
// It never speaks. What it feels is in its face, its arms, its leaves and how it stands: eyes open
// or sleepy or squeezed happy, brows down when it is cross, arms folded, up, on its hips or over its
// face, leaves that perk up or droop, and a scarf the wind can catch.
//
// Shared by the games that have the friend in them: Weather Song, where his music is its weather,
// and the turntable, where it takes turns at the decks with him.

import { Spring, clamp, lerp, TAU } from './util.js';
import { ellipse, disc } from './draw.js';

export const FRIEND = {
    body: '#F2C29C',
    deep: '#E2A47C',
    belly: '#FBE1CA',
    ink: '#5A4A3F',
    cheek: 'rgba(233, 135, 122, ',
    leaf: '#98B985',
    leafDeep: '#7FA36C',
    scarf: '#83BFAE',
    stripe: '#BFE3D6',
    shadow: 'rgba(92, 70, 58, 0.16)',
};

// Each mood is a pose. eyes: 0 shut to 1 open; happy: eyes squeezed into smiling arcs; brow: 1 cross,
// -1 worried; smile: -1 a frown to 1 a grin; open: the mouth open; blush; leaves: -1 drooping to 1
// perked; tall: stretched up, chest out; slump: sagging; and where the hands are, in body radii from
// the feet, x to its right and y up: L and R.
const MOODS = {
    content: {
        eyes: 1,
        happy: 0,
        brow: 0,
        smile: 0.45,
        open: 0,
        blush: 0.35,
        leaves: 0.5,
        tall: 0,
        slump: 0,
    },
    happy: { eyes: 1, happy: 1, brow: 0, smile: 1, open: 0.35, blush: 0.6, leaves: 1, tall: 0.3, slump: 0 },
    sleepy: {
        eyes: 0.3,
        happy: 0,
        brow: 0,
        smile: 0.15,
        open: 0,
        blush: 0.3,
        leaves: -0.8,
        tall: 0,
        slump: 1,
    },
    cross: {
        eyes: 0.85,
        happy: 0,
        brow: 1,
        smile: -0.9,
        open: 0,
        blush: 0.15,
        leaves: 0.15,
        tall: 0.15,
        slump: 0,
    },
    calm: {
        eyes: 0,
        happy: 0,
        brow: -0.1,
        smile: 0.35,
        open: 0,
        blush: 0.3,
        leaves: 0.2,
        tall: 0,
        slump: 0.3,
    },
    shy: { eyes: 1, happy: 0, brow: -0.6, smile: 0.25, open: 0, blush: 1, leaves: -0.3, tall: 0, slump: 0.5 },
    proud: { eyes: 1, happy: 1, brow: 0, smile: 0.9, open: 0, blush: 0.7, leaves: 1, tall: 1, slump: 0 },
    listen: {
        eyes: 1,
        happy: 0,
        brow: 0,
        smile: 0.45,
        open: 0,
        blush: 0.35,
        leaves: 0.6,
        tall: 0.1,
        slump: 0,
    },
    asleep: { eyes: 0, happy: 0, brow: 0, smile: 0.2, open: 0, blush: 0.3, leaves: -1, tall: 0, slump: 1 },
};
const HANDS = {
    content: [-1.0, 0.55, 1.0, 0.55],
    happy: [-1.25, 1.75, 1.25, 1.75],
    sleepy: [-0.95, 0.5, 0.95, 0.5],
    cross: [0.32, 0.72, -0.32, 0.78],
    calm: [-0.38, 0.62, 0.38, 0.62],
    shy: [-0.36, 1.02, 0.36, 1.02],
    proud: [-1.04, 0.72, 1.04, 0.72],
    listen: [-1.0, 0.55, 1.02, 1.3],
    asleep: [-0.9, 0.42, 0.9, 0.42],
};
const KEYS = Object.keys(MOODS.content);
// Where the right hand holds the leaf up over its head.
const UMBRELLA = { x: 0.55, y: 2.15 };

export class Friend {
    constructor(options = {}) {
        this.mood = options.mood || 'content';
        this.headphones = !!options.headphones;
        this.pose = {};
        for (const key of KEYS) this.pose[key] = new Spring(MOODS[this.mood][key], 70, 13);
        this.hands = HANDS[this.mood].map((v) => new Spring(v, 120, 15));
        // A hand sent somewhere by the game, in body radii, or null to let the mood place it.
        this.reaching = [null, null];
        // The leaf held up over its head against the rain, 0 to 1.
        this.umbrella = new Spring(0, 90, 13);
        // Jumps and stamps, and how the body leans: radians, back is negative.
        this.hop = new Spring(0, 260, 14);
        this.lean = new Spring(0, 80, 12);
        this.time = 0;
        this.blinkAt = 1.5 + Math.random() * 2;
        // Where it looks, a direction: x to its right, y down.
        this.eye = { x: 0, y: 0.2 };
        this.eyeTarget = { x: 0, y: 0.2 };
        // The wind on its scarf and leaves, -1 to 1 (to its right), and how gusty.
        this.wind = new Spring(0, 30, 8);
        // A breath in and out, for a sigh, and the moment it began.
        this.sighAt = -10;
        this.yawnAt = -10;
        this.stomped = false;
    }

    // Change how it feels. The face and arms move there over a moment, as feelings do.
    feel(mood) {
        if (!MOODS[mood] || mood === this.mood) return;
        const from = this.mood;
        this.mood = mood;
        for (const key of KEYS) this.pose[key].target = MOODS[mood][key];
        HANDS[mood].forEach((v, i) => (this.hands[i].target = v));
        if (mood === 'calm' && (from === 'cross' || from === 'shy')) this.sigh();
        if (mood === 'happy' || mood === 'proud') this.hop.kick(-6);
        this.umbrella.target = 0;
    }

    // A long breath in, and out.
    sigh() {
        this.sighAt = this.time;
    }

    yawn() {
        this.yawnAt = this.time;
    }

    // Hold the leaf over its head, or put it down.
    shelter(on) {
        this.umbrella.target = on ? 1 : 0;
    }

    // Look towards (dx, dy) from its face: x to its right, y down. Any length.
    look(dx, dy) {
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        this.eyeTarget = { x: dx / len, y: dy / len };
    }

    // Send a hand (0 its left, 1 its right) to (x, y) in body radii from its feet, y up; null brings
    // it back to the mood's place.
    reach(hand, at) {
        this.reaching[hand] = at;
    }

    // A nod or a little jump, for a beat of music.
    bob(strength = 1) {
        this.hop.kick(-3 * strength);
    }

    windTo(w) {
        this.wind.target = clamp(w, -1, 1);
    }

    // True while anything is still moving. While it is awake something always is: it breathes.
    update(dt) {
        this.time += dt;
        for (const key of KEYS) this.pose[key].update(dt);
        const home = HANDS[this.mood];
        for (let h = 0; h < 2; h++) {
            // The leaf against the rain is held up in the right hand.
            const at = this.reaching[h] || (h === 1 && this.umbrella.target > 0 ? UMBRELLA : null);
            this.hands[h * 2].target = at ? at.x : home[h * 2];
            this.hands[h * 2 + 1].target = at ? at.y : home[h * 2 + 1];
        }
        for (const spring of this.hands) spring.update(dt);
        for (const spring of [this.umbrella, this.hop, this.lean, this.wind]) spring.update(dt);
        const t = this.time;
        // Moods that move by themselves: a dance, a stamp, a rock on the heels, a sway.
        if (this.mood === 'happy') {
            this.lean.target = Math.sin(t * TAU * 1) * 0.12;
            if (Math.floor(t * 2) !== Math.floor((t - dt) * 2)) this.hop.kick(-5);
        } else if (this.mood === 'cross') {
            this.lean.target = 0;
            if (Math.floor(t * 2.6) !== Math.floor((t - dt) * 2.6)) this.hop.kick(3.5);
        } else if (this.mood === 'proud') {
            this.lean.target = -0.07 + Math.sin(t * TAU * 0.4) * 0.03;
        } else if (this.mood === 'shy') {
            this.lean.target = -0.1 + Math.sin(t * TAU * 0.2) * 0.04;
        } else if (this.mood === 'listen') {
            this.lean.target = 0.16;
        } else {
            this.lean.target = 0;
        }
        // A foot comes down: twice in each step of a stamp, for the game to sound.
        this.stomped = this.mood === 'cross' && Math.floor(t * 5.2) !== Math.floor((t - dt) * 5.2);
        if (this.mood === 'sleepy' && t - this.yawnAt > 9) this.yawn();
        if (t > this.blinkAt) this.blinkAt = t + 2.2 + Math.random() * 3;
        const k = 1 - Math.exp(-dt * 8);
        this.eye.x += (this.eyeTarget.x - this.eye.x) * k;
        this.eye.y += (this.eyeTarget.y - this.eye.y) * k;
        return this.mood !== 'asleep' || !this.pose.eyes.settled() || !this.hop.settled();
    }

    // The breath, the sigh and the yawn, as how much taller, and how open the mouth: their effect now.
    breath() {
        const t = this.time;
        const slow = this.mood === 'sleepy' || this.mood === 'asleep';
        let rise = Math.sin(t * TAU * (slow ? 0.3 : 0.45)) * (slow ? 0.025 : 0.015);
        let mouth = 0;
        const s = t - this.sighAt;
        if (s >= 0 && s < 2.6) {
            // In for a second, out for a second and a half.
            rise +=
                s < 1
                    ? 0.07 * Math.sin((s / 1) * (Math.PI / 2))
                    : 0.07 * Math.cos(((s - 1) / 1.6) * (Math.PI / 2));
            if (s >= 1) mouth = 0.35 * Math.sin(((s - 1) / 1.6) * Math.PI);
        }
        const y = t - this.yawnAt;
        if (y >= 0 && y < 2.2) {
            const k = Math.sin((y / 2.2) * Math.PI);
            rise += 0.06 * k;
            mouth = Math.max(mouth, k);
        }
        return { rise, mouth, yawning: y >= 0 && y < 2.2 ? Math.sin((y / 2.2) * Math.PI) : 0 };
    }

    // Draw it standing with its feet on (x, y), `r` the radius of its round body. With `cut`, a y on
    // the screen, it stands behind something: nothing of it below `cut` shows but its arms, which
    // can reach over.
    draw(ctx, x, y, r, cut) {
        const p = {};
        for (const key of KEYS) p[key] = this.pose[key].value;
        const { rise, mouth, yawning } = this.breath();
        const t = this.time;
        const blink = this.time > this.blinkAt - 0.13 && p.eyes > 0.3;
        const lift = Math.max(0, -this.hop.value) * r * 0.05;
        const thump = Math.max(0, this.hop.value) * r * 0.02;
        const wind = this.wind.value;

        // Its shadow stays on the ground when it jumps.
        if (cut === undefined) {
            ellipse(ctx, x, y, r * (0.92 - lift / (r * 4)), r * 0.16);
            ctx.fillStyle = FRIEND.shadow;
            ctx.fill();
        }

        ctx.save();
        if (cut !== undefined) {
            ctx.beginPath();
            ctx.rect(x - r * 4, y - r * 6, r * 8, cut - (y - r * 6));
            ctx.clip();
        }
        ctx.translate(x, y - lift);
        ctx.rotate(this.lean.value);
        const stretch = 1 + p.tall * 0.07 + rise - p.slump * 0.06 - thump / r;
        const widen = 1 - p.tall * 0.03 + p.slump * 0.05 + thump / r;

        // The feet: in a stamp, one comes up and down, then the other.
        const stamp = this.mood === 'cross' ? t * 2.6 : 0;
        for (const side of [-1, 1]) {
            let up = 0;
            if (this.mood === 'cross') {
                const phase = (stamp + (side > 0 ? 0.5 : 0)) % 1;
                up = phase < 0.5 ? Math.sin((phase / 0.5) * Math.PI) * 0.22 : 0;
            }
            ellipse(ctx, side * r * 0.4, -r * (0.08 + up), r * 0.3, r * 0.14);
            ctx.fillStyle = FRIEND.deep;
            ctx.fill();
        }

        ctx.save();
        ctx.scale(widen, stretch);
        // The body, round as a seed, a little wider low down.
        ctx.beginPath();
        ctx.moveTo(0, -r * 2.08);
        ctx.bezierCurveTo(r * 0.6, -r * 2.08, r * 0.96, -r * 1.6, r * 0.96, -r * 1.0);
        ctx.bezierCurveTo(r * 0.96, -r * 0.32, r * 0.58, 0, 0, 0);
        ctx.bezierCurveTo(-r * 0.58, 0, -r * 0.96, -r * 0.32, -r * 0.96, -r * 1.0);
        ctx.bezierCurveTo(-r * 0.96, -r * 1.6, -r * 0.6, -r * 2.08, 0, -r * 2.08);
        ctx.closePath();
        ctx.fillStyle = FRIEND.body;
        ctx.fill();
        ellipse(ctx, 0, -r * 0.36, r * 0.56, r * 0.3);
        ctx.fillStyle = FRIEND.belly;
        ctx.fill();

        this.drawSprout(ctx, r, p, wind);
        this.drawScarf(ctx, r, wind);
        this.drawFace(ctx, r, p, blink, mouth, yawning);
        if (this.headphones) this.drawHeadphones(ctx, r);
        ctx.restore();
        ctx.restore();

        ctx.save();
        ctx.translate(x, y - lift);
        ctx.rotate(this.lean.value);
        this.drawArms(ctx, r, stretch, widen, yawning);
        ctx.restore();
    }

    drawSprout(ctx, r, p, wind) {
        const t = this.time;
        const sway = wind * 0.35 + Math.sin(t * TAU * 0.7) * 0.04 * (1 + Math.abs(wind) * 3);
        const shake = this.mood === 'cross' ? Math.sin(t * TAU * 7) * 0.08 : 0;
        ctx.save();
        ctx.translate(0, -r * 2.05);
        ctx.rotate(sway * 0.5 + shake);
        ctx.strokeStyle = FRIEND.leafDeep;
        ctx.lineWidth = r * 0.07;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(r * 0.04, -r * 0.18, 0, -r * 0.32);
        ctx.stroke();
        ctx.translate(0, -r * 0.3);
        // Perked, the leaves stand up in a V; drooping, they hang down either side.
        const lift = lerp(-0.25, 0.75, (p.leaves + 1) / 2);
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.rotate(side * (Math.PI / 2 - lift) + sway * 0.6 + shake);
            ellipse(ctx, 0, -r * 0.24, r * 0.13, r * 0.26);
            ctx.fillStyle = side < 0 ? FRIEND.leaf : FRIEND.leafDeep;
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    // The scarf: a band round its middle, knotted at one side, and a tail the wind can lift.
    drawScarf(ctx, r, wind) {
        const t = this.time;
        const y0 = -r * 0.9;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(-r * 0.96, y0 - r * 0.04);
        ctx.quadraticCurveTo(0, y0 + r * 0.16, r * 0.96, y0 - r * 0.04);
        ctx.lineTo(r * 0.95, y0 + r * 0.14);
        ctx.quadraticCurveTo(0, y0 + r * 0.34, -r * 0.95, y0 + r * 0.14);
        ctx.closePath();
        ctx.fillStyle = FRIEND.scarf;
        ctx.fill();
        ctx.clip();
        ctx.strokeStyle = FRIEND.stripe;
        ctx.lineWidth = r * 0.07;
        for (let k = -4; k <= 4; k++) {
            ctx.beginPath();
            ctx.moveTo(k * r * 0.26 - r * 0.05, y0 - r * 0.1);
            ctx.lineTo(k * r * 0.26 + r * 0.05, y0 + r * 0.4);
            ctx.stroke();
        }
        ctx.restore();
        // The tail: it hangs from the knot, and the wind lifts it out sideways, rippling.
        const kx = r * 0.58;
        const ky = y0 + r * 0.13;
        const strength = Math.abs(wind);
        const side = wind < -0.05 ? -1 : 1;
        const len = r * (0.62 + strength * 0.25);
        const points = [];
        for (let i = 0; i <= 6; i++) {
            const s = i / 6;
            const ripple =
                Math.sin(t * TAU * (1 + strength * 2.5) - s * 5) * s * r * (0.04 + strength * 0.09);
            const hangX = kx + s * r * 0.12;
            const hangY = ky + s * len;
            const flyX = kx + side * s * len * 1.4;
            const flyY = ky + s * r * 0.12;
            const x = lerp(hangX, flyX, strength) + ripple * strength;
            const y = lerp(hangY, flyY, strength) + ripple * (1 - strength * 0.4);
            points.push([x, y]);
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = FRIEND.scarf;
        ctx.lineWidth = r * 0.17;
        ctx.beginPath();
        points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
        ctx.strokeStyle = FRIEND.stripe;
        ctx.lineWidth = r * 0.05;
        ctx.setLineDash([r * 0.06, r * 0.12]);
        ctx.stroke();
        ctx.setLineDash([]);
        disc(ctx, kx, ky, r * 0.1, FRIEND.scarf);
    }

    drawFace(ctx, r, p, blink, mouth, yawning) {
        const ex = r * 0.34;
        const ey = -r * 1.36;
        const look = this.eye;
        const shut = blink || yawning > 0.4 ? 0 : p.eyes;
        ctx.lineCap = 'round';
        for (const side of [-1, 1]) {
            const x = side * ex;
            // Cheeks first, under the eyes.
            ellipse(ctx, side * r * 0.6, ey + r * 0.3, r * 0.15, r * 0.09);
            ctx.fillStyle = `${FRIEND.cheek}${(0.22 + p.blush * 0.5).toFixed(3)})`;
            ctx.fill();
            if (p.happy > 0.5) {
                // Squeezed shut with happiness: an arc, round side up.
                ctx.beginPath();
                ctx.arc(x, ey + r * 0.05, r * 0.11, Math.PI + 0.35, TAU - 0.35);
                ctx.strokeStyle = FRIEND.ink;
                ctx.lineWidth = r * 0.07;
                ctx.stroke();
            } else if (shut < 0.12) {
                // Shut, sleepy or blinking: an arc, round side down.
                ctx.beginPath();
                ctx.arc(x, ey - r * 0.02, r * 0.1, 0.35, Math.PI - 0.35);
                ctx.strokeStyle = FRIEND.ink;
                ctx.lineWidth = r * 0.065;
                ctx.stroke();
            } else {
                const px = x + look.x * r * 0.05;
                const py = ey + look.y * r * 0.04;
                const ry = r * 0.165;
                // A heavy lid covers the top of the eye: only what is below it shows.
                const lid = py + ry - 2 * ry * shut;
                ctx.save();
                if (shut < 0.97) {
                    ctx.beginPath();
                    ctx.rect(px - r * 0.2, lid, r * 0.4, r * 0.5);
                    ctx.clip();
                }
                ellipse(ctx, px, py, r * 0.125, ry);
                ctx.fillStyle = FRIEND.ink;
                ctx.fill();
                disc(ctx, px - r * 0.035, Math.max(py - r * 0.06, lid + r * 0.04), r * 0.04, '#FFFFFF');
                ctx.restore();
                if (shut < 0.97) {
                    ctx.beginPath();
                    ctx.moveTo(px - r * 0.135, lid);
                    ctx.lineTo(px + r * 0.135, lid);
                    ctx.strokeStyle = FRIEND.ink;
                    ctx.lineWidth = r * 0.045;
                    ctx.stroke();
                }
            }
            // Brows: cross, they slope down to the middle; worried, up.
            if (Math.abs(p.brow) > 0.08) {
                const tilt = p.brow * 0.45;
                const bx = x;
                const by = ey - r * 0.25 - Math.abs(p.brow) * r * 0.02;
                ctx.save();
                ctx.translate(bx, by);
                ctx.rotate(side * tilt);
                ctx.beginPath();
                ctx.moveTo(-r * 0.1, 0);
                ctx.lineTo(r * 0.1, 0);
                ctx.strokeStyle = FRIEND.ink;
                ctx.globalAlpha = clamp(Math.abs(p.brow) * 1.4, 0, 1);
                ctx.lineWidth = r * 0.06;
                ctx.stroke();
                ctx.restore();
            }
        }
        // The mouth: a curve, up for a smile, down for a frown; open for a song, a sigh or a yawn.
        const my = -r * 1.08;
        const open = Math.max(p.open, mouth);
        if (open > 0.06 && p.smile > 0.6 && mouth < 0.1) {
            // Laughing: a wide open smile, flat on top.
            ctx.beginPath();
            ctx.moveTo(-r * 0.15, my - r * 0.01);
            ctx.quadraticCurveTo(0, my + r * (0.06 + open * 0.3), r * 0.15, my - r * 0.01);
            ctx.closePath();
            ctx.fillStyle = '#8C5A50';
            ctx.fill();
            ellipse(ctx, 0, my + r * (0.03 + open * 0.08), r * 0.06, r * 0.03);
            ctx.fillStyle = '#E79A98';
            ctx.fill();
        } else if (open > 0.06) {
            ellipse(ctx, 0, my + r * 0.02, r * (0.08 + open * 0.04), r * (0.04 + open * 0.1));
            ctx.fillStyle = '#8C5A50';
            ctx.fill();
            ellipse(ctx, 0, my + r * 0.04 + open * r * 0.05, r * 0.05, r * 0.025 * open);
            ctx.fillStyle = '#E79A98';
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.moveTo(-r * 0.13, my);
            ctx.quadraticCurveTo(0, my + p.smile * r * 0.14, r * 0.13, my);
            ctx.strokeStyle = FRIEND.ink;
            ctx.lineWidth = r * 0.055;
            ctx.stroke();
        }
    }

    drawHeadphones(ctx, r) {
        ctx.save();
        ctx.strokeStyle = '#7E7068';
        ctx.lineWidth = r * 0.1;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, -r * 1.3, r * 0.9, Math.PI + 0.25, TAU - 0.25);
        ctx.stroke();
        for (const side of [-1, 1]) {
            ellipse(ctx, side * r * 0.9, -r * 1.25, r * 0.17, r * 0.27);
            ctx.fillStyle = '#6E6661';
            ctx.fill();
            ellipse(ctx, side * r * 0.94, -r * 1.25, r * 0.1, r * 0.2);
            ctx.fillStyle = '#E79A98';
            ctx.fill();
        }
        ctx.restore();
    }

    // The arms: from the shoulders to wherever the hands are, drawn over the body. The leaf held
    // up as an umbrella goes in the right hand.
    drawArms(ctx, r, stretch, widen, yawning) {
        const t = this.time;
        let [lx, ly, rx, ry] = this.hands.map((spring) => spring.value);
        if (this.mood === 'happy') {
            const wave = Math.sin(t * TAU * 1) * 0.25;
            lx += wave;
            rx += wave;
            ly += Math.cos(t * TAU * 2) * 0.1;
            ry -= Math.cos(t * TAU * 2) * 0.1;
        }
        if (yawning > 0.05 && !this.reaching[0] && !this.reaching[1]) {
            // Arms up in a long stretch.
            lx = lerp(lx, -1.1, yawning);
            ly = lerp(ly, 1.9, yawning);
            rx = lerp(rx, 1.1, yawning * (1 - this.umbrella.value));
            ry = lerp(ry, 1.9, yawning * (1 - this.umbrella.value));
        }
        const shoulders = [
            [-r * 0.72 * widen, -r * 0.92 * stretch],
            [r * 0.72 * widen, -r * 0.92 * stretch],
        ];
        const hands = [
            [lx * r, -ly * r],
            [rx * r, -ry * r],
        ];
        ctx.lineCap = 'round';
        for (let i = 0; i < 2; i++) {
            const [sx, sy] = shoulders[i];
            const [hx, hy] = hands[i];
            // The elbow bows outward, away from the body.
            const side = i === 0 ? -1 : 1;
            const mx = (sx + hx) / 2 + side * r * 0.12;
            const my = (sy + hy) / 2 + r * 0.04;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.quadraticCurveTo(mx, my, hx, hy);
            ctx.strokeStyle = FRIEND.deep;
            ctx.lineWidth = r * 0.22;
            ctx.stroke();
            disc(ctx, hx, hy, r * 0.13, FRIEND.deep);
        }
        const u = this.umbrella.value;
        if (u > 0.02) {
            // A big leaf on its stalk, held up in the right hand, arching over its head.
            const [hx, hy] = hands[1];
            ctx.save();
            ctx.translate(hx, hy);
            ctx.scale(u, u);
            ctx.strokeStyle = FRIEND.leafDeep;
            ctx.lineWidth = r * 0.07;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-r * 0.15, -r * 0.55);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-r * 1.25, -r * 0.35);
            ctx.quadraticCurveTo(-r * 0.6, -r * 1.25, r * 0.55, -r * 0.6);
            ctx.quadraticCurveTo(-r * 0.4, -r * 0.6, -r * 1.25, -r * 0.35);
            ctx.closePath();
            ctx.fillStyle = FRIEND.leaf;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-r * 1.1, -r * 0.42);
            ctx.quadraticCurveTo(-r * 0.45, -r * 0.92, r * 0.45, -r * 0.62);
            ctx.strokeStyle = FRIEND.leafDeep;
            ctx.lineWidth = r * 0.035;
            ctx.stroke();
            ctx.restore();
        }
    }
}

// Every mood, for the games and the tests.
export const FEELINGS = Object.keys(MOODS);
