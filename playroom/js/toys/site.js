// The building site: a board to build on, after the farm, whose machines work in chains. (Being
// built.)

import { Scene } from '../stage.js';
import { fillRound } from '../draw.js';
import * as audio from '../audio.js';
import { SITE } from './machines.js';

class SiteScene extends Scene {
    draw(ctx) {
        ctx.fillStyle = SITE.concrete;
        ctx.fillRect(0, 0, this.w, this.h);
    }
}

function icon(ctx, x, y, w, h) {
    const s = Math.min(w, h) * 0.42;
    const cx = x + w / 2;
    const cy = y + h / 2;
    fillRound(ctx, cx - s * 1.05, cy - s * 0.8, s * 2.1, s * 1.6, s * 0.18, SITE.sand);
    fillRound(ctx, cx - s * 1.05, cy + s * 0.1, s * 2.1, s * 0.3, s * 0.1, SITE.gravel);
    fillRound(ctx, cx + s * 0.2, cy - s * 0.7, s * 0.6, s * 0.7, s * 0.06, SITE.brick);
}

export const toy = {
    id: 'site',
    title: 'Building site',
    about: 'Build a building site from tiles. Its machines work together: dig, carry, fill, pour, and raise a building.',
    stages: ['a small site, 5 kinds of piece', 'a bigger site, 9 kinds', 'the biggest site, all 12 kinds'],
    mat: '#E6E0D5',
    icon,
    create: (app) => new SiteScene(app),
    sounds() {
        return [
            ['beep', {}],
            ['putt', {}],
        ];
    },
    signature() {
        audio.play('beep', {}, { gain: 0.5, delay: 0.05 });
        audio.play('beep', {}, { gain: 0.5, delay: 0.4 });
    },
};
