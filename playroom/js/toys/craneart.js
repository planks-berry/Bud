// The crane's pictures: the tower crane, the parts it lifts, and the small lives that move into
// whatever gets built.
//
// The crane is drawn in the scene's own coordinates, because it is laid out once for the screen
// and stands still. The parts are drawn in their own frame, top-left at (0, 0), with `g` (the side
// of the half-block grid the parts snap to) as their unit, so that each can be drawn once into a
// sprite and copied from there. The colours are the site's (machines.js) and, for the parts, the
// colour tower's, which are also the easel's: a red part is a C wherever it is.

import { fillRound, disc, ellipse, circle, roundRect } from '../draw.js';
import { TAU, shade, hexToRgb, rgbString, mixRgb } from '../util.js';
import { SITE, INK, line, poly, beacon, worker, mirrored, wheel } from './machines.js';

//==============================================================================
// The tower crane

// The crane's paint, and the other crane's, the one over the pile that brings new parts: told apart
// at a glance, as two cranes on one site are.
const CRANE = { body: SITE.body, deep: SITE.bodyDeep, hook: SITE.accent, hookDeep: SITE.accentDeep };
export const FAR = { body: '#EBB0A8', deep: '#D5928B', hook: '#A9C3D8', hookDeep: '#8EA9C0' };

// A lattice mast from the ground up to the jib: two rails braced in a zigzag, on a footing.
export function mast(ctx, x, top, bottom, w) {
    fillRound(ctx, x - w * 1.15, bottom - w * 0.38, w * 2.3, w * 0.5, w * 0.12, SITE.concreteDeep);
    fillRound(ctx, x - w * 1.05, bottom - w * 0.46, w * 2.1, w * 0.4, w * 0.12, SITE.concrete);
    const left = x - w / 2;
    const right = x + w / 2;
    const foot = bottom - w * 0.42;
    ctx.beginPath();
    let y = foot;
    let side = 0;
    ctx.moveTo(left, y);
    while (y > top + 1) {
        y = Math.max(top, y - w * 1.05);
        side = 1 - side;
        ctx.lineTo(side ? right : left, y);
    }
    ctx.lineWidth = w * 0.1;
    ctx.strokeStyle = SITE.bodyDeep;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    for (let ry = foot - w * 2.1; ry > top + w * 0.5; ry -= w * 2.1)
        line(ctx, left, ry, right, ry, w * 0.08, SITE.bodyDeep);
    const rail = w * 0.18;
    fillRound(ctx, left - rail / 2, top, rail, foot - top + rail, rail / 2, SITE.body);
    fillRound(ctx, right - rail / 2, top, rail, foot - top + rail, rail / 2, SITE.body);
    // A ladder of light down one rail, the way sun catches a painted edge.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(left - rail * 0.25, top, rail * 0.22, foot - top);
}

// A lattice girder lying between x0 and x1, its bottom chord at y and its top chord `d` above, in
// the crane's colours or `paint` ({ body, deep }).
export function girder(ctx, x0, x1, y, d, paint = CRANE) {
    const a = Math.min(x0, x1);
    const b = Math.max(x0, x1);
    const top = y - d;
    ctx.beginPath();
    ctx.moveTo(a, y);
    let x = a;
    let up = true;
    while (x < b - 1) {
        x = Math.min(b, x + d * 1.15);
        ctx.lineTo(x, up ? top : y);
        up = !up;
    }
    ctx.lineWidth = d * 0.13;
    ctx.strokeStyle = paint.deep;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    fillRound(ctx, a, top - d * 0.1, b - a, d * 0.22, d * 0.1, paint.body);
    fillRound(ctx, a, y - d * 0.12, b - a, d * 0.26, d * 0.12, paint.body);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(a + d * 0.1, top - d * 0.08, b - a - d * 0.2, d * 0.06);
}

