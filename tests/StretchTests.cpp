#include "TestFramework.h"

#include "core/Engine.h"
#include "core/dsp/TimeStretch.h"

#include <algorithm>
#include <cmath>
#include <numbers>
#include <vector>

using namespace bud;

namespace
{

constexpr double kSampleRate = 48000.0;

/// A pure tone, so pitch can be measured by counting zero crossings.
SampleData makeTone (float frequency, double seconds, double beats)
{
    SampleData sample;
    sample.sampleRate = kSampleRate;
    sample.sourceBeats = beats;

    const auto length = static_cast<int> (kSampleRate * seconds);
    sample.left.assign (static_cast<std::size_t> (length), 0.0f);

    for (int i = 0; i < length; ++i)
    {
        const auto phase = 2.0 * std::numbers::pi * static_cast<double> (i)
                         * static_cast<double> (frequency) / kSampleRate;
        sample.left[static_cast<std::size_t> (i)] = static_cast<float> (std::sin (phase)) * 0.8f;
    }

    sample.right = sample.left;
    return sample;
}

/// Frequency of a buffer, from its zero-crossing rate. Ignores the first and last tenth, where
/// window fades can add spurious crossings.
double measureFrequency (const std::vector<float>& data)
{
    const auto from = data.size() / 10;
    const auto to = data.size() - data.size() / 10;

    if (to <= from + 2)
        return 0.0;

    int crossings = 0;

    for (auto i = from + 1; i < to; ++i)
        if ((data[i - 1] < 0.0f) != (data[i] < 0.0f))
            ++crossings;

    const auto seconds = static_cast<double> (to - from) / kSampleRate;
    return static_cast<double> (crossings) / 2.0 / seconds;
}

/// Run the stretcher for a fixed span and return its output.
std::vector<float> stretchOutput (const SampleData& source, double pitchRatio, double speedRatio,
                                 bool looping, int totalSamples, int blockSize = 512)
{
    dsp::TimeStretch stretch;
    stretch.prepare (kSampleRate);
    stretch.setSource (&source, 0.0, static_cast<double> (source.length()));
    stretch.setRatios (pitchRatio, speedRatio);
    stretch.setLooping (looping);
    stretch.rewind();

    std::vector<float> left (static_cast<std::size_t> (totalSamples), 0.0f);
    std::vector<float> right (static_cast<std::size_t> (totalSamples), 0.0f);

    for (int position = 0; position < totalSamples; position += blockSize)
    {
        const auto count = std::min (blockSize, totalSamples - position);
        stretch.process (left.data() + position, right.data() + position, count);
    }

    return left;
}

} // namespace

//==============================================================================

BUD_TEST (Stretch, unityRatiosPassTheToneThrough)
{
    const auto source = makeTone (300.0f, 2.0, 4.0);
    const auto out = stretchOutput (source, 1.0, 1.0, true, 48000);

    // At 1:1 the stretcher must be transparent in pitch. The Hann halves of a 50 % overlap sum
    // to exactly one, so level is preserved too.
    CHECK_NEAR (measureFrequency (out), 300.0, 6.0);

    auto peak = 0.0f;
    for (auto v : out)
        peak = std::max (peak, std::abs (v));

    CHECK (peak > 0.5f);
    CHECK (peak < 1.0f);
}

BUD_TEST (Stretch, unityRatiosReproduceTheSourceSampleForSample)
{
    // Stronger than matching the pitch: at 1:1 the output should *be* the source. It only is if
    // the correlation search settles on zero displacement, which needs ties among period-aligned
    // offsets to resolve toward the centre. All that should remain is interpolation error, and at
    // zero displacement the interpolator is reading whole samples, so even that is small.
    const auto source = makeTone (300.0f, 2.0, 4.0);
    const auto out = stretchOutput (source, 1.0, 1.0, true, 48000);

    auto worst = 0.0f;

    // Skip the first window, which fades up from an empty overlap buffer.
    for (std::size_t i = 4800; i < 46000; ++i)
        worst = std::max (worst, std::abs (out[i] - source.left[i]));

    CHECK (worst < 0.005f);
}

BUD_TEST (Stretch, levelStaysFlatWhileStretching)
{
    // The artefact that gives cheap stretching away is amplitude ripple at the window rate: it
    // happens when the joins are not phase-aligned and the cross-fade partially cancels. On
    // periodic material a working correlation search should hold the level dead flat, so any
    // meaningful ripple here means the search is not finding the period.
    const auto source = makeTone (300.0f, 2.0, 4.0);

    for (double pitch : { 0.5, 1.0, 1.5, 2.0 })
    {
        for (double speed : { 0.5, 1.0, 2.0 })
        {
            const auto out = stretchOutput (source, pitch, speed, true, 48000);

            auto lowest = 1.0e9f;
            auto highest = 0.0f;

            // Peak per 10 ms, which is shorter than the 23 ms hop, so ripple at the window rate
            // shows up as a difference between windows rather than being averaged away.
            for (std::size_t w = 4800; w + 480 < out.size(); w += 480)
            {
                auto peak = 0.0f;

                for (std::size_t i = w; i < w + 480; ++i)
                    peak = std::max (peak, std::abs (out[i]));

                lowest = std::min (lowest, peak);
                highest = std::max (highest, peak);
            }

            // Half a decibel. Measured ripple is under 0.02 dB; this leaves room for the
            // interpolator without leaving room for a mis-aligned join.
            CHECK (highest < lowest * 1.06f);
        }
    }
}

