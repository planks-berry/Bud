// The grown-up's corner: a leaf on the shelf that opens a settings panel after a three-second
// press. Three seconds of holding still is easy for an adult and unlikely from a three-year-old,
// who taps.
//
// The panel is ordinary HTML with words in it, because it is for someone who reads.

import {
    settings,
    save,
    STAGES,
    EXTRAS,
    stageOf,
    setStage,
    setAllStages,
    move,
    resetOrder,
    setExtra,
} from './settings.js';
import * as audio from './audio.js';
import { VERSION, PUBLISHED, STAMPED } from './version.js';

const HOLD_MS = 3000;

const STAGE_TEXT = {
    seed: ['Seed', 'Fewer, larger pieces. Mostly cause and effect.'],
    sprout: ['Sprout', 'The everyday set.'],
    bloom: ['Bloom', 'More pieces, more tools, finer work.'],
};

export function setupParent(app, gate) {
    const panel = document.getElementById('parent');
    let timer = 0;

    const begin = (event) => {
        if (event) event.preventDefault();
        audio.unlock(false);
        gate.classList.add('holding');
        clearTimeout(timer);
        timer = setTimeout(() => {
            gate.classList.remove('holding');
            open();
        }, HOLD_MS);
    };
    const end = (event) => {
        if (event) event.preventDefault();
        clearTimeout(timer);
        gate.classList.remove('holding');
    };

    const active = { passive: false };
    gate.addEventListener('touchstart', begin, active);
    gate.addEventListener('touchend', end, active);
    gate.addEventListener('touchcancel', end, active);
    gate.addEventListener('mousedown', begin);
    gate.addEventListener('mouseup', end);
    gate.addEventListener('mouseleave', end);

    function open() {
        render();
        panel.hidden = false;
        gate.hidden = true;
        // A goodnight that comes due waits until the grown-up has finished here.
        app.cornerOpen = true;
    }

    function close() {
        panel.hidden = true;
        app.cornerOpen = false;
        // The leaf belongs to the shelf: not in a toy, and not on the bud after a goodnight.
        gate.hidden = app.stage.scene !== app.shelf;
        // A toy moved on needs its new sounds ready before it is opened.
        app.warmUp();
        app.stage.wake();
    }

    function render() {
        // Which copy is running, so a grown-up can tell whether the iPad has the newest yet.
        panel.querySelector('[data-version]').textContent = STAMPED
            ? `This copy of the playroom was published on ${PUBLISHED} (${VERSION.slice(0, 7)}). A newer one arrives by itself while the iPad is online, and is used from the next time the playroom is opened or the screen wakes.`
            : 'This is a working copy of the playroom, not a published one.';

        // The shared stage is shown as chosen only while every toy that has stages is at it.
        const staged = app.toys.filter((toy) => toy.stages);
        const shared = STAGES.find((id) => staged.every((toy) => stageOf(toy.id) === id));
        const stages = panel.querySelector('[data-stages]');
        stages.innerHTML = '';
        for (const id of STAGES) {
            const button = document.createElement('button');
            button.className = 'choice';
            button.setAttribute('aria-pressed', String(shared === id));
            button.innerHTML = `<strong>${STAGE_TEXT[id][0]}</strong><span>${STAGE_TEXT[id][1]}</span>`;
            button.addEventListener('click', () => {
                setAllStages(id);
                app.refreshShelf();
                render();
            });
            stages.appendChild(button);
        }
        panel.querySelector('[data-mixed]').hidden = !!shared;

        // The toys in the shelf's order, each with its place, its switch and its stage.
        const shelf = panel.querySelector('[data-shelf]');
        shelf.innerHTML = '';
        const toys = app.orderedToys();
        toys.forEach((toy, place) => {
            const shown = settings.hidden.indexOf(toy.id) < 0;
            const row = document.createElement('div');
            row.className = shown ? 'toy' : 'toy off';
            row.setAttribute('data-toy', toy.id);
            row.innerHTML =
                `<div class="head"><span class="label"><strong>${toy.title}` +
                `${toy.isNew ? '<span class="badge">New</span>' : ''}</strong>` +
                `<span>${toy.about}</span></span>` +
                `<span class="places">` +
                `<button data-earlier aria-label="Earlier on the shelf"${place === 0 ? ' disabled' : ''}>&uarr;</button>` +
                `<button data-later aria-label="Later on the shelf"${place === toys.length - 1 ? ' disabled' : ''}>&darr;</button>` +
                `</span>` +
                `<button class="switch" aria-pressed="${shown}" aria-label="On the shelf"></button></div>`;
            row.querySelector('[data-earlier]').addEventListener('click', () => {
                move(app.toys, toy.id, -1);
                app.refreshShelf();
                render();
            });
            row.querySelector('[data-later]').addEventListener('click', () => {
                move(app.toys, toy.id, 1);
                app.refreshShelf();
                render();
            });
            row.querySelector('.switch').addEventListener('click', () => {
                const index = settings.hidden.indexOf(toy.id);
                if (index >= 0) settings.hidden.splice(index, 1);
                else settings.hidden.push(toy.id);
                // Keep at least one toy out; an empty shelf is a dead end.
                if (settings.hidden.length >= app.toys.length)
                    settings.hidden.splice(settings.hidden.indexOf(toy.id), 1);
                save();
                app.refreshShelf();
                render();
            });
            if (toy.stages) {
                const segments = document.createElement('div');
                segments.className = 'segments';
                STAGES.forEach((id, i) => {
                    const button = document.createElement('button');
                    button.setAttribute('data-stage', id);
                    button.setAttribute('aria-pressed', String(stageOf(toy.id) === id));
                    button.innerHTML = `<strong>${STAGE_TEXT[id][0]}</strong><span>${toy.stages[i]}</span>`;
                    button.addEventListener('click', () => {
                        setStage(toy.id, id);
                        render();
                    });
                    segments.appendChild(button);
                });
                row.appendChild(segments);
            }
            shelf.appendChild(row);
        });
        panel.querySelector('[data-reset-order]').disabled = !settings.order.length;

        for (const name of EXTRAS) {
            panel
                .querySelector(`[data-extra="${name}"]`)
                .setAttribute('aria-pressed', String(settings.extras[name]));
        }
        const bedtime = panel.querySelector('[data-bedtime]');
        bedtime.hidden = !settings.extras.goodnight;
        bedtime.setAttribute('aria-pressed', String(!!app.bedtime));
        bedtime.textContent = app.bedtime ? 'Goodnight is coming: call it off' : 'Goodnight in five minutes';
        panel.querySelector('[data-bedtime-note]').hidden = !settings.extras.goodnight;

        const silent = panel.querySelector('[data-silent]');
        silent.setAttribute('aria-pressed', String(settings.throughSilent));

        const volume = panel.querySelector('[data-volume]');
        volume.value = String(settings.volume);
    }

    panel.querySelector('[data-reset-order]').addEventListener('click', () => {
        resetOrder();
        app.refreshShelf();
        render();
    });

    for (const name of EXTRAS) {
        panel.querySelector(`[data-extra="${name}"]`).addEventListener('click', () => {
            setExtra(name, !settings.extras[name]);
            if (name === 'goodnight' && !settings.extras.goodnight) app.setBedtime(0);
            app.refreshShelf();
            render();
        });
    }

    panel.querySelector('[data-bedtime]').addEventListener('click', () => {
        app.setBedtime(app.bedtime ? 0 : 5);
        render();
    });

    panel.querySelector('[data-silent]').addEventListener('click', () => {
        settings.throughSilent = !settings.throughSilent;
        audio.setThroughSilent(settings.throughSilent);
        save();
        render();
    });

    const volume = panel.querySelector('[data-volume]');
    const setVolume = () => {
        settings.volume = Number(volume.value);
        audio.setVolume(settings.volume);
    };
    volume.addEventListener('input', setVolume);
    volume.addEventListener('change', () => {
        setVolume();
        save();
        audio.note('chime', 5, 60, { gain: 0.9 });
    });

    panel.querySelector('[data-close]').addEventListener('click', close);
}
