// Freeze Parade's animals, seen from the side, each able to march, to freeze in a silly pose, to
// sneeze and to sit down: the cow, the sheep and the pig, the ducks, the hare and the tortoise. And
// the band's instruments they carry at Bloom.
//
// Each is drawn facing +x with its feet on y = 0 at the origin; `k` is its size, about the length
// of its body. `pose`:
//   stride  -1 to 1: how far its legs are swung, one pair forward and the other back
//   lift    how high the body rides above its legs in a step, in k
//   freeze  0 to 1: into its freeze pose, a front leg up and the head up, wide-eyed
//   style   which freeze pose: 0, 1 or 2
//   tilt    the body rocking, radians: a wobble on one leg, a waddle
//   sneeze  -1 to 1: the head back for the "ah", forward for the "choo"
//   sit     0 to 1: lying down, legs tucked under
//   blink   eyes shut
//   mouth   0 to 1: open, for a voice
//   carry   what it carries in the band: 'drum', 'horn', 'cymbals', 'bells', or nothing

import { ellipse, disc, fillRound } from '../draw.js';
import { lerp, TAU } from '../util.js';

const INK = '#5A4A3F';

export const LOOKS = {
    cow: {
        body: '#FBF6EE',
        patch: '#9C7A63',
        leg: '#F1E8DC',
        hoof: '#7A6556',
        snout: '#F2BAC3',
        horn: '#F3E3C3',
    },
    sheep: { wool: '#FBF7F0', woolShade: '#E9E1D4', face: '#6E6159', leg: '#6E6159' },
    pig: { body: '#F4BFC4', deep: '#E59EA6', snout: '#EAA3AC' },
    duck: { body: '#FBF7F0', wing: '#EDE5D8', beak: '#F2B25C', foot: '#EE9F4A' },
    tortoise: { shell: '#8FB27A', shellDeep: '#6F9560', plate: '#A9C794', skin: '#C9C08A' },
    hare: { body: '#CDB49A', deep: '#B39A80', belly: '#F2E6D6', ear: '#F2BAC3' },
};

function eye(ctx, x, y, r, pose) {
    if (pose.blink) {
        ctx.beginPath();
        ctx.arc(x, y - r * 0.2, r, 0.25, Math.PI - 0.25);
        ctx.strokeStyle = INK;
        ctx.lineWidth = r * 0.55;
        ctx.lineCap = 'round';
        ctx.stroke();
        return;
    }
    // Wide-eyed when it freezes: a white round the dark, and a glint.
    const wide = pose.freeze || 0;
    if (wide > 0.3) disc(ctx, x, y, r * (1 + wide * 0.6), '#FFFFFF');
    disc(ctx, x, y, r, INK);
    disc(ctx, x - r * 0.3, y - r * 0.35, r * 0.35, '#FFFFFF');
}

// A leg from its hip, swung by `angle` (forward is positive), `len` long and `w` wide, with a hoof
// or foot of `foot` colour at the end.
function leg(ctx, hx, hy, len, w, angle, colour, foot, bend = 0) {
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(-angle);
    if (bend) {
        // Folded at the knee: the upper leg, then the lower one turned back.
        fillRound(ctx, -w / 2, 0, w, len * 0.55, w / 2, colour);
        ctx.translate(0, len * 0.5);
        ctx.rotate(bend);
        fillRound(ctx, -w / 2, 0, w, len * 0.5, w / 2, colour);
        if (foot) fillRound(ctx, -w / 2, len * 0.38, w, len * 0.14, w * 0.3, foot);
    } else {
        fillRound(ctx, -w / 2, 0, w, len, w / 2, colour);
        if (foot) fillRound(ctx, -w / 2, len - w * 0.7, w, w * 0.7, w * 0.3, foot);
    }
    ctx.restore();
}

