// The building site's pictures: the ground and what is built on it, the machines that only the site
// has, and its small surprises.
//
// As on the farm, pieces stand on their tile like the cut-out figures of a board game, seen from the
// front on a board seen from above, and sizes are fractions of `s`, the tile's side. Machines take
// the point on the ground under their middle and a size `k`, as in machines.js, and face right.
//
// The floors of a building take the playroom's colour-and-note pairs, from the bottom up: red C,
// yellow E, green G, blue A, purple the C above. A building played from the ground up sings the
// scale, and its colours are the easel's and the colour tower's.

import { fillRound, disc, ellipse } from '../draw.js';
import { TAU, clamp } from '../util.js';
import { SITE, INK, poly, line, mirrored, shadow, stripes, wheel, beacon, worker } from './machines.js';

export const GROUND = {
    sky: ['#F0EEE6', '#E8E4D8'],
    earth: '#E6D7BA',
    earthAlt: '#E1D1B1',
    edge: '#CDB48E',
    speck: '#D3BE98',
    road: '#BDB6AC',
    roadEdge: '#A59C91',
    roadLine: '#F4ECDE',
    fresh: '#8F877F',
    plot: '#DECAA5',
    peg: '#C9A57E',
    string: '#EF9F85',
    holeEdge: '#B39071',
    hole: '#9F7D61',
    holeDeep: '#8A6A51',
    wet: '#B9B3AB',
    wetLight: '#D3CEC6',
    slab: '#DCD7CF',
    slabEdge: '#C1BAB0',
    rebar: '#B99068',
};

// The colour-and-note pairs, paler, for walls: one a floor, from the ground up.
export const FLOORS = [
    { wall: '#F2C2BE', deep: '#E2A7A3', degree: 0 },
    { wall: '#F6E1A3', deep: '#E9CB7A', degree: 2 },
    { wall: '#C2DEB5', deep: '#A3C894', degree: 3 },
    { wall: '#B7D3EC', deep: '#97BCE0', degree: 4 },
    { wall: '#D6C6EC', deep: '#BCA7DE', degree: 5 },
];

//==============================================================================
// The ground under a plot, at each step of becoming a building. (x, y) is the tile's corner; `m`
// the sides it joins plots of the same step. Drawn flat, under everything standing.

// The sides a joined shape is pushed out on, and which of its corners are rounded.
function joinedRect(ctx, x, y, s, m, inset, radius) {
    const x0 = x + (m & 8 ? 0 : inset);
    const x1 = x + s - (m & 2 ? 0 : inset);
    const y0 = y + (m & 1 ? 0 : inset);
    const y1 = y + s - (m & 4 ? 0 : inset);
    const tl = m & (1 | 8) ? 0 : radius;
    const tr = m & (1 | 2) ? 0 : radius;
    const br = m & (4 | 2) ? 0 : radius;
    const bl = m & (4 | 8) ? 0 : radius;
    ctx.beginPath();
    ctx.moveTo(x0 + tl, y0);
    ctx.lineTo(x1 - tr, y0);
    if (tr) ctx.arcTo(x1, y0, x1, y0 + tr, tr);
    ctx.lineTo(x1, y1 - br);
    if (br) ctx.arcTo(x1, y1, x1 - br, y1, br);
    ctx.lineTo(x0 + bl, y1);
    if (bl) ctx.arcTo(x0, y1, x0, y1 - bl, bl);
    ctx.lineTo(x0, y0 + tl);
    if (tl) ctx.arcTo(x0, y0, x0 + tl, y0, tl);
    ctx.closePath();
    return { x0, x1, y0, y1 };
}

// A marked-out plot: string between pegs around the outside of the joined shape. `bow` bends the
// string, for a pluck.
export function plotMarked(ctx, x, y, s, m, bow = 0) {
    joinedRect(ctx, x, y, s, m, s * 0.1, s * 0.06);
    ctx.fillStyle = GROUND.plot;
    ctx.fill();
    const i = s * 0.14;
    const x0 = x + (m & 8 ? 0 : i);
    const x1 = x + s - (m & 2 ? 0 : i);
    const y0 = y + (m & 1 ? 0 : i);
    const y1 = y + s - (m & 4 ? 0 : i);
    const width = Math.max(1, s * 0.012);
    const string = (ax, ay, bx, by, nx, ny) => {
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo((ax + bx) / 2 + nx * bow, (ay + by) / 2 + ny * bow, bx, by);
        ctx.lineWidth = width;
        ctx.strokeStyle = GROUND.string;
        ctx.lineCap = 'round';
        ctx.stroke();
    };
    if (!(m & 1)) string(x0, y0, x1, y0, 0, 1);
    if (!(m & 4)) string(x0, y1, x1, y1, 0, -1);
    if (!(m & 8)) string(x0, y0, x0, y1, 1, 0);
    if (!(m & 2)) string(x1, y0, x1, y1, -1, 0);
    const peg = (px, py) => {
        fillRound(ctx, px - s * 0.018, py - s * 0.07, s * 0.036, s * 0.08, s * 0.01, GROUND.peg);
        disc(ctx, px, py - s * 0.07, s * 0.02, GROUND.string);
    };
    if (!(m & (1 | 8))) peg(x0, y0 + s * 0.02);
    if (!(m & (1 | 2))) peg(x1, y0 + s * 0.02);
    if (!(m & (4 | 8))) peg(x0, y1 + s * 0.02);
    if (!(m & (4 | 2))) peg(x1, y1 + s * 0.02);
}

