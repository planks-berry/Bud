#include "TestFramework.h"

#include "core/Engine.h"
#include "core/sampler/Sampler.h"

#include <algorithm>
#include <cmath>
#include <numbers>
#include <vector>

using namespace bud;

namespace
{

constexpr double kSampleRate = 48000.0;

/// A tone at a given amplitude, for driving the meter and the auto-record threshold.
std::vector<float> tone (float amplitude, int numSamples, double frequency = 440.0)
{
    std::vector<float> out (static_cast<std::size_t> (numSamples), 0.0f);

    for (int i = 0; i < numSamples; ++i)
        out[static_cast<std::size_t> (i)] = amplitude
            * static_cast<float> (std::sin (2.0 * std::numbers::pi * i * frequency / kSampleRate));

    return out;
}

std::vector<float> silence (int numSamples)
{
    return std::vector<float> (static_cast<std::size_t> (numSamples), 0.0f);
}

/// A sampler in standby on a given bank, with auto-record off unless asked otherwise.
Sampler standbySampler (SoundBank bank, int autoRecord = Sampler::kAutoRecordOff)
{
    Sampler sampler;
    sampler.prepare (kSampleRate);
    sampler.setBank (bank);
    sampler.setAutoRecordThreshold (autoRecord);
    sampler.enterSamplingMode();
    return sampler;
}

/// Feed a buffer in fixed chunks, as a host would.
void feed (Sampler& sampler, const std::vector<float>& data, int blockSize = 512)
{
    for (std::size_t i = 0; i < data.size(); i += static_cast<std::size_t> (blockSize))
    {
        const auto count = std::min (static_cast<std::size_t> (blockSize), data.size() - i);
        sampler.processInput (data.data() + i, nullptr, static_cast<int> (count));
    }
}

float peakOf (const std::vector<float>& data)
{
    auto peak = 0.0f;

    for (const auto v : data)
        peak = std::max (peak, std::abs (v));

    return peak;
}

} // namespace

//==============================================================================
// The state machine (p. 81-83)

BUD_TEST (Sampler, startsIdleAndEntersStandbyOnSamplingMode)
{
    Sampler sampler;
    sampler.prepare (kSampleRate);

    CHECK (sampler.state() == SamplerState::Idle);

    sampler.enterSamplingMode();
    CHECK (sampler.state() == SamplerState::Standby);
}

BUD_TEST (Sampler, withAutoRecordOffTheRecordKeyStartsRecordingOutright)
{
    // p. 83: "When auto recording is turned off, recording will start when you press REC while
    // in recording standby mode."
    auto sampler = standbySampler (SoundBank::S2);

    sampler.recordKey();
    CHECK (sampler.state() == SamplerState::Recording);
}

BUD_TEST (Sampler, withAutoRecordOnTheRecordKeyArmsAndTheSignalStarts)
{
    // p. 82: REC "lights up red, and recording starts automatically when a signal is detected."
    auto sampler = standbySampler (SoundBank::S2, 64);

    sampler.recordKey();
    CHECK (sampler.state() == SamplerState::Armed);

    // Below the threshold: still waiting, and nothing captured.
    feed (sampler, tone (0.0005f, 4800));
    CHECK (sampler.state() == SamplerState::Armed);
    CHECK_EQ (sampler.captured().length(), 0);

    // Loud enough: recording begins.
    feed (sampler, tone (0.5f, 4800));
    CHECK (sampler.state() == SamplerState::Recording);
    CHECK (sampler.captured().length() > 0);
}

BUD_TEST (Sampler, recordKeyDuringRecordingStopsImmediately)
{
    // p. 82: "Press REC during recording to stop immediately."
    auto sampler = standbySampler (SoundBank::S4);
    sampler.recordKey();

    feed (sampler, tone (0.5f, 24000));   // half a second of a four-second bank

    const auto captured = sampler.captured().length();
    CHECK (captured > 0);
    CHECK (captured < sampler.capacitySamples());

    sampler.recordKey();
    CHECK (sampler.state() == SamplerState::Review);

    // Stopping does not discard what was captured.
    CHECK_EQ (sampler.captured().length(), captured);
}

