#include "TestFramework.h"

#include "core/dsp/Envelope.h"
#include "core/dsp/Filters.h"
#include "core/dsp/Noise.h"
#include "core/dsp/Oscillators.h"
#include "core/dsp/Saturation.h"
#include "core/sampler/SampleBank.h"
#include "core/sampler/WavIo.h"
#include "core/voices/SampleVoices.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <numbers>
#include <vector>

using namespace bud;
using namespace bud::dsp;

namespace
{
    constexpr double kSampleRate = 48000.0;

    /// RMS of a filter's steady-state response to a sine at a given frequency.
    template <typename Filter>
    double responseAt (Filter& filter, float frequency, int cycles = 60)
    {
        filter.reset();

        const auto samplesPerCycle = kSampleRate / static_cast<double> (frequency);
        const auto total = static_cast<int> (samplesPerCycle * cycles);
        const auto settle = total / 2;

        double sum = 0.0;
        int counted = 0;

        for (int i = 0; i < total; ++i)
        {
            const auto phase = 2.0 * std::numbers::pi * static_cast<double> (i) / samplesPerCycle;
            const auto out = filter.process (static_cast<float> (std::sin (phase)));

            if (i >= settle)
            {
                sum += static_cast<double> (out) * out;
                ++counted;
            }
        }

        return counted > 0 ? std::sqrt (sum / counted) : 0.0;
    }
}

//==============================================================================

BUD_TEST (Dsp, envelopeStartsAtLevelAndReachesZero)
{
    DecayEnvelope env;
    env.prepare (kSampleRate);
    env.setDecayMs (100.0f);
    env.setCurve (0.5f);      // linear
    env.trigger (1.0f);

    CHECK_NEAR (env.peek(), 1.0f, 1.0e-4);

    const auto samples = static_cast<int> (kSampleRate * 0.1);

    for (int i = 0; i < samples; ++i)
        env.next();

    CHECK (! env.isActive());
    CHECK_EQ (env.next(), 0.0f);
}

BUD_TEST (Dsp, envelopeDecaysMonotonically)
{
    for (float curve : { 0.0f, 0.25f, 0.5f, 0.75f, 1.0f })
    {
        DecayEnvelope env;
        env.prepare (kSampleRate);
        env.setDecayMs (50.0f);
        env.setCurve (curve);
        env.trigger (1.0f);

        auto previous = 2.0f;

        for (int i = 0; i < static_cast<int> (kSampleRate * 0.05); ++i)
        {
            const auto value = env.next();
            CHECK (value <= previous + 1.0e-6f);
            CHECK (value >= 0.0f);
            previous = value;
        }
    }
}

BUD_TEST (Dsp, envelopeCurveChangesTheShapeNotTheEndpoints)
{
    // Halfway through the decay, a snappy curve must be well below a holding one.
    const auto midpoint = [] (float curve)
    {
        DecayEnvelope env;
        env.prepare (kSampleRate);
        env.setDecayMs (100.0f);
        env.setCurve (curve);
        env.trigger (1.0f);

        const auto half = static_cast<int> (kSampleRate * 0.05);
        float value = 0.0f;

        for (int i = 0; i < half; ++i)
            value = env.next();

        return value;
    };

    const auto snappy = midpoint (0.0f);
    const auto linear = midpoint (0.5f);
    const auto holding = midpoint (1.0f);

    CHECK (snappy < linear);
    CHECK (linear < holding);
    CHECK_NEAR (linear, 0.5f, 0.02f);
}

BUD_TEST (Dsp, envelopeFractionalAdvanceMovesTheOnsetSubSample)
{
    // Two envelopes triggered a fraction of a sample apart must differ by roughly that
    // fraction of one sample's worth of decay — this is what carries sub-sample trigger
    // timing into the audio.
    DecayEnvelope early, late;

    for (auto* env : { &early, &late })
    {
        env->prepare (kSampleRate);
        env->setDecayMs (10.0f);
        env->setCurve (0.5f);
        env->trigger (1.0f);
    }

    early.advanceFraction (0.0f);
    late.advanceFraction (1.0f);

    const auto a = early.next();
    const auto b = late.next();

    CHECK (b < a);

    const auto perSample = 1.0f / static_cast<float> (kSampleRate * 0.01);
    CHECK_NEAR (a - b, perSample, perSample * 0.1f);
}

//==============================================================================

BUD_TEST (Dsp, oscillatorsStayInRange)
{
    for (auto shape : { BlepOscillator::Shape::Saw, BlepOscillator::Shape::Square,
                        BlepOscillator::Shape::Triangle, BlepOscillator::Shape::Rectangle })
    {
        for (float frequency : { 20.0f, 110.0f, 1000.0f, 8000.0f })
        {
            BlepOscillator osc;
            osc.prepare (kSampleRate);
            osc.setShape (shape);
            osc.setFrequency (frequency);
            osc.reset();

            for (int i = 0; i < 4800; ++i)
            {
                const auto value = osc.next();
                CHECK (std::isfinite (value));
                CHECK (std::abs (value) <= 2.0f);
            }
        }
    }
}

