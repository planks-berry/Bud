# Parameter reference and curve table

Bud stores parameters **exactly as the hardware does** — almost everything is an integer 0–127,
with a few bipolar and enumerated exceptions. Each voice maps that raw value to whatever it needs
internally.

That mapping is the subject of this document, and it matters more than it looks. The manual
specifies the *control* range (`0–127`, "higher values result in a longer time") but almost never
the *underlying quantity* — it does not say what decay 64 is in milliseconds. So every curve below
is a deliberate choice, not a documented fact. Writing them down here rather than burying them in
DSP code means each one can be reviewed, argued with, and re-tuned against the hardware without
hunting through voice implementations.

**Legend**

- **Measured** — stated outright in the manual, with a page reference.
- **Chosen** — our mapping. Musically reasonable, and the thing to calibrate by ear.

Where a range is bipolar the centre detent is value **64** unless stated.

---

## Global laws

These recur throughout, so they are defined once.

### Level law — `L(v)`

Used by track level, pattern level and master level. The manual gives the range as
0–127 spanning −∞ to +6 dB *(Measured, p. 27, 59)*.

```
L(0)        = 0                          (silence)
L(v ≤ 100)  = (v / 100)²
L(v > 100)  = 1 + (v − 100) / 27
```

Giving −∞ dB at 0, **0 dB at v = 100** and **+6 dB at 127** *(Chosen)*.

Unity at 100 rather than at the top of the range matters because it is also the default: a
track, a pattern and the master all sitting at their defaults then give exactly unity, instead
of each stage quietly adding a couple of decibels. Below unity the square taper keeps resolution
at the quiet end, where fader precision is wanted.

### Pan law — `P(v)`

Range L63 – C – R63 *(Measured, p. 27)*, stored 0–127 with centre at 64.

```
θ     = (v / 127) · π/2
gainL = cos θ,  gainR = sin θ
```

Constant power, −3 dB at centre *(Chosen)*. Keeps perceived loudness steady across a sweep, which
matters because pan is parameter-lockable per step.

### Send law — `S(v)`

Reverb and delay sends, 0–127 *(Measured, p. 27)*.

```
S(v) = (v / 127)²
```

*(Chosen.)* Squared so that low send amounts stay controllable.

### Time law — `T(v, min, max)`

The general shape for every time-like control. Exponential, because time is perceived
logarithmically.

```
T(v, min, max) = min · (max / min) ^ (v / 127)
```

*(Chosen.)*

---

## Per-track parameters

| Parameter | Raw | Maps to | Source |
|---|---|---|---|
| TUNE | 0–127 | −24 … 0 … +24 semitones, centre 64 | Chosen |
| TONE (filter) | 0–127 | bipolar LPF/HPF, see below | Measured p. 65 |
| →RVB | 0–127 | `S(v)` | Measured p. 27 |
| →DLY | 0–127 | `S(v)` | Measured p. 27 |
| PAN | 0–127 | `P(v)` | Measured p. 27 |
| LEVEL | 0–127 | `L(v)` | Measured p. 27 |
| RND VL | 0–127 | 0 … bank maximum, see below | Measured p. 27, 61 |

### TONE — the bipolar filter

One knob spanning `LPF50 – FLT OFF – HPF50` *(Measured, p. 65)*. Below centre it is a low-pass;
above centre a high-pass; at centre the filter is bypassed entirely — not merely parked at an
extreme, which would still colour the signal.

```
v <  64 :  low-pass,  cutoff = T(v·2, 180 Hz, 20 kHz)      → 180 Hz at v=0
v == 64 :  bypassed
v >  64 :  high-pass, cutoff = T((v-64)·2, 20 Hz, 9 kHz)   → 9 kHz at v=127
```

*(Chosen.)* Both ends reach a musically extreme but not useless setting, and both approach
transparency at the detent.

### RND VL — random velocity depth by bank

Random velocity is scaled by the sound bank's depth class *(Measured, p. 61)*; the depths
themselves are ours.

| Class | Banks | Depth at RND VL 127 |
|---|---|---|
| Subtle | BD, ST, SY/BS, FX, S2, S4, S8 | 0.15 |
| Moderate | SD, TT, PC | 0.35 |
| Strong | HH/CY, CP | 0.60 |
| Aggressive | BASS | 0.75 |

