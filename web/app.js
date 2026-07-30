// The interface.
//
// Almost nothing here knows what a parameter *is*. The worklet sends the engine's own parameter
// table across on startup and the controls are generated from it, so a parameter added in C++
// appears here without this file changing. The exceptions are the handful of things that are
// genuinely presentation: which parameters sit in the header, and how a value is drawn.

const NUM_TRACKS = 11;
const NUM_STEPS = 16;

// Parameters that belong on the top panel rather than in the per-track editor. Named by their
// stable string id, which is the thing the engine promises never to change.
const HEADER_PARAMS = ['tempo', 'swing', 'feel', 'master_vol'];
const ISOLATOR_PARAMS = ['iso_low', 'iso_mid', 'iso_high'];

const state = {
    node: null,
    context: null,
    parameters: [],
    byId: new Map(),
    byKind: new Map(),
    tracks: [],
    knobKinds: { knobs: [], sequencer: [], bass: [] },
    values: new Map(),          // "kind:track" -> value
    gates: [],
    accents: [],
    heads: new Array(NUM_TRACKS).fill(0),
    selectedTrack: 0,
    playing: false,
};

const $ = (id) => document.getElementById(id);
const key = (kind, track) => `${kind}:${track}`;

//==============================================================================
// Audio

async function ensureAudio() {
    if (state.node) return;

    const context = new AudioContext();
    state.context = context;

    await context.audioWorklet.addModule('worklet.js');

    const node = new AudioWorkletNode(context, 'bud-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
    });

    node.port.onmessage = (event) => onMessage(event.data);
    node.connect(context.destination);
    state.node = node;
}

function send(message) {
    if (state.node) state.node.port.postMessage(message);
}

function onMessage(message) {
    switch (message.type) {
        case 'ready':
            state.parameters = JSON.parse(message.parameters);
            state.tracks = JSON.parse(message.tracks);
            state.knobKinds = JSON.parse(message.knobKinds);

            for (const p of state.parameters) {
                state.byId.set(p.id, p);
                state.byKind.set(p.kind, p);
            }

            applyState(message.state);
            buildInterface();
            refreshValues();

            $('status').textContent =
                `Engine running at ${message.sampleRate} Hz — ${state.parameters.length} parameters, ` +
                `all generated from the engine's own table.`;
            break;

        case 'state':
            applyState(message.state);
            paintGrid();
            break;

        case 'values':
            for (const [k, v] of Object.entries(message.values)) state.values.set(k, v);
            paintControls();
            break;

        case 'playhead':
            state.heads = message.heads;
            paintPlayhead();
            break;
    }
}

function applyState(snapshot) {
    state.gates = snapshot.gates;
    state.accents = snapshot.accents;
}

/// Ask the engine for every value the interface currently shows.
function refreshValues() {
    const wanted = [];

    for (const id of [...HEADER_PARAMS, ...ISOLATOR_PARAMS]) {
        const p = state.byId.get(id);
        if (p) wanted.push({ kind: p.kind, track: -1 });
    }

    const editorKinds = [
        ...state.knobKinds.knobs,
        ...state.knobKinds.sequencer,
        ...state.knobKinds.bass,
    ];

    for (const kind of editorKinds) wanted.push({ kind, track: state.selectedTrack });

    // Track mute is drawn on every row, so every track's copy is needed.
    const mute = state.byId.get('track_mute') || state.byId.get('mute');
    if (mute) for (let t = 0; t < NUM_TRACKS; t++) wanted.push({ kind: mute.kind, track: t });

    send({ type: 'query', wanted });
}

//==============================================================================
// Building the interface from the parameter table

function buildInterface() {
    buildRuler();
    buildTracks();
    buildHeaderControls();
    buildEditor();
    paintGrid();
}

function buildRuler() {
    const ruler = $('ruler');
    ruler.innerHTML = '';

    for (let step = 0; step < NUM_STEPS; step++) {
        const cell = document.createElement('div');
        cell.className = 'ruler-cell' + (step % 4 === 0 ? ' downbeat' : '');
        cell.textContent = step + 1;
        ruler.appendChild(cell);
    }
}

