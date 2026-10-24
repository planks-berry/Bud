// The goodnight timer's band: a thin frame round the very edge of the screen, over the bud, the
// shelf, every toy and the grown-ups' corner alike, for as long as a grown-up's timer runs. It
// empties clockwise from the top as the time goes, the way a clock's hand sweeps, and turns from
// leaf green through butter to rose; when the time has gone, the whole frame turns the deep blue
// of the night, and goodnight begins.
//
// It is an SVG over the canvas rather than something the scenes draw: the canvas draws only while
// something moves, and the band has to keep time when nothing does. Once a second it changes one
// path's dash, which costs next to nothing.

import { clamp, mixRgb, rgbString } from './util.js';

const WIDTH = 8;
const FULL = [152, 185, 133];
const HALF = [229, 199, 102];
const END = [221, 148, 140];

// The band's colour with `left` of the time remaining, 1 to 0.
export function bandColour(left) {
    return rgbString(left > 0.5 ? mixRgb(HALF, FULL, (left - 0.5) * 2) : mixRgb(END, HALF, left * 2));
}

export function setupBand(app) {
    const band = document.getElementById('band');
    const svg = band.querySelector('svg');
    const track = band.querySelector('.track');
    const rest = band.querySelector('.left');
    let ticker = 0;
    let size = '';
    let length = 0;

    // From the top centre all the way round anticlockwise: the time still to come is the start of
    // this path, so as it is used up, the gap opens from the top and travels clockwise.
    function shape() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (`${w}x${h}` === size) return;
        size = `${w}x${h}`;
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        const i = WIDTH / 2;
        const d = `M ${w / 2} ${i} H ${i} V ${h - i} H ${w - i} V ${i} Z`;
        track.setAttribute('d', d);
        rest.setAttribute('d', d);
        length = 2 * (w - WIDTH) + 2 * (h - WIDTH);
    }

    // How much of the time is left, 1 to 0, or -1 with no timer.
    function left() {
        if (!app.bedtime) return -1;
        const span = Math.max(1, app.bedtime - app.bedtimeFrom);
        return clamp((app.bedtime - Date.now()) / span, 0, 1);
    }

    function update() {
        const now = left();
        if (now < 0) {
            band.hidden = true;
            clearInterval(ticker);
            ticker = 0;
            return;
        }
        band.hidden = false;
        shape();
        band.classList.toggle('night', now === 0);
        rest.style.strokeDasharray = `${(now * length).toFixed(1)} ${length + WIDTH}`;
        rest.style.stroke = bandColour(now);
        if (!ticker) ticker = setInterval(tick, 1000);
    }

    function tick() {
        update();
        app.checkBedtime();
    }

    window.addEventListener('resize', () => {
        size = '';
        if (app.bedtime) update();
    });

    return { update, left };
}
