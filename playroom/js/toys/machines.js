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

//==============================================================================
// The machines
//
// Every machine takes, besides its own options, `facing` (1 right, -1 left), `tilt` (radians, the
// slope of the ground it stands on, positive when its right-hand end is lower), `beacon` (0..1, how
// lit its light is) and `bounce` (a small lift, for a horn or a bump). Each is drawn in its own
// frame, k units to a side, so the shapes below read as fractions of k.

// A point in a machine's own frame (facing right, y down, 1 unit = k, the origin on the ground
// under its middle) as a point on the screen.
export function toWorld(cx, by, k, o, lx, ly) {
    const t = o.tilt || 0;
    const x = (o.facing || 1) * lx * k;
    const y = ly * k;
    return { x: cx + x * Math.cos(t) - y * Math.sin(t), y: by + x * Math.sin(t) + y * Math.cos(t) };
}

// And back: a point on the screen in a machine's own frame.
export function toLocal(cx, by, k, o, x, y) {
    const t = o.tilt || 0;
    const dx = x - cx;
    const dy = y - by;
    const lx = dx * Math.cos(t) + dy * Math.sin(t);
    const ly = -dx * Math.sin(t) + dy * Math.cos(t);
    return { x: (lx / k) * (o.facing || 1), y: ly / k };
}

function inFrame(ctx, cx, by, k, o, draw) {
    ctx.save();
    ctx.translate(cx, by - (o.bounce || 0) * k * 0.03);
    if (o.tilt) ctx.rotate(o.tilt);
    ctx.scale((o.facing || 1) * k, k);
    draw();
    ctx.restore();
}

function pin(ctx, x, y, r) {
    disc(ctx, x, y, r, SITE.steelDeep);
    disc(ctx, x, y, r * 0.5, SITE.hub);
}

// A hydraulic ram between two points: the wide cylinder at the first, the bright rod at the second.
function ram(ctx, x0, y0, x1, y1, width) {
    line(ctx, x0, y0, x1, y1, width * 0.55, SITE.steelLight);
    line(ctx, x0, y0, x0 + (x1 - x0) * 0.58, y0 + (y1 - y0) * 0.58, width, SITE.steelDeep);
}

// A cab: a body-coloured box with a big window, and someone in it.
function cab(ctx, x0, y0, x1, y1, o) {
    fillRound(ctx, x0, y0 + 0.012, x1 - x0, y1 - y0, 0.05, 'rgba(112, 84, 58, 0.12)');
    fillRound(ctx, x0, y0, x1 - x0, y1 - y0, 0.05, SITE.body);
    const wx0 = x0 + 0.03;
    const wx1 = x1 - 0.03;
    const wy0 = y0 + 0.035;
    const wy1 = y0 + (y1 - y0) * 0.62;
    fillRound(ctx, wx0, wy0, wx1 - wx0, wy1 - wy0, 0.03, SITE.glass);
    worker(ctx, (wx0 + wx1) / 2 + 0.01, wy1 + 0.005, 0.85, { seated: true, wave: o.wave });
    // The glass in front of the driver, with a glint.
    fillRound(ctx, wx0, wy0, wx1 - wx0, wy1 - wy0, 0.03, 'rgba(230, 241, 246, 0.35)');
    line(ctx, wx0 + 0.03, wy0 + 0.03, wx0 + 0.06, wy0 + 0.015, 0.012, 'rgba(255,255,255,0.6)');
    if (o.beacon !== undefined) beacon(ctx, (x0 + x1) / 2, y0 - 0.035, 0.032, o.beacon);
}

//------------------------------------------------------------------------------
// The digger: a tracked excavator, its arm a boom from the front of the house, a stick from the
// boom's end, and a bucket at the stick's end. The bucket is a backhoe's: its mouth and teeth face
// back towards the cab, so it digs by pulling in, and empties by opening out, away from the cab.
//
//   boom, stick   the angles of the boom and the stick, in the digger's own frame: 0 is level and
//                 pointing forwards, positive turns downwards. diggerSolve() finds them for a point.
//   bucket        the bucket's angle: 0 holds its load with the opening up, about 1 is digging,
//                 teeth down and towards the cab, and 2.2 is opened right out, pouring.
//   load          0..1, how full the bucket is, heaped in `loadColour`.
//   travel        how far the tracks have crawled, so the treads crawl with them.
//   reach         a longer or shorter arm (1 is the usual).