// Four legs: the front and back pairs swing opposite ways in a stride; in the freeze, one front leg
// goes up high. Lying down, they tuck away under the body as it comes down to the ground.
function fourLegs(ctx, k, pose, o) {
    const s = pose.stride || 0;
    const f = pose.freeze || 0;
    const sit = pose.sit || 0;
    const swing = 0.42 * s * (1 - sit);
    const lifted = [-1.25, -0.9, 0.2][pose.style || 0];
    const len = o.len * (1 - sit * 0.85);
    // Far legs first, a shade darker, then the near ones.
    const far = o.farColour || o.colour;
    leg(ctx, o.frontX + k * 0.03, o.hipY, len, o.w, -swing, far, o.foot);
    leg(ctx, o.backX + k * 0.03, o.hipY, len, o.w, swing, far, o.foot);
    leg(
        ctx,
        o.frontX,
        o.hipY,
        len,
        o.w,
        lerp(swing, -lifted, f),
        o.colour,
        o.foot,
        f * (pose.style === 2 ? 0 : 0.9)
    );
    leg(ctx, o.backX, o.hipY, len, o.w, -swing, o.colour, o.foot);
}

// The whole body turns about the back feet when it freezes, rearing a little, and rocks when it
// wobbles; lying down, it comes down by most of its legs' length, `legs`.
function lean(ctx, k, pose, backX, legs) {
    const f = pose.freeze || 0;
    const rear = -0.1 * f * (pose.style === 1 ? 1.8 : 1);
    ctx.translate(0, (pose.sit || 0) * legs * 0.85);
    ctx.translate(backX, 0);
    ctx.rotate(rear + (pose.tilt || 0));
    ctx.translate(-backX, -(pose.lift || 0) * k);
}

export function drawCow(ctx, k, pose = {}, look = LOOKS.cow) {
    ctx.save();
    lean(ctx, k, pose, -k * 0.22, k * 0.3);
    const hipY = -k * 0.3;
    fourLegs(ctx, k, pose, {
        frontX: k * 0.2,
        backX: -k * 0.22,
        hipY,
        len: k * 0.3,
        w: k * 0.075,
        colour: look.leg,
        farColour: '#E6DCCE',
        foot: look.hoof,
    });
    const by = -k * 0.44;
    // The tail, swishing, up in the freeze.
    const tailUp = pose.freeze || 0;
    ctx.strokeStyle = look.leg;
    ctx.lineWidth = k * 0.025;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-k * 0.34, by - k * 0.05);
    ctx.quadraticCurveTo(
        -k * 0.46,
        by + k * 0.05 - tailUp * k * 0.2,
        -k * 0.44,
        by + k * 0.18 - tailUp * k * 0.36
    );
    ctx.stroke();
    disc(ctx, -k * 0.44, by + k * 0.2 - tailUp * k * 0.36, k * 0.035, look.patch);
    ellipse(ctx, 0, by, k * 0.37, k * 0.2);
    ctx.fillStyle = look.body;
    ctx.fill();
    ctx.save();
    ctx.clip();
    disc(ctx, -k * 0.14, by - k * 0.06, k * 0.11, look.patch);
    disc(ctx, k * 0.13, by + k * 0.07, k * 0.08, look.patch);
    disc(ctx, -k * 0.3, by + k * 0.1, k * 0.07, look.patch);
    ctx.restore();
    ellipse(ctx, -k * 0.05, by + k * 0.19, k * 0.07, k * 0.035);
    ctx.fillStyle = look.snout;
    ctx.fill();
    if (pose.carry === 'drum') carryDrum(ctx, k * 0.12, by + k * 0.08, k * 0.13, pose);
    // The head, on the front of the body.
    head(ctx, k * 0.36, by - k * 0.1, pose, () => {
        ellipse(ctx, -k * 0.02, -k * 0.11, k * 0.035, k * 0.06, -0.6);
        ctx.fillStyle = look.horn;
        ctx.fill();
        ellipse(ctx, k * 0.06, -k * 0.12, k * 0.035, k * 0.06, 0.6);
        ctx.fill();
        ellipse(ctx, -k * 0.08, -k * 0.05, k * 0.06, k * 0.03, -0.4);
        ctx.fillStyle = look.patch;
        ctx.fill();
        ellipse(ctx, k * 0.03, 0, k * 0.12, k * 0.11);
        ctx.fillStyle = look.body;
        ctx.fill();
        disc(ctx, -k * 0.03, -k * 0.04, k * 0.05, look.patch);
        ellipse(ctx, k * 0.08, k * 0.06, k * 0.08, k * 0.06);
        ctx.fillStyle = look.snout;
        ctx.fill();
        disc(ctx, k * 0.06, k * 0.06, k * 0.011, '#C98B97');
        disc(ctx, k * 0.11, k * 0.06, k * 0.011, '#C98B97');
        mouth(ctx, k * 0.08, k * 0.1, k * 0.03, pose);
        eye(ctx, k * 0.05, -k * 0.03, k * 0.018, pose);
    });
    ctx.restore();
}

