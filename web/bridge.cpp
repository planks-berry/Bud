// The browser's view of the engine.
//
// A flat C interface, because that is what crosses the WebAssembly boundary cheaply — no
// bindings layer, no marshalling, and the audio path is a single call that fills two buffers.
//
// The interface deliberately hands out the *parameter table* rather than a hand-written list of
// controls. The panel is then generated from the same table that drives the APVTS layout, the
// MIDI CC map and the display strings, so a parameter added to the engine appears in the web
// interface without anyone editing JavaScript. That is the same single-source-of-truth rule the
// rest of the project follows, extended across the language boundary.

#include "core/Engine.h"
#include "demo/DemoPattern.h"

#include <emscripten/emscripten.h>

#include <string>
#include <vector>

namespace
{
    bud::Engine engine;

    std::vector<float> left, right;

    /// Returned strings have to outlive the call, since JavaScript reads them from the heap
    /// after the function returns.
    std::string scratch;

    void appendEscaped (std::string& out, std::string_view text)
    {
        for (const auto c : text)
        {
            if (c == '"' || c == '\\')
                out += '\\';

            out += c;
        }
    }
}

extern "C"
{

//==============================================================================
// Lifecycle

EMSCRIPTEN_KEEPALIVE void bud_init (double sampleRate, int maxBlockSize)
{
    // Whatever rate the browser's AudioContext runs at — the engine generates its factory
    // content at that rate, so nothing is resampled on playback.
    engine.prepare (sampleRate, maxBlockSize);
}

EMSCRIPTEN_KEEPALIVE void bud_load_demo()
{
    bud::demo::buildPattern (engine);
}

EMSCRIPTEN_KEEPALIVE void bud_start() { engine.start(); }
EMSCRIPTEN_KEEPALIVE void bud_stop()  { engine.stop(); }
EMSCRIPTEN_KEEPALIVE int  bud_is_playing() { return engine.isPlaying() ? 1 : 0; }

//==============================================================================
// Audio

EMSCRIPTEN_KEEPALIVE float* bud_render (int numSamples)
{
    const auto count = static_cast<std::size_t> (numSamples > 0 ? numSamples : 0);

    if (left.size() < count)
    {
        left.resize (count);
        right.resize (count);
    }

    engine.process (left.data(), right.data(), numSamples);
    return left.data();
}

EMSCRIPTEN_KEEPALIVE float* bud_render_right() { return right.data(); }

//==============================================================================
// Parameters

EMSCRIPTEN_KEEPALIVE int bud_get (int kind, int track)
{
    if (kind < 0 || kind >= bud::kNumParamKinds)
        return 0;

    return engine.parameters().get (static_cast<bud::ParamKind> (kind), track);
}

EMSCRIPTEN_KEEPALIVE void bud_set (int kind, int track, int value)
{
    if (kind < 0 || kind >= bud::kNumParamKinds)
        return;

    engine.parameters().set (static_cast<bud::ParamKind> (kind), track, value);
}

/// The display string the device's character display would show, e.g. "L21", "PLAT", "1/16".
EMSCRIPTEN_KEEPALIVE const char* bud_format (int kind, int value)
{
    if (kind < 0 || kind >= bud::kNumParamKinds)
        return "";

    scratch = bud::formatValue (static_cast<bud::ParamKind> (kind), value);
    return scratch.c_str();
}

/** The whole parameter table as JSON, so the interface can build itself.

    Emitting this rather than duplicating the table in JavaScript is the point: there is one
    description of what a parameter is, and it lives in C++ next to the engine that uses it.
*/
EMSCRIPTEN_KEEPALIVE const char* bud_parameters_json()
{
    scratch = "[";

    const auto table = bud::paramTable();

    for (std::size_t i = 0; i < table.size(); ++i)
    {
        const auto& p = table[i];

        if (i > 0)
            scratch += ',';

        scratch += "{\"kind\":" + std::to_string (static_cast<int> (p.kind));
        scratch += ",\"id\":\"";      appendEscaped (scratch, p.id);   scratch += '"';
        scratch += ",\"name\":\"";    appendEscaped (scratch, p.name); scratch += '"';
        scratch += ",\"perTrack\":" + std::string (p.scope == bud::ParamScope::Track ? "true" : "false");
        scratch += ",\"min\":" + std::to_string (p.minValue);
        scratch += ",\"max\":" + std::to_string (p.maxValue);
        scratch += ",\"def\":" + std::to_string (p.defaultValue);
        scratch += ",\"unit\":" + std::to_string (static_cast<int> (p.unit));
        scratch += ",\"plockable\":" + std::string (p.plockable ? "true" : "false");

        scratch += ",\"labels\":[";

        for (std::size_t l = 0; l < p.labels.size(); ++l)
        {
            if (l > 0)
                scratch += ',';

            scratch += '"';
            appendEscaped (scratch, p.labels[l]);
            scratch += '"';
        }

        scratch += "]}";
    }

    scratch += ']';
    return scratch.c_str();
}

/// Track names and LED colours, again straight from the engine's own table.
EMSCRIPTEN_KEEPALIVE const char* bud_tracks_json()
{
    scratch = "[";

    for (int track = 0; track < bud::kNumTracks; ++track)
    {
        const auto& info = bud::trackInfo (track);

        if (track > 0)
            scratch += ',';

        scratch += "{\"short\":\"";  appendEscaped (scratch, info.shortName); scratch += '"';
        scratch += ",\"name\":\"";   appendEscaped (scratch, info.longName);  scratch += '"';
        scratch += ",\"colour\":[" + std::to_string (info.colour.r) + ','
                                   + std::to_string (info.colour.g) + ','
                                   + std::to_string (info.colour.b) + ']';
        scratch += ",\"ties\":" + std::string (bud::trackSupportsTies (track) ? "true" : "false");
        scratch += ",\"choke\":" + std::string (bud::trackSupportsChoke (track) ? "true" : "false");
        scratch += '}';
    }

    scratch += ']';
    return scratch.c_str();
}

/// Which parameter kinds make up the eleven micro knobs, in panel order.
EMSCRIPTEN_KEEPALIVE const char* bud_knob_kinds_json()
{
    scratch = "{\"knobs\":[";

    const auto knobs = bud::trackKnobParams();

    for (std::size_t i = 0; i < knobs.size(); ++i)
    {
        if (i > 0) scratch += ',';
        scratch += std::to_string (static_cast<int> (knobs[i]));
    }

    scratch += "],\"sequencer\":[";

    const auto seq = bud::trackSequencerParams();

    for (std::size_t i = 0; i < seq.size(); ++i)
    {
        if (i > 0) scratch += ',';
        scratch += std::to_string (static_cast<int> (seq[i]));
    }

    scratch += "],\"bass\":[";

    const auto bass = bud::bassParams();

    for (std::size_t i = 0; i < bass.size(); ++i)
    {
        if (i > 0) scratch += ',';
        scratch += std::to_string (static_cast<int> (bass[i]));
    }

    scratch += "]}";
    return scratch.c_str();
}

//==============================================================================
// Steps

EMSCRIPTEN_KEEPALIVE int bud_num_tracks() { return bud::kNumTracks; }
EMSCRIPTEN_KEEPALIVE int bud_num_steps()  { return bud::kStepsPerVariation; }

EMSCRIPTEN_KEEPALIVE int bud_step_gate (int track, int step)
{
    if (track < 0 || track >= bud::kNumTracks || step < 0 || step >= bud::kStepsPerVariation)
        return 0;

    return engine.currentPattern().track (track)
               .variation (bud::Variation::A)[static_cast<std::size_t> (step)].gate ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE int bud_step_accent (int track, int step)
{
    if (track < 0 || track >= bud::kNumTracks || step < 0 || step >= bud::kStepsPerVariation)
        return 0;

    return static_cast<int> (engine.currentPattern().track (track)
               .variation (bud::Variation::A)[static_cast<std::size_t> (step)].accent);
}

EMSCRIPTEN_KEEPALIVE void bud_step_toggle (int track, int step)
{
    if (track < 0 || track >= bud::kNumTracks || step < 0 || step >= bud::kStepsPerVariation)
        return;

    auto& s = engine.currentPattern().track (track)
                  .variation (bud::Variation::A)[static_cast<std::size_t> (step)];

    // Direct recording (p. 37): a press toggles the note, and clearing takes the sub-steps with
    // it but leaves the parameter locks alone.
    if (s.gate)
    {
        s.gate = false;
        s.subStep = bud::SubStepPattern::Off;
        s.tie = false;
        s.retrigger = false;
    }
    else
    {
        s.gate = true;
    }
}

/// Cycle a step's accent, which is how the device's accent keys behave.
EMSCRIPTEN_KEEPALIVE void bud_step_cycle_accent (int track, int step)
{
    if (track < 0 || track >= bud::kNumTracks || step < 0 || step >= bud::kStepsPerVariation)
        return;

    auto& s = engine.currentPattern().track (track)
                  .variation (bud::Variation::A)[static_cast<std::size_t> (step)];

    // Normal -> Hard -> Soft -> Normal, the three the device offers (p. 47-48).
    s.accent = static_cast<bud::Accent> ((static_cast<int> (s.accent) + 1) % 3);
}

EMSCRIPTEN_KEEPALIVE int bud_playhead (int track)
{
    return engine.playheadStep (track);
}

EMSCRIPTEN_KEEPALIVE void bud_clear_pattern()
{
    engine.initialisePattern (engine.patternIndex());
}

//==============================================================================
// Mute and solo

EMSCRIPTEN_KEEPALIVE void bud_set_solo (int track) { engine.setSolo (track); }
EMSCRIPTEN_KEEPALIVE int  bud_get_solo()           { return engine.solo(); }

}
