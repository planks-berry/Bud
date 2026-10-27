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
- **The toys.** Which are out, where, and each one's stage. Fewer choices help a young child settle
  into one; the Montessori habit is to put a few out and rotate them every week or two. The list
  runs in the shelf's order, and arrows move a toy earlier or later on the shelf; one press brings
  back the playroom's own order. A new toy is marked New, and has its own switch like the rest.
- **New things.** A switch for each new part of the playroom, all on to begin with: the hello song,
  the goodnight moon and the shy fish.
- **Goodnight.** Whether the toys fall asleep by themselves or each waits for the child to tuck it
  in, and the **goodnight timer**: 10, 15, 30 or 60 minutes, locked with a four-number passcode.
  The passcode is chosen (twice) the first time, and asked for to start, change or stop the timer;
  it is kept only as a hash, and a forgotten one is cleared by typing four numbers the keypad
  shows. While the timer runs, a thin band round the edge of every screen empties clockwise, green
  to yellow to rose; when it has gone, the band turns night blue and goodnight begins: on the shelf
  at once, and in a toy after a minute's grace with the moon on the house button, when the toy puts
  itself away. Then play is over. The playroom closes to its bud, asleep under the moon, and stays
  closed however often it is tapped, and however often, or however long after, it is opened again,
  until a grown-up opens it: the leaf to the corner stays beside the sleeping bud, and **Open the
  playroom again**, or a new timer, asks for the passcode. The timer that has run out is itself
  the lock. It is kept with the settings until a grown-up clears it, so reopening the playroom
  loses neither a running timer nor a closed playroom. The moon in the shelf's window, the child's
  own goodnight, closes to a bud that opens again, and leaves a running timer running.
- **Sound.** Whether to play through the silent switch, and an overall volume.

Settings live in the iPad's local storage for this site and survive restarts. Nothing records what
the child does: no reports, no history, nothing sent anywhere.

---

## The shelf

Sixteen toys in rows, ordered as a Montessori shelf is: simple to complex, left to right, top to
bottom. The first toys ask for nothing but a touch; then a steadier hand, and then symbols. Then
the builders': the dig, where a finger is a digger's bucket; the crane, which does the same work at
a distance, through a hook; and the farm and the building site, worlds to build rather than
materials, which hold a little of everything before them. After them come the new games, in the
order they were made: Bird Song, Weather Song, Freeze Parade and the Fix-it Shop. A new toy joins at
the end, so the trays a child knows keep their order, until a grown-up moves it. The shelf takes up
to four rows, of as many trays as the toys need.

**Hello and goodnight.** The playroom opens and closes the same way every day. When the bud opens,
the trays wake one by one, each with a note, climbing the scale. The picture on the shelf's wall
is a window, with the sun in it and a moon: tap the moon and dusk falls, and the toys fall asleep
one by one, from the last tray, each to the next note of a lullaby; a tap tucks one in at once.
When the last is asleep, the playroom closes to its bud. A grown-up can choose instead that each toy
waits to be tucked in. And a grown-up's goodnight timer brings the night: a band round every
screen shows the time going, with no clock and no numbers, the sun in the window sets as it does,
and when it has gone the night comes, after a minute's grace if a toy is out. Then play is over:
the bud sleeps, and does not open again until a grown-up opens the playroom. The band is an SVG
over the canvas (`js/band.js`): the canvas draws only while something moves, and the band has to
keep time when nothing does.

Each toy also has its own section, written to be revised, in [PLAYROOM-GAMES.md](PLAYROOM-GAMES.md).

Every toy has three layers, which are found by playing, never unlocked:

- **touch**: something happens at the first contact, always;
- **move**: dragging, carrying, turning, combining;
- **make**: structure that rewards staying a while: a tune, a loop, a building, a mixed colour, a
  shape.