// A dug hole: an earth rim, the far wall in shadow, the floor.
export function plotHole(ctx, x, y, s, m) {
    joinedRect(ctx, x, y, s, m, s * 0.06, s * 0.16);
    ctx.fillStyle = GROUND.holeEdge;
    ctx.fill();
    const r = joinedRect(ctx, x, y, s, m, s * 0.11, s * 0.12);
    ctx.fillStyle = GROUND.hole;
    ctx.fill();
    if (!(m & 1)) fillRound(ctx, r.x0, r.y0, r.x1 - r.x0, s * 0.12, s * 0.06, GROUND.holeDeep);
    for (let i = 0; i < 3; i++) {
        const n = (Math.floor(x) * 7 + Math.floor(y) * 3 + i * 11) % 9;
        disc(ctx, x + s * (0.25 + n * 0.06), y + s * (0.45 + (i % 2) * 0.2), s * 0.018, GROUND.holeEdge);
    }
}

// Wet concrete, freshly poured: grey, with a sheen, and whatever has been pressed into it.
export function plotWet(ctx, x, y, s, m) {
    joinedRect(ctx, x, y, s, m, s * 0.06, s * 0.16);
    ctx.fillStyle = GROUND.holeEdge;
    ctx.fill();
    joinedRect(ctx, x, y, s, m, s * 0.1, s * 0.13);
    ctx.fillStyle = GROUND.wet;
    ctx.fill();
    ellipse(ctx, x + s * 0.4, y + s * 0.38, s * 0.16, s * 0.035, -0.15);
    ctx.fillStyle = GROUND.wetLight;
    ctx.fill();
}

// A foundation, set: a pale slab, with the ends of its steel showing where a wall will go.
export function plotSlab(ctx, x, y, s, m, bars = true) {
    joinedRect(ctx, x, y, s, m, s * 0.06, s * 0.12);
    ctx.fillStyle = GROUND.slabEdge;
    ctx.fill();
    joinedRect(ctx, x, y, s, m, s * 0.09, s * 0.1);
    ctx.fillStyle = GROUND.slab;
    ctx.fill();
    if (!bars) return;
    for (const bx of [0.25, 0.5, 0.75]) {
        line(ctx, x + s * bx, y + s * 0.62, x + s * bx, y + s * 0.5, Math.max(1, s * 0.016), GROUND.rebar);
    }
}

// Prints pressed into wet concrete: a small hand, or a cat's paws walking across.
export function handprint(ctx, x, y, k) {
    ellipse(ctx, x, y, k * 0.035, k * 0.03);
    ctx.fillStyle = 'rgba(120, 112, 104, 0.35)';
    ctx.fill();
    for (let i = 0; i < 5; i++) {
        const a = -2.5 + i * 0.42;
        ellipse(ctx, x + Math.cos(a) * k * 0.05, y + Math.sin(a) * k * 0.045, k * 0.011, k * 0.016, a + 1.57);
        ctx.fill();
    }
}

export function pawprint(ctx, x, y, k) {
    ctx.fillStyle = 'rgba(120, 112, 104, 0.35)';
    ellipse(ctx, x, y, k * 0.014, k * 0.011);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
        disc(
            ctx,
            x + (i - 1.5) * k * 0.011,
            y - k * 0.017 - (i % 3 ? k * 0.004 : 0),
            k * 0.005,
            'rgba(120, 112, 104, 0.35)'
        );
    }
}

//==============================================================================
// A building: a floor at a time on its slab. (x, y) is the tile's corner; `floors` how many;
// `joinW`/`joinE` whether the building carries on into the tile beside. `o`: lit (0..1, windows at
// night), glow (the floor index lit while the building plays, or -1), tree (topped out), cat (in
// a window), plants (in the window boxes), bird (on the roof).

