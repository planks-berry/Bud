// Start-up and the wiring between the pieces: the stage, the shelf, the toys, the two corner
// buttons and the grown-up's panel.

import { Stage } from './stage.js';
import * as audio from './audio.js';
import { settings, level as levelOf, ordered } from './settings.js';
import { StartScene, startSounds } from './start.js';
import { ShelfScene, shelfSounds } from './shelf.js';
import { TOYS } from './toys/index.js';
import { setupParent } from './parent.js';
import { VERSION } from './version.js';

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
    cornerOpen: false,

    // A toy's stage as a number, 0 to 2. Toys ask while they are being created, which is after
    // `current` names them.
    level(id = this.current) {
        return levelOf(id);
    },

    // The toys the grown-up has put out, in the order they chose. Never none: an empty shelf would
    // be a dead end.
    visibleToys() {
        const all = ordered(TOYS);
        const shown = all.filter((toy) => settings.hidden.indexOf(toy.id) < 0);
        return shown.length ? shown : all;
    },

    // Every toy, out or not, in the shelf's order: the grown-ups' list.
    orderedToys() {
        return ordered(TOYS);
    },

    // From the bud, the shelf says hello: its trays wake one by one, each with a note.
    enterShelf(greet) {
        if (!this.shelf) this.shelf = new ShelfScene(this);
        if (greet) this.shelf.greet();
        stage.show(this.shelf, { kind: 'fade', duration: 0.7 });
        gate.hidden = false;
    },

    // Goodnight is over: every tray is asleep, and the playroom closes to its bud, as it opened.
    sleep() {
        this.setBedtime(0);
        gate.hidden = true;
        home.hidden = true;
        stage.show(new StartScene(this), { kind: 'fade', duration: 1.4 });
    },

    // Goodnight in a few minutes: over that time the sun in the shelf's window sets and the moon
    // rises, and then the toys fall asleep the next time the shelf is out. In a toy, the way home
    // shows the moon once it is up. 0 calls it off.
    bedtime: 0,
    setBedtime(minutes) {
        clearTimeout(this.bedtimer);
        home.classList.remove('bedtime');
        this.bedtime = minutes ? Date.now() + minutes * 60000 : 0;
        this.bedtimeFrom = Date.now();
        if (minutes) {
            this.bedtimer = setTimeout(() => {
                if (this.current) home.classList.add('bedtime');
                stage.wake();
            }, minutes * 60000);
        }
        this.refreshShelf();
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
        home.classList.remove('bedtime');
        gate.hidden = false;
    },

    // After the grown-up changes a stage or the shelf.
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
        audio.prepare(shelfSounds());
        for (const toy of TOYS) audio.prepare(toy.sounds(levelOf(toy.id)));
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
//
// A newer copy reaches the iPad by itself. A home-screen app is mostly brought back to the front
// rather than started again (always, under Guided Access), so the worker is asked to look for a
// newer copy whenever the playroom comes to the front, not only when it loads. Once a newer worker
// has taken over, the page changes to it at the first quiet moment: straight away if the bud has
// not been touched yet, and otherwise the next time the playroom is put away or brought back,
// when it starts again from the bud as if newly opened. Nothing is ever swapped mid-play.
const secure =
    location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if ('serviceWorker' in navigator && secure) {
    const workers = navigator.serviceWorker;
    // Once a worker looks after this page, any worker that takes over from it is a newer copy. The
    // very first one, on a first visit, takes over a page that is already the newest.
    let looked = Boolean(workers.controller);
    let registration = null;
    let newer = false;
    const quiet = () => stage.scene instanceof StartScene && !stage.scene.blooming;
    const look = () => {
        if (registration) registration.update().catch(() => {});
    };
    workers.addEventListener('controllerchange', () => {
        if (!looked) {
            looked = true;
            return;
        }
        newer = true;
        if (quiet()) location.reload();
    });
    document.addEventListener('visibilitychange', () => {
        if (newer) location.reload();
        else if (!document.hidden) look();
    });
    window.addEventListener('load', () => {
        workers.register('sw.js', { updateViaCache: 'none' }).then(
            (found) => {
                registration = found;
                look();
            },
            () => {
                /* no offline copy; online still works */
            }
        );
    });
}

app.version = VERSION;
window.playroom = app;
window.__playroomBooted = true;
