# Bud

A digital groovebox modelled on the Sonicware deconstruct MINIMAL: an 11-track
sampler-integrated drum machine with an analog-modelling bass synth, built for minimal
techno and house.

Targets:

- **macOS standalone application**
- **macOS AU / VST3**
- **AUv3 for iPad**

## Status

Under construction. See [`docs/DEVICE_SPEC.md`](docs/DEVICE_SPEC.md) for the modelled device
specification and [`docs/PARAMETERS.md`](docs/PARAMETERS.md) for the parameter reference.

| Milestone | Scope | State |
|---|---|---|
| M0 | Build system, parameter table, docs | done |
| M1 | Transport, sequencer, FEEL drift | done |
| M2 | Voices (drum synth, sample, loop, bass) | done |
| M3 / R7 | Effects (isolator, master, reverb, tape echo) | done |
| M4 / R8 | Sampler (record, banks, stretch/repitch) | in progress |
| M5 / R6 | Procedural factory content | done |
| M6 | Hardware-replica interface | pending |
| M7 | MIDI and sync | pending |
| M8 | Project/pattern/kit state | pending |
| M9 | macOS packaging | pending |
| M10 | iPad AUv3 | pending |

## Architecture

The engine lives in `source/core/` and is **plain C++20 with no framework dependency** — not
JUCE, not a GUI toolkit, not a host SDK. It builds and unit-tests on any platform with a
C++20 compiler, which keeps the entire sound engine verifiable in CI on Linux while the
macOS and iPadOS shells are built with Xcode.

JUCE 8 appears only in `source/plugin/` and `source/ui/`, which wrap the core.

```
source/
  core/        engine — framework-free, fully tested
  plugin/      JUCE AudioProcessor, bus layout, host glue
  ui/          panel replica; layout and menu tree are data, not code
  standalone/  macOS audio device and file access
tools/         offline factory-content generator
tests/         engine and DSP tests (run anywhere)
docs/          device spec, parameter reference, reference material
```

## Building the engine and tests

Requires CMake 3.22+ and a C++20 compiler. No network access needed.
**On macOS, follow [`docs/BUILDING.md`](docs/BUILDING.md)** for step-by-step directions.

```bash
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build -j
ctest --test-dir build --output-on-failure
```

This builds `BudCore`, `BudCoreTests` and `bud-render`. The plugin and standalone targets are
off by default and require JUCE; enable with `-DBUD_BUILD_PLUGIN=ON` (macOS/Xcode).

## Hearing it

The engine has no framework dependency, so the whole instrument can be driven offline — the
sound is audible long before there is a plugin to host it:

```bash
./build/tools/bud-render --out demo.wav --bars 8 --tempo 128 --feel minimal
```

`--feel` takes `808`, `909` or `minimal` and switches the per-voice drift model.

## Provenance

This is a clean-room implementation. It contains no firmware, no ROM data, and no factory
samples from any hardware device; the DSP is written from published specifications and by-ear
matching, and the factory sound set is synthesized from original recipes in `tools/factory_gen`.
