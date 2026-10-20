// The palette and the handful of drawing primitives every toy is built from.
//
// The look is soft and flat: warm off-whites, pastel colours a little greyed so nothing shouts,
// rounded shapes, and shadows that are offset copies of a shape in a translucent warm brown rather
// than blurred. Blurred canvas shadows (`shadowBlur`) are slow on an A7 GPU, and `ctx.filter` does
// not exist in Safari 12; the offset shadow is cheap, crisp, and closer to the cut-paper look anyway.
//
// Static backgrounds are drawn once into a layer at the screen's resolution and blitted each frame,
// so the per-frame cost of a scene is only the things that move.

import { rng, shade } from './util.js';

export const PALETTE = {
    cream: '#FBF6EE',
    paper: '#FAF4E9',
    wall: '#F3EADC',
    floor: '#E7D8C2',
    wood: '#E5CBA5',
    woodDark: '#D2AF84',
    woodEdge: '#B99068',
    ink: '#6B5A4C',
    rose: '#EDB3AC',
    roseDeep: '#DD948C',
    peach: '#F4C8A2',
    peachDeep: '#E8A97C',
    butter: '#F3DE97',
    butterDeep: '#E5C766',
    sage: '#BCD3A8',
    sageDeep: '#98B985',
    mint: '#A9D7C8',
    mintDeep: '#83BFAE',
    sky: '#ABCDEA',
    skyDeep: '#88B2DA',
    lavender: '#C9BBE3',
    lavenderDeep: '#A995D2',
    pink: '#F2BAC3',
    water: '#A6D3D1',
    waterDeep: '#86BEC1',
    sand: '#DDC7A1',
};

export const SHADOW = 'rgba(112, 84, 58, 0.16)';
export const SHADOW_SOFT = 'rgba(112, 84, 58, 0.09)';

// The soft rainbow used wherever a set of things needs telling apart: bars, pots, pictures.
export const RAINBOW = [
    '#EDB3AC',
    '#F4C8A2',
    '#F3DE97',
    '#BCD3A8',
    '#A9D7C8',
    '#ABCDEA',
    '#B9C2EC',
    '#C9BBE3',
    '#E9B9D3',
    '#F0BFA6',
];

//==============================================================================
// Paths

// ctx.roundRect is Safari 16; this is the same path from arcs.
export function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.arcTo(x + w, y, x + w, y + radius, radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
    ctx.lineTo(x + radius, y + h);
    ctx.arcTo(x, y + h, x, y + h - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
}

export function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
}

export function ellipse(ctx, x, y, rx, ry, rotation = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rotation, 0, Math.PI * 2);
}

//==============================================================================
// Filled shapes

export function fillRound(ctx, x, y, w, h, r, colour) {
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = colour;
    ctx.fill();
}

// A rounded rectangle with a flat offset shadow beneath it.
export function card(ctx, x, y, w, h, r, colour, lift = 4, shadow = SHADOW) {
    if (lift > 0) fillRound(ctx, x, y + lift, w, h, r, shadow);
    fillRound(ctx, x, y, w, h, r, colour);
}

export function disc(ctx, x, y, r, colour) {
    circle(ctx, x, y, r);
    ctx.fillStyle = colour;
    ctx.fill();
}

// A disc with a lighter cap: reads as a rounded, slightly glossy object, a bead or a knob.
export function bead(ctx, x, y, r, colour, lift = 3) {
    if (lift > 0) disc(ctx, x, y + lift, r, SHADOW);
    disc(ctx, x, y, r, colour);
    ellipse(ctx, x - r * 0.25, y - r * 0.35, r * 0.45, r * 0.28, -0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
}

//==============================================================================
// Layers and textures

// An offscreen canvas at device resolution whose context draws in CSS pixels.
export function makeLayer(w, h, scale) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    return { canvas, ctx, w, h, scale };
}

// Release a layer's pixels now rather than whenever the collector gets to it. On a 1 GB iPad,
// a handful of full-screen retina layers is a meaningful share of what a tab may use.
export function freeLayer(layer) {
    if (layer && layer.canvas) {
        layer.canvas.width = 1;
        layer.canvas.height = 1;
    }
}

let grainTile = null;

// A tile of fine, sparse speckle: the tooth of paper, the grain of felt.
function grainCanvas() {
    if (grainTile) return grainTile;
    const size = 160;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const next = rng(77);
    for (let i = 0; i < 2600; i++) {
        const light = next() < 0.5;
        ctx.fillStyle = light ? 'rgba(255,255,255,0.55)' : 'rgba(92,70,58,0.32)';
        const s = next() < 0.85 ? 1 : 2;
        ctx.fillRect(Math.floor(next() * size), Math.floor(next() * size), s, s);
    }
    grainTile = canvas;
    return canvas;
}

// Speckle over a region, at one tile pixel per device pixel so it stays fine on a retina screen.
// Done by stepping out of the layer's CSS-pixel transform for the duration.
export function grain(ctx, x, y, w, h, alpha, scale) {
    const pattern = ctx.createPattern(grainCanvas(), 'repeat');
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = pattern;
    ctx.fillRect(Math.floor(x * scale), Math.floor(y * scale), Math.ceil(w * scale), Math.ceil(h * scale));
    ctx.restore();
}

// A panel of pale wood: base colour, a lighter top edge, and faint, slightly wavy grain lines.
export function woodPanel(ctx, x, y, w, h, r, tone = PALETTE.wood, seed = 5, scale = 1) {
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = tone;
    ctx.fill();
    ctx.clip();

    const next = rng(seed);
    ctx.strokeStyle = shade(tone, -0.12);
    ctx.lineWidth = 1.2;
    const lines = Math.max(6, Math.round(h / 14));
    for (let i = 0; i < lines; i++) {
        const gy = y + (i + 0.5) * (h / lines) + (next() - 0.5) * 6;
        ctx.globalAlpha = 0.18 + next() * 0.22;
        ctx.beginPath();
        ctx.moveTo(x - 10, gy);
        const waves = 3 + Math.floor(next() * 3);
        for (let k = 1; k <= waves; k++) {
            const px = x + ((w + 20) * k) / waves - 10;
            const py = gy + (next() - 0.5) * 7;
            const cx = px - w / waves / 2;
            ctx.quadraticCurveTo(cx, py + (next() - 0.5) * 9, px, py);
        }
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x, y, w, Math.min(6, h * 0.08));
    grain(ctx, x, y, w, h, 0.35, scale);
    ctx.restore();
}

// Stitches around an inset rectangle: the edge of a felt mat, a fabric pouch, a cushion.
export function stitches(ctx, x, y, w, h, r, colour, width = 2, dash = 7) {
    ctx.save();
    ctx.setLineDash([dash, dash * 0.8]);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.strokeStyle = colour;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
    ctx.restore();
}
