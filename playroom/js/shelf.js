// The shelf: the home of the playroom, and the place every toy goes back to.
//
// A Montessori room keeps its materials on low open shelves, one activity to a tray, ordered from
// simple to complex, left to right and top to bottom, with nothing hidden in a menu. This is that
// shelf. Each toy sits on a felt mat in a wooden tray, drawn as a small picture of itself, and
// touching the tray lifts the toy out of it; going home puts it back.
//
// There is no text. A child who cannot read can see every choice, and the grown-up's settings are
// behind a press-and-hold on the leaf in the corner.

import { Scene } from './stage.js';
import {
    PALETTE,
    SHADOW,
    SHADOW_SOFT,
    makeLayer,
    freeLayer,
    grain,
    fillRound,
    roundRect,
    woodPanel,
    ellipse,
    disc,
} from './draw.js';
import { Spring, shade } from './util.js';
import * as audio from './audio.js';

export class ShelfScene extends Scene {
    constructor(app) {
        super(app);
        this.items = [];
        this.bg = null;
    }

    layout() {
        this.release();
        const { w, h, u } = this;
        const toys = this.app.visibleToys();
        const n = Math.max(1, toys.length);

        // A low shelf standing on the floor, as tall as its rows of trays need and no taller.
        const floor = h * 0.87;
        const margin = Math.max(20 * u, w * 0.05);
        const available = { w: w - margin * 2, h: floor - h * 0.17 };

        // Choose the grid that gives the largest trays of a sensible shape.
        let best = null;
        for (let rows = 1; rows <= 4; rows++) {
            const cols = Math.ceil(n / rows);
            let trayW = (available.w / cols) * 0.86;
            let trayH = (available.h / rows) * 0.72;
            trayH = Math.min(trayH, trayW * 0.9);
            trayW = Math.min(trayW, trayH * 1.25);
            const area = trayW * trayH;
            if (!best || area > best.area) best = { rows, cols, trayW, trayH, area };
        }
        best.cellW = available.w / best.cols;
        best.cellH = Math.min(available.h / best.rows, best.trayH / 0.72);
        const unit = { x: margin, w: available.w, h: best.cellH * best.rows };
        unit.y = floor - unit.h - 8 * u;
        this.grid = best;
        this.unit = unit;
        this.floor = floor;

        this.items = toys.map((toy, i) => {
            const row = Math.floor(i / best.cols);
            const col = i % best.cols;
            const plankY = unit.y + best.cellH * (row + 1) - 14 * u;
            const x = unit.x + best.cellW * col + (best.cellW - best.trayW) / 2;
            const y = plankY - best.trayH - 4 * u;
            return { toy, x, y, w: best.trayW, h: best.trayH, press: new Spring(0, 520, 24), layer: null };
        });

        this.drawBackground();
        for (const item of this.items) this.drawTray(item);
    }