BUD_TEST (Stretch, pitchRatioTransposesWithoutChangingSpeed)
{
    // This is the melodic case: the pitch moves and the rate of travel through the source does
    // not. A resampler cannot do this — it is the reason the stretcher exists.
    const auto source = makeTone (200.0f, 3.0, 4.0);

    CHECK_NEAR (measureFrequency (stretchOutput (source, 1.0, 1.0, true, 48000)), 200.0, 5.0);
    CHECK_NEAR (measureFrequency (stretchOutput (source, 2.0, 1.0, true, 48000)), 400.0, 10.0);
    CHECK_NEAR (measureFrequency (stretchOutput (source, 0.5, 1.0, true, 48000)), 100.0, 5.0);
}

BUD_TEST (Stretch, speedRatioTravelsFasterWithoutTransposing)
{
    // The rhythmic case: following a tempo change must not raise the pitch.
    const auto source = makeTone (250.0f, 3.0, 4.0);

    for (double speed : { 0.75, 1.0, 1.5, 2.0 })
    {
        const auto measured = measureFrequency (stretchOutput (source, 1.0, speed, true, 48000));
        CHECK_NEAR (measured, 250.0, 8.0);
    }
}

BUD_TEST (Stretch, speedRatioActuallyChangesHowFarThroughTheSourceItGets)
{
    // A speed ratio that did nothing would pass the pitch test above for the wrong reason, so
    // check it is genuinely travelling: a rising sweep read faster arrives higher.
    SampleData sweep;
    sweep.sampleRate = kSampleRate;
    const auto length = static_cast<int> (kSampleRate * 4.0);
    sweep.left.assign (static_cast<std::size_t> (length), 0.0f);

    double phase = 0.0;
    for (int i = 0; i < length; ++i)
    {
        const auto progress = static_cast<double> (i) / static_cast<double> (length);
        const auto hz = 200.0 + progress * 800.0;
        phase += 2.0 * std::numbers::pi * hz / kSampleRate;
        sweep.left[static_cast<std::size_t> (i)] = static_cast<float> (std::sin (phase)) * 0.8f;
    }
    sweep.right = sweep.left;

    // Read one second of output at each speed and see where in the sweep it ended up.
    const auto slow = stretchOutput (sweep, 1.0, 0.5, false, 48000);
    const auto fast = stretchOutput (sweep, 1.0, 2.0, false, 48000);

    CHECK (measureFrequency (fast) > measureFrequency (slow) + 50.0);
}

BUD_TEST (Stretch, pitchAndSpeedAreIndependent)
{
    // The property the six loop modes are built on: either can move without the other.
    const auto source = makeTone (200.0f, 3.0, 4.0);

    // Pitch up, speed unchanged.
    CHECK_NEAR (measureFrequency (stretchOutput (source, 2.0, 1.0, true, 48000)), 400.0, 10.0);

    // Speed up, pitch unchanged.
    CHECK_NEAR (measureFrequency (stretchOutput (source, 1.0, 2.0, true, 48000)), 200.0, 8.0);

    // Both — which is what plain resampling gives, and is the third documented mode.
    CHECK_NEAR (measureFrequency (stretchOutput (source, 2.0, 2.0, true, 48000)), 400.0, 10.0);
}

BUD_TEST (Stretch, outputIsIdenticalAtEveryBlockSize)
{
    // WSOLA keeps an analysis window and a correlation history across calls, which makes it the
    // most block-size-sensitive thing in the engine. The analysis position is derived from total
    // output produced rather than accumulated per call, precisely so this holds.
    const auto source = makeTone (220.0f, 3.0, 4.0);
    const auto reference = stretchOutput (source, 1.5, 0.8, true, 96000, 512);

    for (int blockSize : { 1, 7, 64, 333, 1024, 4096 })
    {
        const auto out = stretchOutput (source, 1.5, 0.8, true, 96000, blockSize);

        double worst = 0.0;
        for (std::size_t i = 0; i < reference.size(); ++i)
            worst = std::max (worst, static_cast<double> (std::abs (out[i] - reference[i])));

        CHECK_NEAR (worst, 0.0, 1.0e-6);
    }
}