BUD_TEST (Dsp, sawIsBandLimited)
{
    // A naive saw at a high fundamental folds a great deal of energy back below itself.
    // Measure how much lands well under the fundamental as a proxy for aliasing.
    BlepOscillator osc;
    osc.prepare (kSampleRate);
    osc.setShape (BlepOscillator::Shape::Saw);
    osc.setFrequency (5000.0f);
    osc.reset();

    StateVariableFilter lowPass;
    lowPass.prepare (kSampleRate);
    lowPass.setCutoff (1500.0f);
    lowPass.setResonance (0.0f);

    double energy = 0.0;
    const auto samples = 24000;

    for (int i = 0; i < samples; ++i)
    {
        const auto filtered = lowPass.process (osc.next());

        if (i > samples / 2)
            energy += static_cast<double> (filtered) * filtered;
    }

    const auto rms = std::sqrt (energy / (samples / 2));
    CHECK (rms < 0.1);
}

BUD_TEST (Dsp, sineOscillatorHasTheRightFrequency)
{
    SineOscillator osc;
    osc.prepare (kSampleRate);
    osc.setFrequency (100.0f);
    osc.reset();

    // Count zero crossings over a second: 100 Hz gives 200.
    int crossings = 0;
    auto previous = osc.next();

    for (int i = 1; i < static_cast<int> (kSampleRate); ++i)
    {
        const auto value = osc.next();

        if ((previous < 0.0f) != (value < 0.0f))
            ++crossings;

        previous = value;
    }

    CHECK_NEAR (crossings, 200, 2);
}

//==============================================================================

BUD_TEST (Dsp, stateVariableLowPassAttenuatesAboveCutoff)
{
    StateVariableFilter filter;
    filter.prepare (kSampleRate);
    filter.setCutoff (1000.0f);
    filter.setResonance (0.0f);
    filter.setMode (StateVariableFilter::Mode::LowPass);

    const auto passband = responseAt (filter, 100.0f);
    const auto corner = responseAt (filter, 1000.0f);
    const auto stopband = responseAt (filter, 10000.0f);

    CHECK_NEAR (passband, 0.707, 0.05);           // RMS of a unit sine
    CHECK (corner < passband);
    CHECK (stopband < passband * 0.1);
}

BUD_TEST (Dsp, stateVariableHighPassAttenuatesBelowCutoff)
{
    StateVariableFilter filter;
    filter.prepare (kSampleRate);
    filter.setCutoff (1000.0f);
    filter.setResonance (0.0f);
    filter.setMode (StateVariableFilter::Mode::HighPass);

    CHECK (responseAt (filter, 100.0f) < responseAt (filter, 10000.0f) * 0.1);
}

BUD_TEST (Dsp, stateVariableStaysStableAcrossTheWholeSweep)
{
    // The per-track frequency knob sweeps 20 Hz to 20 kHz and parameter locks can jump it
    // between steps, so instability at either extreme would be audible immediately.
    StateVariableFilter filter;
    filter.prepare (kSampleRate);

    for (float cutoff : { 20.0f, 200.0f, 2000.0f, 20000.0f, 23000.0f })
    {
        filter.setCutoff (cutoff);
        filter.setResonance (1.0f);
        filter.reset();

        Noise noise;

        for (int i = 0; i < 48000; ++i)
        {
            const auto value = filter.process (noise.next() * 0.5f);
            CHECK (std::isfinite (value));
            CHECK (std::abs (value) < 100.0f);
        }
    }
}

BUD_TEST (Dsp, ladderFilterAttenuatesAboveCutoff)
{
    LadderFilter filter;
    filter.prepare (kSampleRate);
    filter.setCutoff (800.0f);
    filter.setResonance (0.2f);

    const auto low = responseAt (filter, 100.0f);
    const auto high = responseAt (filter, 8000.0f);

    CHECK (low > 0.01);
    CHECK (high < low * 0.2);
}

BUD_TEST (Dsp, ladderFilterSurvivesFullResonance)
{
    LadderFilter filter;
    filter.prepare (kSampleRate);
    filter.setCutoff (400.0f);
    filter.setResonance (1.0f);

    Noise noise;

    for (int i = 0; i < 96000; ++i)
    {
        const auto value = filter.process (noise.next());
        CHECK (std::isfinite (value));
        CHECK (std::abs (value) < 10.0f);
    }
}

//==============================================================================

BUD_TEST (Dsp, saturationIsBoundedAndMonotonic)
{
    auto previous = -2.0f;

    for (float x = -8.0f; x <= 8.0f; x += 0.01f)
    {
        const auto y = fastTanh (x);
        CHECK (y >= -1.0f);
        CHECK (y <= 1.0f);
        CHECK (y >= previous);
        previous = y;
    }

    // Tracks tanh loosely — close enough for a waveshaper, not a substitute for the real
    // function. Full saturation by |x| = 3.
    CHECK_NEAR (fastTanh (0.0f), 0.0f, 1.0e-6);
    CHECK_NEAR (fastTanh (0.5f), std::tanh (0.5f), 0.01);
    CHECK_NEAR (fastTanh (1.0f), std::tanh (1.0f), 0.02);
    CHECK_NEAR (fastTanh (4.0f), 1.0f, 1.0e-6);
}

