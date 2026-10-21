// Drawing at the island's angle: boxes, roofs and what is painted on their walls, for the buildings
// of the farm and the building site.
//
// A frame is one tile as the screen shows it: `cx`, `cy`, the middle of its top, and `tw`, its
// width. A point in a frame is (u, v, z): u and v across the tile from its middle, in tiles, so its
// edges are at -0.5 and 0.5, u running down to the right and v down to the left; z is the height
// above the ground, in tile widths. Of a box, the top and two walls can be seen: the right wall,
// facing +u, which the light falls on, and the left wall, facing +v, in shade.

import { shade } from '../util.js';

export function frame(cx, cy, tw) {
    return { cx, cy, tw };
}

// A point of the frame on the screen.
export function pt(f, u, v, z = 0) {
    return [f.cx + ((u - v) * f.tw) / 2, f.cy + ((u + v) * f.tw) / 4 - z * f.tw];
}

// A flat shape through points of the frame, each [u, v, z].
export function poly(ctx, f, points, colour) {
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
        const [x, y] = pt(f, points[i][0], points[i][1], points[i][2] || 0);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
    }
    ctx.closePath();
    if (colour) {
        ctx.fillStyle = colour;
        ctx.fill();
    }
}

// A line between two points of the frame, `width` in screen pixels.
export function edge(ctx, f, a, b, width, colour) {
    const [x0, y0] = pt(f, a[0], a[1], a[2] || 0);
    const [x1, y1] = pt(f, b[0], b[1], b[2] || 0);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.strokeStyle = colour;
    ctx.stroke();
}

// The soft shadow a building casts on the ground, a little to the back and left, away from the
// light.
export function footprint(ctx, f, u0, v0, u1, v1, grow = 0.06) {
    poly(
        ctx,
        f,
        [
            [u0 - grow, v0 - grow * 0.4],
            [u1 + grow * 0.4, v0 - grow * 0.4],
            [u1 + grow * 0.4, v1 + grow],
            [u0 - grow, v1 + grow],
        ],
        'rgba(112, 84, 58, 0.13)'
    );
}

// A box, its footprint from (u0, v0) to (u1, v1), from z0 up to z1. `colour` is the lit wall's;
// the shaded wall and the top are worked out from it unless given.
export function box(ctx, f, u0, v0, u1, v1, z0, z1, colour, o = {}) {
    const left = o.left || shade(colour, -0.12);
    const top = o.top || shade(colour, 0.08);
    poly(
        ctx,
        f,
        [
            [u0, v1, z0],
            [u1, v1, z0],
            [u1, v1, z1],
            [u0, v1, z1],
        ],
        left
    );
    poly(
        ctx,
        f,
        [
            [u1, v1, z0],
            [u1, v0, z0],
            [u1, v0, z1],
            [u1, v1, z1],
        ],
        colour
    );
    if (o.noTop) return;
    poly(
        ctx,
        f,
        [
            [u0, v0, z1],
            [u1, v0, z1],
            [u1, v1, z1],
            [u0, v1, z1],
        ],
        top
    );
}

// Draw on a wall in its own terms: `a` along it, from its left end as the screen shows it, in
// tiles, and z up it, in tile widths, so a window is a rectangle. The left wall stands at v = `at`
// and runs along u from `from`; the right wall stands at u = `at` and runs along v from `from`, its
// front end, back towards smaller v.
export function onWall(ctx, f, side, at, from, draw) {
    ctx.save();
    if (side === 'left') {
        const [x0, y0] = pt(f, from, at, 0);
        ctx.transform(f.tw / 2, f.tw / 4, 0, -f.tw, x0, y0);
    } else {
        const [x0, y0] = pt(f, at, from, 0);
        ctx.transform(f.tw / 2, -f.tw / 4, 0, -f.tw, x0, y0);
    }
    draw(ctx);
    ctx.restore();
}

// A point of a wall, in its own terms, on the screen.
export function wallPt(f, side, at, from, a, z) {
    return side === 'left' ? pt(f, from + a, at, z) : pt(f, at, from - a, z);
}

