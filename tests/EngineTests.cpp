#include "TestFramework.h"

#include "core/Engine.h"

#include <algorithm>
#include <cmath>
#include <vector>

using namespace bud;

namespace
{

constexpr double kSampleRate = 48000.0;
constexpr double kTempo = 120.0;
constexpr double kSamplesPerSixteenth = 6000.0;   // at 120 bpm / 48 kHz

struct Rendered
{
    std::vector<float> left;
    std::vector<float> right;

    int size() const { return static_cast<int> (left.size()); }

    float peak() const
    {
        float p = 0.0f;
        for (std::size_t i = 0; i < left.size(); ++i)
            p = std::max (p, std::max (std::abs (left[i]), std::abs (right[i])));
        return p;
    }

    bool allFinite() const
    {
        for (std::size_t i = 0; i < left.size(); ++i)
            if (! std::isfinite (left[i]) || ! std::isfinite (right[i]))
                return false;
        return true;
    }

    /// First sample whose magnitude crosses a threshold — a crude onset detector, which is
    /// all that is needed to check a trigger landed on the expected sample.
    int firstCrossing (float threshold) const
    {
        for (std::size_t i = 0; i < left.size(); ++i)
            if (std::abs (left[i]) > threshold)
                return static_cast<int> (i);
        return -1;
    }
};

Rendered render (Engine& engine, int totalSamples, int blockSize)
{
    Rendered out;
    out.left.assign (static_cast<std::size_t> (totalSamples), 0.0f);
    out.right.assign (static_cast<std::size_t> (totalSamples), 0.0f);

    engine.start();

    for (int position = 0; position < totalSamples; position += blockSize)
    {
        const auto count = std::min (blockSize, totalSamples - position);
        engine.process (out.left.data() + position, out.right.data() + position, count);
    }

    return out;
}

/// An engine with one gated kick on step 0 and drift disabled, so onsets are exact.
void setUpSingleKick (Engine& engine, int blockSize = 512)
{
    engine.prepare (kSampleRate, blockSize);
    engine.parameters().set (ParamKind::Tempo, static_cast<float> (kTempo));
    engine.parameters().set (ParamKind::FeelDepth, 0.0f);
    engine.parameters().set (ParamKind::MasterVolume, 1.0f);

    auto& kick = engine.currentPattern().track (0);
    kick.variation (Variation::A)[0].gate = true;
}

void gateEveryQuarter (TrackPattern& track)
{
    for (int step : { 0, 4, 8, 12 })
        track.variation (Variation::A)[static_cast<std::size_t> (step)].gate = true;
}

} // namespace

//==============================================================================

BUD_TEST (Engine, rendersSilenceWhileStopped)
{
    Engine engine;
    setUpSingleKick (engine);

    Rendered out;
    out.left.assign (4096, 0.0f);
    out.right.assign (4096, 0.0f);

    // Deliberately not started.
    engine.process (out.left.data(), out.right.data(), 4096);

    CHECK_EQ (out.peak(), 0.0f);
}

BUD_TEST (Engine, rendersAudioWhenPlaying)
{
    Engine engine;
    setUpSingleKick (engine);

    const auto out = render (engine, 24000, 512);

    CHECK (out.allFinite());
    CHECK (out.peak() > 0.1f);
    CHECK (out.peak() <= 1.0f);
}

BUD_TEST (Engine, outputIsDeterministic)
{
    // Golden-file DSP tests depend on this: the same pattern must render to the same samples
    // every time, or a regression cannot be told apart from noise.
    Engine a, b;
    setUpSingleKick (a);
    setUpSingleKick (b);

    const auto first = render (a, 24000, 512);
    const auto second = render (b, 24000, 512);

    for (int i = 0; i < first.size(); ++i)
        CHECK_EQ (first.left[static_cast<std::size_t> (i)],
                  second.left[static_cast<std::size_t> (i)]);
}

BUD_TEST (Engine, renderedAudioIsIdenticalAtEveryBlockSize)
{
    // The audio equivalent of the sequencer's block-size test, and a much stricter one: it
    // covers the trigger-to-sample mapping and every stateful filter in the signal path.
    const auto reference = [] {
        Engine engine;
        setUpSingleKick (engine, 8192);
        gateEveryQuarter (engine.currentPattern().track (4));   // add a hat for high-frequency content
        return render (engine, 96000, 512);
    }();

    CHECK (reference.peak() > 0.1f);

    for (int blockSize : { 1, 7, 64, 333, 1024, 4096 })
    {
        Engine engine;
        setUpSingleKick (engine, 8192);
        gateEveryQuarter (engine.currentPattern().track (4));

        const auto out = render (engine, 96000, blockSize);

        double worst = 0.0;
        for (int i = 0; i < reference.size(); ++i)
            worst = std::max (worst, static_cast<double> (
                std::abs (out.left[static_cast<std::size_t> (i)]
                          - reference.left[static_cast<std::size_t> (i)])));

        CHECK_NEAR (worst, 0.0, 1.0e-6);
    }
}