export const FLOOR_H = 0.24;

export function building(ctx, x, y, s, floors, joinW, joinE, o = {}) {
    const base = y + s * 0.84;
    const x0 = joinW ? x : x + s * 0.1;
    const x1 = joinE ? x + s : x + s * 0.9;
    const fh = s * FLOOR_H;
    if (!joinW && !joinE) shadow(ctx, x + s / 2, base, s * 0.44);
    // The foundation's edge, showing at the foot of the walls.
    const kerb = s * 0.03;
    fillRound(
        ctx,
        x0 - (joinW ? 0 : kerb),
        base - kerb,
        x1 - x0 + (joinW ? 0 : kerb) + (joinE ? 0 : kerb),
        kerb * 2.2,
        joinW || joinE ? 0 : kerb,
        GROUND.slabEdge
    );
    for (let i = 0; i < floors; i++) {
        const f = FLOORS[i % FLOORS.length];
        const top = base - (i + 1) * fh;
        ctx.fillStyle = f.wall;
        ctx.fillRect(x0, top, x1 - x0, fh);
        ctx.fillStyle = f.deep;
        ctx.fillRect(x0, top, x1 - x0, s * 0.025);
        if (!joinW) ctx.fillRect(x0, top, s * 0.025, fh);
        if (!joinE) ctx.fillRect(x1 - s * 0.025, top, s * 0.025, fh);
        for (const wx of [0.24, 0.6]) {
            const winX = x + s * wx;
            const winY = top + fh * 0.3;
            fillRound(ctx, winX - s * 0.012, winY - s * 0.012, s * 0.18, fh * 0.56, s * 0.02, '#FBF6EE');
            const lit = o.lit || 0;
            fillRound(ctx, winX, winY, s * 0.156, fh * 0.46, s * 0.015, lit > 0.5 ? SITE.lit : SITE.glass);
            if (lit <= 0.5) {
                ctx.fillStyle = SITE.glassLight;
                ctx.fillRect(winX + s * 0.02, winY + fh * 0.06, s * 0.03, fh * 0.3);
            }
            if (o.plants && i === floors - 1) {
                fillRound(ctx, winX - s * 0.01, winY + fh * 0.46, s * 0.176, s * 0.03, s * 0.01, '#C9A57E');
                for (let k = 0; k < 3; k++)
                    disc(
                        ctx,
                        winX + s * (0.03 + k * 0.05),
                        winY + fh * 0.44,
                        s * 0.018,
                        ['#F2BAC3', '#9CC48A', '#F3DE97'][k]
                    );
            }
        }
        if (o.glow === i) {
            ctx.fillStyle = 'rgba(255, 248, 220, 0.55)';
            ctx.fillRect(x0, top, x1 - x0, fh);
        }
    }
    if (floors > 0) {
        const roof = base - floors * fh;
        fillRound(
            ctx,
            x0 - (joinW ? 0 : s * 0.025),
            roof - s * 0.05,
            x1 - x0 + (joinW ? 0 : s * 0.025) + (joinE ? 0 : s * 0.025),
            s * 0.06,
            joinW || joinE ? 0 : s * 0.02,
            '#C9B79E'
        );
    }
    // The ground floor's door.
    if (floors > 0 && !joinW) {
        fillRound(ctx, x0 + s * 0.06, base - fh * 0.78, s * 0.12, fh * 0.78, s * 0.02, '#B88A64');
    }
}

// A building's windows, lit: drawn over the night, where the building drew them plain.
export function windowsLit(ctx, x, y, s, floors, colour) {
    const base = y + s * 0.84;
    const fh = s * FLOOR_H;
    for (let i = 0; i < floors; i++) {
        const top = base - (i + 1) * fh;
        for (const wx of [0.24, 0.6]) {
            const winX = x + s * wx;
            const winY = top + fh * 0.3;
            fillRound(
                ctx,
                winX - s * 0.02,
                winY - s * 0.02,
                s * 0.196,
                fh * 0.46 + s * 0.04,
                s * 0.03,
                colour(0.25)
            );
            fillRound(ctx, winX, winY, s * 0.156, fh * 0.46, s * 0.015, colour(0.92));
        }
    }
}

