// The grown-up's corner: a leaf on the shelf that opens a settings panel after a three-second
// press. Three seconds of holding still is easy for an adult and unlikely from a three-year-old,
// who taps.
//
// The panel is ordinary HTML with words in it, because it is for someone who reads.

import { settings, save, STAGES } from './settings.js';
import * as audio from './audio.js';

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
    }

    function close() {
        panel.hidden = true;
        gate.hidden = !!app.current;
    }

    function render() {
        const stages = panel.querySelector('[data-stages]');
        stages.innerHTML = '';
        for (const id of STAGES) {
            const button = document.createElement('button');
            button.className = 'choice';
            button.setAttribute('aria-pressed', String(settings.stage === id));
            button.innerHTML = `<strong>${STAGE_TEXT[id][0]}</strong><span>${STAGE_TEXT[id][1]}</span>`;
            button.addEventListener('click', () => {
                settings.stage = id;
                save();
                app.refreshShelf();
                render();
            });
            stages.appendChild(button);
        }

        const shelf = panel.querySelector('[data-shelf]');
        shelf.innerHTML = '';
        for (const toy of app.toys) {
            const shown = settings.hidden.indexOf(toy.id) < 0;
            const row = document.createElement('button');
            row.className = 'toggle';
            row.setAttribute('aria-pressed', String(shown));
            row.innerHTML = `<span class="label"><strong>${toy.title}</strong><span>${toy.about}</span></span><span class="switch"></span>`;
            row.addEventListener('click', () => {
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
            shelf.appendChild(row);
        }

        const silent = panel.querySelector('[data-silent]');
        silent.setAttribute('aria-pressed', String(settings.throughSilent));

        const volume = panel.querySelector('[data-volume]');
        volume.value = String(settings.volume);
    }

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
