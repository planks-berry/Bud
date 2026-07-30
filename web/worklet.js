// The audio thread.
//
// The engine runs inside an AudioWorklet rather than on the main thread, which is what makes this
// a playable instrument instead of a player: the browser calls `process` on a dedicated real-time
// thread, so the sequencer keeps its timing while the page is laying out, garbage collecting or
// responding to a drag.
//
// The engine is block-size invariant, so the worklet's fixed 128-frame quantum is simply one more
// buffer size it does not care about — the same property that lets the plugin accept whatever a
// host asks for.

import createBud from './bud.js';

class BudProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        this.ready = false;
        this.pendingParameters = [];

        this.port.onmessage = (event) => this.handle(event.data);

        createBud().then((module) => {
            this.module = module;

            this.api = {
                init: module.cwrap('bud_init', null, ['number', 'number']),
                loadDemo: module.cwrap('bud_load_demo', null, []),
                start: module.cwrap('bud_start', null, []),
                stop: module.cwrap('bud_stop', null, []),
                render: module.cwrap('bud_render', 'number', ['number']),
                renderRight: module.cwrap('bud_render_right', 'number', []),
                get: module.cwrap('bud_get', 'number', ['number', 'number']),
                set: module.cwrap('bud_set', null, ['number', 'number', 'number']),
                format: module.cwrap('bud_format', 'string', ['number', 'number']),
                parametersJson: module.cwrap('bud_parameters_json', 'string', []),
                tracksJson: module.cwrap('bud_tracks_json', 'string', []),
                knobKindsJson: module.cwrap('bud_knob_kinds_json', 'string', []),
                stepGate: module.cwrap('bud_step_gate', 'number', ['number', 'number']),
                stepAccent: module.cwrap('bud_step_accent', 'number', ['number', 'number']),
                stepToggle: module.cwrap('bud_step_toggle', null, ['number', 'number']),
                stepCycleAccent: module.cwrap('bud_step_cycle_accent', null, ['number', 'number']),
                playhead: module.cwrap('bud_playhead', 'number', ['number']),
                clearPattern: module.cwrap('bud_clear_pattern', null, []),
                setSolo: module.cwrap('bud_set_solo', null, ['number']),
            };

            // `sampleRate` is a global in AudioWorkletGlobalScope. The engine generates its
            // factory content at whatever rate the browser chose, so nothing is resampled.
            this.api.init(sampleRate, 2048);
            this.api.loadDemo();

            this.ready = true;

            // Anything the interface asked for while the module was still loading.
            for (const message of this.pendingParameters) this.handle(message);
            this.pendingParameters.length = 0;

            this.port.postMessage({
                type: 'ready',
                sampleRate,
                parameters: this.api.parametersJson(),
                tracks: this.api.tracksJson(),
                knobKinds: this.api.knobKindsJson(),
                state: this.snapshot(),
            });
        });
    }

    /// Everything the interface needs to draw itself, gathered in one crossing of the boundary.
    snapshot() {
        const gates = [];
        const accents = [];
        const tracks = this.api ? 11 : 0;

        for (let track = 0; track < tracks; track++) {
            const row = [];
            const accentRow = [];

            for (let step = 0; step < 16; step++) {
                row.push(this.api.stepGate(track, step));
                accentRow.push(this.api.stepAccent(track, step));
            }

            gates.push(row);
            accents.push(accentRow);
        }

        return { gates, accents };
    }

    handle(message) {
        if (!this.ready) {
            this.pendingParameters.push(message);
            return;
        }

        switch (message.type) {
            case 'set':
                this.api.set(message.kind, message.track, message.value);
                break;

            case 'transport':
                if (message.playing) this.api.start();
                else this.api.stop();
                break;

            case 'toggleStep':
                this.api.stepToggle(message.track, message.step);
                this.port.postMessage({ type: 'state', state: this.snapshot() });
                break;

            case 'cycleAccent':
                this.api.stepCycleAccent(message.track, message.step);
                this.port.postMessage({ type: 'state', state: this.snapshot() });
                break;

            case 'clear':
                this.api.clearPattern();
                this.port.postMessage({ type: 'state', state: this.snapshot() });
                break;

            case 'loadDemo':
                this.api.loadDemo();
                this.port.postMessage({ type: 'state', state: this.snapshot() });
                break;

            case 'solo':
                this.api.setSolo(message.track);
                break;

            case 'query': {
                const values = {};
                for (const { kind, track } of message.wanted)
                    values[`${kind}:${track}`] = this.api.get(kind, track);
                this.port.postMessage({ type: 'values', values });
                break;
            }
        }
    }

    // The signature is (inputs, outputs, parameters) — this node has no inputs, so the first
    // argument is always an empty array and it is the second that has to be filled.
    process(inputs, outputs) {
        const output = outputs[0];

        if (!this.ready || output.length === 0) return true;

        const frames = output[0].length;
        const leftPtr = this.api.render(frames);
        const rightPtr = this.api.renderRight();

        const heap = this.module.HEAPF32;
        const left = heap.subarray(leftPtr >> 2, (leftPtr >> 2) + frames);
        const right = heap.subarray(rightPtr >> 2, (rightPtr >> 2) + frames);

        output[0].set(left);
        if (output.length > 1) output[1].set(right);

        // The playhead is read here rather than on a timer, so the lights follow the audio
        // rather than the clock the page happens to be running on.
        if ((this.tick = (this.tick || 0) + 1) % 8 === 0) {
            const heads = [];
            for (let track = 0; track < 11; track++) heads.push(this.api.playhead(track));
            this.port.postMessage({ type: 'playhead', heads });
        }

        return true;
    }
}

registerProcessor('bud-processor', BudProcessor);
