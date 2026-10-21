# Playroom: summary and game notes

A working document: where the playroom stands, and one section per game to edit as the games are
revised. The technical side (the old iPad, the audio engine, the tests) is in
[PLAYROOM.md](PLAYROOM.md). This file is about what each game is and why. The code calls the games
"toys".

**Status, 21 October 2026.**
- **Built:** eight games, tested in two simulated iPad browsers (one with everything Safari 12
  lacks removed).
- **Where:** branch `claude/montessori-playroom`. Not yet merged to `main`, so not yet at
  https://planks-berry.github.io/Bud/playroom/.
- **Not yet checked on a real iPad:** the speaker mix and the iPad Air's frame rate can only be
  checked there.

---

## The brief

What was asked, and the answers that have shaped everything since.

- **Who it's for:** a child almost three. The playroom should grow with him and have layers.
- **What it runs on:** an old iPad (Air 1 or mini 2/3, iOS 12.5, so Safari 12). It is a web page,
  added to the Home Screen, and works offline once opened.
- **Style:** Montessori-inspired and Pok Pok-like: open-ended games, simple programs, things to
  touch.
- **Look and sound:** simple, soft colours, and pleasing sound design.
- **Nothing judges:** no goals, scores, rewards, "try again" or wrong answers.
- **Letters and numerals are silent:** shapes to trace, never spoken. Purely visual for now.
- **When a game moves on:** a child is ready when he pushes at what a game can do, or starts to lose
  interest in it. So each game has its own stage.
- **No reports or recordings:** the playroom keeps nothing about what he does, only the grown-up's
  settings.

## How the playroom is put together

- **The bud.** The first screen is a closed bud. Touching it makes it bloom with a soft chord, then
  the shelf opens. It also starts the sound, which iOS allows only after a touch.
- **The shelf.** Eight games on a low wooden shelf, one to a tray, in two rows. They are ordered
  simple to complex, left to right. There are no words anywhere: each tray is a picture of its game.
  Touching a tray opens the game, and the house button in the corner puts it back.
- **Layers, found by playing, never unlocked.** Every game has three:
  - **touch**: something happens at the first contact, always;
  - **move**: dragging, carrying, turning, combining;
  - **make**: something to build or keep, which rewards staying a while.
- **Stages.** Seed, Sprout and Bloom set how much a game puts out: more pieces, more tools, finer
  work. Each game has its own stage, so one can move on while the others stay. Nothing is locked.
  Sprout is where everything starts.
- **The grown-ups' corner.** Press and hold the leaf in the shelf's top corner for three seconds.
  Inside:
  - every game's stage at once, and each game's own stage, with what each stage puts out;
  - which games are on the shelf (fewer choices help a young child settle; rotate every week or
    two);
  - sound through the silent switch, and volume;
  - how to set up the iPad: Add to Home Screen, Guided Access, gestures off.

## Sound, across all the games

- **One tuning.** Every pitched sound is in C major pentatonic, so any notes from any games sound
  well together, and nothing a child does sounds wrong.
- **Synthesised, not recorded.** Every sound is computed from a small recipe: wood, bells, water
  drops, a creaking door, sand. The whole set is a few hundred lines of code instead of
  megabytes of audio.
- **A set mix.** Each sound has one level, and the tests hold it in its band: notes loudest, then
  knocks and clicks, then air and paper.
- **Colours have notes.** Red is C, yellow E, green G, blue A, purple the C above. The easel and the
  colour tower use the same pairs.

---

## The games

Every section has the same parts:
- what it is;
- its roots;
- its layers;
- its stages;
- its sounds;
- the decisions so far;
- open questions and ideas, left for you to fill in.

### 1. Pond

**What it is:** still water, a few fish, lily pads, and a pot of fish food on the bank.

**Roots:** Montessori care of animals. It comes first on the shelf because everything in it
answers a single touch.

**Layers**
- Touch: tap the water for a ripple and a water drop. The drop's pitch follows where it lands, low
  on the left and high on the right, so the pond is also an instrument. Nearby fish startle.
- Move: push the lily pads around; they drift and bump. Touch a lotus to open or close it.
- Make: hold a finger still in the water and the fish come to nibble it. Drag from the pot to
  scatter food, and they gather to eat.

**Stages**
- Seed: 3 fish, 2 lily pads.
- Sprout: 4 fish, 3 lily pads.
- Bloom: 5 fish, 4 lily pads.

**Sound:**
- water drops, from the G above middle C up to an E nearly two octaves higher, by position;
- the water swirling under a moving finger, and lapping;
- bubbles, a gulp when a fish eats, and a chime from the lotus.

**Decisions so far**
- The fish need nothing from the child to be content. Feeding them is something to do, never
  something owed.

**Questions**
-

**Ideas**
-

### 2. Busy board

**What it is:** a wooden board of switches and fastenings: a lamp, a colour dial, a sun on a
slider, a little door, a zip and a music box.

**Roots:** Montessori dressing frames and bolt boards (practical life), and Pok Pok's switch toys.
The hand learns a fastening by doing it again and again, for its own sake.

