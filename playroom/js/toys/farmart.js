// The farm's pictures: every piece, animal and small surprise, drawn from shapes.
//
// Pieces stand on their tile like the cut-out figures of a board game, seen from the front on a
// board seen from above. Each fits inside its own tile, so tiles can be drawn in any order. Sizes
// are fractions of `s`, the tile's side, so everything scales with the board and with the tray.
// Animals and critters face right; their callers mirror them to face left.

import { SHADOW_SOFT, fillRound, disc, ellipse, circle } from '../draw.js';
import { TAU, shade } from '../util.js';
import * as iso from './iso.js';

export const INK = '#6B5A4C';

export const FARM = {
    grass: '#CFE3B2',
    grassAlt: '#C8DEAA',
    grassEdge: '#AFCB8C',
    path: '#EAD7B0',
    pathEdge: '#D9C097',
    pebble: '#D3BB92',
    soil: '#CDA67F',
    soilEdge: '#B99068',
    furrow: '#BE9772',
    bed: '#D8CCB3',
    water: '#A6D3D1',
    waterDeep: '#86BEC1',
    waterLight: '#C4E3DF',
    pad: '#A9CF95',
    reed: '#98B985',
    leaf: '#9CC48A',
    leafDeep: '#86B474',
    leafLight: '#B9D9A4',
    trunk: '#B58E6A',
    apple: '#E8918A',
    barn: '#E39A8F',
    barnRoof: '#B97E73',
    barnDoor: '#D88579',
    trim: '#FBF6EE',
    wall: '#F6E7CB',
    roof: '#D9927F',
    roofDeep: '#C98475',
    door: '#B88A64',
    glass: '#CFE3EE',
    lit: '#FFE29A',
    plank: '#E5CBA5',
    post: '#D2AF84',
    postDark: '#B99068',
    hay: '#EBCB7B',
    dark: '#5E4A40',
    tower: '#F2E6D2',
    sail: '#FBF6EE',
    sailFrame: '#C9B79E',
    coop: '#EBCB9A',
    cow: '#FBF7F2',
    patch: '#7D685B',
    pink: '#F2BAC3',
    pinkDeep: '#E59EAB',
    wool: '#F8F3EA',
    woolShade: '#E6DDCF',
    pig: '#F4C3C9',
    pigDeep: '#E9A9B4',
    mud: '#A98466',
    tractor: '#E79A98',
    tractorDeep: '#C9837D',
    tyre: '#6B5A4C',
    tyreLight: '#8B7766',
    hub: '#F3DE97',
};

// The soft shadow every standing thing casts on the grass.
export function shadow(ctx, cx, by, w, alpha = 1) {
    ellipse(ctx, cx, by, w, w * 0.2);
    ctx.fillStyle = alpha >= 1 ? SHADOW_SOFT : `rgba(112, 84, 58, ${0.09 * alpha})`;
    ctx.fill();
}

function poly(ctx, points, colour) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
}

function line(ctx, x0, y0, x1, y1, width, colour) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    ctx.stroke();
}

function mirrored(ctx, cx, facing, draw) {
    ctx.save();
    if (facing < 0) {
        ctx.translate(cx, 0);
        ctx.scale(-1, 1);
        ctx.translate(-cx, 0);
    }
    draw();
    ctx.restore();
}

//==============================================================================
// Buildings and plants. Each takes the tile's corner and side.

// An apple tree. `apples` are positions on the crown, as fractions, still hanging.
export function tree(ctx, x, y, s, o = {}) {
    const cx = x + s / 2;
    shadow(ctx, cx, y + s * 0.86, s * 0.3);
    fillRound(ctx, cx - s * 0.045, y + s * 0.5, s * 0.09, s * 0.37, s * 0.03, FARM.trunk);
    ctx.save();
    ctx.translate(cx, y + s * 0.82);
    ctx.rotate(o.shake || 0);
    ctx.translate(-cx, -(y + s * 0.82));
    disc(ctx, cx - s * 0.15, y + s * 0.46, s * 0.17, FARM.leafDeep);
    disc(ctx, cx + s * 0.16, y + s * 0.45, s * 0.18, FARM.leafDeep);
    disc(ctx, cx, y + s * 0.34, s * 0.25, FARM.leaf);
    disc(ctx, cx - s * 0.12, y + s * 0.42, s * 0.15, FARM.leaf);
    disc(ctx, cx + s * 0.13, y + s * 0.41, s * 0.15, FARM.leaf);
    ellipse(ctx, cx - s * 0.07, y + s * 0.26, s * 0.11, s * 0.07, -0.4);
    ctx.fillStyle = 'rgba(255, 255, 240, 0.28)';
    ctx.fill();
    for (const [ax, ay] of o.apples || []) {
        disc(ctx, cx + ax * s, y + ay * s, s * 0.036, FARM.apple);
        disc(ctx, cx + ax * s - s * 0.01, y + ay * s - s * 0.012, s * 0.011, 'rgba(255,255,255,0.5)');
    }
    ctx.restore();
}

export const APPLE_SPOTS = [
    [-0.12, 0.3],
    [0.1, 0.25],
    [0.17, 0.44],
    [-0.18, 0.47],
    [0.02, 0.42],
];

// The barn. `door` opens from 0 to 1, and `inside` is drawn in the doorway when it does.
export function barn(ctx, x, y, s, o = {}) {
    const cx = x + s / 2;
    shadow(ctx, cx, y + s * 0.87, s * 0.42);
    fillRound(ctx, x + s * 0.14, y + s * 0.42, s * 0.72, s * 0.45, s * 0.03, FARM.barn);
    poly(
        ctx,
        [
            [x + s * 0.09, y + s * 0.46],
            [x + s * 0.2, y + s * 0.24],
            [cx, y + s * 0.1],
            [x + s * 0.8, y + s * 0.24],
            [x + s * 0.91, y + s * 0.46],
        ],
        FARM.barnRoof
    );
    line(ctx, x + s * 0.12, y + s * 0.45, x + s * 0.21, y + s * 0.26, s * 0.022, FARM.trim);
    line(ctx, x + s * 0.21, y + s * 0.26, cx, y + s * 0.13, s * 0.022, FARM.trim);
    line(ctx, cx, y + s * 0.13, x + s * 0.79, y + s * 0.26, s * 0.022, FARM.trim);
    line(ctx, x + s * 0.79, y + s * 0.26, x + s * 0.88, y + s * 0.45, s * 0.022, FARM.trim);
    // The hayloft.
    fillRound(ctx, cx - s * 0.075, y + s * 0.24, s * 0.15, s * 0.13, s * 0.02, o.lit ? FARM.lit : FARM.dark);
    ctx.lineWidth = s * 0.016;
    ctx.strokeStyle = FARM.trim;
    ctx.stroke();

    const dx = x + s * 0.31;
    const dy = y + s * 0.55;
    const dw = s * 0.38;
    const dh = s * 0.32;
    const open = o.door || 0;
    if (open > 0.01) {
        fillRound(ctx, dx, dy, dw, dh, s * 0.01, FARM.dark);
        ellipse(ctx, cx, dy + dh, dw * 0.42, dh * 0.22);
        ctx.fillStyle = FARM.hay;
        ctx.fill();
        if (o.inside) o.inside(ctx, cx, dy + dh, s);
    }
    const leaf = (dw / 2) * Math.cos((open * Math.PI) / 2.2);
    for (const side of [-1, 1]) {
        const hinge = side < 0 ? dx : dx + dw;
        const left = side < 0 ? hinge : hinge - leaf;
        fillRound(ctx, left, dy, Math.max(1, leaf), dh, s * 0.008, FARM.barnDoor);
        ctx.lineWidth = s * 0.014;
        ctx.strokeStyle = FARM.trim;
        ctx.strokeRect(left + s * 0.008, dy + s * 0.008, Math.max(1, leaf - s * 0.016), dh - s * 0.016);
        if (leaf > s * 0.04) {
            line(
                ctx,
                left + s * 0.01,
                dy + s * 0.01,
                left + leaf - s * 0.01,
                dy + dh - s * 0.01,
                s * 0.012,
                FARM.trim
            );
            line(
                ctx,
                left + leaf - s * 0.01,
                dy + s * 0.01,
                left + s * 0.01,
                dy + dh - s * 0.01,
                s * 0.012,
                FARM.trim
            );
        }
    }
}

