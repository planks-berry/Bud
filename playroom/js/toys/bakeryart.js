// The Bakery's pictures: the kitchen, the jars on its shelf, the bowl and what is in it, dough and the
// shapes it is baked in, the oven with its window, the rack things cool on, candles, and the recipe
// on the wall.
//
// Things on the counter are seen a little from above, so a bowl shows its rim and a bun its top.
// Each is drawn about (x, y), `k` its size in pixels.

import { ellipse, disc, fillRound } from '../draw.js';
import { clamp, lerp, TAU, hexToRgb, mixRgb, rgbString } from '../util.js';

const INK = '#5A4A3F';
export const DOUGH = '#F4E4C6';
const GOLDEN = '#E3AE66';
const BROWN = '#C98C4E';
const BATTER = '#F5D98B';

// The colour of something in the oven, `brown` 0 raw to 1 done: pale dough, golden, a little
// darker at the very end.
const CRUST = {};
export function crust(brown, raw = DOUGH) {
    const key = raw + Math.round(brown * 40);
    if (CRUST[key]) return CRUST[key];
    const b = clamp(brown, 0, 1);
    const c =
        b < 0.75
            ? mixRgb(hexToRgb(raw), hexToRgb(GOLDEN), b / 0.75)
            : mixRgb(hexToRgb(GOLDEN), hexToRgb(BROWN), (b - 0.75) / 0.25);
    return (CRUST[key] = rgbString(c));
}

//==============================================================================
// The kitchen

// The wall's tiles, the shelf, the counter and the floor, for the background layer. `at` is the
// layout: wall { shelf }, counter { back, front, face }, and the floor below it.
export function drawKitchen(ctx, w, h, u, at) {
    ctx.fillStyle = '#F7F0E4';
    ctx.fillRect(0, 0, w, at.back);
    // Tiles: a soft grid.
    const tile = 46 * u;
    ctx.strokeStyle = 'rgba(205, 188, 164, 0.35)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    for (let y = at.back; y > 0; y -= tile) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
    }
    for (let row = 0, y = at.back; y > 0; row++, y -= tile) {
        for (let x = (row % 2) * tile * 0.5; x < w; x += tile) {
            ctx.moveTo(x, y);
            ctx.lineTo(x, Math.max(0, y - tile));
        }
    }
    ctx.stroke();
    // The shelf.
    const s = at.shelf;
    ctx.fillStyle = 'rgba(92, 70, 58, 0.12)';
    ctx.fillRect(s.x0, s.y + 6 * u, s.x1 - s.x0, 10 * u);
    fillRound(ctx, s.x0, s.y - 4 * u, s.x1 - s.x0, 14 * u, 4 * u, '#D7B58C');
    ctx.fillStyle = '#C59E73';
    ctx.fillRect(s.x0 + 2 * u, s.y + 6 * u, s.x1 - s.x0 - 4 * u, 4 * u);
    for (const x of [s.x0 + 24 * u, s.x1 - 24 * u]) {
        ctx.fillStyle = '#C59E73';
        ctx.beginPath();
        ctx.moveTo(x - 6 * u, s.y + 10 * u);
        ctx.lineTo(x + 6 * u, s.y + 10 * u);
        ctx.lineTo(x, s.y + 34 * u);
        ctx.closePath();
        ctx.fill();
    }
    // The counter's top, seen a little from above, and its front.
    const grad = ctx.createLinearGradient(0, at.back, 0, at.front);
    grad.addColorStop(0, '#E2C49C');
    grad.addColorStop(1, '#EBD2AE');
    ctx.fillStyle = grad;
    ctx.fillRect(0, at.back, w, at.front - at.back);
    ctx.fillStyle = 'rgba(92, 70, 58, 0.1)';
    ctx.fillRect(0, at.back, w, 6 * u);
    ctx.fillStyle = '#D2AF84';
    ctx.fillRect(0, at.front, w, 8 * u);
    ctx.fillStyle = '#C9A275';
    ctx.fillRect(0, at.front + 8 * u, w, at.face - at.front - 8 * u);
    // Cupboard doors on the front.
    const doors = Math.max(3, Math.round(w / (230 * u)));
    for (let i = 0; i < doors; i++) {
        const x0 = (i / doors) * w + 10 * u;
        const x1 = ((i + 1) / doors) * w - 10 * u;
        fillRound(ctx, x0, at.front + 18 * u, x1 - x0, at.face - at.front - 30 * u, 8 * u, '#D2AD80');
        disc(ctx, i % 2 ? x0 + 16 * u : x1 - 16 * u, (at.front + at.face) / 2, 5 * u, '#A9845C');
    }
    // The floor.
    ctx.fillStyle = '#EADDC9';
    ctx.fillRect(0, at.face, w, h - at.face);
    ctx.fillStyle = 'rgba(92, 70, 58, 0.12)';
    ctx.fillRect(0, at.face, w, 10 * u);
    ctx.strokeStyle = 'rgba(190, 168, 140, 0.4)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    for (let x = 0; x < w; x += 90 * u) {
        ctx.moveTo(x, at.face);
        ctx.lineTo(x - 40 * u, h);
    }
    ctx.stroke();
}

