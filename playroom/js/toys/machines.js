// The building site's pictures, shared by the dig, the crane and the site: one palette, and the
// parts every machine is made from, so the digger in the sandpit and the digger on the site are
// plainly the same digger.
//
// Machines are seen from the side, like the farm's tractor, and face right; `facing: -1` mirrors
// them. Each drawing takes the point on the ground under its middle, (cx, by), and a size `k`, and
// every length in it is a fraction of k, so one drawing serves a sandpit, a tile and a tray.
//
// The colours are the real site's, softened to sit with the rest of the playroom: a buttery yellow
// rather than a warning one, warm greys rather than black, sand rather than mud.

import { SHADOW_SOFT, fillRound, disc, ellipse } from '../draw.js';
import { TAU } from '../util.js';

export const INK = '#6B5A4C';

export const SITE = {
    // The machines.
    body: '#F1CF7A',
    bodyDeep: '#DDB45C',
    bodyLight: '#F7E2A8',
    accent: '#EDA987',
    accentDeep: '#D98E6C',
    steel: '#BDB3A8',
    steelDeep: '#9C9188',
    steelLight: '#D8D0C6',
    tyre: '#6E5F55',
    tyreLight: '#8D7C6F',
    hub: '#E8DED2',
    glass: '#CFE4EE',
    glassLight: '#E6F1F6',
    lit: '#FFE29A',
    // What they move.
    sand: '#E8D2A6',
    sandDeep: '#D6BA88',
    sandLight: '#F2E3C4',
    earth: '#BF9B79',
    earthDeep: '#A4805F',
    gravel: '#C9C0B5',
    gravelDeep: '#ADA397',
    concrete: '#DAD5CD',
    concreteDeep: '#C3BCB2',
    brick: '#E3A595',
    brickDeep: '#CC8C7E',
    // The people who drive them.
    skin: '#F3D7C2',
    vest: '#F2B28E',
    hat: '#F3DE97',
    hatDeep: '#E5C766',
    trousers: '#88A6C8',
    // The sky over it all.
    sky: '#DCEAF2',
    skyLow: '#EEF3F1',
};

//==============================================================================
// Shapes

export function poly(ctx, points, colour) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
}

export function line(ctx, x0, y0, x1, y1, width, colour) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.lineCap = 'round';
    ctx.stroke();
}

// Draw facing left by mirroring about the vertical line through cx.
export function mirrored(ctx, cx, facing, draw) {
    ctx.save();
    if (facing < 0) {
        ctx.translate(cx, 0);
        ctx.scale(-1, 1);
        ctx.translate(-cx, 0);
    }
    draw();
    ctx.restore();
}

// The soft shadow every standing thing casts on the ground.
export function shadow(ctx, cx, by, w, alpha = 1) {
    ellipse(ctx, cx, by, w, w * 0.18);
    ctx.fillStyle = alpha >= 1 ? SHADOW_SOFT : `rgba(112, 84, 58, ${0.09 * alpha})`;
    ctx.fill();
}

// Diagonal stripes across a rectangle, clipped to it: a barrier, the edge of a blade, a boom's
// tip. Two soft colours, never the black and yellow of a real warning.
export function stripes(ctx, x, y, w, h, a, b, width) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = a;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = b;
    for (let sx = x - h; sx < x + w; sx += width * 2) {
        ctx.beginPath();
        ctx.moveTo(sx, y + h);
        ctx.lineTo(sx + width, y + h);
        ctx.lineTo(sx + width + h, y);
        ctx.lineTo(sx + h, y);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
}

//==============================================================================
// Parts

// A tyre on a rim with four bolts, which turn with `turn` (radians) so rolling reads as rolling.
export function wheel(ctx, x, y, r, turn = 0) {
    disc(ctx, x, y, r, SITE.tyre);
    disc(ctx, x, y, r * 0.62, SITE.hub);
    disc(ctx, x, y, r * 0.5, SITE.steelLight);
    for (let i = 0; i < 4; i++) {
        const a = turn + (i * TAU) / 4;
        disc(ctx, x + Math.cos(a) * r * 0.32, y + Math.sin(a) * r * 0.32, r * 0.07, SITE.steelDeep);
    }
    disc(ctx, x, y, r * 0.14, SITE.steelDeep);
}