    drawBackground() {
        const { w, h, u, unit, grid } = this;
        const layer = makeLayer(w, h, this.scale);
        const ctx = layer.ctx;

        const wall = ctx.createLinearGradient(0, 0, 0, this.floor);
        wall.addColorStop(0, shade(PALETTE.wall, 0.35));
        wall.addColorStop(1, PALETTE.wall);
        ctx.fillStyle = wall;
        ctx.fillRect(0, 0, w, this.floor);
        ctx.fillStyle = PALETTE.floor;
        ctx.fillRect(0, this.floor, w, h - this.floor);
        ctx.fillStyle = shade(PALETTE.floor, -0.12);
        ctx.fillRect(0, this.floor, w, 5 * u);
        ellipse(ctx, w / 2, this.floor + (h - this.floor) * 0.62, w * 0.36, (h - this.floor) * 0.3);
        ctx.fillStyle = 'rgba(188, 211, 168, 0.55)';
        ctx.fill();

        this.drawPicture(ctx, w * 0.72, Math.max(70 * u, unit.y * 0.5), 92 * u, 70 * u);

        // The unit: two posts and a plank under each row of trays.
        const post = 16 * u;
        for (const x of [unit.x - post * 0.6, unit.x + unit.w - post * 0.4]) {
            fillRound(ctx, x + 5 * u, unit.y + 5 * u, post, this.floor - unit.y - 5 * u, 4 * u, SHADOW_SOFT);
            woodPanel(
                ctx,
                x,
                unit.y - 10 * u,
                post,
                this.floor - unit.y + 10 * u,
                5 * u,
                PALETTE.woodDark,
                3,
                this.scale
            );
        }
        for (let row = 0; row < grid.rows; row++) {
            const y = unit.y + grid.cellH * (row + 1) - 14 * u;
            fillRound(ctx, unit.x, y + 14 * u, unit.w, 10 * u, 3 * u, SHADOW_SOFT);
            woodPanel(
                ctx,
                unit.x - post * 0.5,
                y,
                unit.w + post,
                16 * u,
                4 * u,
                PALETTE.wood,
                10 + row,
                this.scale
            );
            ctx.fillStyle = shade(PALETTE.woodDark, -0.05);
            ctx.fillRect(unit.x - post * 0.5 + 4 * u, y + 12 * u, unit.w + post - 8 * u, 4 * u);
        }
        woodPanel(
            ctx,
            unit.x - post * 0.8,
            unit.y - 22 * u,
            unit.w + post * 1.6,
            16 * u,
            4 * u,
            PALETTE.wood,
            9,
            this.scale
        );

        this.drawPlant(ctx, unit.x + 60 * u, unit.y - 22 * u);

        grain(ctx, 0, 0, w, h, 0.22, this.scale);
        this.bg = layer;
    }

    // A small framed picture of hills under a sun: the wall should feel lived in, not decorated.
    drawPicture(ctx, cx, cy, w, h) {
        const u = this.u;
        const x = cx - w / 2;
        const y = cy - h / 2;
        fillRound(ctx, x + 4 * u, y + 5 * u, w, h, 6 * u, SHADOW_SOFT);
        fillRound(ctx, x, y, w, h, 6 * u, PALETTE.woodDark);
        ctx.save();
        roundRect(ctx, x + 7 * u, y + 7 * u, w - 14 * u, h - 14 * u, 3 * u);
        ctx.fillStyle = PALETTE.cream;
        ctx.fill();
        ctx.clip();
        disc(ctx, x + w * 0.66, y + h * 0.42, h * 0.16, PALETTE.butter);
        ellipse(ctx, x + w * 0.3, y + h * 0.95, w * 0.45, h * 0.38);
        ctx.fillStyle = PALETTE.sage;
        ctx.fill();
        ellipse(ctx, x + w * 0.8, y + h, w * 0.4, h * 0.3);
        ctx.fillStyle = PALETTE.sageDeep;
        ctx.fill();
        ctx.restore();
    }

    drawPlant(ctx, x, base) {
        const u = this.u;
        const leaves = [
            [-0.9, 44],
            [-0.35, 54],
            [0.25, 50],
            [0.8, 40],
            [-1.4, 30],
            [1.3, 32],
        ];
        for (let i = 0; i < leaves.length; i++) {
            const angle = leaves[i][0] - Math.PI / 2;
            const len = leaves[i][1] * u;
            ctx.save();
            ctx.translate(x, base - 26 * u);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
            ctx.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
            ctx.fillStyle = i % 2 ? PALETTE.sageDeep : PALETTE.sage;
            ctx.fill();
            ctx.restore();
        }
        ctx.beginPath();
        ctx.moveTo(x - 24 * u, base - 32 * u);
        ctx.lineTo(x + 24 * u, base - 32 * u);
        ctx.lineTo(x + 18 * u, base);
        ctx.lineTo(x - 18 * u, base);
        ctx.closePath();
        ctx.fillStyle = PALETTE.peachDeep;
        ctx.fill();
        ctx.fillStyle = shade(PALETTE.peachDeep, -0.1);
        ctx.fillRect(x - 26 * u, base - 36 * u, 52 * u, 8 * u);
    }