//==============================================================================
// The jars

// A jar on the shelf, standing on (x, y), `k` tall, tipped by `tilt` radians about its base, `level`
// how full. Flour in a glass jar, water in a blue jug, eggs in a box, sugar in a jar with a pink lid,
// and from Sprout seeds, sprinkles and berries.
export function drawJar(ctx, kind, x, y, k, tilt = 0, level = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    if (kind === 'water') drawJug(ctx, k, level);
    else if (kind === 'egg') drawEggBox(ctx, k);
    else if (kind === 'berries') drawBasket(ctx, k);
    else drawGlassJar(ctx, kind, k, level);
    ctx.restore();
}

const JAR = {
    flour: { fill: '#FBF7EF', lid: '#D9B98F', dots: null },
    sugar: { fill: '#FFFFFF', lid: '#F2BAC3', dots: 'rgba(242, 186, 195, 0.6)' },
    seeds: { fill: '#E8D3A6', lid: '#B59670', dots: '#A88456' },
    sprinkles: { fill: '#FBF3E6', lid: '#AE93D6', dots: 'colours' },
};
const SPRINKLES = ['#E79A98', '#F1CF5E', '#8EBF7A', '#7FB2DE', '#AE93D6'];

function drawGlassJar(ctx, kind, k, level) {
    const look = JAR[kind];
    const w = k * 0.62;
    const h = k * 0.8;
    // The glass.
    fillRound(ctx, -w / 2, -h, w, h, k * 0.14, 'rgba(226, 238, 240, 0.9)');
    // What is in it.
    const fill = h * 0.82 * clamp(level, 0, 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2 + k * 0.05, -fill - k * 0.04, w - k * 0.1, fill);
    ctx.clip();
    fillRound(ctx, -w / 2 + k * 0.05, -h + k * 0.06, w - k * 0.1, h - k * 0.1, k * 0.1, look.fill);
    if (look.dots) {
        for (let i = 0; i < 26; i++) {
            const dx = (((i * 37) % 23) / 23 - 0.5) * (w - k * 0.16);
            const dy = (-((i * 53) % 29) / 29) * (h - k * 0.16) - k * 0.06;
            const colour = look.dots === 'colours' ? SPRINKLES[i % SPRINKLES.length] : look.dots;
            if (look.dots === 'colours') {
                ctx.save();
                ctx.translate(dx, dy);
                ctx.rotate(i);
                fillRound(ctx, -k * 0.035, -k * 0.01, k * 0.07, k * 0.022, k * 0.011, colour);
                ctx.restore();
            } else disc(ctx, dx, dy, k * 0.018, colour);
        }
    }
    ctx.restore();
    // Its shine, and its lid.
    fillRound(
        ctx,
        -w / 2 + k * 0.07,
        -h + k * 0.12,
        k * 0.06,
        h * 0.6,
        k * 0.03,
        'rgba(255, 255, 255, 0.55)'
    );
    fillRound(ctx, -w / 2 - k * 0.03, -h - k * 0.1, w + k * 0.06, k * 0.14, k * 0.05, look.lid);
    ctx.strokeStyle = 'rgba(92, 70, 58, 0.25)';
    ctx.lineWidth = k * 0.025;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -k * 0.02);
    ctx.lineTo(w / 2, -k * 0.02);
    ctx.stroke();
}

function drawJug(ctx, k, level) {
    const w = k * 0.6;
    const h = k * 0.78;
    // The handle, then the body, a little wider at the bottom, and the spout.
    ctx.strokeStyle = '#6FA0C8';
    ctx.lineWidth = k * 0.08;
    ctx.beginPath();
    ctx.arc(-w * 0.55, -h * 0.55, k * 0.17, Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w * 0.42, -h);
    ctx.lineTo(w * 0.42, -h);
    ctx.lineTo(w * 0.62, -h - k * 0.08);
    ctx.lineTo(w * 0.5, -h * 0.8);
    ctx.quadraticCurveTo(w * 0.6, -h * 0.1, w * 0.45, 0);
    ctx.lineTo(-w * 0.45, 0);
    ctx.quadraticCurveTo(-w * 0.6, -h * 0.1, -w * 0.45, -h * 0.85);
    ctx.closePath();
    ctx.fillStyle = '#8FBCE0';
    ctx.fill();
    // The water showing at its top, and a shine.
    const l = clamp(level, 0, 1);
    if (l > 0) {
        ellipse(ctx, 0, -h * (0.15 + 0.7 * l), w * 0.4, k * 0.05);
        ctx.fillStyle = '#B9DBF2';
        ctx.fill();
    }
    fillRound(ctx, -w * 0.32, -h * 0.75, k * 0.07, h * 0.55, k * 0.035, 'rgba(255, 255, 255, 0.45)');
}

