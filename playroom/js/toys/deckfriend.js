// The friend at the turntable: Weather Song's small friend, in headphones, behind the decks. It takes
// turns with him. It never takes over the turntable; it plays when it is its turn, and then it waits
// for his, the way Ms Rachel smiles and waits.
//
// Seed: it answers his pads. Whatever he taps, once he pauses, it taps back on the same pads in his
// rhythm. Sprout: it leads, a scratch on the record and a pad, and then it waits for him, leaning in;
// whatever he does next, it answers with a phrase that uses his sound: his scratch with a scratch,
// his pads with his pads. Bloom: with the record playing, call and response two bars at a time, a
// turn each time the record comes round; and the beat he taps in his turn stays in the record's
// loop, played each time round, while the playroom is open. Nothing is saved.
//
// It stands behind the turntable, only its top half showing, and reaches over with its arms: to the
// record to scratch, to a pad to tap it. It slides along behind to be near what it plays.

import { Spring, clamp, lerp } from '../util.js';
import { Friend } from '../friend.js';
import { STEP, STEPS, LENGTH } from './records.js';

// Untouched this long with the record stopped, the friend dozes off, and nothing moves.
const DOZE = 60;

// How long a pause ends his turn; how long the friend waits, at Sprout, before it leads again, and
// how many times it does with no answer before it simply listens to the music.
const PAUSE = 1.1;
const LEAD_AFTER = 9;
const LEADS = 2;
// How far ahead of a hit the hand starts to move there.
const REACH = 0.22;
// The beats the friend plays in its two bars at Bloom, by the eighth note, and on what. Its own
// part is short and leaves room; his answer can be anything.
const CALLS = [
    [
        [0, 'boom'],
        [4, 'horn'],
        [8, 'boom'],
        [10, 'boom'],
        [12, 'horn'],
    ],
    [
        [0, 'boom'],
        [3, 'boom'],
        [6, 'clap'],
        [8, 'scratch'],
        [12, 'cow'],
    ],
    [
        [0, 'horn'],
        [2, 'horn'],
        [4, 'boom'],
        [8, 'shaker'],
        [10, 'shaker'],
        [12, 'scratch'],
    ],
];

// His beats kept in each record's loop while the playroom is open: by record, the eighth notes and
// the pads on them. In memory only.
const KEPT = new Map();

export class DeckFriend {
    constructor(scene) {
        this.scene = scene;
        this.level = scene.level;
        this.friend = new Friend({ headphones: true, mood: 'content' });
        this.x = new Spring(0, 60, 12);
        this.mode = 'wait';
        this.inputs = [];
        this.lastHeard = -10;
        this.timeline = null;
        this.leads = 0;
        this.quietSince = 0;
        // At Bloom, whose two bars these are, and the loop's last place, to see it come round.
        this.turn = 'friend';
        this.loops = 0;
        this.lastPlace = 0;
        this.mine = [];
        this.time = 0;
        // Where each hand is going, on the screen, or null for home: kept on the screen rather than
        // on the friend, so a hand stays on its pad while the friend slides.
        this.hands = [null, null];
        // Whether the record was going round last frame, to see it start.
        this.wasLooping = false;
    }

    layout() {
        const s = this.scene;
        this.r = s.R * 0.36;
        this.home = s.cx + s.R * 1.12;
        this.cut = s.plinth.y + s.R * 0.02;
        this.feet = s.plinth.y + this.r * 0.8;
        if (!this.placed) {
            this.placed = true;
            this.x.set(this.home);
        }
    }

    // What he did: a pad, or his hand on the record.
    heard(kind, name) {
        const t = this.time;
        if (this.mode === 'play' && this.level < 2) return;
        if (this.level === 2 && this.looping()) {
            // In his two bars, his pads are kept, by the eighth note they fell on.
            if (this.turn === 'him' && kind === 'pad' && name !== 'scratch') {
                const step = Math.round(this.scene.place() / STEP) % STEPS;
                this.mine = this.mine.filter((m) => m[0] !== step);
                this.mine.push([step, name]);
            }
            return;
        }
        // A scratch is one thing however long the hand stays on the record.
        const last = this.inputs[this.inputs.length - 1];
        if (kind === 'scratch' && last && last.kind === 'scratch' && t - last.t < 0.6) last.t = t;
        else this.inputs.push({ kind, name, t });
        this.lastHeard = t;
        this.leads = 0;
        this.friend.feel('happy');
    }