// The crane above the ground, all but the trolley and the hook: mast, jib, counter-jib and its
// weights, the apex with its ties, the winch, and the cab. `c` is the scene's layout of it.
export function crane(ctx, c) {
    const { mastX, mastW, jibY, jibD, jibEnd, counterEnd, apexY, ground } = c;
    mast(ctx, mastX, jibY - jibD, ground, mastW);

    // The ties from the apex down to the jib and the counter-jib, behind everything else.
    const tie = Math.max(1, mastW * 0.07);
    line(ctx, mastX, apexY, mastX + (jibEnd - mastX) * 0.55, jibY - jibD, tie, SITE.steelDeep);
    line(ctx, mastX, apexY, jibEnd - jibD * 0.6, jibY - jibD, tie, SITE.steelDeep);
    line(ctx, mastX, apexY, counterEnd + jibD * 0.6, jibY - jibD, tie, SITE.steelDeep);

    girder(ctx, mastX, jibEnd, jibY, jibD);
    girder(ctx, counterEnd, mastX, jibY, jibD);
    // The jib's tip, and the counterweights hanging under the end of the counter-jib.
    fillRound(
        ctx,
        jibEnd - jibD * 0.3,
        jibY - jibD * 1.15,
        jibD * 0.5,
        jibD * 1.4,
        jibD * 0.2,
        SITE.bodyDeep
    );
    const cw = Math.min(jibD * 2.4, mastX - counterEnd - mastW);
    for (let i = 0; i < 3; i++) {
        const y = jibY + jibD * 0.1 + i * jibD * 0.62;
        fillRound(
            ctx,
            counterEnd + jibD * 0.2,
            y + 3,
            cw,
            jibD * 0.56,
            jibD * 0.12,
            'rgba(112, 84, 58, 0.12)'
        );
        fillRound(
            ctx,
            counterEnd + jibD * 0.2,
            y,
            cw,
            jibD * 0.56,
            jibD * 0.12,
            i % 2 ? SITE.concreteDeep : SITE.concrete
        );
    }
    // The winch: a drum wound with cable, in a little house on the counter-jib.
    const wx = counterEnd + (mastX - counterEnd) * 0.62;
    fillRound(ctx, wx - jibD * 0.75, jibY - jibD * 1.95, jibD * 1.5, jibD * 0.95, jibD * 0.18, SITE.accent);
    disc(ctx, wx, jibY - jibD * 1.47, jibD * 0.34, SITE.steel);
    for (let i = -1; i <= 1; i++)
        line(
            ctx,
            wx - jibD * 0.24,
            jibY - jibD * (1.47 + i * 0.13),
            wx + jibD * 0.24,
            jibY - jibD * (1.47 + i * 0.13),
            tie,
            SITE.steelDeep
        );

    // The apex: an A-frame over the mast.
    const half = mastW * 0.5;
    poly(
        ctx,
        [
            [mastX - half, jibY - jibD],
            [mastX - half * 0.3, apexY],
            [mastX + half * 0.3, apexY],
            [mastX + half, jibY - jibD],
            [mastX + half * 0.62, jibY - jibD],
            [mastX, apexY + mastW * 0.5],
            [mastX - half * 0.62, jibY - jibD],
        ],
        SITE.body
    );
    fillRound(
        ctx,
        mastX - half * 0.55,
        apexY - mastW * 0.12,
        half * 1.1,
        mastW * 0.28,
        mastW * 0.1,
        SITE.bodyDeep
    );
}