// The little tree a building is topped out with: an old builders' custom, a branch on the roof when
// the last floor is on.
export function toppingTree(ctx, x, y, k) {
    fillRound(ctx, x - k * 0.04, y - k * 0.05, k * 0.08, k * 0.05, k * 0.01, '#C9A57E');
    line(ctx, x, y - k * 0.05, x, y - k * 0.12, k * 0.016, '#B58E6A');
    disc(ctx, x, y - k * 0.16, k * 0.06, '#9CC48A');
    disc(ctx, x - k * 0.035, y - k * 0.13, k * 0.04, '#86B474');
    disc(ctx, x + k * 0.03, y - k * 0.2, k * 0.035, '#B9D9A4');
    fillRound(ctx, x + k * 0.035, y - k * 0.23, k * 0.05, k * 0.03, k * 0.008, SITE.accent);
}

//==============================================================================
// Standing pieces. (x, y) is the tile's corner and s its side.

// A heap of sand: `size` 1 to 3.
export function pile(ctx, x, y, s, size = 2, o = {}) {
    const cx = x + s / 2;
    const base = y + s * 0.82;
    const w = s * (0.22 + 0.06 * size);
    const h = s * (0.14 + 0.09 * size);
    shadow(ctx, cx, base + s * 0.01, w * 1.05);
    const mound = (dw, dh, colour) => {
        ctx.beginPath();
        ctx.moveTo(cx - w - dw, base);
        ctx.bezierCurveTo(cx - w * 0.5, base - h * 0.1, cx - w * 0.35, base - h - dh, cx, base - h - dh);
        ctx.bezierCurveTo(cx + w * 0.35, base - h - dh, cx + w * 0.5, base - h * 0.1, cx + w + dw, base);
        ctx.closePath();
        ctx.fillStyle = colour;
        ctx.fill();
    };
    mound(s * 0.01, 0, SITE.sandDeep);
    mound(-s * 0.02, -s * 0.02, SITE.sand);
    ellipse(ctx, cx - w * 0.25, base - h * 0.62, w * 0.18, h * 0.08, -0.5);
    ctx.fillStyle = SITE.sandLight;
    ctx.fill();
    for (let i = 0; i < 5; i++) {
        const n = (i * 37 + size * 11) % 17;
        disc(
            ctx,
            cx - w * 0.6 + (n / 17) * w * 1.2,
            base - h * (0.15 + ((i * 7) % 5) * 0.1),
            s * 0.008,
            SITE.sandDeep
        );
    }
    if (o.worm) worm(ctx, cx + w * 0.3, base - h * 0.3, s * 2.2, o.worm);
}

// A concrete mixer: a cab, and a striped drum that turns, with a chute at the back that pours.
// `o`: drum (radians), pour (0..1, the chute down and concrete running), facing, glow (beacon).
export function mixer(ctx, cx, by, k, o = {}) {
    shadow(ctx, cx, by, k * 0.42);
    mirrored(ctx, cx, o.facing || 1, () => {
        const pour = o.pour || 0;
        // The chute, at the back.
        ctx.save();
        ctx.translate(cx - k * 0.33, by - k * 0.3);
        ctx.rotate(0.2 + pour * 0.6);
        fillRound(ctx, -k * 0.16, -k * 0.025, k * 0.16, k * 0.05, k * 0.02, SITE.steelDeep);
        ctx.restore();
        if (pour > 0.3) {
            const a = 0.2 + pour * 0.6;
            const ex = cx - k * 0.33 - Math.cos(a) * k * 0.16;
            const ey = by - k * 0.3 - Math.sin(-a) * k * 0.16;
            line(ctx, ex, ey, ex - k * 0.02, by + k * 0.02, k * 0.04 * pour, GROUND.wet);
        }
        // Chassis and wheels.
        fillRound(ctx, cx - k * 0.36, by - k * 0.2, k * 0.72, k * 0.08, k * 0.03, SITE.steelDeep);
        // The drum: tilted up towards the back, its stripes turning.
        ctx.save();
        ctx.translate(cx - k * 0.06, by - k * 0.34);
        ctx.rotate(-0.22);
        ellipse(ctx, 0, 0, k * 0.27, k * 0.15);
        ctx.fillStyle = SITE.accent;
        ctx.fill();
        ctx.save();
        ellipse(ctx, 0, 0, k * 0.27, k * 0.15);
        ctx.clip();
        const turn = o.drum || 0;
        ctx.strokeStyle = '#FBF6EE';
        ctx.lineWidth = k * 0.045;
        for (let i = -3; i <= 3; i++) {
            const off = ((i + (turn / TAU) * 2) % 2) * k * 0.14;
            ctx.beginPath();
            ctx.moveTo(-k * 0.3 + off, k * 0.18);
            ctx.lineTo(-k * 0.16 + off, -k * 0.18);
            ctx.stroke();
        }
        ctx.restore();
        ellipse(ctx, -k * 0.05, -k * 0.07, k * 0.13, k * 0.03, 0);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fill();
        disc(ctx, -k * 0.27, 0, k * 0.05, SITE.accentDeep);
        ctx.restore();
        // The cab, at the front.
        fillRound(ctx, cx + k * 0.18, by - k * 0.4, k * 0.2, k * 0.26, k * 0.05, SITE.body);
        fillRound(ctx, cx + k * 0.24, by - k * 0.36, k * 0.11, k * 0.1, k * 0.025, SITE.glass);
        worker(ctx, cx + k * 0.29, by - k * 0.27, k * 0.75, { seated: true });
        beacon(ctx, cx + k * 0.27, by - k * 0.45, k * 0.03, o.glow || 0);
        wheel(ctx, cx - k * 0.22, by - k * 0.07, k * 0.07, o.roll || 0);
        wheel(ctx, cx - k * 0.04, by - k * 0.07, k * 0.07, o.roll || 0);
        wheel(ctx, cx + k * 0.26, by - k * 0.07, k * 0.07, o.roll || 0);
    });
}

