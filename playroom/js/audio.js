// The audio engine: one context, a small fixed mixing graph, cached one-shot sounds, and a handful
// of continuous textures that follow a finger.
//
// Written against Safari 12, which shapes most of it:
//
//   - Only `webkitAudioContext` exists (the unprefixed constructor arrived in 14.1), and it starts
//     suspended. It is created and resumed inside the first touch, and resumed again on the first
//     touch after the page comes back from the background.
//   - There is no StereoPannerNode (14.1), so stereo placement is five fixed pan buses built from
//     gain nodes and a channel merger. A voice joins the nearest bus; nothing is created per voice.
//   - A ConvolverNode only accepts an impulse response at the context's own rate, so the room is
//     rendered after the context exists, a moment after the first sound so it does not delay it.
//   - Continuous controls (a texture's level, a filter's centre, a whistle's pitch) never use
//     the automation timeline. Old WebKit keeps every scheduled event, and a finger updating a
//     parameter thirty times a second for ten minutes is eighteen thousand of them. Instead each
//     controlled parameter is driven by a constant signal through a gentle low-pass, and the page
//     sets the constant directly. Smooth, zipper-free, and nothing accumulates.
//
// The hardware silent switch mutes Web Audio on iOS. A toy whose sound has silently disappeared
// looks broken, so by default (a setting for the grown-up) the engine asks for the playback
// session instead: through `navigator.audioSession` where it exists, and on iOS 12 by keeping a
// silent <audio> element playing, which moves the page into the playback category.

import { render, whiteNoise, pinkNoise, sandNoise, impulseResponse, noteHz, MIX } from './synth.js';
import { clamp } from './util.js';

// One-shot sounds are rendered at this rate whatever the context runs at; an AudioBuffer carries
// its own rate and Web Audio converts on playback. That lets the sounds be rendered before the
// first touch, when there is not yet a context to ask.
const RENDER_RATE = 44100;

const MAX_VOICES = 36;

const PANS = [-0.6, -0.3, 0, 0.3, 0.6];
const SEND_LEVELS = [0.14, 0.3, 0.55];

const Context = window.AudioContext || window.webkitAudioContext;
const IOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const state = {
    ctx: null,
    master: null,
    analyser: null,
    buses: [],
    sends: [],
    reverbIn: null,
    voices: [],
    buffers: new Map(),
    data: new Map(),
    loops: new Map(),
    ones: null,
    queue: [],
    queueTimer: 0,
    waking: 0,
    silent: null,
    volume: 0.85,
    throughSilent: true,
    textures: new Set(),
};

//==============================================================================
// Starting

// Called from every touch and click. Cheap once everything is running; until then it is the only
// place the context can be created and woken, because iOS only allows it inside a gesture.
//
// `allowCreate` is false for a touch that is just starting. Neither iOS 12 nor Chrome counts
// touchstart as a gesture that may start audio (it might become a scroll); touchend is the one that
// counts, and creating the context a moment early only earns a warning and a context that sleeps.
export function unlock(allowCreate = true) {
    if (!Context) return;
    if (!state.ctx && !allowCreate) return;
    if (!state.ctx) createContext();
    const ctx = state.ctx;
    if (!ctx) return;

    if (ctx.state !== 'running') {
        state.waking = Date.now();
        // A one-sample buffer started inside the gesture is what actually opens the output on
        // older iOS; resume() alone is not always enough.
        try {
            const source = ctx.createBufferSource();
            source.buffer = ctx.createBuffer(1, 1, 22050);
            source.connect(ctx.destination);
            source.start(0);
        } catch (error) {
            /* nothing to unlock with; resume() below is the remaining hope */
        }
        if (ctx.resume) {
            const resumed = ctx.resume();
            if (resumed && resumed.catch) resumed.catch(() => {});
        }
    }

    if (state.throughSilent) holdPlaybackSession();
}

function createContext() {
    let ctx;
    try {
        ctx = new Context();
    } catch (error) {
        return;
    }

    // iOS can hand out a context at a rate the hardware is no longer running at (after a video, or
    // a change of output), and everything then plays slightly detuned and crackly. Playing a buffer
    // at the expected rate and starting again gets a context at the true rate. From Jam3's
    // ios-safe-audio-context.
    if (IOS && ctx.sampleRate !== RENDER_RATE && ctx.close) {
        try {
            const dummy = ctx.createBufferSource();
            dummy.buffer = ctx.createBuffer(1, 1, RENDER_RATE);
            dummy.connect(ctx.destination);
            dummy.start(0);
            dummy.disconnect();
            ctx.close();
            ctx = new Context();
        } catch (error) {
            /* keep whichever context we have */
        }
    }

    state.ctx = ctx;
    buildGraph(ctx);

    // The room is the most expensive thing to render, and the first sound should not wait for it.
    setTimeout(() => buildRoom(ctx), 30);

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) sleep();
    });
    window.addEventListener('pagehide', sleep);
}

