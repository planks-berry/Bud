# Little Kitchen

A cooking game for toddlers, in `kitchen/`. Four dishes, one bowl, a spoon, a stove, and a
friend who eats whatever comes out. It is plain HTML, SVG and Web Audio — no framework, no build
step, no assets to download — and it is published alongside the web build, at
**https://planks-berry.github.io/Bud/kitchen/**.

---

## What it is for

The brief was a game in the spirit of Pok Pok and the better educational apps: simple graphics,
minimal stimulation, calming music and sound. Those words are easy to say and easy to lose while
building, so here is what each one meant in practice.

**Nothing is wrong.** Any ingredient goes in any dish. The recipe card at the top suggests
what to add and ticks things off as they go in, but a pizza with strawberries on it bakes just
the same and the mouse eats it just as happily. There is no failure state anywhere in the game,
and no sound that means "no".

**Nothing is timed, counted or scored.** The only clock is the one that cooks the soup, and it
runs only while the child has the knob on. There are no stars, no levels, no unlocks, no
streaks. A dish ends with a friend who is pleased, and two buttons: again, or home.

**Nothing flashes.** The palette is muted — cream, sage, dusty peach, a soft blue — with no pure
black or white. Motion is slow: a flame that leans, steam that drifts, a button that breathes.
Nothing on screen moves faster than a spoon following a finger, and the idle animations are
switched off entirely for anyone whose device asks for reduced motion.

**Nothing needs reading.** Every screen a toddler uses is pictures only. The words that exist —
dish names on the menu, the sheet for grown-ups — are there for the adult sitting alongside.

**A tap is as good as a drag.** A two-year-old's drag is usually a tap with ambitions. Tapping an
ingredient sends it into the bowl by itself; dragging puts it where the finger lets go; dropping
it somewhere silly returns it to the tray, quietly. Touch targets are large on a tablet and still
comfortable on a phone (the browser test measures them).

**The teaching is incidental.** Matching an ingredient to its picture on the card, counting three
olives, the order of things (add, then stir, then cook, then eat), and the one genuine discovery:
a broth takes the colour of what went into it, and a batter blends the flour, egg and milk away.

## The dishes

| Dish | Steps | Friend |
|---|---|---|
| Fruit salad | add, stir, serve | bunny |
| Vegetable soup | add, heat (with stirring), serve | bear |
| Pancakes | add, stir, heat in the pan (with flipping), serve | cat |
| Pizza | add, bake, serve | mouse |

A dish is data — a vessel, a tray of ingredients, a suggested recipe, and a list of steps — in
`DISHES` at the top of `game.js`. Adding one is a matter of adding an entry there and, if it needs
them, a few new ingredients in `art.js`. Every ingredient is a handful of flat shapes in a
100-unit box, so the same drawing serves on the tray, in the bowl, on the card and on the plate.

## The sound

There are no audio files. `audio.js` synthesises everything with the Web Audio API.

The music is generated, not looped. A slow drone cycles through four chords (C, A minor, F, G)
while a melody wanders one step at a time through a C major pentatonic scale — five notes with
no semitones between them, so any note can follow any other without a clash. Pulses are unevenly
spaced, with a longer breath every eighth, so it never settles into a beat, and about a quarter
of them are rests. A feedback delay gives the notes somewhere to hang. It sits at roughly a
sixth of full scale: background, not foreground.

The effects are short, soft and low. A plop when something lands, a swoosh for a stir, a click
for the knob, a sizzle under the pan, bubbles under the soup, a small rising figure when a step
is done, a munch and a hum from the friend. None of them is a fanfare.

Both can be switched off, separately, on the sheet for grown-ups — press and hold the small mark
under the home button for a second. The choice is remembered on the device. The music also
stops when the tab goes into the background, since a toddler's game should never be heard from
behind something else.

## On a tablet

Serve it over HTTPS (or from `localhost`) and it installs: **Add to Home Screen** on an iPad or an
Android tablet gives a full-screen game with no browser chrome to tap by accident, and the
service worker keeps a copy so it plays without a connection afterwards. Pinch-zoom is disabled
by the page. For a toddler on their own, the operating system's kiosk mode — Guided Access on
iPadOS, screen pinning on Android — is the last piece.

## Running and testing it

```bash
cd kitchen && python3 -m http.server        # any static server
```

Then open `http://localhost:8000`. A `file://` URL works for everything but the service worker.

```bash
cd kitchen
npm install --no-audit --no-fund playwright
npx playwright install --with-deps chromium
node test.mjs                               # the game, in a real browser
node test.mjs --csp                         # under a strict Content-Security-Policy
```

The test plays every dish through — taps, drags, a stir with the mouse held down, the stove,
the oven, the friend eating — and measures what only a browser can: that the music actually
sounds and stops when asked, that nothing scrolls sideways, and that the tray items are at least
80px across on a tablet and 44px on a phone. The CSP run is the proof that the game is
self-contained: nothing inline, nothing off-origin, nothing fetched. CI runs both on every push.

`icons.mjs` renders `icon.svg` to the PNG sizes a home screen wants; it is run by hand and the
results are committed.
