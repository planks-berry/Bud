# Bud in a browser

The engine compiled to WebAssembly, running in an AudioWorklet, with a panel that builds itself
from the engine's own parameter table.

It is the **same C++** the tests exercise and the plugin will use — not a reimplementation. That
is the whole reason it is worth having: there is one engine, and the browser is another host for
it.

---

## Running it

```bash
./web/build.sh                    # uses em++ if you have one; otherwise fetches it via npm
cd web && python3 -m http.server  # any static server; a file:// URL will not work
```

Then open `http://localhost:8000`.

A static server is required because an `AudioWorklet` module cannot be loaded from `file://`.

`build.sh` prefers an emscripten already on your `PATH`, and falls back to the npm `emsdk`
package so a bare machine still works. Prefer a real SDK where you can:

```bash
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
~/emsdk/emsdk install 6.0.5 && ~/emsdk/emsdk activate 6.0.5
source ~/emsdk/emsdk_env.sh
```

The npm package's prebuilt `wasm-opt` does not run everywhere — it fails on a GitHub runner the
moment `-O3` asks for it, which is why CI installs the SDK proper.

### What you get

- **PLAY / STOP** — the transport.
- **The grid** — eleven tracks, sixteen steps. Click a step to toggle a note; shift-click to
  cycle its accent (normal → hard → soft), which is how the device layers accent onto a note
  rather than replacing it.
- **The playhead ring** follows the audio, because it is read inside `process()` on the audio
  thread rather than from a timer on the page.
- **The editor** — click a track name to select it. Its eleven micro knobs and sequencer settings
  appear, and the bass track additionally gets its own knob section (p. 72).
- **DEMO / CLR PTN** — load the demo pattern, or initialise the current one.

---

## Why it is built this way

### The interface is generated, not written

`web/app.js` contains almost no knowledge of what a parameter *is*. On startup the worklet sends
across `bud_parameters_json()` — the engine's own table, with every parameter's range, default,
display name and enumerated labels — and the controls are built from it. A parameter added in C++
appears in the browser without this JavaScript changing.

That is the same single-source-of-truth rule the rest of the project follows, extended across a
language boundary. The only things `app.js` decides are presentation: which handful of parameters
sit in the header, and how a value is drawn.

### The engine runs on the audio thread

An `AudioWorklet` rather than the main thread, so the sequencer keeps its timing while the page is
laying out, garbage collecting or responding to a drag. The worklet's fixed 128-frame quantum is
simply one more buffer size the engine does not care about — the same block-size invariance that
lets the plugin accept whatever a host asks for.

### The wasm is inlined

`build.sh` passes `-sSINGLE_FILE=1`, so `bud.js` carries the WebAssembly as base64 rather than
fetching it. An `AudioWorkletGlobalScope` has neither `fetch` nor `importScripts`, so the module
has to arrive as code.

The whole instrument is about **200 KB**, because the 132 factory sounds are generated
procedurally at startup rather than shipped as audio.

---

## Testing

```bash
node web/test.mjs
```

Drives a real Chromium through Playwright and checks the things a compiler cannot: that the
worklet loads the module, that the engine initialises inside it, that the interface builds itself
from the table, that **audio actually comes out** — measured by tapping the live graph with an
`AnalyserNode`, so what the test observes is what the page is really producing — and that it stops
when told to.

It found a real bug on its first run: `process()` was written as `process(outputs)` when the
signature is `process(inputs, outputs, parameters)`, so the code was filling the *input* array,
which is empty for a source node. The page looked completely healthy and produced silence.

The test uses the container's own Chromium; override with `BUD_CHROME` if yours differs.

---

## How faithful is it?

Rendering the demo pattern under wasm and comparing against the native build, sample for sample:

- **221 frames of 720,000 differ, each by exactly 1 LSB at 16-bit** — about −90 dBFS.
- The cause is the maths library, not the engine: emscripten uses musl's `sin`, `cos` and `exp`
  where a native Linux build uses glibc's, and a 1-ULP difference propagates.
- Within the wasm build, output is **bit-identical at every block size** from 1 to 4096, exactly
  as it is natively.

Chasing an earlier, much larger disagreement between the two builds is what turned up the
reused-engine bug fixed in `9284245` — the port was faithful, and the defect was ours.

---

## What this is not

A web page cannot host in AUM or GarageBand, so this **complements** the AUv3 rather than
replacing it. What it does give you today is the instrument running on any machine with a browser
— including an iPad — with no Xcode, no JUCE and no local build.

## Published from CI

`.github/workflows/pages.yml` builds the wasm, runs the browser test against it, and deploys to
GitHub Pages on every push. The test runs *before* the deploy on purpose: publishing a page that
loads but produces silence would be worse than not publishing at all, and only a real browser
catches that.

**One-time setup, which has to be done in the repository settings:**

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. Re-run the workflow (Actions → Publish web build → Run workflow), or push anything.

The URL then appears on the workflow run, and under Settings → Pages. It is of the form
`https://<owner>.github.io/<repo>/`.

### If the repository is private

GitHub Pages on a **private** repository requires a paid plan (Pro, Team or Enterprise). On a
free account the deploy step fails with a permissions error. Three ways round it:

- Make the repository public — the engine is clean-room and carries no Sonicware material, so
  there is nothing here that has to stay closed.
- Upgrade the plan.
- Skip Pages and take the artifact: the build job uploads the site, so it can be downloaded from
  the run summary, unzipped, and served locally with `python3 -m http.server`. That works but
  does not give you a link to open on a tablet, which is the whole point.

### On a tablet

The interface adapts: the editor stacks below the grid, step keys grow to a 44 px touch target,
and **press and hold** on a step reaches accent, since a tablet has no shift key. Both are
checked by `web/test.mjs` in a touch-enabled context rather than assumed.

iOS requires a user gesture before audio starts, which is what the PLAY button is.

## Not yet done

- **The panel replica.** The layout is panel-flavoured but not the hardware's artwork; that work
  would double as the reference for the JUCE UI.
- **Note entry on the pitched tracks.** The grid toggles gates; the bass and loop tracks also want
  note values, ties and glide, which `NoteInput` already models in C++ but the page does not yet
  expose.
- **Sampling.** The engine has recording, metering and the user banks; the browser would need to
  route `getUserMedia` into `bud_render`'s input path.