BUD_TEST (Sampler, recordingEndsOnItsOwnAtTheBankLimit)
{
    // p. 82: "When Step 16 lights up, recording ends automatically."
    auto sampler = standbySampler (SoundBank::S2);
    sampler.recordKey();

    // Three seconds of input into a two-second bank.
    feed (sampler, tone (0.5f, static_cast<int> (kSampleRate * 3.0)));

    CHECK (sampler.state() == SamplerState::Review);
    CHECK_EQ (sampler.captured().length(), sampler.capacitySamples());
    CHECK_NEAR (sampler.capturedSeconds(), 2.0, 0.01);
    CHECK_EQ (sampler.progressSteps(), Sampler::kMeterSteps);
}

BUD_TEST (Sampler, cancelDiscardsAndLeavesSamplingMode)
{
    // p. 82: "Press CLR to cancel the operation."
    auto sampler = standbySampler (SoundBank::S2);
    sampler.recordKey();
    feed (sampler, tone (0.5f, 24000));

    CHECK (sampler.captured().length() > 0);

    sampler.cancel();

    CHECK (sampler.state() == SamplerState::Idle);
    CHECK (sampler.captured().empty());
}

BUD_TEST (Sampler, commitWritesToTheChosenSlotAndOnlyFromReview)
{
    SoundLibrary library;

    auto sampler = standbySampler (SoundBank::S4);

    // Not reviewable yet, so a commit must refuse rather than write an empty slot.
    CHECK (! sampler.commit (library, 3));

    sampler.recordKey();
    feed (sampler, tone (0.5f, 24000));
    sampler.recordKey();

    CHECK (sampler.state() == SamplerState::Review);

    // Out-of-range slots are refused: S4 has sixteen.
    CHECK (! sampler.commit (library, -1));
    CHECK (! sampler.commit (library, userSlotCount (SoundBank::S4)));

    CHECK (sampler.commit (library, 3));
    CHECK (sampler.state() == SamplerState::Done);

    const auto* stored = library.find (SoundBank::S4, 3);
    CHECK (stored != nullptr);
    CHECK_EQ (stored->length(), sampler.captured().length());

    // Every other slot is untouched.
    CHECK (library.find (SoundBank::S4, 4) == nullptr);
}

//==============================================================================
// Capture behaviour

BUD_TEST (Sampler, captureIsNormalisedWhenRecordingEnds)
{
    // p. 83: "After recording ends, the sample volume is automatically normalized."
    auto sampler = standbySampler (SoundBank::S2);
    sampler.recordKey();

    feed (sampler, tone (0.05f, 24000));   // a quiet source
    sampler.recordKey();

    // Normalisation brings the peak to full scale regardless of how quiet the input was.
    CHECK_NEAR (static_cast<double> (peakOf (sampler.captured().left)), 1.0, 0.001);
}

BUD_TEST (Sampler, silenceIsNotNormalised)
{
    // Scaling silence to full scale would only amplify whatever noise floor it has, and dividing
    // by a zero peak is worse than that.
    auto sampler = standbySampler (SoundBank::S2);
    sampler.recordKey();

    feed (sampler, silence (24000));
    sampler.recordKey();

    CHECK_EQ (peakOf (sampler.captured().left), 0.0f);

    for (const auto v : sampler.captured().left)
        CHECK (std::isfinite (v));
}

BUD_TEST (Sampler, bankSetsLengthAndChannelCount)
{
    // p. 81 and p. 116: S2 and S4 are mono at 2 and 4 seconds; S8 is stereo at 8.
    struct Expected { SoundBank bank; double seconds; bool stereo; };

    constexpr Expected cases[] = {
        { SoundBank::S2, 2.0, false },
        { SoundBank::S4, 4.0, false },
        { SoundBank::S8, 8.0, true  }
    };

    for (const auto& expected : cases)
    {
        auto sampler = standbySampler (expected.bank);
        sampler.recordKey();

        // More than enough input to fill it.
        const auto input = tone (0.5f, static_cast<int> (kSampleRate * 9.0));
        sampler.processInput (input.data(), input.data(), static_cast<int> (input.size()));

        CHECK_NEAR (sampler.capturedSeconds(), expected.seconds, 0.01);
        CHECK_EQ (sampler.captured().isStereo(), expected.stereo);
    }
}

BUD_TEST (Sampler, aMonoBankSumsAStereoSourceRatherThanDroppingAChannel)
{
    // Taking only the left channel would silently lose half of a stereo source.
    auto sampler = standbySampler (SoundBank::S2);
    sampler.recordKey();

    const auto left = std::vector<float> (4800, 0.4f);
    const auto right = std::vector<float> (4800, 0.2f);

    sampler.processInput (left.data(), right.data(), 4800);
    sampler.recordKey();

    // The sum is (0.4 + 0.2) / 2 = 0.3 before normalisation, which then scales it to 1.
    CHECK (! sampler.captured().isStereo());
    CHECK_NEAR (static_cast<double> (peakOf (sampler.captured().left)), 1.0, 0.001);
}

