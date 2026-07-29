# Modelled device specification

The device modelled by Bud is the Sonicware deconstruct MINIMAL, an 11-track groovebox.

This document is written from the official user manual, `reference/MINIMAL_manual_en.pdf`
(Rev. 2, MDA-010-UM-02-EN, 118 pages). Page references are given as *(p. N)*. Where the manual
contradicts itself, the reading taken is recorded under [Manual discrepancies](#manual-discrepancies).

For what each 0–127 parameter value means in real units, see [PARAMETERS.md](PARAMETERS.md).

## Tracks

Eleven tracks: **6 drum, 4 sample, 1 bass synth** (p. 16). A track pairs a sound with a sequence.

| # | Type | Default bank | LED colour |
|---|---|---|---|
| 1 | Drum | BD | Orange |
| 2 | Drum | BD | Pale orange |
| 3 | Drum | SD | Beige |
| 4 | Drum | CP | Pale beige |
| 5 | Drum | HH | Pale pink |
| 6 | Drum | HH | Pink |
| 7 | Sample / drum | TT | Red violet |
| 8 | Sample / drum | ST | Violet |
| 9 | Sample / drum | PC | Blue violet |
| 10 | Sample (stereo loop) | S8 | Blue |
| 11 | Bass synth | BASS | Pale blue |

Tracks 7–9 work as either drum tracks or mono sample tracks. Track 10 is a dedicated stereo
sample track. Marketing's "9-track drum machine" counts tracks 1–9 (p. 25, 60, 67).

Tracks 5 and 6 support **choke**: with `CHK` on, CH and OH do not overlap and the
last-triggered track wins (p. 66).

## Sound banks

The drum engine is **sample-based**, with dedicated synthesis engines only on BD1 (track 1) and
SD (track 3) (p. 60, 116). 10 banks, 132 sounds, 16 drum kits.

Each bank carries a random-velocity depth class and a FEEL amount class (p. 61) — **these key
off the bank, not the track index**:

| Bank | Name | Random depth | FEEL |
|---|---|---|---|
| BD | Bass drum | Subtle even at max | Extremely small extra timing offset |
| SD | Snare drum | Moderate | Slight extra timing offset |
| HH/CY | Hi-hats | Strong | Extra timing offset |
| CP | Clap | Strong | Significant extra timing offset |
| ST | Stick | Subtle even at max | Extremely small extra timing offset |
| TT | Tom | Moderate | Slight extra timing offset |
| PC | Percussion | Moderate | Slight extra timing offset |
| SY/BS | Synth | Subtle even at max | Extremely small extra timing offset |
| FX | Sound effect | Subtle even at max | **Not affected by FEEL** |
| S2 | Sample 2 s | Subtle even at max | **Not affected by FEEL** |
| S4 | Sample 4 s | Subtle even at max | **Not affected by FEEL** |
| S8 | Sample 8 s (track 10) | Subtle even at max | **Not affected by FEEL** |
| BASS | Bass (track 11) | More aggressive | **Not affected by FEEL** |

SMPL bank sounds can only be selected on tracks 7–9 and 10 (p. 60).

## Per-track controls

Eleven micro knobs, shared across all tracks. `TONE` and `MOVE` change meaning by bank (p. 62);
everything else is constant.

| Knob | Function | Range |
|---|---|---|
| SOUND | Sound selection (bank change via `func + SOUND`) | per bank |
| TUNE | Tune | 0–127 |
| TONE | *bank-dependent* | 0–127 or bipolar |
| MOVE | *bank-dependent* | 0–127 or bipolar |
| ATTACK | *bank-dependent* | 0–127 |
| DECAY | *bank-dependent* | 0–127 |
| →RVB | Reverb send | 0–127 |
| →DLY | Delay send | 0–127 |
| PAN | Pan | L63 – C – R63 |
| LEVEL | Track level | 0–127 (−∞ to +6 dB) |
| RND VL | Random velocity amount | 0–127 |

### Bank-dependent knob meanings (p. 62–70)

| Bank | SOUND | TONE | MOVE | ATTACK | DECAY | LEVEL |
|---|---|---|---|---|---|---|
| BD (T1) | Sound select | Tone | MOD time | Attack-pulse mix | Decay | Level |
| SD (T3) | Sound select | Snappy volume (`func`: snappy type) | Nudge | Overtone mix | Snappy decay | Level |
| Other drum | Sound select | LPF/HPF | Nudge | Attack time | Decay time | Level |
| SY / BS / FX | Sound select | LPF/HPF | Decay curve | Attack time | Decay time | Level |
| S2, S4 (T7–9) | Sound select | LPF/HPF | Slope | Start position | Length | Level |
| S8 (T10) | Sound select | LPF/HPF | Loop: X-fade / One-shot: Slope | Start position | Length | Level |
| BASS (T11) | OSC waveform | Sub OSC octave | Decay curve (S01: OSC mix) | Glide time | Gate time | Sub OSC level |

`TONE` as a filter is a **single bipolar knob**: `LPF50 – FLT OFF – HPF50` (p. 65). Turning one
way attenuates highs, the other attenuates lows, with the filter bypassed at centre.

`MOVE` as **Nudge** delays the trigger slightly; higher values delay more (p. 65).

For general drum tracks, setting `ATTACK` to 0 and `DECAY` to 127 turns the envelope off
(p. 65, 66).

**Snappy types** for SD (p. 65): `N88`, `N99` (vintage), `NT1` (brush), `NT2` (resonant),
`NT3` (acoustic), `NT4` (analog synth dissonance).

## Bass synth (track 11)

A dedicated knob section, independent of `SOUND`, so it can be edited alongside other work
(p. 72). All 0–127 (p. 73–75).

| Knob | Function |
|---|---|
| CUTOFF | Filter cutoff |
| RESO | Filter resonance |
| ENV | Filter envelope depth |
| DECAY | Filter envelope decay |
| ACCENT | Accent amount |
| DRIVE | Drive — **only active while `BS DRV` is on** |
| LEVEL | Bass track level |

- Oscillator: SAW, SQUARE, TRIANGLE, RECTANGLE, plus `S01` (p. 116)
- Sine sub-oscillator, range −2 / −1 / UNISON, bypasses the filter and sends
- 4-pole acid-style ladder low-pass with resonance and envelope amount
- Monophonic; glide entered per step, with glide time and glide curve (0 = downward curve,
  higher = more linear) (p. 76)
- Filter-linked accent; adjustable gate time; built-in overdrive
- Key pads 11–16 act as assignable mini keys for quick phrase input (p. 72)

**`S01` mode rewires the voice** (p. 77): `ATTACK` becomes the saw/square mix balance, the filter
envelope is added to the amp envelope to form a pseudo-ADR, the sub oscillator becomes a square
wave, and its signals to the filter and send effects are activated.

## Sampler

48 kHz / 16-bit linear PCM (p. 116). Sampled from LINE IN or USB (p. 81).

| Bank | Slots | Length | Channels | Tracks |
|---|---|---|---|---|
| S2 | 32 | 2 s | mono | 7–9 |
| S4 | 16 | 4 s | mono | 7–9 |
| S8 | 12 | 8 s | stereo | 10 |

Tracks 7–9 have **Repitch To Tempo** (`RPT`); with it on, `TUNE` no longer adjusts pitch (p. 68).

Track 10 has six playback / time-stretch modes (p. 70):

| Mode | Behaviour |
|---|---|
| `O.OFF` | Loops while held, no stretch |
| `O.MLD` | Loops while held, keeps length when pitch changes — for pads and melodic material |
| `O.RHY` | Loops while held, keeps pitch when tempo changes — for rhythmic material |
| `>.OFF` | Plays full length on key press, no stretch |
| `>.MLD` | Plays full length, melodic stretch |
| `>.RHY` | Plays full length, rhythmic stretch |

Crossfade is 1–4 s during loop playback, with a curved response; retrigger positions are entered
per step (p. 69, 116).

## Sequencer

- 11 tracks; 16 steps × 4 variations (A–D), chainable to 64 steps (p. 34)
- Per-track sequence length `LEN` 1–16 (p. 36)
- Per-track note length `NOTE`: `1`, `2`, `4`, `4D`, `4T`, `8`, `8D`, `8T`, `16`, `32` — whole
  through 32nd, **including dotted and triplet values** (p. 35)
- Four input methods: direct, step, real-time and keyboard recording, plus loop input (p. 34)
- Tied notes on **tracks 10 and 11 only** (p. 39)
- Parameter locks by direct input (hold step + turn knob) or real-time recording (p. 43–45)

**Not eligible for parameter locks** (p. 44): ACCENT, drum isolator, MFX, REVERB, DELAY, SWING,
MASTER.

### Sub-steps (p. 49)

Up to four sub-steps per step, dividing a step into 4 or 3 equal parts. Eleven figures, each a
rest mask over the subdivision (notation below treats a step as a quarter note):

| Display | Division | Pattern |
|---|---|---|
| OFF | — | normal note |
| `4 [][][][]` | 4 | four 16ths |
| `4 [][]__` | 4 | two 16ths |
| `4 []_[]_` | 4 | two 8ths |
| `4 __[]_` | 4 | 8th rest + 8th note |
| `4 []__[]` | 4 | 8th + 16th rest + 16th |
| `4 []_[][]` | 4 | 8th + two 16ths |
| `4 ___[]` | 4 | 8th rest + 16th rest + 16th |
| `4 __[][]` | 4 | 8th rest + two 16ths |
| `3 [][][]` | 3 | 16th triplets |
| `3 [][]_` | 3 | 16th triplets, two of three |

### Accent (p. 47–48)

Hard accent (orange) and soft accent (green), entered in accent mode. Depths are set globally
via `AC.h` and `AC.s`.

### Swing (p. 51)

Pattern swing 50–75 %. Resolution `8TH` (twice the current note length) or `16TH` (the current
note length). Per track, swing is either `PTN` (follow the pattern) or an independent 50–75 %.

### Phrase rotation (p. 55)

Hold `OK` and press a step to move the sequence start position. Takes effect at the next cycle,
and **is not saved with the pattern**.

## Patterns

- 16 patterns per bank, **8 banks, 128 patterns total** (p. 17). Bank 1 holds preset songs.
- Selecting during playback queues the pattern; it switches when the current one finishes (p. 18)
- Pattern level 0–127 (−∞ to +6 dB) via `func + LEVEL` (p. 59)
- Chain playback: press `PTN` twice, select patterns in order (p. 59)
- Transpose −12…+12 semitones via `func + TUNE` (p. 50)
- Rename via `func + data` → `PT.RENM` (p. 58)
- Tempo is per pattern or global, set by the `TEMPO` system item (p. 113)

Variations (p. 52): `A–D` switches the playing variation at the end of the current one;
`func + A–D` switches the edit variation without affecting playback; pressing A–D together plays
them in sequence; `OK + A–D` inserts a variation for one cycle then returns (fill).

## Drum kits (p. 79–80)

16 kits covering **tracks 1–9**. Load, save and rename. Kits and patterns are saved separately —
saving one does not update the other.

## Effects

### Drum track isolator (p. 33)

Three bands on the drum bus, each −50…0…+50 spanning −∞ to +6 dB:

| Band | Range |
|---|---|
| LOW | 20–400 Hz |
| MID | 400–1500 Hz |
| HI | 1500–20 kHz |

Values reset to 0 at startup and are saved neither with patterns nor globally. `ISO+LP` decides
whether the isolator also applies to the stereo sample track (p. 71).

### Master effects (p. 32)

One knob each. On/off is not saved; type and parameters are saved globally.

| Type | Name | Knob |
|---|---|---|
| `S.FLT` | Sweep filter | Cutoff, L50 – OFF – H50 |
| `PHSR` | Phaser | Speed, 1/16–8 |
| `DIST` | Distortion | Drive, 0–127 |
| `SN.LP` | Snip loop | Repeat, 1–128 |
| `DUCK` | Ducking compressor | Threshold, 0–127 |

`SN.LP` repeats whatever is playing at the moment the effect is switched on, and stops when it is
switched off.

### Send effects (p. 28–31)

Reverb type `ROOM` / `HALL` / `PLAT`, mix 0–127. Tape-echo delay with mix 0–127, `TIME` and
`F.BACK` knobs, delay-to-reverb send (`D>R`), ping-pong (`D.PP`) and tempo sync (`D.SY`).
LINE IN and USB input have their own reverb and delay sends via `func + ext-in`.

## Signal flow

From the architecture diagram (p. 112):

```
drum / sample track:  OSC → EG → FILTER → PAN → Track level → Mute ─┬→ Reverb send
bass track:           OSC → EG → DRIVE → FILTER → PAN → Level → Mute ┴→ Delay send → (D>R) → Reverb

drum bus → ISOLATOR (+ LP track when ISO+LP is on)
         → MFX (OTHER)          MFX (DUCK) taps separately
         → Pattern level → Master level → CODEC → line / phones / USB out
```

The ducking compressor sits at a different point in the chain from the other four master effects.

## Panel

27 pads/keys, 12 control knobs, 2 encoders, 16 micro knobs, character display (p. 117).

Knobs: ISOLATOR LOW/MID/HI, MASTER FX, VALUE, BASS CUTOFF/RESO/ENV/DECAY/ACCENT/DRIVE/LEVEL,
TEMPO/MENU, SWING, track SOUND/TUNE/TONE/MOVE/ATTACK/DECAY/PAN/→RVB/→DLY/LEVEL/RND VL,
SEND REVERB/DELAY/TIME/F.BACK, MASTER VOL (p. 10).

Buttons: `func`, `TRACK`, variations `A–D`, `CLR`, `OK`, `MUTE`(=solo), `ACC/GL`(=setting),
`KEYBOARD`, `BS DRV`(=rvb/dly), `MFX`(=mfx edit), `PTN`(=PTN save), `PLAY`, `REC`(=sampling),
16 `STEPS`, `OCTAVE`/select. Shifted functions: dr kit, Feel, copy, drum setting, sample setting,
bass setting, data, midi, system, ext-in, speaker mute (p. 9).

Knob behaviour modes (p. 103): `SCALED`, `LATCH`, `JUMP`.

## Menus

**SYSTEM** (`func + system`, p. 113): `KNOB.MD`, `MUTE.MD` (SOUND/SEQ), `ISO+LP`, `AT.STEP`,
`BS.TIE`, `TEMPO` (PTN/GLOBAL), `CLK.IO` (INT.MID/INT.SYN/EXT.MID/EXT.SYN), `SYN.I.PO`,
`SYN.O.PO` (RISE/FALL), `M.TUNE` (−75…+75 cents), `USB.AUD`, `BATT.TP`, `AUTO.PW`.

**MIDI** (`func + midi`, p. 114): `MIDI.CH`, `NOTE.MP`, `IN.FROM`, `OUT.TO`, `PRG.CNG`, `TX.CC`,
`TX.CLK`, `MID.OUT` (OUT/THRU), `MID.CMD`. Control change reception is always enabled (p. 97).

**DATA** (`func + data`, p. 115): `PT.RENM`, `S2.RENM`, `S4.RENM`, `S8.RENM`.

**DRUM KIT** (`func + dr kit`, p. 79): `LOAD`, `SAVE`, `RENAME`.

## I/O and storage

LINE IN, LINE OUT and headphones on 3.5 mm stereo mini jacks; MIDI/SYNC in and out; USB-C for
data, MIDI and 2-in/2-out audio; built-in speaker; DC 9 V or 6× AA (p. 10, 118).

Mounting as USB mass storage exposes (p. 100):

```
Audio/{S2,S4,S8}/<slot folders>   Kit/   Pattern/BANK1..8/01..16   Preferences/
```

Imported audio is 48 kHz/16-bit mono or stereo. Import filenames may use A–Z, 0–9 and `.` only.

## Manual discrepancies

Recorded so they do not resurface as bugs:

- **Pattern count** — the body says 8 banks × 16 = 128 (p. 17); the specification page says 64
  (p. 117). Taking **128**: the body is specific and consistent with the storage layout on p. 100.
- **Sound count** — the specification page says 132 (p. 116); press material said 130.
  Taking **132**.
- **Master effect count** — p. 117 says "5 types" then lists four, omitting the sweep filter that
  p. 32 documents in full. Taking **five**.
- **Knob order** — the parts list (p. 10) places PAN before →RVB; the multi-track table (p. 26)
  places it after →DLY. Affects panel layout only; resolve against a panel photograph before
  building the interface.
- **TONE description** — p. 66 and p. 67 describe TONE as "adjusts the pitch of the
  sub-oscillator" while their own column headers say LPF/HPF, and the surrounding text describes
  filter behaviour. Treating the body text as a copy-paste error and taking **LPF/HPF**.
- Sample type selection on p. 81 labels option C as "ARM. S8 Mono (8 seconds)", but S8 is stereo
  everywhere else (p. 67, 116). Taking **stereo**.