export function drawSheep(ctx, k, pose = {}, look = LOOKS.sheep) {
    ctx.save();
    lean(ctx, k, pose, -k * 0.18, k * 0.28);
    fourLegs(ctx, k, pose, {
        frontX: k * 0.17,
        backX: -k * 0.18,
        hipY: -k * 0.28,
        len: k * 0.28,
        w: k * 0.05,
        colour: look.leg,
        farColour: '#5E534C',
        foot: null,
    });
    const by = -k * 0.42;
    const puffs = [
        [0, 0, 0.17],
        [-0.17, 0.02, 0.12],
        [0.16, 0.02, 0.12],
        [-0.09, -0.11, 0.12],
        [0.08, -0.11, 0.12],
        [-0.12, 0.1, 0.11],
        [0.11, 0.1, 0.11],
    ];
    for (const [px, py, r] of puffs)
        disc(ctx, px * k + k * 0.01, by + py * k + k * 0.015, r * k, look.woolShade);
    for (const [px, py, r] of puffs) disc(ctx, px * k, by + py * k, r * k, look.wool);
    if (pose.carry === 'horn') carryHorn(ctx, k * 0.3, by - k * 0.02, k, pose);
    head(ctx, k * 0.27, by - k * 0.08, pose, () => {
        ellipse(ctx, -k * 0.06, -k * 0.02, k * 0.05, k * 0.025, -0.4);
        ctx.fillStyle = look.face;
        ctx.fill();
        ellipse(ctx, k * 0.03, k * 0.02, k * 0.08, k * 0.09);
        ctx.fill();
        disc(ctx, 0, -k * 0.07, k * 0.05, look.wool);
        disc(ctx, k * 0.05, -k * 0.065, k * 0.04, look.wool);
        mouth(ctx, k * 0.07, k * 0.08, k * 0.025, pose, '#F2E6D6');
        eye(ctx, k * 0.05, k * 0.0, k * 0.017, pose);
    });
    ctx.restore();
}

export function drawPig(ctx, k, pose = {}, look = LOOKS.pig) {
    ctx.save();
    lean(ctx, k, pose, -k * 0.19, k * 0.2);
    fourLegs(ctx, k, pose, {
        frontX: k * 0.17,
        backX: -k * 0.19,
        hipY: -k * 0.2,
        len: k * 0.2,
        w: k * 0.075,
        colour: look.deep,
        farColour: '#D98E97',
        foot: null,
    });
    const by = -k * 0.32;
    // The curly tail: it spins round in the freeze.
    ctx.save();
    ctx.translate(-k * 0.31, by - k * 0.04);
    ctx.rotate((pose.freeze || 0) * TAU * 0.5);
    ctx.beginPath();
    ctx.arc(-k * 0.03, 0, k * 0.03, 0.4, 5.5);
    ctx.strokeStyle = look.deep;
    ctx.lineWidth = k * 0.018;
    ctx.stroke();
    ctx.restore();
    ellipse(ctx, 0, by, k * 0.33, k * 0.19);
    ctx.fillStyle = look.body;
    ctx.fill();
    if (pose.carry === 'cymbals') carryCymbals(ctx, k * 0.1, by + k * 0.02, k, pose);
    head(ctx, k * 0.3, by - k * 0.04, pose, () => {
        ctx.beginPath();
        ctx.moveTo(-k * 0.06, -k * 0.08);
        ctx.lineTo(-k * 0.01, -k * 0.18);
        ctx.lineTo(k * 0.04, -k * 0.07);
        ctx.closePath();
        ctx.fillStyle = look.deep;
        ctx.fill();
        disc(ctx, 0, 0, k * 0.11, look.body);
        ellipse(ctx, k * 0.1, k * 0.02, k * 0.04, k * 0.05);
        ctx.fillStyle = look.snout;
        ctx.fill();
        disc(ctx, k * 0.095, 0, k * 0.009, '#C98B97');
        disc(ctx, k * 0.105, k * 0.04, k * 0.009, '#C98B97');
        mouth(ctx, k * 0.05, k * 0.07, k * 0.025, pose);
        eye(ctx, k * 0.04, -k * 0.035, k * 0.017, pose);
    });
    ctx.restore();
}

