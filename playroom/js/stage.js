// The stage: one full-screen canvas, the touches on it, the frame loop, and the transitions
// between scenes.
//
// Touch is handled with touch events, not pointer events, because Safari 12 has none (they arrived
// in 13). Every touch is tracked by its identifier, so two hands, or a palm and a finger, are
// separate pointers rather than a confused average. The listeners are registered non-passive and
// call preventDefault, which is what stops the page scrolling, bouncing, zooming or raising a
// callout under a child's fingers; iOS 11.3+ treats document-level touch listeners as passive by
// default, which is why they are on the canvas instead.
//
// Frames are drawn on demand. A scene says whether it is still animating, and when nothing moves
// and no finger is down the loop stops entirely: a toy left open on a table costs no battery and
// keeps an old iPad cool. If frames run long while animating, the canvas resolution steps down
// rather than letting the motion stutter.

import { clamp, lerp, easeInOutCubic } from './util.js';
import { roundRect } from './draw.js';
import * as audio from './audio.js';

export class Scene {
    constructor(app) {
        this.app = app;
        this.w = 1;
        this.h = 1;
        this.scale = 1;
        this.u = 1;
        this.dirty = true;
    }

    // `u` is the layout unit: 1 on a 1024 x 768 iPad, in either orientation. A scene shown again at
    // the same size keeps its layout (and its cached layers) unless it has been invalidated.
    resize(w, h, scale) {
        if (!this.dirty && w === this.w && h === this.h && scale === this.scale) return;
        this.dirty = false;
        this.w = w;
        this.h = h;
        this.scale = scale;
        this.u = Math.min(w, h) / 768;
        this.layout();
    }

    layout() {}

    invalidate() {
        this.dirty = true;
    }

    // Advance by dt seconds; return true while anything is still moving.
    update() {
        return false;
    }

    draw() {}
    down() {}
    move() {}
    up() {}

    cancel(p) {
        this.up(p);
    }

    exit() {}
}

const QUALITY_STEPS = [1, 0.8, 0.65, 0.5];

