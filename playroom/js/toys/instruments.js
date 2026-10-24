// Instruments that more than one game plays: the big toy drum (Weather Song's thunder, Freeze
// Parade's beat) and the tambourine (the parade's ducks). Drawn the same wherever they are, so a
// child who has met the drum in one game knows it in the next.

import { ellipse, disc, fillRound } from '../draw.js';

// The big drum: a toy drum, its skin on top, hoops round both ends and the cord laced in a zigzag
// between them, and two beaters lying across it. Centred on (x, y), `r` its radius. `press` pushes
// the skin in, a spring's value; `ring` (1 to 0) is a ring spreading on the skin after a beat.
export function drawDrum(ctx, x, y, r, u, press = 0, ring = 0) {
    const ry = r * 0.32;
    const top = y - r * 0.3 + press * 0.4 * u;
    const depth = r * 0.78;
    const bottom = top + depth;
    ellipse(ctx, x, bottom + ry * 0.5, r * 1.1, r * 0.2);
    ctx.fillStyle = 'rgba(92, 70, 58, 0.14)';
    ctx.fill();
    // The shell.
    ctx.beginPath();
    ctx.moveTo(x - r, top);
    ctx.lineTo(x - r, bottom);
    ctx.ellipse(x, bottom, r, ry, 0, Math.PI, 0, true);
    ctx.lineTo(x + r, top);
    ctx.closePath();
    ctx.fillStyle = '#E8D3B0';
    ctx.fill();
    // The cord, laced between the hoops on the front of the drum.
    const front = (px, py) => py + Math.sqrt(Math.max(0, 1 - Math.pow((px - x) / r, 2))) * ry;
    ctx.strokeStyle = '#B98A62';
    ctx.lineWidth = 3 * u;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const n = 8;
    for (let i = 0; i <= n; i++) {
        const px = x - r * 0.94 + (i * r * 1.88) / n;
        const py = i % 2 ? front(px, bottom) - r * 0.08 : front(px, top) + r * 0.1;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
    }
    ctx.stroke();
    // The hoops.
    ctx.strokeStyle = '#A97F57';
    ctx.lineWidth = 9 * u;
    ctx.beginPath();
    ctx.ellipse(x, bottom - 4 * u, r, ry, 0, 0, Math.PI);
    ctx.stroke();
    ellipse(ctx, x, top, r, ry);
    ctx.fillStyle = '#A97F57';
    ctx.fill();
    // The skin, and a ring spreading on it after a beat.
    ellipse(ctx, x, top, r * 0.92, ry * 0.86);
    ctx.fillStyle = '#F7EDDC';
    ctx.fill();
    if (ring > 0) {
        ctx.strokeStyle = `rgba(169, 127, 87, ${(ring * 0.6).toFixed(3)})`;
        ctx.lineWidth = 2 * u;
        const k = 1 - ring;
        ellipse(ctx, x, top, r * (0.2 + k * 0.68), ry * (0.2 + k * 0.62));
        ctx.stroke();
    }
    // Two beaters, crossed, resting on the skin.
    for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(x + side * r * 0.18, top - ry * 0.1);
        ctx.rotate(side * 0.5);
        ctx.strokeStyle = '#C9A47A';
        ctx.lineWidth = 6 * u;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(0, ry * 0.5);
        ctx.lineTo(0, -r * 0.42);
        ctx.stroke();
        disc(ctx, 0, -r * 0.46, 10 * u, '#EFE3D0');
        ctx.restore();
    }
    return top;
}

// The tambourine: a wooden ring with a skin, and pairs of little brass jingles set round it, seen
// a little from above. `shake` (a spring's value) rocks it; `ring` (1 to 0) glints the jingles.
export function drawTambourine(ctx, x, y, r, u, shake = 0, ring = 0) {
    ellipse(ctx, x, y + r * 0.5, r * 1.05, r * 0.18);
    ctx.fillStyle = 'rgba(92, 70, 58, 0.14)';
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(shake * 0.05);
    const ry = r * 0.42;
    // The rim's side, then its top edge, then the skin inside it.
    ctx.beginPath();
    ctx.ellipse(0, r * 0.14, r, ry, 0, 0, Math.PI);
    ctx.lineTo(-r, 0);
    ctx.ellipse(0, 0, r, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = '#D2AF84';
    ctx.fill();
    ellipse(ctx, 0, 0, r, ry);
    ctx.fillStyle = '#E5CBA5';
    ctx.fill();
    ellipse(ctx, 0, 0, r * 0.84, ry * 0.8);
    ctx.fillStyle = '#F7EDDC';
    ctx.fill();
    // The jingles, in slots round the rim: brighter as they ring.
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const jx = Math.cos(a) * r * 0.93;
        const jy = Math.sin(a) * ry * 0.93 + r * 0.06;
        const jiggle = ring * Math.sin(i * 2.1 + ring * 20) * 2 * u;
        fillRound(ctx, jx - r * 0.12, jy - r * 0.06, r * 0.24, r * 0.12, r * 0.06, '#A97F57');
        ellipse(ctx, jx + jiggle, jy, r * 0.1, r * 0.06);
        ctx.fillStyle = ring > 0.05 ? '#F6DD8A' : '#E5C766';
        ctx.fill();
    }
    ctx.restore();
}
