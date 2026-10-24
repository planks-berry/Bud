# Playroom: summary and game notes

A working document: where the playroom stands, and one section per game to edit as the games are
revised. The technical side (the old iPad, the audio engine, the tests) is in
[PLAYROOM.md](PLAYROOM.md). This file is about what each game is and why. The code calls the games
"toys".

**Status, 24 October 2026.**
- **Built:** thirteen games, tested in two simulated iPad browsers (one with everything Safari 12
  lacks removed). The newest are phase 1 of the proposal for new games: Bird Song, a new game; the
  shy fish, in the pond; and hello and goodnight, the playroom's way in and out. Each has a switch
  in the grown-ups' corner, which can now also set the order of the shelf. Since then: a goodnight
  timer a grown-up locks with a passcode, shown as a band round the edge of every screen; a choice
  between toys that fall asleep by themselves and toys he tucks in; and in Bird Song, the turn
  passes to the bird when he taps it, and the bird bids for its turn, standing tall and flapping,
  when he plays on.
- **Where:** live at https://planks-berry.github.io/Bud/playroom/, published from `main`. Work
  continues on branch `claude/montessori-playroom`.
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
  the shelf opens and says hello. It also starts the sound, which iOS allows only after a touch.
- **The shelf.** Thirteen games on a low wooden shelf, one to a tray, in rows. They are ordered
  simple to complex, left to right and top to bottom, ending with the builders': the dig, the
  crane, the farm and the building site. A new game joins at the end, so the trays he knows keep
  their order; the grown-ups' corner can move any game along the shelf. There are no words
  anywhere: each tray is a picture of its game. Touching a tray opens the game, and the house
  button in the corner puts it back.
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
    two), and where: arrows move a game earlier or later, and one press brings back the
    playroom's own order. A new game is marked new;
  - new things: a switch for each new part of the playroom (the hello song, the goodnight moon,
    the shy fish), all on to begin with;
  - goodnight: whether the toys fall asleep by themselves or wait for him to tuck each one in,
    and the goodnight timer, 10, 15, 30 or 60 minutes, locked with a passcode;
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
- **Colours have notes.** Red is C, yellow E, green G, blue A, purple the C above. The colour beats,
  the crane, the building site, the turntable's pads and Bird Song's flowers use the same pairs.

## Hello and goodnight

The playroom opens and closes the same way every day, the way Mister Rogers began and ended every
programme. Each has a switch in the grown-ups' corner, on to begin with.

- **Hello.** When the bud opens, the trays wake one by one, each with a marimba note, climbing the
  scale. A tray chosen before the end wakes them all.
- **Goodnight.** The picture on the shelf's wall is a window: the sun in it, and a moon when
  goodnight is on. Tap the moon and dusk falls, an owl hoots, and the toys fall asleep one by one
  from the last tray, each to the next note of a lullaby; a tap on a tray tucks it in at once. When
  the last is asleep the lullaby ends, and the playroom closes to its bud, as it opened.
- **Tucked in, or by themselves.** A grown-up chooses in the corner. By themselves, the toys fall
  asleep one by one as above. Tucked in, each toy stays awake until he taps it, and the night
  waits for him: the shelf is still, and now and then a toy still awake hops, to show where to
  tap.
- **The goodnight timer.** A grown-up chooses 10, 15, 30 or 60 minutes in the corner and locks it
  with a four-number passcode (chosen twice the first time; forgotten, it is cleared by typing four
  numbers the keypad shows, which a three-year-old cannot read). While it runs, a thin band round
  the edge of every screen, the bud, the shelf and every game, empties clockwise from the top like
  a clock's hand, from leaf green through butter yellow to rose, and the sun in the shelf's window
  sets. When it has gone, the whole band turns night blue and goodnight begins: on the shelf at
  once; in a game, the house button shows the moon, and a minute later the game puts itself away
  and the night comes. The timer survives the playroom being reopened, and stopping or changing it
  takes the passcode. It works whether or not the goodnight moon is switched on.

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