function drawEggBox(ctx, k) {
    const w = k * 0.86;
    const h = k * 0.3;
    // Three eggs standing in a box.
    for (const dx of [-0.26, 0, 0.26]) {
        ellipse(ctx, dx * k, -h - k * 0.12, k * 0.12, k * 0.16);
        ctx.fillStyle = '#FBF3E3';
        ctx.fill();
        disc(ctx, dx * k - k * 0.04, -h - k * 0.18, k * 0.03, 'rgba(255, 255, 255, 0.8)');
    }
    fillRound(ctx, -w / 2, -h, w, h, k * 0.06, '#C8B597');
    ctx.strokeStyle = 'rgba(92, 70, 58, 0.18)';
    ctx.lineWidth = k * 0.02;
    ctx.beginPath();
    for (const dx of [-0.13, 0.13]) {
        ctx.moveTo(dx * k, -h + k * 0.04);
        ctx.lineTo(dx * k, -k * 0.04);
    }
    ctx.stroke();
}

function drawBasket(ctx, k) {
    const w = k * 0.8;
    const h = k * 0.36;
    for (const [dx, dy] of [
        [-0.2, -0.42],
        [0, -0.46],
        [0.2, -0.42],
        [-0.1, -0.52],
        [0.1, -0.52],
    ]) {
        disc(ctx, dx * k, dy * k, k * 0.1, '#D9606A');
        disc(ctx, dx * k - k * 0.03, dy * k - k * 0.03, k * 0.03, 'rgba(255, 255, 255, 0.6)');
    }
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h);
    ctx.lineTo(w / 2, -h);
    ctx.lineTo(w * 0.4, 0);
    ctx.lineTo(-w * 0.4, 0);
    ctx.closePath();
    ctx.fillStyle = '#C79A62';
    ctx.fill();
    ctx.strokeStyle = 'rgba(92, 70, 58, 0.25)';
    ctx.lineWidth = k * 0.02;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
        ctx.moveTo(-w / 2 + (w * 0.1 * i) / 3, -h + (h * i) / 3);
        ctx.lineTo(w / 2 - (w * 0.1 * i) / 3, -h + (h * i) / 3);
    }
    ctx.stroke();
}

// A puff of flour, `t` 0 to 1 of its life, rising and spreading from (x, y).
export function drawPuff(ctx, x, y, k, t) {
    const a = (1 - t) * 0.8;
    if (a <= 0) return;
    for (const [dx, dy, r] of [
        [0, 0, 0.3],
        [-0.25, 0.08, 0.22],
        [0.24, 0.06, 0.24],
        [-0.1, -0.2, 0.2],
        [0.14, -0.18, 0.18],
    ]) {
        disc(
            ctx,
            x + dx * k * (1 + t),
            y + dy * k - t * k * 0.6,
            r * k * (0.6 + t),
            `rgba(255, 252, 246, ${a.toFixed(3)})`
        );
    }
}

// What pours from a jar held over the bowl: a stream from (x0, y0) down to (x1, y1).
export function drawStream(ctx, kind, x0, y0, x1, y1, k, t) {
    if (kind === 'water') {
        ctx.strokeStyle = 'rgba(143, 188, 224, 0.85)';
        ctx.lineWidth = k * 0.08;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.5, x1, y1);
        ctx.stroke();
        return;
    }
    // Flour and sugar fall as a soft stream of specks.
    const colour = kind === 'sugar' ? '#FFFFFF' : '#FBF7EF';
    for (let i = 0; i < 14; i++) {
        const f = (((i / 14 + t * 2.5) % 1) + 1) % 1;
        const x = lerp(x0, x1, f) + Math.sin(i * 2.1 + t * 9) * k * 0.03;
        const y = lerp(y0, y1, f);
        disc(ctx, x, y, k * (0.035 + 0.02 * ((i * 7) % 3)), colour);
    }
}

//==============================================================================
// The bowl

// The bowl, seen a little from above, centred on its rim at (x, y), `r` its radius. `bowl` says what
// is in it ({ flour, water, egg, sugar }, each 0 to 1), `stir` how far it is stirred (0 to 1), `mix`
// what it makes ('dough' or 'batter') once there is enough, and `angle` where the spoon is.
export function drawBowlBack(ctx, x, y, r) {
    ellipse(ctx, x, y, r, r * 0.34);
    ctx.fillStyle = '#E9E2D6';
    ctx.fill();
}

