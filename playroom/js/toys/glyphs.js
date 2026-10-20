// Lowercase letters and the numerals 0 to 9, as the strokes a hand makes to write them.
//
// One description serves three purposes, so they can never disagree: drawn thickly it is the sand
// letter on the board; measured against a finger it says whether the finger is on the sand; and
// followed point by point it is the demonstration, a guide's finger tracing the letter in the
// direction it is written.
//
// The forms are a plain schoolbook print: a single-storey a and g, circles started at about two
// o'clock and drawn anticlockwise, stems drawn downwards. Units: the x-height is 1, the baseline is
// y = 0, and up is negative, as on a canvas. Ascenders reach -1.7, descenders 0.65, numerals -1.5.
// Angles are degrees on the canvas convention: 0 is to the right, 90 is down, and decreasing angle
// runs anticlockwise on screen.

const STEP = 0.04;

function line(x0, y0, x1, y1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / STEP));
    const points = [];
    for (let i = 0; i <= n; i++) points.push([x0 + (x1 - x0) * (i / n), y0 + (y1 - y0) * (i / n)]);
    return points;
}

function arc(cx, cy, rx, ry, from, to) {
    const a0 = (from * Math.PI) / 180;
    const a1 = (to * Math.PI) / 180;
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * Math.max(rx, ry)) / STEP));
    const points = [];
    for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * (i / n);
        points.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return points;
}

function curve(x0, y0, x1, y1, x2, y2, x3, y3) {
    const points = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const m = 1 - t;
        points.push([
            m * m * m * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t * t * t * x3,
            m * m * m * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t * t * t * y3,
        ]);
    }
    return points;
}

// A dot is a very short stroke: tapped rather than traced, as on the real board.
function dot(x, y) {
    return arc(x, y, 0.03, 0.03, 0, 360);
}

// Join segments into one continuous stroke, dropping the duplicated joint points.
function stroke(...segments) {
    const points = [];
    for (const segment of segments) {
        for (const p of segment) {
            const last = points[points.length - 1];
            if (!last || Math.abs(last[0] - p[0]) > 1e-6 || Math.abs(last[1] - p[1]) > 1e-6) points.push(p);
        }
    }
    return points;
}

// The bowl shared by a, d, g and q: started at two o'clock, anticlockwise all the way round.
const bowl = () => arc(0.46, -0.5, 0.46, 0.5, -30, -390);

const LETTERS = {
    a: [bowl(), line(0.92, -1, 0.92, 0)],
    b: [line(0, -1.7, 0, 0), arc(0.46, -0.5, 0.46, 0.5, 180, 540)],
    c: [arc(0.46, -0.5, 0.46, 0.5, -40, -320)],
    d: [bowl(), line(0.92, -1.7, 0.92, 0)],
    e: [stroke(line(0.02, -0.5, 0.9, -0.5), arc(0.46, -0.5, 0.44, 0.5, 0, -320))],
    f: [stroke(arc(0.6, -1.4, 0.3, 0.3, -30, -180), line(0.3, -1.4, 0.3, 0)), line(0.02, -1, 0.62, -1)],
    g: [bowl(), stroke(line(0.92, -1, 0.92, 0.35), arc(0.62, 0.35, 0.3, 0.3, 0, 155))],
    h: [line(0, -1.7, 0, 0), stroke(arc(0.43, -0.55, 0.43, 0.45, 180, 360), line(0.86, -0.55, 0.86, 0))],
    i: [line(0.1, -1, 0.1, 0), dot(0.1, -1.38)],
    j: [stroke(line(0.55, -1, 0.55, 0.35), arc(0.25, 0.35, 0.3, 0.3, 0, 160)), dot(0.55, -1.38)],
    k: [line(0, -1.7, 0, 0), stroke(line(0.7, -1, 0.04, -0.42), line(0.04, -0.42, 0.74, 0))],
    l: [line(0.1, -1.7, 0.1, 0)],
    m: [
        line(0, -1, 0, 0),
        stroke(arc(0.27, -0.6, 0.27, 0.4, 180, 360), line(0.54, -0.6, 0.54, 0)),
        stroke(arc(0.81, -0.6, 0.27, 0.4, 180, 360), line(1.08, -0.6, 1.08, 0)),
    ],
    n: [line(0, -1, 0, 0), stroke(arc(0.43, -0.55, 0.43, 0.45, 180, 360), line(0.86, -0.55, 0.86, 0))],
    o: [arc(0.48, -0.5, 0.48, 0.5, -90, -450)],
    p: [line(0, -1, 0, 0.65), arc(0.46, -0.5, 0.46, 0.5, 180, 540)],
    q: [bowl(), line(0.92, -1, 0.92, 0.65)],
    r: [line(0, -1, 0, 0), arc(0.42, -0.58, 0.42, 0.42, 180, 315)],
    s: [stroke(arc(0.45, -0.75, 0.38, 0.25, -25, -270), arc(0.45, -0.25, 0.42, 0.25, -90, 155))],
    t: [stroke(line(0.3, -1.45, 0.3, -0.25), arc(0.55, -0.25, 0.25, 0.25, 180, 70)), line(0, -1, 0.62, -1)],
    u: [
        stroke(line(0, -1, 0, -0.45), arc(0.43, -0.45, 0.43, 0.45, 180, 0), line(0.86, -0.45, 0.86, -1)),
        line(0.86, -1, 0.86, 0),
    ],
    v: [stroke(line(0, -1, 0.45, 0), line(0.45, 0, 0.9, -1))],
    w: [
        stroke(
            line(0, -1, 0.28, 0),
            line(0.28, 0, 0.56, -0.8),
            line(0.56, -0.8, 0.84, 0),
            line(0.84, 0, 1.12, -1)
        ),
    ],
    x: [line(0, -1, 0.84, 0), line(0.84, -1, 0, 0)],
    y: [line(0, -1, 0.49, 0), line(0.94, -1, 0.2, 0.65)],
    z: [stroke(line(0, -1, 0.84, -1), line(0.84, -1, 0, 0), line(0, 0, 0.84, 0))],
};

