# Playroom: summary and game notes

A working document: where the playroom stands, and one section per game to edit as the games are
revised. The technical side (the old iPad, the audio engine, the tests) is in
[PLAYROOM.md](PLAYROOM.md). This file is about what each game is and why. The code calls the games
"toys".

**Status, 21 October 2026.**
- **Built:** nine games, tested in two simulated iPad browsers (one with everything Safari 12
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
- **The shelf.** Nine games on a low wooden shelf, one to a tray, in two rows. They are ordered
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

### 9. Farm

**What it is:** a board of grass tiles and a tray of farm pieces to build with: paths, fields, a
pond, buildings, animals and a tractor.

**Roots:** Pok Pok's builder, not a Montessori material. It takes the builder's way of playing:
pieces snap to tiles, join their neighbours, come alive when touched, and keep a few secrets.

**Layers**
- Touch: tap anything. Every piece answers, and tapped grass grows a flower.
- Move: drag a piece from the tray onto a tile. Drag one on the board to move it; dropped on
  another piece it swaps places, and dropped on the tray it goes back.
- Make: a farm that joins up: paths for the tractor, fields beside water, a pond big enough for
  ducks. The sun in the corner turns day to night and back.

**Stages**
- Seed: a 5 × 4 farm with 6 kinds of piece: path, field, pond, tree, cow, tractor.
- Sprout: a 6 × 5 farm with 10 kinds: adds the fence, barn, hen house and sheep.
- Bloom: a 7 × 5 farm with all 13 kinds: adds the farmhouse, windmill and pig.

Each stage starts as a small farm, so there is something to tap straight away. Everything in it
can be moved or put back.

**Every piece: how it connects, what a tap does, what it hides**

| Piece | Connects | A tap | Hidden |
|---|---|---|---|
| Path | Joins the paths beside it; the tractor drives along them | A puff of dust and a crunch | Sometimes a mouse darts out and runs along the path |
| Field | Joins the fields beside it, and they grow as one; beside a pond it grows on its own; the windmill, the farmer and the tractor all work it | Grows a stage (seeds, sprouts, leaves, ripe), a rising ripple of notes across the field. Ripe, it is harvested, and the next crop is sown: carrots, pumpkins, sunflowers, cabbages | A rabbit among the carrots; sometimes a giant pumpkin, which rolls away at harvest |
| Pond | Joins the ponds beside it; waters fields beside it; a cow beside it drinks, a pig beside it gets muddy | A ripple and a water drop, pitched by where it lands; the ducks swim over | A duck and two ducklings arrive when it grows to three tiles; a frog on a lily pad, who leaps off when touched; fireflies at night |
| Fence | Joins the fences beside it | A bird lands on the post, or flies off | A snail on the rail, which hides in its shell when touched; at night, a sheep beside it jumps it |
| Tree | Trees side by side are an orchard: shake one and its neighbours rustle | It shakes, and apples fall, a note each; they grow back | Sometimes a bird bursts out and flies to another tree |
| Barn | At night the animals beside it walk in to sleep, and out again in the morning | The doors swing open and a cow looks out and moos | An owl in the hayloft at night, who hoots when touched; a cat on the roof by day, who meows and jumps down |
| Farmhouse | Fields beside it get watered | The door opens, the farmer waves, the chimney puffs. Beside fields, the farmer walks out with a watering can and each one grows | A cat in the window by day; at night, a lullaby, and the lights go out |
| Windmill | Fields around it grow a stage when it spins | The sails spin up and slowly wind down | Sometimes a bird rides a sail; a lit window at night |
| Hen house | Beside a field, the hens go and peck at it | Two hens hop out, cluck, peck, and go back in | Sometimes an egg is left behind, which hatches a chick when touched; a rooster crows from the roof at dawn |
| Cow | Cows side by side answer each other, a step higher each; beside a pond, it drinks | A moo | At night, it jumps over the moon |
| Sheep | Sheep side by side answer each other | A baa and a hop | At night, beside a fence, it jumps it, each jump a note higher, until it falls asleep |
| Pig | Pigs side by side answer each other; beside a pond, it is muddy | An oink and a wiggle; muddy, it shakes the mud off everywhere | Sometimes it rolls over; at night, a snore |
| Tractor | Drives the whole path it stands beside, harvests ripe fields along the way, toots at the barn, and tips out its trailer back home | A toot, and off it goes; with no path, it putters on the spot | Sometimes the farm dog runs behind it |
| Grass | – | A flower | Sometimes a butterfly |

**Night:** the farm turns moonlit blue, the windows light, the animals sleep (the ones beside the
barn go inside), fireflies come out over the water, and the owl wakes. The moon brings the
morning, with a rooster if there is a hen house.

**Sound:**
- the animals are synthesised voices, pitched on the scale: the cow's moo is a C, the sheep's baa
  an A, and a herd answering climbs the scale;
- also the tractor's engine and horn, water drops, a marimba ripple as fields grow, and pops as
  they are harvested;
- a falling chord at dusk, and a rising one at dawn.

**Decisions so far**
- One piece to a tile. Dropped from the tray onto a piece, the new one takes the tile and the old
  one flies back to the tray. Moved onto a piece on the board, the two swap. Dropped off the board,
  a piece goes back where it was.
- The farm stays as it was built while the playroom is open, as a painting stays on the easel.
  Nothing is saved, so the playroom starts with a fresh farm each time it is opened.
- No Montessori parallel, by choice.

**Questions**
- Should his farm be kept from one day to the next? It is his work rather than a record of him, but
  it would be the first thing besides your settings that the playroom keeps.

**Ideas**
-

---

## Not built yet

- **A garden:** seeds, a watering can, flowers that open with a chime, and the bud's own story.
  The farm's fields and watering farmer now cover some of it.
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