    drawTray(item) {
        const u = this.u;
        const pad = 12 * u;
        const layer = makeLayer(item.w + pad * 2, item.h + pad * 2, this.scale);
        const ctx = layer.ctx;
        const x = pad;
        const y = pad;
        const r = 14 * u;

        fillRound(ctx, x + 2 * u, y + 7 * u, item.w, item.h, r, SHADOW);
        woodPanel(ctx, x, y, item.w, item.h, r, PALETTE.wood, item.toy.id.length * 7, this.scale);
        const inset = 9 * u;
        fillRound(
            ctx,
            x + inset,
            y + inset,
            item.w - inset * 2,
            item.h - inset * 2,
            r * 0.6,
            shade(PALETTE.woodDark, -0.04)
        );
        const mat = 12 * u;
        const mx = x + mat;
        const my = y + mat + 1 * u;
        const mw = item.w - mat * 2;
        const mh = item.h - mat * 2;
        fillRound(ctx, mx, my, mw, mh, r * 0.5, item.toy.mat);
        grain(ctx, mx, my, mw, mh, 0.45, this.scale);

        ctx.save();
        roundRect(ctx, mx, my, mw, mh, r * 0.5);
        ctx.clip();
        item.toy.icon(ctx, mx, my, mw, mh, u);
        ctx.restore();

        item.layer = layer;
        item.pad = pad;
    }

    hit(x, y) {
        const slop = 6 * this.u;
        for (const item of this.items) {
            if (
                x > item.x - slop &&
                x < item.x + item.w + slop &&
                y > item.y - slop &&
                y < item.y + item.h + slop
            )
                return item;
        }
        return null;
    }

    rectOf(id) {
        const item = this.items.find((it) => it.toy.id === id);
        if (!item) return { x: this.w / 2 - 50, y: this.h / 2 - 50, w: 100, h: 100, r: 14 };
        return { x: item.x, y: item.y, w: item.w, h: item.h, r: 14 * this.u };
    }

    down(p) {
        const item = this.hit(p.x, p.y);
        if (!item) return;
        p.owner = item;
        item.press.target = 1;
        audio.play('wood', { f: 1046.5 }, { gain: 0.65, wet: 0.1, pan: (p.x / this.w) * 2 - 1 });
    }

    move(p) {
        const item = p.owner;
        if (!item) return;
        const slop = 24 * this.u;
        if (
            p.x < item.x - slop ||
            p.x > item.x + item.w + slop ||
            p.y < item.y - slop ||
            p.y > item.y + item.h + slop
        ) {
            item.press.target = 0;
            p.owner = null;
        }
    }

    up(p) {
        const item = p.owner;
        if (!item) return;
        item.press.target = 0;
        if (!this.app.stage.busy) this.app.openToy(item.toy.id);
    }

    cancel(p) {
        if (p.owner) p.owner.press.target = 0;
    }

    update(dt) {
        let busy = false;
        for (const item of this.items) if (item.press.update(dt)) busy = true;
        return busy;
    }

    draw(ctx) {
        ctx.drawImage(this.bg.canvas, 0, 0, this.w, this.h);
        for (const item of this.items) {
            const s = 1 - item.press.value * 0.06;
            const lw = (item.w + item.pad * 2) * s;
            const lh = (item.h + item.pad * 2) * s;
            const cx = item.x + item.w / 2;
            const cy = item.y + item.h / 2 + item.press.value * 3 * this.u;
            ctx.drawImage(item.layer.canvas, cx - lw / 2, cy - lh / 2, lw, lh);
        }
    }

    release() {
        freeLayer(this.bg);
        this.bg = null;
        for (const item of this.items) freeLayer(item.layer);
    }

    exit() {
        this.release();
    }
}