// The farmhouse: `door` opens, `lit` glows the windows, `smoke` is drawn by the caller.
export function house(ctx, x, y, s, o = {}) {
    const cx = x + s / 2;
    shadow(ctx, cx, y + s * 0.87, s * 0.38);
    fillRound(ctx, x + s * 0.63, y + s * 0.2, s * 0.08, s * 0.18, s * 0.01, FARM.roofDeep);
    fillRound(ctx, x + s * 0.2, y + s * 0.44, s * 0.6, s * 0.43, s * 0.02, FARM.wall);
    poly(
        ctx,
        [
            [x + s * 0.12, y + s * 0.47],
            [cx, y + s * 0.15],
            [x + s * 0.88, y + s * 0.47],
        ],
        FARM.roof
    );
    line(ctx, x + s * 0.13, y + s * 0.465, cx, y + s * 0.16, s * 0.02, FARM.roofDeep);
    line(ctx, cx, y + s * 0.16, x + s * 0.87, y + s * 0.465, s * 0.02, FARM.roofDeep);
    // The door, which opens inwards onto the dark.
    const open = o.door || 0;
    fillRound(
        ctx,
        cx - s * 0.065,
        y + s * 0.62,
        s * 0.13,
        s * 0.25,
        s * 0.05,
        open > 0.01 ? FARM.dark : FARM.door
    );
    if (open > 0.01)
        fillRound(
            ctx,
            cx - s * 0.065,
            y + s * 0.62,
            s * 0.13 * (1 - open * 0.8),
            s * 0.25,
            s * 0.04,
            FARM.door
        );
    else disc(ctx, cx + s * 0.035, y + s * 0.76, s * 0.011, FARM.hub);
    for (const wx of [x + s * 0.26, x + s * 0.62]) {
        fillRound(ctx, wx, y + s * 0.54, s * 0.12, s * 0.11, s * 0.015, o.lit ? FARM.lit : FARM.glass);
        line(ctx, wx + s * 0.06, y + s * 0.545, wx + s * 0.06, y + s * 0.645, s * 0.012, FARM.trim);
        line(ctx, wx + s * 0.005, y + s * 0.595, wx + s * 0.115, y + s * 0.595, s * 0.012, FARM.trim);
    }
    fillRound(ctx, x + s * 0.25, y + s * 0.66, s * 0.14, s * 0.035, s * 0.01, FARM.roofDeep);
    disc(ctx, x + s * 0.28, y + s * 0.655, s * 0.016, '#F2BAC3');
    disc(ctx, x + s * 0.32, y + s * 0.65, s * 0.016, '#F3DE97');
    disc(ctx, x + s * 0.36, y + s * 0.655, s * 0.016, '#F2BAC3');
}

// The windmill, sails at `angle`.
export function windmill(ctx, x, y, s, o = {}) {
    const cx = x + s / 2;
    shadow(ctx, cx, y + s * 0.87, s * 0.24);
    poly(
        ctx,
        [
            [x + s * 0.36, y + s * 0.87],
            [x + s * 0.64, y + s * 0.87],
            [x + s * 0.59, y + s * 0.38],
            [x + s * 0.41, y + s * 0.38],
        ],
        FARM.tower
    );
    fillRound(ctx, cx - s * 0.04, y + s * 0.73, s * 0.08, s * 0.14, s * 0.04, FARM.door);
    disc(ctx, cx, y + s * 0.56, s * 0.035, o.lit ? FARM.lit : FARM.glass);
    ellipse(ctx, cx, y + s * 0.38, s * 0.12, s * 0.08);
    ctx.fillStyle = FARM.roofDeep;
    ctx.fill();
    if (o.sails !== false) windmillSails(ctx, x, y, s, o.angle || 0);
}

// The sails alone, which turn while the rest of the windmill stands still.
export function windmillSails(ctx, x, y, s, angle) {
    const hx = x + s / 2;
    const hy = y + s * 0.35;
    for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(hx, hy);
        ctx.rotate(angle + (i * Math.PI) / 2);
        line(ctx, 0, 0, 0, -s * 0.33, s * 0.018, FARM.postDark);
        fillRound(ctx, s * 0.004, -s * 0.33, s * 0.075, s * 0.27, s * 0.012, FARM.sail);
        ctx.lineWidth = s * 0.008;
        ctx.strokeStyle = FARM.sailFrame;
        ctx.strokeRect(s * 0.004, -s * 0.33, s * 0.075, s * 0.27);
        for (let k = 1; k < 4; k++)
            line(
                ctx,
                s * 0.006,
                -s * (0.33 - 0.0675 * k),
                s * 0.077,
                -s * (0.33 - 0.0675 * k),
                s * 0.006,
                FARM.sailFrame
            );
        ctx.restore();
    }
    disc(ctx, hx, hy, s * 0.03, FARM.tyreLight);
}

// The hen house: a hut on legs with a ramp.
export function coop(ctx, x, y, s, o = {}) {
    const cx = x + s / 2;
    shadow(ctx, cx, y + s * 0.87, s * 0.32);
    fillRound(ctx, x + s * 0.3, y + s * 0.64, s * 0.035, s * 0.23, s * 0.01, FARM.postDark);
    fillRound(ctx, x + s * 0.665, y + s * 0.64, s * 0.035, s * 0.23, s * 0.01, FARM.postDark);
    fillRound(ctx, x + s * 0.24, y + s * 0.4, s * 0.52, s * 0.28, s * 0.03, FARM.coop);
    for (let k = 1; k < 4; k++)
        line(
            ctx,
            x + s * 0.26,
            y + s * (0.4 + 0.07 * k),
            x + s * 0.74,
            y + s * (0.4 + 0.07 * k),
            s * 0.006,
            shade(FARM.coop, -0.12)
        );
    poly(
        ctx,
        [
            [x + s * 0.19, y + s * 0.43],
            [cx, y + s * 0.22],
            [x + s * 0.81, y + s * 0.43],
        ],
        FARM.roofDeep
    );
    fillRound(ctx, cx - s * 0.07, y + s * 0.5, s * 0.14, s * 0.18, s * 0.07, o.lit ? FARM.lit : FARM.dark);
    ctx.save();
    ctx.translate(cx + s * 0.02, y + s * 0.68);
    ctx.rotate(0.75);
    fillRound(ctx, 0, -s * 0.03, s * 0.27, s * 0.06, s * 0.015, FARM.post);
    for (let k = 1; k < 4; k++)
        line(ctx, s * 0.065 * k, -s * 0.03, s * 0.065 * k, s * 0.03, s * 0.01, FARM.postDark);
    ctx.restore();
}

// A run of fence through the tile, joined towards the sides in `mask` (1 north, 2 east, 4 south,
// 8 west). A lone piece is a short section with a post at each end.
export function fence(ctx, x, y, s, mask) {
    const cx = x + s / 2;
    const top = y + s * 0.5;
    const low = y + s * 0.64;
    const rail = s * 0.045;
    const ends = [];
    if (!mask) {
        ends.push([x + s * 0.16, x + s * 0.84]);
    } else {
        if (mask & 8) ends.push([x, cx]);
        if (mask & 2) ends.push([cx, x + s]);
    }
    shadow(ctx, cx, y + s * 0.78, s * (mask & 10 ? 0.4 : 0.34), 0.5);
    if (mask & 1) {
        fillRound(ctx, cx - s * 0.03, y - s * 0.1, s * 0.022, s * 0.72, s * 0.01, FARM.plank);
        fillRound(ctx, cx + s * 0.008, y - s * 0.1, s * 0.022, s * 0.72, s * 0.01, FARM.plank);
    }
    if (mask & 4) {
        fillRound(ctx, cx - s * 0.03, top, s * 0.022, s * 0.5 + s * 0.1, s * 0.01, FARM.plank);
        fillRound(ctx, cx + s * 0.008, top, s * 0.022, s * 0.5 + s * 0.1, s * 0.01, FARM.plank);
    }
    for (const [a, b] of ends) {
        fillRound(ctx, a, top - rail / 2, b - a, rail, rail / 2, FARM.plank);
        fillRound(ctx, a, low - rail / 2, b - a, rail, rail / 2, FARM.plank);
    }
    const posts = mask ? [cx] : [x + s * 0.2, cx, x + s * 0.8];
    for (const px of posts) {
        fillRound(ctx, px - s * 0.035, y + s * 0.4, s * 0.07, s * 0.36, s * 0.015, FARM.post);
        fillRound(ctx, px - s * 0.035, y + s * 0.4, s * 0.025, s * 0.36, s * 0.012, FARM.postDark);
    }
}

// Crops in a field tile, at `stage` 1 (seed) to 4 (ripe). `pop` lifts them a little as they grow.
export function crops(ctx, x, y, s, stage, crop, seed, pop = 0, giant = false) {
    if (stage <= 0) return;
    if (stage === 4 && giant) {
        pumpkin(ctx, x + s / 2, y + s * 0.62, s * 0.24 * (1 + pop * 0.1));
        return;
    }
    for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
            const n = (seed * 31 + i * 7 + j * 13) % 17;
            const px = x + s * (0.22 + 0.28 * i) + ((n % 5) - 2) * s * 0.01;
            const py = y + s * (0.3 + 0.24 * j) + (((n * 3) % 5) - 2) * s * 0.008 - pop * s * 0.03;
            plant(ctx, px, py, s, stage, crop);
        }
    }
}