// The cab, hung beside the top of the mast, with its driver at the window. `lit` 0..1 at night.
export function cab(ctx, x, y, w, h, o = {}) {
    fillRound(ctx, x + 3, y + 5, w, h, h * 0.18, 'rgba(112, 84, 58, 0.14)');
    fillRound(ctx, x, y, w, h, h * 0.18, SITE.body);
    const gx = x + w * 0.12;
    const gy = y + h * 0.14;
    const gw = w * 0.76;
    const gh = h * 0.56;
    fillRound(ctx, gx, gy, gw, gh, h * 0.1, SITE.glass);
    const lit = o.lit || 0;
    if (lit > 0) fillRound(ctx, gx, gy, gw, gh, h * 0.1, `rgba(255, 226, 154, ${0.85 * lit})`);
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx, gy, gw, gh);
    ctx.clip();
    worker(ctx, gx + gw * 0.5, gy + gh * 1.02, h * 4.2, { seated: true, wave: o.wave });
    ctx.restore();
    poly(
        ctx,
        [
            [gx + gw * 0.62, gy],
            [gx + gw * 0.8, gy],
            [gx + gw * 0.5, gy + gh],
            [gx + gw * 0.32, gy + gh],
        ],
        'rgba(255,255,255,0.28)'
    );
    fillRound(ctx, x + w * 0.06, y + h * 0.78, w * 0.88, h * 0.12, h * 0.06, SITE.bodyDeep);
}

// The beacon on the apex, which glows at night.
export function apexLight(ctx, x, y, r, glow) {
    beacon(ctx, x, y, r, glow);
}

// The trolley that runs along the jib, its wheels on the bottom chord at `y`.
export function trolley(ctx, x, y, s, paint = CRANE) {
    disc(ctx, x - s * 0.32, y - s * 0.04, s * 0.14, SITE.steelDeep);
    disc(ctx, x + s * 0.32, y - s * 0.04, s * 0.14, SITE.steelDeep);
    fillRound(ctx, x - s * 0.5, y + s * 0.04, s, s * 0.34, s * 0.1, paint.hookDeep);
    fillRound(ctx, x - s * 0.5, y + s * 0.04, s, s * 0.12, s * 0.06, paint.hook);
    disc(ctx, x, y + s * 0.42, s * 0.16, SITE.steel);
    disc(ctx, x, y + s * 0.42, s * 0.06, SITE.steelDeep);
}

// The cable from the trolley's pulley down to the hook block: two falls of rope, as a real crane
// is reeved, so it reads as a cable and not a line.
export function cable(ctx, x0, y0, x1, y1, s) {
    const gap = s * 0.07;
    line(ctx, x0 - gap, y0, x1 - gap, y1, Math.max(1, s * 0.035), SITE.steelDeep);
    line(ctx, x0 + gap, y0, x1 + gap, y1, Math.max(1, s * 0.035), SITE.steelDeep);
}

// The hook block, hanging from the cable at (x, y) and turned by `angle` as it swings. Its hook's
// tip, where a load hangs, is `hookDrop(s)` below.
export function hookBlock(ctx, x, y, s, angle = 0, paint = CRANE) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    fillRound(ctx, -s * 0.34 + 2, 4, s * 0.68, s * 0.5, s * 0.14, 'rgba(112, 84, 58, 0.14)');
    fillRound(ctx, -s * 0.34, 0, s * 0.68, s * 0.5, s * 0.14, paint.hook);
    fillRound(ctx, -s * 0.34, s * 0.36, s * 0.68, s * 0.14, s * 0.07, paint.hookDeep);
    disc(ctx, 0, s * 0.2, s * 0.14, SITE.steelLight);
    disc(ctx, 0, s * 0.2, s * 0.05, SITE.steelDeep);
    line(ctx, 0, s * 0.5, 0, s * 0.62, s * 0.08, SITE.steelDeep);
    ctx.beginPath();
    ctx.arc(-s * 0.02, s * 0.74, s * 0.12, -Math.PI * 0.5, Math.PI * 0.9);
    ctx.lineWidth = s * 0.08;
    ctx.strokeStyle = SITE.steelDeep;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
}

export function hookDrop(s) {
    return s * 0.86;
}

// The slings from the hook's tip down to the two lifting points of a load.
export function slings(ctx, x, y, ax, ay, bx, by, s) {
    line(ctx, x, y, ax, ay, Math.max(1, s * 0.03), SITE.steelDeep);
    line(ctx, x, y, bx, by, Math.max(1, s * 0.03), SITE.steelDeep);
}

