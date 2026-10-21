# The playroom

A shelf of quiet, open-ended toys for a child of about three, in the spirit of a Montessori room
and of Pok Pok: no words to read, no goals, no scores, no rewards, nothing that can be done wrong,
and toys that keep giving more the longer a child stays with them.

It is a web page with no build step and no dependencies, written for an **iPad Air 1 or iPad mini
2/3 on iOS 12.5**, and it works offline once it has been opened. It lives in
[`playroom/`](../playroom), entirely separate from the groovebox, and is published next to it at
**https://planks-berry.github.io/Bud/playroom/** whenever `main` deploys.

---

## Putting it on the iPad

1. Open the address above in **Safari** (it has to be Safari: only Safari can add a web app to
   the Home Screen on iOS 12).
2. Tap **Share → Add to Home Screen**. The bud icon then opens the playroom full screen, without
   Safari's bars, and from the second launch on it needs no connection at all.
3. Optional, and worth it for a three-year-old:
   - **Guided Access** (Settings → General → Accessibility → Guided Access), then triple-click the
     Home button inside the playroom. The iPad stays in it until a grown-up triple-clicks again.
   - Turn off **Gestures** (Settings → General → Multitasking & Dock), so a whole hand on the glass
     cannot pinch its way out to the Home Screen.

**Sound and the side switch.** iOS silences Web Audio when the iPad is set to silent, which looks
exactly like a broken toy. By default the playroom asks for the playback audio session instead, so
the volume buttons still work but the silent switch does not mute it. This is a setting in the
grown-ups' corner.

## The grown-ups' corner

On the shelf, **press and hold the leaf in the top-right corner for three seconds**. A child taps;
an adult can hold still. The panel has words in it, because it is for someone who reads:

- **Stage: Seed, Sprout or Bloom.** How much a toy puts out. Nothing is locked; moving a stage on
  simply puts more out, the way a guide adds to a shelf. The three cards set every toy at once
  (Sprout is the default). Each toy can then be moved on, or back, by itself, and its row says what
  each of its stages puts out. A guide moves one material on when a child starts pushing at what
  it can do, not the whole shelf at once. The sandpaper letters and numerals have no stages.
- **The toys.** Which are out, and each one's stage. Fewer choices help a young child settle into
  one; the Montessori habit is to put a few out and rotate them every week or two.
- **Sound.** Whether to play through the silent switch, and an overall volume.

Settings live in the iPad's local storage for this site and survive restarts. Nothing records what
the child does: no reports, no history, nothing sent anywhere.

---

## The shelf

Twelve toys in three rows, ordered as a Montessori shelf is: simple to complex, left to right, top
to bottom. The first toys ask for nothing but a touch; then a steadier hand, and then symbols. The
bottom row is the builders': the dig, where a finger is a digger's bucket; the crane, which does
the same work at a distance, through a hook; and the farm and the building site, worlds to build
rather than materials, which hold a little of everything before them.

Each toy also has its own section, written to be revised, in [PLAYROOM-GAMES.md](PLAYROOM-GAMES.md).

Every toy has three layers, which are found by playing, never unlocked:

- **touch**: something happens at the first contact, always;
- **move**: dragging, carrying, turning, combining;
- **make**: structure that rewards staying a while: a tune, a tower, a mixed colour, a shape.