export function drawBowlInside(ctx, x, y, r, bowl, stir, mix, t) {
    const inner = r * 0.9;
    ctx.save();
    ellipse(ctx, x, y, inner, inner * 0.32);
    ctx.clip();
    // Raw, before stirring: a heap of flour, a pool of water, a yolk or two, sugar sparkling.
    const raw = 1 - clamp(stir, 0, 1);
    if (raw > 0) {
        ctx.globalAlpha = raw;
        if (bowl.water > 0) {
            ellipse(
                ctx,
                x + r * 0.2,
                y + r * 0.06,
                r * 0.5 * Math.sqrt(bowl.water),
                r * 0.15 * Math.sqrt(bowl.water)
            );
            ctx.fillStyle = '#B9DBF2';
            ctx.fill();
        }
        if (bowl.flour > 0) {
            const f = Math.sqrt(bowl.flour);
            ellipse(ctx, x - r * 0.18, y + r * 0.04, r * 0.48 * f, r * 0.2 * f);
            ctx.fillStyle = '#FBF7EF';
            ctx.fill();
            ellipse(ctx, x - r * 0.2, y - r * 0.02, r * 0.3 * f, r * 0.14 * f);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
        }
        if (bowl.sugar > 0) {
            for (let i = 0; i < 10 * bowl.sugar; i++)
                disc(
                    ctx,
                    x + Math.cos(i * 2.4) * r * 0.4,
                    y + r * 0.08 + Math.sin(i * 2.4) * r * 0.08,
                    r * 0.025,
                    '#FFFFFF'
                );
        }
        if (bowl.egg > 0) {
            disc(ctx, x + r * 0.25, y + r * 0.02, r * 0.16, '#FFFDF3');
            disc(ctx, x + r * 0.26, y + r * 0.02, r * 0.08, '#F5C04A');
        }
        ctx.globalAlpha = 1;
    }
    // Stirred: the mix, swirling, coming together.
    if (stir > 0 && mix) {
        ctx.globalAlpha = clamp(stir * 1.5, 0, 1);
        ellipse(ctx, x, y + r * 0.04, inner * 0.92, inner * 0.28);
        ctx.fillStyle = mix === 'batter' ? BATTER : DOUGH;
        ctx.fill();
        ctx.strokeStyle = mix === 'batter' ? 'rgba(214, 170, 80, 0.5)' : 'rgba(200, 170, 130, 0.5)';
        ctx.lineWidth = r * 0.03;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
            const a = t * 2 + i * 2.1;
            ctx.ellipse(x, y + r * 0.04, inner * (0.25 + i * 0.2), inner * (0.08 + i * 0.06), 0, a, a + 2.4);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    ctx.restore();
}

export function drawBowlFront(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.ellipse(x, y, r, r * 0.34, 0, Math.PI, 0, true);
    ctx.quadraticCurveTo(x + r, y + r * 0.85, x, y + r * 0.86);
    ctx.quadraticCurveTo(x - r, y + r * 0.85, x - r, y);
    ctx.closePath();
    ctx.fillStyle = '#9CC5B5';
    ctx.fill();
    ellipse(ctx, x, y + r * 0.92, r * 0.42, r * 0.08);
    ctx.fillStyle = 'rgba(92, 70, 58, 0.14)';
    ctx.fill();
    // The rim and a stripe round it.
    ctx.strokeStyle = '#B9D8CC';
    ctx.lineWidth = r * 0.06;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.34, 0, 0, Math.PI);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = r * 0.05;
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.32, r * 0.92, r * 0.3, 0, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
}

// The wooden spoon, its bowl at (x, y) in the mix, its handle leaning out towards `angle`.
export function drawSpoon(ctx, x, y, r, angle) {
    const hx = x + Math.cos(angle) * r * 0.5 + r * 0.55;
    const hy = y - r * 0.9;
    ctx.strokeStyle = '#C99A64';
    ctx.lineWidth = r * 0.09;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ellipse(ctx, x, y, r * 0.14, r * 0.08, Math.atan2(hy - y, hx - x));
    ctx.fillStyle = '#C99A64';
    ctx.fill();
}

//==============================================================================
// Dough, and what it is baked into

// The outline of a shape, centred on the origin, about 1 across.
function shapePath(ctx, shape) {
    ctx.beginPath();
    if (shape === 'roll') ctx.ellipse(0, 0, 0.75, 0.3, 0, 0, TAU);
    else if (shape === 'star') {
        for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5;
            const r = i % 2 ? 0.27 : 0.55;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.8);
        }
        ctx.closePath();
    } else if (shape === 'heart') {
        ctx.moveTo(0, 0.42);
        ctx.bezierCurveTo(-0.6, 0.05, -0.45, -0.5, 0, -0.18);
        ctx.bezierCurveTo(0.45, -0.5, 0.6, 0.05, 0, 0.42);
        ctx.closePath();
    } else if (shape === 'flower') {
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (i * TAU) / 5;
            ctx.moveTo(Math.cos(a) * 0.27 + 0.2, Math.sin(a) * 0.27 * 0.8);
            ctx.ellipse(Math.cos(a) * 0.27, Math.sin(a) * 0.27 * 0.8, 0.2, 0.17, a, 0, TAU);
        }
        ctx.moveTo(0.25, 0);
        ctx.ellipse(0, 0, 0.25, 0.2, 0, 0, TAU);
    } else ctx.ellipse(0, 0, 0.5, 0.36, 0, 0, TAU);
}

