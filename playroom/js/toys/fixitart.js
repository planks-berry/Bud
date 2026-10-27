// The Fix-it Shop's pictures: the six toys that come in broken, the twelve parts that mend them, the
// screwdriver, and the gap each missing part leaves.
//
// A part is drawn in a unit box, centred on the origin and about one unit across, the right way up;
// whoever draws it scales and turns it. Each part has an outline as well as a picture, and the gap
// it leaves in a toy is that outline, dashed, over a shadow: the shape that will fit, shown where it
// goes, the way a wooden puzzle's board shows each piece's place.
//
// A toy is drawn standing on the origin, about one unit tall, its parts in their places: `slot`
// gives where each goes and how big it is, in the toy's units. While a toy works, `on` is how much
// it is working, 0 to 1, and `t` the time, so the same picture serves on the bench, in the dream and
// on the shelf.

import { ellipse, disc, roundRect, fillRound } from '../draw.js';
import { clamp, shade, TAU } from '../util.js';

const INK = '#5A4A3F';
const STEEL = '#C9C4BC';
const STEEL_DEEP = '#A39C92';
const BRASS = '#E5C766';
const BRASS_DEEP = '#C9A64A';
const WOOD = '#D9B583';
const WOOD_DEEP = '#B99068';
const HOLE = 'rgba(107, 90, 76, 0.14)';
// Where an arm turns: its shoulder, in the arm's unit box.
const SHOULDER = { x: 0, y: -0.38 };
const DASH = 'rgba(107, 90, 76, 0.62)';

// Each toy in the colours it can come in: the first round in the first, the next in the second.
export const COLOURS = {
    car: [
        ['#E98C80', '#D2716A'],
        ['#88B2DA', '#6C97C4'],
        ['#F1CF5E', '#D9B23F'],
    ],
    drum: [
        ['#88B2DA', '#6C97C4'],
        ['#E79A98', '#CF7D7C'],
        ['#8EBF7A', '#73A561'],
    ],
    musicbox: [
        ['#F1CF5E', '#D9B23F'],
        ['#C9BBE3', '#A995D2'],
        ['#F2BAC3', '#DE9BA8'],
    ],
    robot: [
        ['#A9D7C8', '#83BFAE'],
        ['#ABCDEA', '#88B2DA'],
        ['#F4C8A2', '#E8A97C'],
    ],
    train: [
        ['#8EBF7A', '#73A561'],
        ['#E98C80', '#D2716A'],
        ['#AE93D6', '#9177BD'],
    ],
    boat: [
        ['#7FB2DE', '#5F94C4'],
        ['#E79A98', '#CF7D7C'],
        ['#8EBF7A', '#73A561'],
    ],
};

// Where each part goes on its toy, and how big it is, in the toy's units: x across from the toy's
// middle, y up from where it stands (negative), size its width.
export const SLOTS = {
    car: { wheel: { x: -0.27, y: -0.14, size: 0.27 }, horn: { x: 0.3, y: -0.53, size: 0.3 } },
    drum: { skin: { x: 0, y: -0.57, size: 0.72 }, stick: { x: 0.49, y: -0.33, size: 0.56 } },
    musicbox: { crank: { x: 0.5, y: -0.27, size: 0.32 }, bird: { x: 0, y: -0.72, size: 0.3 } },
    robot: { arm: { x: 0.33, y: -0.37, size: 0.36 }, antenna: { x: 0, y: -0.99, size: 0.26 } },
    train: { chimney: { x: -0.3, y: -0.54, size: 0.24 }, bell: { x: -0.04, y: -0.49, size: 0.17 } },
    boat: { sail: { x: 0.21, y: -0.6, size: 0.5 }, flag: { x: -0.1, y: -0.88, size: 0.19 } },
};

//==============================================================================
// Parts: an outline (the shape, to fill or to dash) and a picture, in a unit box.

function circlePath(ctx, x, y, r) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, r, 0, TAU);
}