function buildGraph(ctx) {
    const master = ctx.createGain();
    master.gain.value = state.volume;

    // A gentle high shelf takes the edge off anything bright, and the compressor keeps eight
    // fingers on eight bars from summing into distortion.
    const soften = ctx.createBiquadFilter();
    soften.type = 'highshelf';
    soften.frequency.value = 6500;
    soften.gain.value = -4;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.25;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;

    master.connect(soften);
    soften.connect(compressor);
    compressor.connect(analyser);
    analyser.connect(ctx.destination);

    state.master = master;
    state.analyser = analyser;

    state.buses = PANS.map((pan) => {
        const input = ctx.createGain();
        input.channelCount = 1;
        input.channelCountMode = 'explicit';
        const left = ctx.createGain();
        const right = ctx.createGain();
        const angle = ((pan + 1) * Math.PI) / 4;
        left.gain.value = Math.cos(angle) * 1.25;
        right.gain.value = Math.sin(angle) * 1.25;
        const merger = ctx.createChannelMerger(2);
        input.connect(left);
        input.connect(right);
        left.connect(merger, 0, 0);
        right.connect(merger, 0, 1);
        merger.connect(master);
        return input;
    });

    state.reverbIn = ctx.createGain();
    state.sends = SEND_LEVELS.map((level) => {
        const send = ctx.createGain();
        send.gain.value = level;
        send.connect(state.reverbIn);
        return send;
    });

    // A buffer of constant 1.0, looped by every controlled parameter. See `Control` below.
    state.ones = ctx.createBuffer(1, 1024, ctx.sampleRate);
    state.ones.getChannelData(0).fill(1);
}

function buildRoom(ctx) {
    if (ctx !== state.ctx) return;
    const channels = impulseResponse(ctx.sampleRate);
    const buffer = ctx.createBuffer(2, channels[0].length, ctx.sampleRate);
    buffer.getChannelData(0).set(channels[0]);
    buffer.getChannelData(1).set(channels[1]);
    const convolver = ctx.createConvolver();
    convolver.buffer = buffer;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    state.reverbIn.connect(convolver);
    convolver.connect(wet);
    wet.connect(state.master);
}

// Let go of the hardware while in the background. The next touch wakes it, inside a gesture, which
// is the only place iOS reliably allows it; resuming on visibility instead can leave a context
// that reports 'running' and plays nothing.
function sleep() {
    const ctx = state.ctx;
    if (!ctx) return;
    for (const texture of state.textures) texture.silence();
    if (state.silent) state.silent.pause();
    if (ctx.suspend && ctx.state === 'running') {
        const suspended = ctx.suspend();
        if (suspended && suspended.catch) suspended.catch(() => {});
    }
}

// The silent-switch workaround for iOS 12: a looping, inaudible WAV in an <audio> element. While a
// media element plays, WebKit puts the whole page in the playback audio session, which the silent
// switch does not mute.
function holdPlaybackSession() {
    if (navigator.audioSession) {
        try {
            navigator.audioSession.type = 'playback';
        } catch (error) {
            /* read-only here; fall through to the element */
        }
        return;
    }
    if (!IOS) return;
    if (!state.silent) {
        const element = document.createElement('audio');
        element.setAttribute('x-webkit-airplay', 'deny');
        element.setAttribute('playsinline', '');
        element.preload = 'auto';
        element.loop = true;
        element.src = silentWav();
        state.silent = element;
    }
    if (state.silent.paused) {
        const played = state.silent.play();
        if (played && played.catch) played.catch(() => {});
    }
}

function releasePlaybackSession() {
    if (navigator.audioSession) {
        try {
            navigator.audioSession.type = 'auto';
        } catch (error) {
            /* nothing to release */
        }
    }
    if (state.silent) state.silent.pause();
}

// A fifth of a second of 16-bit silence at 8 kHz, as a data URI.
function silentWav() {
    const samples = 1600;
    const bytes = 44 + samples * 2;
    const view = new DataView(new ArrayBuffer(bytes));
    const text = (offset, value) => {
        for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    };
    text(0, 'RIFF');
    view.setUint32(4, bytes - 8, true);
    text(8, 'WAVE');
    text(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 16000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, 'data');
    view.setUint32(40, samples * 2, true);
    let binary = '';
    for (let i = 0; i < bytes; i++) binary += String.fromCharCode(view.getUint8(i));
    return `data:audio/wav;base64,${btoa(binary)}`;
}

