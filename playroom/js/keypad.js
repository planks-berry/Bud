// The passcode keypad in the grown-ups' corner: four numbers that lock the goodnight timer. The first
// time, a grown-up chooses them, twice to be sure; after that, starting, changing or stopping the
// timer asks for them. Forgotten, they can be cleared by typing four numbers the keypad shows: easy
// for anyone who can read them, and not for a three-year-old.

import { hasPasscode, checkPasscode, setPasscode } from './settings.js';

export function setupKeypad(panel) {
    const keypad = panel.querySelector('[data-keypad]');
    const pad = keypad.querySelector('[data-pad]');
    const title = keypad.querySelector('[data-pad-title]');
    const hint = keypad.querySelector('[data-pad-hint]');
    const dots = Array.prototype.slice.call(keypad.querySelectorAll('.dots i'));
    const forgot = keypad.querySelector('[data-pad-forgot]');
    let mode = '';
    let entry = '';
    let first = '';
    let reason = '';
    let shown = '';
    let done = null;

    const TEXT = {
        choose: ['Choose a passcode', () => `${reason}: four numbers that only a grown-up knows.`],
        again: ['Once more', () => 'The same four numbers again, to be sure.'],
        check: ['Passcode', () => `${reason}.`],
        forgot: [
            'Forgotten?',
            () => `Type ${shown.split('').join(' ')} to remove the passcode, then choose a new one.`,
        ],
    };

    function show(next, message) {
        mode = next;
        entry = '';
        title.textContent = TEXT[mode][0];
        hint.textContent = message || TEXT[mode][1]();
        forgot.style.visibility = mode === 'check' ? 'visible' : 'hidden';
        paint();
    }

    function paint() {
        dots.forEach((dot, i) => dot.classList.toggle('on', i < entry.length));
    }

    function shake(next, message) {
        pad.classList.remove('shake');
        // Reading the layout restarts the animation.
        void pad.offsetWidth;
        pad.classList.add('shake');
        show(next, message);
    }

    function finish(ok) {
        keypad.hidden = true;
        const resolve = done;
        done = null;
        if (resolve) resolve(ok);
    }

    function entered() {
        if (mode === 'choose') {
            first = entry;
            show('again');
        } else if (mode === 'again') {
            if (entry === first) {
                setPasscode(entry);
                finish(true);
            } else shake('choose', 'Those two did not match. Choose again.');
        } else if (mode === 'check') {
            if (checkPasscode(entry)) finish(true);
            else shake('check', 'Not that one. Try again.');
        } else if (mode === 'forgot') {
            if (entry === shown) {
                setPasscode('');
                show(
                    'choose',
                    'The passcode is gone. Choose a new one: four numbers that only a grown-up knows.'
                );
            } else shake('forgot');
        }
    }

    for (const key of keypad.querySelectorAll('[data-key]')) {
        key.addEventListener('click', () => {
            const value = key.getAttribute('data-key');
            if (value === 'back') entry = entry.slice(0, -1);
            else if (entry.length < 4) entry += value;
            paint();
            // A moment to see the fourth dot fill before the answer.
            if (entry.length === 4) setTimeout(entered, 150);
        });
    }
    forgot.addEventListener('click', () => {
        shown = String(1000 + Math.floor(Math.random() * 9000));
        show('forgot');
    });
    keypad.querySelector('[data-pad-cancel]').addEventListener('click', () => finish(false));

    return {
        // Resolves true once the grown-up has given the passcode, or chosen one if there was none;
        // false if they cancel. `why` finishes the sentence "…: four numbers", as "To lock the timer".
        ask(why) {
            reason = why;
            if (done) finish(false);
            return new Promise((resolve) => {
                done = resolve;
                keypad.hidden = false;
                show(hasPasscode() ? 'check' : 'choose');
            });
        },
    };
}