| Toy | Montessori area | touch | move | make | What the stage changes |
|---|---|---|---|---|---|
| **Pond** | Nature, care of animals | Tap the water: a ripple and a water drop, pitched left-low to right-high | Push lily pads; open and close a lotus | Hold a finger still and the fish come to nibble; scatter food from the pot and they gather to eat | 3 / 4 / 5 fish, 2 / 3 / 4 pads |
| **Busy board** | Practical life (dressing frames, bolt boards) | Lamp switch; a little door with a different picture behind it each time | A colour dial that clicks up the scale; a sun on a slider with a slide whistle; a zip | Crank a music box (Twinkle, Twinkle) at any speed; at Bloom the door has a bolt to slide first | 4 controls at Seed, 6 after; bolt at Bloom |
| **Tone bars** | Music, auditory sense | Tap a bar; sweep for a glissando; chords with several fingers | Choose a wooden or a metal mallet | The shell plays back the last phrase; at Bloom, hold a bar to lift it and move it | 5 / 8 / 10 bars |
| **Colour tower** | Sensorial: dimension and colour; music | Tap any cube: its whole row plays, column by column from the left, bottom to top, each cube glowing in its colour as it sounds | Carry, stack, line up (a cube set down just short of another slides against it), pull one from the middle, throw one at a tower | Each colour has its own note, the one it has as paint on the easel, so a pattern built in colour plays as a tune; a new set of colours and sizes each time it comes out | 2 colours of 3 cubes / 3 of 3 / 5 of 2, the smallest down to Montessori's 1 : 10 |
| **Pouring** | Practical life | Tap a glass: it rings lower the fuller it is | Carry a pitcher over a glass and it tilts and pours | Colours mix as paint does; glasses overflow onto the tray and the sponge wipes it up; a pitcher put back in its place fills again | 1 / 2 / 3 pitchers, 2 / 3 / 4 glasses |
| **Easel** | Art; metal insets for the hand | Paint with a finger, or several | Choose a pot; lay a metal inset frame on the paper | Paint through the frame and lift it to leave a clean shape; watercolour glazes, so colours mix on the paper | 3 / 6 / 6 paints; 0 / 4 / 8 insets; brush smaller as it grows |
| **Sandpaper letters** | Language | Choose a board from the box; trace it | A guide's finger shows how each is written, once, and again on request | Only the sand makes a sound; the smooth board is silent | – |
| **Sandpaper numerals** | Mathematics | As the letters | As the letters | A bowl lays out that many counters in pairs, Montessori's cards and counters, one rising note each | – |
| **Dig** | Practical life: transferring, with a material that keeps its shape | Tap the sand and it sprays; tap the digger for its horn, the truck for two beeps | The bucket follows a finger: down into the sand it fills, lifted it carries, let go it pours; the digger crawls after a finger beyond its reach. Drag the truck, and tap its bed to tip it | The ground itself: heaps, holes and ramps, of sand that slumps to its natural slope and is never made or lost; things buried in it, the first always found at the first bite | a digger and a heap / and a dump truck, and things buried / and a bulldozer, and earth under the sand |
| **Crane** | Sensorial (building with shapes), and the work of the hand at a distance | Tap a part for its colour's note, the cab for the horn, the hook to set it swinging | Drag the hook: the trolley and cable follow, it takes the part it is lowered onto, and drops it where it is let go, onto a grid so a stack stands. A part can also be carried by hand, the crane following | A building of any shape, which moves in by itself: a cat in a window, plants on the ledges, a bird nesting on top; a tap at its foot plays it bottom to top, each part lit | 4 big blocks / blocks, beams and windows / and arches, a roof and a wrecking ball |
| **Farm** | None: after Pok Pok's builder | Tap anything: every piece answers, and tapped grass grows a flower | An island of tiles, seen from a corner like a model on a table: a tile put down on the table makes it bigger, a path, field or pond put down on a tile changes it, and pieces stand on tiles, move, swap and go back to the tray | A farm that joins up: paths for the tractor to drive, fields by water that grow on their own, a pond big enough for ducks; the sun turns it to night, when the lights come on and other things wake | 6 / 10 / 13 kinds of piece and a grass tile, on a table of 5 × 4 / 6 × 5 / 7 × 5 tiles |
| **Building site** | None: the farm's builder | Tap anything: every piece answers | As the farm, with earth, roads and plots for tiles | Machines that work in chains: the digger digs a plot and loads the truck, the truck tips onto the pile, the mixer fills the hole with concrete, the crane lifts a building onto the foundation a floor at a time, each floor a note higher, and tops it out with a tree; the foreman's whistle sets them all going | 6 / 9 / 12 kinds of piece and an earth tile, on a table of 5 × 4 / 6 × 5 / 7 × 5 tiles |

### How Montessori and Pok Pok were reconciled

The two traditions agree on most things: no extrinsic rewards, no failure states, beauty and
calm, real-world objects, a child free to choose and to repeat. They differ on one point.
Montessori builds **control of error** into a material (a cylinder fits only its own socket),
while Pok Pok removes right and wrong altogether. This playroom chose the open-ended side, so
**nothing here ever judges**: no success chime, no completion animation, no "try again".

What is kept from Montessori is the honesty of the materials. Where an order exists, it is a
**physical property**, not a verdict:

- A tone bar's length goes with its pitch, as it does on a real instrument.
- A sandpaper letter is rough and the board is smooth, so only the letter makes a sound. That is
  how a finger knows, as on the real board.