BUD_TEST (Sampler, capturedLengthIsRecordedInBeats)
{
    // So that repitch- and stretch-to-tempo have a musical length to work from without the
    // player having to state one.
    auto sampler = standbySampler (SoundBank::S4);
    sampler.setTempo (120.0);
    sampler.recordKey();

    feed (sampler, tone (0.5f, static_cast<int> (kSampleRate * 2.0)));
    sampler.recordKey();

    // Two seconds at 120 bpm is four beats.
    CHECK_NEAR (sampler.captured().sourceBeats, 4.0, 0.01);
}

//==============================================================================
// Metering (p. 82)

BUD_TEST (Sampler, inputMeterMatchesTheTwoDocumentedPoints)
{
    // p. 82: "Step 12 indicates -6 dB, and Step 16 indicates 0 dB."
    //
    // A fresh sampler per reading: the meter holds its peak and releases slowly, so measuring a
    // quiet level straight after a loud one would read the tail of the loud one.
    const auto meterAt = [] (float amplitude)
    {
        auto sampler = standbySampler (SoundBank::S2);
        const auto input = tone (amplitude, 4800);
        sampler.processInput (input.data(), nullptr, static_cast<int> (input.size()));
        return sampler.inputMeterSteps();
    };

    CHECK_EQ (meterAt (1.0f), 16);           // 0 dB
    CHECK_EQ (meterAt (0.5011872f), 12);     // -6 dB
}

BUD_TEST (Sampler, inputMeterIsSilentAtSilenceAndClampsAboveFullScale)
{
    auto sampler = standbySampler (SoundBank::S2);

    CHECK_EQ (sampler.inputMeterSteps(), 0);

    const auto hot = tone (4.0f, 4800);
    sampler.processInput (hot.data(), nullptr, static_cast<int> (hot.size()));

    // Over full scale still reads sixteen rather than running off the end of the step keys.
    CHECK_EQ (sampler.inputMeterSteps(), Sampler::kMeterSteps);
}

BUD_TEST (Sampler, meterRisesInstantlyAndFallsBack)
{
    // A meter that fell as fast as it rose would be unreadable on percussive material; one that
    // never fell would report a peak long past.
    auto sampler = standbySampler (SoundBank::S2);

    const auto loud = tone (1.0f, 480);
    sampler.processInput (loud.data(), nullptr, 480);

    const auto afterPeak = sampler.inputMeterSteps();
    CHECK_EQ (afterPeak, 16);

    const auto quiet = silence (static_cast<int> (kSampleRate * 0.5));
    sampler.processInput (quiet.data(), nullptr, static_cast<int> (quiet.size()));

    CHECK (sampler.inputMeterSteps() < afterPeak);
}

BUD_TEST (Sampler, progressRunsFromNothingToSixteenAcrossTheBank)
{
    auto sampler = standbySampler (SoundBank::S2);
    sampler.recordKey();

    CHECK_EQ (sampler.progressSteps(), 0);

    // Half of a two-second bank should light half the steps.
    feed (sampler, tone (0.5f, static_cast<int> (kSampleRate * 1.0)));
    CHECK_EQ (sampler.progressSteps(), 8);

    feed (sampler, tone (0.5f, static_cast<int> (kSampleRate * 1.0)));
    CHECK_EQ (sampler.progressSteps(), 16);
}

BUD_TEST (Sampler, meteringAndCaptureDoNotDependOnBlockSize)
{
    // The sampler is fed by whatever is driving the engine, so it sees the host's buffer size.
    // Neither what it captures nor what it reports may depend on it.
    const auto input = tone (0.35f, static_cast<int> (kSampleRate * 1.5), 220.0);

    std::vector<float> reference;
    auto referenceMeter = 0;

    for (int blockSize : { 1, 7, 64, 333, 512, 1024, 4096 })
    {
        auto sampler = standbySampler (SoundBank::S2, 40);
        sampler.recordKey();
        feed (sampler, input, blockSize);

        if (reference.empty())
        {
            reference = sampler.captured().left;
            referenceMeter = sampler.inputMeterSteps();
            CHECK (! reference.empty());
            continue;
        }

        CHECK_EQ (sampler.captured().left.size(), reference.size());
        CHECK_EQ (sampler.inputMeterSteps(), referenceMeter);

        int differing = 0;

        for (std::size_t i = 0; i < reference.size(); ++i)
            if (sampler.captured().left[i] != reference[i])
                ++differing;

        CHECK_EQ (differing, 0);
    }
}