export function plant(ctx, px, py, s, stage, crop) {
    if (stage === 1) {
        disc(ctx, px, py, s * 0.016, '#8A6A4E');
        return;
    }
    if (stage === 2) {
        line(ctx, px, py + s * 0.02, px, py - s * 0.005, s * 0.01, FARM.leafDeep);
        ellipse(ctx, px - s * 0.022, py - s * 0.012, s * 0.026, s * 0.013, -0.5);
        ctx.fillStyle = FARM.leafLight;
        ctx.fill();
        ellipse(ctx, px + s * 0.022, py - s * 0.012, s * 0.026, s * 0.013, 0.5);
        ctx.fill();
        return;
    }
    if (stage === 3) {
        for (const a of [-0.9, 0, 0.9]) {
            ellipse(
                ctx,
                px + Math.sin(a) * s * 0.03,
                py - Math.cos(a) * s * 0.03,
                s * 0.034,
                s * 0.016,
                a + Math.PI / 2
            );
            ctx.fillStyle = FARM.leaf;
            ctx.fill();
        }
        return;
    }
    if (crop === 'carrot') {
        for (const a of [-0.5, 0, 0.5]) {
            ellipse(ctx, px + Math.sin(a) * s * 0.03, py - s * 0.035, s * 0.012, s * 0.035, a);
            ctx.fillStyle = FARM.leafDeep;
            ctx.fill();
        }
        ellipse(ctx, px, py + s * 0.012, s * 0.03, s * 0.02);
        ctx.fillStyle = '#EFA36B';
        ctx.fill();
    } else if (crop === 'pumpkin') {
        pumpkin(ctx, px, py + s * 0.01, s * 0.055);
    } else if (crop === 'sunflower') {
        line(ctx, px, py + s * 0.03, px, py - s * 0.05, s * 0.012, FARM.leafDeep);
        for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU;
            ellipse(
                ctx,
                px + Math.cos(a) * s * 0.03,
                py - s * 0.06 + Math.sin(a) * s * 0.03,
                s * 0.018,
                s * 0.01,
                a
            );
            ctx.fillStyle = '#F3D36A';
            ctx.fill();
        }
        disc(ctx, px, py - s * 0.06, s * 0.02, '#A9805E');
    } else {
        disc(ctx, px, py, s * 0.05, '#A3CC92');
        disc(ctx, px, py - s * 0.004, s * 0.034, '#B9D9A8');
        disc(ctx, px, py - s * 0.008, s * 0.018, '#CFE6BF');
    }
}

export function pumpkin(ctx, cx, cy, r) {
    ellipse(ctx, cx, cy, r * 1.15, r * 0.9);
    ctx.fillStyle = '#F0B26F';
    ctx.fill();
    for (const k of [-0.45, 0, 0.45]) {
        ellipse(ctx, cx + k * r, cy, r * 0.32, r * 0.86);
        ctx.lineWidth = Math.max(1, r * 0.08);
        ctx.strokeStyle = '#E39A55';
        ctx.stroke();
    }
    fillRound(ctx, cx - r * 0.1, cy - r * 1.15, r * 0.2, r * 0.35, r * 0.06, FARM.trunk);
}

//==============================================================================
// Animals. Each takes its centre and the line its feet stand on, and `k`, the tile's side.

export function cow(ctx, cx, by, k, o = {}) {
    shadow(ctx, cx, by, k * 0.3);
    mirrored(ctx, cx, o.facing || 1, () => {
        const lift = (o.bob || 0) * k * 0.01;
        for (const lx of [-0.17, -0.09, 0.08, 0.15]) {
            fillRound(ctx, cx + lx * k - k * 0.025, by - k * 0.2, k * 0.05, k * 0.2, k * 0.015, '#EFE8DE');
            fillRound(
                ctx,
                cx + lx * k - k * 0.025,
                by - k * 0.035,
                k * 0.05,
                k * 0.035,
                k * 0.012,
                FARM.patch
            );
        }
        const bodyY = by - k * 0.27 - lift;
        const swish = Math.sin(o.tail || 0) * k * 0.04;
        line(
            ctx,
            cx - k * 0.23,
            bodyY - k * 0.04,
            cx - k * 0.29 + swish,
            bodyY + k * 0.12,
            k * 0.018,
            '#EFE8DE'
        );
        disc(ctx, cx - k * 0.29 + swish, bodyY + k * 0.13, k * 0.022, FARM.patch);
        ellipse(ctx, cx, bodyY, k * 0.25, k * 0.13);
        ctx.fillStyle = FARM.cow;
        ctx.fill();
        ctx.save();
        ctx.clip();
        disc(ctx, cx - k * 0.1, bodyY - k * 0.04, k * 0.08, FARM.patch);
        disc(ctx, cx + k * 0.09, bodyY + k * 0.06, k * 0.06, FARM.patch);
        ctx.restore();
        ellipse(ctx, cx - k * 0.03, by - k * 0.15 - lift, k * 0.05, k * 0.025);
        ctx.fillStyle = FARM.pink;
        ctx.fill();
        const dip = (o.dip || 0) * k * 0.1;
        const hx = cx + k * 0.26;
        const hy = bodyY - k * 0.06 + dip;
        ellipse(ctx, hx - k * 0.07, hy - k * 0.05, k * 0.05, k * 0.024, -0.5);
        ctx.fillStyle = FARM.cow;
        ctx.fill();
        ellipse(ctx, hx - k * 0.02, hy - k * 0.085, k * 0.02, k * 0.012, -0.3);
        ctx.fillStyle = '#F3E3C3';
        ctx.fill();
        ellipse(ctx, hx, hy, k * 0.095, k * 0.08);
        ctx.fillStyle = FARM.cow;
        ctx.fill();
        ellipse(ctx, hx + k * 0.06, hy + k * 0.035, k * 0.06, k * 0.048);
        ctx.fillStyle = FARM.pink;
        ctx.fill();
        disc(ctx, hx + k * 0.045, hy + k * 0.035, k * 0.009, FARM.pinkDeep);
        disc(ctx, hx + k * 0.08, hy + k * 0.035, k * 0.009, FARM.pinkDeep);
        eye(ctx, hx - k * 0.005, hy - k * 0.02, k * 0.013, o.sleep);
    });
}

export function sheep(ctx, cx, by, k, o = {}) {
    shadow(ctx, cx, by, k * 0.27);
    mirrored(ctx, cx, o.facing || 1, () => {
        const lift = (o.hop || 0) * k * 0.12;
        for (const lx of [-0.12, -0.05, 0.06, 0.12])
            fillRound(
                ctx,
                cx + lx * k - k * 0.018,
                by - k * 0.17 - lift * 0.3,
                k * 0.036,
                k * 0.17,
                k * 0.012,
                INK
            );
        const bodyY = by - k * 0.27 - lift;
        const puffs = [
            [0, 0, 0.13],
            [-0.12, 0.02, 0.09],
            [0.12, 0.02, 0.09],
            [-0.06, -0.08, 0.09],
            [0.06, -0.08, 0.09],
            [-0.09, 0.07, 0.08],
            [0.09, 0.07, 0.08],
        ];
        for (const [px, py, r] of puffs)
            disc(ctx, cx + px * k + k * 0.008, bodyY + py * k + k * 0.012, r * k, FARM.woolShade);
        for (const [px, py, r] of puffs) disc(ctx, cx + px * k, bodyY + py * k, r * k, FARM.wool);
        const hx = cx + k * 0.2;
        const hy = bodyY - k * 0.03;
        ellipse(ctx, hx - k * 0.06, hy - k * 0.03, k * 0.04, k * 0.02, -0.3);
        ctx.fillStyle = INK;
        ctx.fill();
        ellipse(ctx, hx, hy, k * 0.07, k * 0.075);
        ctx.fillStyle = INK;
        ctx.fill();
        disc(ctx, hx - k * 0.02, hy - k * 0.07, k * 0.04, FARM.wool);
        disc(ctx, hx + k * 0.02, hy - k * 0.065, k * 0.032, FARM.wool);
        eye(ctx, hx + k * 0.02, hy - k * 0.005, k * 0.012, o.sleep, FARM.wool);
    });
}

