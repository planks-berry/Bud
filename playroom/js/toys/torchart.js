// Torch in the Dark's pictures: the garden, by torchlight and in the dark; the creatures asleep in
// it and awake; the lanterns, the fireflies, the moths and the torch.
//
// Everything is drawn through a `tone`: by torchlight a colour is itself, in the dark it is the same
// colour mostly lost in the night's blue. The garden is drawn once each way and kept, and the torch
// shows the lit one through its beam; a creature is drawn both ways each frame, the dark one
// everywhere and the lit one inside the beam. The dark is never black: shapes can still be made out,
// and the eyes of anything awake catch the light, so the dark is friendly.

import { ellipse, disc, fillRound } from '../draw.js';
import { clamp, lerp, rng, hexToRgb, mixRgb, rgbString, TAU } from '../util.js';
import { SPOTS } from './hiding.js';

export const NIGHT = '#1A2142';
const NIGHT_RGB = hexToRgb(NIGHT);

// The two tones: torchlight, a colour as it is; and the dark, most of the way to the night.
const darkCache = {};
export const LIT = (hex) => hex;
export const DARK = (hex) => {
    if (!darkCache[hex]) darkCache[hex] = rgbString(mixRgb(hexToRgb(hex), NIGHT_RGB, 0.8));
    return darkCache[hex];
};

//==============================================================================
// The garden

// The garden, the whole screen, in one tone. Kept as a layer, once lit and once dark.
export function drawGarden(ctx, w, h, u, tone, dark) {
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
    sky.addColorStop(0, dark ? '#121935' : '#2E3966');
    sky.addColorStop(1, dark ? '#202A50' : '#4B5888');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.56);
    const stars = rng(21);
    for (let i = 0; i < 46; i++) {
        const x = stars() * w;
        const y = stars() * h * 0.42;
        disc(
            ctx,
            x,
            y,
            (0.8 + stars() * 1.3) * u,
            `rgba(255, 246, 214, ${(0.35 + stars() * 0.45).toFixed(2)})`
        );
    }
    // Far hills, then the ground.
    ellipse(ctx, w * 0.25, h * 0.56, w * 0.42, h * 0.1);
    ctx.fillStyle = tone('#6F927C');
    ctx.fill();
    ellipse(ctx, w * 0.8, h * 0.57, w * 0.4, h * 0.09);
    ctx.fillStyle = tone('#668A74');
    ctx.fill();
    ctx.fillStyle = tone('#8DB57B');
    ctx.fillRect(0, h * 0.53, w, h * 0.47);
    const tufts = rng(8);
    ctx.fillStyle = tone('#9EC48A');
    for (let i = 0; i < 26; i++) {
        ellipse(ctx, tufts() * w, h * (0.6 + tufts() * 0.38), (30 + tufts() * 60) * u, (6 + tufts() * 8) * u);
        ctx.fill();
    }

    drawShed(ctx, w, h, u, tone);
    drawFence(ctx, w, h, u, tone);
    drawPath(ctx, w, h, u, tone);
    drawTree(ctx, w, h, u, tone);
    drawPond(ctx, w, h, u, tone);
    drawLog(ctx, w, h, u, tone);
    drawBush(ctx, w, h, u, tone);
    drawPots(ctx, w, h, u, tone);

    // Grass blades and flowers in front.
    const blades = rng(13);
    ctx.strokeStyle = tone('#7AA669');
    ctx.lineWidth = 2 * u;
    ctx.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
        const x = blades() * w;
        const y = h * (0.62 + blades() * 0.37);
        ctx.beginPath();
        ctx.moveTo(x - 4 * u, y);
        ctx.lineTo(x - 6 * u, y - 8 * u);
        ctx.moveTo(x + 4 * u, y);
        ctx.lineTo(x + 6 * u, y - 8 * u);
        ctx.stroke();
    }
    const petals = ['#F2BAC3', '#F1CF5E', '#C9BBE3', '#FBF6EE'];
    for (let i = 0; i < 14; i++) {
        const x = blades() * w;
        const y = h * (0.64 + blades() * 0.34);
        const colour = tone(petals[i % petals.length]);
        for (let p = 0; p < 5; p++) {
            const a = (p / 5) * TAU;
            disc(ctx, x + Math.cos(a) * 4 * u, y + Math.sin(a) * 4 * u, 3 * u, colour);
        }
        disc(ctx, x, y, 2.4 * u, tone('#E5C766'));
    }
}