//==============================================================================
// Through the engine

namespace
{

struct Rendered
{
    std::vector<float> left, right;

    float peak() const
    {
        auto p = 0.0f;

        for (std::size_t i = 0; i < left.size(); ++i)
            p = std::max (p, std::max (std::abs (left[i]), std::abs (right[i])));

        return p;
    }
};

/// Render with an external input connected, at a given block size.
Rendered renderWithInput (Engine& engine, const std::vector<float>& input, int blockSize)
{
    const auto total = static_cast<int> (input.size());

    Rendered out;
    out.left.assign (static_cast<std::size_t> (total), 0.0f);
    out.right.assign (static_cast<std::size_t> (total), 0.0f);

    for (int position = 0; position < total; position += blockSize)
    {
        const auto count = std::min (blockSize, total - position);

        engine.process (out.left.data() + position, out.right.data() + position,
                        input.data() + position, input.data() + position, count);
    }

    return out;
}

} // namespace

BUD_TEST (Sampler, externalInputIsSilentUntilItsGainIsRaised)
{
    // Both inputs default to zero gain, so connecting a source does not put it in the mix
    // unasked — the device's gain settings start at nothing (p. 85).
    Engine engine;
    engine.prepare (kSampleRate, 512);

    const auto input = tone (0.8f, 24000);

    CHECK_EQ (renderWithInput (engine, input, 512).peak(), 0.0f);

    engine.parameters().set (ParamKind::ExtInLineGain, 100);
    CHECK (renderWithInput (engine, input, 512).peak() > 0.1f);
}

BUD_TEST (Sampler, lineAndUsbHaveIndependentGainAndSends)
{
    // p. 85 gives LIN. and USB. their own gain, and L.RV / U.RV their own reverb send. One
    // shared strip would make the two inputs impossible to balance against each other.
    const auto input = tone (0.5f, 24000);

    const auto peakWith = [&input] (ParamKind gain)
    {
        Engine engine;
        engine.prepare (kSampleRate, 512);
        engine.parameters().set (gain, 100);
        return renderWithInput (engine, input, 512).peak();
    };

    const auto line = peakWith (ParamKind::ExtInLineGain);
    const auto usb = peakWith (ParamKind::ExtInUsbGain);

    CHECK (line > 0.1f);
    CHECK (usb > 0.1f);

    // Raising one must not raise the other.
    Engine engine;
    engine.prepare (kSampleRate, 512);
    engine.parameters().set (ParamKind::ExtInLineGain, 100);

    const auto lineOnly = renderWithInput (engine, input, 512).peak();

    engine.parameters().set (ParamKind::ExtInUsbGain, 100);
    const auto both = renderWithInput (engine, input, 512).peak();

    CHECK (both > lineOnly * 1.5f);
}

BUD_TEST (Sampler, externalInputReachesTheSendEffects)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);
    engine.parameters().set (ParamKind::ExtInLineGain, 100);
    engine.parameters().set (ParamKind::ExtInLineReverbSend, 127);
    engine.parameters().set (ParamKind::ReverbMix, 127);

    // A short burst, then silence: anything still sounding afterwards came from the reverb.
    auto input = tone (0.8f, 48000);
    std::fill (input.begin() + 4800, input.end(), 0.0f);

    const auto out = renderWithInput (engine, input, 512);

    auto tail = 0.0f;

    for (std::size_t i = 24000; i < out.left.size(); ++i)
        tail = std::max (tail, std::abs (out.left[i]));

    CHECK (tail > 0.001f);
}

BUD_TEST (Sampler, theEngineRecordsWhatArrivesOnItsInput)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);
    engine.parameters().set (ParamKind::SamplerBank, 0);          // S2
    engine.parameters().set (ParamKind::SamplerAutoRecord, 0);    // off

    engine.sampler().enterSamplingMode();
    engine.sampler().recordKey();

    const auto input = tone (0.5f, 24000);
    renderWithInput (engine, input, 512);

    CHECK (engine.sampler().isRecording());
    CHECK_EQ (engine.sampler().captured().length(), 24000);

    engine.sampler().recordKey();
    CHECK (engine.sampler().commit (engine.sounds(), 0));

    // And the recorded slot is then playable, which is the whole point.
    const auto* stored = engine.sounds().find (SoundBank::S2, 0);
    CHECK (stored != nullptr);
    CHECK_EQ (stored->length(), 24000);
}

