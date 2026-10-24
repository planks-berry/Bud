// The grown-up's settings, kept in localStorage.
//
// Every read and write is wrapped: Safari throws on setItem in private browsing, and an iPad that
// refuses to remember the stage should still open the playroom.

const KEY = 'playroom.settings.v1';

export const STAGES = ['seed', 'sprout', 'bloom'];

// The new things a grown-up can turn on or off, each with its own switch in the corner. Each is on
// until it is turned off.
export const EXTRAS = ['hello', 'goodnight', 'shyFish'];

const DEFAULTS = {
    // Every toy's stage, unless it has one of its own in `stages`.
    stage: 'sprout',
    stages: {},
    hidden: [],
    // The shelf's order, toy ids from the first tray to the last, once a grown-up has moved one.
    // Empty: the playroom's own order. A toy that is not in it (one added since) goes at the end.
    order: [],
    extras: { hello: true, goodnight: true, shyFish: true },
    // At goodnight: 'themselves', the toys fall asleep one by one on their own; 'child', each stays
    // awake until it is tapped.
    tuck: 'themselves',
    // The goodnight timer while it runs, as times in ms: when it was set, and when it ends.
    timer: null,
    // The passcode that locks the timer, kept only as a hash; '' until one is chosen.
    passcode: '',
    throughSilent: true,
    volume: 0.85,
};

function load() {
    const settings = JSON.parse(JSON.stringify(DEFAULTS));
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (stored && typeof stored === 'object') {
            if (STAGES.indexOf(stored.stage) >= 0) settings.stage = stored.stage;
            if (stored.stages && typeof stored.stages === 'object') {
                for (const id of Object.keys(stored.stages)) {
                    if (STAGES.indexOf(stored.stages[id]) >= 0) settings.stages[id] = stored.stages[id];
                }
            }
            if (Array.isArray(stored.hidden))
                settings.hidden = stored.hidden.filter((id) => typeof id === 'string');
            if (Array.isArray(stored.order))
                settings.order = stored.order.filter((id) => typeof id === 'string');
            if (stored.extras && typeof stored.extras === 'object') {
                for (const name of EXTRAS) {
                    if (typeof stored.extras[name] === 'boolean') settings.extras[name] = stored.extras[name];
                }
            }
            if (stored.tuck === 'themselves' || stored.tuck === 'child') settings.tuck = stored.tuck;
            const timer = stored.timer;
            if (
                timer &&
                typeof timer.from === 'number' &&
                typeof timer.ends === 'number' &&
                timer.ends > timer.from
            )
                settings.timer = { from: timer.from, ends: timer.ends };
            if (typeof stored.passcode === 'string') settings.passcode = stored.passcode;
            if (typeof stored.throughSilent === 'boolean') settings.throughSilent = stored.throughSilent;
            if (typeof stored.volume === 'number' && stored.volume >= 0 && stored.volume <= 1)
                settings.volume = stored.volume;
        }
    } catch (error) {
        /* unreadable: start from the defaults */
    }
    return settings;
}

export const settings = load();

export function save() {
    try {
        localStorage.setItem(KEY, JSON.stringify(settings));
    } catch (error) {
        /* private browsing or full: the setting lasts for this session */
    }
}

export function stageOf(id) {
    return settings.stages[id] || settings.stage;
}

// One toy moved on (or back) by itself. A toy set to the shared stage simply follows it again.
export function setStage(id, stage) {
    if (stage === settings.stage) delete settings.stages[id];
    else settings.stages[id] = stage;
    save();
}

// Every toy at once.
export function setAllStages(stage) {
    settings.stage = stage;
    settings.stages = {};
    save();
}

// The toys in the shelf's order: the grown-up's, with any toy it does not name at the end, in the
// playroom's own order.
export function ordered(toys) {
    const byId = new Map(toys.map((toy) => [toy.id, toy]));
    const out = [];
    for (const id of settings.order) {
        const toy = byId.get(id);
        if (toy && out.indexOf(toy) < 0) out.push(toy);
    }
    for (const toy of toys) if (out.indexOf(toy) < 0) out.push(toy);
    return out;
}

// Move a toy one place earlier (-1) or later (+1) on the shelf.
export function move(toys, id, step) {
    const ids = ordered(toys).map((toy) => toy.id);
    const from = ids.indexOf(id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    settings.order = ids;
    save();
}

// Back to the playroom's own order.
export function resetOrder() {
    settings.order = [];
    save();
}

export function setExtra(name, on) {
    settings.extras[name] = on;
    save();
}

export function setTuck(how) {
    settings.tuck = how;
    save();
}

export function setTimer(timer) {
    settings.timer = timer;
    save();
}

// The passcode is kept as a hash so that it is not lying in the iPad's storage to be read. It keeps
// a curious child away from the timer; it is not a safe. FNV-1a, 32 bits.
function hashCode(code) {
    const text = `playroom:${code}`;
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16);
}

export function hasPasscode() {
    return !!settings.passcode;
}

export function checkPasscode(code) {
    return !!settings.passcode && settings.passcode === hashCode(code);
}

// A new passcode, or '' to remove it.
export function setPasscode(code) {
    settings.passcode = code ? hashCode(code) : '';
    save();
}

// 0 for seed, 1 for sprout, 2 for bloom: how much a toy puts out.
export function level(id) {
    return Math.max(0, STAGES.indexOf(stageOf(id)));
}