//==============================================================================
// Settings

export function setVolume(volume) {
    state.volume = clamp(volume, 0, 1);
    if (state.master) state.master.gain.value = state.volume;
}

export function setThroughSilent(on) {
    state.throughSilent = !!on;
    if (!state.ctx) return;
    if (on) holdPlaybackSession();
    else releasePlaybackSession();
}

// Running, or just asked to resume. resume() settles asynchronously, and the sound that answers
// the very first touch would otherwise be dropped while it does. Sounds started while suspended
// wait and play on resume; the short window stops a failed unlock from queueing a burst.
export function ready() {
    const ctx = state.ctx;
    if (!ctx) return false;
    if (ctx.state === 'running') return true;
    return ctx.state === 'suspended' && Date.now() - state.waking < 800;
}

export function now() {
    return state.ctx ? state.ctx.currentTime : 0;
}

//==============================================================================
// One-shots

function keyOf(name, params) {
    const f = params.f ? params.f.toFixed(2) : '';
    return `${name}|${f}|${params.variant || ''}|${params.seed || ''}`;
}

function dataFor(name, params) {
    const key = keyOf(name, params);
    let data = state.data.get(key);
    if (!data) {
        data = render(name, RENDER_RATE, params);
        state.data.set(key, data);
    }
    return { key, data };
}

function bufferFor(name, params) {
    const key = keyOf(name, params);
    let buffer = state.buffers.get(key);
    if (buffer) return buffer;
    const rendered = dataFor(name, params);
    buffer = state.ctx.createBuffer(1, rendered.data.length, RENDER_RATE);
    buffer.getChannelData(0).set(rendered.data);
    state.buffers.set(key, buffer);
    // The samples now live in the AudioBuffer; there is no reason to hold them twice.
    state.data.delete(key);
    return buffer;
}

// Render ahead of need, a few sounds per slice, so that the first tap on a new toy does not stall
// while its sounds are synthesised. Safe to call before the context exists: rendering does not
// need one.
export function prepare(list) {
    for (const item of list) {
        const key = keyOf(item[0], item[1] || {});
        if (!state.buffers.has(key) && !state.data.has(key)) state.queue.push(item);
    }
    if (!state.queueTimer && state.queue.length) state.queueTimer = setTimeout(drain, 16);
}

function drain() {
    state.queueTimer = 0;
    const started = Date.now();
    while (state.queue.length && Date.now() - started < 10) {
        const item = state.queue.shift();
        const params = item[1] || {};
        if (state.ctx) bufferFor(item[0], params);
        else dataFor(item[0], params);
    }
    if (state.queue.length) state.queueTimer = setTimeout(drain, 16);
}

function nearestBus(pan) {
    let best = 0;
    for (let i = 1; i < PANS.length; i++) {
        if (Math.abs(PANS[i] - pan) < Math.abs(PANS[best] - pan)) best = i;
    }
    return state.buses[best];
}

function nearestSend(wet) {
    if (wet < 0.07) return null;
    let best = 0;
    for (let i = 1; i < SEND_LEVELS.length; i++) {
        if (Math.abs(SEND_LEVELS[i] - wet) < Math.abs(SEND_LEVELS[best] - wet)) best = i;
    }
    return state.sends[best];
}

// Play a rendered sound. `opts`: gain (relative to the mix, 1 by default), pan (-1..1), wet
// (reverb, 0..1), rate (playback rate, for unpitched variation), delay (seconds).
export function play(name, params = {}, opts = {}) {
    if (!ready()) return;
    const ctx = state.ctx;
    const buffer = bufferFor(name, params);

    if (state.voices.length >= MAX_VOICES) {
        const oldest = state.voices.shift();
        try {
            oldest.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01);
            oldest.source.stop(ctx.currentTime + 0.06);
        } catch (error) {
            /* already finished */
        }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    if (opts.rate) source.playbackRate.value = opts.rate;
    const gain = ctx.createGain();
    gain.gain.value = (MIX[name] === undefined ? 1 : MIX[name]) * (opts.gain === undefined ? 1 : opts.gain);
    source.connect(gain);
    gain.connect(nearestBus(opts.pan || 0));
    const send = nearestSend(opts.wet === undefined ? 0.15 : opts.wet);
    if (send) gain.connect(send);

    const voice = { source, gain };
    state.voices.push(voice);
    source.onended = () => {
        gain.disconnect();
        const index = state.voices.indexOf(voice);
        if (index >= 0) state.voices.splice(index, 1);
    };
    source.start(ctx.currentTime + (opts.delay || 0));
}

