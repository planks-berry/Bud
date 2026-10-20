// Start-up and the wiring between the pieces: the stage, the shelf, the toys, the two corner
// buttons and the grown-up's panel.

import { Stage } from './stage.js';
import * as audio from './audio.js';
import { settings, level } from './settings.js';
import { StartScene, startSounds } from './start.js';
import { ShelfScene } from './shelf.js';
import { TOYS } from './toys/index.js';
import { setupParent } from './parent.js';

const stage = new Stage(document.getElementById('stage'));
const home = document.getElementById('home');
const gate = document.getElementById('gate');

const app = {
    stage,
    audio,
    settings,
    toys: TOYS,
    shelf: null,
    current: null,
    level,

    // The toys the grown-up has put out. Never none: an empty shelf would be a dead end.
    visibleToys() {
        const shown = TOYS.filter((toy) => settings.hidden.indexOf(toy.id) < 0);
        return shown.length ? shown : TOYS;
    },

    enterShelf() {
        if (!this.shelf) this.shelf = new ShelfScene(this);
        stage.show(this.shelf, { kind: 'fade', duration: 0.7 });
        gate.hidden = false;
    },

    openToy(id) {
        const toy = TOYS.find((t) => t.id === id);
        if (!toy || stage.busy || this.current) return;
        this.current = id;
        audio.play('whoosh', { variant: 'up' }, { gain: 1, wet: 0.25 });
        toy.signature();
        stage.show(toy.create(this), {
            kind: 'open',
            rect: this.shelf.rectOf(id),
            duration: 0.5,
            keep: true,
        });
        gate.hidden = true;
        home.hidden = false;
    },

    goHome() {
        if (!this.current || stage.busy) return;
        const rect = this.shelf.rectOf(this.current);
        this.current = null;
        audio.play('whoosh', { variant: 'down' }, { gain: 0.9, wet: 0.25 });
        stage.show(this.shelf, { kind: 'close', rect, duration: 0.45 });
        home.hidden = true;
        gate.hidden = false;
    },

    // After the grown-up changes the stage or the shelf.
    refreshShelf() {
        if (!this.shelf) return;
        this.shelf.invalidate();
        if (stage.scene === this.shelf) {
            this.shelf.resize(stage.w, stage.h, stage.scale);
            stage.wake();
        }
    },

    // Render the toys' sounds a few at a time while the child is looking at the shelf, so the first
    // touch in a toy does not wait for synthesis.
    warmUp() {
        for (const toy of TOYS) audio.prepare(toy.sounds(level()));
    },
};

// The way back to the shelf. It answers on release, and only if the finger is still on it, so a
// hand sweeping across the corner mid-play does not end the game.
function pressable(button, action) {
    let inside = false;
    const within = (touch) => {
        const r = button.getBoundingClientRect();
        return (
            touch.clientX >= r.left &&
            touch.clientX <= r.right &&
            touch.clientY >= r.top &&
            touch.clientY <= r.bottom
        );
    };
    const active = { passive: false };
    button.addEventListener(
        'touchstart',
        (event) => {
            event.preventDefault();
            audio.unlock(false);
            inside = true;
            button.classList.add('pressed');
        },
        active
    );
    button.addEventListener(
        'touchmove',
        (event) => {
            event.preventDefault();
            inside = within(event.changedTouches[0]);
            button.classList.toggle('pressed', inside);
        },
        active
    );
    button.addEventListener(
        'touchend',
        (event) => {
            event.preventDefault();
            audio.unlock();
            button.classList.remove('pressed');
            if (inside) action();
            inside = false;
        },
        active
    );
    button.addEventListener('touchcancel', () => {
        inside = false;
        button.classList.remove('pressed');
    });
    button.addEventListener('click', () => {
        audio.unlock();
        action();
    });
}

pressable(home, () => app.goHome());

audio.setVolume(settings.volume);
audio.setThroughSilent(settings.throughSilent);
setupParent(app, gate);
stage.show(new StartScene(app));

// The bloom's chord renders while the bud waits to be touched.
setTimeout(() => audio.prepare(startSounds()), 60);

// Offline: once the playroom has loaded over the network, a service worker keeps a copy, and the
// home-screen icon opens it with no connection at all. Service workers need a secure origin.
const secure =
    location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if ('serviceWorker' in navigator && secure) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {
            /* no offline copy; online still works */
        });
    });
}

window.playroom = app;
window.__playroomBooted = true;