*(Chosen.)* "Subtle randomness even at the maximum value" is the manual's own phrasing for the
first class, which is why it caps well below the others.

---

## Bank-dependent knobs

`TONE` and `MOVE` change meaning per bank, and `ATTACK` / `DECAY` change meaning on some
*(Measured, p. 62)*.

### BD — dedicated synthesis (track 1)

| Knob | Meaning | Maps to | Source |
|---|---|---|---|
| TONE | Tone | body brightness, 0–1 linear | Measured p. 63 |
| MOVE | MOD time | `T(v, 2 ms, 220 ms)` pitch-envelope time | Chosen |
| ATTACK | Attack-pulse mix | 0–1 linear | Measured p. 63 |
| DECAY | Decay | `T(v, 40 ms, 1800 ms)` | Chosen |

### SD — dedicated synthesis (track 3)

| Knob | Meaning | Maps to | Source |
|---|---|---|---|
| TONE | Snappy volume | 0–1 linear | Measured p. 64 |
| `func`+TONE | Snappy type | `N88 N99 NT1 NT2 NT3 NT4` | Measured p. 65 |
| MOVE | Nudge | 0 … 28 ms trigger delay | Chosen |
| ATTACK | Overtone mix | 0–1 linear | Measured p. 64 |
| DECAY | Snappy decay | `T(v, 20 ms, 1200 ms)` | Chosen |

### Other drum banks — sample-based

| Knob | Meaning | Maps to | Source |
|---|---|---|---|
| TONE | LPF/HPF | bipolar filter, above | Measured p. 65 |
| MOVE | Nudge | 0 … 28 ms trigger delay | Chosen |
| ATTACK | Attack time | `T(v, 0 ms, 400 ms)` | Chosen |
| DECAY | Decay time | `T(v, 10 ms, 2000 ms)` | Chosen |

Envelope is bypassed entirely when ATTACK = 0 **and** DECAY = 127 *(Measured, p. 65)*.

### SY / BS / FX

As other drum banks, except:

| Knob | Meaning | Maps to | Source |
|---|---|---|---|
| MOVE | Decay curve | −50 … 0 … +50; negative concave, positive convex | Measured p. 66 |

### S2 / S4 — mono samples (tracks 7–9)

| Knob | Meaning | Maps to | Source |
|---|---|---|---|
| MOVE | Slope | `D50 … OFF … A50` | Measured p. 67, 69 |
| ATTACK | Start position | 0–100 % of sample | Measured p. 69 |
| DECAY | Length | 0–100 % of sample | Measured p. 69 |

Slope sets an AD envelope over playback: `OFF` is a plain one-shot, `D01–D50` a decay slope,
`A01–A50` an attack slope *(Measured, p. 69)*.

### S8 — stereo loop (track 10)

As S2/S4, except MOVE depends on playback mode *(Measured, p. 62, 69)*:

| Mode | MOVE | Maps to |
|---|---|---|
| Loop | X-fade | 0–100 % → 0 … min(4 s, region ÷ 2), curved | Measured p. 69, 116 |
| One-shot | Slope | as S2/S4 | Measured p. 69 |

### BASS (track 11)

Track-row knobs *(Measured, p. 62, 77)*:

| Knob | Meaning | Maps to | Source |
|---|---|---|---|
| SOUND | OSC waveform | `SAW SQR TRI RECT S01` | Measured p. 116 |
| TONE | Sub OSC octave | `−2`, `−1`, `UNISON` | Measured p. 116 |
| MOVE | Decay curve (S01: OSC mix) | −50…0…+50 / 0–1 mix | Measured p. 62, 77 |
| ATTACK | Glide time (S01: saw/square mix) | `T(v, 5 ms, 400 ms)` / 0–1 | Measured p. 62, 77 |
| DECAY | Gate time | 5–100 % of step | Chosen |
| LEVEL | Sub OSC level | `L(v)` | Measured p. 62 |

Dedicated bass knobs, all 0–127 *(Measured, p. 73–75)*:

| Knob | Maps to | Source |
|---|---|---|
| CUTOFF | `T(v, 30 Hz, 12 kHz)` | Chosen |
| RESO | 0 … 0.98 linear | Chosen |
| ENV | 0 … 1 linear | Chosen |
| DECAY | `T(v, 30 ms, 3000 ms)` filter envelope decay | Chosen |
| ACCENT | 0 … 1 linear | Chosen |
| DRIVE | 0 … 1 linear; **only active while `BS DRV` is on** | Measured p. 75 |
| LEVEL | `L(v)` | Measured p. 75 |

