// The grown-up's settings, kept in localStorage.
//
// Every read and write is wrapped: Safari throws on setItem in private browsing, and an iPad that
// refuses to remember the stage should still open the playroom.

const KEY = 'playroom.settings.v1';

export const STAGES = ['seed', 'sprout', 'bloom'];

const DEFAULTS = {
    stage: 'sprout',
    hidden: [],
    throughSilent: true,
    volume: 0.85,
};

function load() {
    const settings = JSON.parse(JSON.stringify(DEFAULTS));
    try {
        const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (stored && typeof stored === 'object') {
            if (STAGES.indexOf(stored.stage) >= 0) settings.stage = stored.stage;
            if (Array.isArray(stored.hidden))
                settings.hidden = stored.hidden.filter((id) => typeof id === 'string');
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

// 0 for seed, 1 for sprout, 2 for bloom: how much each toy puts out.
export function level() {
    return Math.max(0, STAGES.indexOf(settings.stage));
}
