// Sound: calming music that writes itself, and the small noises a kitchen makes.
//
// There are no audio files. Everything is synthesised in the browser with the Web Audio API, so
// the game stays a few small text files and there is nothing to download or wait for. It also
// means the music never loops: it is generated a note at a time from a pentatonic scale over a
// slow four-chord drone, so it cannot become the earworm a repeating sixteen-bar file becomes
// after the fortieth play.
//
// Everything is quiet on purpose. The music sits at roughly a sixth of full scale; effects are
// short, soft and pitched low; nothing is sudden or bright. The one continuous sound, a sizzle,
// is filtered noise at a level that reads as warmth rather than frying.

// C major pentatonic, C4 to G5. Five notes and no semitones means any note can follow any other
// without a clash, which is what lets the melody wander at random and still sound calm.
const SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99];

// The drone underneath: root and fifth of C, A minor, F and G. Every chord holds all five scale
// notes without friction.
const CHORDS = [[130.81, 196.00], [110.00, 164.81], [87.31, 130.81], [98.00, 146.83]];

const SETTINGS_KEY = 'little-kitchen.sound';

function loadSettings() {
    try {
        const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        if (stored && typeof stored === 'object')
            return { music: stored.music !== false, sounds: stored.sounds !== false };
    } catch { /* private mode, or nothing stored — the defaults are fine */ }

    return { music: true, sounds: true };
}

export class Sound {
    constructor() {
        this.context = null;
        this.settings = loadSettings();
        this.loops = new Map();
        this.music = null;
        this.noiseBuffer = null;
    }