| Toy | Montessori area | touch | move | make | What the stage changes |
|---|---|---|---|---|---|
| **Pond** | Nature, care of animals | Tap the water: a ripple and a water drop, pitched left-low to right-high | Push lily pads; open and close a lotus | Hold a finger still and the fish come to nibble; scatter food from the pot and they gather to eat. The shy fish (a switch in the corner) peeks out from under its pad, and comes to a finger held still a step at a time | 3 / 4 / 5 fish, 2 / 3 / 4 pads; the shy fish comes in one go / in three steps / with a friend |
| **Busy board** | Practical life (dressing frames, bolt boards) | Lamp switch; a little door with a different picture behind it each time | A colour dial that clicks up the scale; a sun on a slider with a slide whistle; a zip | Crank a music box (Twinkle, Twinkle) at any speed; at Bloom the door has a bolt to slide first | 4 controls at Seed, 6 after; bolt at Bloom |
| **Tone bars** | Music, auditory sense | Tap a bar; sweep for a glissando; chords with several fingers | Choose a wooden or a metal mallet | The shell plays back the last phrase; at Bloom, hold a bar to lift it and move it | 5 / 8 / 10 bars |
| **Colour beats** | Music; sensorial: colour | Tap an empty cubby on the shelf and its cube drops in, sounding; tap a cube and it comes out. A light runs along the shelf, round and round, and plays every cube it reaches | Draw a line of cubes with a finger, or empty one; hold the ball under the shelf and the light goes where the finger takes it, playing as it goes | A loop of tune and beat: each column a beat, each row a sound, the colours their notes (as on the crane) and plain wooden cubes a drum, a clap and a shaker; what a column holds sounds together; new colours each time it comes out | 4 columns, 2 colours and a drum / 8, 3 colours, a drum and a shaker / 8, all 5 colours, a drum, a clap and a shaker |
| **Pouring** | Practical life | Tap a glass: it rings lower the fuller it is | Carry a pitcher over a glass and it tilts and pours | Colours mix as paint does; glasses overflow onto the tray and the sponge wipes it up; a pitcher put back in its place fills again | 1 / 2 / 3 pitchers, 2 / 3 / 4 glasses |
| **Turntable** | Music, auditory sense: speed is pitch | Tap the button: the record, waiting, spins up and plays, and winds down to a stop again; tap a pad: a horn, a boom, a cow, a clap, a shaker, or the scratch pad, which scratches the record by itself | Hold the record and move it to and fro: a scratch, the music going wherever the record goes, backwards and forwards, faster and higher | A scratch over a loop, or a beat on the pads over it; records from a crate, each two bars pressed from the playroom's own sounds: a tune, a beat, the animals; at Bloom, a slider for the speed. With its switch on, the friend at the decks takes turns with him: it answers his pads / leads with a scratch and answers his / takes two bars each with him, his beat staying in the record's loop | one record, a horn and a boom / three records, and a cow and a scratch pad / and a clap, a shaker and a speed slider |
| **Sandpaper letters** | Language | Choose a board from the box; trace it | A guide's finger shows how each is written, once, and again on request | Only the sand makes a sound; the smooth board is silent | – |
| **Sandpaper numerals** | Mathematics | As the letters | As the letters | A bowl lays out that many counters in pairs, Montessori's cards and counters, one rising note each | – |
| **Dig** | Practical life: transferring, with a material that keeps its shape | Tap the sand and it sprays; tap the digger for its horn, the truck for two beeps | The bucket follows a finger: down into the sand it fills, lifted it carries, let go it pours; the digger crawls after a finger beyond its reach. Drag the truck, and tap its bed to tip it | The ground itself: heaps, holes and ramps, of sand that slumps to its natural slope and is never made or lost; things buried in it, the first always found at the first bite | a digger and a heap / and a dump truck, and things buried / and a bulldozer, and earth under the sand |
| **Crane** | Sensorial (building with shapes), and the work of the hand at a distance | Tap a part for its colour's note, the cab for the horn, the hook to set it swinging | Drag the hook: the trolley and cable follow, it takes the part it is lowered onto, and drops it where it is let go, onto a grid so a stack stands. A part can also be carried by hand, the crane following | A building of any shape, which moves in by itself: a cat in a window, plants on the ledges, a bird nesting on top; a tap at its foot plays it bottom to top, each part lit. And trucks to load: one in a part's colour waits for the parts marked out on its deck, takes only its own colour, and drives off loaded, and a second crane restocks the pile | 4 big blocks / blocks, beams and windows / and arches, a roof and a wrecking ball |
| **Farm** | None: after Pok Pok's builder | Tap anything: every piece answers, and tapped grass grows a flower | An island of tiles, seen from a corner like a model on a table, on a table that starts empty: a tile put down on the table makes it bigger, a path, field, pond or stream put down on a tile changes it, and pieces stand on tiles, move, swap and go back to the tray; what is hidden behind a building shows through it; the broom, tapped, sweeps everything back to the tray and leaves the island plain grass, and tapped again, sweeps the island away | A farm that joins up: paths for the tractor to drive, streams that carry a pond's water along to the fields, fields by water that grow on their own, a pond big enough for ducks; the sun turns it to night, when the lights come on and other things wake | 7 / 11 / 14 kinds of piece and a grass tile, on a table of 5 × 4 / 6 × 5 / 7 × 5 tiles |
| **Building site** | None: the farm's builder | Tap anything: every piece answers, a machine with nothing to do with its engine and a little of its work | As the farm, with earth, roads and plots for tiles, from an empty table, and the broom to sweep it plain and then away; but its machines and pieces stand on the ground rather than taking its place, and only on flat ground, earth or road | Machines that work a step at a time, each step one machine's job: the digger digs a plot a tile a tap, the crane lowers the forms into the hole, the mixer pours the concrete, the crane lifts a building onto the foundation a floor at a time, each floor a note higher, and tops it out with a tree. The earth always goes somewhere: into a truck that tips it over the edge of the site, onto a pile, and at Bloom into a hole, pushed by the bulldozer, and rolled flat. At Bloom roads are built too: marked out, scraped to dirt by the bulldozer, rolled by the roller, paved by the paver. The foreman's whistle sets them all going | 6 / 9 / 13 kinds of piece and an earth tile, on a table of 5 × 4 / 6 × 5 / 7 × 5 tiles |
| **Weather song** | Music; and feelings, after Mister Rogers | Tip the rain-stick, ring a bell, beat the big drum: each is a weather; tap the friend and it hops | Push the cloud along: wind, and the friend's scarf flies out | His music is the friend's weather and mood: a drizzle and a sleepy friend under a leaf, the sun and a dance, thunder and a cross friend who sighs and smiles when it passes; a whole day, morning to night, when the friend sleeps until a tap brings the morning | a rain-stick and 3 bells / and 5 bells and the big drum / and fog with a shy friend, a rainbow with a proud one, and the day painted as a strip of sky |
| **Freeze parade** | Music: rhythm and movement; self-control | Each beat on the big drum is a step for the parade; tap an animal and it calls out | A steady beat marches them, quick beats hurry them; stopping freezes them mid-step | A parade round the pond, over the bridge and home past the barn, where the rooster crows; stopped, they freeze in silly poses, wobble, one sneezes, and at last they lie down to wait | a drum, a cow, a sheep and a pig / and two ducks with a tambourine / and a quick hare, a slow tortoise, and a band playing along |
| **Fix-it shop** | Practical life, and sensorial: shape | Tap a broken toy: a dream shows what it does when it works; tap a part to turn it; tap a mended toy on the shelf for its part in the band | Carry a part from the drawer to the gap it leaves: one that fits clicks in, one that does not slides back; the right part the wrong way round lies by the toy until it is turned. At Bloom, the screwdriver turns a screw home | Broken toys, one at a time, mended and come to life: a car that drives, a drum, a music box, a robot that waves, a train that toots, a boat that sails; each hops up to the shelf and joins the band | one part missing, a drawer of two / a drawer of three, the part to be turned / two parts missing, a drawer of four, and a screw |
| **Bird song** | Music, auditory sense; and taking turns | Tap a bell flower for its colour's note; tap the bird to hand it the turn, or, before playing, to hear its tune again | Run a finger along the flowers: a glide, and the bird glides it back | The bird sings a tune and waits, wing to its ear, asking with rings and a hop when he pauses, and, every five seconds he plays on, by standing tall and flapping; handed the turn, it sings his notes back in the same rhythm, then a new tune from the last note played. Tunes grow by a note after three answered turns, and never shrink | 3 flowers, tunes of 2 / 5 flowers, tunes of 3 / and a second bird, tunes growing to 5 |

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

