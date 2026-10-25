// Start-up and the wiring between the pieces: the stage, the shelf, the toys, the two corner
// buttons and the grown-up's panel.

import { Stage } from './stage.js';
import * as audio from './audio.js';
import { settings, level as levelOf, ordered, setTimer } from './settings.js';
import { StartScene, startSounds } from './start.js';
import { ShelfScene, shelfSounds } from './shelf.js';
import { TOYS } from './toys/index.js';
import { setupParent } from './parent.js';
import { setupBand } from './band.js';
import { VERSION } from './version.js';

const stage = new Stage(document.getElementById('stage'));
const home = document.getElementById('home');
const gate = document.getElementById('gate');

// After the goodnight timer runs out in a game, how long the game has to finish, with the moon on
// the house button, before it puts itself away for the night.
const GRACE = 60;

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

    // Goodnight is over: every tray is asleep, and the playroom closes to its bud, as it opened. A
    // timer still running runs on: the moon in the window does not stop it.
    sleep() {
        this.showBud({ kind: 'fade', duration: 1.4 });
    },

    // The bud the playroom opens and closes on. Once the time is up, it is asleep and does not open,
    // and the leaf to the grown-ups' corner stays beside it, for a grown-up to open the playroom
    // again.
    showBud(transition) {
        home.hidden = true;
        stage.show(new StartScene(this), transition);
        this.placeGate();
    },

    // The leaf belongs to the shelf, and to the bud while it sleeps: not in a toy, not on the bud
    // otherwise, and not over the corner itself.
    placeGate() {
        const scene = stage.scene;
        const asleep = scene instanceof StartScene && scene.asleep;
        gate.hidden = this.cornerOpen || !(scene === this.shelf || asleep);
    },

    // The goodnight timer, set and locked by a grown-up in the corner. While it runs, a band round
    // the edge of every screen shows the time going, and the sun in the shelf's window sets. When it
    // has gone, goodnight begins: on the shelf at once; in a toy, the house button shows the moon,
    // and after GRACE seconds the toy puts itself away and the night comes. Then play is over. The
    // timer, run out, is kept, and while it is kept the bud sleeps and nothing opens, however often
    // it is tapped and however often the playroom is opened again, until a grown-up stops it or
    // starts another, with the passcode. It is kept with the settings, so a reload does not lose
    // it. 0 stops it.
    bedtime: 0,
    bedtimeFrom: 0,
    due: false,
    grace: GRACE,
    band: null,
    setBedtime(minutes) {
        const now = Date.now();
        this.timeBedtime(minutes ? { from: now, ends: now + minutes * 60000 } : null);
    },

    timeBedtime(timer) {
        clearTimeout(this.gracer);
        clearTimeout(this.bedtimer);
        home.classList.remove('bedtime');
        this.bedtime = timer ? timer.ends : 0;
        this.bedtimeFrom = timer ? timer.from : 0;
        this.due = false;
        setTimer(timer);
        this.band.update();
        this.checkBedtime();
        // On the moment the time is up; the band's once-a-second look is the backstop, for an iPad
        // that slept through it.
        if (timer && !this.due) {
            this.bedtimer = setTimeout(
                () => {
                    this.band.update();
                    this.checkBedtime();
                },
                timer.ends - Date.now() + 20
            );
        }
        this.refreshShelf();
        // A sleeping bud wakes once a grown-up stops the timer.
        stage.wake();
    },

    // The time is up: a timer has run out, and no grown-up has stopped it or started another.
    timeUp() {
        return !!this.bedtime && Date.now() >= this.bedtime;
    },

    // Called every second while the timer runs, and whenever it changes.
    checkBedtime() {
        if (!this.bedtime || this.due || Date.now() < this.bedtime) return;
        this.due = true;
        if (this.current) {
            home.classList.add('bedtime');
            this.gracer = setTimeout(() => this.putAwayForNight(), this.grace * 1000);
        }
        stage.wake();
    },

    putAwayForNight() {
        if (!this.due || !this.current) return;
        if (stage.busy || this.cornerOpen) {
            this.gracer = setTimeout(() => this.putAwayForNight(), 500);
            return;
        }
        this.goHome();
    },

    openToy(id) {
        const toy = TOYS.find((t) => t.id === id);
        // Once the time is up, no toy opens: the night is coming to the shelf.
        if (!toy || stage.busy || this.current || this.timeUp()) return;
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
app.band = setupBand(app);
setupParent(app, gate);

// A timer survives a reload. One that has run out, however long ago, and whether the night came
// or the playroom was away when it ran out, keeps the bud asleep until a grown-up opens it again.
if (settings.timer) app.timeBedtime(settings.timer);
app.showBud();

// The bloom's chord renders while the bud waits to be touched.
setTimeout(() => audio.prepare(startSounds()), 60);

// Offline: once the playroom has loaded over the network, a service worker keeps a copy, and the
// home-screen icon opens it with no connection at all. Service workers need a secure origin.
//
// A newer copy reaches the iPad by itself. A home-screen app is mostly brought back to the front
// rather than started again (always, under Guided Access), so the worker is asked to look for a
// newer copy whenever the playroom comes to the front, not only when it loads. Once a newer worker
// has taken over, the page changes to it at the first quiet moment: straight away if the bud has
// not been touched yet (or sleeps, with no grown-up in the corner over it), and otherwise the next
// time the playroom is put away or brought back, when it starts again from the bud as if newly
// opened. Nothing is ever swapped mid-play, or under a grown-up typing the passcode.
const secure =
    location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
if ('serviceWorker' in navigator && secure) {
    const workers = navigator.serviceWorker;
    // Once a worker looks after this page, any worker that takes over from it is a newer copy. The
    // very first one, on a first visit, takes over a page that is already the newest.
    let looked = Boolean(workers.controller);
    let registration = null;
    let newer = false;
    const quiet = () => stage.scene instanceof StartScene && !stage.scene.blooming && !app.cornerOpen;
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
