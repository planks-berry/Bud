// The crane: a tower crane to lift parts and build upwards with. (Being built.)

import { Scene } from '../stage.js';
import { fillRound } from '../draw.js';
import { noteHz } from '../synth.js';
import * as audio from '../audio.js';
import { SITE, line } from './machines.js';

class CraneScene extends Scene {
    draw(ctx) {
        ctx.fillStyle = SITE.sky;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.fillStyle = SITE.earth;
        ctx.fillRect(0, this.h * 0.86, this.w, this.h * 0.14);
    }
}

function icon(ctx, x, y, w, h) {
    const s = Math.min(w, h) * 0.42;
    const cx = x + w / 2;
    const cy = y + h / 2;
    line(ctx, cx - s * 0.5, cy + s * 0.8, cx - s * 0.5, cy - s * 0.8, s * 0.12, SITE.body);
    line(ctx, cx - s * 0.8, cy - s * 0.7, cx + s * 0.9, cy - s * 0.7, s * 0.1, SITE.body);
    line(ctx, cx + s * 0.5, cy - s * 0.7, cx + s * 0.5, cy + s * 0.1, s * 0.02, SITE.steelDeep);
    fillRound(ctx, cx + s * 0.3, cy + s * 0.1, s * 0.4, s * 0.3, s * 0.05, SITE.brick);
}

export const toy = {
    id: 'crane',
    title: 'Crane',
    about: 'A tower crane: lower the hook onto a part, lift it, and let go where it should stand. Build upwards.',
    stages: [
        '4 big blocks to drag or lift',
        'blocks, beams and windows, carried by the crane',
        'arches and roofs, and a wrecking ball',
    ],
    mat: '#E2ECF2',
    icon,
    create: (app) => new CraneScene(app),
    sounds() {
        return [
            ['clank', { f: noteHz(0, 60) }],
            ['rattle', {}],
        ];
    },
    signature() {
        audio.play('clank', { f: noteHz(0, 60) }, { gain: 0.5, delay: 0.05 });
    },
};