The colour beats go furthest. They began as the pink tower, which has one right order, largest at
the bottom, and a material that shows a mistake; became the colour tower, where the sound was the
colour's and no order was the right one; and are now a step sequencer. The cubes sit in a shelf of
cubbies, a column for each beat of a loop and a row for each sound, and a light plays the columns
in turn, round and round, so whatever pattern the child makes is heard again and again while it
changes: a line of one colour, a staircase that climbs the scale, a chord, a rhythm on the drum
under a tune. No cubby is a wrong place for a cube: every note is on the scale, so any column is a
chord that sounds well, and a gap is a rest. A colour's note is the same in every game: red is C on
the crane and the building site too, and on the turntable's pads the yellow horn toots yellow's E
and the green cow moos green's G.

They also part from Montessori in one more way, deliberately. A Montessori material is the same
every day; the colour beats bring a new choice of colours each time they are taken out, as Pok Pok's
toys do, at Seed and Sprout never the same ones twice running. The rules stay fixed: each colour
keeps its note, and the rows run from the drum at the bottom to the highest note at the top.
[`js/toys/cubes.js`](../playroom/js/toys/cubes.js) rolls the choices, and the suite rolls 2000 of
them per stage to check every rule.

Montessori's other principles are here too:

- **Isolation of a quality.** Each toy is about one thing.
- **Order.** The shelf, the trays, and a toy that starts fresh each time it is taken out.
- **The prepared environment.** The grown-up chooses what is out and how much.
- **Concrete before abstract.** Counters beside numerals; a letter traced long before it is read.