function drawShed(ctx, w, h, u, tone) {
    const x0 = w * 0.72;
    const x1 = w * 0.92;
    const top = h * 0.36;
    const base = h * 0.56;
    const peak = h * 0.27;
    fillRound(ctx, x0, top, x1 - x0, base - top, 4 * u, tone('#E79A98'));
    for (let i = 1; i < 6; i++) {
        ctx.fillStyle = tone('#D88583');
        ctx.fillRect(x0 + ((x1 - x0) * i) / 6 - 1 * u, top + 4 * u, 2 * u, base - top - 8 * u);
    }
    ctx.beginPath();
    ctx.moveTo(x0 - 14 * u, top + 6 * u);
    ctx.lineTo((x0 + x1) / 2, peak);
    ctx.lineTo(x1 + 14 * u, top + 6 * u);
    ctx.closePath();
    ctx.fillStyle = tone('#9C6B5B');
    ctx.fill();
    const door = { x: (x0 + x1) / 2 - 22 * u, y: base - 74 * u };
    fillRound(ctx, door.x, door.y, 44 * u, 74 * u, 6 * u, tone('#C77472'));
    disc(ctx, door.x + 36 * u, door.y + 40 * u, 3 * u, tone('#E5C766'));
    fillRound(ctx, x0 + 12 * u, top + 16 * u, 30 * u, 26 * u, 4 * u, tone('#FBF6EE'));
    fillRound(ctx, x0 + 15 * u, top + 19 * u, 24 * u, 20 * u, 3 * u, tone('#ABCDEA'));
}

function drawFence(ctx, w, h, u, tone) {
    const x0 = w * 0.3;
    const x1 = w * 0.7;
    const base = h * 0.555;
    const top = h * 0.44;
    ctx.fillStyle = tone('#C9A27A');
    ctx.fillRect(x0, top + 14 * u, x1 - x0, 8 * u);
    ctx.fillRect(x0, base - 22 * u, x1 - x0, 8 * u);
    for (let x = x0; x <= x1; x += 22 * u) {
        ctx.beginPath();
        ctx.moveTo(x, base);
        ctx.lineTo(x, top + 6 * u);
        ctx.lineTo(x + 7 * u, top);
        ctx.lineTo(x + 14 * u, top + 6 * u);
        ctx.lineTo(x + 14 * u, base);
        ctx.closePath();
        ctx.fillStyle = tone('#D9B583');
        ctx.fill();
    }
}

function drawPath(ctx, w, h, u, tone) {
    ctx.beginPath();
    ctx.moveTo(w * 0.42, h);
    ctx.bezierCurveTo(w * 0.36, h * 0.8, w * 0.62, h * 0.68, w * 0.79, h * 0.56);
    ctx.lineTo(w * 0.83, h * 0.56);
    ctx.bezierCurveTo(w * 0.7, h * 0.7, w * 0.5, h * 0.82, w * 0.6, h);
    ctx.closePath();
    ctx.fillStyle = tone('#E2CDA8');
    ctx.fill();
    const stones = rng(17);
    for (let i = 0; i < 12; i++) {
        const k = stones();
        const x = lerp(w * 0.5, w * 0.8, k) + (stones() - 0.5) * 30 * u;
        const y = lerp(h * 0.96, h * 0.58, k);
        ellipse(ctx, x, y, (6 + stones() * 5) * u, (3 + stones() * 2) * u);
        ctx.fillStyle = tone('#D2BB94');
        ctx.fill();
    }
}