BUD_TEST (Stretch, loopingRunsIndefinitelyAndOneShotStops)
{
    const auto source = makeTone (300.0f, 0.5, 1.0);

    // Looping: still producing signal well past the end of the source.
    const auto looped = stretchOutput (source, 1.0, 1.0, true, 96000);

    double lateEnergy = 0.0;
    for (auto i = looped.size() * 3 / 4; i < looped.size(); ++i)
        lateEnergy += static_cast<double> (looped[i]) * looped[i];

    CHECK (lateEnergy > 1.0);

    // One-shot: silent once it has run out.
    const auto once = stretchOutput (source, 1.0, 1.0, false, 96000);

    double tailEnergy = 0.0;
    for (auto i = once.size() * 3 / 4; i < once.size(); ++i)
        tailEnergy += static_cast<double> (once[i]) * once[i];

    CHECK (tailEnergy < 0.01);
}

BUD_TEST (Stretch, staysBoundedAtExtremeRatios)
{
    const auto source = makeTone (400.0f, 1.0, 2.0);

    for (double pitch : { 0.05, 0.5, 1.0, 4.0, 16.0 })
    {
        for (double speed : { 0.05, 1.0, 8.0 })
        {
            const auto out = stretchOutput (source, pitch, speed, true, 24000);

            for (auto v : out)
            {
                CHECK (std::isfinite (v));
                CHECK (std::abs (v) < 4.0f);
            }
        }
    }
}

BUD_TEST (Stretch, emptySourceIsSilentRatherThanUndefined)
{
    SampleData empty;
    dsp::TimeStretch stretch;
    stretch.prepare (kSampleRate);
    stretch.setSource (&empty, 0.0, 0.0);
    stretch.setRatios (1.0, 1.0);

    std::vector<float> l (1024, 1.0f), r (1024, 1.0f);
    stretch.process (l.data(), r.data(), 1024);

    for (std::size_t i = 0; i < l.size(); ++i)
    {
        CHECK_EQ (l[i], 0.0f);
        CHECK_EQ (r[i], 0.0f);
    }
}

//==============================================================================
// Through the engine, on the loop track

namespace
{

/// An engine with a tone in S8 slot 0 and the loop track gated on step 0.
void setUpLoopTrack (Engine& engine, LoopMode mode, int tune = kRawCentre, int tempo = 120,
                     int blockSize = 512)
{
    engine.prepare (kSampleRate, blockSize);
    engine.parameters().set (ParamKind::Tempo, tempo);
    engine.parameters().set (ParamKind::Feel, static_cast<int> (FeelModel::M909));

    engine.sounds().userSlot (SoundBank::S8, 0) = makeTone (220.0f, 2.0, 4.0);

    engine.currentPattern().track (kLoopTrack).variation (Variation::A)[0].gate = true;
    engine.parameters().set (ParamKind::TrackSoundBank, kLoopTrack,
                             static_cast<int> (SoundBank::S8));
    engine.parameters().set (ParamKind::TrackLoopMode, kLoopTrack, static_cast<int> (mode));
    engine.parameters().set (ParamKind::TrackTune, kLoopTrack, tune);
    engine.parameters().set (ParamKind::TrackDecay, kLoopTrack, 127);   // full region length
}

std::vector<float> renderEngine (Engine& engine, int totalSamples, int blockSize = 512)
{
    std::vector<float> left (static_cast<std::size_t> (totalSamples), 0.0f);
    std::vector<float> right (static_cast<std::size_t> (totalSamples), 0.0f);

    engine.start();

    for (int position = 0; position < totalSamples; position += blockSize)
    {
        const auto count = std::min (blockSize, totalSamples - position);
        engine.process (left.data() + position, right.data() + position, count);
    }

    return left;
}

/// +12 semitones, in the raw domain the shared tune law uses (+/- 24 over 0-127).
constexpr int kOctaveUp = kRawCentre + (kRawMax - kRawCentre) / 2;

/** Tempo and render length for the tests that measure how long a one-shot plays for.

    The gate sits on step 0, so the pattern re-fires the loop every time it comes round: sixteen
    16ths, or 240 / tempo seconds. Any measurement of "how long did it play" has to finish inside
    one repetition, or it reports the end of the buffer for every mode. At 50 bpm a repetition is
    4.8 s, which leaves room for the slowest case here (rhythmic at pitch 1 runs 4.79 s) while the
    4 s render still stops short of the retrigger.
*/
constexpr int kSlowTempo = 50;
constexpr int kInsideOnePattern = static_cast<int> (kSampleRate * 4.0);

} // namespace