// A caterpillar track from x0 to x1, standing on the ground at `by`, `h` tall: a stadium of track
// around a row of rollers, its treads moving with `travel` (in the same units as x), so a machine
// crawling forwards has treads that crawl.
export function tracks(ctx, x0, x1, by, h, travel = 0) {
    const r = h / 2;
    const cy = by - r;
    fillRound(ctx, x0, by - h, x1 - x0, h, r, SITE.tyre);
    fillRound(ctx, x0 + h * 0.14, by - h * 0.86, x1 - x0 - h * 0.28, h * 0.72, r * 0.72, SITE.tyreLight);
    const rollers = Math.max(2, Math.round((x1 - x0) / h));
    for (let i = 0; i < rollers; i++) {
        const x = x0 + r + ((x1 - x0 - 2 * r) * i) / (rollers - 1);
        disc(ctx, x, cy, r * 0.52, SITE.steelDeep);
        disc(ctx, x, cy, r * 0.22, SITE.steel);
    }
    // The treads along the top and the bottom run, in opposite directions.
    const step = h * 0.42;
    const shift = ((travel % step) + step) % step;
    ctx.fillStyle = SITE.tyreLight;
    for (let x = x0 + r - step + shift; x < x1 - r; x += step) {
        if (x > x0 + r * 0.6) ctx.fillRect(x, by - h * 0.07, h * 0.12, h * 0.07);
    }
    for (let x = x1 - r + step - shift; x > x0 + r; x -= step) {
        if (x < x1 - r * 0.6) ctx.fillRect(x - h * 0.12, by - h, h * 0.12, h * 0.07);
    }
}

// A small amber light on top of a machine; `glow` 0..1 when it turns.
export function beacon(ctx, x, y, r, glow = 0) {
    if (glow > 0) {
        disc(ctx, x, y, r * (2.2 + glow), `rgba(255, 214, 140, ${0.18 * glow})`);
        disc(ctx, x, y, r * (1.5 + glow * 0.5), `rgba(255, 214, 140, ${0.3 * glow})`);
    }
    fillRound(ctx, x - r * 0.8, y + r * 0.5, r * 1.6, r * 0.6, r * 0.2, SITE.steelDeep);
    disc(ctx, x, y + r * 0.2, r * 0.8, glow > 0.5 ? SITE.lit : SITE.accent);
    ellipse(ctx, x - r * 0.25, y - r * 0.05, r * 0.28, r * 0.18, -0.4);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
}

// A person in a hard hat: standing at (x, y) on their feet, or, with `seated`, head and shoulders
// only, for the window of a cab. Faces right. `wave` (radians) lifts an arm.
export function worker(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        const headY = o.seated ? y - k * 0.06 : y - k * 0.18;
        if (!o.seated) {
            const step = Math.sin(o.step || 0) * k * 0.012;
            line(ctx, x - k * 0.015, y - k * 0.06, x - k * 0.015 + step, y, k * 0.022, SITE.trousers);
            line(ctx, x + k * 0.015, y - k * 0.06, x + k * 0.015 - step, y, k * 0.022, SITE.trousers);
        }
        const bodyY = headY + k * 0.035;
        fillRound(ctx, x - k * 0.036, bodyY, k * 0.072, k * (o.seated ? 0.05 : 0.09), k * 0.02, SITE.vest);
        if (o.wave !== undefined) {
            const lift = Math.sin(o.wave) * 0.6;
            line(
                ctx,
                x + k * 0.03,
                bodyY + k * 0.012,
                x + k * 0.07,
                bodyY - k * 0.035 - lift * k * 0.04,
                k * 0.016,
                SITE.vest
            );
            disc(ctx, x + k * 0.072, bodyY - k * 0.04 - lift * k * 0.04, k * 0.011, SITE.skin);
        }
        disc(ctx, x, headY, k * 0.03, SITE.skin);
        disc(ctx, x + k * 0.011, headY - k * 0.003, k * 0.0045, INK);
        // The hard hat: a dome and a brim.
        ctx.beginPath();
        ctx.arc(x, headY - k * 0.008, k * 0.033, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = SITE.hat;
        ctx.fill();
        fillRound(ctx, x - k * 0.04, headY - k * 0.012, k * 0.085, k * 0.012, k * 0.006, SITE.hatDeep);
    });
}
