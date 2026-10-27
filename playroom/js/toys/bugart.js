// Bug Maker's pictures: a bug drawn from its parts, each part on its own for the trays, the spot
// pots, and the meadow the finished bugs walk off into.
//
// A bug faces right. Its body is centred on the origin and about one unit long; its head goes on
// at the front, its legs underneath, its wings behind it on top, its spots on its back. `look` says
// how it moves: t the time, walk how much it is walking (its legs step), step how far through its
// steps it is (a foot comes down on each whole step, so its legs keep time with its song), sing how
// much it is singing (its wings buzz, its antennae bob), lit the spot singing now.

import { ellipse, disc, fillRound, makeLayer } from '../draw.js';
import { shade, rng, TAU } from '../util.js';

const INK = '#4E4038';
export const BODY_COLOURS = { round: '#E98C80', long: '#8EBF7A', heart: '#B9A3E0' };
const HEAD_COLOURS = { round: '#5E5A6E', eyes: '#6E7F5A', horns: '#7A5C45' };

// The body's outline, for clipping its spots and for telling whether a point is on it. In body
// units, x forward.
function bodyPath(ctx, body) {
    ctx.beginPath();
    if (body === 'round') ctx.ellipse(0, 0, 0.5, 0.4, 0, 0, TAU);
    else if (body === 'long') ctx.ellipse(0, 0, 0.62, 0.27, 0, 0, TAU);
    else {
        // A heart lying on its side, its point forward where the head goes.
        ctx.moveTo(0.5, 0.02);
        ctx.bezierCurveTo(0.2, -0.28, -0.05, -0.5, -0.3, -0.36);
        ctx.bezierCurveTo(-0.55, -0.22, -0.5, 0.0, -0.36, 0.06);
        ctx.bezierCurveTo(-0.55, 0.12, -0.55, 0.38, -0.3, 0.42);
        ctx.bezierCurveTo(-0.05, 0.46, 0.2, 0.3, 0.5, 0.02);
        ctx.closePath();
    }
}

// Whether a point, in body units, is on the body: near enough for a spot to stay.
export function onBody(body, x, y) {
    if (body === 'round') return (x * x) / 0.21 + (y * y) / 0.13 <= 1;
    if (body === 'long') return (x * x) / 0.34 + (y * y) / 0.06 <= 1;
    return (x * x) / 0.2 + (y * y) / 0.13 <= 1;
}

// Where the head goes on, and where the legs hang from, for each body.
const FRONT = { round: 0.46, long: 0.6, heart: 0.48 };
const UNDER = { round: 0.3, long: 0.2, heart: 0.3 };
const SPAN = { round: 0.62, long: 0.95, heart: 0.66 };

function drawWings(ctx, wings, look) {
    const buzz = look.sing ? Math.sin(look.t * 70) * 0.18 * look.sing : 0;
    ctx.save();
    if (wings === 'round') {
        for (const [x, a] of [
            [-0.12, -0.5],
            [0.08, -0.25],
        ]) {
            ellipse(ctx, x, -0.36, 0.3, 0.17, a + buzz);
            ctx.fillStyle = 'rgba(196, 226, 244, 0.85)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(118, 162, 192, 0.85)';
            ctx.lineWidth = 0.025;
            ctx.stroke();
        }
    } else if (wings === 'long') {
        for (const [x, a] of [
            [-0.18, -0.35],
            [0.0, -0.15],
        ]) {
            ellipse(ctx, x - 0.25, -0.3, 0.42, 0.09, a + buzz);
            ctx.fillStyle = 'rgba(196, 226, 244, 0.8)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(118, 162, 192, 0.85)';
            ctx.lineWidth = 0.025;
            ctx.stroke();
        }
    } else {
        // A butterfly's: big, coloured, an upper and a lower lobe, opening and closing as it sings.
        const open = 1 - Math.abs(buzz) * 2;
        ctx.translate(-0.05, -0.2);
        ctx.scale(1, open);
        for (const [x, y, rx, ry, a, colour] of [
            [-0.18, -0.36, 0.3, 0.24, -0.4, '#F2BAC3'],
            [-0.22, -0.1, 0.22, 0.16, 0.3, '#F3D36B'],
        ]) {
            ellipse(ctx, x, y, rx, ry, a);
            ctx.fillStyle = colour;
            ctx.fill();
            disc(ctx, x - 0.04, y - 0.02, ry * 0.35, 'rgba(255, 255, 255, 0.55)');
        }
    }
    ctx.restore();
}