    // Is the record going round, for call and response by the bar?
    // (A scratch slows it for a moment; it is still going round.)
    looping() {
        const s = this.scene;
        return s.motor && !s.swap;
    }

    // A phrase for the friend to play: events at times from now, each a pad or a scratch.
    perform(events) {
        this.mode = 'play';
        this.timeline = {
            t: 0,
            events: events.map((e) => Object.assign({ done: false, reached: false }, e)),
        };
        this.friend.feel('happy');
    }

    // His phrase played back on his own sounds, in his rhythm, kept between brisk and steady; at
    // Sprout and Bloom with a little flourish of its own after it.
    answer() {
        const heard = this.inputs.slice(-4);
        this.inputs = [];
        const events = [];
        let at = 0.35;
        heard.forEach((h, i) => {
            if (i) at += clamp(h.t - heard[i - 1].t, 0.22, 0.6);
            events.push({ at, kind: h.kind, name: h.name });
        });
        if (this.level > 0) {
            const pads = this.scene.pads.map((p) => p.name).filter((n) => n !== 'scratch');
            const last = heard[heard.length - 1];
            const other = pads.find((n) => !last || n !== last.name) || pads[0];
            events.push({ at: at + 0.4, kind: 'pad', name: other });
        }
        this.perform(events);
    }

    // At Sprout, the friend leads: a scratch, a pad, and then it waits for him.
    lead() {
        this.leads++;
        const pads = this.scene.pads.map((p) => p.name).filter((n) => n !== 'scratch');
        this.perform([
            { at: 0.3, kind: 'scratch' },
            { at: 1.05, kind: 'pad', name: pads[1] || pads[0] },
        ]);
    }

    update(dt) {
        this.time += dt;
        const t = this.time;
        const s = this.scene;
        const friend = this.friend;
        if (!s.motor && !this.timeline && s.time - s.touched > DOZE) {
            friend.feel('asleep');
            this.x.update(dt);
            return friend.update(dt);
        }
        const looping = this.level === 2 && this.looping();
        if (looping && !this.wasLooping) {
            this.turn = 'friend';
            this.lastPlace = s.place();
            this.inputs = [];
            this.call();
        }
        this.wasLooping = looping;
        if (looping) this.byTheBar();
        else if (this.mode === 'wait') {
            if (this.inputs.length && t - this.lastHeard >= PAUSE && !s.hand) this.answer();
            else if (!this.inputs.length && this.level === 1) {
                this.quietSince += dt;
                if (this.quietSince >= (this.leads ? LEAD_AFTER : 1.5) && this.leads < LEADS) {
                    this.quietSince = 0;
                    this.lead();
                }
            }
        }

        // The phrase: move a hand there just before each hit, then play it.
        const line = this.timeline;
        if (line) {
            line.t += dt;
            for (const e of line.events) {
                if (!e.reached && line.t >= e.at - REACH) {
                    e.reached = true;
                    this.reachFor(e);
                }
                if (!e.done && line.t >= e.at) {
                    e.done = true;
                    this.play(e);
                }
                // A hand that has played comes back, unless it is playing again soon.
                if (e.done && !e.back && line.t >= e.at + 0.3) {
                    e.back = true;
                    const hand = e.kind === 'scratch' ? 0 : 1;
                    const again = line.events.some((f) => !f.done && (f.kind === 'scratch' ? 0 : 1) === hand);
                    if (!again) this.hands[hand] = null;
                }
            }
            const end = line.events.length ? line.events[line.events.length - 1].at + 0.45 : 0;
            if (line.t >= end) {
                this.timeline = null;
                this.rest();
            }
        }
        // Back home, the friend leans in to listen while it is his turn.
        if (this.mode === 'wait' && !this.timeline) {
            friend.feel(t - this.lastHeard < 2 ? 'happy' : 'listen');
            friend.look(0, 1);
        }
        // It nods to the record as it plays.
        if (s.motor && Math.abs(s.rate) > 0.5) {
            const beat = Math.floor(s.place() / (STEP * 2));
            if (beat !== this.nodded) {
                this.nodded = beat;
                friend.bob(0.7);
            }
        }
        this.x.update(dt);
        // The hands' places on the screen, as the friend's own reach from where it now stands.
        this.hands.forEach((at, i) =>
            friend.reach(i, at ? { x: (at.x - this.x.value) / this.r, y: (this.feet - at.y) / this.r } : null)
        );
        friend.update(dt);
        return true;
    }