BUD_TEST (Stretch, melodicModeHoldsLengthWhileNoStretchDoesNot)
{
    // Transposing a melodic loop must not change how long it takes; transposing an unstretched
    // one must (p. 70). Measured by how far the one-shot gets before falling silent.
    const auto playedLength = [] (LoopMode mode, int tune)
    {
        Engine engine;
        setUpLoopTrack (engine, mode, tune, kSlowTempo);

        const auto out = renderEngine (engine, kInsideOnePattern);

        // Last sample above a small threshold.
        for (auto i = out.size(); i > 0; --i)
            if (std::abs (out[i - 1]) > 0.005f)
                return static_cast<int> (i);

        return 0;
    };

    const auto melodicPlain = playedLength (LoopMode::OneShotMelodic, kRawCentre);
    const auto melodicUp = playedLength (LoopMode::OneShotMelodic, kOctaveUp);

    CHECK (melodicPlain > 0);

    // Melodic: transposing up an octave leaves the duration alone.
    CHECK_NEAR (static_cast<double> (melodicUp), static_cast<double> (melodicPlain),
                static_cast<double> (melodicPlain) * 0.15);

    // No stretch: the same transposition halves it, because pitch and speed move together.
    const auto plainPlain = playedLength (LoopMode::OneShotNoStretch, kRawCentre);
    const auto plainUp = playedLength (LoopMode::OneShotNoStretch, kOctaveUp);

    CHECK (plainPlain > 0);
    CHECK (plainUp < plainPlain * 3 / 4);
}

BUD_TEST (Stretch, rhythmicModeHoldsPitchAcrossTempoChanges)
{
    // Following the tempo must not transpose the loop (p. 70).
    const auto pitchAtTempo = [] (LoopMode mode, int tempo)
    {
        Engine engine;
        setUpLoopTrack (engine, mode, kRawCentre, tempo);

        // 1.2 s, which is inside one pattern repetition at both tempos measured below and inside
        // the playout of the source at both, so the whole window is uninterrupted tone.
        return measureFrequency (renderEngine (engine, static_cast<int> (kSampleRate * 1.2)));
    };

    const auto slow = pitchAtTempo (LoopMode::LoopRhythmic, 100);
    const auto fast = pitchAtTempo (LoopMode::LoopRhythmic, 160);

    CHECK (slow > 100.0);
    CHECK_NEAR (fast, slow, slow * 0.08);

    // The unstretched mode is the control: there, tempo following does move the pitch, because
    // it can only be done by changing the rate.
    const auto plainSlow = pitchAtTempo (LoopMode::LoopNoStretch, 100);
    const auto plainFast = pitchAtTempo (LoopMode::LoopNoStretch, 160);

    // No stretch ignores tempo entirely, so both are the source pitch — which is itself the
    // point: without a stretcher there is no tempo following at all.
    CHECK_NEAR (plainFast, plainSlow, plainSlow * 0.08);
}

BUD_TEST (Stretch, allSixLoopModesAreDistinctlyImplemented)
{
    // Before the stretcher existed, four of the six modes behaved identically to the other two.
    // Render each and confirm no two are the same buffer.
    //
    // The render has to outlast every one-shot's playout, or a looping mode and its one-shot
    // counterpart differ only in material neither has reached yet: at this tempo and pitch they
    // end at 1.0 s (no stretch), 2.0 s (melodic) and 2.4 s (rhythmic).
    std::vector<std::vector<float>> renders;

    for (int mode = 0; mode < kNumLoopModes; ++mode)
    {
        Engine engine;
        setUpLoopTrack (engine, static_cast<LoopMode> (mode), kOctaveUp, kSlowTempo);
        renders.push_back (renderEngine (engine, kInsideOnePattern));
    }

    for (std::size_t a = 0; a < renders.size(); ++a)
    {
        auto energy = 0.0;
        for (auto v : renders[a])
            energy += static_cast<double> (v) * v;

        CHECK (energy > 0.1);   // every mode makes sound

        for (auto b = a + 1; b < renders.size(); ++b)
        {
            auto difference = 0.0f;
            for (std::size_t i = 0; i < renders[a].size(); ++i)
                difference = std::max (difference, std::abs (renders[a][i] - renders[b][i]));

            CHECK (difference > 1.0e-4f);
        }
    }
}

BUD_TEST (Stretch, engineStaysBlockSizeInvariantWithTheLoopTrackStretching)
{
    const auto build = [] (int blockSize)
    {
        Engine engine;
        setUpLoopTrack (engine, LoopMode::LoopRhythmic, kOctaveUp, 140, 8192);
        return renderEngine (engine, 96000, blockSize);
    };

    const auto reference = build (512);

    for (int blockSize : { 1, 7, 64, 333, 1024, 4096 })
    {
        const auto out = build (blockSize);

        double worst = 0.0;
        for (std::size_t i = 0; i < reference.size(); ++i)
            worst = std::max (worst, static_cast<double> (std::abs (out[i] - reference[i])));

        CHECK_NEAR (worst, 0.0, 1.0e-6);
    }
}