- A glass rings lower as it fills, and the pouring sound rises, as real water does.
- Sand in the dig is never made or lost: what the bucket takes is what the ground gives up, and
  every grain poured lands somewhere. It heaps and slides to its own slope, as sand does.
- A part the crane sets down clanks a step of the scale higher for every half-block it stands above
  the ground, so a building going up rings up the scale.

The colour tower goes further. It began as the pink tower, which has one right order, largest at
the bottom, and a material that shows a mistake. Here the cubes still differ in size, so an order
by size is there to be found by eye, but the sound is the colour's, not the size's. Each colour
comes both large and small, and the sizes in order spell no pattern, so a tower built by size plays
nothing that a tower built any other way does not. What plays is whatever pattern the child makes:
red-blue-red-blue is heard as a repeating tune, as a stack or as a row along the rug, and a tap
anywhere on it plays the whole of it, the light running along the row with the tune. Size shows
only in how full the knock is. A colour's note is the same as on the easel, where red is also C.

It also parts from Montessori in one more way, deliberately. A Montessori material is the same
every day; the tower brings a new set each time it comes off the shelf, as Pok Pok's toys do. At
Seed and Sprout the colours change (never the same ones twice running), and at every stage the
sizes are spaced afresh and the colours fall differently across them. The rules stay fixed: each
colour keeps its note, every cube is a different size, at least 8% smaller than the next, and
colour and size never line up. [`js/toys/cubes.js`](../playroom/js/toys/cubes.js) rolls the sets,
and the suite rolls 2000 of them per stage to check every rule.

Montessori's other principles are here too:

- **Isolation of a quality.** Each toy is about one thing.
- **Order.** The shelf, the trays, and a toy that starts fresh each time it is taken out.
- **The prepared environment.** The grown-up chooses what is out and how much.
- **Concrete before abstract.** Counters beside numerals, metal insets before letters.

### Symbols, and silence

Letters and numerals appear only as objects to trace; nothing in the playroom needs reading to be
used. They are **silent**: no voice says a letter's name or sound. Montessori introduces letters by
their sound rather than their name, and a synthesised voice would say the name. The parent's
panel is the only text.

---

## Sound design

- **One tuning.** Every pitched sound in every toy is on C major pentatonic (A4 = 440 Hz). Any two
  notes from any two toys are consonant, so nothing a child does can sound wrong, and the pond, the
  tower and the bars can all be played at once. The farm's animals are on it too: the cow's moo is
  a C, the sheep's baa an A, and a herd answering itself climbs the scale. So is the building site:
  a reversing truck beeps on the scale, a beam's clank is a note, and the floors of a building and
  the parts of the crane's sound the playroom's colour-and-note pairs.
- **Synthesised, not recorded.** Each sound is rendered from a recipe in
  [`js/synth.js`](../playroom/js/synth.js). Struck things (bars, bells, wood, glass, music-box tines)
  use modal synthesis: a sum of damped sinusoids with the material's mode ratios, upper modes dying
  faster than the fundamental. Water drops are the sweep of a shrinking bubble; the door's creak is
  stick-slip; the sand is a crackle of individual grains. The farm's voices are a buzzy source
  through a few formant filters, the shape of a vocal tract: the pitch, its wobble and the vowel
  are what make a moo a moo and a quack a quack. The whole sound set is a few hundred lines of
  arithmetic rather than megabytes of audio. The machines are the same idea: a steel beam's clank
  is the inharmonic ring of a free bar, a load sliding out of a tipped truck is low noise with
  grains pattering through it, and the foreman's whistle is a pea rattling a note thirty times a
  second.
- **Rendered once, played cheaply.** Recipes render into buffers, ahead of need, a few at a time
  while the shelf is showing. A note at play time is one buffer source and one gain node, which an
  A7 can do by the dozen.