export const DIGGER = {
    pivot: [0.2, -0.33],
    boom: 0.56,
    stick: 0.44,
    bucketW: 0.23,
    bucketD: 0.15,
    boomRange: [-1.35, 0.75],
    foldRange: [0.25, 2.75],
    // The tracks' length, front to back, and the house that sits on them (x0, x1, y0, y1), for
    // hit tests.
    tracks: [-0.42, 0.42],
    house: [-0.44, 0.2, -0.7, -0.17],
};

// A point of the bucket, from the wrist: (lx, ly) in the bucket's own terms, lx from the hinge
// towards the teeth and ly down into the cup, turned to the bucket's angle and faced back towards
// the cab.
function bucketPoint(o, lx, ly) {
    const b = o.bucket || 0;
    return [-(lx * Math.cos(b) - ly * Math.sin(b)), lx * Math.sin(b) + ly * Math.cos(b)];
}

function armPoints(o) {
    const reach = o.reach || 1;
    const [px, py] = DIGGER.pivot;
    const b = o.boom === undefined ? -0.5 : o.boom;
    const s = o.stick === undefined ? 0.9 : o.stick;
    const ex = px + Math.cos(b) * DIGGER.boom * reach;
    const ey = py + Math.sin(b) * DIGGER.boom * reach;
    const wx = ex + Math.cos(s) * DIGGER.stick * reach;
    const wy = ey + Math.sin(s) * DIGGER.stick * reach;
    return { px, py, ex, ey, wx, wy };
}

// Where the digger's joints are on the screen: the boom's pivot, the elbow, the wrist, the middle
// of the bucket's cup (what a finger holds), the lip that sand pours from, and the cup's bottom.
export function diggerJoints(cx, by, k, o = {}) {
    const a = armPoints(o);
    const bw = DIGGER.bucketW;
    const cup = bucketPoint(o, bw * 0.5, 0.05);
    const lip = bucketPoint(o, bw, -0.005);
    const bottom = bucketPoint(o, bw * 0.45, DIGGER.bucketD);
    const at = (x, y) => toWorld(cx, by, k, o, x, y);
    return {
        pivot: at(a.px, a.py),
        elbow: at(a.ex, a.ey),
        wrist: at(a.wx, a.wy),
        cup: at(a.wx + cup[0], a.wy + cup[1]),
        lip: at(a.wx + lip[0], a.wy + lip[1]),
        bottom: at(a.wx + bottom[0], a.wy + bottom[1]),
    };
}

// Where the middle of the bucket's cup sits from the wrist, on the screen, for a bucket angle: a
// finger holds the cup, so the wrist is aimed this far from the finger.
export function diggerCupOffset(k, o = {}) {
    const c = bucketPoint(o, DIGGER.bucketW * 0.5, 0.05);
    const p = toWorld(0, 0, k, { facing: o.facing, tilt: o.tilt }, c[0], c[1]);
    return { x: p.x, y: p.y };
}

// The boom and stick angles that bring the wrist as near as the arm allows to the screen point
// (tx, ty): elbow up, as a real digger's is, and within the range of its rams. Returns the angles
// and where the wrist actually is.
export function diggerSolve(cx, by, k, o, tx, ty) {
    const reach = o.reach || 1;
    const l1 = DIGGER.boom * reach;
    const l2 = DIGGER.stick * reach;
    const [px, py] = DIGGER.pivot;
    const t = toLocal(cx, by, k, o, tx, ty);
    const dx = t.x - px;
    const dy = t.y - py;
    const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, Math.sqrt(dx * dx + dy * dy)));
    const base = Math.atan2(dy, dx);
    const inner = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const range = DIGGER.boomRange;
    const boom = Math.max(range[0], Math.min(range[1], base - inner));
    const ex = px + Math.cos(boom) * l1;
    const ey = py + Math.sin(boom) * l1;
    // From wherever the elbow had to stop, the stick still points at the target.
    const fold = DIGGER.foldRange;
    const toward = Math.atan2(t.y - ey, t.x - ex);
    let bend = toward - boom;
    while (bend < -Math.PI) bend += TAU;
    while (bend > Math.PI) bend += -TAU;
    const stick = boom + Math.max(fold[0], Math.min(fold[1], bend));
    const wrist = toWorld(cx, by, k, o, ex + Math.cos(stick) * l2, ey + Math.sin(stick) * l2);
    return { boom, stick, x: wrist.x, y: wrist.y };
}