// The duck walks upright on two short legs, and waddles: its whole body rocks.
export function drawDuck(ctx, k, pose = {}, look = LOOKS.duck) {
    ctx.save();
    const f = pose.freeze || 0;
    const s = pose.stride || 0;
    ctx.translate(0, ((pose.sit || 0) * 0.13 - (pose.lift || 0)) * k);
    ctx.rotate((pose.tilt || 0) + s * 0.08 - f * 0.1);
    // In the freeze, one foot comes up and both wings go out.
    leg(ctx, -k * 0.04, -k * 0.16, k * 0.16, k * 0.035, s * 0.4, look.foot);
    leg(ctx, k * 0.05, -k * 0.16, k * 0.16, k * 0.035, lerp(-s * 0.4, -1.3, f), look.foot);
    fillRound(ctx, -k * 0.06, -k * 0.025, k * 0.1, k * 0.035, k * 0.015, look.foot);
    ellipse(ctx, 0, -k * 0.28, k * 0.2, k * 0.14);
    ctx.fillStyle = look.body;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-k * 0.18, -k * 0.32);
    ctx.lineTo(-k * 0.27, -k * 0.4);
    ctx.lineTo(-k * 0.17, -k * 0.24);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(-k * 0.02, -k * 0.3);
    ctx.rotate(-f * 1.1);
    ellipse(ctx, -k * 0.02, 0, k * 0.11, k * 0.06, 0.2);
    ctx.fillStyle = look.wing;
    ctx.fill();
    ctx.restore();
    if (pose.carry === 'bells') carryBells(ctx, k * 0.12, -k * 0.24, k, pose);
    head(ctx, k * 0.13, -k * 0.42, pose, () => {
        disc(ctx, 0, -k * 0.04, k * 0.1, look.body);
        const open = (pose.mouth || 0) * k * 0.03;
        ellipse(ctx, k * 0.11, -k * 0.03 - open * 0.3, k * 0.06, k * 0.025);
        ctx.fillStyle = look.beak;
        ctx.fill();
        ellipse(ctx, k * 0.1, -k * 0.01 + open, k * 0.05, k * 0.018);
        ctx.fill();
        eye(ctx, k * 0.03, -k * 0.07, k * 0.016, pose);
    });
    ctx.restore();
}

// The tortoise: a domed shell on four stubby legs. In the freeze it hides its head in its shell.
export function drawTortoise(ctx, k, pose = {}, look = LOOKS.tortoise) {
    ctx.save();
    const s = pose.stride || 0;
    const hide = Math.max(pose.freeze || 0, pose.sit || 0);
    ctx.translate(0, -(pose.lift || 0) * k);
    ctx.rotate(pose.tilt || 0);
    for (const [x, phase, far] of [
        [-k * 0.16, 1, true],
        [k * 0.14, -1, true],
        [-k * 0.13, -1, false],
        [k * 0.17, 1, false],
    ]) {
        const y = -k * 0.1 + hide * k * 0.06;
        leg(ctx, x, y, k * 0.11 * (1 - hide * 0.5), k * 0.07, s * phase * 0.3, far ? '#B8AF7B' : look.skin);
    }
    // The head on its neck, out in front, or tucked away.
    const out = 1 - hide;
    if (out > 0.05) {
        head(ctx, k * (0.2 + 0.1 * out), -k * 0.17, pose, () => {
            ellipse(ctx, 0, 0, k * 0.075, k * 0.06);
            ctx.fillStyle = look.skin;
            ctx.fill();
            mouth(ctx, k * 0.05, k * 0.025, k * 0.018, pose);
            eye(ctx, k * 0.025, -k * 0.015, k * 0.014, pose);
        });
    }
    ctx.beginPath();
    ctx.ellipse(0, -k * 0.12, k * 0.26, k * 0.22, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = look.shellDeep;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -k * 0.13, k * 0.24, k * 0.2, 0, Math.PI, TAU);
    ctx.closePath();
    ctx.fillStyle = look.shell;
    ctx.fill();
    for (const [x, y, r] of [
        [0, -0.24, 0.07],
        [-0.13, -0.18, 0.055],
        [0.13, -0.18, 0.055],
    ])
        disc(ctx, x * k, y * k, r * k, look.plate);
    fillRound(ctx, -k * 0.27, -k * 0.14, k * 0.54, k * 0.05, k * 0.025, look.shellDeep);
    ctx.restore();
}