    // Browsers refuse to start audio without a gesture, so this is called from the first touch
    // on the page and does nothing after that beyond resuming a context the browser suspended.
    unlock() {
        if (this.context) {
            if (this.context.state === 'suspended') this.context.resume();
            return;
        }

        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;

        const context = new Context();
        this.context = context;

        // A gentle compressor catches the moments when a chime, a plop and the music coincide,
        // and a low-pass over everything takes the edge off: warm rather than bright.
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 20;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.01;
        compressor.release.value = 0.3;

        const warmth = context.createBiquadFilter();
        warmth.type = 'lowpass';
        warmth.frequency.value = 8500;

        this.master = context.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(warmth).connect(compressor).connect(context.destination);

        this.musicBus = context.createGain();
        this.musicBus.gain.value = this.settings.music ? 1 : 0;
        this.musicBus.connect(this.master);

        this.sfxBus = context.createGain();
        this.sfxBus.gain.value = this.settings.sounds ? 1 : 0;
        this.sfxBus.connect(this.master);

        this.music = new Music(context, this.musicBus);
        if (this.settings.music) this.music.start();

        // When the tab goes away the music goes with it — a toddler's game should never be
        // heard from a background tab — and comes back when the page does.
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) context.suspend();
            else context.resume();
        });

        if (context.state === 'suspended') context.resume();
    }

    setMusic(on) {
        this.settings.music = on;
        this.save();
        if (!this.context) return;
        ramp(this.musicBus.gain, on ? 1 : 0, this.context.currentTime, 1.0);
        if (on) this.music.start();
        else this.music.stop();
    }

    setSounds(on) {
        this.settings.sounds = on;
        this.save();
        if (!this.context) return;
        ramp(this.sfxBus.gain, on ? 1 : 0, this.context.currentTime, 0.3);
    }

    save() {
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* fine */ }
    }

    //--------------------------------------------------------------------------
    // Effects

    play(name) {
        if (!this.context || !this.settings.sounds) return;
        const t = this.context.currentTime;
        const random = Math.random();

        switch (name) {
            case 'tap':      this.tone({ t, from: 660, to: 660, decay: 0.07, gain: 0.08 }); break;
            case 'pick':     this.tone({ t, from: 300, to: 440, decay: 0.09, gain: 0.08 }); break;
            case 'plop':     this.tone({ t, from: 340 + random * 80, to: 150, decay: 0.18, gain: 0.2 }); break;
            case 'back':     this.tone({ t, from: 420, to: 300, decay: 0.16, gain: 0.06 }); break;
            case 'knob':
                this.noise({ t, duration: 0.03, gain: 0.07, type: 'bandpass', from: 2400, to: 2400 });
                this.tone({ t, from: 220, to: 200, decay: 0.09, gain: 0.07 });
                break;
            case 'stir':
                this.noise({ t, duration: 0.26, gain: 0.05, type: 'bandpass', from: 400, to: 900, q: 1.2 });
                break;
            case 'bubble':
                this.tone({ t, from: 240, to: 480 + random * 200, decay: 0.09, gain: 0.05 });
                break;
            case 'flip':
                this.noise({ t, duration: 0.1, gain: 0.05, type: 'bandpass', from: 900, to: 1400 });
                this.tone({ t: t + 0.03, from: 320, to: 640, decay: 0.12, gain: 0.08 });
                break;
            case 'pour':
                this.noise({ t, duration: 0.7, gain: 0.05, type: 'bandpass', from: 500, to: 1600, q: 0.8 });
                break;
            case 'whoosh':
                this.noise({ t, duration: 0.4, gain: 0.03, type: 'bandpass', from: 300, to: 700, q: 0.8 });
                break;
            case 'warm':
                this.tone({ t, from: 262, to: 262, attack: 0.2, decay: 1.2, gain: 0.07 });
                this.tone({ t, from: 392, to: 392, attack: 0.3, decay: 1.2, gain: 0.05 });
                break;
            case 'munch':
                this.noise({ t, duration: 0.09, gain: 0.1, type: 'lowpass', from: 900, to: 500 });
                this.tone({ t, from: 150, to: 120, decay: 0.1, gain: 0.08 });
                break;
            case 'yum':
                // Two soft hums, "mm-mm", low and rounded.
                this.tone({ t, from: 196, to: 196, attack: 0.05, decay: 0.35, gain: 0.1, lowpass: 700 });
                this.tone({ t: t + 0.3, from: 220, to: 220, attack: 0.05, decay: 0.5, gain: 0.1, lowpass: 700 });
                break;
            case 'chime':
                // A small rising figure for "that step is done". Three soft sines, not a fanfare.
                this.tone({ t, from: 659.25, to: 659.25, attack: 0.01, decay: 0.9, gain: 0.09 });
                this.tone({ t: t + 0.14, from: 783.99, to: 783.99, attack: 0.01, decay: 1.0, gain: 0.08 });
                this.tone({ t: t + 0.28, from: 1046.5, to: 1046.5, attack: 0.01, decay: 1.4, gain: 0.06 });
                break;
            default: break;
        }
    }

    // A single soft oscillator with a pitch glide and a percussive envelope.
    tone({ t, from, to, attack = 0.004, decay = 0.2, gain = 0.1, type = 'sine', lowpass = null }) {
        const context = this.context;
        const osc = context.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(from, t);
        if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + decay * 0.8);

        const amp = context.createGain();
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.exponentialRampToValueAtTime(gain, t + attack);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);

        let tail = osc;
        if (lowpass) {
            const filter = context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = lowpass;
            tail = osc.connect(filter);
        }

        tail.connect(amp).connect(this.sfxBus);
        osc.start(t);
        osc.stop(t + attack + decay + 0.05);
    }

    // A burst of filtered noise, the filter sweeping from one frequency to another.
    noise({ t, duration, gain, type, from, to, q = 0.7 }) {
        const context = this.context;
        const source = context.createBufferSource();
        source.buffer = this.noiseSource();

        const filter = context.createBiquadFilter();
        filter.type = type;
        filter.Q.value = q;
        filter.frequency.setValueAtTime(from, t);
        filter.frequency.exponentialRampToValueAtTime(to, t + duration);

        const amp = context.createGain();
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, duration / 4));
        amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);

        source.connect(filter).connect(amp).connect(this.sfxBus);
        source.start(t);
        source.stop(t + duration + 0.05);
    }

    noiseSource() {
        if (!this.noiseBuffer) {
            const rate = this.context.sampleRate;
            const buffer = this.context.createBuffer(1, rate * 2, rate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
            this.noiseBuffer = buffer;
        }
        return this.noiseBuffer;
    }

    //--------------------------------------------------------------------------
    // Continuous sounds, for as long as something is on the heat

    startLoop(name) {
        if (!this.context || this.loops.has(name)) return;
        const context = this.context;
        const t = context.currentTime;

        const source = context.createBufferSource();
        source.buffer = this.noiseSource();
        source.loop = true;

        const amp = context.createGain();
        amp.gain.setValueAtTime(0.0001, t);

        // A slow wobble on the level, so it breathes instead of hissing flat.
        const lfo = context.createOscillator();
        lfo.frequency.value = name === 'sizzle' ? 0.7 : 0.35;
        const depth = context.createGain();
        lfo.connect(depth).connect(amp.gain);

        let chain;
        if (name === 'sizzle') {
            const high = context.createBiquadFilter();
            high.type = 'highpass';
            high.frequency.value = 2500;
            const low = context.createBiquadFilter();
            low.type = 'lowpass';
            low.frequency.value = 6500;
            chain = source.connect(high).connect(low);
            depth.gain.value = 0.008;
            ramp(amp.gain, 0.018, t, 0.8);
        } else {
            // simmer: a low, soft rumble under the bubbles
            const band = context.createBiquadFilter();
            band.type = 'bandpass';
            band.frequency.value = 500;
            band.Q.value = 0.6;
            chain = source.connect(band);
            depth.gain.value = 0.004;
            ramp(amp.gain, 0.012, t, 0.8);
        }

        chain.connect(amp).connect(this.sfxBus);
        source.start(t);
        lfo.start(t);

        // Simmering also pops the occasional bubble.
        let timer = null;
        if (name === 'simmer') {
            const pop = () => {
                this.play('bubble');
                timer = setTimeout(pop, 350 + Math.random() * 500);
            };
            timer = setTimeout(pop, 400);
        }

        this.loops.set(name, { source, lfo, amp, timer });
    }

    stopLoop(name) {
        const loop = this.loops.get(name);
        if (!loop) return;
        this.loops.delete(name);
        if (loop.timer) clearTimeout(loop.timer);

        const t = this.context.currentTime;
        ramp(loop.amp.gain, 0.0001, t, 0.5);
        loop.source.stop(t + 0.6);
        loop.lfo.stop(t + 0.6);
    }

    stopAllLoops() {
        for (const name of [...this.loops.keys()]) this.stopLoop(name);
    }
}