// Something made of dough at (x, y), `k` across: `item` { shape, toppings: [{ kind, x, y }], smooth },
// `look` { rise, brown, squash }: how far it has risen, how brown it is, and how flat it is pressed.
export function drawDough(ctx, item, x, y, k, look = {}) {
    const rise = look.rise || 0;
    const squash = look.squash || 0;
    const sx = k * (1 + 0.12 * rise + 0.3 * squash);
    const sy = k * (1 + 0.18 * rise - 0.35 * squash);
    const colour = crust(look.brown || 0);
    ctx.save();
    ctx.translate(x, y);
    // Its shadow, then its side, then its top.
    ellipse(ctx, 0, k * 0.2, sx * 0.5, k * 0.1);
    ctx.fillStyle = 'rgba(92, 70, 58, 0.14)';
    ctx.fill();
    ctx.save();
    ctx.scale(sx, sy);
    ctx.translate(0, 0.08 + 0.08 * rise);
    shapePath(ctx, item.shape);
    ctx.fillStyle = crust(Math.min(1, (look.brown || 0) + 0.25));
    ctx.fill();
    ctx.translate(0, -0.08 - 0.12 * rise);
    shapePath(ctx, item.shape);
    ctx.fillStyle = colour;
    ctx.fill();
    // A rough lump until it is kneaded smooth; then a soft shine.
    if (!item.smooth) {
        ctx.strokeStyle = 'rgba(190, 160, 120, 0.45)';
        ctx.lineWidth = 0.03;
        ctx.beginPath();
        ctx.moveTo(-0.25, -0.05);
        ctx.quadraticCurveTo(-0.1, -0.12, 0.05, -0.02);
        ctx.moveTo(0.05, 0.1);
        ctx.quadraticCurveTo(0.18, 0.02, 0.28, 0.1);
        ctx.stroke();
    } else {
        ellipse(ctx, -0.12, -0.1, 0.16, 0.07, -0.3);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fill();
    }
    if (item.shape === 'roll') {
        ctx.strokeStyle = crust(Math.min(1, (look.brown || 0) + 0.3));
        ctx.lineWidth = 0.035;
        ctx.beginPath();
        for (const dx of [-0.35, 0, 0.35]) {
            ctx.moveTo(dx - 0.08, -0.12);
            ctx.lineTo(dx + 0.08, 0.1);
        }
        ctx.stroke();
    }
    ctx.restore();
    // Toppings on top.
    for (const top of item.toppings || []) drawTopping(ctx, top.kind, top.x * sx, top.y * sy - 0.04 * k, k);
    ctx.restore();
}

function drawTopping(ctx, kind, x, y, k) {
    if (kind === 'seeds') {
        ellipse(ctx, x, y, k * 0.025, k * 0.012, 0.6);
        ctx.fillStyle = '#7A5C45';
        ctx.fill();
    } else if (kind === 'berries') {
        disc(ctx, x, y, k * 0.05, '#D9606A');
        disc(ctx, x - k * 0.015, y - k * 0.015, k * 0.015, 'rgba(255, 255, 255, 0.7)');
    } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(x * 13 + y * 7);
        fillRound(
            ctx,
            -k * 0.03,
            -k * 0.009,
            k * 0.06,
            k * 0.018,
            k * 0.009,
            SPRINKLES[Math.abs(Math.round(x * 31 + y * 17)) % 5]
        );
        ctx.restore();
    }
}

// A cake tin with batter in it, or the cake baked in it, at (x, y), `k` across. `look` { rise, brown },
// and `flat` for a cake with no eggs.
export function drawCake(ctx, x, y, k, look = {}, tin = true) {
    const rise = look.rise || 0;
    const top = k * (0.08 + 0.2 * rise);
    ctx.save();
    ctx.translate(x, y);
    ellipse(ctx, 0, k * 0.16, k * 0.52, k * 0.1);
    ctx.fillStyle = 'rgba(92, 70, 58, 0.14)';
    ctx.fill();
    if (tin) {
        fillRound(ctx, -k * 0.5, -k * 0.02, k, k * 0.18, k * 0.04, '#C9CED3');
        ellipse(ctx, 0, -k * 0.02, k * 0.5, k * 0.13);
        ctx.fillStyle = '#B4BAC0';
        ctx.fill();
    }
    // The cake: its side, and its top, risen.
    const colour = look.brown ? crust(look.brown, BATTER) : BATTER;
    ctx.fillStyle = crust(Math.min(1, (look.brown || 0) + 0.2), BATTER);
    ctx.fillRect(-k * 0.46, -top, k * 0.92, top);
    ellipse(ctx, 0, 0, k * 0.46, k * 0.12);
    ctx.fill();
    ellipse(ctx, 0, -top, k * 0.46, k * 0.12);
    ctx.fillStyle = colour;
    ctx.fill();
    if (look.brown > 0.8) {
        // Done: a little icing, dripping.
        ellipse(ctx, 0, -top, k * 0.42, k * 0.1);
        ctx.fillStyle = '#FBF3F4';
        ctx.fill();
        for (const dx of [-0.32, -0.12, 0.1, 0.3]) disc(ctx, dx * k, -top + k * 0.08, k * 0.035, '#FBF3F4');
    }
    ctx.restore();
}