function rectPath(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

function polyPath(ctx, points) {
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
}

const PARTS = {
    wheel: {
        outline(ctx) {
            circlePath(ctx, 0, 0, 0.5);
        },
        paint(ctx, look) {
            disc(ctx, 0, 0, 0.5, INK);
            disc(ctx, 0, 0, 0.36, '#7A6A5C');
            disc(ctx, 0, 0, 0.22, '#EDE6DA');
            const spin = look.spin || 0;
            for (let i = 0; i < 4; i++) {
                const a = spin + (i * TAU) / 4;
                disc(ctx, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0.045, STEEL_DEEP);
            }
            disc(ctx, 0, 0, 0.05, INK);
        },
    },
    skin: {
        outline(ctx) {
            ctx.moveTo(0.5, 0);
            ctx.ellipse(0, 0, 0.5, 0.15, 0, 0, TAU);
        },
        paint(ctx, look) {
            ellipse(ctx, 0, 0, 0.5, 0.15);
            ctx.fillStyle = '#FBF3E4';
            ctx.fill();
            ctx.lineWidth = 0.035;
            ctx.strokeStyle = '#E2D3BC';
            ctx.stroke();
            // A struck skin rings out from its middle.
            const ring = look.ring || 0;
            if (ring > 0.01) {
                ctx.strokeStyle = `rgba(200, 180, 150, ${(0.7 * ring).toFixed(3)})`;
                ctx.lineWidth = 0.025;
                for (const k of [0.4, 0.75]) {
                    ellipse(ctx, 0, 0, 0.5 * k * (1.3 - ring * 0.3), 0.15 * k * (1.3 - ring * 0.3));
                    ctx.stroke();
                }
            }
            ellipse(ctx, 0, 0, 0.08, 0.025);
            ctx.fillStyle = '#EADBC3';
            ctx.fill();
        },
    },
    crank: {
        outline(ctx) {
            rectPath(ctx, -0.5, -0.38, 0.72, 0.16, 0.08);
            rectPath(ctx, 0.08, -0.38, 0.16, 0.72, 0.08);
            circlePath(ctx, 0.16, 0.34, 0.16);
        },
        paint(ctx, look) {
            fillRound(ctx, -0.5, -0.37, 0.7, 0.14, 0.07, STEEL);
            ctx.save();
            ctx.translate(0.16, -0.3);
            ctx.rotate(look.spin || 0);
            fillRound(ctx, -0.07, -0.07, 0.14, 0.7, 0.07, STEEL_DEEP);
            disc(ctx, 0, 0.64, 0.16, WOOD);
            disc(ctx, -0.04, 0.6, 0.05, 'rgba(255, 255, 255, 0.35)');
            ctx.restore();
            disc(ctx, 0.16, -0.3, 0.06, INK);
        },
    },
    arm: {
        outline(ctx) {
            circlePath(ctx, 0, -0.38, 0.13);
            rectPath(ctx, -0.09, -0.4, 0.18, 0.66, 0.09);
            circlePath(ctx, 0, 0.32, 0.18);
        },
        paint(ctx, look) {
            const c = look.colour || ['#A9D7C8', '#83BFAE'];
            fillRound(ctx, -0.09, -0.4, 0.18, 0.66, 0.09, c[1]);
            fillRound(ctx, -0.035, -0.36, 0.05, 0.56, 0.025, 'rgba(255, 255, 255, 0.3)');
            disc(ctx, 0, -0.38, 0.13, STEEL);
            disc(ctx, 0, -0.38, 0.05, STEEL_DEEP);
            // A claw: two fingers round an open hand.
            ctx.strokeStyle = STEEL_DEEP;
            ctx.lineWidth = 0.08;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(0, 0.34, 0.13, -Math.PI * 0.15, Math.PI * 1.15, true);
            ctx.stroke();
            disc(ctx, 0, 0.24, 0.07, STEEL);
        },
    },
    chimney: {
        outline(ctx) {
            polyPath(ctx, [
                [-0.2, 0.5],
                [0.2, 0.5],
                [0.36, -0.28],
                [-0.36, -0.28],
            ]);
            rectPath(ctx, -0.46, -0.5, 0.92, 0.24, 0.06);
        },
        paint(ctx) {
            ctx.beginPath();
            polyPath(ctx, [
                [-0.2, 0.5],
                [0.2, 0.5],
                [0.36, -0.28],
                [-0.36, -0.28],
            ]);
            ctx.fillStyle = '#4E4038';
            ctx.fill();
            fillRound(ctx, -0.46, -0.5, 0.92, 0.24, 0.06, '#6A5A4E');
            fillRound(ctx, -0.4, -0.46, 0.8, 0.06, 0.03, 'rgba(255, 255, 255, 0.18)');
            fillRound(ctx, -0.12, -0.2, 0.06, 0.6, 0.03, 'rgba(255, 255, 255, 0.12)');
        },
    },
    sail: {
        outline(ctx) {
            polyPath(ctx, [
                [-0.38, -0.5],
                [-0.38, 0.5],
                [0.42, 0.5],
            ]);
        },
        paint(ctx, look) {
            const billow = 0.06 + (look.billow || 0) * 0.05;
            ctx.beginPath();
            ctx.moveTo(-0.38, -0.5);
            ctx.lineTo(-0.38, 0.5);
            ctx.lineTo(0.42, 0.5);
            ctx.quadraticCurveTo(0.02 + billow, -0.02 - billow, -0.38, -0.5);
            ctx.fillStyle = '#FBF6EE';
            ctx.fill();
            ctx.save();
            ctx.clip();
            ctx.fillStyle = look.stripe || '#E79A98';
            ctx.fillRect(-0.4, 0.14, 1, 0.14);
            ctx.restore();
            ctx.strokeStyle = '#E0D4C2';
            ctx.lineWidth = 0.03;
            ctx.stroke();
        },
    },
    horn: {
        outline(ctx) {
            circlePath(ctx, -0.3, 0, 0.2);
            rectPath(ctx, -0.16, -0.07, 0.3, 0.14, 0.05);
            polyPath(ctx, [
                [0.08, -0.09],
                [0.5, -0.27],
                [0.5, 0.27],
                [0.08, 0.09],
            ]);
        },
        paint(ctx, look) {
            const squeeze = look.squeeze || 0;
            fillRound(ctx, -0.16, -0.06, 0.3, 0.12, 0.05, BRASS_DEEP);
            ctx.beginPath();
            polyPath(ctx, [
                [0.08, -0.09],
                [0.5, -0.27],
                [0.5, 0.27],
                [0.08, 0.09],
            ]);
            ctx.fillStyle = BRASS;
            ctx.fill();
            ellipse(ctx, 0.5, 0, 0.05, 0.27);
            ctx.fillStyle = BRASS_DEEP;
            ctx.fill();
            ellipse(ctx, -0.3, 0, 0.2 * (1 - squeeze * 0.25), 0.2 * (1 + squeeze * 0.15));
            ctx.fillStyle = '#E26F6A';
            ctx.fill();
            disc(ctx, -0.36, -0.07, 0.05, 'rgba(255, 255, 255, 0.4)');
        },
    },
    stick: {
        outline(ctx) {
            rectPath(ctx, -0.06, -0.32, 0.12, 0.82, 0.06);
            circlePath(ctx, 0, -0.35, 0.15);
        },
        paint(ctx) {
            fillRound(ctx, -0.05, -0.32, 0.1, 0.82, 0.05, WOOD);
            fillRound(ctx, -0.02, -0.2, 0.03, 0.62, 0.015, 'rgba(255, 255, 255, 0.3)');
            disc(ctx, 0, -0.35, 0.15, '#E26F6A');
            disc(ctx, -0.05, -0.4, 0.05, 'rgba(255, 255, 255, 0.4)');
        },
    },
    bird: {
        outline(ctx) {
            ctx.moveTo(0.3, 0.05);
            ctx.ellipse(0, 0.05, 0.3, 0.24, 0, 0, TAU);
            circlePath(ctx, 0.2, -0.22, 0.17);
            polyPath(ctx, [
                [0.33, -0.27],
                [0.5, -0.2],
                [0.33, -0.14],
            ]);
            polyPath(ctx, [
                [-0.26, -0.02],
                [-0.5, -0.2],
                [-0.42, 0.12],
            ]);
            rectPath(ctx, -0.05, 0.24, 0.1, 0.26, 0.03);
        },
        paint(ctx, look) {
            fillRound(ctx, -0.04, 0.24, 0.08, 0.26, 0.03, WOOD_DEEP);
            ctx.beginPath();
            polyPath(ctx, [
                [-0.26, -0.02],
                [-0.5, -0.2],
                [-0.42, 0.12],
            ]);
            ctx.fillStyle = '#E5C766';
            ctx.fill();
            ellipse(ctx, 0, 0.05, 0.3, 0.24);
            ctx.fillStyle = '#F6DD8A';
            ctx.fill();
            // The wing lifts while it sings.
            ellipse(ctx, -0.04, 0.06, 0.16, 0.1, -0.3 - (look.flap || 0) * 0.6);
            ctx.fillStyle = '#E8C766';
            ctx.fill();
            disc(ctx, 0.2, -0.22, 0.17, '#F6DD8A');
            ctx.beginPath();
            polyPath(ctx, [
                [0.33, -0.27],
                [0.5, -0.2 - (look.flap || 0) * 0.03],
                [0.33, -0.14],
            ]);
            ctx.fillStyle = '#E8A97C';
            ctx.fill();
            disc(ctx, 0.24, -0.25, 0.035, INK);
            disc(ctx, 0.17, -0.15, 0.04, 'rgba(233, 135, 122, 0.45)');
        },
    },
    antenna: {
        outline(ctx) {
            rectPath(ctx, -0.13, -0.18, 0.26, 0.68, 0.06);
            circlePath(ctx, 0, -0.32, 0.18);
        },
        paint(ctx, look) {
            ctx.strokeStyle = STEEL_DEEP;
            ctx.lineWidth = 0.06;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(0, 0.5);
            for (let i = 0; i < 6; i++) ctx.lineTo(i % 2 ? -0.1 : 0.1, 0.4 - i * 0.1);
            ctx.lineTo(0, -0.18);
            ctx.stroke();
            const glow = look.glow || 0;
            if (glow > 0.01)
                disc(ctx, 0, -0.32, 0.18 + glow * 0.14, `rgba(255, 236, 160, ${(0.5 * glow).toFixed(3)})`);
            disc(ctx, 0, -0.32, 0.18, glow > 0.3 ? '#FFE79A' : '#F3D36B');
            disc(ctx, -0.06, -0.38, 0.05, 'rgba(255, 255, 255, 0.5)');
        },
    },
    bell: {
        outline(ctx) {
            ctx.moveTo(-0.42, 0.28);
            ctx.ellipse(0, 0.28, 0.42, 0.56, 0, Math.PI, 0);
            ctx.closePath();
            rectPath(ctx, -0.5, 0.22, 1, 0.24, 0.08);
            circlePath(ctx, 0, -0.34, 0.12);
        },
        paint(ctx, look) {
            ctx.save();
            ctx.rotate(look.swing || 0);
            disc(ctx, 0, -0.34, 0.12, BRASS_DEEP);
            ctx.beginPath();
            ctx.moveTo(-0.42, 0.28);
            ctx.ellipse(0, 0.28, 0.42, 0.56, 0, Math.PI, 0);
            ctx.closePath();
            ctx.fillStyle = BRASS;
            ctx.fill();
            ellipse(ctx, -0.16, -0.02, 0.07, 0.18, 0.25);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.fill();
            fillRound(ctx, -0.5, 0.22, 1, 0.24, 0.08, BRASS_DEEP);
            ctx.restore();
        },
    },
    flag: {
        outline(ctx) {
            polyPath(ctx, [
                [0.5, -0.36],
                [0.5, 0.36],
                [-0.5, 0],
            ]);
        },
        paint(ctx, look) {
            const wave = look.wave || 0;
            ctx.beginPath();
            ctx.moveTo(0.5, -0.36);
            ctx.quadraticCurveTo(0, -0.18 + wave * 0.12, -0.5, wave * 0.1);
            ctx.quadraticCurveTo(0, 0.18 + wave * 0.12, 0.5, 0.36);
            ctx.closePath();
            ctx.fillStyle = look.colour || '#E26F6A';
            ctx.fill();
        },
    },
};

export const PART_NAMES = Object.keys(PARTS);

// A part, `k` across, centred on (x, y), turned `angle` radians: about its middle, or about
// `look.pivot`, a point in its unit box (an arm swings from its shoulder). `look`: the picture's
// moving bits.
export function drawPart(ctx, name, x, y, k, angle = 0, look = {}) {
    ctx.save();
    ctx.translate(x, y);
    if (look.pivot) {
        ctx.translate(look.pivot.x * k, look.pivot.y * k);
        ctx.rotate(angle);
        ctx.translate(-look.pivot.x * k, -look.pivot.y * k);
    } else ctx.rotate(angle);
    ctx.scale(k, k);
    PARTS[name].paint(ctx, look);
    ctx.restore();
}

// The place a part goes, before it is there: its shape in shadow, dashed round. `glow` 0 to 1 brings
// the dashes up, for the moment a gap asks to be noticed.
export function drawGap(ctx, name, x, y, k, angle = 0, glow = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(k, k);
    ctx.beginPath();
    PARTS[name].outline(ctx);
    ctx.fillStyle = HOLE;
    ctx.fill();
    // Dashes and line the same size on the screen, however big the part.
    const px = 1 / Math.max(1, k);
    ctx.setLineDash([7 * px, 5 * px]);
    ctx.lineWidth = (2.6 + glow * 1.8) * px;
    ctx.strokeStyle = glow > 0 ? `rgba(221, 148, 140, ${(0.6 + glow * 0.4).toFixed(3)})` : DASH;
    ctx.stroke();
    ctx.restore();
}

// A part's shadow, lying under it as it is carried.
export function drawPartShadow(ctx, name, x, y, k, angle = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(k, k);
    ctx.beginPath();
    PARTS[name].outline(ctx);
    ctx.fillStyle = 'rgba(92, 70, 58, 0.18)';
    ctx.fill();
    ctx.restore();
}

//==============================================================================
// The toys. Each is drawn standing on the origin, `s` tall; `st` says which parts it has, how much it
// is working, the time, its colours, and anything moving in it.

function wheelAt(ctx, x, y, r, spin) {
    drawPart(ctx, 'wheel', x, y, r * 2, 0, { spin });
}

// Draw a toy's slot: the part, if it is there, or the gap it leaves.
function slot(ctx, kind, name, s, st, angle = 0, look = {}) {
    const at = SLOTS[kind][name];
    if (!at) return;
    if (st.has[name]) drawPart(ctx, name, at.x * s, at.y * s, at.size * s, angle, look);
    else if (st.gaps !== false && (st.need || []).indexOf(name) >= 0)
        drawGap(ctx, name, at.x * s, at.y * s, at.size * s, 0, st.glow || 0);
}

const TOY_DRAW = {
    car(ctx, s, st) {
        const [body, deep] = st.colour;
        const spin = st.spin || 0;
        const bump = Math.sin(st.t * 22) * 0.008 * st.on;
        ctx.save();
        ctx.translate(0, bump * s);
        fillRound(ctx, -0.26 * s, -0.68 * s, 0.48 * s, 0.34 * s, 0.13 * s, body);
        fillRound(ctx, -0.2 * s, -0.62 * s, 0.17 * s, 0.17 * s, 0.06 * s, '#DCEEF6');
        fillRound(ctx, 0.0 * s, -0.62 * s, 0.16 * s, 0.17 * s, 0.06 * s, '#DCEEF6');
        fillRound(ctx, -0.17 * s, -0.6 * s, 0.05 * s, 0.1 * s, 0.025 * s, 'rgba(255, 255, 255, 0.6)');
        fillRound(ctx, -0.49 * s, -0.45 * s, 0.98 * s, 0.3 * s, 0.11 * s, body);
        fillRound(ctx, -0.49 * s, -0.24 * s, 0.98 * s, 0.09 * s, 0.045 * s, deep);
        ctx.strokeStyle = deep;
        ctx.lineWidth = 0.015 * s;
        ctx.beginPath();
        ctx.moveTo(-0.02 * s, -0.43 * s);
        ctx.lineTo(-0.02 * s, -0.26 * s);
        ctx.stroke();
        fillRound(ctx, 0.06 * s, -0.38 * s, 0.07 * s, 0.025 * s, 0.012 * s, deep);
        disc(ctx, 0.44 * s, -0.35 * s, 0.045 * s, '#FFF1BF');
        disc(ctx, -0.46 * s, -0.35 * s, 0.03 * s, '#F6B8A8');
        ctx.restore();
        wheelAt(ctx, 0.27 * s, -0.14 * s, 0.135 * s, spin);
        slot(ctx, 'car', 'wheel', s, st, 0, { spin });
        slot(ctx, 'car', 'horn', s, st, 0, { squeeze: st.honk || 0 });
    },

    drum(ctx, s, st) {
        const [body, deep] = st.colour;
        const top = -0.57 * s;
        const bottom = -0.07 * s;
        const rx = 0.36 * s;
        const ry = 0.1 * s;
        const bounce = (st.ring || 0) * 0.02 * s;
        ctx.save();
        ctx.translate(0, bounce);
        ellipse(ctx, 0, bottom, rx, ry);
        ctx.fillStyle = deep;
        ctx.fill();
        ctx.fillStyle = body;
        ctx.fillRect(-rx, top, rx * 2, bottom - top);
        // The cord laced round the shell.
        ctx.strokeStyle = '#FBF3E4';
        ctx.lineWidth = 0.018 * s;
        ctx.beginPath();
        const n = 7;
        for (let i = 0; i <= n; i++) {
            const x = -rx + (i / n) * rx * 2;
            const y = i % 2 ? bottom - 0.06 * s : top + 0.08 * s;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        fillRound(ctx, -rx - 0.01 * s, top - 0.01 * s, rx * 2 + 0.02 * s, 0.07 * s, 0.03 * s, deep);
        fillRound(ctx, -rx - 0.01 * s, bottom - 0.06 * s, rx * 2 + 0.02 * s, 0.07 * s, 0.03 * s, deep);
        ellipse(ctx, 0, top, rx, ry);
        ctx.fillStyle = shade(deep, -0.35);
        ctx.fill();
        ctx.restore();
        slot(ctx, 'drum', 'skin', s, st, 0, { ring: st.ring || 0 });
        // The stick leans on the shell, and swings to strike as the drum plays.
        slot(ctx, 'drum', 'stick', s, st, -(st.ring || 0) * 0.5, { pivot: { x: 0, y: 0.5 } });
    },

    musicbox(ctx, s, st) {
        const [body, deep] = st.colour;
        fillRound(ctx, -0.34 * s, -0.08 * s, 0.1 * s, 0.08 * s, 0.03 * s, WOOD_DEEP);
        fillRound(ctx, 0.24 * s, -0.08 * s, 0.1 * s, 0.08 * s, 0.03 * s, WOOD_DEEP);
        fillRound(ctx, -0.38 * s, -0.52 * s, 0.76 * s, 0.46 * s, 0.05 * s, body);
        fillRound(ctx, -0.41 * s, -0.6 * s, 0.82 * s, 0.11 * s, 0.04 * s, deep);
        // A flower on the front, in the playroom's colours.
        for (let i = 0; i < 5; i++) {
            const a = (i * TAU) / 5 - Math.PI / 2;
            disc(ctx, Math.cos(a) * 0.07 * s, -0.3 * s + Math.sin(a) * 0.07 * s, 0.05 * s, '#FBF3E4');
        }
        disc(ctx, 0, -0.3 * s, 0.045 * s, deep);
        // The bird turns on its post and lifts its wing as the tune plays.
        const turn = st.on > 0 ? Math.sin(st.t * 3) * 0.25 * st.on : 0;
        slot(ctx, 'musicbox', 'bird', s, st, turn, { flap: Math.max(0, Math.sin(st.t * 9)) * st.on });
        slot(ctx, 'musicbox', 'crank', s, st, 0, { spin: st.spin || 0 });
    },

    robot(ctx, s, st) {
        const [body, deep] = st.colour;
        const on = st.on;
        fillRound(ctx, -0.15 * s, -0.14 * s, 0.1 * s, 0.13 * s, 0.03 * s, STEEL_DEEP);
        fillRound(ctx, 0.05 * s, -0.14 * s, 0.1 * s, 0.13 * s, 0.03 * s, STEEL_DEEP);
        fillRound(ctx, -0.19 * s, -0.05 * s, 0.16 * s, 0.06 * s, 0.03 * s, deep);
        fillRound(ctx, 0.03 * s, -0.05 * s, 0.16 * s, 0.06 * s, 0.03 * s, deep);
        // The arm it still has hangs at its side, and waves when the other is mended.
        const wave = on > 0 ? Math.sin(st.t * 7) * 0.5 * on : 0;
        drawPart(ctx, 'arm', -0.33 * s, -0.37 * s, 0.36 * s, -wave * 0.4, {
            colour: st.colour,
            pivot: SHOULDER,
        });
        fillRound(ctx, -0.26 * s, -0.58 * s, 0.52 * s, 0.46 * s, 0.07 * s, body);
        fillRound(ctx, -0.16 * s, -0.5 * s, 0.32 * s, 0.22 * s, 0.04 * s, shade(body, 0.35));
        const lights = ['#E79A98', '#F1CF5E', '#8EBF7A'];
        lights.forEach((colour, i) => {
            const lit = on > 0 && Math.floor(st.t * 6 + i) % 3 === 0;
            disc(ctx, (-0.08 + i * 0.08) * s, -0.39 * s, 0.032 * s, lit ? '#FFF6D6' : colour);
        });
        fillRound(ctx, -0.05 * s, -0.63 * s, 0.1 * s, 0.07 * s, 0.02 * s, STEEL_DEEP);
        fillRound(ctx, -0.2 * s, -0.88 * s, 0.4 * s, 0.28 * s, 0.08 * s, body);
        fillRound(ctx, -0.15 * s, -0.84 * s, 0.3 * s, 0.2 * s, 0.06 * s, '#3F4E58');
        // Eyes: round while it waits, happy arcs while it works.
        if (on > 0.3) {
            ctx.strokeStyle = '#BFF2E4';
            ctx.lineWidth = 0.025 * s;
            ctx.lineCap = 'round';
            for (const ex of [-0.065, 0.065]) {
                ctx.beginPath();
                ctx.arc(ex * s, -0.73 * s, 0.035 * s, Math.PI * 1.1, Math.PI * 1.9);
                ctx.stroke();
            }
        } else {
            for (const ex of [-0.065, 0.065]) {
                ellipse(ctx, ex * s, -0.75 * s, 0.03 * s, 0.04 * s);
                ctx.fillStyle = '#BFF2E4';
                ctx.fill();
            }
        }
        ctx.strokeStyle = '#BFF2E4';
        ctx.lineWidth = 0.018 * s;
        ctx.beginPath();
        ctx.arc(0, -0.71 * s, 0.05 * s, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();
        slot(ctx, 'robot', 'antenna', s, st, 0, { glow: on > 0 ? 0.5 + 0.5 * Math.sin(st.t * 8) : 0 });
        slot(ctx, 'robot', 'arm', s, st, wave * 0.9, { colour: st.colour, pivot: SHOULDER });
    },

    train(ctx, s, st) {
        const [body, deep] = st.colour;
        const spin = st.spin || 0;
        // The cab at the back, the boiler in front, on a frame over three wheels.
        fillRound(ctx, 0.14 * s, -0.66 * s, 0.34 * s, 0.5 * s, 0.04 * s, body);
        fillRound(ctx, 0.1 * s, -0.71 * s, 0.42 * s, 0.07 * s, 0.03 * s, deep);
        fillRound(ctx, 0.21 * s, -0.6 * s, 0.2 * s, 0.15 * s, 0.04 * s, '#DCEEF6');
        fillRound(ctx, -0.46 * s, -0.44 * s, 0.64 * s, 0.28 * s, 0.13 * s, body);
        for (const x of [-0.3, -0.12, 0.04])
            fillRound(ctx, x * s, -0.44 * s, 0.03 * s, 0.28 * s, 0.015 * s, deep);
        ellipse(ctx, -0.46 * s, -0.3 * s, 0.04 * s, 0.13 * s);
        ctx.fillStyle = deep;
        ctx.fill();
        fillRound(ctx, -0.5 * s, -0.19 * s, 1.0 * s, 0.07 * s, 0.03 * s, INK);
        ctx.beginPath();
        polyPath(ctx, [
            [-0.5 * s, -0.16 * s],
            [-0.6 * s, -0.04 * s],
            [-0.44 * s, -0.04 * s],
        ]);
        ctx.fillStyle = deep;
        ctx.fill();
        for (const x of [-0.3, -0.06, 0.28]) {
            disc(ctx, x * s, -0.1 * s, 0.1 * s, '#E26F6A');
            disc(ctx, x * s, -0.1 * s, 0.035 * s, '#FBF3E4');
            const a = spin;
            disc(ctx, (x + Math.cos(a) * 0.06) * s, (-0.1 + Math.sin(a) * 0.06) * s, 0.018 * s, INK);
        }
        ctx.strokeStyle = STEEL_DEEP;
        ctx.lineWidth = 0.025 * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo((-0.3 + Math.cos(spin) * 0.06) * s, (-0.1 + Math.sin(spin) * 0.06) * s);
        ctx.lineTo((-0.06 + Math.cos(spin) * 0.06) * s, (-0.1 + Math.sin(spin) * 0.06) * s);
        ctx.stroke();
        slot(ctx, 'train', 'chimney', s, st);
        slot(ctx, 'train', 'bell', s, st, 0, { swing: st.on > 0 ? Math.sin(st.t * 12) * 0.25 * st.on : 0 });
    },

    boat(ctx, s, st) {
        const [body, deep] = st.colour;
        const on = st.on;
        // The mast, the hull, and the sea under it while it sails.
        fillRound(ctx, -0.02 * s, -0.94 * s, 0.04 * s, 0.7 * s, 0.02 * s, WOOD_DEEP);
        slot(ctx, 'boat', 'sail', s, st, 0, { billow: on, stripe: deep });
        slot(ctx, 'boat', 'flag', s, st, 0, { wave: on > 0 ? Math.sin(st.t * 10) : 0, colour: '#E26F6A' });
        ctx.beginPath();
        ctx.moveTo(-0.5 * s, -0.3 * s);
        ctx.lineTo(0.5 * s, -0.3 * s);
        ctx.quadraticCurveTo(0.42 * s, -0.02 * s, 0.26 * s, -0.02 * s);
        ctx.lineTo(-0.26 * s, -0.02 * s);
        ctx.quadraticCurveTo(-0.42 * s, -0.02 * s, -0.5 * s, -0.3 * s);
        ctx.closePath();
        ctx.fillStyle = body;
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#FBF6EE';
        ctx.fillRect(-0.5 * s, -0.22 * s, s, 0.06 * s);
        ctx.fillStyle = deep;
        ctx.fillRect(-0.5 * s, -0.08 * s, s, 0.08 * s);
        ctx.restore();
        for (const x of [-0.24, 0, 0.24]) {
            disc(ctx, x * s, -0.25 * s, 0.035 * s, '#FBF6EE');
            disc(ctx, x * s, -0.25 * s, 0.022 * s, '#9FC6E4');
        }
        fillRound(ctx, -0.52 * s, -0.33 * s, 1.04 * s, 0.05 * s, 0.025 * s, deep);
    },
};

// A toy, `s` tall, standing on (x, y). `st`: { has: { part: true }, need: [parts missing],
// colour: [body, deep], on: 0..1, t: seconds, spin, ring, honk, glow }.
export function drawToy(ctx, kind, x, y, s, st) {
    ctx.save();
    ctx.translate(x, y);
    TOY_DRAW[kind](ctx, s, st);
    ctx.restore();
}

// The sea a boat floats on while it sails: two soft lines of waves.
export function drawWaves(ctx, x, y, s, t, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.strokeStyle = '#7FB2DE';
    ctx.lineWidth = 0.025 * s;
    ctx.lineCap = 'round';
    for (const [dy, k] of [
        [0.0, 1],
        [0.06, 0.7],
    ]) {
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
            const px = x + (-0.62 + (i / 12) * 1.24) * s * k;
            const py = y + (dy + Math.sin(t * 4 + i * 0.9) * 0.015) * s;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
    }
    ctx.restore();
}

// The screwdriver, lying along +x from its tip at the origin, `k` long: a steel shaft and a fat
// handle in the playroom's coral.
export function drawScrewdriver(ctx, x, y, k, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(k, k);
    fillRound(ctx, 0, -0.025, 0.5, 0.05, 0.02, STEEL);
    ctx.beginPath();
    polyPath(ctx, [
        [0, -0.04],
        [0.06, -0.025],
        [0.06, 0.025],
        [0, 0.04],
    ]);
    ctx.fillStyle = STEEL_DEEP;
    ctx.fill();
    fillRound(ctx, 0.46, -0.09, 0.54, 0.18, 0.09, '#E98C80');
    for (let i = 0; i < 3; i++) fillRound(ctx, 0.56 + i * 0.12, -0.075, 0.05, 0.15, 0.025, '#D2716A');
    ctx.restore();
}

// A screw's head, `r` across, its slot turned `angle`; `home` 0 to 1 is how far it is in.
export function drawScrew(ctx, x, y, r, angle, home) {
    disc(ctx, x, y, r * (1.1 - home * 0.15), 'rgba(92, 70, 58, 0.18)');
    disc(ctx, x, y, r, home >= 1 ? STEEL_DEEP : STEEL);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = INK;
    ctx.fillRect(-r * 0.7, -r * 0.14, r * 1.4, r * 0.28);
    ctx.restore();
}

// The dream: a thought bubble over the toy, round from little bubbles below it. `k` 0 to 1 as it
// grows and fades.
export function drawBubble(ctx, x, y, r, from, k) {
    if (k <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = clamp(k, 0, 1);
    for (let i = 0; i < 3; i++) {
        const f = (i + 1) / 4;
        disc(
            ctx,
            from.x + (x - from.x) * f * 0.8,
            from.y + (y + r * 0.8 - from.y) * f,
            r * (0.06 + i * 0.04),
            '#FFFDF8'
        );
    }
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        disc(ctx, x + Math.cos(a) * r * 0.82, y + Math.sin(a) * r * 0.62, r * 0.3, '#FFFDF8');
    }
    ellipse(ctx, x, y, r * 0.95, r * 0.75);
    ctx.fillStyle = '#FFFDF8';
    ctx.fill();
    ctx.restore();
}

// A cheap rounded box for the bench's things, kept here so the shop's file is about the shop.
export { roundRect };
