// The dig's own pictures: the sky over the sandpit, and the things buried in the sand.
//
// The machines are in machines.js, shared with the rest of the building site. What is here is
// only the dig's: a background drawn once per layout, and the finds, each drawn standing on the
// sand at (x, y), `s` across, so one drawing serves wherever it pops out.

import { fillRound, disc, ellipse } from '../draw.js';
import { TAU, shade } from '../util.js';
import { SITE, INK, line, mirrored } from './machines.js';

//==============================================================================
// The sky, the sun, a cloud or two, and the site fence far off along the horizon.

export function background(ctx, w, h, horizon, u) {
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, SITE.sky);
    sky.addColorStop(1, SITE.skyLow);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    disc(ctx, w - 150 * u, 120 * u, 70 * u, 'rgba(255, 236, 170, 0.35)');
    disc(ctx, w - 150 * u, 120 * u, 46 * u, '#FBEBB4');
    cloud(ctx, w * 0.22, 110 * u, 70 * u);
    cloud(ctx, w * 0.58, 70 * u, 52 * u);

    // Low hills, then the hoarding round the site: pale planks on posts.
    ctx.fillStyle = '#D9E6CF';
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= w; x += 40 * u) {
        ctx.lineTo(x, horizon - 70 * u - Math.sin(x / (170 * u)) * 26 * u - Math.sin(x / (61 * u)) * 7 * u);
    }
    ctx.lineTo(w, horizon);
    ctx.closePath();
    ctx.fill();
    const top = horizon - 44 * u;
    fillRound(ctx, -10, top, w + 20, 44 * u + 4, 4 * u, '#EFE4D2');
    ctx.fillStyle = '#E4D6BF';
    for (let x = 0; x < w; x += 26 * u) ctx.fillRect(x, top + 4 * u, 2 * u, 40 * u);
    for (let x = 30 * u; x < w; x += 180 * u) fillRound(ctx, x, top - 8 * u, 9 * u, 56 * u, 3 * u, '#D8C7AC');
}

function cloud(ctx, x, y, r) {
    const c = 'rgba(255, 255, 255, 0.75)';
    disc(ctx, x, y, r * 0.55, c);
    disc(ctx, x - r * 0.55, y + r * 0.15, r * 0.38, c);
    disc(ctx, x + r * 0.6, y + r * 0.12, r * 0.42, c);
    fillRound(ctx, x - r * 0.9, y + r * 0.05, r * 1.9, r * 0.45, r * 0.22, c);
}

//==============================================================================
// The finds. Each is drawn resting on the sand at (x, y), about `s` across.

export const FINDS = ['bone', 'shell', 'worm', 'mole', 'fossil', 'car'];

export function find(ctx, kind, x, y, s, o = {}) {
    ctx.save();
    ctx.translate(x, y);
    if (o.tilt) ctx.rotate(o.tilt);
    if (o.squash) ctx.scale(1 + o.squash * 0.2, 1 - o.squash * 0.2);
    DRAW[kind](ctx, s, o);
    ctx.restore();
}