// Candles on a cake, standing on its top at (x, y), `k` the cake's size; `lit` 0 to 1, flickering.
export function drawCandles(ctx, count, x, y, k, lit, t) {
    const colours = ['#E79A98', '#7FB2DE', '#F1CF5E', '#8EBF7A', '#AE93D6'];
    for (let i = 0; i < count; i++) {
        const dx = (count === 1 ? 0 : (i / (count - 1) - 0.5) * 0.6) * k;
        const dy = Math.abs(dx) * 0.08;
        fillRound(ctx, x + dx - k * 0.025, y + dy - k * 0.22, k * 0.05, k * 0.22, k * 0.015, colours[i % 5]);
        if (lit > 0) {
            const f = 1 + Math.sin(t * 17 + i * 2) * 0.12;
            ellipse(ctx, x + dx, y + dy - k * 0.27, k * 0.035 * lit, k * 0.06 * f * lit);
            ctx.fillStyle = '#F6C65B';
            ctx.fill();
            ellipse(ctx, x + dx, y + dy - k * 0.26, k * 0.015 * lit, k * 0.03 * f * lit);
            ctx.fillStyle = '#FFF6D8';
            ctx.fill();
        }
    }
}

// The box of candles, at (x, y), `k` across.
export function drawCandleBox(ctx, x, y, k, left) {
    fillRound(ctx, x - k * 0.5, y - k * 0.3, k, k * 0.3, k * 0.06, '#F2BAC3');
    const colours = ['#E79A98', '#7FB2DE', '#F1CF5E', '#8EBF7A', '#AE93D6'];
    for (let i = 0; i < left; i++)
        fillRound(ctx, x - k * 0.4 + i * k * 0.18, y - k * 0.5, k * 0.07, k * 0.3, k * 0.02, colours[i % 5]);
    fillRound(ctx, x - k * 0.5, y - k * 0.22, k, k * 0.22, k * 0.06, '#F7CFD5');
}

//==============================================================================
// Tools: the rolling pin and the cutters

export function drawRollingPin(ctx, x, y, k, angle = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ellipse(ctx, 0, k * 0.08, k * 0.42, k * 0.05);
    ctx.fillStyle = 'rgba(92, 70, 58, 0.14)';
    ctx.fill();
    for (const side of [-1, 1])
        fillRound(ctx, side > 0 ? k * 0.3 : -k * 0.5, -k * 0.035, k * 0.2, k * 0.07, k * 0.035, '#B98A5C');
    fillRound(ctx, -k * 0.32, -k * 0.07, k * 0.64, k * 0.14, k * 0.07, '#E2C08F');
    fillRound(ctx, -k * 0.28, -k * 0.055, k * 0.56, k * 0.03, k * 0.015, 'rgba(255, 255, 255, 0.4)');
    ctx.restore();
}

// A cutter, a shape's outline in metal, at (x, y), `k` across.
export function drawCutter(ctx, shape, x, y, k) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    shapePath(ctx, shape);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = '#AEB6BD';
    ctx.stroke();
    ctx.lineWidth = 0.025;
    ctx.strokeStyle = '#E3E8EC';
    ctx.stroke();
    ctx.restore();
}

//==============================================================================
// The board, the rack and the oven

export function drawBoard(ctx, x, y, w, h, u) {
    fillRound(ctx, x - w / 2 + 6 * u, y - h / 2 + 8 * u, w, h, 14 * u, 'rgba(92, 70, 58, 0.14)');
    fillRound(ctx, x - w / 2, y - h / 2, w, h, 14 * u, '#E9C99B');
    fillRound(ctx, x - w / 2, y + h / 2 - 8 * u, w, 8 * u, 4 * u, '#D3AE7C');
    ctx.strokeStyle = 'rgba(180, 140, 95, 0.3)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
        ctx.moveTo(x - w / 2 + 16 * u, y - h / 2 + (h * i) / 4);
        ctx.quadraticCurveTo(x, y - h / 2 + (h * i) / 4 + 4 * u, x + w / 2 - 16 * u, y - h / 2 + (h * i) / 4);
    }
    ctx.stroke();
    // A dusting of flour.
    for (let i = 0; i < 18; i++)
        disc(
            ctx,
            x + Math.cos(i * 2.7) * w * 0.32,
            y + Math.sin(i * 1.9) * h * 0.3,
            2 * u,
            'rgba(255, 252, 246, 0.8)'
        );
}