export function pig(ctx, cx, by, k, o = {}) {
    if (o.muddy) {
        ellipse(ctx, cx, by - k * 0.01, k * 0.32, k * 0.07);
        ctx.fillStyle = '#B8977A';
        ctx.fill();
    }
    shadow(ctx, cx, by, k * 0.27);
    mirrored(ctx, cx, o.facing || 1, () => {
        ctx.save();
        if (o.roll) {
            ctx.translate(cx, by - k * 0.2);
            ctx.rotate(o.roll * Math.PI);
            ctx.translate(-cx, -(by - k * 0.2));
        }
        const wiggle = Math.sin(o.wiggle || 0) * k * 0.012;
        for (const lx of [-0.14, -0.06, 0.07, 0.14])
            fillRound(
                ctx,
                cx + lx * k - k * 0.025,
                by - k * 0.12,
                k * 0.05,
                k * 0.12,
                k * 0.015,
                FARM.pigDeep
            );
        const bodyY = by - k * 0.22;
        ctx.beginPath();
        ctx.arc(cx - k * 0.25, bodyY - k * 0.04, k * 0.03, 0.5, 5.2);
        ctx.lineWidth = k * 0.014;
        ctx.strokeStyle = FARM.pigDeep;
        ctx.stroke();
        ellipse(ctx, cx + wiggle, bodyY, k * 0.24, k * 0.13);
        ctx.fillStyle = FARM.pig;
        ctx.fill();
        if (o.muddy) {
            for (const [mx, my, r] of [
                [-0.12, 0.05, 0.05],
                [0.02, 0.08, 0.06],
                [-0.03, -0.04, 0.035],
                [0.13, 0.04, 0.03],
            ]) {
                disc(ctx, cx + mx * k, bodyY + my * k, r * k, FARM.mud);
            }
        }
        poly(
            ctx,
            [
                [cx + k * 0.1, bodyY - k * 0.1],
                [cx + k * 0.17, bodyY - k * 0.2],
                [cx + k * 0.19, bodyY - k * 0.08],
            ],
            FARM.pigDeep
        );
        ellipse(ctx, cx + k * 0.25, bodyY + k * 0.01, k * 0.05, k * 0.055);
        ctx.fillStyle = FARM.pigDeep;
        ctx.fill();
        disc(ctx, cx + k * 0.24, bodyY - k * 0.005, k * 0.009, '#C98B97');
        disc(ctx, cx + k * 0.26, bodyY + k * 0.025, k * 0.009, '#C98B97');
        eye(ctx, cx + k * 0.16, bodyY - k * 0.04, k * 0.012, o.sleep);
        ctx.restore();
    });
}

function eye(ctx, x, y, r, closed, colour = INK) {
    if (closed) {
        ctx.beginPath();
        ctx.arc(x, y - r * 0.3, r, 0.2, Math.PI - 0.2);
        ctx.lineWidth = r * 0.6;
        ctx.strokeStyle = colour;
        ctx.stroke();
    } else {
        disc(ctx, x, y, r, colour);
    }
}

// The tractor and its little trailer. `wheel` turns the wheels; `load` fills the trailer.
export function tractor(ctx, cx, by, k, o = {}) {
    shadow(ctx, cx, by, k * 0.4);
    mirrored(ctx, cx, o.facing || 1, () => {
        const bounce = (o.bounce || 0) * k * 0.015;
        // The trailer, behind.
        line(ctx, cx - k * 0.32, by - k * 0.12, cx - k * 0.22, by - k * 0.12, k * 0.02, FARM.postDark);
        const load = o.load || 0;
        if (load > 0) {
            for (let i = 0; i < Math.min(6, load); i++) {
                disc(
                    ctx,
                    cx - k * (0.46 - 0.04 * (i % 4)),
                    by - k * (0.25 + 0.03 * Math.floor(i / 4)),
                    k * 0.03,
                    ['#EFA36B', '#F0B26F', '#A3CC92', '#F3D36A'][i % 4]
                );
            }
        }
        fillRound(ctx, cx - k * 0.5, by - k * 0.25, k * 0.19, k * 0.12, k * 0.02, FARM.post);
        line(ctx, cx - k * 0.49, by - k * 0.19, cx - k * 0.32, by - k * 0.19, k * 0.008, FARM.postDark);
        wheelAt(ctx, cx - k * 0.4, by - k * 0.055, k * 0.055, o.wheel || 0);
        // The tractor.
        fillRound(ctx, cx - k * 0.07, by - k * 0.27 - bounce, k * 0.32, k * 0.13, k * 0.035, FARM.tractor);
        fillRound(ctx, cx + k * 0.13, by - k * 0.38 - bounce, k * 0.035, k * 0.14, k * 0.012, FARM.tyreLight);
        fillRound(ctx, cx - k * 0.25, by - k * 0.43 - bounce, k * 0.19, k * 0.27, k * 0.035, FARM.tractor);
        fillRound(ctx, cx - k * 0.22, by - k * 0.4 - bounce, k * 0.13, k * 0.1, k * 0.02, FARM.glass);
        fillRound(
            ctx,
            cx - k * 0.28,
            by - k * 0.46 - bounce,
            k * 0.25,
            k * 0.045,
            k * 0.02,
            FARM.tractorDeep
        );
        disc(ctx, cx + k * 0.235, by - k * 0.215 - bounce, k * 0.022, FARM.hub);
        wheelAt(ctx, cx - k * 0.14, by - k * 0.13, k * 0.13, o.wheel || 0);
        wheelAt(ctx, cx + k * 0.17, by - k * 0.075, k * 0.075, o.wheel || 0);
    });
}

function wheelAt(ctx, x, y, r, turn) {
    disc(ctx, x, y, r, FARM.tyre);
    disc(ctx, x, y, r * 0.66, FARM.tyreLight);
    for (let i = 0; i < 3; i++) {
        const a = turn + (i * TAU) / 3;
        line(ctx, x, y, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.12, FARM.tyre);
    }
    disc(ctx, x, y, r * 0.3, FARM.hub);
}

//==============================================================================
// The small things: what flies out, runs off, peeks and hides. Centred at (x, y), sized by `k`.

export function bird(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        const flap = Math.sin(o.flap || 0);
        ellipse(ctx, x, y, k * 0.06, k * 0.045);
        ctx.fillStyle = '#ABCDEA';
        ctx.fill();
        disc(ctx, x + k * 0.05, y - k * 0.03, k * 0.032, '#ABCDEA');
        poly(
            ctx,
            [
                [x + k * 0.078, y - k * 0.035],
                [x + k * 0.105, y - k * 0.025],
                [x + k * 0.078, y - k * 0.017],
            ],
            '#F4C8A2'
        );
        disc(ctx, x + k * 0.058, y - k * 0.038, k * 0.007, INK);
        ellipse(ctx, x - k * 0.01, y - k * 0.01 - flap * k * 0.03, k * 0.045, k * 0.02, -0.3 - flap * 0.6);
        ctx.fillStyle = '#88B2DA';
        ctx.fill();
        poly(
            ctx,
            [
                [x - k * 0.05, y - k * 0.01],
                [x - k * 0.1, y - k * 0.03],
                [x - k * 0.09, y + k * 0.01],
            ],
            '#88B2DA'
        );
    });
}

export function mouse(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        line(ctx, x - k * 0.05, y, x - k * 0.11, y - k * 0.02, k * 0.008, '#B8AC9F');
        ellipse(ctx, x, y - k * 0.02, k * 0.055, k * 0.033);
        ctx.fillStyle = '#C8BDB2';
        ctx.fill();
        disc(ctx, x + k * 0.02, y - k * 0.055, k * 0.02, '#E9C8C4');
        disc(ctx, x + k * 0.055, y - k * 0.018, k * 0.006, INK);
        disc(ctx, x + k * 0.058, y - k * 0.005, k * 0.006, FARM.pinkDeep);
    });
}

export function rabbit(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        ellipse(ctx, x - k * 0.01, y - k * 0.045, k * 0.065, k * 0.05);
        ctx.fillStyle = '#F1EBE3';
        ctx.fill();
        disc(ctx, x - k * 0.075, y - k * 0.05, k * 0.022, '#FFFFFF');
        disc(ctx, x + k * 0.05, y - k * 0.08, k * 0.038, '#F1EBE3');
        for (const [ex, tilt] of [
            [0.035, -0.15],
            [0.06, 0.2],
        ]) {
            ellipse(ctx, x + ex * k, y - k * 0.15, k * 0.016, k * 0.055, tilt);
            ctx.fillStyle = '#F1EBE3';
            ctx.fill();
            ellipse(ctx, x + ex * k, y - k * 0.15, k * 0.008, k * 0.04, tilt);
            ctx.fillStyle = FARM.pink;
            ctx.fill();
        }
        disc(ctx, x + k * 0.07, y - k * 0.085, k * 0.008, INK);
    });
}

export function frog(ctx, x, y, k, o = {}) {
    const lift = (o.lift || 0) * k * 0.2;
    ellipse(ctx, x, y - k * 0.03 - lift, k * 0.065, k * 0.045);
    ctx.fillStyle = '#98B985';
    ctx.fill();
    for (const ex of [-0.032, 0.032]) {
        disc(ctx, x + ex * k, y - k * 0.075 - lift, k * 0.022, '#98B985');
        disc(ctx, x + ex * k, y - k * 0.078 - lift, k * 0.014, '#FBF6EE');
        disc(ctx, x + ex * k, y - k * 0.078 - lift, k * 0.007, INK);
    }
    ctx.beginPath();
    ctx.arc(x, y - k * 0.04 - lift, k * 0.03, 0.3, Math.PI - 0.3);
    ctx.lineWidth = k * 0.006;
    ctx.strokeStyle = '#6E9A5E';
    ctx.stroke();
}