**The shy fish** (a switch in the grown-ups' corner, on to begin with): one more fish, lilac with
big eyes, lives under a lily pad and peeks out from under its rim, and sometimes hides right under.
A finger held still in the water gives it courage a little at a time: it peeks toward the finger,
comes out a step at a time, and nibbles. A finger that moves, a splash, or a touch on its pad sends
it under, never sulking, and it tries again as soon as the finger is still. Once it has nibbled it
trusts him, and comes in half the time.

**Stages**
- Seed: 3 fish, 2 lily pads. The shy fish sets out after 2 seconds and nibbles at about 4½.
- Sprout: 4 fish, 3 lily pads. The shy fish comes in three steps, at 1, 2½ and 4 seconds, and
  nibbles at about 5½.
- Bloom: 5 fish, 4 lily pads. A second shy fish, under another pad, follows once the first has
  dared, more slowly.

**Sound:**
- water drops, from the G above middle C up to an E nearly two octaves higher, by position;
- the water swirling under a moving finger, and lapping;
- bubbles, a gulp when a fish eats, and a chime from the lotus.

**Decisions so far**
- The fish need nothing from the child to be content. Feeding them is something to do, never
  something owed.
- The shy fish is patience met by a friend who is shy: Mister Rogers treated shyness as one more
  feeling, to be waited for kindly. With the shy fish off, the pond is exactly as it was; with it
  on, the other fish and the pads are where they always are.
- Its times are measured to the nibble, not to when it sets out: the proposal's 1, 3 and 5 seconds
  plus the swim put the first nibble 7 to 8 seconds away, too long at Seed.

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

### 4. Colour beats (was the colour tower)

**What it is:** the colour tower's cubes on a low wooden shelf of cubbies that plays itself. Each
column of cubbies is a beat of a short loop; each row is a sound. A light runs along the shelf,
column by column, round and round, with a wooden ball rolling beneath it, and every cube it reaches
sounds. The colours are notes, a higher row a higher note; along the bottom, plain wooden cubes are
a drum, a clap and a shaker. What a column holds sounds together, so a column is a chord and a row
is a tune or a rhythm.

**Roots:** it began as the Montessori pink tower (the senses: size), became the colour tower
(colour, pattern and music), and is now a step sequencer, the simplest kind of drum machine: a grid
of steps that a loop plays in turn.

**Layers**
- Touch: tap an empty cubby and its cube drops in, sounding; tap a cube and it comes out. The loop
  is already running when the shelf comes out, with a heartbeat on the drum, so the first cube put
  in is heard again every time the light comes round.
- Move: draw with a finger. A stroke begun on an empty cubby fills every cubby it crosses; one begun
  on a cube empties them. Hold the ball, or anywhere along the board it runs on, and the light goes
  where the finger takes it, playing each column it reaches; let go, and the loop carries on from
  there. When the loop goes round, the ball hops back over the front of the shelf to the start.
- Make: a loop of tune and beat, heard every time round and changed a cube at a time: a line of one
  colour, a staircase that climbs the scale, a chord, a rhythm on the drum and shaker under a tune.

**Stages**
- Seed: 4 columns, a column every 0.46 seconds; 2 colours and a drum.
- Sprout: 8 columns, a column every 0.36 seconds; 3 colours, a drum and a shaker.
- Bloom: 8 columns, a column every 0.3 seconds; all 5 colours, a drum, a clap and a shaker.

**A new set each time it comes out**
- At Seed and Sprout the colours change, never the same ones twice running; at Bloom all five are
  out.
- What never changes: each colour keeps its note, the rows run from the drum at the bottom to the
  highest note at the top, and the shelf starts with the same heartbeat.

**Sound:** a wooden knock in the colour's note (red C, yellow E, green G, blue A, purple the C
above), as before. The beats are new and as plain as a small band's: a soft hand drum tuned to the
C below middle C, a clap and an egg shaker, each short and each carrying its weight where an iPad's
speakers can give it. A cube taken out gives a light tick. The notes in one column share their
loudness, so a chord of five is fuller than one note, not five times louder. The loop keeps time by
the sound's own clock: each column is booked a moment ahead, to the sample, so the beat stays even
when the iPad drops a frame.

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
4. Fourth version: any tap played the whole row, lit up as it played. Size and colour were two
   things to discover, and the set of colours and sizes was new each time.
5. Fifth version, now: "Change the block stacking game for a simple step sequencer style music and
   beat creator. Keep the main theme, but something with more creative pattern ability while
   staying with simple sounds."
   - Kept: the cubes, each colour's note, the wooden knock, the work rug, cubes that glow as they
     sound, and new colours each outing.
   - Changed: the cubes sit in a grid instead of standing free, so time runs left to right and
     pitch bottom to top, and the loop plays by itself, round and round. Patterns can now have
     rests, chords and a beat under them, and a pattern is heard many times while it is changed.
   - The graded sizes have gone: a grid wants cubes of one size, and size never changed the note.
   - Beats are wooden cubes with a mark burnt into the face: a drum's skin, a clap's burst, a
     shaker's seeds. They are plain wood so that colour still means only a note.
   - A tap puts a cube in or takes it out, the way a step sequencer works; a stroke fills or
     empties a line, so a long pattern is one movement.
   - The ball under the shelf gives the loop something to watch travelling, and a way to play the
     shelf by hand at any speed.
   - Left untouched for three minutes, the loop plays to its end and rests, so a shelf left open
     does not play all evening; any touch starts it again.

**Questions**
- Does he follow the light along the shelf, or listen without watching it? If he watches, a shelf
  that is longer (16 columns, two rows of eight) is the next step; if he listens, more kinds of
  sound in the same eight columns.
- Should the shelf come out empty instead of with the heartbeat?
-