const DRAW = {
    // A dog's bone, lying down.
    bone(ctx, s) {
        const c = '#F7F1E6';
        const d = '#E2D7C4';
        fillRound(ctx, -s * 0.32, -s * 0.2, s * 0.64, s * 0.14, s * 0.07, d);
        for (const side of [-1, 1]) {
            disc(ctx, side * s * 0.36, -s * 0.23, s * 0.1, d);
            disc(ctx, side * s * 0.36, -s * 0.1, s * 0.1, d);
        }
        fillRound(ctx, -s * 0.32, -s * 0.22, s * 0.64, s * 0.13, s * 0.065, c);
        for (const side of [-1, 1]) {
            disc(ctx, side * s * 0.36, -s * 0.25, s * 0.09, c);
            disc(ctx, side * s * 0.36, -s * 0.12, s * 0.09, c);
        }
    },

    // A scallop shell, its ribs fanning out from the hinge.
    shell(ctx, s) {
        const c = '#F4C3C9';
        const d = '#E59EAB';
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.03);
        ctx.arc(0, -s * 0.03, s * 0.34, Math.PI * 1.08, Math.PI * 1.92);
        ctx.closePath();
        ctx.fillStyle = c;
        ctx.fill();
        for (let i = 0; i <= 6; i++) {
            const a = Math.PI * (1.12 + (0.76 * i) / 6);
            line(ctx, 0, -s * 0.03, Math.cos(a) * s * 0.3, -s * 0.03 + Math.sin(a) * s * 0.3, s * 0.025, d);
        }
        fillRound(ctx, -s * 0.09, -s * 0.07, s * 0.18, s * 0.07, s * 0.02, d);
    },

    // A worm, wriggling. `wriggle` is its phase; `down` (0..1) how far it has gone back in.
    worm(ctx, s, o) {
        const down = o.down || 0;
        const n = 9;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const x = (t - 0.5) * s * 0.7;
            const lift = Math.sin(t * Math.PI) * s * 0.18 * (1 - down);
            const y = -s * 0.06 - lift - Math.sin((o.wriggle || 0) + t * 5) * s * 0.04 + down * s * 0.12;
            disc(ctx, x, y, s * 0.075, i % 2 ? '#EBA7A3' : '#E89C98');
        }
        const hx = s * 0.35;
        const hy = -s * 0.06 - Math.sin((o.wriggle || 0) + 5) * s * 0.04 + down * s * 0.12;
        disc(ctx, hx, hy, s * 0.085, '#EBA7A3');
        disc(ctx, hx + s * 0.03, hy - s * 0.02, s * 0.016, INK);
    },

    // A mole, up out of its hole. `up` (0..1) how far out; `blink` closes its eyes.
    mole(ctx, s, o) {
        const up = o.up === undefined ? 1 : o.up;
        ellipse(ctx, 0, -s * 0.02, s * 0.32, s * 0.09);
        ctx.fillStyle = SITE.earthDeep;
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.rect(-s * 0.5, -s, s, s * 0.98);
        ctx.clip();
        const y = s * 0.3 * (1 - up);
        fillRound(ctx, -s * 0.2, -s * 0.42 + y, s * 0.4, s * 0.5, s * 0.18, '#8C776B');
        disc(ctx, 0, -s * 0.24 + y, s * 0.075, '#F2A7A7');
        disc(ctx, -s * 0.08, -s * 0.32 + y, s * 0.03, '#FBF6EE');
        disc(ctx, s * 0.08, -s * 0.32 + y, s * 0.03, '#FBF6EE');
        if (!o.blink) {
            disc(ctx, -s * 0.08, -s * 0.32 + y, s * 0.016, INK);
            disc(ctx, s * 0.08, -s * 0.32 + y, s * 0.016, INK);
        } else {
            line(ctx, -s * 0.1, -s * 0.32 + y, -s * 0.06, -s * 0.32 + y, s * 0.012, INK);
            line(ctx, s * 0.06, -s * 0.32 + y, s * 0.1, -s * 0.32 + y, s * 0.012, INK);
        }
        for (const side of [-1, 1]) {
            ellipse(ctx, side * s * 0.19, -s * 0.06 + y, s * 0.08, s * 0.05, side * 0.4);
            ctx.fillStyle = '#F2B8B5';
            ctx.fill();
        }
        ctx.restore();
    },

    // An ammonite: a coiled shell turned to stone.
    fossil(ctx, s) {
        const r = s * 0.28;
        disc(ctx, 0, -r, r, '#DCD4C6');
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
            const a = (i / 40) * TAU * 2.2;
            const rr = r * 0.9 * Math.pow(0.72, a / Math.PI);
            const x = Math.cos(a) * rr;
            const y = -r + Math.sin(a) * rr;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.lineWidth = s * 0.035;
        ctx.strokeStyle = '#B5AA99';
        ctx.lineCap = 'round';
        ctx.stroke();
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * TAU;
            line(
                ctx,
                Math.cos(a) * r * 0.7,
                -r + Math.sin(a) * r * 0.7,
                Math.cos(a) * r * 0.95,
                -r + Math.sin(a) * r * 0.95,
                s * 0.02,
                '#C7BCAB'
            );
        }
    },

    // A little toy car, lost in the sand long ago. `roll` turns its wheels.
    car(ctx, s, o) {
        mirrored(ctx, 0, o.facing || 1, () => {
            const c = '#E79A98';
            fillRound(ctx, -s * 0.36, -s * 0.3, s * 0.72, s * 0.17, s * 0.07, c);
            fillRound(ctx, -s * 0.2, -s * 0.44, s * 0.36, s * 0.17, s * 0.07, shade(c, -0.08));
            fillRound(ctx, -s * 0.14, -s * 0.41, s * 0.12, s * 0.1, s * 0.03, SITE.glass);
            fillRound(ctx, s * 0.02, -s * 0.41, s * 0.11, s * 0.1, s * 0.03, SITE.glass);
            disc(ctx, s * 0.33, -s * 0.24, s * 0.03, SITE.lit);
            for (const wx of [-0.2, 0.2]) {
                disc(ctx, wx * s, -s * 0.11, s * 0.1, SITE.tyre);
                disc(ctx, wx * s, -s * 0.11, s * 0.045, SITE.hub);
                const a = o.roll || 0;
                line(
                    ctx,
                    wx * s,
                    -s * 0.11,
                    wx * s + Math.cos(a) * s * 0.06,
                    -s * 0.11 + Math.sin(a) * s * 0.06,
                    s * 0.02,
                    SITE.tyreLight
                );
            }
        });
    },
};

// A small four-pointed twinkle, for a find coming up into the light.
export function twinkle(ctx, x, y, r, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFF6D8';
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
    ctx.restore();
}