export function drawRack(ctx, x, y, w, h, u) {
    ctx.strokeStyle = '#A9B2BA';
    ctx.lineWidth = 3 * u;
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + (side * w) / 2 - side * 8 * u, y);
        ctx.lineTo(x + (side * w) / 2 - side * 2 * u, y + h * 0.5);
        ctx.stroke();
    }
    fillRound(ctx, x - w / 2, y - h * 0.18, w, h * 0.36, 6 * u, 'rgba(169, 178, 186, 0.25)');
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
        const lx = x - w / 2 + (w * i) / 8;
        ctx.moveTo(lx, y - h * 0.18);
        ctx.lineTo(lx, y + h * 0.18);
    }
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
    ctx.stroke();
}

// The oven on the wall, its box `o` { x, y, w, h } and its door's window `o.window`. `state`:
// door 0 shut to 1 open, glow 0 to 1 how warm it is inside, dial 0 to 1 how far the timer has run.
export function drawOvenBody(ctx, o, u) {
    fillRound(ctx, o.x + 6 * u, o.y + 8 * u, o.w, o.h, 18 * u, 'rgba(92, 70, 58, 0.14)');
    fillRound(ctx, o.x, o.y, o.w, o.h, 18 * u, '#A9CFC1');
    fillRound(ctx, o.x + 8 * u, o.y + 8 * u, o.w - 16 * u, o.panel - 12 * u, 10 * u, '#C3E0D5');
    // The inside, dark and warm, behind the door.
    const win = o.window;
    fillRound(ctx, win.x - 10 * u, win.y - 10 * u, win.w + 20 * u, win.h + 20 * u, 14 * u, '#8DB9AA');
    fillRound(ctx, win.x, win.y, win.w, win.h, 10 * u, '#4E3F3A');
    // Knobs.
    for (const dx of [0.2, 0.8]) {
        disc(ctx, o.x + o.w * dx, o.y + o.panel * 0.5, o.panel * 0.18, '#F4EBDD');
        ctx.fillStyle = '#B59670';
        ctx.fillRect(o.x + o.w * dx - 2 * u, o.y + o.panel * 0.5 - o.panel * 0.15, 4 * u, o.panel * 0.12);
    }
}

// What is drawn over the inside every frame: the warm light, the rack inside, and the door, shut or
// open (it opens down, on a hinge at its foot). `inside` draws what is baking, before the glass.
export function drawOvenFront(ctx, o, u, state, t, inside) {
    const win = o.window;
    const glow = clamp(state.glow, 0, 1);
    if (glow > 0 && state.light) {
        // The warm light inside, drawn once (ovenLight), faded with the oven's heat.
        ctx.globalAlpha = glow;
        ctx.drawImage(state.light.canvas, win.x, win.y, win.w, win.h);
        ctx.globalAlpha = 1;
    }
    // The shelf inside.
    ctx.strokeStyle = 'rgba(200, 200, 200, 0.4)';
    ctx.lineWidth = 2 * u;
    ctx.beginPath();
    ctx.moveTo(win.x + 6 * u, win.y + win.h * 0.78);
    ctx.lineTo(win.x + win.w - 6 * u, win.y + win.h * 0.78);
    ctx.stroke();
    if (inside) inside();
    const door = clamp(state.door, 0, 1);
    if (door < 0.98) {
        // The door, its glass catching the light. Opening, it folds down towards the counter.
        const dh = (win.h + 20 * u) * (1 - door);
        const top = win.y + win.h + 10 * u - dh;
        ctx.strokeStyle = '#8DB9AA';
        ctx.lineWidth = 10 * u;
        ctx.strokeRect(win.x - 5 * u, top + 5 * u, win.w + 10 * u, Math.max(0, dh - 10 * u));
        ctx.fillStyle = 'rgba(190, 225, 235, 0.16)';
        ctx.fillRect(win.x, top + 10 * u, win.w, Math.max(0, dh - 20 * u));
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.beginPath();
        ctx.moveTo(win.x + win.w * 0.12, top + 10 * u);
        ctx.lineTo(win.x + win.w * 0.3, top + 10 * u);
        ctx.lineTo(win.x + win.w * 0.12, top + 10 * u + Math.max(0, dh - 20 * u) * 0.6);
        ctx.closePath();
        ctx.fill();
        // The handle.
        fillRound(ctx, win.x + win.w * 0.2, top - 2 * u, win.w * 0.6, 10 * u, 5 * u, '#F4EBDD');
    }
    if (door > 0.02) {
        // The door folded down below the window.
        const dh = (win.h + 20 * u) * door * 0.35;
        fillRound(ctx, win.x - 10 * u, win.y + win.h + 10 * u, win.w + 20 * u, dh, 8 * u, '#8DB9AA');
        fillRound(
            ctx,
            win.x,
            win.y + win.h + 12 * u,
            win.w,
            Math.max(0, dh - 6 * u),
            6 * u,
            'rgba(190, 225, 235, 0.5)'
        );
    }
    // The timer's dial, its hand going round as it bakes, and the light.
    const dx = o.x + o.w / 2;
    const dy = o.y + o.panel * 0.5;
    const dr = o.panel * 0.3;
    disc(ctx, dx, dy, dr, '#FBF6EE');
    if (state.dial > 0) {
        ctx.beginPath();
        ctx.moveTo(dx, dy);
        ctx.arc(dx, dy, dr * 0.85, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(state.dial, 0, 1));
        ctx.closePath();
        ctx.fillStyle = 'rgba(241, 207, 94, 0.6)';
        ctx.fill();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3 * u;
    ctx.lineCap = 'round';
    const a = -Math.PI / 2 + TAU * clamp(state.dial, 0, 1);
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx + Math.cos(a) * dr * 0.75, dy + Math.sin(a) * dr * 0.75);
    ctx.stroke();
    disc(ctx, o.x + o.w * 0.5, o.y + o.panel * 0.86, 4 * u, glow > 0.05 ? '#F6B35B' : '#C9B9A8');
    void t;
}