function drawTree(ctx, w, h, u, tone) {
    const x = w * 0.155;
    ctx.beginPath();
    ctx.moveTo(x - 30 * u, h * 0.6);
    ctx.quadraticCurveTo(x - 18 * u, h * 0.4, x - 20 * u, h * 0.22);
    ctx.lineTo(x + 20 * u, h * 0.22);
    ctx.quadraticCurveTo(x + 18 * u, h * 0.4, x + 30 * u, h * 0.6);
    ctx.closePath();
    ctx.fillStyle = tone('#9C7A5C');
    ctx.fill();
    // The owl's branch, out to the right.
    ctx.strokeStyle = tone('#9C7A5C');
    ctx.lineWidth = 14 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 10 * u, h * 0.4);
    ctx.quadraticCurveTo(w * 0.22, h * 0.37, w * 0.31, h * 0.365);
    ctx.stroke();
    // The hole in the trunk.
    const hole = SPOTS.treehole;
    ellipse(ctx, hole.x * w, hole.y * h, 15 * u, 19 * u);
    ctx.fillStyle = tone('#4E3B30');
    ctx.fill();
    const leaves = [
        [0.06, 0.16, 0.12, 0.1, '#6E9E5C'],
        [0.2, 0.13, 0.13, 0.1, '#7FAE6B'],
        [0.12, 0.08, 0.13, 0.09, '#86B572'],
        [0.27, 0.22, 0.09, 0.07, '#6E9E5C'],
        [0.03, 0.26, 0.08, 0.07, '#7FAE6B'],
    ];
    for (const [lx, ly, rx, ry, colour] of leaves) {
        ellipse(ctx, lx * w, ly * h, rx * w, ry * h);
        ctx.fillStyle = tone(colour);
        ctx.fill();
    }
}

function drawPond(ctx, w, h, u, tone) {
    ellipse(ctx, w * 0.17, h * 0.83, w * 0.15, h * 0.07);
    ctx.fillStyle = tone('#6AA4AE');
    ctx.fill();
    ellipse(ctx, w * 0.17, h * 0.825, w * 0.13, h * 0.055);
    ctx.fillStyle = tone('#7FB7C0');
    ctx.fill();
    for (const [x, y, r] of [
        [0.27, 0.855, 26],
        [0.09, 0.81, 20],
        [0.2, 0.8, 16],
    ]) {
        ctx.beginPath();
        ctx.moveTo(x * w, y * h);
        ctx.arc(x * w, y * h, r * u, 0.3, TAU - 0.1);
        ctx.closePath();
        ctx.fillStyle = tone('#8EBF7A');
        ctx.fill();
    }
}

function drawLog(ctx, w, h, u, tone) {
    const at = SPOTS.log;
    const x = at.x * w;
    const y = at.y * h + 14 * u;
    fillRound(ctx, x - 80 * u, y - 24 * u, 160 * u, 48 * u, 24 * u, tone('#B4875F'));
    ctx.strokeStyle = tone('#9C7350');
    ctx.lineWidth = 2 * u;
    for (const dy of [-10, 0, 10]) {
        ctx.beginPath();
        ctx.moveTo(x - 60 * u, y + dy * u);
        ctx.lineTo(x + 50 * u, y + dy * u);
        ctx.stroke();
    }
    ellipse(ctx, x + 72 * u, y, 14 * u, 24 * u);
    ctx.fillStyle = tone('#DDB98F');
    ctx.fill();
    ellipse(ctx, x + 72 * u, y, 7 * u, 12 * u);
    ctx.strokeStyle = tone('#B4875F');
    ctx.stroke();
}

function drawBush(ctx, w, h, u, tone) {
    const at = SPOTS.bush;
    const x = at.x * w;
    const y = at.y * h + 18 * u;
    for (const [dx, dy, r, colour] of [
        [-50, 6, 40, '#6FA35E'],
        [48, 8, 38, '#6FA35E'],
        [-12, -16, 48, '#82B56F'],
        [24, 2, 40, '#78AC66'],
    ]) {
        disc(ctx, x + dx * u, y + dy * u, r * u, tone(colour));
    }
    for (const [dx, dy] of [
        [-30, -20],
        [10, -36],
        [40, -10],
    ])
        disc(ctx, x + dx * u, y + dy * u, 4 * u, tone('#F2BAC3'));
}