### Symbols, and silence

Letters and numerals appear only as objects to trace; nothing in the playroom needs reading to be
used. They are **silent**: no voice says a letter's name or sound. Montessori introduces letters by
their sound rather than their name, and a synthesised voice would say the name. The parent's
panel is the only text.

---

## Sound design

- **One tuning.** Every pitched sound in every toy is on C major pentatonic (A4 = 440 Hz). Any two
  notes from any two toys are consonant, so nothing a child does can sound wrong, and the pond, the
  colour beats and the bars can all be played at once. The farm's animals are on it too: the cow's
  moo is a C, the sheep's baa an A, and a herd answering itself climbs the scale. So is the building
  site: a reversing truck beeps on the scale, a beam's clank is a note, and the floors of a building
  and the parts of the crane's sound the playroom's colour-and-note pairs.
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
- **A beat on the sound's own clock.** The colour beats' loop keeps time by the audio context's
  clock, not the frames: each column's sounds are started a moment (0.12 s) ahead at their exact
  time, so the beat stays even when a frame is late, and the light and the ball are placed by the
  same clock.
- **A mix, written down.** Each recipe has one level in `MIX` (in `synth.js`), and the toys pass
  only relative gain. The levels were set from a loudness estimate of every sound:
  - musical notes (and a beam's clank, and the colour beats' drum) sit near −17 dB, and Bird
    Song's whistle just under them, since a held whistle sounds louder than a struck bell;
  - animal voices, and a parade animal's sneeze, near −19;
  - foley (clicks, latches, pats, a reversing beep, a chain, a crunch, a whistle, a clap, a
    shaker, a bird's wingbeats, a tambourine, little cymbals, the friend's sigh) near −21;
  - air and paper (a load sliding out, wet concrete, a brake's hiss, a rain-stick's patter, a
    long roll of thunder) near −24;
  - a single zip tooth or engine beat, which come in streams, near −27.

  `test.mjs` holds every sound to its band, so the mix cannot drift.
- **Continuous textures.** The sand, the water, the pouring and the slide whistle follow the
  finger: filtered noise loops, or an oscillator, whose level and pitch track its speed. The
  pouring sound's band-pass rises with the receiving glass's fill: the air column above the water,
  shortening. The dig's sand on the move is a coarser grit, loud as fast as it moves; the digger's
  hydraulics and the crane's winch are a motor voice whose pitch steps along the scale with the
  arm's or the hook's height, so lifting sings rather than whines.
- **A record that plays backwards.** The turntable's records are pressed from the playroom's own
  sounds the first time each is played: two bars mixed into one loop at the mix's levels, with a
  sound still ringing at the end carrying on at the start. The deck holds each loop twice, the
  second time reversed. Whichever way the record is going, that copy plays from where the record
  is, at the record's speed, so the pitch follows the speed as on vinyl; turning round starts the
  other copy at the same place, the two crossfaded over a few milliseconds. While the record plays,
  the deck keeps its place by the audio clock, which a dropped frame does not stop, and the picture
  follows it; starting to play again, the deck takes up wherever the record was turned to. Old
  WebKit takes a playback rate of 0 or below as 1, so a record held still runs at a thousandth of
  its speed, silent, and no copy is ever asked to go backwards.