const NUMERALS = {
    0: [arc(0.5, -0.75, 0.5, 0.75, -90, -450)],
    1: [stroke(line(0.08, -1.2, 0.4, -1.5), line(0.4, -1.5, 0.4, 0))],
    2: [stroke(arc(0.45, -1.06, 0.42, 0.44, 200, 385), line(0.831, -0.874, 0, 0), line(0, 0, 0.92, 0))],
    3: [stroke(arc(0.42, -1.125, 0.4, 0.375, 205, 450), arc(0.42, -0.375, 0.45, 0.375, -90, 155))],
    4: [stroke(line(0.66, -1.5, 0, -0.48), line(0, -0.48, 0.95, -0.48)), line(0.66, -1.5, 0.66, 0)],
    5: [
        stroke(line(0.16, -1.5, 0.15, -0.82), arc(0.43, -0.47, 0.45, 0.45, -128.5, 145)),
        line(0.16, -1.5, 0.85, -1.5),
    ],
    6: [
        stroke(
            curve(0.78, -1.45, 0.45, -1.62, 0.04, -1.2, 0.03, -0.45),
            arc(0.48, -0.45, 0.45, 0.45, 180, -180)
        ),
    ],
    7: [stroke(line(0, -1.5, 0.9, -1.5), line(0.9, -1.5, 0.32, 0))],
    8: [
        stroke(
            arc(0.45, -1.125, 0.38, 0.375, -45, -270),
            arc(0.45, -0.375, 0.45, 0.375, -90, 270),
            arc(0.45, -1.125, 0.38, 0.375, 90, -45)
        ),
    ],
    9: [arc(0.45, -1.05, 0.42, 0.45, -20, -380), line(0.87, -1.1, 0.87, 0)],
};

function measure(strokes) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let length = 0;
    const lengths = strokes.map((points) => {
        let total = 0;
        for (let i = 0; i < points.length; i++) {
            const [x, y] = points[i];
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
            if (i > 0) total += Math.hypot(x - points[i - 1][0], y - points[i - 1][1]);
        }
        length += total;
        return total;
    });
    return { strokes, lengths, length, box: { x0, x1, y0, y1 } };
}

const VOWELS = 'aeiou';

export const LETTER_LIST = Object.keys(LETTERS).map((ch) =>
    Object.assign(measure(LETTERS[ch]), {
        ch,
        kind: VOWELS.indexOf(ch) >= 0 ? 'vowel' : 'consonant',
    })
);

export const NUMERAL_LIST = Object.keys(NUMERALS).map((ch) =>
    Object.assign(measure(NUMERALS[ch]), { ch, kind: 'numeral' })
);

// Where along a glyph a demonstration is after travelling `distance` units: the stroke, the point,
// and whether the guide's finger is between strokes (lifted).
export function pointAlong(glyph, distance) {
    let left = distance;
    for (let s = 0; s < glyph.strokes.length; s++) {
        const points = glyph.strokes[s];
        if (left <= glyph.lengths[s]) {
            for (let i = 1; i < points.length; i++) {
                const step = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
                if (left <= step) {
                    const t = step > 0 ? left / step : 0;
                    return {
                        stroke: s,
                        index: i,
                        x: points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
                        y: points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
                    };
                }
                left -= step;
            }
            const last = points[points.length - 1];
            return { stroke: s, index: points.length - 1, x: last[0], y: last[1] };
        }
        left -= glyph.lengths[s];
    }
    return null;
}

// The nearest point on any stroke to (x, y), and how far away it is, in glyph units.
export function nearest(glyph, x, y) {
    let best = { d: Infinity, x: 0, y: 0 };
    for (const points of glyph.strokes) {
        for (let i = 1; i < points.length; i++) {
            const ax = points[i - 1][0];
            const ay = points[i - 1][1];
            const vx = points[i][0] - ax;
            const vy = points[i][1] - ay;
            const len2 = vx * vx + vy * vy;
            let t = len2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            const px = ax + vx * t;
            const py = ay + vy * t;
            const d = Math.hypot(x - px, y - py);
            if (d < best.d) best = { d, x: px, y: py };
        }
    }
    return best;
}
