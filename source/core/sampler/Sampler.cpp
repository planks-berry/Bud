#include "Sampler.h"

#include "../params/Curves.h"

#include <algorithm>
#include <cmath>

namespace bud
{

namespace
{
    /// How fast the meter falls. Instant attack would make the meter unreadable on percussive
    /// material without a hold, and a long release would hide a peak that has passed.
    constexpr double kMeterReleaseSeconds = 0.3;

    /// The auto-record trigger range (p. 83).
    constexpr float kAutoRecordMinDb = -60.0f;
    constexpr float kAutoRecordMaxDb = -20.0f;

    /// The meter's law. Two points are given: step 12 is -6 dB and step 16 is 0 dB (p. 82). Two
    /// points fix a line, so with the steps evenly spaced in decibels the spacing is 1.5 dB and
    /// the bottom of the scale falls at -24 dB. That is the whole scale — it is a recording-level
    /// meter, so its resolution belongs near clipping rather than spread over a wide range.
    constexpr float kMeterFloorDb = -24.0f;

    float amplitudeToDb (float amplitude) noexcept
    {
        return amplitude > 1.0e-9f ? 20.0f * std::log10 (amplitude) : -1000.0f;
    }

    float dbToAmplitude (float db) noexcept
    {
        return std::pow (10.0f, db / 20.0f);
    }
}

//==============================================================================

void Sampler::prepare (double sampleRate)
{
    sampleRate_ = std::max (1.0, sampleRate);

    meterRelease_ = static_cast<float> (
        std::exp (-1.0 / (kMeterReleaseSeconds * sampleRate_)));

    reset();
}

void Sampler::reset() noexcept
{
    capture_.clear();
    state_ = SamplerState::Idle;
    meterPeak_ = 0.0f;
}

//==============================================================================

void Sampler::setBank (SoundBank bank) noexcept
{
    if (userSlotCount (bank) == 0)
        return;   // not one of the sample banks

    // A capture belongs to the bank it was recorded for: its length, channel count and the slot
    // range it can be committed to all come from there. Changing the type while one is in hand —
    // recording, or waiting in Review to be committed — would mismatch all three. The engine
    // pushes this parameter every block, so an unguarded setter would apply a stray change the
    // moment it happened rather than at a safe point.
    if (state_ == SamplerState::Recording || state_ == SamplerState::Review)
        return;

    bank_ = bank;
}

void Sampler::setInputGain (int raw) noexcept
{
    inputGain_ = curves::levelGain (raw);
}

void Sampler::setAutoRecordThreshold (int raw) noexcept
{
    autoRecordRaw_ = std::clamp (raw, 0, kRawMax);

    if (autoRecordRaw_ == kAutoRecordOff)
    {
        autoRecordLevel_ = 0.0f;
        return;
    }

    // 1-127 spans the documented -60 to -20 dB.
    const auto position = static_cast<float> (autoRecordRaw_ - 1)
                        / static_cast<float> (kRawMax - 1);

    autoRecordLevel_ = dbToAmplitude (kAutoRecordMinDb
                                      + position * (kAutoRecordMaxDb - kAutoRecordMinDb));
}

void Sampler::setTempo (double bpm) noexcept
{
    tempo_ = std::max (1.0, bpm);
}

//==============================================================================

int Sampler::capacitySamples() const noexcept
{
    return static_cast<int> (userMaxSeconds (bank_) * sampleRate_);
}

void Sampler::enterSamplingMode() noexcept
{
    state_ = SamplerState::Standby;
    capture_.clear();
    meterPeak_ = 0.0f;
}

void Sampler::recordKey() noexcept
{
    switch (state_)
    {
        case SamplerState::Standby:
            // With auto-record off, REC starts the recording outright; otherwise it arms and the
            // signal starts it (p. 83).
            if (autoRecordRaw_ == kAutoRecordOff)
                beginRecording();
            else
                state_ = SamplerState::Armed;
            break;

        case SamplerState::Armed:
            // Pressing REC again while waiting overrides the threshold and starts now.
            beginRecording();
            break;

        case SamplerState::Recording:
            finishRecording();
            break;

        default:
            break;
    }
}

void Sampler::cancel() noexcept
{
    capture_.clear();
    state_ = SamplerState::Idle;
    meterPeak_ = 0.0f;
}

bool Sampler::commit (SoundLibrary& library, int slot) noexcept
{
    if (state_ != SamplerState::Review || capture_.empty())
        return false;

    if (slot < 0 || slot >= userSlotCount (bank_))
        return false;

    library.userSlot (bank_, slot) = capture_;
    state_ = SamplerState::Done;
    return true;
}

//==============================================================================

void Sampler::beginRecording() noexcept
{
    capture_.clear();
    capture_.sampleRate = sampleRate_;

    const auto capacity = static_cast<std::size_t> (capacitySamples());
    capture_.left.reserve (capacity);

    if (userBankIsStereo (bank_))
        capture_.right.reserve (capacity);

    state_ = SamplerState::Recording;
}

void Sampler::finishRecording() noexcept
{
    // Musical length of what was captured, so repitch- and stretch-to-tempo have something to
    // work from without the player having to state it. Exact rather than rounded to a bar: a
    // recording stopped by hand is not on a boundary, and rounding would quietly retime it.
    capture_.sourceBeats = capturedSeconds() * tempo_ / 60.0;

    normalise();

    state_ = SamplerState::Review;
}

void Sampler::normalise() noexcept
{
    // p. 83: the volume is normalised once recording ends.
    auto peak = 0.0f;

    for (const auto v : capture_.left)
        peak = std::max (peak, std::abs (v));

    for (const auto v : capture_.right)
        peak = std::max (peak, std::abs (v));

    // Nothing to normalise against, and scaling silence up would only raise its noise floor.
    if (peak <= 1.0e-6f)
        return;

    const auto gain = 1.0f / peak;

    for (auto& v : capture_.left)
        v *= gain;

    for (auto& v : capture_.right)
        v *= gain;
}

//==============================================================================

void Sampler::processInput (const float* left, const float* right, int numSamples) noexcept
{
    if (state_ == SamplerState::Idle || left == nullptr || numSamples <= 0)
        return;

    const auto stereoBank = userBankIsStereo (bank_);
    const auto capacity = capacitySamples();

    for (int i = 0; i < numSamples; ++i)
    {
        const auto l = left[i] * inputGain_;
        const auto r = (right != nullptr ? right[i] : left[i]) * inputGain_;

        // The meter runs in every state but Idle: Standby exists so it can be watched, and the
        // arming threshold reads the same signal.
        const auto level = std::max (std::abs (l), std::abs (r));

        meterPeak_ = level > meterPeak_ ? level : meterPeak_ * meterRelease_;

        if (state_ == SamplerState::Armed && level >= autoRecordLevel_)
            beginRecording();

        if (state_ != SamplerState::Recording)
            continue;

        // A mono bank sums to centre rather than discarding the right channel, which would throw
        // away half of a stereo source.
        if (stereoBank)
        {
            capture_.left.push_back (l);
            capture_.right.push_back (r);
        }
        else
        {
            capture_.left.push_back ((l + r) * 0.5f);
        }

        // Ends on its own at the bank's limit (p. 82).
        if (capture_.length() >= capacity)
        {
            finishRecording();
            break;
        }
    }
}

//==============================================================================

int Sampler::inputMeterSteps() const noexcept
{
    if (meterPeak_ <= 0.0f)
        return 0;

    const auto db = amplitudeToDb (meterPeak_);
    const auto steps = static_cast<float> (kMeterSteps) * (1.0f - db / kMeterFloorDb);

    // A step lights on *entering* its band, which is how a segment meter behaves and what makes
    // both documented anchors land exactly: -6 dB lights twelve, 0 dB lights sixteen. Rounding
    // down instead would need a level at or above 0 dB before the top step lit, and a full-scale
    // sine never quite reaches 1.0 once sampled — it would sit one step short for ever.
    return std::clamp (static_cast<int> (std::ceil (steps)), 0, kMeterSteps);
}

int Sampler::progressSteps() const noexcept
{
    const auto capacity = capacitySamples();

    if (capacity <= 0 || capture_.empty())
        return 0;

    const auto fraction = static_cast<double> (capture_.length())
                        / static_cast<double> (capacity);

    return std::clamp (static_cast<int> (std::ceil (fraction * kMeterSteps)), 0, kMeterSteps);
}

double Sampler::capturedSeconds() const noexcept
{
    return static_cast<double> (capture_.length()) / sampleRate_;
}

} // namespace bud
