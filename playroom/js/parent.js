// The grown-up's corner: a leaf on the shelf that opens a settings panel after a three-second
// press. Three seconds of holding still is easy for an adult and unlikely from a three-year-old,
// who taps.
//
// The panel is ordinary HTML with words in it, because it is for someone who reads.

import { settings, save, STAGES, stageOf, setStage, setAllStages } from './settings.js';
import * as audio from './audio.js';
import * as usage from './usage.js';

const HOLD_MS = 3000;

const STAGE_TEXT = {
    seed: ['Seed', 'Fewer, larger pieces. Mostly cause and effect.'],
    sprout: ['Sprout', 'The everyday set.'],
    bloom: ['Bloom', 'More pieces, more tools, finer work.'],
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function minutes(ms) {
    if (ms <= 0) return '0 min';
    if (ms < 60000) return 'under 1 min';
    return `${Math.round(ms / 60000)} min`;
}

// The last seven days against the days before. Until the record is a week old, there is nothing to
// set against, so it says how long it has been keeping count.
function usageLine(id) {
    const r = usage.recent(id);
    if (r.covered === 1) return `Today: ${minutes(r.week)}`;
    if (r.covered === 2) return `Since yesterday: ${minutes(r.week)}`;
    if (r.covered <= 7)
        return `Since ${DAY_NAMES[usage.daysAgo(r.covered - 1).getDay()]}: ${minutes(r.week)}`;
    const days = r.covered - 7;
    const span = days === 1 ? 'the day before' : `the ${days} days before`;
    return `Last 7 days: ${minutes(r.week)} · ${span}: ${minutes(r.before)}`;
}

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
        // A toy moved on needs its new sounds ready before it is opened.
        app.warmUp();
    }

    function render() {
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

        const shelf = panel.querySelector('[data-shelf]');
        shelf.innerHTML = '';
        for (const toy of app.toys) {
            const shown = settings.hidden.indexOf(toy.id) < 0;
            const row = document.createElement('div');
            row.className = shown ? 'toy' : 'toy off';
            row.setAttribute('data-toy', toy.id);
            row.innerHTML =
                `<div class="head"><span class="label"><strong>${toy.title}</strong>` +
                `<span>${toy.about}</span><span class="usage">${usageLine(toy.id)}</span></span>` +
                `<button class="switch" aria-pressed="${shown}" aria-label="On the shelf"></button></div>`;
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