- **A mix, written down.** Each recipe has one level in `MIX` (in `synth.js`), and the toys pass
  only relative gain. The levels were set from a loudness estimate of every sound:
  - musical notes (and a beam's clank) sit near −17 dB;
  - animal voices near −19;
  - foley (clicks, latches, pats, a reversing beep, a chain, a crunch, a whistle) near −21;
  - air and paper (a load sliding out, wet concrete, a brake's hiss) near −24;
  - a single zip tooth or engine beat, which come in streams, near −27.

  `test.mjs` holds every sound to its band, so the mix cannot drift.
- **Continuous textures.** The brush, the sand, the water, the pouring and the slide whistle follow
  the finger: filtered noise loops, or an oscillator, whose level and pitch track its speed. The
  pouring sound's band-pass rises with the receiving glass's fill: the air column above the water,
  shortening. The dig's sand on the move is a coarser grit, loud as fast as it moves; the digger's
  hydraulics and the crane's winch are a motor voice whose pitch steps along the scale with the
  arm's or the hook's height, so lifting sings rather than whines.
- **A room.** A short, warm, generated reverb, darkening as it decays, behind everything; a gentle
  high shelf and a compressor in front of the speaker so eight fingers do not sum into distortion.

---

## Built for an old iPad

An iPad Air 1 or mini 2/3 stops at iOS 12.5.7, which is Safari 12. Most of what is unusual in the
code follows from that, and `test.mjs` holds the code to it.

| Safari 12 constraint | What the playroom does |
|---|---|
| ES2017 at most: no `?.`, `??`, class fields | Plain ES2017 modules; every file is parsed at ES2017 by the tests |
| No pointer events (13) | Touch events, tracked per finger; mouse for desktop testing |
| Document touch listeners are passive (11.3+) | Listeners on the canvas, `{ passive: false }`, `preventDefault` everywhere a child can reach, and Safari's `gesturestart` cancelled: no scrolling, rubber-banding, zooming or callouts |
| Only `webkitAudioContext`, created suspended | Created and resumed inside the first `touchend` (the gesture iOS accepts), which is the bud on the first screen; re-woken by the first touch after the app returns from the background |
| iOS can report a stale sample rate | Jam3's workaround: play a buffer at the expected rate, close, recreate |
| The silent switch mutes Web Audio | A looping silent `<audio>` element moves the page into the playback session (`navigator.audioSession` on newer iOS); a parent setting |
| No StereoPanner (14.1) | Five fixed pan buses built from gains and a channel merger |
| Automation events accumulate in old WebKit | Continuous controls are a constant signal through a low-pass into the parameter; nothing is scheduled per frame |
| `disconnect(node)` disconnects everything | Every control owns its source; nothing shares an output it might need to unplug |
| ConvolverNode needs the context's rate | The room is rendered after the context exists, a moment after the first sound |
| No `ctx.roundRect` (16), no `ctx.filter` (18), slow `shadowBlur` | Rounded paths from arcs; flat offset shadows, which also suit the look |
| No `ResizeObserver` (13.1), stale sizes after rotation | `resize` and `orientationchange`, measured again after a short delay |
| No flex `gap` (14.1), `inset`, `aspect-ratio`, `clamp()` | Margins and explicit offsets in the CSS |
| 1 GB of RAM, a retina screen | Static backgrounds drawn once into layers and freed on exit; frames drawn only while something moves; the canvas resolution steps down if frames run long |
| Offline | A service worker (11.3+) precaches every file; `test.mjs` checks the list against the directory, and that the page opens offline |
| A Home Screen app is resumed far more often than started (always, under Guided Access), and a page keeps running the files it started with | The page asks for a newer worker every time it comes to the front, and changes over to it at a quiet moment: at once while the bud waits, otherwise the next time it is put away or woken. A service worker cannot reload a page itself before Safari 16 |

Two things a desktop cannot show, and only the iPad itself can confirm: how the speakers render the
mix, and the A7's frame rate. The adaptive resolution is the hedge for the second.

---

## Testing

```bash
cd playroom
npm install                 # playwright and acorn, nothing else
node test.mjs               # or: node test.mjs --shots DIR  to save every scene
```

In Node:

- every module parses as ES2017;
- no API or CSS newer than Safari 12;
- the offline copy is complete;
- all 140 recipe variants render finite, unclipped, click-free and DC-free at 44.1 and 48 kHz;
- every sound sits in its band of the mix;
- all 36 glyphs stay on the writing lines;
- every set of cubes the colour tower can roll keeps its rules, over 2000 rolls a stage.

Then in Chromium, as an iPad (1024 × 768 at 2×, touch), the suite drives every toy with real touch
events. It measures the audio that reaches the speaker through an analyser after the compressor.
It also checks:

- that the first touch is what starts sound;
- that the frame loop sleeps when nothing moves;
- that each colour in the tower has one note, the same as its paint on the easel, and comes in
  both large and small sizes;
- that a tap anywhere plays the whole tower or row, from the left and the bottom, each cube lit in
  turn over a band on the rug;
- that the tower brings different colours the next time it comes out;
- on the farm: that a frog comes to the pond within seconds; that a hidden thing shows itself the
  first time whatever chance says, and by chance after that; that a piece from the tray joins its
  neighbours; that a joined field grows as one, is harvested ripe and hides a rabbit among the
  carrots; that a field by water grows on its own; that a pond grown to three tiles brings ducks;
  that a sheep's neighbour answers it; that pieces move, swap, and go back to the tray; that the
  tractor drives the path, harvests the field beside it and comes home; that the sun brings the
  night, when the cow jumps over the moon; and that the farm starts fresh when it comes off the
  shelf again;
- in the dig: that a finger in the sand fills the bucket and the ground gives up exactly what it
  takes; that the first proper bite always turns something up; that a load carried over the truck
  pours into its bed with not a grain lost; that the motor sings while the arm moves and is quiet
  when it stops; that the truck tips its load out and drives over the sand riding its shape; at
  Bloom, a bulldozer and earth under the sand; and that the dig starts fresh;
- at the crane: that dragging the hook runs the trolley and winds the cable; that the hook takes
  the part it is lowered onto; that a part let go over the slab drops to the ground, and a second
  lands on top of it a note higher; that the winch is quiet once the hook stops; that a part
  carried by hand goes where the finger takes it; that a tap at a building's foot plays it bottom
  to top; that a bird comes to nest on top the first time; that night lights the windows; at
  Bloom, that the wrecking ball knocks a stack down and the parts go home; and that the crane
  starts fresh;
- on the building site: that pigeons come to the road the first time whatever chance says; that a
  road from the tray joins the road beside it; each link of the chain, from the digger digging a
  plot and loading the truck, through the truck tipping onto the pile and the mixer pouring
  concrete that sets, to the crane lifting floors and topping the building out; that a building
  plays its floors from the ground up; that the foreman's whistle sets the machines going; the
  night; at Bloom, a roller that leaves the road fresh and a lamp that lights; and that the site
  starts fresh;
- that leaving a toy stops its sounds;
- that the grown-ups' gate needs a three-second hold;
- that one toy's stage can be moved on by itself, and the shared stage clears it again;
- that a rotation is followed;
- that the page opens with no connection;
- that a newly published copy is taken up by itself: at once while the bud waits, and mid-play
  only once the playroom has been put away, when it opens again from the bud. Two copies are
  published in turn, stamped as the deploy stamps them.

All of that runs a second time with everything Safari 12 lacks removed from the page and an iPad's
user agent: no unprefixed `AudioContext`, no StereoPanner, no `roundRect`, no float analyser, and
so on. That run also proves the prefixed audio path and the silent-switch workaround.

It runs in CI on every push, and before every deploy.

## Icons

`node tools/icons.mjs` renders the home-screen icons and the iPad launch images from the playroom's
own drawing code. The icon is the same bud the playroom opens on, and the launch image is the
opening screen itself, so launching changes nothing on screen. The PNGs are committed, encoded by
the tool's own small PNG writer at a quarter of the size the browser's encoder produces.

## Files

```
playroom/
  index.html, style.css     the page: one canvas, two corner buttons, the grown-ups' panel
  manifest.webmanifest      Home Screen metadata
  sw.js                     the offline copy (VERSION stamped at deploy)
  js/
    main.js                 start-up and wiring, and changing over to a newer copy
    version.js              which copy this is (stamped at deploy), shown in the grown-ups' corner
    stage.js                canvas, touch, frame loop, transitions, adaptive resolution
    audio.js                the Web Audio engine
    synth.js                every sound, as a recipe; the tuning; the mix
    draw.js, util.js        palette, shapes, layers, springs, colour, paint mixing
    start.js, shelf.js      the bud, and the shelf
    settings.js, parent.js  the grown-ups' corner
    toys/                   one file per toy; glyphs.js holds the letters and numerals, cubes.js
                            the colour tower's sets, farmart.js the farm's pictures, board.js the
                            isometric board the farm and the building site are built on, iso.js
                            its boxes, roofs and walls, machines.js the site's palette and
                            machines, and digart.js, craneart.js and siteart.js the rest of the
                            dig's, the crane's and the site's pictures
  icons/                    generated by tools/icons.mjs
  test.mjs                  the suite
```

## Not yet done

- **A garden.** Seeds, a watering can, flowers that open with a chime, and the bud's own story. The
  farm's fields and watering farmer now cover some of it.
- **A drying line** for the easel, to keep the last few paintings.
- **The movable alphabet**, the next step after the sandpaper letters, once a child is building
  words.