**Layers**
- Touch: the lamp switch; the little door, with a different picture behind it each time it opens
  (finding something behind a door is the whole game at this age); a tap on the music box.
- Move: the colour dial clicks round through eight colours, each with its own note. The sun
  slides from dawn to night, and a slide whistle follows it. The zip opens.
- Make: crank the music box at any speed and Twinkle, Twinkle plays at that speed. At Bloom the
  door has a bolt to slide first.

**Stages**
- Seed: 4 controls (lamp, door, sun, music box).
- Sprout: 6 controls (adds the dial and the zip).
- Bloom: 6 controls, and a bolt on the door.

**Sound:** switch clicks, dial ticks rising up the scale, the slide whistle, the door's creak and
latch, zip teeth, music box notes, chimes.

**Decisions so far**
- Every control answers at once and can be undone, so nothing can be left wrong.

**Questions**
-

**Ideas**
-

### 3. Tone bars

**What it is:** a small marimba on a wooden frame, with two mallets and a shell.

**Roots:** Montessori music materials (the bells and tone bars), and training the ear.

**Layers**
- Touch: tap a bar; sweep across for a glissando; several fingers make chords.
- Move: choose a mallet. The wooden one plays marimba, and the metal one plays glockenspiel an
  octave up.
- Make: the shell remembers the last phrase played and plays it back when touched. At Bloom, a bar
  held still lifts off the frame and can be put back anywhere.

**Stages**
- Seed: 5 bars.
- Sprout: 8 bars.
- Bloom: 10 bars, which lift and move.

**Sound:** marimba with the wooden mallet, glockenspiel with the metal one.

**Decisions so far**
- Every bar is a note of the pentatonic scale, so there is no wrong note and no wrong order.
- Each bar is as long as its pitch makes it on a real instrument, so the frame's shape is the
  scale's shape. This is a property of the material, not a rule anyone enforces.

**Questions**
-

**Ideas**
-

### 4. Colour tower

**What it is:** wooden cubes of different sizes, in a few colours, on a work rug. Each colour has
its own note, and anything built from them can be played.

**Roots:** it began as the Montessori pink tower (the senses: size). It is now also about colour,
pattern and music.

**Layers**
- Touch: tap any cube and its whole row or tower plays: each column from the left, bottom to top,
  about five cubes a second. Each cube glows in its colour as it sounds. A pale band on the rug
  marks the row while it plays, and a light in the sounding cube's colour runs along it. Tap again
  mid-play and the row starts over.
- Move: carry, stack, line up. A cube set down just short of another slides against it, so rows
  are easy to make; a thrown or knocked cube lands where it lands. Pull one from the middle of a
  tower and the ones above drop. Throw one at a tower.
- Make: a pattern in colour (red-blue-red-blue) is heard as a tune. Towers by size are there to
  find too. There are two orders to discover, and neither is the right one.

**Stages**
- Seed: 6 cubes in 2 colours, 3 of each; the smallest 0.42 of the largest.
- Sprout: 9 cubes in 3 colours, 3 of each; the smallest 0.26 of the largest.
- Bloom: 10 cubes in 5 colours, 2 of each; the smallest a tenth of the largest, as in
  Montessori's tower.

**A new set each time it comes out**
- What changes:
  - which colours, at Seed and Sprout (never the same ones twice running);
  - how the sizes are spaced;
  - how the colours fall across the sizes.
- What never changes:
  - each colour keeps its note;
  - every cube is a different size, each at least 8% smaller than the next;
  - colour and size never line up, so building by size plays nothing special.

**Sound:** a wooden knock in the colour's note (red C, yellow E, green G, blue A, purple the C
above). Bigger cubes knock fuller and thud on the rug. A lifted cube gives a light tick.

**Decisions so far**
1. First version, the pink tower: a cube's note went with its size, so a tower built largest-first
   played a scale. You asked for any order to work: "truly open ended".
2. Second version: the note went with height. The rug was the lowest note and each tier up the
   next, so every order was equal, but every cube on the rug sounded the same.
3. Third version, the colour tower: "each block is a different colour, which is a different tone;
   a pattern can be built and played." You chose:
   - colours that repeat, so patterns can be made;
   - graduated sizes kept, with the colours mixed across them;
   - a pattern that plays itself.
4. Fourth version, now: any tap plays the whole row, lit up as it plays. Size and colour are two
   things to discover, and the set of colours and sizes is new each time.

**Questions**
- Only the colour-to-note pairs survive from one set to the next. What do you expect him to carry
  over, and what would show you he has? For example, would he reach for a red cube to get "that"
  sound?
- A row plays at about five cubes a second. Is that slow enough for him to follow the light cube
  by cube?

**Ideas**
-

### 5. Pouring

**What it is:** pitchers of coloured water, empty glasses, a bowl to empty into, and a sponge, on a
tray.

**Roots:** Montessori practical life. Pouring is offered from about two, with a small pitcher, a
glass, a tray, and a sponge for what goes astray.

**Layers**
- Touch: tap a glass and it rings, lower the fuller it is.
- Move: carry a pitcher over a glass and it tilts and pours. An emptier pitcher has to tilt
  further, as a real one does.
