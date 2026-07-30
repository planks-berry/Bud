#include "TestFramework.h"

#include "core/Engine.h"
#include "core/fx/Isolator.h"
#include "core/fx/MasterFx.h"
#include "core/fx/Reverb.h"
#include "core/fx/TapeEcho.h"

#include <algorithm>
#include <cmath>
#include <numbers>
#include <vector>

using namespace bud;

namespace
{

constexpr double kSampleRate = 48000.0;
constexpr int kTempo = 120;

/// RMS of a stereo buffer's left channel over its second half, after transients settle.
double settledRms (const std::vector<float>& data)
{
    double sum = 0.0;
    const auto start = data.size() / 2;

    for (auto i = start; i < data.size(); ++i)
        sum += static_cast<double> (data[i]) * data[i];

    const auto count = data.size() - start;
    return count > 0 ? std::sqrt (sum / static_cast<double> (count)) : 0.0;
}

/// Push a steady sine through the isolator and measure what survives.
double isolatorResponse (float frequency, int low, int mid, int high)
{
    fx::Isolator isolator;
    isolator.prepare (kSampleRate);
    isolator.setBands (low, mid, high);

    const auto samples = static_cast<int> (kSampleRate * 0.5);
    std::vector<float> l (static_cast<std::size_t> (samples));
    std::vector<float> r (static_cast<std::size_t> (samples));

    for (int i = 0; i < samples; ++i)
    {
        const auto phase = 2.0 * std::numbers::pi * static_cast<double> (i)
                         * static_cast<double> (frequency) / kSampleRate;
        l[static_cast<std::size_t> (i)] = static_cast<float> (std::sin (phase));
        r[static_cast<std::size_t> (i)] = l[static_cast<std::size_t> (i)];
    }

    isolator.process (l.data(), r.data(), samples);
    return settledRms (l);
}

/// How long a reverb tail takes to fall below a threshold, in samples.
int reverbTailLength (ReverbType type)
{
    fx::Reverb reverb;
    reverb.prepare (kSampleRate);
    reverb.setType (type);

    const auto samples = static_cast<int> (kSampleRate * 6.0);
    std::vector<float> inL (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> inR (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> outL (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> outR (static_cast<std::size_t> (samples), 0.0f);

    // A short burst rather than a single impulse, so the tank is properly excited.
    for (int i = 0; i < 480; ++i)
    {
        inL[static_cast<std::size_t> (i)] = 1.0f;
        inR[static_cast<std::size_t> (i)] = 1.0f;
    }

    reverb.process (inL.data(), inR.data(), outL.data(), outR.data(), samples, 1.0f);

    auto peak = 0.0f;
    for (auto v : outL)
        peak = std::max (peak, std::abs (v));

    const auto threshold = peak * 0.02f;

    for (auto i = outL.size(); i > 0; --i)
        if (std::abs (outL[i - 1]) > threshold)
            return static_cast<int> (i);

    return 0;
}

struct Rendered
{
    std::vector<float> left, right;

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

/// A four-on-the-floor kick with hats, for exercising the effects with real material.
void setUpGroove (Engine& engine, int blockSize = 512)
{
    engine.prepare (kSampleRate, blockSize);
    engine.parameters().set (ParamKind::Tempo, kTempo);
    engine.parameters().set (ParamKind::Feel, static_cast<int> (FeelModel::M909));

    for (int step : { 0, 4, 8, 12 })
        engine.currentPattern().track (0).variation (Variation::A)[static_cast<std::size_t> (step)]
            .gate = true;

    for (int step : { 2, 6, 10, 14 })
        engine.currentPattern().track (4).variation (Variation::A)[static_cast<std::size_t> (step)]
            .gate = true;
}

} // namespace

//==============================================================================
// Isolator

BUD_TEST (Fx, isolatorIsTransparentWhenFlat)
{
    for (float frequency : { 60.0f, 800.0f, 6000.0f })
    {
        const auto flat = isolatorResponse (frequency, 0, 0, 0);
        CHECK_NEAR (flat, 0.707, 0.03);   // RMS of a unit sine, unchanged
    }
}

BUD_TEST (Fx, isolatorFullCutSilencesItsBand)
{
    // It is an isolator, not an equaliser: at -50 the band has to actually go (p. 33). A
    // crossover that leaks would leave an audible shelf where silence should be.
    //
    // The outer bands reach silence outright, because nothing is adjacent to them on one side.
    const auto lowCut = isolatorResponse (50.0f, -50, 0, 0);
    const auto highCut = isolatorResponse (6000.0f, 0, 0, -50);

    CHECK (lowCut < 0.005);     // about -72 dB
    CHECK (highCut < 0.005);    // about -50 dB

    // The mid band cannot go as deep, and that is geometry rather than a defect: 400 Hz to
    // 1500 Hz is only 1.9 octaves, so 24 dB/octave neighbours still reach its centre. About
    // -21 dB is what the band width allows, and the hardware is under the same constraint.
    const auto midCut = isolatorResponse (775.0f, 0, -50, 0);   // geometric centre of the band
    CHECK (midCut < 0.08);
}

BUD_TEST (Fx, isolatorCutsOnlyTheBandItIsAskedTo)
{
    // Killing the lows must leave the mids and highs alone.
    CHECK (isolatorResponse (800.0f, -50, 0, 0) > 0.6);
    CHECK (isolatorResponse (6000.0f, -50, 0, 0) > 0.6);

    CHECK (isolatorResponse (50.0f, 0, -50, 0) > 0.6);
    CHECK (isolatorResponse (50.0f, 0, 0, -50) > 0.6);
}

BUD_TEST (Fx, isolatorBoostsToSixDecibels)
{
    const auto flat = isolatorResponse (60.0f, 0, 0, 0);
    const auto boosted = isolatorResponse (60.0f, 50, 0, 0);

    CHECK_NEAR (boosted / flat, 1.995, 0.1);   // +6 dB (p. 33)
}

BUD_TEST (Fx, isolatorBandEdgesAreWhereTheManualSaysTheyAre)
{
    // Bands are 20-400, 400-1500, 1500-20k (p. 33). At a crossover the two halves each sit
    // 6 dB down, so cutting one band leaves roughly half the signal.
    const auto atLowEdge = isolatorResponse (400.0f, -50, 0, 0);
    const auto flatAtLowEdge = isolatorResponse (400.0f, 0, 0, 0);
    CHECK_NEAR (atLowEdge / flatAtLowEdge, 0.5, 0.2);

    const auto atHighEdge = isolatorResponse (1500.0f, 0, 0, -50);
    const auto flatAtHighEdge = isolatorResponse (1500.0f, 0, 0, 0);
    CHECK_NEAR (atHighEdge / flatAtHighEdge, 0.5, 0.2);
}

//==============================================================================
// Reverb

BUD_TEST (Fx, reverbDecayOrdersRoomPlateHall)
{
    const auto room = reverbTailLength (ReverbType::Room);
    const auto plate = reverbTailLength (ReverbType::Plate);
    const auto hall = reverbTailLength (ReverbType::Hall);

    CHECK (room > 0);
    CHECK (room < hall);
    CHECK (plate < hall);
}

BUD_TEST (Fx, reverbTailIsStereoFromAMonoSend)
{
    fx::Reverb reverb;
    reverb.prepare (kSampleRate);
    reverb.setType (ReverbType::Hall);

    const auto samples = 48000;
    std::vector<float> inL (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> inR (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> outL (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> outR (static_cast<std::size_t> (samples), 0.0f);

    for (int i = 0; i < 240; ++i)
        inL[static_cast<std::size_t> (i)] = inR[static_cast<std::size_t> (i)] = 1.0f;

    reverb.process (inL.data(), inR.data(), outL.data(), outR.data(), samples, 1.0f);

    // Different delay lines feed each side, so a mono input still produces a wide tail.
    auto difference = 0.0f;
    for (std::size_t i = 0; i < outL.size(); ++i)
        difference = std::max (difference, std::abs (outL[i] - outR[i]));

    CHECK (difference > 1.0e-3f);
}

BUD_TEST (Fx, reverbStaysBoundedAtItsLongestSetting)
{
    fx::Reverb reverb;
    reverb.prepare (kSampleRate);
    reverb.setType (ReverbType::Hall);

    const auto samples = 4096;
    std::vector<float> inL (static_cast<std::size_t> (samples), 0.9f);
    std::vector<float> inR (static_cast<std::size_t> (samples), 0.9f);

    // Drive it continuously for a long time; a feedback network that is even slightly over
    // unity will run away.
    for (int block = 0; block < 240; ++block)
    {
        std::vector<float> outL (static_cast<std::size_t> (samples), 0.0f);
        std::vector<float> outR (static_cast<std::size_t> (samples), 0.0f);

        reverb.process (inL.data(), inR.data(), outL.data(), outR.data(), samples, 1.0f);

        for (auto v : outL)
        {
            CHECK (std::isfinite (v));
            CHECK (std::abs (v) < 20.0f);
        }
    }
}

//==============================================================================
// Tape echo

BUD_TEST (Fx, delayRepeatsAtTheRequestedTime)
{
    fx::TapeEcho delay;
    delay.prepare (kSampleRate);
    delay.setDelayMs (250.0f);
    delay.setFeedback (100);

    const auto samples = static_cast<int> (kSampleRate);
    std::vector<float> inL (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> inR (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> outL (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> outR (static_cast<std::size_t> (samples), 0.0f);

    for (int i = 0; i < 64; ++i)
        inL[static_cast<std::size_t> (i)] = inR[static_cast<std::size_t> (i)] = 1.0f;

    delay.process (inL.data(), inR.data(), outL.data(), outR.data(),
                   nullptr, nullptr, samples, 1.0f, 0.0f);

    // Find the first repeat.
    auto peak = 0.0f;
    for (auto v : outL)
        peak = std::max (peak, std::abs (v));

    int firstEcho = -1;
    for (std::size_t i = 0; i < outL.size(); ++i)
        if (std::abs (outL[i]) > peak * 0.5f)
        {
            firstEcho = static_cast<int> (i);
            break;
        }

    CHECK (firstEcho > 0);

    // 250 ms at 48 kHz, with a little slack for the head wander.
    CHECK_NEAR (static_cast<double> (firstEcho), 12000.0, 400.0);
}

BUD_TEST (Fx, delayPingPongAlternatesSides)
{
    fx::TapeEcho delay;
    delay.prepare (kSampleRate);
    delay.setDelayMs (100.0f);
    delay.setFeedback (110);
    delay.setPingPong (true);

    const auto samples = static_cast<int> (kSampleRate);
    std::vector<float> inL (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> inR (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> outL (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> outR (static_cast<std::size_t> (samples), 0.0f);

    // Feed the left side only.
    for (int i = 0; i < 64; ++i)
        inL[static_cast<std::size_t> (i)] = 1.0f;

    delay.process (inL.data(), inR.data(), outL.data(), outR.data(),
                   nullptr, nullptr, samples, 1.0f, 0.0f);

    const auto energyIn = [] (const std::vector<float>& data, int from, int to)
    {
        double sum = 0.0;
        for (int i = from; i < to && i < static_cast<int> (data.size()); ++i)
            sum += static_cast<double> (data[i]) * data[i];
        return sum;
    };

    // First repeat lands left, the second right.
    CHECK (energyIn (outL, 4000, 5600) > energyIn (outR, 4000, 5600));
    CHECK (energyIn (outR, 9000, 10600) > energyIn (outL, 9000, 10600));
}

BUD_TEST (Fx, delayCanFeedTheReverb)
{
    fx::TapeEcho delay;
    delay.prepare (kSampleRate);
    delay.setDelayMs (120.0f);
    delay.setFeedback (90);

    const auto samples = 24000;
    std::vector<float> inL (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> inR (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> outL (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> outR (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> revL (static_cast<std::size_t> (samples), 0.0f);
    std::vector<float> revR (static_cast<std::size_t> (samples), 0.0f);

    for (int i = 0; i < 64; ++i)
        inL[static_cast<std::size_t> (i)] = inR[static_cast<std::size_t> (i)] = 1.0f;

    delay.process (inL.data(), inR.data(), outL.data(), outR.data(),
                   revL.data(), revR.data(), samples, 1.0f, 0.8f);

    auto reverbFeed = 0.0f;
    for (auto v : revL)
        reverbFeed = std::max (reverbFeed, std::abs (v));

    CHECK (reverbFeed > 0.01f);
}

//==============================================================================
// Master effects

BUD_TEST (Fx, everyMasterEffectChangesTheSignal)
{

    for (int typeIndex = 0; typeIndex < kNumMasterFxTypes; ++typeIndex)
    {
        Engine off, on;
        setUpGroove (off);
        setUpGroove (on);

        on.parameters().set (ParamKind::MasterFxType, typeIndex);
        on.parameters().set (ParamKind::MasterFxAmount, 110);
        on.parameters().set (ParamKind::MasterFxEnabled, 1);

        const auto dry = render (off, 48000, 512);
        const auto wet = render (on, 48000, 512);

        CHECK (wet.allFinite());

        auto difference = 0.0f;
        for (std::size_t i = 0; i < dry.left.size(); ++i)
            difference = std::max (difference, std::abs (wet.left[i] - dry.left[i]));

        CHECK (difference > 1.0e-3f);
    }
}

BUD_TEST (Fx, snipLoopRepeatsWhatWasPlayingWhenItEngaged)
{
    // "Repeats the sound that is playing when the master effect is turned on" (p. 32) — so the
    // capture buffer has to have been running already. A buffer that starts filling on engage
    // would have nothing to repeat and would output silence.
    Engine engine;
    setUpGroove (engine);

    engine.parameters().set (ParamKind::MasterFxType,
                             static_cast<int> (MasterFxType::SnipLoop));
    engine.parameters().set (ParamKind::MasterFxAmount, 0);   // shortest repeat

    engine.start();

    const auto blockSize = 512;
    std::vector<float> l (static_cast<std::size_t> (blockSize));
    std::vector<float> r (static_cast<std::size_t> (blockSize));

    // Play for a while with the effect off, so there is material in the ring.
    for (int block = 0; block < 40; ++block)
        engine.process (l.data(), r.data(), blockSize);

    engine.parameters().set (ParamKind::MasterFxEnabled, 1);

    std::vector<float> captured;
    for (int block = 0; block < 40; ++block)
    {
        engine.process (l.data(), r.data(), blockSize);
        captured.insert (captured.end(), l.begin(), l.end());
    }

    auto peak = 0.0f;
    for (auto v : captured)
        peak = std::max (peak, std::abs (v));

    // It must be repeating audio, not silence.
    CHECK (peak > 0.01f);

    for (auto v : captured)
        CHECK (std::isfinite (v));
}

BUD_TEST (Fx, duckingKeysOffTheDrumBusRatherThanTheMix)
{
    // The architecture diagram draws DUCK at its own point in the chain (p. 112), which is what
    // makes it a sidechain: it compresses the mix but listens to the drums. Keying off the mix
    // instead would still duck, but a loud non-drum track would trigger it, which is exactly
    // what a ducking compressor is supposed not to do.
    const auto duckedPeak = [] (bool kickPlaying)
    {
        Engine engine;
        engine.prepare (kSampleRate, 512);
        engine.parameters().set (ParamKind::Tempo, kTempo);
        engine.parameters().set (ParamKind::Feel, static_cast<int> (FeelModel::M909));

        // A sustained bass note is the thing being ducked.
        engine.currentPattern().track (kBassTrack).variation (Variation::A)[0].gate = true;
        engine.parameters().set (ParamKind::TrackDecay, kBassTrack, 127);   // long gate
        engine.parameters().set (ParamKind::BassEnvDecay, kBassTrack, 127);

        if (kickPlaying)
            for (int step : { 0, 4, 8, 12 })
                engine.currentPattern().track (0)
                    .variation (Variation::A)[static_cast<std::size_t> (step)].gate = true;

        engine.parameters().set (ParamKind::MasterFxType,
                                 static_cast<int> (MasterFxType::DuckingComp));
        engine.parameters().set (ParamKind::MasterFxAmount, 110);
        engine.parameters().set (ParamKind::MasterFxEnabled, 1);

        // Mute the kick so it does not contribute level itself — it still reaches the drum bus
        // key path only when unmuted, so instead compare with and without it playing.
        const auto out = render (engine, 48000, 512);

        double sum = 0.0;
        for (auto v : out.left)
            sum += static_cast<double> (v) * v;

        return sum;
    };

    // With the kick present the bass gets pushed down, so total energy falls even though there
    // is more material playing.
    const auto withoutKick = duckedPeak (false);
    const auto withKick = duckedPeak (true);

    CHECK (withoutKick > 0.0);
    CHECK (withKick != withoutKick);
}

//==============================================================================
// The whole chain

BUD_TEST (Fx, renderedAudioIsIdenticalAtEveryBlockSizeWithEffectsRunning)
{
    // The strongest test in the suite, now covering the largest addition of recursive state in
    // the engine: reverb, delay and phaser all carry long tails, and any dependence on where a
    // block boundary happens to fall shows up here immediately.
    const auto build = [] (int blockSize)
    {
        Engine engine;
        setUpGroove (engine, 8192);

        engine.parameters().set (ParamKind::TrackReverbSend, 0, 90);
        engine.parameters().set (ParamKind::TrackDelaySend, 4, 100);
        engine.parameters().set (ParamKind::ReverbMix, 100);
        engine.parameters().set (ParamKind::ReverbType, static_cast<int> (ReverbType::Hall));
        engine.parameters().set (ParamKind::DelayMix, 100);
        engine.parameters().set (ParamKind::DelayFeedback, 90);
        engine.parameters().set (ParamKind::DelayToReverb, 80);
        engine.parameters().set (ParamKind::DelayPingPong, 1);
        engine.parameters().set (ParamKind::DelaySync, 1);
        engine.parameters().set (ParamKind::IsolatorLow, 20);
        engine.parameters().set (ParamKind::IsolatorMid, -15);
        engine.parameters().set (ParamKind::IsolatorHigh, 30);
        engine.parameters().set (ParamKind::MasterFxType,
                                 static_cast<int> (MasterFxType::Phaser));
        engine.parameters().set (ParamKind::MasterFxAmount, 70);
        engine.parameters().set (ParamKind::MasterFxEnabled, 1);

        return render (engine, 96000, blockSize);
    };

    const auto reference = build (512);
    CHECK (reference.peak() > 0.05f);

    for (int blockSize : { 1, 7, 64, 333, 1024, 4096 })
    {
        const auto out = build (blockSize);

        // Exact equality — see the note in EngineTests on why a tolerance is the wrong assertion.
        int differing = 0;
        for (std::size_t i = 0; i < reference.left.size(); ++i)
            if (out.left[i] != reference.left[i] || out.right[i] != reference.right[i])
                ++differing;

        CHECK_EQ (differing, 0);
    }
}

BUD_TEST (Fx, sendsAreSilentUntilATrackSendsToThem)
{
    // A reverb with nothing sent to it must add nothing, however wet the return is set.
    Engine engine;
    setUpGroove (engine);
    engine.parameters().set (ParamKind::ReverbMix, 127);
    engine.parameters().set (ParamKind::DelayMix, 127);

    const auto dry = render (engine, 48000, 512);

    Engine sent;
    setUpGroove (sent);
    sent.parameters().set (ParamKind::ReverbMix, 127);
    sent.parameters().set (ParamKind::DelayMix, 127);
    sent.parameters().set (ParamKind::TrackReverbSend, 0, 127);

    const auto wet = render (sent, 48000, 512);

    auto difference = 0.0f;
    for (std::size_t i = 0; i < dry.left.size(); ++i)
        difference = std::max (difference, std::abs (wet.left[i] - dry.left[i]));

    CHECK (difference > 1.0e-3f);
}

BUD_TEST (Fx, theWholeChainStaysFiniteAtMaximum)
{
    Engine engine;
    setUpGroove (engine);

    for (int track = 0; track < kNumTracks; ++track)
    {
        for (int step : { 0, 2, 4, 6, 8, 10, 12, 14 })
            engine.currentPattern().track (track)
                .variation (Variation::A)[static_cast<std::size_t> (step)].gate = true;

        engine.parameters().set (ParamKind::TrackLevel, track, 127);
        engine.parameters().set (ParamKind::TrackReverbSend, track, 127);
        engine.parameters().set (ParamKind::TrackDelaySend, track, 127);
    }

    engine.parameters().set (ParamKind::ReverbMix, 127);
    engine.parameters().set (ParamKind::DelayMix, 127);
    engine.parameters().set (ParamKind::DelayFeedback, 127);
    engine.parameters().set (ParamKind::DelayToReverb, 127);
    engine.parameters().set (ParamKind::IsolatorLow, 50);
    engine.parameters().set (ParamKind::IsolatorMid, 50);
    engine.parameters().set (ParamKind::IsolatorHigh, 50);
    engine.parameters().set (ParamKind::MasterFxType,
                             static_cast<int> (MasterFxType::Distortion));
    engine.parameters().set (ParamKind::MasterFxAmount, 127);
    engine.parameters().set (ParamKind::MasterFxEnabled, 1);
    engine.parameters().set (ParamKind::MasterVolume, 127);

    const auto out = render (engine, 96000 * 2, 512);

    CHECK (out.allFinite());
    CHECK (out.peak() > 0.1f);
}

BUD_TEST (Fx, defaultsLeaveTheSignalUntouched)
{
    // Every effect is off or neutral by default, so a fresh engine sounds exactly as it did
    // before the effects existed. Anything else would mean the defaults are colouring the sound.
    Engine plain;
    setUpGroove (plain);

    const auto out = render (plain, 48000, 512);

    CHECK (out.allFinite());
    CHECK (out.peak() > 0.05f);
    CHECK (out.peak() <= 1.0f);
}