export function digger(ctx, cx, by, k, o = {}) {
    shadow(ctx, cx, by, k * 0.46);
    inFrame(ctx, cx, by, k, o, () => {
        tracks(ctx, -0.42, 0.42, 0, 0.17, o.travel ? o.travel / k : 0);
        fillRound(ctx, -0.22, -0.205, 0.44, 0.04, 0.015, SITE.steelDeep);
        // The house: counterweight at the back, engine cover, and the cab at the front.
        fillRound(ctx, -0.44, -0.4, 0.2, 0.22, 0.08, SITE.bodyDeep);
        fillRound(ctx, -0.4, -0.4, 0.6, 0.22, 0.05, SITE.body);
        fillRound(ctx, -0.36, -0.47, 0.28, 0.09, 0.03, SITE.bodyDeep);
        line(ctx, -0.29, -0.47, -0.29, -0.57, 0.03, SITE.steelDeep);
        stripes(ctx, -0.4, -0.235, 0.58, 0.03, SITE.body, SITE.accent, 0.035);
        cab(ctx, -0.07, -0.69, 0.17, -0.37, o);

        const a = armPoints(o);
        const reach = o.reach || 1;
        const b = o.boom === undefined ? -0.5 : o.boom;
        const s = o.stick === undefined ? 0.9 : o.stick;
        const bx = Math.cos(b);
        const bs = Math.sin(b);
        // The boom's ram, from low on the house to the boom's underside.
        const l1 = DIGGER.boom * reach;
        ram(ctx, 0.13, -0.22, a.px + bx * l1 * 0.45 - bs * 0.04, a.py + bs * l1 * 0.45 + bx * 0.04, 0.042);
        // The boom, bowed upwards like a real one.
        const mx = (a.px + a.ex) / 2 + bs * 0.07;
        const my = (a.py + a.ey) / 2 - bx * 0.07;
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.quadraticCurveTo(mx, my, a.ex, a.ey);
        ctx.lineCap = 'round';
        ctx.lineWidth = 0.09;
        ctx.strokeStyle = SITE.bodyDeep;
        ctx.stroke();
        ctx.lineWidth = 0.065;
        ctx.strokeStyle = SITE.body;
        ctx.stroke();
        // The stick's ram, along the top of the boom to the stick's heel.
        const sx = Math.cos(s);
        const sy = Math.sin(s);
        const heelX = a.ex - sx * 0.08;
        const heelY = a.ey - sy * 0.08;
        ram(ctx, mx + bs * 0.02, my - bx * 0.02, heelX + sy * 0.01, heelY - sx * 0.01, 0.034);
        // The stick.
        line(ctx, heelX, heelY, a.wx, a.wy, 0.064, SITE.bodyDeep);
        line(ctx, heelX, heelY, a.wx, a.wy, 0.042, SITE.body);
        pin(ctx, a.px, a.py, 0.028);
        pin(ctx, a.ex, a.ey, 0.026);

        // The bucket: a cup hung at the wrist, its load heaped over the lip, drawn in its own terms
        // (as bucketPoint), facing the cab.
        ctx.save();
        ctx.translate(a.wx, a.wy);
        ctx.scale(-1, 1);
        ctx.rotate(o.bucket || 0);
        const bw = DIGGER.bucketW;
        const bd = DIGGER.bucketD;
        const load = o.load || 0;
        if (load > 0.01) {
            ellipse(ctx, bw * 0.5, 0.005, bw * 0.48, 0.015 + 0.055 * Math.min(1, load));
            ctx.fillStyle = o.loadColour || SITE.sand;
            ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(-0.01, 0);
        ctx.lineTo(bw, 0);
        ctx.quadraticCurveTo(bw * 1.05, bd * 0.95, bw * 0.45, bd);
        ctx.quadraticCurveTo(-0.035, bd * 0.98, -0.01, 0);
        ctx.closePath();
        ctx.fillStyle = SITE.steelDeep;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0.012, 0.012);
        ctx.lineTo(bw - 0.02, 0.012);
        ctx.quadraticCurveTo(bw * 0.95, bd * 0.8, bw * 0.45, bd * 0.84);
        ctx.quadraticCurveTo(0.0, bd * 0.85, 0.012, 0.012);
        ctx.closePath();
        ctx.fillStyle = SITE.steel;
        ctx.fill();
        // Three teeth along the lip.
        for (let i = 0; i < 3; i++) {
            const tx = bw - 0.004 - i * 0.004;
            const ty = -0.005 + i * 0.032;
            poly(
                ctx,
                [
                    [tx, ty - 0.012],
                    [tx + 0.04, ty + 0.004],
                    [tx, ty + 0.018],
                ],
                SITE.steelDeep
            );
        }
        ctx.restore();
        pin(ctx, a.wx, a.wy, 0.022);
    });
}