//==============================================================================
// The trucks that come to be loaded

// A flatbed truck's proportions, in half-blocks of the grid: how high its deck stands, how long its
// cab is (with the guard in front of the deck), and its wheels.
export const LORRY = { deckH: 1.05, cab: 2.4, wheelR: 0.42 };

// A flatbed truck painted `colour`, facing right, its wheels on the ground at `by` and the back of
// its deck at x: the deck, `o.deck` half-blocks long, a guard, and the cab with its driver. `g` is
// the grid's half-block. Also: `roll` the wheels' turn, `lift` the body riding up on its springs
// (pixels), `beacon` 0..1, `wave` the driver's arm.
export function lorry(ctx, x, by, g, colour, o = {}) {
    const D = o.deck * g;
    const lift = o.lift || 0;
    const deep = shade(colour, -0.14);
    const light = shade(colour, 0.1);
    const r = LORRY.wheelR * g;
    const top = by - LORRY.deckH * g - lift;
    const cx0 = x + D + 0.22 * g;
    const cx1 = x + D + LORRY.cab * g - 0.08 * g;
    const roof = by - 2.45 * g - lift;
    const sill = by - 0.62 * g - lift;
    const length = D + LORRY.cab * g;
    ellipse(ctx, x + length / 2, by, length * 0.52, g * 0.2);
    ctx.fillStyle = 'rgba(112, 84, 58, 0.13)';
    ctx.fill();

    // Under it all, the chassis; then the wheels, the deck over the back ones.
    fillRound(ctx, x + 0.2 * g, top + 0.2 * g, length - 0.4 * g, 0.26 * g, 0.08 * g, SITE.steelDeep);
    const front = cx0 + (cx1 - cx0) * 0.5;
    for (const wx of [x + D * 0.24, x + D * 0.24 + r * 2.15, front]) wheel(ctx, wx, by - r, r, o.roll || 0);

    // The deck: a pale floor seen edge on, over a side rail in the truck's colour.
    fillRound(ctx, x, top + 0.08 * g, D, 0.3 * g, 0.08 * g, colour);
    fillRound(ctx, x, top + 0.3 * g, D, 0.08 * g, 0.04 * g, deep);
    fillRound(ctx, x - 0.04 * g, top - 0.04 * g, D + 0.04 * g, 0.14 * g, 0.05 * g, SITE.steelLight);
    for (let i = 1; i < o.deck; i++) {
        fillRound(ctx, x + i * g - 0.03 * g, top + 0.13 * g, 0.06 * g, 0.16 * g, 0.02 * g, deep);
    }
    // The guard between the deck and the cab.
    fillRound(ctx, x + D, top - 1.05 * g, 0.16 * g, 1.1 * g, 0.05 * g, SITE.steelDeep);
    fillRound(ctx, x + D - 0.04 * g, top - 1.1 * g, 0.24 * g, 0.12 * g, 0.05 * g, SITE.steel);

    // The cab, its mudguard over the front wheel, its window with the driver, and its lights.
    fillRound(ctx, cx0 + 3, roof + 5, cx1 - cx0, sill - roof, g * 0.3, 'rgba(112, 84, 58, 0.14)');
    fillRound(ctx, cx0, roof, cx1 - cx0, sill - roof, g * 0.3, colour);
    fillRound(ctx, cx0, sill - 0.3 * g, cx1 - cx0, 0.3 * g, g * 0.12, deep);
    ctx.beginPath();
    ctx.arc(front, by - r, r * 1.28, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = deep;
    ctx.fill();
    wheel(ctx, front, by - r, r, o.roll || 0);
    const wx = cx0 + 0.2 * g;
    const wy = roof + 0.2 * g;
    const ww = cx1 - cx0 - 0.62 * g;
    const wh = 0.78 * g;
    fillRound(ctx, wx, wy, ww, wh, g * 0.12, SITE.glass);
    ctx.save();
    ctx.beginPath();
    ctx.rect(wx, wy, ww, wh);
    ctx.clip();
    worker(ctx, wx + ww * 0.5, wy + wh * 1.04, wh * 4.4, { seated: true, wave: o.wave });
    ctx.restore();
    poly(
        ctx,
        [
            [wx + ww * 0.62, wy],
            [wx + ww * 0.8, wy],
            [wx + ww * 0.5, wy + wh],
            [wx + ww * 0.32, wy + wh],
        ],
        'rgba(255,255,255,0.28)'
    );
    // The windscreen, seen side on at the front, then a handle, the bumper and a headlight.
    fillRound(ctx, cx1 - 0.3 * g, wy, 0.2 * g, wh, g * 0.08, SITE.glassLight);
    fillRound(ctx, cx0 + 0.24 * g, wy + wh + 0.2 * g, 0.3 * g, 0.08 * g, 0.04 * g, deep);
    fillRound(ctx, cx0 + 0.06 * g, roof + 0.06 * g, cx1 - cx0 - 0.4 * g, 0.08 * g, 0.04 * g, light);
    fillRound(ctx, cx1 - 0.06 * g, sill - 0.38 * g, 0.24 * g, 0.36 * g, 0.07 * g, SITE.steelDeep);
    fillRound(ctx, cx1 - 0.04 * g, sill - 0.8 * g, 0.14 * g, 0.24 * g, 0.05 * g, SITE.lit);
    beacon(ctx, cx0 + (cx1 - cx0) * 0.4, roof - 0.14 * g, 0.15 * g, o.beacon || 0);
}

// Where a truck's headlight and cab window are, for lighting them at night.
export function lorryLights(x, by, g, o = {}) {
    const D = o.deck * g;
    const lift = o.lift || 0;
    const cx0 = x + D + 0.22 * g;
    const cx1 = x + D + LORRY.cab * g - 0.08 * g;
    const roof = by - 2.45 * g - lift;
    const sill = by - 0.62 * g - lift;
    return {
        lamp: { x: cx1 + 0.03 * g, y: sill - 0.68 * g },
        window: { x: cx0 + 0.2 * g, y: roof + 0.2 * g, w: cx1 - cx0 - 0.62 * g, h: 0.78 * g },
    };
}

//==============================================================================
// The parts. Each fits the w x h box at (0, 0) exactly, so what is seen is what stacks.

export function part(ctx, kind, w, h, g, colour) {
    if (kind === 'block') block(ctx, w, h, g, colour);
    else if (kind === 'window') windowPanel(ctx, w, h, g, colour);
    else if (kind === 'beam') beam(ctx, w, h, g, colour);
    else if (kind === 'arch') arch(ctx, w, h, g, colour);
    else if (kind === 'roof') roof(ctx, w, h, g, colour);
    else if (kind === 'ball') wreckingBall(ctx, w, h, g);
}

// A block of two courses of bricks, faintly coursed so it reads as building, not as a toy cube.
function block(ctx, w, h, g, colour) {
    const r = g * 0.14;
    fillRound(ctx, 0, 0, w, h, r, colour);
    fillRound(ctx, 0, h * 0.88, w, h * 0.12, r, shade(colour, -0.08));
    ctx.strokeStyle = shade(colour, -0.14);
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, g * 0.05);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(g * 0.12, h * 0.5);
    ctx.lineTo(w - g * 0.12, h * 0.5);
    ctx.moveTo(w * 0.5, g * 0.12);
    ctx.lineTo(w * 0.5, h * 0.5);
    ctx.moveTo(w * 0.25, h * 0.5);
    ctx.lineTo(w * 0.25, h * 0.88);
    ctx.moveTo(w * 0.75, h * 0.5);
    ctx.lineTo(w * 0.75, h * 0.88);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(r, 1, w - r * 2, Math.max(1.5, g * 0.06));
}