function drawPots(ctx, w, h, u, tone) {
    const at = SPOTS.pot;
    for (const [dx, s] of [
        [0, 1],
        [58, 0.8],
    ]) {
        const x = at.x * w + dx * u;
        const y = at.y * h + 30 * u;
        ctx.beginPath();
        ctx.moveTo(x - 26 * s * u, y - 36 * s * u);
        ctx.lineTo(x + 26 * s * u, y - 36 * s * u);
        ctx.lineTo(x + 19 * s * u, y + 10 * s * u);
        ctx.lineTo(x - 19 * s * u, y + 10 * s * u);
        ctx.closePath();
        ctx.fillStyle = tone('#E39A72');
        ctx.fill();
        fillRound(ctx, x - 29 * s * u, y - 42 * s * u, 58 * s * u, 10 * s * u, 4 * u, tone('#D4855E'));
        for (const a of [-0.5, 0, 0.5]) {
            ctx.strokeStyle = tone('#6E9E5C');
            ctx.lineWidth = 3 * u;
            ctx.beginPath();
            ctx.moveTo(x, y - 40 * s * u);
            ctx.lineTo(x + Math.sin(a) * 26 * s * u, y - (40 + Math.cos(a) * 30) * s * u);
            ctx.stroke();
            disc(
                ctx,
                x + Math.sin(a) * 26 * s * u,
                y - (40 + Math.cos(a) * 30) * s * u,
                6 * s * u,
                tone(a ? '#F1CF5E' : '#F2BAC3')
            );
        }
    }
}

//==============================================================================
// The creatures. Each is drawn standing on (x, y), `k` the size of it (about 60 at u = 1). `look`:
// awake 0 to 1, act 0 to 1 (doing its thing), t the time. `tone` as above.

// Eyes: shut, a curve; open, round and bright, looking at (lx, ly).
function eyes(ctx, points, r, awake, tone, look) {
    for (const [x, y] of points) {
        if (awake < 0.35) {
            ctx.strokeStyle = tone('#3F3530');
            ctx.lineWidth = r * 0.45;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(x, y - r * 0.2, r * 0.8, 0.2 * Math.PI, 0.8 * Math.PI);
            ctx.stroke();
        } else {
            const open = clamp((awake - 0.35) / 0.65, 0, 1) * (look.blink ? 0.15 : 1);
            ellipse(ctx, x, y, r, r * open);
            ctx.fillStyle = tone('#FFF6D6');
            ctx.fill();
            disc(
                ctx,
                x + (look.lx || 0) * r * 0.3,
                y + (look.ly || 0) * r * 0.3,
                r * 0.55 * Math.max(0.2, open),
                tone('#3F3530')
            );
        }
    }
}