// A pitched sound on the shared pentatonic scale.
export function note(name, degree, base, opts) {
    play(name, { f: noteHz(degree, base) }, opts);
}

//==============================================================================
// Continuous textures

// A parameter steered by a constant signal through a low-pass, rather than by automation events
// (see the header). The parameter's own value is zeroed, so what it receives is exactly the
// smoothed control.
//
// Each control owns its constant source. Sharing one would be cheaper, but Safari 12's
// disconnect() takes only an output index: handed a node, it converts it to 0 and cuts every
// connection, which would silence every other control at once.
class Control {
    constructor(ctx, param, initial, smoothing) {
        param.value = 0;
        this.source = ctx.createBufferSource();
        this.source.buffer = state.ones;
        this.source.loop = true;
        this.level = ctx.createGain();
        this.level.gain.value = initial;
        this.smooth = ctx.createBiquadFilter();
        this.smooth.type = 'lowpass';
        this.smooth.frequency.value = smoothing;
        this.smooth.Q.value = 0.5;
        this.source.connect(this.level);
        this.level.connect(this.smooth);
        this.smooth.connect(param);
        this.source.start(0);
        this.value = initial;
    }

    set(value) {
        if (Math.abs(value - this.value) < 1e-4) return;
        this.value = value;
        this.level.gain.value = value;
    }

    dispose() {
        try {
            this.source.stop(0);
        } catch (error) {
            /* already stopped */
        }
        this.source.disconnect();
        this.level.disconnect();
        this.smooth.disconnect();
    }
}

function loopBuffer(kind) {
    let buffer = state.loops.get(kind);
    if (buffer) return buffer;
    const ctx = state.ctx;
    const data =
        kind === 'pink'
            ? pinkNoise(ctx.sampleRate)
            : kind === 'sand'
              ? sandNoise(ctx.sampleRate)
              : whiteNoise(ctx.sampleRate);
    buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.getChannelData(0).set(data);
    state.loops.set(kind, buffer);
    return buffer;
}

// The recipes for each texture: what source, through which filters, at what full-scale level.
const TEXTURES = {
    // A soft round brush on cold-press paper.
    brush: {
        source: 'white',
        filters: [
            ['bandpass', 1300, 0.6],
            ['lowpass', 3000, 0.7],
        ],
        level: 0.3,
        wet: 0.14,
    },
    // Fingertip on fine sandpaper.
    sand: { source: 'sand', filters: [['bandpass', 3400, 0.8]], level: 0.55, wet: 0.14 },
    // A hand trailing through water.
    water: { source: 'pink', filters: [['lowpass', 900, 0.7]], level: 0.5, wet: 0.3 },
    // The pond itself, barely there.
    lapping: { source: 'pink', filters: [['lowpass', 420, 0.7]], level: 0.16, wet: 0.3 },
    // Liquid falling into a vessel. `pitch` steers the band-pass, which is the air column above
    // the liquid ringing: it rises as the vessel fills, the way a filling bottle's note does.
    pour: { source: 'white', filters: [['lowpass', 1600, 0.7]], resonant: true, level: 0.32, wet: 0.2 },
};

export class Texture {
    constructor(kind) {
        this.kind = kind;
        this.nodes = null;
        state.textures.add(this);
    }

    build() {
        const ctx = state.ctx;
        const spec = TEXTURES[this.kind];
        const out = ctx.createGain();
        out.gain.value = spec.level;
        out.connect(nearestBus(0));
        const send = nearestSend(spec.wet);
        if (send) out.connect(send);

        const amp = ctx.createGain();
        const level = new Control(ctx, amp.gain, 0, 30);
        amp.connect(out);

        const source = ctx.createBufferSource();
        source.buffer = loopBuffer(spec.source);
        source.loop = true;

        let node = source;
        const filters = spec.filters.map((f) => {
            const filter = ctx.createBiquadFilter();
            filter.type = f[0];
            filter.frequency.value = f[1];
            filter.Q.value = f[2];
            node.connect(filter);
            node = filter;
            return filter;
        });
        node.connect(amp);

        let pitch = null;
        if (spec.resonant) {
            const band = ctx.createBiquadFilter();
            band.type = 'bandpass';
            band.Q.value = 7;
            pitch = new Control(ctx, band.frequency, 600, 12);
            const ring = ctx.createGain();
            ring.gain.value = 2.2;
            source.connect(band);
            band.connect(ring);
            ring.connect(amp);
            filters.push(band, ring);
        }

        source.start(0, Math.random() * source.buffer.duration * 0.9);
        this.nodes = { source, filters, amp, out, level, pitch };
    }