function drawLegs(ctx, body, pairs, look, far) {
    const span = SPAN[body];
    const y = UNDER[body];
    ctx.strokeStyle = far ? shade(INK, 0.4) : INK;
    ctx.lineWidth = 0.045;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < pairs; i++) {
        const x = -span / 2 + ((i + 0.5) * span) / pairs + (far ? 0.05 : 0);
        // Alternate legs step together, as a beetle's do.
        const phase = (i + (far ? 1 : 0)) % 2;
        const a = (look.step === undefined ? look.t * 3 : look.step) * Math.PI + phase * Math.PI;
        const lift = look.walk ? Math.max(0, Math.sin(a)) * 0.08 * look.walk : 0;
        const swing = look.walk ? Math.cos(a) * 0.05 * look.walk : 0;
        ctx.moveTo(x, y - 0.08);
        ctx.lineTo(x + 0.06 + swing, y + 0.12 - lift);
        ctx.lineTo(x + 0.02 + swing * 1.6, y + 0.28 - lift);
    }
    ctx.stroke();
}

function drawHead(ctx, head, look) {
    const sing = look.sing || 0;
    const bob = Math.sin(look.t * 8) * 0.04 * sing;
    const colour = HEAD_COLOURS[head];
    ctx.save();
    ctx.translate(0, bob);
    // Antennae first, behind the head.
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.035;
    ctx.lineCap = 'round';
    if (head !== 'horns') {
        const tall = head === 'round' ? 0.34 : 0.22;
        for (const side of [-1, 1]) {
            const tip = { x: 0.06 + side * 0.1 + Math.sin(look.t * 6 + side) * 0.03 * sing, y: -0.18 - tall };
            ctx.beginPath();
            ctx.moveTo(0.02 + side * 0.05, -0.14);
            ctx.quadraticCurveTo(side * 0.12, -0.24 - tall * 0.4, tip.x, tip.y);
            ctx.stroke();
            disc(ctx, tip.x, tip.y, 0.045, head === 'round' ? '#F3D36B' : INK);
        }
    }
    const r = head === 'eyes' ? 0.25 : 0.22;
    disc(ctx, 0.08, 0, r, colour);
    if (head === 'horns') {
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(0.02 + side * 0.08, -0.16);
            ctx.quadraticCurveTo(side * 0.14, -0.36, 0.1 + side * 0.16, -0.38);
            ctx.quadraticCurveTo(side * 0.06, -0.26, 0.1 + side * 0.04, -0.17);
            ctx.closePath();
            ctx.fillStyle = '#E8D3B0';
            ctx.fill();
        }
    }
    if (head === 'eyes') {
        for (const dx of [0.0, 0.18]) {
            disc(ctx, dx, -0.06, 0.1, '#FFFDF6');
            disc(ctx, dx + 0.03, -0.05, 0.05, INK);
            disc(ctx, dx + 0.045, -0.07, 0.015, '#FFFFFF');
        }
    } else {
        for (const dx of [0.06, 0.18]) disc(ctx, dx, -0.05, 0.035, '#FFFDF6');
        for (const dx of [0.07, 0.19]) disc(ctx, dx, -0.045, 0.02, INK);
    }
    // A smile, open while it sings.
    ctx.strokeStyle = '#FFF2E0';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.arc(0.14, 0.05, 0.07 + sing * 0.02, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.restore();
}

function drawBody(ctx, body, spots, look) {
    bodyPath(ctx, body);
    ctx.fillStyle = BODY_COLOURS[body];
    ctx.fill();
    ctx.save();
    bodyPath(ctx, body);
    ctx.clip();
    // A lighter back, where the light falls, and the marks of its kind.
    ellipse(ctx, -0.05, -0.18, 0.4, 0.14);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fill();
    if (body === 'long') {
        ctx.strokeStyle = shade(BODY_COLOURS.long, -0.18);
        ctx.lineWidth = 0.025;
        for (const x of [-0.36, -0.12, 0.12, 0.36]) {
            ctx.beginPath();
            ctx.moveTo(x, -0.3);
            ctx.lineTo(x, 0.3);
            ctx.stroke();
        }
    }
    if (body === 'round') {
        ctx.strokeStyle = shade(BODY_COLOURS.round, -0.25);
        ctx.lineWidth = 0.025;
        ctx.beginPath();
        ctx.moveTo(-0.5, 0);
        ctx.lineTo(0.5, 0);
        ctx.stroke();
    }
    (spots || []).forEach((spot, i) => drawSpotOn(ctx, spot, look.lit === i));
    ctx.restore();
}