const DRAW = {
    owl(ctx, x, y, k, look, tone) {
        const a = look.awake;
        const puff = look.act * 0.08;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(look.t * 3) * 0.08 * look.act);
        ellipse(ctx, 0, -k * 0.45, k * (0.36 + puff), k * 0.46);
        ctx.fillStyle = tone('#A07A5C');
        ctx.fill();
        ellipse(ctx, 0, -k * 0.36, k * 0.24, k * 0.3);
        ctx.fillStyle = tone('#E8D3B0');
        ctx.fill();
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * k * 0.14, -k * 0.86);
            ctx.lineTo(side * k * 0.3, -k * 1.0);
            ctx.lineTo(side * k * 0.3, -k * 0.78);
            ctx.closePath();
            ctx.fillStyle = tone('#8A6649');
            ctx.fill();
            ellipse(ctx, side * k * 0.33, -k * 0.42, k * 0.1, k * 0.24, side * -0.2 - side * look.act * 0.4);
            ctx.fillStyle = tone('#8A6649');
            ctx.fill();
        }
        eyes(
            ctx,
            [
                [-k * 0.13, -k * 0.68],
                [k * 0.13, -k * 0.68],
            ],
            k * 0.11,
            a,
            tone,
            look
        );
        ctx.beginPath();
        ctx.moveTo(-k * 0.04, -k * 0.6);
        ctx.lineTo(k * 0.04, -k * 0.6);
        ctx.lineTo(0, -k * 0.52);
        ctx.closePath();
        ctx.fillStyle = tone('#E5C766');
        ctx.fill();
        for (const side of [-1, 1]) disc(ctx, side * k * 0.1, -k * 0.02, k * 0.045, tone('#E5C766'));
        ctx.restore();
    },

    hedgehog(ctx, x, y, k, look, tone) {
        // Asleep it is a ball of spines; awake it uncurls, its snout out, sniffing.
        const a = clamp(look.awake, 0, 1);
        ctx.save();
        ctx.translate(x, y);
        const spines = tone('#7A5C45');
        const n = 13;
        ctx.fillStyle = spines;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
            const ang = Math.PI + (i / n) * Math.PI;
            const r = k * (i % 2 ? 0.5 : 0.4) * (1 + a * 0.05);
            ctx.lineTo(Math.cos(ang) * r * (1 + a * 0.25), -k * 0.05 + Math.sin(ang) * r);
        }
        ctx.closePath();
        ctx.fill();
        ellipse(ctx, 0, -k * 0.12, k * 0.42 * (1 + a * 0.2), k * 0.24);
        ctx.fillStyle = tone('#93725A');
        ctx.fill();
        if (a > 0.05) {
            const sniff = Math.sin(look.t * 14) * 0.02 * k * look.act;
            ellipse(ctx, k * (0.42 + 0.12 * a), -k * 0.12, k * 0.2 * a, k * 0.13);
            ctx.fillStyle = tone('#E8C9A8');
            ctx.fill();
            disc(ctx, k * (0.42 + 0.3 * a) + sniff, -k * 0.13, k * 0.045, tone('#3F3530'));
            eyes(ctx, [[k * (0.42 + 0.06 * a), -k * 0.2]], k * 0.045, a, tone, look);
            for (const lx of [-0.2, 0.1, 0.3])
                fillRound(ctx, lx * k, -k * 0.02, k * 0.08, k * 0.06 * a, k * 0.03, tone('#6E5442'));
        }
        ctx.restore();
    },

    snail(ctx, x, y, k, look, tone) {
        // When the light first finds it, it pulls its eyes in; then, slowly, out again.
        const out = clamp(look.eyes === undefined ? 1 : look.eyes, 0, 1);
        ctx.save();
        ctx.translate(x, y);
        fillRound(ctx, -k * 0.4, -k * 0.16, k * 0.82, k * 0.16, k * 0.08, tone('#D8C9B0'));
        ctx.strokeStyle = tone('#C9B89C');
        ctx.lineWidth = k * 0.05;
        ctx.lineCap = 'round';
        for (const side of [0.22, 0.34]) {
            ctx.beginPath();
            ctx.moveTo(k * 0.3, -k * 0.12);
            ctx.lineTo(k * (0.3 + side * 0.4), -k * (0.12 + 0.28 * out));
            ctx.stroke();
            disc(ctx, k * (0.3 + side * 0.4), -k * (0.12 + 0.28 * out), k * 0.045, tone('#3F3530'));
        }
        disc(ctx, -k * 0.06, -k * 0.38, k * 0.3, tone('#E8A97C'));
        ctx.strokeStyle = tone('#C97F5A');
        ctx.lineWidth = k * 0.05;
        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
            const ang = (i / 30) * TAU * 1.6;
            const r = k * 0.24 * (1 - i / 34);
            const px = -k * 0.06 + Math.cos(ang) * r;
            const py = -k * 0.38 + Math.sin(ang) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.restore();
    },

    frog(ctx, x, y, k, look, tone) {
        const a = look.awake;
        ctx.save();
        ctx.translate(x, y);
        for (const side of [-1, 1]) {
            ellipse(ctx, side * k * 0.3, -k * 0.08, k * 0.2, k * 0.1);
            ctx.fillStyle = tone('#7AAE68');
            ctx.fill();
        }
        ellipse(ctx, 0, -k * 0.24, k * 0.38, k * 0.26);
        ctx.fillStyle = tone('#8EBF7A');
        ctx.fill();
        // The throat swells as it sings.
        const throat = look.act * (0.5 + 0.5 * Math.sin(look.t * 16));
        ellipse(ctx, 0, -k * 0.12, k * (0.16 + throat * 0.1), k * (0.1 + throat * 0.08));
        ctx.fillStyle = tone('#E9F0D8');
        ctx.fill();
        for (const side of [-1, 1]) disc(ctx, side * k * 0.16, -k * 0.46, k * 0.12, tone('#8EBF7A'));
        eyes(
            ctx,
            [
                [-k * 0.16, -k * 0.48],
                [k * 0.16, -k * 0.48],
            ],
            k * 0.08,
            a,
            tone,
            look
        );
        ctx.strokeStyle = tone('#5E8A50');
        ctx.lineWidth = k * 0.025;
        ctx.beginPath();
        ctx.arc(0, -k * 0.3, k * 0.12, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        ctx.restore();
    },

    mouse(ctx, x, y, k, look, tone) {
        // It peeks out further as it wakes.
        const a = clamp(look.awake, 0, 1);
        ctx.save();
        ctx.translate(x, y);
        const up = k * 0.16 * a;
        ellipse(ctx, 0, -k * 0.16 - up * 0.5, k * 0.28, k * 0.2 + up * 0.3);
        ctx.fillStyle = tone('#B8ADA4');
        ctx.fill();
        for (const side of [-1, 1]) {
            disc(ctx, side * k * 0.17, -k * 0.36 - up, k * 0.12, tone('#B8ADA4'));
            disc(ctx, side * k * 0.17, -k * 0.36 - up, k * 0.07, tone('#F2BAC3'));
        }
        disc(ctx, 0, -k * 0.06 - up * 0.4, k * 0.04, tone('#E0899A'));
        eyes(
            ctx,
            [
                [-k * 0.08, -k * 0.2 - up * 0.6],
                [k * 0.08, -k * 0.2 - up * 0.6],
            ],
            k * 0.045,
            a,
            tone,
            look
        );
        if (a > 0.3) {
            ctx.strokeStyle = tone('#8F857D');
            ctx.lineWidth = k * 0.015;
            const twitch = Math.sin(look.t * 18) * 0.03 * k * look.act;
            for (const side of [-1, 1])
                for (const dy of [-0.02, 0.03]) {
                    ctx.beginPath();
                    ctx.moveTo(side * k * 0.04, -k * 0.07 - up * 0.4);
                    ctx.lineTo(side * k * 0.24, -k * (0.07 + dy) - up * 0.4 + twitch);
                    ctx.stroke();
                }
        }
        ctx.restore();
    },

    cricket(ctx, x, y, k, look, tone) {
        ctx.save();
        ctx.translate(x, y);
        ctx.strokeStyle = tone('#6E9454');
        ctx.lineWidth = k * 0.03;
        ctx.lineCap = 'round';
        // Long back legs, folded.
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(-k * 0.1, -k * 0.12);
            ctx.lineTo(-k * 0.28, -k * 0.24 - side * 0.02 * k);
            ctx.lineTo(-k * 0.34, -k * 0.02);
            ctx.stroke();
        }
        ellipse(ctx, 0, -k * 0.12, k * 0.26, k * 0.09);
        ctx.fillStyle = tone('#9CC57F');
        ctx.fill();
        // Its wings shiver as it chirps.
        const shiver = look.act * Math.sin(look.t * 60) * 0.06;
        ellipse(ctx, -k * 0.04, -k * 0.17, k * 0.2, k * 0.06, -0.08 + shiver);
        ctx.fillStyle = tone('#86B06A');
        ctx.fill();
        disc(ctx, k * 0.24, -k * 0.13, k * 0.07, tone('#9CC57F'));
        eyes(ctx, [[k * 0.27, -k * 0.15]], k * 0.025, look.awake, tone, look);
        ctx.beginPath();
        ctx.moveTo(k * 0.28, -k * 0.18);
        ctx.quadraticCurveTo(k * 0.5, -k * 0.5, k * 0.7, -k * 0.38);
        ctx.moveTo(k * 0.27, -k * 0.18);
        ctx.quadraticCurveTo(k * 0.4, -k * 0.55, k * 0.6, -k * 0.56);
        ctx.stroke();
        ctx.restore();
    },
};