**Ideas**
- A glass rings lower as it fills, and the pouring sound rises, as real water does.
- Sand in the dig is never made or lost: what the bucket takes is what the ground gives up, and
  every grain poured lands somewhere. It heaps and slides to its own slope, as sand does.
- A part the crane sets down clanks a step of the scale higher for every half-block it stands above
  the ground, so a building going up rings up the scale.
- A speed for the loop, a tortoise and a hare to slide between, at Bloom.

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

### 6. Turntable (was the easel)

**What it is:** a record player to scratch, after a DJ's deck, with pads beside it. The record
waits on the platter until the button starts it; then it turns, playing a short loop. A hand on
it holds it, and the music stops; moved to and fro, the record takes the music with it, backwards
and forwards, faster and higher, slower and lower: a scratch. The pads toot, boom and moo over the
music, and one scratches the record by itself.

**Roots:** scratching, which DJs in the Bronx made into an instrument in the 1970s (it is usually
credited to Grand Wizzard Theodore), and the pads a DJ plays beside the decks. From Montessori, the
isolation of one quality, as in the sound boxes and the bells: here the one thing a hand changes
is the record's speed, and the pitch and direction of the music follow it. And a real machine to
work: a button, records kept in their own sleeves, a crate to put them back in.

**Layers**
- Touch: tap the button and the record spins up and plays; tap it again and it winds down to a
  stop, the music sliding down with it. Tap a pad for its sound. The scratch pad scratches the
  record for him, back and forth twice in a beat, and the music carries on in time after it.
- Move: hold the record and move it to and fro. The music goes the way the record goes, at the
  record's speed, so a fast rub is high and a slow one low. Let go and it spins back up to speed;
  flicked, it races and settles. At Bloom, slide the speed from just over half to one and a half
  times; near the middle the slider settles on the record's own speed.
- Make: a scratch over the loop, timed to the beat; a beat of his own on the pads over the
  record; a record chosen from the crate.

**Stages**
- Seed: one record (the tune), the button, a horn and a boom.
- Sprout: three records in a crate (the tune, the beat, the animals), and a cow and a scratch pad.
- Bloom: a clap and a shaker as well, and a slider for the speed.