// Where a window's glass is, in the part's frame: for the glow at night, and for the cat.
export function glassOf(w, h, g) {
    const m = g * 0.24;
    return { x: m, y: m, w: w - m * 2, h: h - m * 2 - g * 0.1 };
}

function windowPanel(ctx, w, h, g, colour) {
    const r = g * 0.14;
    fillRound(ctx, 0, 0, w, h, r, colour);
    fillRound(ctx, 0, h * 0.88, w, h * 0.12, r, shade(colour, -0.08));
    const glass = glassOf(w, h, g);
    fillRound(ctx, glass.x, glass.y, glass.w, glass.h, g * 0.06, SITE.glass);
    poly(
        ctx,
        [
            [glass.x + glass.w * 0.55, glass.y],
            [glass.x + glass.w * 0.8, glass.y],
            [glass.x + glass.w * 0.35, glass.y + glass.h],
            [glass.x + glass.w * 0.1, glass.y + glass.h],
        ],
        'rgba(255,255,255,0.35)'
    );
    const bar = Math.max(1.5, g * 0.07);
    ctx.fillStyle = shade(colour, 0.55);
    ctx.fillRect(glass.x + glass.w / 2 - bar / 2, glass.y, bar, glass.h);
    ctx.fillRect(glass.x, glass.y + glass.h * 0.45 - bar / 2, glass.w, bar);
    fillRound(
        ctx,
        g * 0.14,
        glass.y + glass.h - g * 0.02,
        w - g * 0.28,
        g * 0.16,
        g * 0.06,
        shade(colour, 0.38)
    );
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(r, 1, w - r * 2, Math.max(1.5, g * 0.06));
}