    // Level 0..1, and for resonant textures a pitch in Hz.
    set(level, pitch) {
        if (!ready()) return;
        if (!this.nodes) {
            if (level <= 0.001) return;
            this.build();
        }
        this.nodes.level.set(clamp(level, 0, 1));
        if (this.nodes.pitch && pitch) this.nodes.pitch.set(pitch);
    }

    silence() {
        if (this.nodes) this.nodes.level.set(0);
    }

    stop() {
        state.textures.delete(this);
        const nodes = this.nodes;
        this.nodes = null;
        if (!nodes) return;
        nodes.level.set(0);
        setTimeout(() => {
            try {
                nodes.source.stop(0);
            } catch (error) {
                /* never started */
            }
            nodes.source.disconnect();
            for (const filter of nodes.filters) filter.disconnect();
            nodes.level.dispose();
            if (nodes.pitch) nodes.pitch.dispose();
            nodes.amp.disconnect();
            nodes.out.disconnect();
        }, 250);
    }
}

// A slide whistle: a sine with a little vibrato and a quiet octave, whose pitch follows a control.
export class Whistle {
    constructor() {
        this.nodes = null;
        state.textures.add(this);
    }

    build() {
        const ctx = state.ctx;
        const out = ctx.createGain();
        out.gain.value = 0.16;
        out.connect(nearestBus(0));
        out.connect(state.sends[1]);
        const amp = ctx.createGain();
        const level = new Control(ctx, amp.gain, 0, 25);
        amp.connect(out);

        const tone = ctx.createOscillator();
        tone.type = 'sine';
        const octave = ctx.createOscillator();
        octave.type = 'triangle';
        const octaveGain = ctx.createGain();
        octaveGain.gain.value = 0.12;
        const pitch = new Control(ctx, tone.frequency, 500, 9);
        const pitch2 = new Control(ctx, octave.frequency, 1000, 9);

        const vibrato = ctx.createOscillator();
        vibrato.frequency.value = 5.2;
        const depth = ctx.createGain();
        depth.gain.value = 7;
        vibrato.connect(depth);
        depth.connect(tone.frequency);

        tone.connect(amp);
        octave.connect(octaveGain);
        octaveGain.connect(amp);
        tone.start(0);
        octave.start(0);
        vibrato.start(0);
        this.nodes = { out, amp, level, tone, octave, octaveGain, pitch, pitch2, vibrato, depth };
    }

    set(level, frequency) {
        if (!ready()) return;
        if (!this.nodes) {
            if (level <= 0.001) return;
            this.build();
        }
        this.nodes.level.set(clamp(level, 0, 1));
        this.nodes.pitch.set(frequency);
        this.nodes.pitch2.set(frequency * 2);
    }

    silence() {
        if (this.nodes) this.nodes.level.set(0);
    }

    stop() {
        state.textures.delete(this);
        const nodes = this.nodes;
        this.nodes = null;
        if (!nodes) return;
        nodes.level.set(0);
        setTimeout(() => {
            for (const osc of [nodes.tone, nodes.octave, nodes.vibrato]) {
                try {
                    osc.stop(0);
                } catch (error) {
                    /* already stopped */
                }
                osc.disconnect();
            }
            nodes.level.dispose();
            nodes.pitch.dispose();
            nodes.pitch2.dispose();
            nodes.depth.disconnect();
            nodes.octaveGain.disconnect();
            nodes.amp.disconnect();
            nodes.out.disconnect();
        }, 250);
    }
}

//==============================================================================
// For the tests

// The loudest sample currently passing the analyser, which sits after the compressor: what the
// test measures is what the speaker gets.
export function peak() {
    const analyser = state.analyser;
    if (!analyser) return 0;
    let max = 0;
    // Float time-domain data only arrived in Safari 14.1; bytes are enough to see sound.
    if (analyser.getFloatTimeDomainData) {
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
    } else {
        const data = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(data);
        for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i] - 128) / 128);
    }
    return max;
}

export function stats() {
    return {
        state: state.ctx ? state.ctx.state : 'none',
        sampleRate: state.ctx ? state.ctx.sampleRate : 0,
        voices: state.voices.length,
        buffers: state.buffers.size,
        textures: state.textures.size,
        silentElement: !!state.silent,
    };
}