// The hare: long back feet and long ears. At rest it crouches; it hops, stretched out through the
// air; in the freeze it sits right up on its haunches, ears straight up, listening.
export function drawHare(ctx, k, pose = {}, look = LOOKS.hare) {
    ctx.save();
    const f = pose.freeze || 0;
    const s = Math.abs(pose.stride || 0);
    ctx.translate(0, -(pose.lift || 0) * k);
    ctx.rotate(pose.tilt || 0);
    // The back foot, flat on the ground, or kicked out behind in a hop.
    ctx.save();
    ctx.translate(-k * 0.08, -k * 0.03);
    ctx.rotate(s * 0.7);
    ellipse(ctx, -s * k * 0.08, 0, k * 0.13, k * 0.035);
    ctx.fillStyle = look.deep;
    ctx.fill();
    ctx.restore();
    // The body turns up about the haunch: a little at rest, right up in the freeze, and stretches
    // out flat in a hop.
    ctx.save();
    ctx.translate(-k * 0.1, -k * 0.11);
    ctx.rotate(-0.32 - f * 0.85 + s * 0.3);
    // The front legs: down to the ground at rest, reaching forward in a hop, tucked up when it sits.
    const reach = s * 0.6;
    ctx.save();
    ctx.translate(k * 0.22, -k * 0.02);
    ctx.rotate(lerp(0.32 - reach, -1.2, f));
    fillRound(ctx, -k * 0.02, 0, k * 0.04, lerp(k * 0.15, k * 0.08, f), k * 0.02, look.deep);
    ctx.restore();
    ellipse(ctx, k * 0.1, -k * 0.06, k * 0.2, k * 0.12);
    ctx.fillStyle = look.body;
    ctx.fill();
    ellipse(ctx, k * 0.14, -k * 0.01, k * 0.12, k * 0.06);
    ctx.fillStyle = look.belly;
    ctx.fill();
    // The haunch.
    ellipse(ctx, 0, -k * 0.02, k * 0.11, k * 0.09);
    ctx.fillStyle = look.deep;
    ctx.fill();
    disc(ctx, -k * 0.1, -k * 0.08, k * 0.05, look.belly);
    // The head, held level whatever the body does.
    ctx.save();
    ctx.translate(k * 0.28, -k * 0.13);
    ctx.rotate(0.32 + f * 0.85 - s * 0.3);
    head(ctx, 0, 0, pose, () => {
        for (const [x, a] of [
            [-k * 0.03, -0.45 + f * 0.35],
            [k * 0.01, -0.2 + f * 0.2],
        ]) {
            ctx.save();
            ctx.translate(x, -k * 0.05);
            ctx.rotate(a);
            ellipse(ctx, 0, -k * 0.13, k * 0.035, k * 0.13);
            ctx.fillStyle = look.body;
            ctx.fill();
            ellipse(ctx, 0, -k * 0.13, k * 0.017, k * 0.09);
            ctx.fillStyle = look.ear;
            ctx.fill();
            ctx.restore();
        }
        ellipse(ctx, 0, 0, k * 0.09, k * 0.075);
        ctx.fillStyle = look.body;
        ctx.fill();
        disc(ctx, k * 0.085, k * 0.01, k * 0.017, '#E59EA6');
        mouth(ctx, k * 0.06, k * 0.04, k * 0.016, pose);
        eye(ctx, k * 0.035, -k * 0.02, k * 0.016, pose);
    });
    ctx.restore();
    ctx.restore();
    ctx.restore();
}

// A head at (x, y) on the body: turned back for a sneeze's "ah", thrown forward for its "choo",
// up in the freeze.
function head(ctx, x, y, pose, draw) {
    ctx.save();
    ctx.translate(x, y);
    const sneeze = pose.sneeze || 0;
    ctx.rotate(-(pose.freeze || 0) * 0.3 - Math.max(0, sneeze) * 0.45 + Math.max(0, -sneeze) * 0.5);
    draw();
    ctx.restore();
}