// The warm light inside the oven, for a layer of its own, `w` by `h`.
export function drawOvenLight(ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, w * 0.7);
    g.addColorStop(0, 'rgba(255, 196, 120, 0.75)');
    g.addColorStop(1, 'rgba(220, 120, 70, 0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

//==============================================================================
// The recipe on the wall

// A card pinned to the wall with the cake's recipe in pictures: flour, an egg and sugar; the spoon in
// the bowl; the oven. `done` how many steps are done, each ticked.
export function drawRecipe(ctx, x, y, w, h, u, done) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.02);
    fillRound(ctx, 4 * u, 6 * u, w, h, 8 * u, 'rgba(92, 70, 58, 0.14)');
    fillRound(ctx, 0, 0, w, h, 8 * u, '#FFFDF6');
    disc(ctx, w / 2, 8 * u, 6 * u, '#E79A98');
    const step = w / 3;
    const cy = h * 0.55;
    const k = Math.min(step * 0.42, h * 0.5);
    // 1: flour, an egg and sugar.
    drawJar(ctx, 'flour', step * 0.5 - k * 0.35, cy + k * 0.4, k * 0.6);
    ellipse(ctx, step * 0.5 + k * 0.05, cy + k * 0.2, k * 0.12, k * 0.16);
    ctx.fillStyle = '#FBF3E3';
    ctx.fill();
    ctx.strokeStyle = 'rgba(92, 70, 58, 0.3)';
    ctx.lineWidth = 1.5 * u;
    ctx.stroke();
    drawJar(ctx, 'sugar', step * 0.5 + k * 0.42, cy + k * 0.4, k * 0.5);
    // 2: the spoon in the bowl.
    drawBowlBack(ctx, step * 1.5, cy, k * 0.5);
    drawBowlFront(ctx, step * 1.5, cy, k * 0.5);
    drawSpoon(ctx, step * 1.5, cy, k * 0.5, 0.4);
    // 3: the oven.
    fillRound(ctx, step * 2.5 - k * 0.45, cy - k * 0.45, k * 0.9, k * 0.85, 6 * u, '#A9CFC1');
    fillRound(ctx, step * 2.5 - k * 0.3, cy - k * 0.15, k * 0.6, k * 0.45, 4 * u, '#F2B66E');
    // Arrows between, and a tick on each step done.
    ctx.strokeStyle = 'rgba(92, 70, 58, 0.45)';
    ctx.lineWidth = 2 * u;
    for (let i = 1; i < 3; i++) {
        const ax = step * i;
        ctx.beginPath();
        ctx.moveTo(ax - 6 * u, cy - 5 * u);
        ctx.lineTo(ax, cy);
        ctx.lineTo(ax - 6 * u, cy + 5 * u);
        ctx.stroke();
    }
    for (let i = 0; i < Math.min(done, 3); i++) {
        const tx = step * (i + 0.5) + k * 0.45;
        const ty = h * 0.18;
        disc(ctx, tx, ty, 9 * u, '#8EBF7A');
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.5 * u;
        ctx.beginPath();
        ctx.moveTo(tx - 4 * u, ty);
        ctx.lineTo(tx - 1 * u, ty + 3 * u);
        ctx.lineTo(tx + 4 * u, ty - 3 * u);
        ctx.stroke();
    }
    ctx.restore();
}