function buildTracks() {
    const container = $('tracks');
    container.innerHTML = '';

    state.tracks.forEach((track, index) => {
        const row = document.createElement('div');
        row.className = 'track-row';
        row.dataset.track = index;

        const label = document.createElement('button');
        label.className = 'track-label';
        label.style.setProperty('--led', `rgb(${track.colour.join(',')})`);
        label.innerHTML = `<span class="led"></span><span class="tname">${track.short}</span>`;
        label.title = track.name;
        label.addEventListener('click', () => selectTrack(index));
        row.appendChild(label);

        const steps = document.createElement('div');
        steps.className = 'steps';

        for (let step = 0; step < NUM_STEPS; step++) {
            const cell = document.createElement('button');
            cell.className = 'step';
            cell.dataset.track = index;
            cell.dataset.step = step;

            // Two ways to reach accent, because there is no shift key on a tablet: shift-click
            // with a mouse, press and hold with a finger. Accent layers onto an existing note
            // rather than replacing it, which is what the device does.
            let holdTimer = null;
            let handled = false;

            const beginHold = () => {
                handled = false;
                holdTimer = setTimeout(() => {
                    handled = true;
                    holdTimer = null;
                    send({ type: 'cycleAccent', track: index, step });
                    if (navigator.vibrate) navigator.vibrate(8);
                }, 450);
            };

            const endHold = () => {
                if (holdTimer !== null) clearTimeout(holdTimer);
                holdTimer = null;
            };

            cell.addEventListener('pointerdown', beginHold);
            cell.addEventListener('pointercancel', endHold);
            cell.addEventListener('pointerleave', endHold);

            cell.addEventListener('pointerup', (event) => {
                endHold();
                selectTrack(index);

                if (handled) return;   // the hold already cycled the accent

                if (event.shiftKey) send({ type: 'cycleAccent', track: index, step });
                else send({ type: 'toggleStep', track: index, step });
            });

            // Holding a step must not raise the browser's own context menu or text selection.
            cell.addEventListener('contextmenu', (event) => event.preventDefault());

            steps.appendChild(cell);
        }

        row.appendChild(steps);
        container.appendChild(row);
    });
}

function buildHeaderControls() {
    fill($('globalMain'), HEADER_PARAMS);
    fill($('globalIso'), ISOLATOR_PARAMS);

    function fill(host, ids) {
        host.innerHTML = '';

        for (const id of ids) {
            const p = state.byId.get(id);
            if (p) host.appendChild(makeControl(p, -1, 'compact'));
        }
    }
}

function buildEditor() {
    const track = state.tracks[state.selectedTrack];
    $('editorTrack').textContent = `${track.short} — ${track.name}`;

    fill($('knobs'), state.knobKinds.knobs);
    fill($('seqKnobs'), state.knobKinds.sequencer);

    // The bass track has its own knob section, independent of SOUND (p. 72).
    const isBass = state.selectedTrack === NUM_TRACKS - 1;
    $('extraTitle').hidden = !isBass;
    fill($('extraKnobs'), isBass ? state.knobKinds.bass : []);

    function fill(host, kinds) {
        host.innerHTML = '';

        for (const kind of kinds) {
            const p = state.byKind.get(kind);
            if (p) host.appendChild(makeControl(p, state.selectedTrack));
        }
    }
}

/// One control, shaped by the parameter's own descriptor: enumerated parameters get a select,
/// two-value ones get a switch, everything else gets a slider.
function makeControl(p, track, variant = '') {
    const wrap = document.createElement('div');
    wrap.className = `control ${variant}`;
    wrap.dataset.kind = p.kind;
    wrap.dataset.track = track;

    const label = document.createElement('label');
    label.textContent = p.name;
    wrap.appendChild(label);

    let input;

    if (p.labels.length > 0 && p.labels.length === p.max - p.min + 1) {
        input = document.createElement('select');

        p.labels.forEach((text, i) => {
            const option = document.createElement('option');
            option.value = p.min + i;
            option.textContent = text;
            input.appendChild(option);
        });

        input.addEventListener('change', () => commit(p, track, Number(input.value)));
    } else {
        input = document.createElement('input');
        input.type = 'range';
        input.min = p.min;
        input.max = p.max;
        input.step = 1;

        input.addEventListener('input', () => commit(p, track, Number(input.value)));
    }

    input.className = 'input';
    wrap.appendChild(input);

    const readout = document.createElement('span');
    readout.className = 'value';
    wrap.appendChild(readout);

    return wrap;
}