BUD_TEST (Dsp, overdriveAtZeroIsTransparent)
{
    Overdrive drive;
    drive.setDrive (0.0f);

    for (float x = -1.0f; x <= 1.0f; x += 0.05f)
        CHECK_EQ (drive.process (x), x);
}

BUD_TEST (Dsp, dcBlockerRemovesOffset)
{
    DcBlocker blocker;
    blocker.prepare (kSampleRate);

    float last = 0.0f;
    for (int i = 0; i < 48000; ++i)
        last = blocker.process (0.5f);

    CHECK_NEAR (last, 0.0f, 0.01f);
}

BUD_TEST (Dsp, noiseIsDeterministicAndBounded)
{
    Noise a (12345), b (12345);

    for (int i = 0; i < 10000; ++i)
    {
        const auto x = a.next();
        CHECK_EQ (x, b.next());
        CHECK (x >= -1.0f);
        CHECK (x <= 1.0f);
    }
}

//==============================================================================

BUD_TEST (Dsp, sampleInterpolationIsExactOnIntegerPositions)
{
    SampleData sample;
    sample.left = { 0.0f, 0.5f, -0.25f, 0.75f, 1.0f, -1.0f };

    for (int i = 0; i < sample.length(); ++i)
        CHECK_NEAR (interpolateSample (sample, 0, static_cast<double> (i)),
                    sample.left[static_cast<std::size_t> (i)], 1.0e-6);
}

BUD_TEST (Dsp, sampleInterpolationIsBoundedBetweenPoints)
{
    SampleData sample;
    sample.left.assign (256, 0.0f);

    for (std::size_t i = 0; i < sample.left.size(); ++i)
        sample.left[i] = std::sin (static_cast<float> (i) * 0.1f);

    for (double p = 1.0; p < 250.0; p += 0.13)
    {
        const auto value = interpolateSample (sample, 0, p);
        CHECK (std::isfinite (value));
        CHECK (std::abs (value) < 1.5f);
    }
}

BUD_TEST (Dsp, sampleReadsOutsideTheBufferAreSilent)
{
    SampleData sample;
    sample.left = { 1.0f, 1.0f, 1.0f };

    CHECK_EQ (sample.at (0, -1), 0.0f);
    CHECK_EQ (sample.at (0, 3), 0.0f);
    CHECK_EQ (sample.at (0, 1000), 0.0f);
}

//==============================================================================

BUD_TEST (Dsp, wavRoundTripsThroughDisk)
{
    const std::string path = "bud-wav-roundtrip-test.wav";

    std::vector<float> left (1000), right (1000);
    for (std::size_t i = 0; i < left.size(); ++i)
    {
        left[i] = std::sin (static_cast<float> (i) * 0.05f) * 0.8f;
        right[i] = std::cos (static_cast<float> (i) * 0.05f) * 0.6f;
    }

    CHECK (wav::writeStereo (path, left.data(), right.data(),
                             static_cast<int> (left.size()), kSampleRate));

    SampleData loaded;
    CHECK (wav::read (path, loaded));

    CHECK_EQ (loaded.length(), static_cast<int> (left.size()));
    CHECK (loaded.isStereo());
    CHECK_EQ (loaded.sampleRate, kSampleRate);

    // 16-bit quantisation is the only loss.
    for (std::size_t i = 0; i < left.size(); ++i)
    {
        CHECK_NEAR (loaded.left[i], left[i], 1.0 / 32767.0);
        CHECK_NEAR (loaded.right[i], right[i], 1.0 / 32767.0);
    }

    std::remove (path.c_str());
}

BUD_TEST (Dsp, wavRejectsGarbage)
{
    SampleData loaded;
    CHECK (! wav::read ("this-file-does-not-exist.wav", loaded));
}

BUD_TEST (Dsp, sampleBankDimensionsMatchTheDevice)
{
    CHECK_EQ (slotCount (BankId::S2), 32);
    CHECK_EQ (slotCount (BankId::S4), 16);
    CHECK_EQ (slotCount (BankId::S8), 12);

    CHECK_EQ (maxSeconds (BankId::S2), 2.0);
    CHECK_EQ (maxSeconds (BankId::S4), 4.0);
    CHECK_EQ (maxSeconds (BankId::S8), 8.0);

    CHECK (! isStereo (BankId::S2));
    CHECK (! isStereo (BankId::S4));
    CHECK (isStereo (BankId::S8));

    // Out-of-range slot indices clamp rather than reading past the end.
    SampleLibrary library;
    library.bank (BankId::S8).slot (999).name = "clamped";
    CHECK_EQ (library.bank (BankId::S8).slot (11).name, std::string ("clamped"));
}