function drawSpotOn(ctx, spot, lit) {
    const r = lit ? 0.095 : 0.085;
    if (lit) disc(ctx, spot.x, spot.y, 0.13, 'rgba(255, 255, 240, 0.7)');
    // A pale ring, so a spot shows on a body of its own colour.
    disc(ctx, spot.x, spot.y, r + 0.018, 'rgba(255, 250, 238, 0.85)');
    disc(ctx, spot.x, spot.y, r, spot.colour);
    disc(ctx, spot.x - 0.025, spot.y - 0.03, 0.025, 'rgba(255, 255, 255, 0.5)');
}

// All of a bug but its legs, its wings, body, spots and head, still, drawn once into a layer of its
// own: for a bug drawn every frame at one size, as the meadow's are. Walking, only its legs move, so
// only they are drawn each frame; singing, it is drawn whole, its wings buzzing and its head bobbing.
// `k` is the bug's length, as for drawBug.
export function stillLayer(bug, k, scale) {
    const layer = makeLayer(k * 2, k * 1.4, scale);
    const ctx = layer.ctx;
    ctx.translate(k * 0.9, k * 0.9);
    ctx.scale(k, k);
    const look = { t: 0, walk: 0, sing: 0 };
    if (bug.wings && bug.wings !== 'butterfly') drawWings(ctx, bug.wings, look);
    drawBody(ctx, bug.body, bug.spots, look);
    if (bug.wings === 'butterfly') drawWings(ctx, bug.wings, look);
    if (bug.head) {
        ctx.translate(FRONT[bug.body] + 0.1, -0.08);
        drawHead(ctx, bug.head, look);
    }
    return layer;
}

// A bug from its parts: { body, head, legs (pairs), wings, spots: [{ x, y, colour }] }, any of them
// missing; `k` how long its body is; facing +1 right or -1 left; `still` the rest of it already drawn,
// from stillLayer at the same `k`, for while it is not singing.
export function drawBug(ctx, bug, x, y, k, look = {}, facing = 1, still = null) {
    const l = { t: look.t || 0, walk: look.walk || 0, step: look.step, sing: look.sing || 0, lit: look.lit };
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k * facing, k);
    const body = bug.body;
    if (body && bug.legs) drawLegs(ctx, body, bug.legs, l, true);
    if (body && still && !l.sing) {
        ctx.drawImage(still.canvas, -0.9, -0.9, 2, 1.4);
        if (bug.legs) drawLegs(ctx, body, bug.legs, l, false);
        ctx.restore();
        return;
    }
    if (bug.wings && !body) drawWings(ctx, bug.wings, l);
    if (body) {
        if (bug.wings && bug.wings !== 'butterfly') drawWings(ctx, bug.wings, l);
        drawBody(ctx, body, bug.spots, l);
        if (bug.wings === 'butterfly') drawWings(ctx, bug.wings, l);
        if (bug.legs) drawLegs(ctx, body, bug.legs, l, false);
        if (bug.head) {
            ctx.save();
            ctx.translate(FRONT[body] + 0.1, -0.08);
            drawHead(ctx, bug.head, l);
            ctx.restore();
        }
    } else {
        // Parts without a body yet lie where the body will be.
        if (bug.head) {
            ctx.save();
            ctx.translate(0.5, -0.08);
            drawHead(ctx, bug.head, l);
            ctx.restore();
        }
    }
    ctx.restore();
}

// Where a bug's body is, so a dropped spot can find its place: the point (px, py) on the screen, in
// body units, for a bug drawn at (x, y), `k` long, facing right.
export function toBody(px, py, x, y, k) {
    return { x: (px - x) / k, y: (py - y) / k };
}