// A tower crane for a tile: a lattice mast, a cab under the jib, and a jib that swings over the tile
// beside it. `o`: swing (-1..1: where the jib points, foreshortened as it turns), trolley (0..1
// along the jib), drop (how far the hook hangs, in tiles), mast (how far the jib stands above the
// tile, in tiles; it climbs as a building beside it rises), load (a floor's colours, hanging from
// the hook, or null), glow (beacon), tree (a little tree on the hook, for topping out).
export function crane(ctx, x, y, s, o = {}) {
    const mx = x + s * 0.5;
    const base = y + s * 0.84;
    const top = y - s * (o.mast || 0.62);
    shadow(ctx, mx, base, s * 0.2);
    // The base and the mast.
    fillRound(ctx, mx - s * 0.13, base - s * 0.06, s * 0.26, s * 0.07, s * 0.02, SITE.steelDeep);
    const mw = s * 0.07;
    line(ctx, mx - mw, base - s * 0.04, mx - mw, top, s * 0.018, SITE.bodyDeep);
    line(ctx, mx + mw, base - s * 0.04, mx + mw, top, s * 0.018, SITE.bodyDeep);
    ctx.beginPath();
    const steps = Math.max(8, Math.round(((base - top) / s) * 5.4));
    for (let i = 0; i <= steps; i++) {
        const yy = base - s * 0.04 - ((base - s * 0.04 - top) * i) / steps;
        ctx.lineTo(i % 2 ? mx + mw : mx - mw, yy);
    }
    ctx.lineWidth = s * 0.012;
    ctx.strokeStyle = SITE.body;
    ctx.stroke();
    // The jib and its counterweight, turning about the mast.
    const swing = o.swing === undefined ? 1 : o.swing;
    const reach = s * 1.05;
    const jy = top - s * 0.02;
    const end = mx + swing * reach;
    const back = mx - swing * s * 0.32;
    line(ctx, back, jy, end, jy, s * 0.04, SITE.body);
    line(ctx, mx, top - s * 0.14, end, jy - s * 0.005, s * 0.008, SITE.bodyDeep);
    line(ctx, mx, top - s * 0.14, back, jy, s * 0.008, SITE.bodyDeep);
    line(ctx, mx, top - s * 0.14, mx, jy, s * 0.018, SITE.bodyDeep);
    fillRound(ctx, back - s * 0.06, jy - s * 0.01, s * 0.12, s * 0.09, s * 0.015, SITE.steel);
    beacon(ctx, mx, top - s * 0.17, s * 0.022, o.glow || 0);
    // The cab, on the mast just under the jib.
    fillRound(ctx, mx - s * 0.02, jy + s * 0.02, s * 0.15, s * 0.12, s * 0.03, SITE.body);
    fillRound(ctx, mx + s * 0.03, jy + s * 0.04, s * 0.08, s * 0.06, s * 0.015, SITE.glass);
    // The trolley, the cable and the hook.
    const tx = mx + swing * reach * (0.25 + 0.7 * (o.trolley === undefined ? 0.8 : o.trolley));
    fillRound(ctx, tx - s * 0.04, jy + s * 0.015, s * 0.08, s * 0.03, s * 0.01, SITE.steelDeep);
    const hy = jy + s * 0.05 + s * (o.drop === undefined ? 0.4 : o.drop);
    line(ctx, tx, jy + s * 0.04, tx, hy, Math.max(1, s * 0.007), INK);
    ctx.beginPath();
    ctx.arc(tx, hy + s * 0.025, s * 0.02, -0.3, Math.PI + 0.3, false);
    ctx.lineWidth = s * 0.012;
    ctx.strokeStyle = SITE.steelDeep;
    ctx.stroke();
    if (o.load) {
        fillRound(ctx, tx - s * 0.3, hy + s * 0.04, s * 0.6, s * FLOOR_H * 0.9, s * 0.02, o.load.wall);
        ctx.fillStyle = o.load.deep;
        ctx.fillRect(tx - s * 0.3, hy + s * 0.04, s * 0.6, s * 0.02);
        for (const wx of [-0.18, 0.08])
            fillRound(ctx, tx + s * wx, hy + s * 0.1, s * 0.12, s * 0.09, s * 0.015, SITE.glass);
    }
    if (o.tree) toppingTree(ctx, tx, hy + s * 0.27, s * 0.9);
}

