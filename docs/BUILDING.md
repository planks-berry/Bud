# Building and running Bud on macOS

This walks through getting Bud running on a Mac from nothing. No prior context needed.

**What exists today:** the sound engine, its test suite, and an offline renderer that drives the
whole instrument from a command line. There is **no plugin or standalone app yet**, so there is
nothing to load in a DAW — that arrives later. What you can do now is build it, run the tests,
and render audio with any tempo, FEEL setting and pattern you like.

---

## 1. Prerequisites

The engine depends on nothing but the C++20 standard library — no JUCE, no audio SDK, no
frameworks. So the list is short:

| What | Why | How to get it |
|---|---|---|
| Xcode Command Line Tools | Apple clang, the compiler | `xcode-select --install` |
| Apple clang 14 or newer | `<numbers>` and `<span>` need a recent libc++ | Ships with Xcode 14+ |
| CMake 3.22 or newer | The build system | `brew install cmake` |

Check what you have:

```bash
clang++ --version     # want Apple clang 14.0 or higher
cmake --version       # want 3.22 or higher
```

If you don't have Homebrew, either [install it](https://brew.sh) or download CMake directly from
[cmake.org](https://cmake.org/download/) — if you use the app bundle, add it to your path with
`export PATH="/Applications/CMake.app/Contents/bin:$PATH"`.

## 2. Clone

```bash
git clone https://github.com/planks-berry/Bud.git
cd Bud
git checkout claude/sonicware-deconstruct-emulation-c91vb8
```

## 3. Build

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
```

Takes well under a minute. You should see `BudCore`, `BudCoreTests` and `bud-render` built with
no warnings.

## 4. Run the tests

```bash
ctest --test-dir build --output-on-failure
```

Expected:

```
100% tests passed, 0 tests failed out of 1
```

For the detail — which suites ran and how many assertions each made — run the test binary
directly:

```bash
./build/tests/BudCoreTests
```

That prints every case, and ends with something like
`PASSED — 240 tests, 8793519 checks, 0 failures`. You can also run one suite at a time by
passing its name as a filter:

```bash
./build/tests/BudCoreTests Fx
```

The suites are `Parameters`, `ParameterSet`, `Curves`, `Transport`, `Sequencer`, `Groove`, `Dsp`,
`Stretch`, `Engine`, `Factory`, `Fx`, `Sampler`, `Kit`, `PatternOps`, `NoteInput` and `Demo`.

A filter is a case-sensitive substring match against `Suite.testName`, so it also narrows to
individual cases across suites:

```bash
./build/tests/BudCoreTests BlockSize
```

which runs all eight block-size invariance tests — sequencer, stretcher, engine, effects and the
demo pattern. A filter matching nothing exits non-zero and lists the suites, rather than
reporting a clean run of zero tests.

## 5. Render some audio

```bash
./build/tools/bud-render --out demo.wav --bars 8 --feel minimal
open demo.wav
```

That is the whole instrument — eleven tracks, both synthesis engines, the sampler voices, the
acid bass, the effects section — rendered offline.

Options:

```
--out FILE      where to write            (default bud-demo.wav)
--bars N        how many bars             (default 4)
--tempo BPM     tempo                     (default 128)
--feel MODEL    808, 909 or minimal       (default minimal)
--rate HZ       sample rate               (default 48000)
--block N       host buffer size          (default 512)
```

Worth hearing the difference between the three drift models, which are structurally different
rather than three strengths of one thing:

```bash
./build/tools/bud-render --out tight.wav   --feel 909 --tempo 138
./build/tools/bud-render --out relaxed.wav --feel 808
./build/tools/bud-render --out hypnotic.wav --feel minimal --bars 16
```

### A property worth checking yourself

`--block` sets the buffer size a host would use. Changing it must not change a single sample —
that invariant is what most of the test suite exists to defend, and you can verify it directly:

```bash
./build/tools/bud-render --out a.wav --block 64
./build/tools/bud-render --out b.wav --block 1024
cmp a.wav b.wav && echo "identical"
```

The same holds across compilers: a gcc build and a clang build of the same commit render
byte-for-byte identical audio.

This check is worth running because it is genuinely sharp. It is how the transport's per-block
re-anchoring was found: an error of about one ten-millionth, far too small to hear directly, but
enough to flip the occasional sample once the render is rounded to 16 bits — so `cmp` sees it
even though the ear never would. The suite now asserts the same property on this same pattern
(`./build/tests/BudCoreTests Demo`), with exact equality rather than a tolerance, because a
tolerance is what let that error hide.

## 6. Change something and hear it

The demo pattern is plain readable code in
[`source/demo/DemoPattern.cpp`](../source/demo/DemoPattern.cpp). Everything is there: which steps
are gated, which sound each track uses, levels, pans, sends, the bass line with its glide and
parameter lock.

Edit it, then:

```bash
cmake --build build -j && ./build/tools/bud-render --out mine.wav && open mine.wav
```

It lives in its own small library rather than inside the renderer because the test suite renders
it too — so `./build/tests/BudCoreTests Demo` checks your edited pattern for buffer-size
independence, clipping and NaNs as well.

A few things to try:

- Change `SnappyType::N99` to `NT2` on the snare — the six snappy types are different noise
  characters.
- Move `ParamKind::TrackSound` on track 5 from `8` towards `110` — the hi-hat bank sweeps from
  tight closed hats to long cymbals.
- Put `SubStepPattern::Three_111` on a kick step for a triplet ratchet.
- Turn `ParamKind::IsolatorLow` down to `-50` and hear the whole low end disappear.
- Switch `MasterFxType::SnipLoop` on with `MasterFxEnabled` and watch it stutter.

`docs/PARAMETERS.md` explains what every parameter's 0–127 range maps to, and
`docs/DEVICE_SPEC.md` documents the modelled device with manual page references.

---

## Continuous integration

Every push builds on GitHub. **Actions** tab → the run for your commit.

| Job | What it does |
|---|---|
| Engine × 4 | gcc and clang, Debug and Release, build + tests + render |
| Sanitisers | Address and undefined-behaviour sanitisers over the whole suite |
| macOS | Dormant until plugin targets exist; then builds the standalone, AU and VST3 and runs `auval` |

The Release/gcc job attaches a **`rendered-demos`** artifact to each run — the three WAVs
rendered on the runner. Download them from the run summary page if you want to hear a commit
without building it.

If a job fails, click it and expand the failing step; the compiler or test output is there in
full. Test failures print the file, line, and both values.

### Running CI locally (optional)

[`act`](https://github.com/nektos/act) runs the Linux jobs on your machine, so you can check a
workflow change before pushing:

```bash
brew install act colima
colima start                 # act needs a container runtime
act -j engine
```

The macOS job can't run this way — it needs a real macOS runner, which is exactly why it lives
in CI.

---

## When the plugin arrives

This section will cover enabling `-DBUD_BUILD_PLUGIN=ON`, where the built `.component`, `.vst3`
and `.app` land, registering the audio unit so `auval` and your DAW can see it, and what code
signing needs for the iPad AUv3. It is deliberately empty until there is something real to
describe.

---

## Troubleshooting

**`cmake: command not found`** — CMake isn't on your path. `brew install cmake`, or add the app
bundle's `bin` directory as shown above.

**Errors mentioning `<numbers>`, `<span>`, or "no member named 'pi'"** — Apple clang is too old
for the C++20 library features the engine uses. Update Xcode, or install a newer LLVM with
`brew install llvm` and point CMake at it:

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_CXX_COMPILER=/opt/homebrew/opt/llvm/bin/clang++
```

**`clang: error: invalid version number in '-std=c++20'`** — same cause.

**The build succeeds but `ctest` finds no tests** — you configured with `-DBUD_BUILD_TESTS=OFF`.
Re-run the configure step without it.

**A test fails** — that is worth reporting rather than working around; the suite is green on
Linux with both gcc and clang, so a macOS-only failure is real information. The output names the
file and line and prints the actual and expected values.