export function drawCreature(ctx, who, x, y, k, look, tone) {
    DRAW[who](ctx, x, y, k, look, tone);
}

// Where an awake creature's eyes are, in its own measure, so they can catch the light in the dark.
export const GLINTS = {
    owl: [
        [-0.13, -0.68],
        [0.13, -0.68],
    ],
    hedgehog: [[0.48, -0.2]],
    snail: [],
    frog: [
        [-0.16, -0.48],
        [0.16, -0.48],
    ],
    mouse: [
        [-0.08, -0.3],
        [0.08, -0.3],
    ],
    cricket: [[0.27, -0.15]],
};

//==============================================================================
// Lanterns, fireflies, moths, the moon and the torch

// A paper lantern hanging at (x, y), `r` across: dark until its creature wakes, then glowing.
export function drawLantern(ctx, x, y, r, colour, glow) {
    if (glow > 0.01) {
        const g = ctx.createRadialGradient(x, y + r * 0.6, 0, x, y + r * 0.6, r * 3.2);
        g.addColorStop(0, `rgba(255, 228, 160, ${(0.42 * glow).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255, 228, 160, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 3.2, y - r * 2.6, r * 6.4, r * 6.4);
    }
    const base = hexToRgb(colour);
    const lit = mixRgb(base, [255, 246, 214], 0.35);
    const body = rgbString(mixRgb(mixRgb(base, NIGHT_RGB, 0.8), lit, clamp(glow, 0, 1)));
    fillRound(ctx, x - r * 0.25, y, r * 0.5, r * 0.18, r * 0.06, '#3E3A44');
    ellipse(ctx, x, y + r * 0.62, r * 0.5, r * 0.45);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.strokeStyle = `rgba(0, 0, 0, ${(0.12 * (1 - glow * 0.5)).toFixed(3)})`;
    ctx.lineWidth = r * 0.04;
    for (const k of [-0.25, 0, 0.25]) {
        ellipse(ctx, x + k * r * 0.6, y + r * 0.62, r * 0.14 + Math.abs(k) * 0.1 * r, r * 0.44);
        ctx.stroke();
    }
    fillRound(ctx, x - r * 0.25, y + r * 1.02, r * 0.5, r * 0.16, r * 0.06, '#3E3A44');
}

// A firefly: a bright dot in a soft halo, `on` 0 to 1 as it blinks.
export function drawFirefly(ctx, x, y, r, on) {
    if (on <= 0.02) {
        disc(ctx, x, y, r * 0.5, 'rgba(120, 140, 90, 0.5)');
        return;
    }
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    g.addColorStop(0, `rgba(230, 255, 150, ${(0.6 * on).toFixed(3)})`);
    g.addColorStop(1, 'rgba(230, 255, 150, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
    disc(ctx, x, y, r, `rgba(246, 255, 200, ${(0.4 + 0.6 * on).toFixed(3)})`);
}

// A moth in the torchlight: pale wings beating.
export function drawMoth(ctx, x, y, r, t) {
    const beat = Math.abs(Math.sin(t * 22));
    for (const side of [-1, 1]) {
        ellipse(ctx, x + side * r * 0.5 * beat, y, r * 0.55 * beat + r * 0.1, r * 0.4, side * 0.3);
        ctx.fillStyle = 'rgba(244, 236, 220, 0.9)';
        ctx.fill();
    }
    ellipse(ctx, x, y, r * 0.12, r * 0.35);
    ctx.fillStyle = '#B9A88F';
    ctx.fill();
}

// The moon, rising at Bloom: a soft disc with its glow.
export function drawMoon(ctx, x, y, r) {
    const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 3.5);
    g.addColorStop(0, 'rgba(255, 244, 200, 0.22)');
    g.addColorStop(1, 'rgba(255, 244, 200, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 3.5, y - r * 3.5, r * 7, r * 7);
    disc(ctx, x, y, r, '#F7E7A6');
    disc(ctx, x - r * 0.3, y - r * 0.2, r * 0.18, 'rgba(220, 200, 140, 0.45)');
    disc(ctx, x + r * 0.25, y + r * 0.3, r * 0.12, 'rgba(220, 200, 140, 0.45)');
}

// The torch, its lens at (x, y), pointing along `angle`, `k` long; `on` lights its lens.
export function drawTorch(ctx, x, y, k, angle, on, press = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(k, k);
    // The handle runs back from the lens: along -x.
    fillRound(ctx, -1, -0.13, 0.72, 0.26, 0.12, '#E26F6A');
    fillRound(ctx, -0.96, -0.1, 0.64, 0.05, 0.025, 'rgba(255, 255, 255, 0.25)');
    ctx.beginPath();
    ctx.moveTo(-0.32, -0.13);
    ctx.lineTo(-0.06, -0.24);
    ctx.lineTo(0, -0.24);
    ctx.lineTo(0, 0.24);
    ctx.lineTo(-0.06, 0.24);
    ctx.lineTo(-0.32, 0.13);
    ctx.closePath();
    ctx.fillStyle = '#F3D36B';
    ctx.fill();
    ellipse(ctx, 0, 0, 0.06, 0.24);
    ctx.fillStyle = on ? '#FFF8D8' : '#B9B4A8';
    ctx.fill();
    // The button, pressed in a little when tapped.
    fillRound(ctx, -0.68, -0.21 + press * 0.04, 0.16, 0.1, 0.04, on ? '#FBE7A6' : '#F3D36B');
    ctx.restore();
}