export function duck(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        const small = o.small ? 0.6 : 1;
        const body = o.small ? '#F3DE97' : '#FFF7E6';
        ellipse(ctx, x, y + k * 0.01 * small, k * 0.075 * small, k * 0.022 * small);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();
        ellipse(ctx, x, y - k * 0.02 * small, k * 0.065 * small, k * 0.04 * small);
        ctx.fillStyle = body;
        ctx.fill();
        disc(ctx, x + k * 0.045 * small, y - k * 0.065 * small, k * 0.032 * small, body);
        poly(
            ctx,
            [
                [x + k * 0.07 * small, y - k * 0.07 * small],
                [x + k * 0.105 * small, y - k * 0.06 * small],
                [x + k * 0.07 * small, y - k * 0.05 * small],
            ],
            '#F4B27A'
        );
        disc(ctx, x + k * 0.052 * small, y - k * 0.073 * small, k * 0.007 * small, INK);
    });
}

export function owl(ctx, x, y, k, o = {}) {
    ellipse(ctx, x, y, k * 0.05, k * 0.062);
    ctx.fillStyle = '#C9AE91';
    ctx.fill();
    disc(ctx, x, y - k * 0.012, k * 0.042, '#EFE3CF');
    for (const ex of [-0.019, 0.019]) {
        disc(ctx, x + ex * k, y - k * 0.015, k * 0.016, '#FBF6EE');
        if (o.blink)
            line(
                ctx,
                x + ex * k - k * 0.012,
                y - k * 0.015,
                x + ex * k + k * 0.012,
                y - k * 0.015,
                k * 0.006,
                INK
            );
        else disc(ctx, x + ex * k, y - k * 0.015, k * 0.008, INK);
    }
    poly(
        ctx,
        [
            [x - k * 0.008, y],
            [x + k * 0.008, y],
            [x, y + k * 0.014],
        ],
        '#E5C766'
    );
    poly(
        ctx,
        [
            [x - k * 0.045, y - k * 0.04],
            [x - k * 0.03, y - k * 0.075],
            [x - k * 0.015, y - k * 0.05],
        ],
        '#C9AE91'
    );
    poly(
        ctx,
        [
            [x + k * 0.045, y - k * 0.04],
            [x + k * 0.03, y - k * 0.075],
            [x + k * 0.015, y - k * 0.05],
        ],
        '#C9AE91'
    );
}

export function cat(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        const stretch = o.stretch || 0;
        ctx.beginPath();
        ctx.moveTo(x - k * 0.06, y - k * 0.02);
        ctx.quadraticCurveTo(x - k * 0.13, y - k * 0.05 - stretch * k * 0.04, x - k * 0.1, y - k * 0.1);
        ctx.lineWidth = k * 0.016;
        ctx.strokeStyle = '#E8A97C';
        ctx.lineCap = 'round';
        ctx.stroke();
        ellipse(ctx, x, y - k * 0.03, k * (0.07 + stretch * 0.02), k * 0.035);
        ctx.fillStyle = '#F4C8A2';
        ctx.fill();
        disc(ctx, x + k * 0.055, y - k * 0.06, k * 0.032, '#F4C8A2');
        poly(
            ctx,
            [
                [x + k * 0.03, y - k * 0.08],
                [x + k * 0.035, y - k * 0.11],
                [x + k * 0.055, y - k * 0.088],
            ],
            '#F4C8A2'
        );
        poly(
            ctx,
            [
                [x + k * 0.06, y - k * 0.088],
                [x + k * 0.08, y - k * 0.11],
                [x + k * 0.083, y - k * 0.075],
            ],
            '#F4C8A2'
        );
        eye(ctx, x + k * 0.065, y - k * 0.062, k * 0.007, o.sleep);
        line(ctx, x - k * 0.02, y - k * 0.06, x - k * 0.02, y - k * 0.005, k * 0.008, '#E8A97C');
        line(ctx, x + k * 0.01, y - k * 0.062, x + k * 0.01, y - k * 0.005, k * 0.008, '#E8A97C');
    });
}

export function hen(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        const peck = (o.peck || 0) * k * 0.03;
        line(ctx, x - k * 0.01, y - k * 0.03, x - k * 0.01, y, k * 0.008, '#E5C766');
        line(ctx, x + k * 0.015, y - k * 0.03, x + k * 0.015, y, k * 0.008, '#E5C766');
        poly(
            ctx,
            [
                [x - k * 0.04, y - k * 0.06],
                [x - k * 0.085, y - k * 0.1],
                [x - k * 0.07, y - k * 0.045],
            ],
            o.rooster ? '#C98475' : '#EFE8DE'
        );
        if (o.rooster) {
            poly(
                ctx,
                [
                    [x - k * 0.04, y - k * 0.06],
                    [x - k * 0.075, y - k * 0.12],
                    [x - k * 0.055, y - k * 0.05],
                ],
                '#98B985'
            );
        }
        ellipse(ctx, x, y - k * 0.055, k * 0.05, k * 0.04);
        ctx.fillStyle = '#FBF6EE';
        ctx.fill();
        const hx = x + k * 0.04;
        const hy = y - k * 0.09 + peck;
        disc(ctx, hx, hy, k * 0.025, '#FBF6EE');
        disc(ctx, hx - k * 0.004, hy - k * 0.026, k * (o.rooster ? 0.016 : 0.011), '#E8918A');
        disc(ctx, hx + k * 0.01, hy - k * 0.024, k * (o.rooster ? 0.013 : 0.009), '#E8918A');
        poly(
            ctx,
            [
                [hx + k * 0.022, hy - k * 0.005],
                [hx + k * 0.045, hy + k * 0.003],
                [hx + k * 0.022, hy + k * 0.01],
            ],
            '#F4B27A'
        );
        disc(ctx, hx + k * 0.012, hy + k * 0.016, k * 0.008, '#E8918A');
        disc(ctx, hx + k * 0.008, hy - k * 0.006, k * 0.005, INK);
    });
}

export function chick(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        disc(ctx, x, y - k * 0.028, k * 0.028, '#F3DE97');
        disc(ctx, x + k * 0.018, y - k * 0.05, k * 0.018, '#F3DE97');
        poly(
            ctx,
            [
                [x + k * 0.032, y - k * 0.052],
                [x + k * 0.047, y - k * 0.047],
                [x + k * 0.032, y - k * 0.042],
            ],
            '#F4B27A'
        );
        disc(ctx, x + k * 0.024, y - k * 0.055, k * 0.004, INK);
    });
}

export function egg(ctx, x, y, k, crack = 0) {
    ellipse(ctx, x, y - k * 0.03, k * 0.022, k * 0.03);
    ctx.fillStyle = '#FBF2E2';
    ctx.fill();
    if (crack > 0) line(ctx, x - k * 0.02, y - k * 0.035, x + k * 0.02, y - k * 0.03, k * 0.005, INK);
}

export function dog(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        const run = Math.sin(o.run || 0) * k * 0.02;
        for (const lx of [-0.04, 0.04]) {
            line(ctx, x + lx * k, y - k * 0.04, x + lx * k + run, y, k * 0.016, '#D2AF84');
            line(
                ctx,
                x + lx * k + k * 0.015,
                y - k * 0.04,
                x + lx * k + k * 0.015 - run,
                y,
                k * 0.016,
                '#D2AF84'
            );
        }
        line(ctx, x - k * 0.06, y - k * 0.06, x - k * 0.095, y - k * 0.1 + run, k * 0.014, '#D2AF84');
        ellipse(ctx, x, y - k * 0.06, k * 0.065, k * 0.032);
        ctx.fillStyle = '#E5CBA5';
        ctx.fill();
        disc(ctx, x + k * 0.065, y - k * 0.085, k * 0.03, '#E5CBA5');
        ellipse(ctx, x + k * 0.05, y - k * 0.08, k * 0.012, k * 0.028, 0.3);
        ctx.fillStyle = '#B99068';
        ctx.fill();
        disc(ctx, x + k * 0.094, y - k * 0.082, k * 0.009, INK);
        disc(ctx, x + k * 0.074, y - k * 0.092, k * 0.006, INK);
    });
}