BUD_TEST (Engine, kickOnsetLandsOnTheExpectedSample)
{
    Engine engine;
    setUpSingleKick (engine);

    auto& kick = engine.currentPattern().track (0);
    kick.variation (Variation::A)[0].gate = false;
    kick.variation (Variation::A)[4].gate = true;   // one quarter note in

    const auto out = render (engine, 48000, 512);
    const auto onset = out.firstCrossing (0.02f);

    CHECK (onset >= 0);
    CHECK_NEAR (static_cast<double> (onset), 4.0 * kSamplesPerSixteenth, 32.0);
}

BUD_TEST (Engine, muteSilencesATrack)
{
    Engine engine;
    setUpSingleKick (engine);
    engine.parameters().set (ParamKind::TrackMute, 0, 1.0f);

    const auto out = render (engine, 24000, 512);

    CHECK_EQ (out.peak(), 0.0f);
}

BUD_TEST (Engine, soloIsolatesATrack)
{
    Engine engine;
    setUpSingleKick (engine, 512);
    gateEveryQuarter (engine.currentPattern().track (4));

    const auto both = render (engine, 48000, 512);

    Engine soloed;
    setUpSingleKick (soloed, 512);
    gateEveryQuarter (soloed.currentPattern().track (4));
    soloed.setSolo (4);   // hats only

    const auto hatOnly = render (soloed, 48000, 512);

    CHECK (both.peak() > hatOnly.peak());
    CHECK (hatOnly.peak() > 0.0f);

    // Soloing overrides mute on the soloed track.
    soloed.parameters().set (ParamKind::TrackMute, 4, 1.0f);
    const auto stillAudible = render (soloed, 48000, 512);
    CHECK (stillAudible.peak() > 0.0f);
}

BUD_TEST (Engine, trackLevelScalesOutput)
{
    Engine engine;
    setUpSingleKick (engine);
    engine.parameters().set (ParamKind::TrackLevel, 0, 1.0f);
    const auto loud = render (engine, 24000, 512);

    Engine quieter;
    setUpSingleKick (quieter);
    quieter.parameters().set (ParamKind::TrackLevel, 0, 0.5f);
    const auto soft = render (quieter, 24000, 512);

    CHECK_NEAR (soft.peak(), loud.peak() * 0.5f, 1.0e-4);
}

BUD_TEST (Engine, masterVolumeScalesOutput)
{
    Engine engine;
    setUpSingleKick (engine);
    const auto full = render (engine, 24000, 512);

    Engine halved;
    setUpSingleKick (halved);
    halved.parameters().set (ParamKind::MasterVolume, 0.5f);
    const auto half = render (halved, 24000, 512);

    CHECK_NEAR (half.peak(), full.peak() * 0.5f, 1.0e-4);
}

BUD_TEST (Engine, parameterLockOverridesTheTrackValue)
{
    // A lock on decay must change the sound, and only for the step that carries it.
    Engine plain;
    setUpSingleKick (plain);
    plain.parameters().set (ParamKind::KickDecay, 0, 80.0f);
    const auto shortDecay = render (plain, 24000, 512);

    Engine locked;
    setUpSingleKick (locked);
    locked.parameters().set (ParamKind::KickDecay, 0, 80.0f);
    locked.currentPattern().track (0).variation (Variation::A)[0].locks.set (
        makeParamId (ParamKind::KickDecay, 0), 1500.0f);
    const auto longDecay = render (locked, 24000, 512);

    // Energy late in the buffer tells the two apart.
    const auto tailEnergy = [] (const Rendered& r)
    {
        double sum = 0.0;
        for (std::size_t i = 12000; i < r.left.size(); ++i)
            sum += static_cast<double> (r.left[i]) * r.left[i];
        return sum;
    };

    CHECK (tailEnergy (longDecay) > tailEnergy (shortDecay) * 4.0);
}

BUD_TEST (Engine, feelDriftMovesOnsetsWithoutLosingThem)
{
    Engine locked;
    setUpSingleKick (locked, 512);
    gateEveryQuarter (locked.currentPattern().track (0));
    const auto onGrid = render (locked, 96000, 512);

    Engine drifting;
    setUpSingleKick (drifting, 512);
    gateEveryQuarter (drifting.currentPattern().track (0));
    drifting.parameters().set (ParamKind::FeelDepth, 1.0f);
    drifting.parameters().set (ParamKind::Feel, static_cast<float> (FeelModel::M808));
    const auto drifted = render (drifting, 96000, 512);

    CHECK (drifted.allFinite());
    CHECK (drifted.peak() > 0.1f);

    // The audio must differ — drift that changes nothing is not drift...
    auto difference = 0.0f;
    for (int i = 0; i < onGrid.size(); ++i)
        difference = std::max (difference, std::abs (
            drifted.left[static_cast<std::size_t> (i)]
            - onGrid.left[static_cast<std::size_t> (i)]));

    CHECK (difference > 1.0e-3f);

    // ...but it must stay near the grid, not wander into a different beat.
    const auto onset = drifted.firstCrossing (0.02f);
    CHECK (onset >= 0);
    CHECK (onset < static_cast<int> (kSamplesPerSixteenth));
}