// A road roller: a big smooth drum in front, a cab, and wheels behind. `o`: roll (radians), facing.
export function roller(ctx, cx, by, k, o = {}) {
    shadow(ctx, cx, by, k * 0.4);
    mirrored(ctx, cx, o.facing || 1, () => {
        const turn = o.roll || 0;
        fillRound(ctx, cx - k * 0.3, by - k * 0.26, k * 0.44, k * 0.15, k * 0.05, SITE.body);
        fillRound(ctx, cx - k * 0.24, by - k * 0.5, k * 0.2, k * 0.25, k * 0.04, SITE.body);
        fillRound(ctx, cx - k * 0.2, by - k * 0.46, k * 0.12, k * 0.1, k * 0.02, SITE.glass);
        fillRound(ctx, cx - k * 0.27, by - k * 0.53, k * 0.26, k * 0.04, k * 0.02, SITE.bodyDeep);
        worker(ctx, cx - k * 0.14, by - k * 0.36, k * 0.75, { seated: true });
        beacon(ctx, cx - k * 0.14, by - k * 0.57, k * 0.03, o.glow || 0);
        wheel(ctx, cx - k * 0.2, by - k * 0.08, k * 0.08, turn);
        // The drum, its ridges turning.
        const dx = cx + k * 0.2;
        const dy = by - k * 0.14;
        const r = k * 0.14;
        line(ctx, cx + k * 0.08, by - k * 0.22, dx, dy, k * 0.04, SITE.bodyDeep);
        disc(ctx, dx, dy, r, SITE.steel);
        disc(ctx, dx, dy, r * 0.82, SITE.steelLight);
        for (let i = 0; i < 6; i++) {
            const a = turn + (i * TAU) / 6;
            line(
                ctx,
                dx + Math.cos(a) * r * 0.45,
                dy + Math.sin(a) * r * 0.45,
                dx + Math.cos(a) * r * 0.78,
                dy + Math.sin(a) * r * 0.78,
                r * 0.09,
                SITE.steel
            );
        }
        disc(ctx, dx, dy, r * 0.25, SITE.body);
    });
}

// A traffic cone, soft orange with white bands, and the striped tape to any cone joined beside it.
// `m` the sides it joins cones; `o.wobble` (radians) tips it.
export function cone(ctx, x, y, s, m, o = {}) {
    const cx = x + s / 2;
    const base = y + s * 0.8;
    const tipY = base - s * 0.34;
    const tape = (x1, y1) => {
        const width = s * 0.04;
        ctx.save();
        ctx.translate(cx, tipY + s * 0.1);
        const len = Math.sqrt((x1 - cx) * (x1 - cx) + (y1 - (tipY + s * 0.1)) * (y1 - (tipY + s * 0.1)));
        ctx.rotate(Math.atan2(y1 - (tipY + s * 0.1), x1 - cx));
        stripes(ctx, 0, -width / 2, len, width, '#FBF6EE', SITE.accent, width * 0.9);
        ctx.restore();
    };
    if (m & 2) tape(cx + s, tipY + s * 0.1);
    if (m & 4) tape(cx, tipY + s * 1.1);
    shadow(ctx, cx, base, s * 0.16);
    ctx.save();
    ctx.translate(cx, base);
    ctx.rotate(o.wobble || 0);
    fillRound(ctx, -s * 0.13, -s * 0.035, s * 0.26, s * 0.045, s * 0.015, SITE.accentDeep);
    poly(
        ctx,
        [
            [-s * 0.09, -s * 0.03],
            [s * 0.09, -s * 0.03],
            [s * 0.022, -s * 0.34],
            [-s * 0.022, -s * 0.34],
        ],
        SITE.accent
    );
    poly(
        ctx,
        [
            [-s * 0.065, -s * 0.12],
            [s * 0.065, -s * 0.12],
            [s * 0.052, -s * 0.17],
            [-s * 0.052, -s * 0.17],
        ],
        '#FBF6EE'
    );
    poly(
        ctx,
        [
            [-s * 0.042, -s * 0.23],
            [s * 0.042, -s * 0.23],
            [s * 0.032, -s * 0.27],
            [-s * 0.032, -s * 0.27],
        ],
        '#FBF6EE'
    );
    ctx.restore();
}