function ramp(param, value, t, seconds) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(Math.max(param.value, 0.0001), t);
    param.exponentialRampToValueAtTime(Math.max(value, 0.0001), t + seconds);
}

//==============================================================================
// The music

class Music {
    constructor(context, out) {
        this.context = context;
        this.running = false;
        this.timer = null;

        this.out = context.createGain();
        this.out.gain.value = 0.0001;
        this.out.connect(out);

        // A feedback delay gives the notes somewhere to hang in the air, and the low-pass in the
        // loop makes each repeat softer and darker than the last.
        this.input = context.createGain();
        const delay = context.createDelay(2);
        delay.delayTime.value = 0.56;
        const damp = context.createBiquadFilter();
        damp.type = 'lowpass';
        damp.frequency.value = 1600;
        const feedback = context.createGain();
        feedback.gain.value = 0.32;
        const wet = context.createGain();
        wet.gain.value = 0.5;

        this.input.connect(this.out);
        this.input.connect(delay).connect(damp).connect(feedback).connect(delay);
        damp.connect(wet).connect(this.out);

        this.pad = null;
        this.next = 0;
        this.pulse = 0;
        this.degree = 3;
        this.chord = 0;
    }

    start() {
        if (this.running) return;
        this.running = true;

        const t = this.context.currentTime;
        ramp(this.out.gain, 0.17, t, 3.0);

        this.startPad();
        this.next = t + 0.4;
        this.timer = setInterval(() => this.schedule(), 200);
    }

    stop() {
        if (!this.running) return;
        this.running = false;
        clearInterval(this.timer);
        this.timer = null;

        const t = this.context.currentTime;
        ramp(this.out.gain, 0.0001, t, 1.5);

        const pad = this.pad;
        this.pad = null;
        for (const osc of pad.oscillators) osc.stop(t + 1.7);
        pad.lfo.stop(t + 1.7);
    }