- **A scratch without steps.** A toy can set the record's speed only once a frame, from touches
  that do not come evenly, and a speed that changes in steps 60 times a second is heard on a held
  note as a buzz: frequency modulation at the frame rate. So the record follows the finger as a
  critically damped spring does (`scratch.js`: stiffness 50 a second, so it trails a steady finger
  by 40 ms and never overshoots), and the sound glides to each frame's speed with a 30 ms time
  constant, on the audio clock (`setTargetAtTime`). Old WebKit keeps every automation event on a
  parameter, and walks them all every 2.9 ms, so each frame takes back the last frame's
  instruction before giving its own: the parameter never holds more than one. Measured on a held
  C5 scratched with uneven touches, the buzz is 11 to 14 dB under the note, where setting the speed
  once a frame put it level with the note or above.
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
- all 174 recipe variants render finite, unclipped, click-free and DC-free at 44.1 and 48 kHz;
- every sound sits in its band of the mix;
- all 36 glyphs stay on the writing lines;
- every sound the toys ask for with fixed parameters renders, so none is missing one it needs;
- every choice of colours the colour beats can roll keeps its rules, over 2000 rolls a stage;
- every record on the turntable is on the scale and in time, the same sample for sample as itself
  played round and round (so going round has no seam), and as loud as the notes;
- a scratch through a held note slides rather than buzzes: a C5 scratched with uneven touches, at
  60 and 30 frames a second, through the record's following and the sound's glide, its fast
  wobble at least 9 dB under the note;
- every tune Bird Song's bird composes, 3000 a stage, begins on the last note played, has the
  stage's length, stays on its flowers, steps or skips one and never repeats a note three times;
  what it sings back keeps the child's rhythm, a long wait shortened and a run along the flowers a
  glide, at most his last twelve notes; its tunes grow by a note after three answered turns, up to
  the stage's most; and it bids for its turn after five seconds of his playing, in a gap of a
  third of a second between his notes, or two seconds later if he leaves none;
- Weather Song's weather: each kind passes by itself (thunder halves in 2.2 seconds, a drizzle in
  5, sunshine in 6); the friend is content, sleepy in a drizzle, happy in the sun, cross in the
  thunder, calm with a sigh when it passes, and content again; Seed has no thunder; at Bloom, sun
  in the rain makes a rainbow and a proud friend, and a long quiet brings the fog and a shy one,
  until he plays again; a day goes from morning to night, the friend sleepy and then asleep,
  thunder in the night waking it cross and letting it sleep again, and at Bloom the whole day
  painted, a piece at a time, as a strip of sky;
- Freeze Parade's rules: the parade's pace is the time between his beats, steadied, a first beat
  an easy walk; it freezes when no beat has come for 1.7 times his pace, never sooner than 0.9 s
  or later than 2.2; the cow, the sheep and the pig march to the drum at any pace, the ducks only
  to the tambourine, the hare two steps a hop only to a quick beat, the tortoise only to a slow
  one; and each stage's parade is as described, the band's march on the scale and ending on C.
- the Fix-it Shop's rules, over 400 drawers for each toy and stage: the drawer always holds the
  parts the toy is missing and others to choose from, all different, of different kinds at Seed;
  no other part fits; from Sprout the parts it needs lie turned, round ones aside, and a few taps
  turn them to fit; the toys come one each a round, never the last one first again; and the band
  plays on the scale and in time, the drum on every beat.

Then in Chromium, as an iPad (1024 × 768 at 2×, touch), the suite drives every toy with real touch
events. It measures the audio that reaches the speaker through an analyser after the compressor.
It also checks:

- that the first touch is what starts sound;
- that the shelf says hello, its trays waking one by one, and then the frame loop sleeps when
  nothing moves;
- in the pond: that the shy fish keeps to its lily pad, comes out to a finger held still and
  nibbles it, and darts home when the finger moves;
- in the colour beats: that the shelf opens with its rows lowest note lowest and a heartbeat on
  the drum; that a tap puts a cube in, sounding, and takes it out again; that a stroke fills or
  empties a row; that the light plays a column at a time, a column's cubes together, each column
  booked on the audio clock exactly a beat after the last; that the ball, held, plays each column
  it is rolled to and the loop carries on from there; that the ball hops back when the loop goes
  round; that the loop rests when left alone, and the frames stop, until a touch; and that the
  shelf brings different colours the next time it comes out;