// A steel beam seen from the side: two flanges and a web pierced with round holes, bolted at the
// ends.
function beam(ctx, w, h, g, colour) {
    const flange = h * 0.24;
    fillRound(ctx, 0, 0, w, h, g * 0.1, shade(colour, -0.06));
    fillRound(ctx, g * 0.06, flange, w - g * 0.12, h - flange * 2, g * 0.04, shade(colour, 0.18));
    const holes = Math.max(2, Math.round(w / (g * 1.3)));
    for (let i = 0; i < holes; i++) {
        disc(ctx, (w * (i + 0.5)) / holes, h / 2, h * 0.16, shade(colour, -0.22));
    }
    for (const bx of [g * 0.22, w - g * 0.22]) {
        disc(ctx, bx, flange * 0.5, Math.max(1, g * 0.05), shade(colour, -0.28));
        disc(ctx, bx, h - flange * 0.5, Math.max(1, g * 0.05), shade(colour, -0.28));
    }
    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.fillRect(g * 0.1, 1, w - g * 0.2, Math.max(1.5, g * 0.05));
}

// An arch: a block two blocks wide with a round opening under it, standing on its two feet.
// `OPENING` is how high the opening reaches, in g.
export const OPENING = 1.2;

function archPath(ctx, w, h, g) {
    const r = g * 0.14;
    const radius = g;
    const cx = w / 2;
    const spring = h - (OPENING - 1) * g;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.arcTo(w, 0, w, r, r);
    ctx.lineTo(w, h);
    ctx.lineTo(cx + radius, h);
    ctx.lineTo(cx + radius, spring);
    ctx.arc(cx, spring, radius, 0, Math.PI, true);
    ctx.lineTo(cx - radius, h);
    ctx.lineTo(0, h);
    ctx.lineTo(0, r);
    ctx.arcTo(0, 0, r, 0, r);
    ctx.closePath();
}