// The farmer: a small figure in a straw hat, waving, or carrying a watering can.
export function farmer(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        const step = Math.sin(o.step || 0) * k * 0.012;
        line(ctx, x - k * 0.015, y - k * 0.06, x - k * 0.015 + step, y, k * 0.02, '#6E8FB8');
        line(ctx, x + k * 0.015, y - k * 0.06, x + k * 0.015 - step, y, k * 0.02, '#6E8FB8');
        fillRound(ctx, x - k * 0.035, y - k * 0.14, k * 0.07, k * 0.09, k * 0.02, '#88B2DA');
        fillRound(ctx, x - k * 0.035, y - k * 0.15, k * 0.07, k * 0.035, k * 0.015, '#F4C8A2');
        const wave = o.wave ? Math.sin(o.wave) * 0.6 : 0;
        line(
            ctx,
            x + k * 0.03,
            y - k * 0.13,
            x + k * 0.07,
            y - k * 0.17 - wave * k * 0.04,
            k * 0.016,
            '#F4C8A2'
        );
        disc(ctx, x, y - k * 0.18, k * 0.03, '#F3D7C2');
        disc(ctx, x + k * 0.01, y - k * 0.185, k * 0.004, INK);
        ellipse(ctx, x, y - k * 0.205, k * 0.05, k * 0.012);
        ctx.fillStyle = '#E5CBA5';
        ctx.fill();
        fillRound(ctx, x - k * 0.025, y - k * 0.235, k * 0.05, k * 0.03, k * 0.012, '#E5CBA5');
        if (o.can) {
            fillRound(ctx, x + k * 0.05, y - k * 0.1, k * 0.05, k * 0.04, k * 0.01, '#A9D7C8');
            line(ctx, x + k * 0.1, y - k * 0.09, x + k * 0.13, y - k * 0.11, k * 0.01, '#A9D7C8');
        }
    });
}

export function butterfly(ctx, x, y, k, flap = 0) {
    const open = 0.4 + 0.6 * Math.abs(Math.sin(flap));
    for (const side of [-1, 1]) {
        ellipse(ctx, x + side * k * 0.02 * open, y - k * 0.01, k * 0.022 * open, k * 0.018, side * 0.5);
        ctx.fillStyle = '#F2BAC3';
        ctx.fill();
        ellipse(ctx, x + side * k * 0.016 * open, y + k * 0.012, k * 0.015 * open, k * 0.012, -side * 0.5);
        ctx.fillStyle = '#F3DE97';
        ctx.fill();
    }
    line(ctx, x, y - k * 0.02, x, y + k * 0.02, k * 0.006, INK);
}

export function snail(ctx, x, y, k, hidden = 0) {
    if (hidden < 1) {
        ellipse(ctx, x + k * 0.02, y - k * 0.012, k * 0.07 * (1 - hidden), k * 0.017);
        ctx.fillStyle = '#D9C9B4';
        ctx.fill();
        line(ctx, x + k * 0.07, y - k * 0.02, x + k * 0.085, y - k * 0.05, k * 0.008, '#D9C9B4');
        disc(ctx, x + k * 0.085, y - k * 0.052, k * 0.007, INK);
    }
    disc(ctx, x, y - k * 0.04, k * 0.042, '#E5B98F');
    ctx.beginPath();
    ctx.arc(x, y - k * 0.04, k * 0.024, 0, TAU * 0.8);
    ctx.lineWidth = k * 0.009;
    ctx.strokeStyle = '#C99A7A';
    ctx.stroke();
}

// Sleep, as three little zigzags rising and fading: a picture, not letters.
export function zzz(ctx, x, y, k, t) {
    for (let i = 0; i < 3; i++) {
        const f = (t * 0.5 + i / 3) % 1;
        const r = k * (0.012 + 0.008 * f);
        const px = x + Math.sin(f * 4 + i) * k * 0.02 + f * k * 0.05;
        const py = y - f * k * 0.18;
        ctx.beginPath();
        ctx.moveTo(px - r, py - r);
        ctx.lineTo(px + r, py - r);
        ctx.lineTo(px - r, py + r);
        ctx.lineTo(px + r, py + r);
        ctx.lineWidth = Math.max(1, k * 0.007);
        ctx.strokeStyle = `rgba(251, 246, 238, ${0.9 * (1 - f)})`;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
    }
}

export function sparkle(ctx, x, y, r, colour = '#FFF6D6') {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fillStyle = colour;
    ctx.fill();
}

export function flower(ctx, x, y, k, colour) {
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        disc(ctx, x + Math.cos(a) * k * 0.014, y + Math.sin(a) * k * 0.014, k * 0.011, colour);
    }
    disc(ctx, x, y, k * 0.008, '#F3DE97');
}

//==============================================================================
// The sun and the moon, for the corner button.

export function sun(ctx, x, y, r) {
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        line(
            ctx,
            x + Math.cos(a) * r * 1.25,
            y + Math.sin(a) * r * 1.25,
            x + Math.cos(a) * r * 1.6,
            y + Math.sin(a) * r * 1.6,
            r * 0.22,
            '#F0C96A'
        );
    }
    disc(ctx, x, y, r, '#F3DE97');
    disc(ctx, x - r * 0.3, y - r * 0.3, r * 0.3, 'rgba(255,255,255,0.35)');
}

export function moon(ctx, x, y, r, back) {
    disc(ctx, x, y, r, '#F7F0DC');
    disc(ctx, x + r * 0.45, y - r * 0.25, r * 0.85, back);
    for (const [sx, sy, sr] of [
        [0.9, 0.6, 0.12],
        [1.2, -0.7, 0.09],
        [-0.9, -1.0, 0.08],
    ]) {
        circle(ctx, x + sx * r, y + sy * r, sr * r);
        ctx.fillStyle = '#F7F0DC';
        ctx.fill();
    }
}

//==============================================================================
// The farm at the island's angle. Buildings are boxes and roofs in a tile's frame (see iso.js),
// each with the points its callers need: where a cat sits, where the door is, where a window
// glows. Everything living stays a cut-out, standing up to face whoever is looking.

// Where crops grow in a field tile, along its furrows, as fractions of the tile.
export const CROP_SPOTS = [];
for (const fy of [0.36, 0.6, 0.84]) for (const fx of [0.24, 0.5, 0.76]) CROP_SPOTS.push([fx, fy]);
CROP_SPOTS.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));

// Crops in a field tile: `spot(fx, fy)` is a point of the tile on the screen.
export function isoCrops(ctx, spot, s, stage, crop, seed, pop = 0, giant = false) {
    if (stage <= 0) return;
    if (stage === 4 && giant) {
        const [x, y] = spot(0.55, 0.6);
        pumpkin(ctx, x, y - s * 0.12, s * 0.24 * (1 + pop * 0.1));
        return;
    }
    CROP_SPOTS.forEach(([fx, fy], i) => {
        const n = (seed * 31 + i * 7) % 17;
        const [x, y] = spot(fx + ((n % 5) - 2) * 0.012, fy + (((n * 3) % 5) - 2) * 0.01);
        plant(ctx, x, y - pop * s * 0.03, s, stage, crop);
    });
}

const BARN = { u0: -0.3, v0: -0.25, u1: 0.3, v1: 0.25, z: 0.3, rise: 0.23 };

// The barn: doors in its gable end that open (`door` 0 to 1) on the dark and the hay, where
// `inside(ctx, x, y)` is drawn, clipped to the doorway, the doorway's foot at (x, y).
export function isoBarn(ctx, f, o = {}) {
    const { u0, v0, u1, v1, z, rise } = BARN;
    const w = Math.max(1, f.tw * 0.016);
    iso.footprint(ctx, f, u0, v0, u1, v1);
    iso.box(ctx, f, u0, v0, u1, v1, 0, z, FARM.barn, { noTop: true, left: shade(FARM.barn, -0.13) });
    for (const [u, v] of [
        [u0, v1],
        [u1, v1],
        [u1, v0],
    ])
        iso.edge(ctx, f, [u, v, 0], [u, v, z], w * 1.2, FARM.trim);
    // Two windows along the side.
    iso.onWall(ctx, f, 'left', v1, u0, (g) => {
        for (const a of [0.12, 0.4]) {
            g.fillStyle = FARM.trim;
            g.fillRect(a - 0.012, 0.115, 0.104, 0.1);
            g.fillStyle = FARM.dark;
            g.fillRect(a, 0.127, 0.08, 0.076);
        }
    });
    iso.gable(ctx, f, u0, v0, u1, v1, z, rise, 'u', FARM.barnRoof, FARM.barn, {
        overhang: 0.035,
        trim: FARM.trim,
        gableEnd: () => {
            // The hayloft, under the ridge.
            iso.onWall(ctx, f, 'right', u1, v1, (g) => {
                g.fillStyle = FARM.trim;
                g.fillRect(0.185, 0.315, 0.13, 0.115);
                g.fillStyle = o.lit ? FARM.lit : FARM.dark;
                g.fillRect(0.2, 0.327, 0.1, 0.09);
            });
        },
    });
    barnDoors(ctx, f, o);
}

