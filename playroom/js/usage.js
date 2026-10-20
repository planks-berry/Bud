// How long each toy is played, kept on the iPad for the grown-ups' corner.
//
// A guide decides what a child needs next from two signs: a child pushing at the edges of a
// material, and a child drifting away from it. The first is plain to see. The second builds over
// days and is easy to miss, so the panel shows each toy's minutes over the last seven days against
// the days before.
//
// Only time with a hand on the glass counts. Each touch adds the time since the one before, but
// never more than a minute, so a toy left open on the table does not look loved. Two weeks are
// kept, in localStorage; nothing leaves the iPad.

const KEY = 'playroom.usage.v1';
const KEEP_DAYS = 14;
const GAP_MS = 60 * 1000;
const SAVE_MS = 30 * 1000;

function dayKey(date) {
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

// Midnight `n` days before today, by the calendar, so a daylight-saving change cannot skip a day.
export function daysAgo(n) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
}

function load() {
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (stored && typeof stored.since === 'string' && stored.days && typeof stored.days === 'object')
            return stored;
    } catch (error) {
        /* unreadable: start a new record */
    }
    return { since: dayKey(new Date()), days: {} };
}

const record = load();
let open = null;
let saved = Date.now();

function add(id, ms) {
    if (!(ms > 0)) return;
    const key = dayKey(new Date());
    const day = record.days[key] || (record.days[key] = {});
    day[id] = (day[id] || 0) + ms;
}

function save() {
    const keep = {};
    for (let i = 0; i < KEEP_DAYS; i++) keep[dayKey(daysAgo(i))] = true;
    for (const key of Object.keys(record.days)) if (!keep[key]) delete record.days[key];
    saved = Date.now();
    try {
        localStorage.setItem(KEY, JSON.stringify(record));
    } catch (error) {
        /* private browsing or full: the record lasts for this session */
    }
}

// A toy is taken off the shelf.
export function begin(id) {
    end();
    open = { id, last: Date.now() };
}

// A touch while it is out.
export function touch() {
    if (!open) return;
    const now = Date.now();
    add(open.id, Math.min(now - open.last, GAP_MS));
    open.last = now;
    if (now - saved > SAVE_MS) save();
}

// It goes back on the shelf.
export function end() {
    if (!open) return;
    touch();
    open = null;
    save();
}

// The playroom goes into the background, or comes back: the time away is not play.
export function pause() {
    if (!open) return;
    touch();
    save();
}

export function resume() {
    if (open) open.last = Date.now();
}

// A toy's time over the last seven days, and over the days before those that the record covers
// (up to seven more). `covered` counts the days since the record began, today included.
export function recent(id) {
    const result = { week: 0, before: 0, covered: KEEP_DAYS };
    for (let i = 0; i < KEEP_DAYS; i++) {
        const key = dayKey(daysAgo(i));
        const day = record.days[key];
        const ms = (day && day[id]) || 0;
        if (i < 7) result.week += ms;
        else result.before += ms;
        if (key === record.since) {
            result.covered = i + 1;
            break;
        }
    }
    return result;
}
