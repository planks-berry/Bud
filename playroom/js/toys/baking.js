// The Bakery's rules: what the bowl makes, how much stirring and kneading it wants, how a bun rises and
// browns in the oven, the oven's ticking song, the friend's birthday tune, and who comes for a piece.
// No drawing and no sound here, so the rules can be checked in Node.
//
// Flour and water make bread dough: stirred round, it comes together into a ball; pressed a few
// times, it turns smooth; and it can be baked as it is, a bun, or from Sprout rolled out long, cut
// into a shape, and sprinkled. At Bloom, the recipe on the wall makes a cake: flour with eggs and
// sugar, stirred into a batter that pours itself into a tin. A cake with eggs in it rises; one with
// none comes out flat, and is eaten just as happily.

// What each stage brings: how long the oven takes, how many it holds, and what there is to do.
export const STAGES = [
    {
        bake: 20,
        oven: 1,
        shapes: false,
        toppings: false,
        cake: false,
        animals: ['cow', 'sheep', 'pig'],
        presses: 4,
        turns: 2,
    },
    {
        bake: 25,
        oven: 2,
        shapes: true,
        toppings: true,
        cake: false,
        animals: ['cow', 'sheep', 'pig', 'duck'],
        presses: 5,
        turns: 3,
    },
    {
        bake: 30,
        oven: 2,
        shapes: true,
        toppings: true,
        cake: true,
        animals: ['cow', 'sheep', 'pig', 'duck'],
        presses: 5,
        turns: 3,
    },
];

// What goes into the bowl, in the order the shelf holds them: eggs and sugar only for a cake.
export const INGREDIENTS = ['flour', 'water', 'egg', 'sugar'];
export function pantry(level) {
    return STAGES[level].cake ? INGREDIENTS : INGREDIENTS.slice(0, 2);
}

// How fast a jar held over the bowl fills it, in bowlfuls a second: slow enough to watch it pour. An
// egg goes in whole.
export const POUR = 1;

// What is in the bowl, once there is enough to stir: 'dough' from flour and water, 'batter' from
// flour with eggs or sugar, otherwise nothing yet.
export function mixOf(bowl) {
    if (!(bowl.flour >= 1)) return null;
    if (bowl.egg >= 1 || bowl.sugar >= 1) return 'batter';
    if (bowl.water >= 1) return 'dough';
    return null;
}

// Stirring is counted in turns of the spoon round the bowl, either way round; a move that jumps across
// the bowl counts for no more than a short stroke, so scribbling stirs, but slowly.
export const STROKE = 0.6;
export function stirred(from, to) {
    let d = to - from;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return Math.min(Math.abs(d), STROKE);
}

// How much stirring the bowl wants before it comes together, in radians.
export function stirNeeded(level) {
    return STAGES[level].turns * 2 * Math.PI;
}

// The shapes a dough can be baked in: as it is, rolled out long, or cut out with a cutter; and what
// can go on top.
export const SHAPES = ['bun', 'roll', 'star', 'heart', 'flower'];
export const CUTTERS = ['star', 'heart', 'flower'];
export const TOPPINGS = ['seeds', 'sprinkles', 'berries'];
// How far, back and forth, a rolling pin of a hand has to go over the dough to roll it out, in dough
// widths; and the most toppings a thing will hold.
export const ROLL = 3;
export const MOST_TOPPINGS = 12;

// How a thing in the oven looks, `t` seconds into `total`: how far it has risen and how brown it is,
// each 0 to 1. It rises first and browns after, so there is always something happening to watch. A
// cake with no eggs in it hardly rises.
export function baking(t, total, flat = false) {
    const x = Math.max(0, Math.min(1, t / total));
    const up = Math.min(1, x / 0.7);
    const rise = (1 - (1 - up) * (1 - up) * (1 - up)) * (flat ? 0.15 : 1);
    const b = Math.max(0, Math.min(1, (x - 0.25) / 0.75));
    const brown = b * b * (3 - 2 * b);
    return { rise, brown, done: t >= total };
}

// The oven's ticking song: a clock's tick a beat, and a music box's note on every other beat, round
// and round until the bell. Degrees of the playroom's scale.
export const TICK = 0.5;
export const OVEN_SONG = [2, 4, 3, 1, 2, 0, 1, 0];

// Stirring plays a tune as it goes, a note each quarter turn: up the scale and down again.
export const STIR_TUNE = [0, 1, 2, 3, 4, 3, 2, 1];

// The friend's birthday tune, its own: [degree, beats]. Played on the music box, a beat a TUNE_BEAT.
export const TUNE_BEAT = 0.42;
export const BIRTHDAY = [
    [0, 0.5],
    [2, 0.5],
    [3, 0.5],
    [5, 1.5],
    [4, 0.5],
    [3, 0.5],
    [2, 0.5],
    [3, 1.5],
    [0, 0.5],
    [2, 0.5],
    [3, 0.5],
    [5, 1],
    [6, 0.5],
    [5, 2],
];

// When each note of a [degree, beats] tune falls, in beats from its start, and how long it is.
export function timings(tune) {
    let at = 0;
    return tune.map(([degree, beats]) => {
        const note = { degree, at, beats };
        at += beats;
        return note;
    });
}

// A thing out of the oven is shared among whoever has come for a piece: one each, and one for the
// friend at its birthday.
export function piecesFor(animals, birthday) {
    return animals.length + (birthday ? 1 : 0);
}

// The most candles a birthday cake will take.
export const CANDLES = 5;