// The site hut, where the foreman keeps the whistle: a cabin on blocks, a window and a door.
// `o`: door (0..1 open), lit (0..1, the window at night), radio (a radio on the sill).
export function hut(ctx, x, y, s, o = {}) {
    const base = y + s * 0.84;
    shadow(ctx, x + s / 2, base, s * 0.4);
    for (const bx of [0.16, 0.74])
        fillRound(ctx, x + s * bx, base - s * 0.05, s * 0.1, s * 0.05, s * 0.01, SITE.concreteDeep);
    fillRound(ctx, x + s * 0.08, base - s * 0.42, s * 0.84, s * 0.38, s * 0.05, '#BFD7CC');
    fillRound(ctx, x + s * 0.06, base - s * 0.46, s * 0.88, s * 0.06, s * 0.03, '#9FC2B3');
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + s * (0.12 + i * 0.2), base - s * 0.38, s * 0.012, s * 0.3);
    // The window.
    const lit = o.lit || 0;
    fillRound(ctx, x + s * 0.46, base - s * 0.34, s * 0.3, s * 0.16, s * 0.02, '#FBF6EE');
    fillRound(
        ctx,
        x + s * 0.48,
        base - s * 0.32,
        s * 0.26,
        s * 0.12,
        s * 0.015,
        lit > 0.5 ? SITE.lit : SITE.glass
    );
    if (o.radio) {
        fillRound(ctx, x + s * 0.52, base - s * 0.25, s * 0.09, s * 0.05, s * 0.01, SITE.accentDeep);
        disc(ctx, x + s * 0.545, base - s * 0.225, s * 0.012, '#FBF6EE');
        line(ctx, x + s * 0.59, base - s * 0.25, x + s * 0.61, base - s * 0.29, Math.max(1, s * 0.006), INK);
    }
    // The door, opening on the dark inside.
    const dx = x + s * 0.16;
    const dy = base - s * 0.36;
    fillRound(ctx, dx, dy, s * 0.16, s * 0.31, s * 0.02, '#5E4A40');
    const open = clamp(o.door || 0, 0, 1);
    fillRound(ctx, dx, dy, s * 0.16 * (1 - open * 0.8), s * 0.31, s * 0.02, '#88A6C8');
    if (open < 0.5) disc(ctx, dx + s * 0.13 * (1 - open), dy + s * 0.17, s * 0.012, SITE.hat);
    fillRound(ctx, dx - s * 0.02, base - s * 0.05, s * 0.2, s * 0.04, s * 0.01, SITE.concreteDeep);
}

// A work lamp on a tripod. `o.on` (0..1) lights it.
export function lamp(ctx, x, y, s, o = {}) {
    const cx = x + s / 2;
    const base = y + s * 0.84;
    const on = o.on || 0;
    shadow(ctx, cx, base, s * 0.16);
    line(ctx, cx, base - s * 0.24, cx - s * 0.12, base, s * 0.016, SITE.steelDeep);
    line(ctx, cx, base - s * 0.24, cx + s * 0.12, base, s * 0.016, SITE.steelDeep);
    line(ctx, cx, base - s * 0.24, cx, base - s * 0.02, s * 0.014, SITE.steelDeep);
    line(ctx, cx, base - s * 0.24, cx, base - s * 0.66, s * 0.02, SITE.steel);
    if (on > 0) {
        disc(ctx, cx, base - s * 0.7, s * (0.18 + 0.06 * on), `rgba(255, 226, 154, ${0.16 * on})`);
        disc(ctx, cx, base - s * 0.7, s * 0.11, `rgba(255, 226, 154, ${0.28 * on})`);
    }
    fillRound(ctx, cx - s * 0.1, base - s * 0.76, s * 0.2, s * 0.13, s * 0.03, SITE.body);
    fillRound(
        ctx,
        cx - s * 0.075,
        base - s * 0.74,
        s * 0.15,
        s * 0.09,
        s * 0.02,
        on > 0.5 ? SITE.lit : SITE.glassLight
    );
}

//==============================================================================
// The small things. Centred at (x, y), sized by `k`.