- at the turntable: that the record waits, stopped and silent, until the button starts it, and then
  turns and plays; that a hand holds it still and silent; that
  turned back, the music plays backwards and goes back exactly as far as the record turned, and
  forwards again; that let go, it spins back up with the music in step; that after a slow frame
  the record catches up with the music; that a record from the crate goes on and plays from its
  start; that the button winds it down to a stop, after which nothing moves, and starts it again
  from where it stopped; that the pads keep the playroom's colours (the horn yellow and tooting
  yellow's note, the cow green and mooing green's an octave down, the boom the colour beats' drum,
  with its mark) and sound; that the scratch pad scratches the record back and forth and leaves it
  where it was; at Seed, one record, the button, a horn and a boom; at Bloom, six pads, and that
  the slider sets the speed and settles on the record's own in the middle;
- on the farm: that a frog comes to the pond within seconds; that a hidden thing shows itself the
  first time whatever chance says, and by chance after that; that a piece from the tray joins its
  neighbours; that a joined field grows as one, is harvested ripe and hides a rabbit among the
  carrots; that a field by water grows on its own; that a pond grown to three tiles brings ducks;
  that a sheep's neighbour answers it; that pieces move, swap, and go back to the tray; that the
  tractor drives the path, harvests the field beside it and comes home; that the sun brings the
  night, when the cow jumps over the moon; that the broom, tapped, sweeps every piece back to the
  tray and leaves the island plain grass, and tapped again, leaves an empty table; and that the
  farm comes off the shelf as an empty table, on which the tests lay out an island to work on;
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
  road from the tray joins the road beside it, paved at Sprout; that a truck put down on a plot
  goes back to the tray, put down on a road stands on it with the road still under it, cannot have
  a plot put in under it, and can have earth; each step of a building, from the digger digging one
  tile of a joined plot a tap and loading the truck, the truck taking the earth to the edge and
  tipping it over, and the digger scooping at the air when it can reach no more, through the crane
  lowering the forms and the mixer pouring all the joined forms, which set, to the crane lifting
  floors onto the same building and topping it out; that a building plays its floors from the
  ground up; that the foreman's whistle sets the machines going; a piece behind a building showing
  through it; the night; at Bloom, a mixer waiting for forms, the bulldozer pushing a pile into the
  hole the digger dug and backing home, the roller rolling it flat, each road machine working only
  its own step of a road from marked out to paved, with ducks crossing the new road, a pile pushed
  over the edge with no hole to go to, and a lamp that lights; that the broom sweeps the site to
  plain earth and then away; and that the site comes off the shelf as an empty table; and in Node,
  the ways the site's machines find across the island, round what is in the way and keeping to the
  road, and the walks the road machines take out along a road and home;
- in bird song: that the bird sings first and then waits, wing to its ear, with the flowers open;
  that when he stops it asks for its turn and keeps waiting, and his tap on it hands the turn over,
  when it sings his notes back and begins its next tune on his last note; that a flower tapped
  while it sings is not taken as an answer; that a run along the flowers comes back as a glide;
  that its tunes grow after three answers; that while he plays on, it bids for its turn every five
  seconds of it, in a gap between his notes, standing tall and flapping a beat longer each time,
  asks with its rings when he pauses, and leaves the turn his until he taps it; that with nothing
  played it sings again, twice, then rests, with no frames drawn, until a flower wakes it; that
  played but not handed over, it asks twice with a chirp, then rests keeping his notes, which a tap
  on it still sings back; and at Bloom, that the second bird answers the first and both sing his
  notes back;
- in weather song: that the rain-stick tips with a patter and a drizzle falls, the friend sleepy
  under a leaf; that the bells bring the sun and a dance; that the drum brings thunder and a cross
  friend, who is calm when it rolls away and then smiles; that the cloud pushed along is a wind
  that lifts the friend's scarf; that at night the friend falls asleep and, once all is still,
  nothing moves, until a tap on it brings the morning; that Seed has three bells and no drum; and
  at Bloom, a rainbow and a proud friend, the fog and a shy one, and the strip of sky;