BUD_TEST (Sampler, renderWithInputIsIdenticalAtEveryBlockSize)
{
    const auto input = tone (0.4f, 48000, 330.0);

    const auto build = [&input] (int blockSize)
    {
        Engine engine;
        engine.prepare (kSampleRate, 8192);
        engine.parameters().set (ParamKind::ExtInLineGain, 100);
        engine.parameters().set (ParamKind::ExtInLineReverbSend, 90);
        engine.parameters().set (ParamKind::ExtInLineDelaySend, 90);
        engine.parameters().set (ParamKind::ExtInUsbGain, 70);
        engine.parameters().set (ParamKind::ReverbMix, 100);
        engine.parameters().set (ParamKind::DelayMix, 100);

        engine.currentPattern().track (0).variation (Variation::A)[0].gate = true;
        engine.start();

        return renderWithInput (engine, input, blockSize);
    };

    const auto reference = build (512);
    CHECK (reference.peak() > 0.05f);

    for (int blockSize : { 1, 7, 64, 333, 1024, 4096 })
    {
        const auto out = build (blockSize);

        int differing = 0;

        for (std::size_t i = 0; i < reference.left.size(); ++i)
            if (out.left[i] != reference.left[i] || out.right[i] != reference.right[i])
                ++differing;

        CHECK_EQ (differing, 0);
    }
}

BUD_TEST (Sampler, passingNoInputIsTheSameAsPassingSilence)
{
    // The two-argument `process` must be exactly the no-input case of the five-argument one, or
    // the render tool and the test suite would be exercising a different path from a plugin.
    const auto build = [] (bool connectInput)
    {
        Engine engine;
        engine.prepare (kSampleRate, 512);
        engine.parameters().set (ParamKind::ExtInLineGain, 100);
        engine.currentPattern().track (0).variation (Variation::A)[0].gate = true;
        engine.start();

        const auto total = 48000;
        const auto quiet = silence (total);

        Rendered out;
        out.left.assign (static_cast<std::size_t> (total), 0.0f);
        out.right.assign (static_cast<std::size_t> (total), 0.0f);

        for (int position = 0; position < total; position += 512)
        {
            const auto count = std::min (512, total - position);

            if (connectInput)
                engine.process (out.left.data() + position, out.right.data() + position,
                                quiet.data() + position, quiet.data() + position, count);
            else
                engine.process (out.left.data() + position, out.right.data() + position, count);
        }

        return out;
    };

    const auto without = build (false);
    const auto withSilence = build (true);

    CHECK (without.peak() > 0.01f);

    int differing = 0;

    for (std::size_t i = 0; i < without.left.size(); ++i)
        if (without.left[i] != withSilence.left[i] || without.right[i] != withSilence.right[i])
            ++differing;

    CHECK_EQ (differing, 0);
}

BUD_TEST (Sampler, theBankCannotChangeWhileACaptureIsInHand)
{
    // A capture belongs to the bank it was recorded for — its length, channel count and valid
    // slot range all come from there. The engine pushes this setting every block, so a stray
    // change during a recording or while it waits to be committed must not take effect.
    auto sampler = standbySampler (SoundBank::S2);
    sampler.recordKey();
    feed (sampler, tone (0.5f, 24000));

    sampler.setBank (SoundBank::S8);
    CHECK (sampler.bank() == SoundBank::S2);

    sampler.recordKey();
    CHECK (sampler.state() == SamplerState::Review);

    // Still refused while the capture waits in Review.
    sampler.setBank (SoundBank::S8);
    CHECK (sampler.bank() == SoundBank::S2);

    // S8 has twelve slots against S2's thirty-two; had the change taken hold, this slot would
    // now be out of range and the capture would be lost.
    SoundLibrary library;
    CHECK (sampler.commit (library, 20));
    CHECK (library.find (SoundBank::S2, 20) != nullptr);

    // Once committed, the type is free to change again.
    sampler.setBank (SoundBank::S8);
    CHECK (sampler.bank() == SoundBank::S8);
}