    // At Bloom while the record plays: each time it comes round, the turn changes. The friend's two
    // bars are its call; his two bars are his answer, and what he taps in them stays in the loop.
    byTheBar() {
        const s = this.scene;
        const place = s.place();
        const kept = KEPT.get(s.records[s.current].name) || [];
        // The kept beats play as the needle reaches them, going forward at speed.
        if (s.rate > 0.5 && !s.hand) {
            for (const [step, name] of kept) {
                const at = step * STEP;
                if (this.lastPlace < at && place >= at) {
                    const pad = s.pads.find((p) => p.name === name);
                    if (pad) s.hit(pad, true);
                }
            }
        }
        if (place < this.lastPlace - LENGTH / 2) {
            // Round again.
            this.loops++;
            if (this.turn === 'friend') {
                this.turn = 'him';
                this.mine = [];
                this.friend.feel('listen');
                this.timeline = null;
                this.rest();
            } else {
                this.turn = 'friend';
                if (this.mine.length) KEPT.set(s.records[s.current].name, this.mine.slice());
                this.call();
            }
        }
        this.lastPlace = place;
    }

    // Its two bars: one of its calls, on the pads there are, timed to the record.
    call() {
        const s = this.scene;
        const names = s.pads.map((p) => p.name);
        const pattern = CALLS[this.loops % CALLS.length].filter(([, name]) => names.indexOf(name) >= 0);
        const per = STEP / Math.max(0.3, s.speed);
        this.perform(
            pattern.map(([step, name]) => ({
                at: step * per,
                kind: name === 'scratch' ? 'scratch' : 'pad',
                name,
            }))
        );
    }

    // Move to be near what it is about to play, and send the hand there: the left one to the
    // record, the right one to a pad.
    reachFor(e) {
        const s = this.scene;
        if (e.kind === 'scratch') {
            this.x.target = s.cx + s.R * 0.5;
            this.hands[0] = { x: s.cx + s.R * 0.62, y: s.cy - s.R * 0.55 };
        } else {
            const pad = s.pads.find((p) => p.name === e.name);
            if (!pad) return;
            this.x.target = lerp(this.home, pad.x, 0.6);
            this.hands[1] = { x: pad.x, y: pad.y - pad.r * 0.1 };
        }
    }

    play(e) {
        const s = this.scene;
        if (e.kind === 'scratch') {
            s.scratch();
            this.friend.bob(1.2);
        } else {
            const pad = s.pads.find((p) => p.name === e.name);
            if (pad) s.hit(pad, true);
            // The hand taps down onto it and comes up a little.
            this.friend.hands[3].velocity -= 4;
        }
    }

    // Hands home, back to its place, and its turn is over.
    rest() {
        this.hands = [null, null];
        this.x.target = this.home;
        this.mode = 'wait';
        this.quietSince = 0;
        if (!(this.level === 2 && this.looping())) this.friend.feel('listen');
    }

    draw(ctx) {
        this.friend.draw(ctx, this.x.value, this.feet, this.r, this.cut);
    }

    // At Bloom, the beats he has left in this record's loop, for the turntable to show.
    kept() {
        const s = this.scene;
        return KEPT.get(s.records[s.current].name) || [];
    }
}
