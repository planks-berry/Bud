// The dig: a sandpit to dig in, with a digger whose bucket follows a finger. (Being built.)

import { Scene } from '../stage.js';
import { fillRound } from '../draw.js';
import * as audio from '../audio.js';
import { SITE, wheel } from './machines.js';

class DigScene extends Scene {
    draw(ctx) {
        ctx.fillStyle = SITE.sky;
        ctx.fillRect(0, 0, this.w, this.h);
        ctx.fillStyle = SITE.sand;
        ctx.fillRect(0, this.h * 0.62, this.w, this.h * 0.38);
    }
}

function icon(ctx, x, y, w, h) {
    const s = Math.min(w, h) * 0.42;
    const cx = x + w / 2;
    const cy = y + h / 2;
    fillRound(ctx, cx - s, cy - s * 0.2, s * 2, s * 0.9, s * 0.4, SITE.sand);
    fillRound(ctx, cx - s * 0.6, cy - s * 0.7, s * 0.9, s * 0.5, s * 0.1, SITE.body);
    wheel(ctx, cx - s * 0.35, cy - s * 0.15, s * 0.18);
    wheel(ctx, cx + s * 0.15, cy - s * 0.15, s * 0.18);
}

export const toy = {
    id: 'dig',
    title: 'Dig',
    about: 'A sandpit and a digger whose bucket follows a finger. Dig, carry, pour, and tip the truck.',
    stages: [
        'a digger and a heap of sand',
        'and a dump truck, and things buried',
        'and a bulldozer, and two kinds of earth',
    ],
    mat: '#EFE4CC',
    icon,
    create: (app) => new DigScene(app),
    sounds() {
        return [
            ['crunch', {}],
            ['rumble', { variant: 'short' }],
        ];
    },
    signature() {
        audio.play('crunch', {}, { gain: 0.6, delay: 0.05 });
    },
};