// The parts on their own, for the trays.
export function drawBodyPart(ctx, body, x, y, k) {
    drawBug(ctx, { body }, x, y, k);
}
export function drawHeadPart(ctx, head, x, y, k) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k * 1.6, k * 1.6);
    ctx.translate(-0.08, 0.04);
    drawHead(ctx, head, { t: 0 });
    ctx.restore();
}
export function drawLegsPart(ctx, pairs, x, y, k) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    fillRound(ctx, -0.5, -0.06, 1, 0.1, 0.05, 'rgba(78, 64, 56, 0.25)');
    drawLegs(ctx, 'long', pairs, { t: 0 }, false);
    ctx.restore();
}
export function drawWingsPart(ctx, wings, x, y, k) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k * 1.3, k * 1.3);
    ctx.translate(0.1, 0.32);
    drawWings(ctx, wings, { t: 0 });
    ctx.restore();
}

// A pot of spots in one colour.
export function drawSpotPot(ctx, colour, x, y, r) {
    ellipse(ctx, x, y + r * 0.62, r * 0.95, r * 0.25);
    ctx.fillStyle = 'rgba(92, 70, 58, 0.16)';
    ctx.fill();
    fillRound(ctx, x - r * 0.8, y - r * 0.4, r * 1.6, r, r * 0.3, '#F4EBDD');
    ellipse(ctx, x, y - r * 0.4, r * 0.8, r * 0.26);
    ctx.fillStyle = '#E8DDCB';
    ctx.fill();
    for (const [dx, dy] of [
        [-0.3, -0.45],
        [0.25, -0.42],
        [0, -0.6],
    ])
        disc(ctx, x + dx * r, y + dy * r, r * 0.2, colour);
}

// A spot on its own, as it is carried.
export function drawSpot(ctx, colour, x, y, r) {
    disc(ctx, x + r * 0.15, y + r * 0.25, r, 'rgba(92, 70, 58, 0.18)');
    disc(ctx, x, y, r, colour);
    disc(ctx, x - r * 0.3, y - r * 0.35, r * 0.3, 'rgba(255, 255, 255, 0.5)');
}

// The meadow, across the top of the screen down to `ground`: sky, sun, hills and grass with flowers.
export function drawMeadow(ctx, w, h, u, ground) {
    const sky = ctx.createLinearGradient(0, 0, 0, ground);
    sky.addColorStop(0, '#BFDDF2');
    sky.addColorStop(1, '#E6F2F0');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, ground);
    disc(ctx, w * 0.84, ground * 0.22, 34 * u, '#F6D77E');
    ellipse(ctx, w * 0.25, ground * 0.62, w * 0.4, ground * 0.22);
    ctx.fillStyle = '#C7DDB5';
    ctx.fill();
    ellipse(ctx, w * 0.8, ground * 0.66, w * 0.42, ground * 0.2);
    ctx.fillStyle = '#BFD8AA';
    ctx.fill();
    ctx.fillStyle = '#AACB92';
    ctx.fillRect(0, ground * 0.62, w, ground * 0.38);
    const r = rng(31);
    const petals = ['#F2BAC3', '#F1CF5E', '#C9BBE3', '#FBF6EE', '#E79A98'];
    for (let i = 0; i < 22; i++) {
        const fx = r() * w;
        const fy = ground * (0.66 + r() * 0.3);
        ctx.strokeStyle = '#86B06A';
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx, fy - 10 * u);
        ctx.stroke();
        const colour = petals[i % petals.length];
        for (let p = 0; p < 5; p++) {
            const a = (p / 5) * TAU;
            disc(ctx, fx + Math.cos(a) * 4 * u, fy - 10 * u + Math.sin(a) * 4 * u, 3 * u, colour);
        }
        disc(ctx, fx, fy - 10 * u, 2.4 * u, '#E5C766');
    }
    ctx.strokeStyle = '#93BA7E';
    ctx.lineWidth = 2 * u;
    ctx.lineCap = 'round';
    for (let i = 0; i < 60; i++) {
        const gx = r() * w;
        const gy = ground * (0.66 + r() * 0.34);
        ctx.beginPath();
        ctx.moveTo(gx - 3 * u, gy);
        ctx.lineTo(gx - 5 * u, gy - 7 * u);
        ctx.moveTo(gx + 3 * u, gy);
        ctx.lineTo(gx + 5 * u, gy - 7 * u);
        ctx.stroke();
    }
}