BUD_TEST (Engine, sampleVoicePlaysFromTheBank)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);
    engine.parameters().set (ParamKind::Tempo, static_cast<float> (kTempo));
    engine.parameters().set (ParamKind::FeelDepth, 0.0f);

    // Track 7 is a sampler track; give slot 0 of the S2 bank a short tone.
    auto& slot = engine.samples().bank (BankId::S2).slot (0);
    slot.sampleRate = kSampleRate;
    slot.left.assign (4800, 0.0f);
    for (std::size_t i = 0; i < slot.left.size(); ++i)
        slot.left[i] = 0.5f * std::sin (static_cast<float> (i) * 0.05f);

    engine.currentPattern().track (6).variation (Variation::A)[0].gate = true;
    engine.parameters().set (ParamKind::SampleSlot, 6, 0.0f);

    const auto out = render (engine, 24000, 512);

    CHECK (out.allFinite());
    CHECK (out.peak() > 0.05f);
}

BUD_TEST (Engine, emptySampleSlotStaysSilent)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);
    engine.parameters().set (ParamKind::Tempo, static_cast<float> (kTempo));
    engine.currentPattern().track (6).variation (Variation::A)[0].gate = true;

    const auto out = render (engine, 24000, 512);

    CHECK_EQ (out.peak(), 0.0f);
}

BUD_TEST (Engine, bassVoiceRespondsToNotesAndSlides)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);
    engine.parameters().set (ParamKind::Tempo, static_cast<float> (kTempo));
    engine.parameters().set (ParamKind::FeelDepth, 0.0f);

    auto& bass = engine.currentPattern().track (kBassTrack);
    auto& steps = bass.variation (Variation::A);

    steps[0].gate = true;
    steps[0].note = 0;
    steps[4].gate = true;
    steps[4].note = 12;
    steps[4].slide = true;

    const auto out = render (engine, 48000, 512);

    CHECK (out.allFinite());
    CHECK (out.peak() > 0.05f);
}

BUD_TEST (Engine, everyVoiceKindRendersWithoutBlowingUp)
{
    // Gate every track at once, with the sample tracks loaded, and confirm the whole
    // instrument stays finite and in range.
    Engine engine;
    engine.prepare (kSampleRate, 512);
    engine.parameters().set (ParamKind::Tempo, static_cast<float> (kTempo));

    for (auto bank : { BankId::S2, BankId::S4, BankId::S8 })
    {
        auto& slot = engine.samples().bank (bank).slot (0);
        slot.sampleRate = kSampleRate;
        slot.left.assign (9600, 0.0f);

        for (std::size_t i = 0; i < slot.left.size(); ++i)
            slot.left[i] = 0.4f * std::sin (static_cast<float> (i) * 0.03f);

        if (isStereo (bank))
            slot.right = slot.left;
    }

    for (int track = 0; track < kNumTracks; ++track)
    {
        auto& pattern = engine.currentPattern().track (track);
        gateEveryQuarter (pattern);
    }

    // Push the bass hard, where instability would show first.
    engine.parameters().set (ParamKind::BassResonance, kBassTrack, 1.0f);
    engine.parameters().set (ParamKind::BassOverdrive, kBassTrack, 1.0f);
    engine.parameters().set (ParamKind::BassEnvMod, kBassTrack, 1.0f);

    const auto out = render (engine, 96000 * 2, 512);

    CHECK (out.allFinite());
    CHECK (out.peak() > 0.1f);
    CHECK (out.peak() < 8.0f);   // headroom before the master limiter arrives with the FX bus
}

BUD_TEST (Engine, patternSelectionSwitchesContent)
{
    Engine engine;
    setUpSingleKick (engine);

    engine.patterns().pattern (1).track (0).variation (Variation::A)[0].gate = false;

    engine.selectPattern (1);
    const auto empty = render (engine, 24000, 512);
    CHECK_EQ (empty.peak(), 0.0f);
    CHECK_EQ (engine.patternIndex(), 1);

    engine.selectPattern (0);
    const auto audible = render (engine, 24000, 512);
    CHECK (audible.peak() > 0.1f);
}