function barnDoors(ctx, f, o) {
    const { u1, v1 } = BARN;
    const a0 = 0.12;
    const a1 = 0.38;
    const top = 0.215;
    const open = o.door || 0;
    if (open > 0.01) {
        iso.onWall(ctx, f, 'right', u1, v1, (g) => {
            g.fillStyle = FARM.dark;
            g.fillRect(a0, 0, a1 - a0, top);
        });
        iso.poly(
            ctx,
            f,
            [
                [u1, v1 - a0, 0],
                [u1, v1 - a1, 0],
                [u1 + 0.07, v1 - a1 + 0.03, 0],
                [u1 + 0.07, v1 - a0 - 0.03, 0],
            ],
            FARM.hay
        );
        if (o.inside) {
            ctx.save();
            iso.wallRect(ctx, f, 'right', u1, v1, a0, 0, a1, top);
            ctx.clip();
            const [x, y] = iso.wallPt(f, 'right', u1, v1, (a0 + a1) / 2, 0);
            o.inside(ctx, x, y);
            ctx.restore();
        }
    }
    const leaf = ((a1 - a0) / 2) * Math.cos((open * Math.PI) / 2.2);
    iso.onWall(ctx, f, 'right', u1, v1, (g) => {
        g.lineWidth = 0.012;
        for (const side of [0, 1]) {
            const l = side ? a1 - leaf : a0;
            if (leaf < 0.004) continue;
            g.fillStyle = FARM.barnDoor;
            g.fillRect(l, 0, leaf, top);
            g.strokeStyle = FARM.trim;
            g.strokeRect(l + 0.008, 0.008, leaf - 0.016, top - 0.016);
            if (leaf > 0.03) {
                g.beginPath();
                g.moveTo(l + 0.01, 0.01);
                g.lineTo(l + leaf - 0.01, top - 0.01);
                g.moveTo(l + leaf - 0.01, 0.01);
                g.lineTo(l + 0.01, top - 0.01);
                g.stroke();
            }
        }
    });
}

// Where things are on the barn: the ridge a cat sleeps on, the hayloft an owl looks out of.
export function barnSpots(f) {
    const { u1, v1, z, rise } = BARN;
    return {
        roof: iso.pt(f, 0.12, 0, z + rise + 0.01),
        hayloft: iso.wallPt(f, 'right', u1, v1, 0.25, 0.33),
        door: iso.wallPt(f, 'right', u1, v1, 0.25, 0),
    };
}

// The barn's lights at night: the hayloft glows.
export function barnLights(ctx, f, k) {
    const { u1, v1 } = BARN;
    iso.onWall(ctx, f, 'right', u1, v1, (g) => {
        g.fillStyle = `rgba(255, 226, 154, ${0.3 * k})`;
        g.fillRect(0.17, 0.3, 0.16, 0.145);
        g.fillStyle = `rgba(255, 226, 154, ${0.95 * k})`;
        g.fillRect(0.2, 0.327, 0.1, 0.09);
    });
}

const HOUSE = { u0: -0.28, v0: -0.21, u1: 0.28, v1: 0.21, z: 0.29, rise: 0.19 };
// The house's windows, on its long side (left) and its gable end (right), in each wall's terms.
const HOUSE_WINDOWS = [
    ['left', 0.07, 0.115, 0.17, 0.205],
    ['left', 0.39, 0.115, 0.49, 0.205],
    ['right', 0.17, 0.12, 0.26, 0.21],
];

// The farmhouse: `door` opens, `lit` glows the windows; the chimney's smoke is the caller's.
export function isoHouse(ctx, f, o = {}) {
    const { u0, v0, u1, v1, z, rise } = HOUSE;
    iso.footprint(ctx, f, u0, v0, u1, v1);
    iso.box(ctx, f, u0, v0, u1, v1, 0, z, FARM.wall, { noTop: true, left: shade(FARM.wall, -0.1) });
    for (const [side, a0, z0, a1, z1] of HOUSE_WINDOWS) {
        iso.onWall(ctx, f, side, side === 'left' ? v1 : u1, side === 'left' ? u0 : v1, (g) => {
            g.fillStyle = FARM.trim;
            g.fillRect(a0 - 0.012, z0 - 0.012, a1 - a0 + 0.024, z1 - z0 + 0.024);
            g.fillStyle = o.lit ? FARM.lit : FARM.glass;
            g.fillRect(a0, z0, a1 - a0, z1 - z0);
            g.fillStyle = FARM.trim;
            g.fillRect((a0 + a1) / 2 - 0.005, z0, 0.01, z1 - z0);
            g.fillRect(a0, (z0 + z1) / 2 - 0.005, a1 - a0, 0.01);
        });
    }
    // The door, which opens inwards onto the dark, and a box of flowers under the first window.
    const open = o.door || 0;
    iso.onWall(ctx, f, 'left', v1, u0, (g) => {
        g.fillStyle = FARM.dark;
        g.fillRect(0.235, 0, 0.09, 0.185);
        g.fillStyle = FARM.door;
        g.fillRect(0.235, 0, 0.09 * (1 - open * 0.8), 0.185);
        g.fillStyle = FARM.roofDeep;
        g.fillRect(0.06, 0.085, 0.12, 0.028);
    });
    for (const [a, colour] of [
        [0.08, '#F2BAC3'],
        [0.12, '#F3DE97'],
        [0.16, '#F2BAC3'],
    ]) {
        const [x, y] = iso.wallPt(f, 'left', v1, u0, a, 0.12);
        disc(ctx, x, y, f.tw * 0.014, colour);
    }
    iso.gable(ctx, f, u0, v0, u1, v1, z, rise, 'u', FARM.roof, FARM.wall, {
        overhang: 0.04,
        gableEnd: () => {
            const [x, y] = iso.wallPt(f, 'right', u1, v1, 0.21, 0.355);
            ellipse(ctx, x, y, f.tw * 0.025, f.tw * 0.03);
            ctx.fillStyle = o.lit ? FARM.lit : FARM.glass;
            ctx.fill();
        },
    });
    // The chimney, set in the near slope of the roof.
    const cz = iso.roofAt(u0, v0, u1, v1, z, rise, 'u', 0.14, 0.08);
    iso.box(ctx, f, 0.1, 0.04, 0.18, 0.12, cz - 0.03, z + rise + 0.07, FARM.roofDeep);
}

// Where things are on the house: the doorstep, the chimney's top, and each window, as a path to
// clip a cat to.
export function houseSpots(f) {
    const { u0, v0, u1, v1, z, rise } = HOUSE;
    void v0;
    return {
        door: iso.wallPt(f, 'left', v1, u0, 0.28, 0),
        chimney: iso.pt(f, 0.14, 0.08, z + rise + 0.08),
        window: (ctx, i) => {
            const [side, a0, z0, a1, z1] = HOUSE_WINDOWS[i];
            iso.wallRect(ctx, f, side, side === 'left' ? v1 : u1, side === 'left' ? u0 : v1, a0, z0, a1, z1);
        },
        windowFoot: (i) => {
            const [side, a0, z0, a1] = HOUSE_WINDOWS[i];
            return iso.wallPt(
                f,
                side,
                side === 'left' ? v1 : u1,
                side === 'left' ? u0 : v1,
                (a0 + a1) / 2,
                z0
            );
        },
    };
}

export function houseLights(ctx, f, k) {
    const { u0, u1, v1 } = HOUSE;
    for (const [side, a0, z0, a1, z1] of HOUSE_WINDOWS) {
        iso.onWall(ctx, f, side, side === 'left' ? v1 : u1, side === 'left' ? u0 : v1, (g) => {
            g.fillStyle = `rgba(255, 226, 154, ${0.28 * k})`;
            g.fillRect(a0 - 0.03, z0 - 0.03, a1 - a0 + 0.06, z1 - z0 + 0.06);
            g.fillStyle = `rgba(255, 226, 154, ${0.95 * k})`;
            g.fillRect(a0, z0, a1 - a0, z1 - z0);
        });
    }
}

const COOP = { u0: -0.2, v0: -0.16, u1: 0.2, v1: 0.16, z0: 0.08, z: 0.25, rise: 0.12 };