function commit(p, track, value) {
    state.values.set(key(p.kind, track), value);
    send({ type: 'set', kind: p.kind, track, value });
    paintControls();

    $('display').textContent = `${p.name} ${value}`;
}

//==============================================================================
// Painting

function paintGrid() {
    for (let track = 0; track < NUM_TRACKS; track++) {
        for (let step = 0; step < NUM_STEPS; step++) {
            const cell = document.querySelector(`.step[data-track="${track}"][data-step="${step}"]`);
            if (!cell) continue;

            const on = state.gates[track] && state.gates[track][step];
            const accent = state.accents[track] ? state.accents[track][step] : 0;

            cell.classList.toggle('on', !!on);
            cell.classList.toggle('hard', on && accent === 1);
            cell.classList.toggle('soft', on && accent === 2);
            cell.style.setProperty('--led', `rgb(${state.tracks[track].colour.join(',')})`);
        }
    }
}

function paintPlayhead() {
    for (let track = 0; track < NUM_TRACKS; track++) {
        const head = state.heads[track];

        for (let step = 0; step < NUM_STEPS; step++) {
            const cell = document.querySelector(`.step[data-track="${track}"][data-step="${step}"]`);
            if (cell) cell.classList.toggle('playing', state.playing && step === head);
        }
    }
}

function paintControls() {
    document.querySelectorAll('.control').forEach((wrap) => {
        const kind = Number(wrap.dataset.kind);
        const track = Number(wrap.dataset.track);
        const p = state.byKind.get(kind);
        if (!p) return;

        const value = state.values.get(key(kind, track));
        if (value === undefined) return;

        const input = wrap.querySelector('.input');
        if (input.value !== String(value)) input.value = value;

        const readout = wrap.querySelector('.value');

        // Enumerated parameters already read as their label in the select.
        readout.textContent = p.labels.length > 0 && p.labels.length === p.max - p.min + 1
            ? ''
            : value;
    });
}

function selectTrack(index) {
    if (index === state.selectedTrack) return;

    state.selectedTrack = index;

    document.querySelectorAll('.track-row').forEach((row) => {
        row.classList.toggle('selected', Number(row.dataset.track) === index);
    });

    buildEditor();
    refreshValues();
}

//==============================================================================
// Transport

$('play').addEventListener('click', async () => {
    await ensureAudio();
    if (state.context.state === 'suspended') await state.context.resume();

    state.playing = true;
    $('play').setAttribute('aria-pressed', 'true');
    $('display').textContent = 'PLAYING';
    send({ type: 'transport', playing: true });
});

$('stop').addEventListener('click', () => {
    state.playing = false;
    $('play').setAttribute('aria-pressed', 'false');
    $('display').textContent = 'STOPPED';
    send({ type: 'transport', playing: false });
    paintPlayhead();
});

$('demo').addEventListener('click', async () => {
    await ensureAudio();
    send({ type: 'loadDemo' });
    refreshValues();
    $('display').textContent = 'DEMO';
});

$('clear').addEventListener('click', async () => {
    await ensureAudio();
    send({ type: 'clear' });
    $('display').textContent = 'CLEAR';
});

// Load the engine as soon as the page is up, so the interface can draw itself before the first
// click. Audio stays suspended until then, which is what browsers require.
ensureAudio().catch((error) => {
    $('status').textContent = `Could not start the engine: ${error.message}`;
});

// A handle on the live state, for debugging in the console and for the headless test in
// `web/test.mjs` to tap the audio graph. Deliberately the same object the interface uses, so
// what a test observes is what the page is actually doing.
window.bud = state;