- Make: colours mix the way paint does: blue and yellow make green. A glass poured past full
  overflows onto the tray, and the sponge wipes it up. A pitcher put back in its place fills up
  again.

**Stages**
- Seed: 1 colour (blue), 2 glasses.
- Sprout: 2 colours (yellow and blue), 3 glasses.
- Bloom: 3 colours (red as well), 4 glasses.

**Sound:**
- the pouring rises as the glass fills, the air column above the water getting shorter;
- glasses ring;
- drips, gulps, and the sponge's squeak.

**Decisions so far**
- Nothing is a task. There is no line to fill to, and no spill is a mistake: spilling is just what
  happens when you keep pouring, and wiping is its own small pleasure.
- A stream close to a glass is guided in, so a small hand does not have to be exact.

**Questions**
-

**Ideas**
-

### 6. Easel

**What it is:** watercolour on textured paper, with the Montessori metal insets to paint through.

**Roots:** art, and the metal insets, which prepare the hand for writing.

**Layers**
- Touch: paint with a finger, or several. Touch a pot to change colour.
- Move: lay an inset frame on the paper and paint through it; slide it about; tap it in the tray to
  lift it off. A fresh sheet comes from the stack in the corner.
- Make: shapes built from shapes. Colours mix on the paper as watercolour does: yellow over blue
  makes green, and a slow stroke pools darker. Scribbling across a frame leaves a clean shape
  behind.

**Stages**
- Seed: 3 paints (red, yellow, blue), a broad brush, no insets.
- Sprout: 6 paints (adding green, purple and brown); 4 insets (circle, square, triangle,
  quatrefoil).
- Bloom: 6 paints; 8 insets (adding ellipse, curved triangle, pentagon, trapezoid); a finer
  brush.

**Sound:** the brush on paper follows the finger. Each pot sounds its colour's note when chosen,
the same notes as the colour tower. The frames latch and lift, and the paper rustles.

**Decisions so far**
- The painting stays on the easel while the playroom is open, so a trip to the shelf doesn't throw
  it away.

**Questions**
-

**Ideas**
- A drying line, to keep the last few paintings (not yet built).

### 7. Sandpaper letters

**What it is:** a box of lowercase letters, each on its own board, to trace with a finger.

**Roots:** the Montessori sandpaper letters. Blue boards for vowels, pink for consonants. The
child traces the letter in the direction it is written, and the material gives the feedback: the
sand is rough and the board is smooth.

**Layers**
- Touch: choose a board from the box; trace it.
- Move: a guide's finger shows how each letter is written, once when it opens, and again from the
  two-finger button. Arrows go to the next board.
- Make: the tracing itself. The sand darkens a little where a finger has passed.

**Stages:** none. The full box is out at every stage.

**Sound:** a soft sandy scratch on the sand, following the finger's speed. The smooth board is
silent, so a finger that wanders off the letter knows it at once.

**Decisions so far**
- Silent: no letter is named or sounded aloud. Montessori introduces letters by their sound, and a
  synthesised voice would say the name. Purely visual for now.
- Nothing is checked or scored.

**Questions**
-

**Ideas**
- Stages for the letters, as a Montessori guide offers two or three contrasting letters at a time:
  for example, a few letters at Seed, perhaps the ones in his name. Not discussed yet.
- The movable alphabet, the next step after the sandpaper letters, once he is building words (not
  yet built).

### 8. Sandpaper numerals

**What it is:** the numerals 0 to 9 to trace, and a bowl of counters.

**Roots:** the Montessori sandpaper numerals (green boards), and cards and counters.

**Layers**
- Touch and move: as the letters, with the same guide's finger and arrows.
- Make: the bowl lays out as many counters as the numeral shows, in pairs as in Montessori's
  cards and counters. Each one sounds the next note up as it lands.

**Stages:** none. All ten numerals are out at every stage.

**Sound:** the sand under the finger, as on the letters, and a rising marimba note per counter.

**Decisions so far**
- Silent, as the letters: no numeral is spoken.
- Quantity is shown concretely, next to the symbol, never asked about.

**Questions**
-

**Ideas**
-

---

## Not built yet

- **A garden:** seeds, a watering can, flowers that open with a chime. The shelf's natural ninth
  tray, and the bud's own story.
- **A drying line** for the easel (see the easel).
- **The movable alphabet** (see the letters).

## Open across the playroom

- **Spotting lost interest:** no method chosen yet ("not sure yet"). The playroom will not record
  anything to help, by choice.
- **The real iPad:** the speaker mix and the frame rate need checking on the iPad itself.
- **Publishing:** merging the branch into `main` publishes the playroom at the address above. On
  the iPad: open it in Safari, then Share, then Add to Home Screen.

## Where things are

- `playroom/`: the playroom itself. One file per game in `playroom/js/toys/`, and the colour
  tower's sets in `cubes.js`.
- `docs/PLAYROOM.md`: how it is built, why, and how it is tested.
- `docs/PLAYROOM-GAMES.md`: this file.