function mouth(ctx, x, y, r, pose, colour = '#8C5A50') {
    const open = pose.mouth || 0;
    if (open < 0.08) return;
    ellipse(ctx, x, y, r, r * open);
    ctx.fillStyle = colour;
    ctx.fill();
}

// The band's instruments at Bloom, carried on the animals' sides.
function carryDrum(ctx, x, y, r, pose) {
    const hit = pose.hit || 0;
    fillRound(ctx, x - r, y - r * 0.6, r * 2, r * 1.2, r * 0.3, '#E8D3B0');
    ctx.strokeStyle = '#B98A62';
    ctx.lineWidth = r * 0.08;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
        const xx = x - r * 0.85 + (i * r * 1.7) / 4;
        const yy = i % 2 ? y + r * 0.45 : y - r * 0.45;
        if (i) ctx.lineTo(xx, yy);
        else ctx.moveTo(xx, yy);
    }
    ctx.stroke();
    fillRound(ctx, x - r * 1.05, y - r * 0.7, r * 2.1, r * 0.22, r * 0.1, '#A97F57');
    fillRound(ctx, x - r * 1.05, y + r * 0.5, r * 2.1, r * 0.22, r * 0.1, '#A97F57');
    // A beater in the cow's mouth would be too much: a stick that taps from above.
    ctx.save();
    ctx.translate(x + r * 0.2, y - r * 0.7);
    ctx.rotate(-0.6 + hit * 0.5);
    ctx.strokeStyle = '#C9A47A';
    ctx.lineWidth = r * 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r * 0.9);
    ctx.stroke();
    disc(ctx, 0, 0, r * 0.16, '#EFE3D0');
    ctx.restore();
}

function carryHorn(ctx, x, y, k, pose) {
    const toot = pose.hit || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.25 - toot * 0.1);
    fillRound(ctx, 0, -k * 0.018, k * 0.2, k * 0.036, k * 0.018, '#E5C766');
    ctx.beginPath();
    ctx.moveTo(k * 0.18, -k * 0.02);
    ctx.lineTo(k * 0.3, -k * (0.07 + toot * 0.02));
    ctx.lineTo(k * 0.3, k * (0.07 + toot * 0.02));
    ctx.lineTo(k * 0.18, k * 0.02);
    ctx.closePath();
    ctx.fillStyle = '#F1CF5E';
    ctx.fill();
    ctx.restore();
}

function carryCymbals(ctx, x, y, k, pose) {
    // A pair of little cymbals held up in front of its chest, apart, and together on a crash.
    const crash = pose.hit || 0;
    const apart = k * (0.07 - crash * 0.05);
    for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(x + k * 0.16 + side * apart, y - k * 0.06);
        ctx.rotate(side * 0.25);
        ellipse(ctx, 0, 0, k * 0.025, k * 0.1);
        ctx.fillStyle = '#E5C766';
        ctx.fill();
        ellipse(ctx, side * k * 0.01, 0, k * 0.012, k * 0.06);
        ctx.fillStyle = '#F6DD8A';
        ctx.fill();
        ctx.restore();
    }
}

function carryBells(ctx, x, y, k, pose) {
    const ring = pose.hit || 0;
    for (const [dx, dy] of [
        [0, 0],
        [0.05, 0.03],
    ]) {
        disc(ctx, x + dx * k + ring * k * 0.01, y + dy * k, k * 0.035, '#F1CF5E');
        disc(ctx, x + dx * k + ring * k * 0.01, y + dy * k + k * 0.02, k * 0.012, '#B98A62');
    }
}

export const DRAW = {
    cow: drawCow,
    sheep: drawSheep,
    pig: drawPig,
    duck: drawDuck,
    tortoise: drawTortoise,
    hare: drawHare,
};

// How big each is, beside the cow, and how far apart they walk.
export const SIZE = { cow: 1, sheep: 0.9, pig: 0.85, duck: 0.62, tortoise: 0.7, hare: 0.75 };

// The everyday height of each, for the parade's spacing and touch.
export function heightOf(name, k) {
    return k * { cow: 0.72, sheep: 0.66, pig: 0.55, duck: 0.56, tortoise: 0.38, hare: 0.6 }[name];
}