// A rectangle on a wall, as a path on the screen, for clipping to a doorway or a window.
export function wallRect(ctx, f, side, at, from, a0, z0, a1, z1) {
    const corners = [
        wallPt(f, side, at, from, a0, z0),
        wallPt(f, side, at, from, a1, z0),
        wallPt(f, side, at, from, a1, z1),
        wallPt(f, side, at, from, a0, z1),
    ];
    ctx.beginPath();
    ctx.moveTo(corners[0][0], corners[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
    ctx.closePath();
}

// A pitched roof over the box (u0, v0)-(u1, v1) whose walls end at `z`, rising by `rise` to a ridge
// that runs along u (`along` 'u': the gable ends face +u and -u, and the right wall carries a
// gable) or along v (the gable ends face +v and -v, and the left wall carries it). `wall` is the
// lit wall colour, for the gable; `o.overhang` how far the roof reaches past the walls; `o.trim` a
// colour for its edges; `o.gableEnd` draws on the gable before the near slope covers its edge.
export function gable(ctx, f, u0, v0, u1, v1, z, rise, along, roof, wall, o = {}) {
    const h = o.overhang === undefined ? 0.04 : o.overhang;
    const drop = h * 0.5;
    const back = shade(roof, -0.14);
    const top = z + rise;
    if (along === 'u') {
        const vm = (v0 + v1) / 2;
        // The far slope shows only as the edge of the roof past the gable.
        poly(
            ctx,
            f,
            [
                [u0 - h, v0 - h, z - drop],
                [u1 + h, v0 - h, z - drop],
                [u1 + h, vm, top],
                [u0 - h, vm, top],
            ],
            back
        );
        poly(
            ctx,
            f,
            [
                [u1, v1, z],
                [u1, v0, z],
                [u1, vm, top],
            ],
            wall
        );
        if (o.gableEnd) o.gableEnd();
        poly(
            ctx,
            f,
            [
                [u0 - h, v1 + h, z - drop],
                [u1 + h, v1 + h, z - drop],
                [u1 + h, vm, top],
                [u0 - h, vm, top],
            ],
            roof
        );
        if (o.trim) {
            const w = Math.max(1, f.tw * 0.018);
            edge(ctx, f, [u1 + h, v1 + h, z - drop], [u1 + h, vm, top], w, o.trim);
            edge(ctx, f, [u1 + h, vm, top], [u1 + h, v0 - h, z - drop], w, o.trim);
            edge(ctx, f, [u0 - h, vm, top], [u1 + h, vm, top], w * 0.8, o.trim);
        }
    } else {
        const um = (u0 + u1) / 2;
        poly(
            ctx,
            f,
            [
                [u0 - h, v0 - h, z - drop],
                [u0 - h, v1 + h, z - drop],
                [um, v1 + h, top],
                [um, v0 - h, top],
            ],
            back
        );
        poly(
            ctx,
            f,
            [
                [u0, v1, z],
                [u1, v1, z],
                [um, v1, top],
            ],
            shade(wall, -0.12)
        );
        if (o.gableEnd) o.gableEnd();
        poly(
            ctx,
            f,
            [
                [u1 + h, v0 - h, z - drop],
                [u1 + h, v1 + h, z - drop],
                [um, v1 + h, top],
                [um, v0 - h, top],
            ],
            roof
        );
        if (o.trim) {
            const w = Math.max(1, f.tw * 0.018);
            edge(ctx, f, [u0 - h, v1 + h, z - drop], [um, v1 + h, top], w, o.trim);
            edge(ctx, f, [um, v1 + h, top], [u1 + h, v1 + h, z - drop], w, o.trim);
            edge(ctx, f, [um, v0 - h, top], [um, v1 + h, top], w * 0.8, o.trim);
        }
    }
}

// The height of a roof's near slope above (u, v): for setting a chimney into it.
export function roofAt(u0, v0, u1, v1, z, rise, along, u, v) {
    if (along === 'u') {
        const vm = (v0 + v1) / 2;
        const half = (v1 - v0) / 2;
        return z + rise * (1 - Math.min(1, Math.abs(v - vm) / half));
    }
    const um = (u0 + u1) / 2;
    const half = (u1 - u0) / 2;
    return z + rise * (1 - Math.min(1, Math.abs(u - um) / half));
}

// A small island of tiles, for a toy's picture on the shelf: `tiles` are [c, r] on a grid whose top
// corner is at (x, y), each tile `tw` wide; `look` has the colours of the board's ground (see
// board.js), and `top(c, r)` gives each tile's own top, if not the ground's. Returns the middle of
// any tile's top, for standing things on.
export function island(ctx, x, y, tw, tiles, look, top) {
    const th = tw / 2;
    const d = tw * 0.17;
    const at = (u, v) => [x + ((u - v) * tw) / 2, y + ((u + v) * th) / 2];
    const has = (c, r) => tiles.some(([a, b]) => a === c && b === r);
    const quad = (points, colour, dy = 0) => {
        ctx.beginPath();
        points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py + dy) : ctx.moveTo(px, py + dy)));
        ctx.closePath();
        ctx.fillStyle = colour;
        ctx.fill();
    };
    for (const [c, r] of tiles)
        quad(
            [at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)],
            'rgba(112, 84, 58, 0.14)',
            d + tw * 0.05
        );
    for (const [c, r] of tiles) {
        for (const [right, ok] of [
            [true, !has(c + 1, r)],
            [false, !has(c, r + 1)],
        ]) {
            if (!ok) continue;
            const a = right ? at(c + 1, r) : at(c, r + 1);
            const b = at(c + 1, r + 1);
            const band = (y0, y1, colour) =>
                quad(
                    [
                        [a[0], a[1] + y0],
                        [b[0], b[1] + y0],
                        [b[0], b[1] + y1],
                        [a[0], a[1] + y1],
                    ],
                    colour
                );
            band(-0.5, d * 0.3, right ? look.lip : look.lipDark);
            band(d * 0.3, d, right ? look.side : look.sideDark);
        }
    }
    for (const [c, r] of tiles) {
        quad(
            [at(c, r), at(c + 1, r), at(c + 1, r + 1), at(c, r + 1)],
            (top && top(c, r)) || ((c + r) % 2 ? look.alt : look.base)
        );
    }
    return (c, r) => at(c + 0.5, r + 0.5);
}