//------------------------------------------------------------------------------
// The dump truck: a cab at the front and a tipping bed behind, hinged at its back corner.
//
//   tip    0..1, the bed lifted about its hinge, 1 tipped right up.
//   load   0..1, how full the bed is, heaped in `loadColour`.
//   roll   the wheels' turn, in radians.

export const TRUCK = {
    wheels: [-0.28, 0.3],
    wheelR: 0.12,
    // The bed's hinge, at its back corner, and its size from there.
    hinge: [-0.44, -0.22],
    bedLength: 0.56,
    bedHeight: 0.24,
    tipAngle: 0.9,
    // The cab and the bed, for hit tests: x0, x1, y0, y1.
    cab: [0.12, 0.47, -0.58, -0.15],
    body: [-0.48, 0.47, -0.5, 0],
};

function bedPoint(o, lx, ly) {
    const a = -(o.tip || 0) * TRUCK.tipAngle;
    const [hx, hy] = TRUCK.hinge;
    return [hx + lx * Math.cos(a) - ly * Math.sin(a), hy + lx * Math.sin(a) + ly * Math.cos(a)];
}

// The bed on the screen: the two ends of its rim, the middle of its floor, and the lip at the back
// that a load slides out over when it tips.
export function truckBed(cx, by, k, o = {}) {
    const at = (p) => toWorld(cx, by, k, o, p[0], p[1]);
    return {
        back: at(bedPoint(o, -0.03, -TRUCK.bedHeight)),
        front: at(bedPoint(o, TRUCK.bedLength + 0.02, -TRUCK.bedHeight)),
        floor: at(bedPoint(o, TRUCK.bedLength / 2, -0.02)),
        lip: at(bedPoint(o, -0.01, -0.03)),
    };
}