function arch(ctx, w, h, g, colour) {
    const r = g * 0.14;
    const radius = g;
    const cx = w / 2;
    const spring = h - (OPENING - 1) * g;
    const outline = () => archPath(ctx, w, h, g);
    outline();
    ctx.fillStyle = colour;
    ctx.fill();
    // The stones of the arch, radiating from the opening, and the keystone at the top of it.
    ctx.save();
    outline();
    ctx.clip();
    ctx.strokeStyle = shade(colour, -0.14);
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1, g * 0.05);
    ctx.beginPath();
    for (let i = 1; i < 6; i++) {
        const a = Math.PI + (i / 6) * Math.PI;
        ctx.moveTo(cx + Math.cos(a) * radius, spring + Math.sin(a) * radius);
        ctx.lineTo(cx + Math.cos(a) * radius * 1.45, spring + Math.sin(a) * radius * 1.45);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    poly(
        ctx,
        [
            [cx - g * 0.16, spring - radius - g * 0.02],
            [cx + g * 0.16, spring - radius - g * 0.02],
            [cx + g * 0.24, spring - radius - g * 0.5],
            [cx - g * 0.24, spring - radius - g * 0.5],
        ],
        shade(colour, 0.3)
    );
    fillRound(ctx, 0, h * 0.9, w, h * 0.1, r, shade(colour, -0.08));
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(r, 1, w - r * 2, Math.max(1.5, g * 0.06));
}

function roofPath(ctx, w, h, g) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(w / 2 - g * 0.18, g * 0.1);
    ctx.quadraticCurveTo(w / 2, -g * 0.04, w / 2 + g * 0.18, g * 0.1);
    ctx.lineTo(w, h);
    ctx.closePath();
}

// A pitched roof with a chimney. It only sits one way up, point to the sky.
function roof(ctx, w, h, g, colour) {
    fillRound(ctx, w * 0.64, h * 0.08, g * 0.34, h * 0.6, g * 0.06, shade(colour, -0.18));
    fillRound(ctx, w * 0.62, h * 0.04, g * 0.42, g * 0.14, g * 0.05, shade(colour, -0.28));
    const outline = () => roofPath(ctx, w, h, g);
    outline();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.save();
    outline();
    ctx.clip();
    ctx.strokeStyle = shade(colour, -0.14);
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, g * 0.05);
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
        const y = h * (i / 4) + g * 0.04;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = shade(colour, -0.1);
    ctx.fillRect(0, h - g * 0.16, w, g * 0.16);
    ctx.restore();
}

// A part's silhouette in one colour, its top-left at (dx, dy): its shadow, drawn offset and faint,
// and the light laid over it as it plays.
export function outline(ctx, kind, w, h, g, colour, dx = 0, dy = 0) {
    ctx.save();
    ctx.translate(dx, dy);
    ctx.fillStyle = colour;
    if (kind === 'arch') archPath(ctx, w, h, g);
    else if (kind === 'roof') roofPath(ctx, w, h, g);
    else if (kind === 'ball') circle(ctx, w / 2, h - ballRadius(h), ballRadius(h));
    else roundRect(ctx, 0, 0, w, h, g * (kind === 'beam' ? 0.1 : 0.14));
    ctx.fill();
    ctx.restore();
}

// A part's shape marked out where a part is wanted, at (dx, dy): a wash of `colour` and a dashed edge
// in its deeper shade, stronger when `hot`.
export function ghost(ctx, kind, w, h, g, colour, dx, dy, hot) {
    const rgb = hexToRgb(colour);
    outline(ctx, kind, w, h, g, rgbString(rgb, hot ? 0.6 : 0.34), dx, dy);
    ctx.save();
    ctx.translate(dx, dy);
    ctx.beginPath();
    if (kind === 'arch') archPath(ctx, w, h, g);
    else if (kind === 'roof') roofPath(ctx, w, h, g);
    else roundRect(ctx, 0, 0, w, h, g * (kind === 'beam' ? 0.1 : 0.14));
    ctx.setLineDash([g * 0.22, g * 0.16]);
    ctx.lineWidth = Math.max(1.5, g * 0.07);
    ctx.strokeStyle = rgbString(mixRgb(rgb, [92, 70, 58], 0.22), hot ? 0.95 : 0.75);
    ctx.stroke();
    ctx.restore();
}