export class Stage {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.scene = null;
        this.transition = null;
        this.pointers = new Map();
        this.raf = 0;
        this.last = 0;
        this.quality = 0;
        this.slow = 0;
        this.counted = 0;
        this.lastTouch = 0;
        this.w = 0;
        this.h = 0;
        this.scale = 1;
        this.frames = 0;
        this.tick = this.tick.bind(this);
        this.listen();
        this.resize();
    }

    //--------------------------------------------------------------------------
    // Size

    resize() {
        const w = Math.max(1, window.innerWidth);
        const h = Math.max(1, window.innerHeight);
        const scale = Math.min(window.devicePixelRatio || 1, 2) * QUALITY_STEPS[this.quality];
        if (w === this.w && h === this.h && scale === this.scale) return;

        this.w = w;
        this.h = h;
        this.scale = scale;
        this.canvas.width = Math.round(w * scale);
        this.canvas.height = Math.round(h * scale);
        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;

        if (this.scene) this.scene.resize(w, h, scale);
        if (this.transition && this.transition.from) this.transition.from.resize(w, h, scale);
        this.wake();
    }

    //--------------------------------------------------------------------------
    // Scenes

    // Show a scene. `transition`: { kind: 'open' | 'close' | 'fade', rect, duration, done }.
    // 'open' zooms the new scene out of `rect`; 'close' shrinks the old one back into it.
    show(scene, transition) {
        const from = this.scene;
        if (this.transition) this.finishTransition();
        scene.resize(this.w, this.h, this.scale);
        this.scene = scene;

        for (const p of this.pointers.values()) p.stale = true;

        if (from && transition) {
            this.transition = Object.assign({ t: 0, duration: 0.5, from, to: scene }, transition);
        } else if (from && from.exit) {
            from.exit();
        }
        this.wake();
    }

    finishTransition() {
        const tr = this.transition;
        this.transition = null;
        if (tr.from !== this.scene && tr.from.exit && !tr.keep) tr.from.exit();
        if (tr.done) tr.done();
    }

    get busy() {
        return !!this.transition;
    }

    //--------------------------------------------------------------------------
    // Input

    listen() {
        const canvas = this.canvas;
        const active = { passive: false };
        const touch = (phase) => (event) => this.onTouch(event, phase);
        canvas.addEventListener('touchstart', touch('down'), active);
        canvas.addEventListener('touchmove', touch('move'), active);
        canvas.addEventListener('touchend', touch('up'), active);
        canvas.addEventListener('touchcancel', touch('cancel'), active);

        // A mouse, for a desktop browser or the test harness. Ignored right after a touch, in case
        // a browser synthesises mouse events from it.
        canvas.addEventListener('mousedown', (event) => {
            if (Date.now() - this.lastTouch < 1000 || event.button !== 0) return;
            audio.unlock();
            this.pointerDown('mouse', event.clientX, event.clientY);
        });
        window.addEventListener('mousemove', (event) => {
            if (this.pointers.has('mouse')) this.pointerMove('mouse', event.clientX, event.clientY);
        });
        window.addEventListener('mouseup', (event) => {
            if (!this.pointers.has('mouse')) return;
            audio.unlock();
            this.pointerUp('mouse', event.clientX, event.clientY, 'up');
        });

        // Safari's own pinch gesture, which would otherwise zoom the page past user-scalable=no.
        const block = (event) => event.preventDefault();
        document.addEventListener('gesturestart', block, active);
        document.addEventListener('gesturechange', block, active);

        window.addEventListener('resize', () => this.resize());
        // iOS reports the old size for a moment after rotating.
        window.addEventListener('orientationchange', () => {
            setTimeout(() => this.resize(), 120);
            setTimeout(() => this.resize(), 500);
        });
    }

    onTouch(event, phase) {
        event.preventDefault();
        this.lastTouch = Date.now();
        // touchend is the gesture iOS 12 accepts for starting audio; a touchstart can only wake a
        // context that already exists.
        if (phase !== 'move') audio.unlock(phase !== 'down');
        const touches = event.changedTouches;
        for (let i = 0; i < touches.length; i++) {
            const t = touches[i];
            if (phase === 'down') this.pointerDown(t.identifier, t.clientX, t.clientY);
            else if (phase === 'move') this.pointerMove(t.identifier, t.clientX, t.clientY);
            else this.pointerUp(t.identifier, t.clientX, t.clientY, phase);
        }
    }

    pointerDown(id, x, y) {
        const now = performance.now();
        const p = {
            id,
            x,
            y,
            x0: x,
            y0: y,
            px: x,
            py: y,
            vx: 0,
            vy: 0,
            t0: now,
            time: now,
            travel: 0,
            stale: !!this.transition,
            owner: null,
        };
        this.pointers.set(id, p);
        if (!p.stale && this.scene) this.route(() => this.scene.down(p));
        this.wake();
    }

    pointerMove(id, x, y) {
        const p = this.pointers.get(id);
        if (!p) return;
        const now = performance.now();
        const dt = (now - p.time) / 1000;
        p.px = p.x;
        p.py = p.y;
        p.x = x;
        p.y = y;
        p.travel += Math.sqrt((x - p.px) * (x - p.px) + (y - p.py) * (y - p.py));
        if (dt > 0.001) {
            // Smoothed, so one jittery sample does not fling a cube across the room.
            p.vx = p.vx * 0.5 + ((x - p.px) / dt) * 0.5;
            p.vy = p.vy * 0.5 + ((y - p.py) / dt) * 0.5;
            p.time = now;
        }
        if (!p.stale && this.scene) this.route(() => this.scene.move(p));
        this.wake();
    }

    pointerUp(id, x, y, phase) {
        const p = this.pointers.get(id);
        if (!p) return;
        this.pointers.delete(id);
        p.px = p.x;
        p.py = p.y;
        p.x = x;
        p.y = y;
        // A finger that stopped before lifting should not throw what it was holding.
        const still = (performance.now() - p.time) / 1000;
        if (still > 0.06) {
            const fade = Math.exp(-(still - 0.06) / 0.05);
            p.vx *= fade;
            p.vy *= fade;
        }
        if (!p.stale && this.scene) {
            if (phase === 'cancel') this.route(() => this.scene.cancel(p));
            else this.route(() => this.scene.up(p));
        }
        this.wake();
    }

    route(handler) {
        try {
            handler();
        } catch (error) {
            this.fault(error);
        }
    }

    //--------------------------------------------------------------------------
    // Frames

    wake() {
        if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    }

    tick(time) {
        this.raf = 0;
        const dt = this.last ? clamp((time - this.last) / 1000, 0, 0.05) : 1 / 60;
        const continuing = this.last !== 0;
        this.last = time;

        // A fault in one toy must not freeze the iPad: report it and keep the loop alive, so the
        // child can carry on or go home. It must not spin, either: after a fault the loop waits for
        // the next touch rather than retrying every frame. The tests treat any report as a failure.
        let busy = false;
        try {
            if (this.transition) {
                this.transition.t += dt;
                busy = true;
                if (this.transition.from.update(dt)) busy = true;
            }
            if (this.scene && this.scene.update(dt)) busy = true;

            this.render();
            this.frames++;

            if (this.transition && this.transition.t >= this.transition.duration) {
                this.finishTransition();
                this.render();
            }
        } catch (error) {
            this.fault(error);
            if (this.transition) {
                this.finishTransition();
                busy = true;
            }
        }

        if (continuing && busy) this.measure(dt);

        if (busy || this.pointers.size) this.wake();
        else this.last = 0;
    }

    fault(error) {
        this.faults = (this.faults || 0) + 1;
        if (this.faults <= 5) console.error(error);
    }

    // Step the resolution down if most recent frames ran long while animating. Never back up within
    // a session: oscillating between sharp and soft would be worse than either.
    measure(dt) {
        this.counted++;
        if (dt > 0.026) this.slow++;
        if (this.counted < 90) return;
        const struggling = this.slow > 60;
        this.counted = 0;
        this.slow = 0;
        if (struggling && this.quality < QUALITY_STEPS.length - 1) {
            this.quality++;
            this.resize();
        }
    }

    render() {
        const ctx = this.ctx;
        ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        const tr = this.transition;
        if (!tr) {
            if (this.scene) this.scene.draw(ctx);
            return;
        }

        const e = easeInOutCubic(clamp(tr.t / tr.duration, 0, 1));
        if (tr.kind === 'fade') {
            tr.to.draw(ctx);
            ctx.globalAlpha = 1 - e;
            tr.from.draw(ctx);
            ctx.globalAlpha = 1;
            return;
        }

        // 'open' grows the toy out of its tray; 'close' shrinks it back in. The toy is drawn at a
        // uniform scale centred in the moving rectangle and clipped to it, so it reads as zooming
        // rather than stretching.
        const opening = tr.kind === 'open';
        const shelf = opening ? tr.from : tr.to;
        const toy = opening ? tr.to : tr.from;
        const k = opening ? e : 1 - e;
        const r = tr.rect;

        shelf.draw(ctx);
        ctx.fillStyle = `rgba(92,70,58,${0.18 * k})`;
        ctx.fillRect(0, 0, this.w, this.h);

        const x = lerp(r.x, 0, k);
        const y = lerp(r.y, 0, k);
        const w = lerp(r.w, this.w, k);
        const h = lerp(r.h, this.h, k);
        const radius = lerp(r.r || 16, 0, k);
        const s = lerp(Math.max(r.w / this.w, r.h / this.h), 1, k);

        ctx.save();
        roundRect(ctx, x, y, w, h, radius);
        ctx.clip();
        ctx.translate(x + w / 2, y + h / 2);
        ctx.scale(s, s);
        ctx.translate(-this.w / 2, -this.h / 2);
        toy.draw(ctx);
        ctx.restore();
    }
}