    // The drone: root and fifth as sines, plus a triangle an octave below for a little body, all
    // through a low-pass so it is felt more than heard. Its level rises and falls very slowly.
    startPad() {
        const context = this.context;
        const [root, fifth] = CHORDS[this.chord];

        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 520;

        const amp = context.createGain();
        amp.gain.value = 0.32;

        const lfo = context.createOscillator();
        lfo.frequency.value = 0.07;
        const depth = context.createGain();
        depth.gain.value = 0.08;
        lfo.connect(depth).connect(amp.gain);

        const voices = [
            { type: 'sine', freq: root, gain: 1 },
            { type: 'sine', freq: fifth, gain: 0.6 },
            { type: 'triangle', freq: root / 2, gain: 0.22 },
        ];

        const oscillators = voices.map(({ type, freq, gain }) => {
            const osc = context.createOscillator();
            osc.type = type;
            osc.frequency.value = freq;
            const g = context.createGain();
            g.gain.value = gain;
            osc.connect(g).connect(filter);
            osc.start();
            return osc;
        });

        filter.connect(amp).connect(this.input);
        lfo.start();

        this.pad = { oscillators, lfo, amp };
    }

    changeChord(t) {
        this.chord = (this.chord + 1) % CHORDS.length;
        if (!this.pad) return;
        const [root, fifth] = CHORDS[this.chord];
        const [a, b, c] = this.pad.oscillators;
        a.frequency.setTargetAtTime(root, t, 0.6);
        b.frequency.setTargetAtTime(fifth, t, 0.6);
        c.frequency.setTargetAtTime(root / 2, t, 0.6);
    }

    schedule() {
        if (!this.running) return;
        const now = this.context.currentTime;

        while (this.next < now + 0.6) {
            this.playPulse(this.next);

            // Unevenly spaced, and with a longer breath every eighth pulse, so it never settles
            // into a beat.
            let interval = 1.4 + Math.random() * 0.6;
            if (this.pulse % 8 === 7) interval += 1.2;
            this.next += interval;
            this.pulse++;
        }
    }

    playPulse(t) {
        if (this.pulse % 8 === 0 && this.pulse > 0) this.changeChord(t);

        // Rests are part of the melody. About a quarter of pulses are silent.
        if (Math.random() < 0.26) return;

        // A random walk, mostly by step, kept within the scale. Now and then it lands on the
        // chord's root to remind the ear where home is.
        if (Math.random() < 0.15) {
            this.degree = this.chord === 0 ? 5 : this.chord === 1 ? 4 : this.chord === 2 ? 5 : 3;
        } else {
            const step = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
            this.degree = Math.max(0, Math.min(SCALE.length - 1, this.degree + step));
        }

        const freq = SCALE[this.degree];
        const velocity = 0.45 + Math.random() * 0.4;
        const when = t + Math.random() * 0.08;

        if (Math.random() < 0.2) this.bell(freq, when, velocity);
        else this.breath(freq, when, velocity);

        // Occasionally a second, quieter note a moment later, like an echo that was meant.
        if (Math.random() < 0.2) {
            const other = Math.max(0, Math.min(SCALE.length - 1, this.degree + (Math.random() < 0.5 ? 2 : -2)));
            this.breath(SCALE[other], when + 0.35, velocity * 0.5);
        }
    }

    // A note that swells in rather than strikes: a sine with a slow attack and a faint octave
    // above it for colour.
    breath(freq, t, velocity) {
        const context = this.context;
        const amp = context.createGain();
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.exponentialRampToValueAtTime(velocity, t + 0.35);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);

        for (const [ratio, level] of [[1, 1], [2, 0.18]]) {
            const osc = context.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq * ratio;
            const g = context.createGain();
            g.gain.value = level;
            osc.connect(g).connect(amp);
            osc.start(t);
            osc.stop(t + 2.8);
        }

        amp.connect(this.input);
    }

    // A music-box note: a triangle through a low-pass, struck softly and left to ring.
    bell(freq, t, velocity) {
        const context = this.context;
        const osc = context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1400;

        const amp = context.createGain();
        amp.gain.setValueAtTime(0.0001, t);
        amp.gain.exponentialRampToValueAtTime(velocity * 0.55, t + 0.012);
        amp.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);

        osc.connect(filter).connect(amp).connect(this.input);
        osc.start(t);
        osc.stop(t + 2.1);
    }
}