- in freeze parade: that four beats are four steps for each animal; that when he stops they
  freeze, wobbling, and one sneezes; that at last they lie down to wait, and a beat brings them up
  and marching; that passing the barn opens its door; that at Sprout the ducks march to the
  tambourine and only to it; and at Bloom, that the hare hops ahead to a quick beat while the
  tortoise waits, the tortoise walks to a slow one while the hare waits, and the band plays along;
- in the fix-it shop: that a broken toy comes in through the door with a dream of it working, and
  the drawer holds three parts, its own turned; that a part that does not fit slides back to the
  drawer; that the right part the wrong way round lies by the toy, and taps turn it; that turned it
  clicks in and the toy comes to life, audibly; that it hops to the shelf, the band plays, and the
  next toy comes in; that a broken toy waiting draws nothing until, left a while, its gap glows;
  that a tap on a mended toy plays its part; and at Bloom, that two parts are missing and the first
  waits for the screwdriver, which turns its screw home;
- at the turntable with the friend: that at Seed it waits while he plays and then answers his
  pads on the same pads, reaching over to tap each; that at Sprout it leads with a scratch and a
  pad and waits for him, and answers his scratch with a scratch; that at Bloom, with the record
  going round, it plays its two bars and listens through his, and the pads he taps stay in the
  record's loop and play each time round; and that with its switch off there is no friend and the
  turntable has its room back (the turntable's own checks run with it off);
- that leaving a toy stops its sounds;
- that the grown-ups' gate needs a three-second hold;
- that one toy's stage can be moved on by itself, and the shared stage clears it again;
- that the arrows move a toy along the shelf, the list following and the order remembered, and
  one press brings back the playroom's own order; that only the new game is marked new;
- that each new thing has a switch, on to begin with and remembered, and that with the shy fish
  off, the pond has only its own fish;
- that the toys fall asleep by themselves to begin with, or can wait to be tucked in; that a
  timer starts once a passcode is chosen, twice, is remembered, and puts a full green band round
  the screen; that stopping it needs the right passcode; and that a forgotten passcode is cleared
  by typing the numbers shown;
- goodnight: that a tap on the moon brings the night, a tap tucks a toy in, and the playroom closes
  to its bud, which opens it again with its hello; that the timer's band is half round the screen
  and yellow half way through, with the sun half set; that run out in a toy, the house button
  shows the moon and the band turns night blue, and after the grace the toy puts itself away and
  the night comes; that the playroom then closes to a sleeping bud, the timer kept and the leaf to
  the corner beside it, which taps only stir; that opened again a day later it is still closed,
  and silent when tapped; that in the corner, cancelled, it stays closed, and with the passcode
  the timer goes and the bud wakes, then opens with its hello; that when the child is to tuck them
  in, the night waits, drawing little, until each toy is tapped; that the moon's goodnight leaves
  a running timer running, and its bud opens; and that a running timer and its band survive the
  playroom being opened again;
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
    start.js, shelf.js      the bud, asleep once the timer has run out, and the shelf with its
                            hello and goodnight
    settings.js, parent.js  the grown-ups' corner; keypad.js its passcode, band.js the
                            goodnight timer's band
    friend.js               the friend, its moods and how it shows them
    toys/                   one file per toy; glyphs.js holds the letters and numerals, cubes.js
                            the colour beats' cubes and the beats' marks, records.js the
                            turntable's records, scratch.js how its record follows a hand,
                            tunes.js Bird Song's tunes, skies.js Weather Song's weather,
                            march.js and paradeart.js Freeze Parade's rules and animals,
                            repairs.js and fixitart.js the Fix-it Shop's rules and its toys
                            and parts,
                            instruments.js the drum and tambourine they share,
                            deckfriend.js the friend at the turntable,
                            farmart.js the farm's pictures, board.js the isometric board the
                            farm and the building site are built on, iso.js its boxes, roofs
                            and walls, routes.js the ways the site's machines find across it,
                            machines.js the site's palette and machines, and
                            digart.js, craneart.js and siteart.js the rest of the dig's, the
                            crane's and the site's pictures
  icons/                    generated by tools/icons.mjs
  test.mjs                  the suite
```

## Not yet done

- **The rest of the proposal for new games**: phases 3 and 4, six games.
- **A garden.** Seeds, a watering can, flowers that open with a chime, and the bud's own story. The
  farm's fields and watering farmer now cover some of it.
- **The movable alphabet**, the next step after the sandpaper letters, once a child is building
  words.