// The hen house: a hut on legs, with a ramp down from its door.
export function isoCoop(ctx, f, o = {}) {
    const { u0, v0, u1, v1, z0, z, rise } = COOP;
    iso.footprint(ctx, f, u0, v0, u1, v1, 0.05);
    for (const [u, v] of [
        [u0 + 0.03, v0 + 0.03],
        [u0 + 0.03, v1 - 0.03],
        [u1 - 0.03, v0 + 0.03],
        [u1 - 0.03, v1 - 0.03],
    ])
        iso.box(ctx, f, u - 0.018, v - 0.018, u + 0.018, v + 0.018, 0, z0, FARM.postDark, { noTop: true });
    iso.box(ctx, f, u0, v0, u1, v1, z0, z, FARM.coop, { left: shade(FARM.coop, -0.12) });
    const plank = shade(FARM.coop, -0.16);
    for (const [side, at, from, len] of [
        ['left', v1, u0, u1 - u0],
        ['right', u1, v1, v1 - v0],
    ]) {
        iso.onWall(ctx, f, side, at, from, (g) => {
            g.fillStyle = plank;
            for (let k = 1; k < 4; k++) g.fillRect(0, z0 + (k * (z - z0)) / 4 - 0.003, len, 0.006);
        });
    }
    iso.onWall(ctx, f, 'left', v1, u0, (g) => {
        g.fillStyle = o.lit ? FARM.lit : FARM.dark;
        g.beginPath();
        g.moveTo(0.15, z0 + 0.01);
        g.lineTo(0.15, z0 + 0.09);
        g.arc(0.2, z0 + 0.09, 0.05, Math.PI, 0, true);
        g.lineTo(0.25, z0 + 0.01);
        g.closePath();
        g.fill();
    });
    // The ramp, from the door down to the grass.
    iso.poly(
        ctx,
        f,
        [
            [-0.02, v1, z0 + 0.01],
            [0.06, v1, z0 + 0.01],
            [0.08, v1 + 0.2, 0],
            [0, v1 + 0.2, 0],
        ],
        FARM.post
    );
    for (let k = 1; k < 4; k++) {
        const t = k / 4;
        iso.edge(
            ctx,
            f,
            [-0.02 + t * 0.02, v1 + t * 0.2, z0 * (1 - t)],
            [0.06 + t * 0.02, v1 + t * 0.2, z0 * (1 - t)],
            Math.max(1, f.tw * 0.012),
            FARM.postDark
        );
    }
    iso.gable(ctx, f, u0, v0, u1, v1, z, rise, 'u', FARM.roofDeep, FARM.coop, { overhang: 0.035 });
}

// Where things are at the hen house: its roof, the doorway, the foot of the ramp, where an egg is
// left.
export function coopSpots(f) {
    const { u0, v1, z0, z, rise } = COOP;
    return {
        roof: iso.pt(f, 0, 0, z + rise),
        door: iso.wallPt(f, 'left', v1, u0, 0.2, z0),
        ramp: iso.pt(f, 0.04, v1 + 0.2, 0),
        egg: iso.pt(f, 0.3, 0.3, 0),
    };
}

export function coopLights(ctx, f, k) {
    const { u0, v1, z0 } = COOP;
    iso.onWall(ctx, f, 'left', v1, u0, (g) => {
        g.fillStyle = `rgba(255, 226, 154, ${0.9 * k})`;
        g.beginPath();
        g.moveTo(0.15, z0 + 0.01);
        g.lineTo(0.15, z0 + 0.09);
        g.arc(0.2, z0 + 0.09, 0.05, Math.PI, 0, true);
        g.lineTo(0.25, z0 + 0.01);
        g.closePath();
        g.fill();
    });
}

const MILL = { base: 0.19, top: 0.115, height: 0.6 };

// The windmill: a round tower, lit on its right, a cap, and sails at `angle` turning to face the
// viewer. `o.sails` false leaves the sails for the caller, who turns them.
export function isoWindmill(ctx, f, o = {}) {
    const { base, top, height } = MILL;
    const tw = f.tw;
    const cx = f.cx;
    const cy = f.cy;
    const bw = base * tw;
    const tpw = top * tw;
    const h = height * tw;
    ellipse(ctx, cx - tw * 0.03, cy + tw * 0.02, bw * 1.35, bw * 0.6);
    ctx.fillStyle = 'rgba(112, 84, 58, 0.13)';
    ctx.fill();
    const half = (side, colour) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + bw * 0.5);
        ctx.ellipse(cx, cy, bw, bw * 0.5, 0, Math.PI / 2, side < 0 ? Math.PI : 0, side > 0);
        ctx.lineTo(cx + side * tpw, cy - h);
        ctx.ellipse(cx, cy - h, tpw, tpw * 0.5, 0, side < 0 ? Math.PI : 0, Math.PI / 2, side < 0);
        ctx.closePath();
        ctx.fillStyle = colour;
        ctx.fill();
    };
    half(-1, shade(FARM.tower, -0.1));
    half(1, FARM.tower);
    // A band of stone at the foot, the door, a window.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, bw, bw * 0.5, 0, 0, Math.PI);
    ctx.lineTo(cx - bw * 0.97, cy - tw * 0.07);
    ctx.ellipse(cx, cy - tw * 0.07, bw * 0.97, bw * 0.485, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = 'rgba(112, 84, 58, 0.12)';
    ctx.fill();
    ctx.restore();
    fillRound(ctx, cx - tw * 0.075, cy - tw * 0.02, tw * 0.07, tw * 0.13 + bw * 0.1, tw * 0.035, FARM.door);
    disc(ctx, cx - tw * 0.03, cy - h * 0.56, tw * 0.03, o.lit ? FARM.lit : FARM.glass);
    // The cap.
    ctx.beginPath();
    ctx.ellipse(cx, cy - h, tpw * 1.25, tpw * 0.62, 0, 0, Math.PI);
    ctx.ellipse(cx, cy - h, tpw * 1.25, tpw * 1.15, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = FARM.roofDeep;
    ctx.fill();
    ellipse(ctx, cx + tpw * 0.35, cy - h - tpw * 0.55, tpw * 0.5, tpw * 0.25, -0.3);
    ctx.fillStyle = 'rgba(255, 255, 240, 0.25)';
    ctx.fill();
    if (o.sails !== false) isoSails(ctx, f, o.angle || 0);
}

// Where the sails turn, and how long they are.
export function windmillSpots(f) {
    const { height } = MILL;
    return {
        hub: [f.cx - f.tw * 0.07, f.cy - f.tw * (height - 0.02)],
        sail: f.tw * 0.4,
        window: [f.cx - f.tw * 0.03, f.cy - f.tw * height * 0.56],
    };
}

export function isoSails(ctx, f, angle) {
    const { hub, sail } = windmillSpots(f);
    // The old sails are drawn about a hub at (x + s/2, y + s*0.35), each 0.33 s long.
    const s = sail / 0.33;
    windmillSails(ctx, hub[0] - s / 2, hub[1] - s * 0.35, s, angle);
}

export function windmillLights(ctx, f, k) {
    const [x, y] = windmillSpots(f).window;
    disc(ctx, x, y, f.tw * 0.06, `rgba(255, 226, 154, ${0.3 * k})`);
    disc(ctx, x, y, f.tw * 0.03, `rgba(255, 226, 154, ${0.95 * k})`);
}

// A run of fence through the tile, joined towards the sides in `mask` (1 back right, 2 front right,
// 4 front left, 8 back left: north, east, south and west of the plan). A lone piece is a short
// section of its own.
export function isoFence(ctx, f, mask) {
    const runs = [];
    if (!mask) runs.push([-0.32, 0, 0.32, 0]);
    if (mask & 8) runs.push([-0.5, 0, 0, 0]);
    if (mask & 1) runs.push([0, -0.5, 0, 0]);
    if (mask & 2) runs.push([0, 0, 0.5, 0]);
    if (mask & 4) runs.push([0, 0, 0, 0.5]);
    const w = Math.max(1, f.tw * 0.012);
    for (const [u0, v0, u1, v1] of runs)
        iso.edge(ctx, f, [u0, v0], [u1, v1], w * 3, 'rgba(112, 84, 58, 0.1)');
    const post = (u, v) => {
        iso.box(ctx, f, u - 0.028, v - 0.028, u + 0.028, v + 0.028, 0, 0.25, FARM.post, {
            left: FARM.postDark,
            top: shade(FARM.post, 0.1),
        });
    };
    const rails = (u0, v0, u1, v1) => {
        for (const z of [0.1, 0.19]) {
            iso.poly(
                ctx,
                f,
                [
                    [u0, v0, z - 0.017],
                    [u1, v1, z - 0.017],
                    [u1, v1, z + 0.017],
                    [u0, v0, z + 0.017],
                ],
                u1 !== u0 ? FARM.plank : shade(FARM.plank, -0.08)
            );
        }
    };
    // From the back of the tile to its front: what is behind the middle post, the post, then what
    // is in front of it.
    for (const run of runs) if (run[0] < 0 || run[1] < 0) rails(...run);
    if (!mask) {
        post(-0.3, 0);
        post(0.3, 0);
        post(0, 0);
    } else post(0, 0);
    for (const run of runs) if (!(run[0] < 0 || run[1] < 0)) rails(...run);
}

// Where things are on the fence: the top of its middle post, and its lower rail.
export function fenceSpots(f) {
    return {
        post: iso.pt(f, 0, 0, 0.26),
        rail: (t) => iso.pt(f, -0.3 + t * 0.6, 0, 0.1),
    };
}