// The wrecking ball, at rest in a w x h box, its shackle at the top for the hook.
export function ballRadius(h) {
    return h * 0.42;
}

function wreckingBall(ctx, w, h, g) {
    const r = ballRadius(h);
    const cx = w / 2;
    const cy = h - r;
    // The shackle and a short chain up to where the hook takes it.
    for (let i = 0; i < 2; i++) {
        ellipse(ctx, cx, cy - r - g * (0.08 + i * 0.16), g * 0.06, g * 0.1);
        ctx.lineWidth = Math.max(1, g * 0.05);
        ctx.strokeStyle = SITE.steelDeep;
        ctx.stroke();
    }
    disc(ctx, cx, cy, r, '#A79C92');
    disc(ctx, cx + r * 0.12, cy + r * 0.16, r * 0.82, '#958A80');
    disc(ctx, cx - r * 0.34, cy - r * 0.36, r * 0.24, 'rgba(255,255,255,0.32)');
    fillRound(ctx, cx - r * 0.3, cy - r - g * 0.04, r * 0.6, g * 0.14, g * 0.05, SITE.steelDeep);
}

//==============================================================================
// The lives that move in

// A nest of twigs, its rim at (x, y).
export function nest(ctx, x, y, k) {
    ellipse(ctx, x, y + k * 0.02, k * 0.11, k * 0.04);
    ctx.fillStyle = '#B58E6A';
    ctx.fill();
    ctx.strokeStyle = '#99744F';
    ctx.lineWidth = Math.max(1, k * 0.008);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
        const a = -0.9 + (i / 6) * 1.8;
        ctx.moveTo(x - k * 0.1 + i * k * 0.03, y + k * 0.04);
        ctx.lineTo(x - k * 0.1 + i * k * 0.03 + Math.sin(a) * k * 0.04, y - k * 0.005);
    }
    ctx.stroke();
}

// A potted plant on a ledge, standing at (x, y), grown in by `grow` 0..1.
export function plant(ctx, x, y, k, colour, grow = 1) {
    if (grow <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(grow, grow);
    const leaf = '#9CC48A';
    ellipse(ctx, -k * 0.07, -k * 0.2, k * 0.06, k * 0.028, -0.6);
    ctx.fillStyle = leaf;
    ctx.fill();
    ellipse(ctx, k * 0.07, -k * 0.22, k * 0.06, k * 0.028, 0.6);
    ctx.fillStyle = '#86B474';
    ctx.fill();
    line(ctx, 0, -k * 0.12, 0, -k * 0.27, k * 0.016, '#86B474');
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        disc(ctx, Math.cos(a) * k * 0.035, -k * 0.3 + Math.sin(a) * k * 0.035, k * 0.028, colour);
    }
    disc(ctx, 0, -k * 0.3, k * 0.022, '#F3DE97');
    poly(
        ctx,
        [
            [-k * 0.08, -k * 0.13],
            [k * 0.08, -k * 0.13],
            [k * 0.06, 0],
            [-k * 0.06, 0],
        ],
        '#E3A595'
    );
    fillRound(ctx, -k * 0.09, -k * 0.15, k * 0.18, k * 0.04, k * 0.015, '#CC8C7E');
    ctx.restore();
}

// A puff of dust, `k` 0..1 through its life.
export function dust(ctx, x, y, r, k) {
    const a = 0.5 * (1 - k);
    if (a <= 0) return;
    circle(ctx, x, y - r * k * 0.6, r * (0.5 + k));
    ctx.fillStyle = `rgba(230, 214, 186, ${a})`;
    ctx.fill();
}

// The star of a sparkle: four soft points.
export function star(ctx, x, y, r, colour) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fillStyle = colour;
    ctx.fill();
}

export { INK, mirrored, worker };