export function dumpTruck(ctx, cx, by, k, o = {}) {
    shadow(ctx, cx, by, k * 0.48);
    inFrame(ctx, cx, by, k, o, () => {
        const r = TRUCK.wheelR;
        fillRound(ctx, -0.47, -0.235, 0.93, 0.075, 0.03, SITE.steelDeep);
        // The ram that tips the bed, seen only when it is up.
        if ((o.tip || 0) > 0.02) {
            const top = bedPoint(o, TRUCK.bedLength * 0.62, -0.01);
            ram(ctx, 0.02, -0.2, top[0], top[1], 0.04);
        }
        cab(ctx, 0.13, -0.54, 0.46, -0.2, o);
        fillRound(ctx, 0.41, -0.29, 0.07, 0.06, 0.02, SITE.lit);
        // The bed, in its own frame from the hinge.
        ctx.save();
        ctx.translate(TRUCK.hinge[0], TRUCK.hinge[1]);
        ctx.rotate(-(o.tip || 0) * TRUCK.tipAngle);
        const L = TRUCK.bedLength;
        const H = TRUCK.bedHeight;
        const side = [
            [-0.04, -H],
            [L + 0.02, -H],
            [L, 0],
            [0.02, 0],
        ];
        poly(ctx, side, SITE.bodyDeep);
        const load = o.load || 0;
        if (load > 0.01) {
            ellipse(ctx, L * 0.5, -H, L * 0.46, 0.03 + 0.12 * Math.min(1, load));
            ctx.fillStyle = o.loadColour || SITE.sand;
            ctx.fill();
        }
        poly(ctx, side, SITE.body);
        fillRound(ctx, -0.05, -H - 0.015, L + 0.08, 0.04, 0.015, SITE.bodyDeep);
        for (let i = 1; i < 4; i++)
            line(ctx, (L * i) / 4, -H + 0.05, (L * i) / 4, -0.03, 0.014, SITE.bodyDeep);
        ctx.restore();
        // The wheels, under arches.
        for (const wx of TRUCK.wheels) {
            ctx.beginPath();
            ctx.arc(wx, -r, r * 1.22, Math.PI, 0);
            ctx.closePath();
            ctx.fillStyle = SITE.steelDeep;
            ctx.fill();
            wheel(ctx, wx, -r, r, o.roll || 0);
        }
    });
}

//------------------------------------------------------------------------------
// The bulldozer: tracks, an engine at the front, a cab behind, and a curved blade that pushes.
//
//   lift   0..1, the blade raised off the ground.
//   load   0..1, what the blade is pushing, heaped in front of it in `loadColour`.
//   travel how far the tracks have crawled.

export const DOZER = {
    tracks: [-0.38, 0.26],
    // The blade's back and front faces, how high it rises when lifted, and the whole machine for
    // hit tests (x0, x1, y0, y1).
    blade: [0.33, 0.45],
    rise: 0.09,
    body: [-0.4, 0.46, -0.66, 0],
};

export function bulldozer(ctx, cx, by, k, o = {}) {
    shadow(ctx, cx, by, k * 0.44);
    inFrame(ctx, cx, by, k, o, () => {
        const lift = (o.lift || 0) * DOZER.rise;
        tracks(ctx, -0.38, 0.26, 0, 0.15, o.travel ? o.travel / k : 0);
        // The push arms from the tracks to the blade.
        line(ctx, -0.02, -0.08, 0.34, -0.09 - lift, 0.035, SITE.bodyDeep);
        // The engine and its exhaust.
        fillRound(ctx, -0.14, -0.33, 0.39, 0.19, 0.04, SITE.body);
        fillRound(ctx, -0.14, -0.36, 0.33, 0.05, 0.025, SITE.bodyDeep);
        for (let i = 0; i < 3; i++) line(ctx, i * 0.06, -0.3, i * 0.06, -0.2, 0.012, SITE.bodyDeep);
        line(ctx, 0.15, -0.36, 0.15, -0.47, 0.03, SITE.steelDeep);
        cab(ctx, -0.37, -0.62, -0.1, -0.15, o);
        // What the blade is pushing, then the blade itself.
        const load = o.load || 0;
        if (load > 0.01) {
            ellipse(ctx, 0.47, -0.01, 0.04 + 0.1 * Math.min(1, load), 0.02 + 0.13 * Math.min(1, load));
            ctx.fillStyle = o.loadColour || SITE.sand;
            ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(0.33, -0.31 - lift);
        ctx.quadraticCurveTo(0.45, -0.32 - lift, 0.44, -0.27 - lift);
        ctx.quadraticCurveTo(0.37, -0.15 - lift, 0.44, -0.01 - lift);
        ctx.lineTo(0.33, -0.01 - lift);
        ctx.closePath();
        ctx.fillStyle = SITE.bodyDeep;
        ctx.fill();
        stripes(ctx, 0.33, -0.31 - lift, 0.04, 0.3, SITE.body, SITE.accent, 0.04);
        fillRound(ctx, 0.33, -0.045 - lift, 0.115, 0.04, 0.012, SITE.steelDeep);
    });
}