Glide curve is a separate 0–127 setting: 0 gives a downward curve, higher values a more linear
one *(Measured, p. 76)*.

---

## Sequencer parameters

| Parameter | Range | Source |
|---|---|---|
| Sequence length | 1–16 steps per variation | Measured p. 36 |
| Note length | `1 2 4 4D 4T 8 8D 8T 16 32` | Measured p. 35 |
| Swing | 50–75 % | Measured p. 51 |
| Swing resolution | `8TH`, `16TH` | Measured p. 51 |
| Track swing | `PTN` or 50–75 % | Measured p. 51 |
| Sub-step | 11 figures, see DEVICE_SPEC | Measured p. 49 |
| Hard accent depth `AC.h` | 0–127 → velocity ×1.0 … ×1.6 | Chosen |
| Soft accent depth `AC.s` | 0–127 → velocity ×1.0 … ×0.3 | Chosen |
| Transpose | −12 … +12 semitones | Measured p. 50 |

Swing at 50 % is straight; at 75 % the offbeat sits three-quarters of the way through the pair —
so the displacement is `(swing − 50) / 50` of one step *(Chosen interpretation of a measured
range)*.

**Not parameter-lockable** *(Measured, p. 44)*: ACCENT, drum isolator, MFX, REVERB, DELAY, SWING,
MASTER.

---

## Effects

### Isolator — per band, −50 … 0 … +50 *(Measured, p. 33)*

| Band | Frequency range |
|---|---|
| LOW | 20–400 Hz |
| MID | 400–1500 Hz |
| HI | 1500–20 kHz |

```
v <  0 :  gain = L-style cut, reaching −∞ dB at −50
v == 0 :  unity
v >  0 :  gain = +6 dB · (v / 50)
```

*(Chosen; the −∞ to +6 dB span is measured.)* Full cut at −50 is what makes it an isolator rather
than an EQ.

### Master effects *(Measured, p. 32)*

| Type | Knob | Range | Maps to |
|---|---|---|---|
| `S.FLT` | Cutoff | L50 – OFF – H50 | as TONE, but over the master bus |
| `PHSR` | Speed | 1/16 – 8 | tempo-synced LFO rate *(Chosen: tempo divisions)* |
| `DIST` | Drive | 0–127 | 0 … 1 linear |
| `SN.LP` | Repeat | 1–128 | loop length in sixteenths *(Chosen)* |
| `DUCK` | Threshold | 0–127 | 0 … −40 dBFS *(Chosen)* |

### Send effects *(Measured, p. 28–31)*

| Parameter | Range | Maps to |
|---|---|---|
| Reverb type | `ROOM` `HALL` `PLAT` | — |
| Reverb mix | 0–127 | `S(v)` |
| Delay mix | 0–127 | `S(v)` |
| Delay TIME | 0–127 | `T(v, 20 ms, 1500 ms)`, or a tempo division when `D.SY` is on *(Chosen)* |
| Delay F.BACK | 0–127 | 0 … 0.95 *(Chosen)* |
| `D>R` | 0–127 | `S(v)` |
| `D.PP` | OFF/ON | ping-pong |
| `D.SY` | OFF/ON | tempo sync |

---

## System

| Parameter | Range | Source |
|---|---|---|
| Master tune `M.TUNE` | −75 … +75 cents | Measured p. 105 |
| Knob mode `KNOB.MD` | `SCALED` `LATCH` `JUMP` | Measured p. 103 |
| Mute mode `MUTE.MD` | `SOUND` `SEQ` | Measured p. 103 |
| Tempo source | `PTN` `GLOBAL` | Measured p. 113 |
| Tempo | 20–300 BPM *(Chosen — the manual does not state the range)* | Chosen |

---

## Calibration

Every **Chosen** row above is a hypothesis. The way to settle them is to set the hardware and
Bud to the same value, record both, and compare — decay times from an envelope follower, filter
corners from a sweep, level law from a series of steady tones. Correcting one is a single-row
edit here plus the matching constant in the voice, and the golden-file tests will show exactly
what moved.