**The pads:** a pad with a note wears that note's colour, as everywhere in the playroom; a beat,
which has no note, is plain wood with its cube's mark from the colour beats.
- The horn (yellow): a toot-toot in yellow's note, E.
- The boom (the drum's wood, its skin mark): the drum, with a low thud under it.
- The cow (green): a moo in green's note, G, an octave down.
- The scratch pad (the platter's grey, a record with arrows): scratches the record, by itself.
- The clap and the shaker (their wood and marks): a clap, and a shake twice.

**The records:** two bars at 96 beats a minute, five seconds round, pressed from the playroom's own
sounds the first time each is played. What is on them is short and struck, as a drum is, because a
scratch drags a struck sound to and fro cleanly, where a long held note slides about.
- The tune (red, a note on its label): a tune on wooden knocks, the colour beats' own notes, over
  a light drum, clap and shaker.
- The beat (blue, a drum): drum, clap and shaker, with a wooden bass line.
- The animals (green, a cow): the beat with a moo, a cluck, two quacks and an oink.

Every note is on the playroom's scale, so a record at its own speed is in tune with every other
game.

**Sound:** the record plays wherever it is turned to: forwards or backwards, at any speed, the
pitch following the speed as it does on vinyl. A record held still is silent. The record follows
a finger as if it had weight, and the sound glides to each new speed rather than stepping, so a
scratch through a held note slides instead of buzzing. Eight lights round the platter, one for
each beat of the loop, light in turn as the needle passes them, whichever way the record is going.
The button clicks, and the record takes about two and a half seconds to wind down to silence. A
record going back to the crate whooshes, the next whooshes onto the platter, and the arm comes
down with a tick.

**Decisions so far**
1. First version, the easel: watercolour on textured paper, with the Montessori metal insets to
   paint through, and a pot for each colour sounding its note.
2. "Remove the drawing game. In its place, make a simple dj scratching game."
   - Where the record is turned to is where the music is. The record and the music are one, so a
     sound found on the record can be found again by turning back to it, as on a real record.
   - Colours keep their meaning: a pad with a note wears its colour, a beat is plain wood. The
     records are in the playroom's colours, but a record is a loop, not a note.
   - Left untouched for three minutes, the turntable winds down and rests, as the colour beats do.
   - The metal insets went with the easel. The sandpaper letters and numerals still prepare the
     hand for writing.
3. Now: "He currently taps more than scratches. The scratches on the blue record sound good, the
   others are very robotic and odd. More pads would be good." And: "Setting the record to open
   while stopped and he has to press play is the best."
   - The robot was the speed changing in steps. The first turntable set the record's speed once a
     frame, from touches that do not come evenly, and a held note heard those steps as a buzz,
     about as loud as the note itself; drums hide them, which is why the blue record was fine.
     Now the record follows the finger as if it had weight, and the sound glides to each new
     speed: the buzz is 11 to 14 dB under the note, where before it was level with it or louder.
     The price is a little lag: the sound follows a finger about 70 ms behind, where before it
     was about 40.
   - And the records are now made the way the blue one is, of short struck sounds: the tune on
     wooden knocks instead of the marimba, and the sheep's long baa swapped for a hen's cluck.
   - Pads: 2 at Seed, 4 at Sprout, 6 at Bloom. The scratch pad joins tapping and scratching: a tap
     makes the record scratch, so he hears and sees what a hand on the record can do.
   - The record opens stopped, and the button is the first thing to press: play, on green.

**Questions**
- Does he watch the record when the scratch pad scratches it, and then try it with his hand?
-

**Ideas**
- A second turntable and a crossfader, if he takes to scratching.
- A blank record that takes the loop he has built in the colour beats, to scratch while the
  playroom is open.

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

**What it is:** a little farm seen from a corner and a little above, like a model on a table: an
island of tiles, each a small block of earth with grass on top, and a tray of tiles and farm pieces
to build with: grass, paths, fields, a pond, streams, buildings, animals and a tractor.

**Roots:** Pok Pok's builder, not a Montessori material. It takes the builder's way of playing:
tiles that make up the world, pieces that snap to them, join their neighbours, come alive when
touched, and keep a few secrets.

**Layers**
- Touch: tap anything. Every piece answers, and tapped grass grows a flower.
- Move: the table around the island is marked out in tiles. A tile of grass put down there adds
  land, and the island grows; a path, a field, a pond or a stream put down on a tile changes it to
  that, and put down on the table brings its own land. A piece put down on a tile stands there.
  Drag a piece to move it; dropped on another piece it swaps places, and dropped on the tray it
  goes back. Grass put down on a tile makes it bare grass again.
- Make: a farm that joins up, as big as the table: paths for the tractor, streams carrying a pond's
  water to the fields, a pond big enough for ducks. The sun in the corner turns day to night and
  back. The broom beside it, held a moment, sweeps the table empty again: every piece flies back to
  the tray, a line at a time, and the land goes with it.

**Stages**
- Seed: a table of 5 × 4 tiles, 7 kinds of piece: path, field, pond, stream, tree, cow, tractor.
- Sprout: 6 × 5, 11 kinds: adds the fence, barn, hen house and sheep.
- Bloom: 7 × 5, all 14 kinds: adds the farmhouse, windmill and pig.

Each stage starts as an empty table, and the broom brings it back to that whenever it is wanted.

**Every piece: how it connects, what a tap does, what it hides**

Hidden things are certain, not rare: each shows itself the first time it can, every time the farm
comes out, and half the time or more after that. The cat, the snail and the frog come on their own
within seconds.

| Piece | Connects | A tap | Hidden |
|---|---|---|---|
| Path | Joins the paths beside it; the tractor drives along them | A puff of dust and a crunch | A mouse darts out and runs along the path |
| Field | Joins the fields beside it, and they grow as one; beside a pond or a running stream it grows on its own; the windmill, the farmer and the tractor all work it | Grows a stage (seeds, sprouts, leaves, ripe), a rising ripple of notes across the field. Ripe, it is harvested, and the next crop is sown: carrots, pumpkins, sunflowers, cabbages | A rabbit among the carrots; a giant pumpkin, which rolls away at harvest |
| Pond | Joins the ponds beside it; waters fields beside it; a cow beside it drinks, a pig beside it gets muddy; feeds the streams beside it | A ripple and a water drop, pitched by where it lands; the ducks swim over | A duck and two ducklings arrive when it grows to three tiles; a frog on a lily pad within seconds, who leaps off when touched; fireflies at night |
| Stream | Joins the streams beside it. Beside a pond, the pond's water runs into it and on along it, a tile at a time, a note higher each tile, with a splash at the end; ripples keep running downstream. A field the water gets to grows; a cow it gets to drinks; a pig gets muddy. Cut off from its pond, it runs dry, and picked up and put down again, the water runs into it again | With water in it, a leaf floats down to the end, a note a tile, and its water goes to whatever is there; dry, a crunch | – |
| Fence | Joins the fences beside it | A bird lands on the post, or flies off | A snail on the rail within seconds, which hides in its shell when touched; at night, a sheep beside it jumps it |
| Tree | Trees side by side are an orchard: shake one and its neighbours rustle | It shakes, and apples fall, a note each; they grow back | By day, a bird bursts out and flies to another tree |
| Barn | At night the animals beside it walk in to sleep, and out again in the morning | The doors swing open and a cow looks out and moos | An owl in the hayloft at night, who hoots when touched; a cat on the roof within seconds by day, who meows and jumps down |
| Farmhouse | Fields beside it get watered | The door opens, the farmer waves, the chimney puffs. Beside fields, the farmer walks out with a watering can and each one grows | A cat in the window within seconds by day; at night, a lullaby, and the lights go out |
| Windmill | Fields around it grow a stage when it spins | The sails spin up and slowly wind down | By day, a bird rides a sail; a lit window at night |
| Hen house | Beside a field, the hens go and peck at it | Two hens hop out, cluck, peck, and go back in | An egg is left behind, which hatches a chick when touched; a rooster crows from the roof at dawn |
| Cow | Cows side by side answer each other, a step higher each; beside a pond or a running stream, it drinks | A moo | At night, it jumps over the moon |
| Sheep | Sheep side by side answer each other | A baa and a hop | At night, beside a fence, it jumps it, each jump a note higher, until it falls asleep |
| Pig | Pigs side by side answer each other; beside a pond or a running stream, it is muddy | An oink and a wiggle; muddy, it shakes the mud off everywhere | It rolls over; at night, a snore |
| Tractor | Drives the whole path it stands beside, harvests ripe fields along the way, toots at the barn, and tips out its trailer back home | A toot, and off it goes; with no path, it putters on the spot | The farm dog runs behind it |
| Grass | – | A flower | By day, a butterfly |

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
- A fresh farm every time it comes off the shelf: the building is the game, so nothing is kept,
  not even while the playroom is open. ("It should not be kept. He can build fresh.") The island
  starts small again too.
- Seen at an angle, like Pok Pok's city: an isometric island of tiles that can be added and
  changed, not only pieces moved around. Buildings are drawn as boxes with walls and roofs;
  animals, trees and the tractor stay standing cut-outs. (Asked for: "more 3d in design, an
  isometric layout with tiles that can be changed and added, not just moved around.")
- Hidden things are certain rather than rare, as above. ("They should be more certain.")
- Water that travels somewhere: the stream, because watching water run along to something and
  arrive is what holds him. ("Water travelling somewhere is the interest.")
- Nothing is lost behind anything: a piece behind the barn, the farmhouse, the windmill, a tree or
  the hen house shows through it as a pale silhouette, and a touch on the silhouette takes it, as on
  the building site. ("He looks around for it.")
- A blank start, and a way back to one: "For both the farm and site games, they should start blank.
  And also add a 'reset' button that wipes the slate clean to a blank starting point." The table
  comes out empty, and anything put down on it brings its own land, so the first piece is where
  the island begins. The reset is a broom beside the sun. It sweeps only when held a moment, its
  ring filling, so a brush of the hand cannot clear the table by accident; a tap just rustles it.
  After the sweep the farm begins again exactly as it comes off the shelf, its surprises new.
- No Montessori parallel, by choice.

**Questions**
-

**Ideas**
-

---

### 10. Dig

**What it is:** a sandpit seen from the side, the way a child watches a real one through the site
fence, and a digger whose bucket goes wherever a finger goes.

**Roots:** sand and water play, and the practical-life idea of real work done with a real tool. The
finger is the bucket, so there are no levers to learn: the arm folds and reaches by itself, the
digger crawls along on its tracks when the finger goes further than the arm can, and turns round
when it goes behind.

**Layers**
- Touch: tap the sand and a little of it jumps up and patters down. Tap a machine and it answers:
  the digger's horn, the truck's beep, the bulldozer's blade going up or down.
- Move: the bucket follows a finger. Down into the sand it fills; lifted, it holds what it took;
  let go, it tips and pours where it is. A tap in the air sends the arm there. Drag the truck and
  it drives over the sand, riding its shape; drag the bulldozer and its blade pushes.
- Make: the ground itself: heaps, holes, ramps, a truck-load tipped out somewhere new. At Bloom a
  darker earth lies under the sand, so a heap built from both is striped.

**Stages**
- Seed: a digger and a heap of sand, with a longer reach. Nothing is buried.
- Sprout: adds a dump truck to fill, drive and tip, and three things buried.
- Bloom: adds a bulldozer, earth under the sand, and four things buried.

**Sand behaves like sand:** it heaps, and slides until it rests at its own slope. None of it is ever
made or lost: what the bucket takes is what it carries, and what it pours is what lands.

**Buried things:** a bone, a shell, a worm, a mole, a fossil, a toy car. The first proper bite of the
bucket always finds one, every time the dig comes out; after that it is luck. A find hops out of
its hole with two notes of its own. Tapped, the bone knocks, the shell and the fossil chime, the
worm squeaks (and wriggles away after a while), the mole squeaks and blinks before ducking back
down its own hole, and the car beeps and rolls. Sand poured over a find buries it again.

**Sound:**
- the arm's hydraulic motor, a continuous voice that sings while the arm moves and is quiet when it
  stops;
- the bucket's crunch as it bites, a hiss as it pours, a rumble as the truck tips;
- the digger's horn, the truck's beeps (and reversing beeps), the bulldozer's engine.

**Decisions so far**
- The bucket digs only while a finger drives it: left resting in the sand, it waits.
- The digger is a backhoe, like the site's: its bucket faces the cab, digs teeth down, curls to
  carry and opens out to pour, the arm drawing back as it opens so the load lands where the finger
  let it go. ("All of the excavator sprites have the bucket backwards.")
- A fresh sandpit every time it comes off the shelf, and the first find certain, as on the farm.
- No night here, unlike the crane, the farm and the site.

**Questions**
-

**Ideas**
-

---

### 11. Crane

**What it is:** a tower crane, a pile of building parts, open ground to build on, and trucks that
come to be loaded.

**Roots:** the colour tower (now the colour beats), with a tool in between. A child of three can
carry a block with a finger; lifting it with a crane is the same work done at a distance, through a
hook that swings.

**Layers**
- Touch: tap a part for its note, the ground at a building's foot to play the whole building from
  the bottom up (each part lit as it sounds), the cab for the horn, the hook to set it swinging.
  The sun in the corner turns day to night.
- Move: drag the hook. The trolley runs along the jib after the finger and the cable winds to its
  height. Lowered onto a part, the hook takes it; let go, the part drops and settles on whatever is
  under it. A part can also be carried by hand, and the crane follows it.
- Make: a building of any shape. Nothing is correct: a building is whatever stands. Or a truck's
  load: work to do, for when building is not what he wants.

**Stages**
- Seed: four big blocks, to lift or carry. Each truck comes for one.
- Sprout: eight parts: blocks, beams and windows. A truck comes for one or two.
- Bloom: ten parts, adding an arch and a roof, and a wrecking ball. A truck comes for one or two.

**The trucks:** a flatbed truck in one of the parts' colours backs into the bay at the far end of
the site, beeping as it reverses, and waits. The parts it has come for are marked out on its deck,
their shapes in its colour with a dashed edge, so a red truck with a block and a beam marked out
wants a red block and a red beam. Any part of that shape and colour will do, from the pile or from
a building; it asks first for parts that can be picked up as they lie.
- Lowered by the hook or carried by hand onto the deck, a part it came for goes into its place,
  with the part's own note. A place lights up while a part that fits it is over the deck.
- Any other part lands on the deck, the truck answers with two low notes, and the part hops back to
  the pile: the deck checks the work, as Montessori materials do, and nothing is wrong for long.
- Loaded, the driver waves, the truck toots twice and drives away with its load.
- Then the other crane, whose jib runs along the top of the sky over the pile, brings as many new
  parts in along it and lowers each onto the lowest place on the pallet: the same shapes as went
  away, in whichever of the stage's colours there are fewest of. So there are always as many parts
  to build with, and every colour stays.
- The next truck comes, never in the colour of the one before. A tap on a truck's cab: two toots
  and a wave.

**How parts stand:** parts snap to a grid of half-blocks as they land, so a stack stands and a row
is a row, and there is no physics to fight. A part rests on the highest thing beneath it; take
something from under it and it drops.

**What lives in a building:** whatever stands comes alive. Each shows itself the first time it can,
every time the crane comes out, and often after that.

| Who | Where | A tap |
|---|---|---|
| A bird | Comes to nest on the very top of a building at least two parts tall, and leaves if it is built over or taken down | A chirp |
| A cat | Moves into a window | A meow and a stretch |
| Plants | Appear on open ledges above the ground, up to three | – |
| A worker | Walks out along a beam just landed, and waves | Waves again |

**Bloom's wrecking ball:** hung on the hook and swung into a building, it knocks over what it hits
and everything resting on that. The fallen parts pick themselves up and hop home to the pile, so
knocking down never leaves a mess.

**Night:** the windows light, and the crane's light at the top of the jib shines.

**Sound:**
- each part sounds its colour's note, the same note it has as a cube in the colour beats;
- landing, a part clanks a step of the scale higher for every half-block it stands above the
  ground, so a building going up rings up the scale;
- the winch, a continuous voice that sings while the hook moves, a step higher the shorter the
  cable; a latch and a rattle as the hook takes a part, a hiss as it lets go;
- the cab's two-note horn, and chimes at dusk and dawn.

**Decisions so far**
- The hook swings for real, but nothing it carries can be dropped wrong: wherever a part is let
  go, it lands square.
- Carrying by hand is always allowed, for a child who does not get on with the hook.
- A fresh pile every time it comes off the shelf; the bird, the cat, the plants and the worker are
  certain the first time.
- The trucks are the crane's task, a reason to lift: "A colored truck should show up and get
  loaded. As the pieces are loaded and the trucks leave, another crane drops off more on the edge
  to use." A truck takes only the parts of its colour; a wrong one hops home rather than staying
  wrong. A truck waits as long as it takes, and building goes on around it. ("A refused part stays
  in game and only the matching ones work.")

**Questions**
-

**Ideas**
-

---

### 12. Building site

**What it is:** the farm's board, as a building site: an island of earth tiles seen from a corner,
and a tray of earth, roads, plots and machines to build with, where the machines work in chains.

**Roots:** Pok Pok's builder, like the farm, which it shares its board with: tiles that make up the
world, pieces that snap to them, join their neighbours, come alive when touched, and keep a few
secrets.

**Layers**
- Touch: tap anything. Every piece answers, whatever stands beside it.
- Move: as on the farm. A tile of earth put down on the table adds land; a road or a plot put down
  on a tile changes it; a piece put down on a tile stands there. Drag a piece to move it; dropped
  on another piece it swaps places, and dropped on the tray it goes back. The broom, held a moment,
  sweeps the table empty again.
- Make: a site that works. A digger beside a marked-out plot digs it out and loads the earth into a
  truck beside it; the truck drives the road and tips the earth onto a pile; a mixer beside the
  hole fills it with concrete, which sets by itself; a crane beside the foundation lifts a building
  onto it, a floor at a time, each floor a note higher and the next of the playroom's colours,
  until it is topped out with a little tree. None of it has to happen in order, and none of it is a
  goal.

**Stages**
- Seed: a table of 5 × 4 tiles, 6 kinds of piece: road, plot, digger, truck, mixer, crane.
  Buildings go up to 3 floors.
- Sprout: 6 × 5, 9 kinds: adds the pile, the cones and the foreman's hut. Up to 4 floors.
- Bloom: 7 × 5, all 12 kinds: adds the roller, the bulldozer and the work lamp. Up to 4 floors, as
  at Sprout.

Each stage starts as an empty table, as the farm does, and the broom brings it back to that.

**Every piece: how it connects, what a tap does, what it hides**

Hidden things are certain, not rare: each shows itself the first time it can, every time the site
comes out, and half the time or more after that.

| Piece | Connects | A tap | Hidden |
|---|---|---|---|
| Road | Joins the roads beside it; the trucks and the roller drive along them | A crunch of grit | Pigeons come down to peck, and fly off |
| Plot | Joins the plots beside it at the same step, so two buildings of a height side by side are one wide building | Marked out: the string between the pegs is plucked. Dug: a crunch. Wet: a hand pressed in leaves its print. Set: a clank. A building: it plays its floors from the ground up, each lit as it sounds | A bone at the bottom of a hole; the first time a building plays, it turns out to be lived in, with plants at the windows and a meow |
| Digger | Digs out the marked plot beside it (with none, it scoops from a pile), and loads the earth into a truck or onto a pile beside it | It digs | A bird perches on it, by day |
| Truck | Drives the road beside it and tips its load onto a pile beside the road | Two beeps, and off it goes, beeping as it reverses; with nowhere to go, it tips where it stands | The site dog runs behind it |
| Mixer | Fills the dug hole beside it with concrete, which sets by itself into a foundation | The drum turns and sloshes | A cat walks across the wet concrete, leaving paw prints |
| Crane | Lifts a floor onto the foundation or building beside it; the mast climbs when the building needs it; at the top floor, a little tree | It lifts; with nothing to build on, it swings round and back | A bird lands on the end of the jib, by day |
| Pile | Takes what the trucks and the digger tip on it, and grows | It slides, with a rumble | A worm pokes out |
| Cones | Join the cones beside them | A line of them wobbles, one after another, climbing the scale | A hedgehog behind them |
| Foreman's hut | – | The door creaks, the foreman steps out and blows the whistle, and every machine on the site has a go, one after another, in the order a building's work goes | A radio playing a tune |
| Roller | Rolls the whole road beside it, leaving it fresh | A toot, and off it goes, its drum playing the scale; with no road, it putters on the spot | A cat rides on the roof |
| Bulldozer | Pushes the pile beside it down, or fills a hole back in | Blade down, and a push | A lost ball under the sand |
| Work lamp | – | On and off | At night it lights the ground around it, and moths come |
| Bare ground | – | A little dust | – |

**Night:** the windows and the hut light, the machines' beacons turn, the work lamps light the
ground around them, and the stars come out. At dusk the foreman goes in; at dawn he comes out with
his whistle.

**Sound:**
- the machines' engines, beeps, rumbles and clanks, the mixer's slosh, and the foreman's whistle;
- each floor of a building is its colour's note, so a building plays a rising tune;
- the radio's tune, the roller's scale, the cones' climbing knocks.

**Decisions so far**
- The farm's board is shared, so the two builders' games play the same way: one piece to a tile,
  moved, swapped and put back alike, and an island that grows a tile at a time.
- In three dimensions: a building is stacked floors with windows on its walls, a dug plot is a
  real hole in the island, and the crane's jib swings round to face whichever building it works
  on, its mast climbing as the building rises.
- Buildings stop at four floors, at Bloom as at Sprout. ("Limit the building height to 4, so not
  blocking anything. Minimal navigation interactions are best for his stage.") Four floors still
  cover most of a small piece on the tile diagonally behind, so what a building or the hut hides
  shows through it as a pale silhouette, always, and a touch on the silhouette takes the hidden
  piece; the view does not turn, and there is nothing to do to see. ("He looks around for it.")
- An empty table every time it comes off the shelf, a broom to clear it again, and hidden things
  certain, as on the farm. ("For both the farm and site games, they should start blank.")
- The whistle lets one tap show the whole chain of work.

**Questions**
-

**Ideas**
-

### 13. Bird song

**What it is:** a bird on a branch, and bell flowers below it in the playroom's colours. The bird
sings a short tune, then raises a wing to its ear and waits. Whatever he plays on the flowers is
his answer: the bird waits for him to finish, sings his notes back in his own rhythm, and then
sings a new tune that begins on the note he ended with.

**Roots:** Ms Rachel's pause, with a hand to her ear; Toony the Loon in Thinkin' Things, who plays a
tune for the child to play back; Montessori's bells. And taking turns, which is hard at nearly
three: here the bird always waits for him, and he can learn to wait for the bird.

**Layers**
- Touch: tap a flower for its note; the colours keep their notes from every game. Tap the bird:
  once he has played, that hands it the turn; before, it sings its tune again.
- Move: run a finger along the flowers for a glide, and the bird glides it back.
- Make: a song of turns, his and the bird's.

**Stages**
- Seed: 3 flowers (red, yellow, green), tunes of 2 notes, growing to 3.
- Sprout: all 5 flowers, tunes of 3, growing to 4.
- Bloom: a second bird, who answers the first bird's tune before both listen, and both sing his
  notes back; the two take turns to lead. Tunes of 3, growing to 5.

**Sound:** the flowers ring as glockenspiel bells. The bird whistles a warbling note that scoops
up into its pitch, an octave above the flowers; the second bird sings at the flowers' own pitch. A
glide comes back as short notes, each sliding in from the one before. When the bird bids for its
turn, its wings beat with soft puffs of air, one on each downstroke.

**Decisions so far**
- Never wrong: whatever he plays is sung back, and nothing is marked. A tune grows by a note after
  three answered turns in a row, and never shrinks.
- The turn is shown, not told. While the bird sings, the flowers close a little and ring only
  softly, and the bird finishes its tune before it listens. When it is his turn they open with a
  ripple and the bird cups its ear.
- He hands the turn over by tapping the bird: a clear trade of turns, your call after the first
  version took 1.2 seconds of quiet as the end of his turn. When he pauses, rings spread from the
  bird and it hops, looking out at him, to ask for the tap.
- It does not wait for ever while he plays on: your call, after the second version waited as long
  as he played. After five seconds of his playing, it bids for its turn without a word: it stands
  up tall, chin up, and raises both wings over its back, two beats, then three, then four, with a
  soft flutter he can hear while he looks at the flowers. It bids again after every five more
  seconds of his playing. Each bid waits for a gap between his notes of a third of a second, so
  that the flap is the bird's own doing and not an answer to his tap; if he leaves none, it bids
  two seconds later anyway. The bids are for his playing only: his pauses already have the rings
  and the hop. It asks; it never takes: the turn passes only when he taps it.
- Quiet is fine: after 9 seconds the bird sings its tune again, or, if he has played, chirps to ask
  for its turn; twice, and then it tucks its head in and rests until a flower or the bird is
  touched. Woken by a tap, it still sings back what he played.
- The proposal's second bird was a part for a grown-up to play. Since you talk with him about what
  happens rather than taking a turn yourself, the second bird shows two birds taking turns instead.
- It joins the shelf at the end, so the trays he knows keep their order.

**Questions**
-

**Ideas**
-

---

## Not built yet

- **The rest of the proposal for new games**: phases 2 to 4, nine games and redesigns, in
  "Playroom proposal: twelve new games".
- **A garden:** seeds, a watering can, flowers that open with a chime, and the bud's own story.
  The farm's fields and watering farmer now cover some of it.
- **The movable alphabet** (see the letters).

## Open across the playroom

- **Spotting lost interest:** no method chosen yet ("not sure yet"). The playroom will not record
  anything to help, by choice.
- **The real iPad:** the speaker mix and the frame rate need checking on the iPad itself.
- **Publishing:** a push to `main` publishes the playroom at the address above; no other branch
  does. On the iPad: open it in Safari, then Share, then Add to Home Screen. Online, it fetches a
  new version by itself and changes over to it the next time it is opened or the screen wakes,
  never mid-play. The grown-ups' corner says which version the iPad is running.

## Where things are

- `playroom/`: the playroom itself. One file per game in `playroom/js/toys/`, with its drawings
  beside it (`farmart.js`, `digart.js`, `craneart.js`, `siteart.js`), the colour beats' cubes in
  `cubes.js`, Bird Song's tunes in `tunes.js`, the machines the dig and the site share in
  `machines.js`, and the board the farm and the site share in `board.js`. The shelf, with its hello
  and goodnight, is `playroom/js/shelf.js`.
- `docs/PLAYROOM.md`: how it is built, why, and how it is tested.
- `docs/PLAYROOM-GAMES.md`: this file.