// A pigeon, pecking: `peck` 0..1 dips its head.
export function pigeon(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        const peck = o.peck || 0;
        line(ctx, x - k * 0.01, y - k * 0.02, x - k * 0.015, y, k * 0.008, SITE.accentDeep);
        line(ctx, x + k * 0.012, y - k * 0.02, x + k * 0.012, y, k * 0.008, SITE.accentDeep);
        ellipse(ctx, x, y - k * 0.04, k * 0.05, k * 0.03, -0.1);
        ctx.fillStyle = '#B7B3C9';
        ctx.fill();
        ellipse(ctx, x - k * 0.015, y - k * 0.045, k * 0.03, k * 0.018, -0.2);
        ctx.fillStyle = '#9F9AB5';
        ctx.fill();
        const hx = x + k * 0.04;
        const hy = y - k * 0.065 + peck * k * 0.045;
        disc(ctx, hx, hy, k * 0.02, '#A9A4BF');
        disc(ctx, hx + k * 0.008, hy - k * 0.004, k * 0.004, INK);
        poly(
            ctx,
            [
                [hx + k * 0.016, hy - k * 0.002],
                [hx + k * 0.032, hy + k * 0.004],
                [hx + k * 0.016, hy + k * 0.008],
            ],
            '#F4C8A2'
        );
    });
}

// A worm, coming out of the ground: `out` 0..1.
export function worm(ctx, x, y, k, out = 1) {
    const h = k * 0.07 * clamp(out, 0, 1);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + k * 0.03, y - h * 0.5, x, y - h);
    ctx.lineWidth = k * 0.018;
    ctx.strokeStyle = '#E9A7AF';
    ctx.lineCap = 'round';
    ctx.stroke();
    if (out > 0.6) disc(ctx, x + k * 0.004, y - h - k * 0.002, k * 0.003, INK);
}

// A hedgehog, shuffling: `step` (radians) moves its feet.
export function hedgehog(ctx, x, y, k, o = {}) {
    mirrored(ctx, x, o.facing || 1, () => {
        const step = Math.sin(o.step || 0) * k * 0.006;
        disc(ctx, x - k * 0.02 + step, y - k * 0.004, k * 0.008, '#8C6E58');
        disc(ctx, x + k * 0.025 - step, y - k * 0.004, k * 0.008, '#8C6E58');
        ctx.beginPath();
        ctx.arc(x, y - k * 0.01, k * 0.045, Math.PI, 0);
        ctx.closePath();
        ctx.fillStyle = '#A4805F';
        ctx.fill();
        for (let i = 0; i < 7; i++) {
            const a = Math.PI + 0.25 + i * 0.4;
            line(
                ctx,
                x + Math.cos(a) * k * 0.035,
                y - k * 0.01 + Math.sin(a) * k * 0.035,
                x + Math.cos(a) * k * 0.055,
                y - k * 0.01 + Math.sin(a) * k * 0.055,
                k * 0.008,
                '#8C6E58'
            );
        }
        ellipse(ctx, x + k * 0.045, y - k * 0.018, k * 0.025, k * 0.017, 0.2);
        ctx.fillStyle = '#E5CBA5';
        ctx.fill();
        disc(ctx, x + k * 0.068, y - k * 0.016, k * 0.005, INK);
        disc(ctx, x + k * 0.05, y - k * 0.024, k * 0.004, INK);
    });
}

// A moth: two pale wings, flapping.
export function moth(ctx, x, y, k, flap = 0) {
    const open = 0.4 + 0.6 * Math.abs(Math.sin(flap));
    for (const side of [-1, 1]) {
        ellipse(ctx, x + side * k * 0.012 * open, y, k * 0.014 * open, k * 0.01, side * 0.4);
        ctx.fillStyle = 'rgba(251, 246, 238, 0.9)';
        ctx.fill();
    }
}

// A ball, found under the sand.
export function ball(ctx, x, y, k, colour = '#ABCDEA') {
    disc(ctx, x, y, k * 0.04, colour);
    ctx.beginPath();
    ctx.arc(x, y, k * 0.04, -0.6, 0.6);
    ctx.lineWidth = k * 0.012;
    ctx.strokeStyle = '#FBF6EE';
    ctx.stroke();
    ellipse(ctx, x - k * 0.012, y - k * 0.015, k * 0.012, k * 0.008, -0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
}

// A dinosaur's bone, glinting in the bottom of a hole.
export function bone(ctx, x, y, k) {
    line(ctx, x - k * 0.05, y, x + k * 0.05, y, k * 0.022, '#F8F0DF');
    for (const ex of [-0.055, 0.055]) {
        disc(ctx, x + ex * k, y - k * 0.012, k * 0.017, '#F8F0DF');
        disc(ctx, x + ex * k, y + k * 0.012, k * 0.017, '#F8F0DF');
    }
}
