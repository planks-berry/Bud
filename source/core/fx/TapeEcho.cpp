#include "TapeEcho.h"

#include "../params/Curves.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace bud::fx
{

namespace
{
    constexpr double kMaxDelaySeconds = 2.0;
    constexpr double kTwoPi = 2.0 * std::numbers::pi;

    // Head wander. Small enough to read as tape rather than as a chorus.
    constexpr double kWowHz = 0.7;
    constexpr double kFlutterHz = 6.3;
    constexpr double kWowDepthSamples = 14.0;
    constexpr double kFlutterDepthSamples = 3.0;
}

//==============================================================================

void TapeEcho::prepare (double sampleRate)
{
    sampleRate_ = std::max (1.0, sampleRate);

    const auto length = static_cast<std::size_t> (sampleRate_ * kMaxDelaySeconds) + 4;
    bufferLeft_.assign (length, 0.0f);
    bufferRight_.assign (length, 0.0f);

    loopHighPass_.prepare (sampleRate_);
    loopHighPass_.setCutoff (180.0f);

    for (auto* filter : { &loopLowPassLeft_, &loopLowPassRight_ })
    {
        filter->prepare (sampleRate_);
        filter->setMode (dsp::StateVariableFilter::Mode::LowPass);
        filter->setCutoff (4800.0f);
        filter->setResonance (0.0f);
    }

    saturation_.setDrive (0.25f);

    reset();
}

void TapeEcho::reset()
{
    std::fill (bufferLeft_.begin(), bufferLeft_.end(), 0.0f);
    std::fill (bufferRight_.begin(), bufferRight_.end(), 0.0f);

    writeIndex_ = 0;
    smoothedDelay_ = delaySamples_;
    wowPhase_ = 0.0;
    flutterPhase_ = 0.0;

    loopHighPass_.reset();
    loopLowPassLeft_.reset();
    loopLowPassRight_.reset();
}

void TapeEcho::setDelayMs (float milliseconds) noexcept
{
    const auto samples = static_cast<double> (milliseconds) * 0.001 * sampleRate_;
    const auto maximum = static_cast<double> (bufferLeft_.size()) - 4.0;

    delaySamples_ = std::clamp (samples, 32.0, std::max (32.0, maximum));
}

void TapeEcho::setFeedback (int raw) noexcept
{
    // Stops just short of unity, so a held feedback swells without running away.
    feedback_ = curves::unit (raw) * 0.95f;
}

void TapeEcho::setPingPong (bool enabled) noexcept
{
    pingPong_ = enabled;
}

//==============================================================================

float TapeEcho::readInterpolated (const std::vector<float>& buffer,
                                  double position) const noexcept
{
    const auto size = static_cast<int> (buffer.size());

    if (size <= 0)
        return 0.0f;

    auto index = static_cast<int> (std::floor (position));
    const auto fraction = static_cast<float> (position - static_cast<double> (index));

    index %= size;
    if (index < 0)
        index += size;

    const auto next = (index + 1) % size;

    return buffer[static_cast<std::size_t> (index)] * (1.0f - fraction)
         + buffer[static_cast<std::size_t> (next)] * fraction;
}

void TapeEcho::process (const float* inLeft, const float* inRight,
                        float* outLeft, float* outRight,
                        float* reverbLeft, float* reverbRight,
                        int numSamples, float wetGain, float toReverb) noexcept
{
    const auto size = static_cast<int> (bufferLeft_.size());

    if (size <= 4)
        return;

    const auto wowIncrement = kWowHz / sampleRate_;
    const auto flutterIncrement = kFlutterHz / sampleRate_;

    for (int i = 0; i < numSamples; ++i)
    {
        // Glide towards the target delay rather than jumping, so changing the time sounds like
        // the tape speeding up instead of clicking.
        smoothedDelay_ += (delaySamples_ - smoothedDelay_) * 0.0004;

        wowPhase_ += wowIncrement;
        flutterPhase_ += flutterIncrement;

        if (wowPhase_ >= 1.0) wowPhase_ -= 1.0;
        if (flutterPhase_ >= 1.0) flutterPhase_ -= 1.0;

        const auto wander = std::sin (wowPhase_ * kTwoPi) * kWowDepthSamples
                          + std::sin (flutterPhase_ * kTwoPi) * kFlutterDepthSamples;

        const auto readPosition = static_cast<double> (writeIndex_)
                                - (smoothedDelay_ + wander)
                                + static_cast<double> (size);

        auto delayedLeft = readInterpolated (bufferLeft_, readPosition);
        auto delayedRight = readInterpolated (bufferRight_, readPosition);

        // Each pass round the loop loses a little top and bottom and saturates slightly, which
        // is what makes the repeats decay in character as well as level.
        delayedLeft = saturation_.process (loopLowPassLeft_.process (delayedLeft));
        delayedRight = saturation_.process (loopLowPassRight_.process (delayedRight));

        const auto inputLeft = loopHighPass_.process (inLeft[i]);
        const auto inputRight = inRight[i];

        if (pingPong_)
        {
            // The repeats cross over, so each successive echo lands on the opposite side.
            bufferLeft_[static_cast<std::size_t> (writeIndex_)] =
                inputLeft + delayedRight * feedback_;
            bufferRight_[static_cast<std::size_t> (writeIndex_)] =
                inputRight + delayedLeft * feedback_;
        }
        else
        {
            bufferLeft_[static_cast<std::size_t> (writeIndex_)] =
                inputLeft + delayedLeft * feedback_;
            bufferRight_[static_cast<std::size_t> (writeIndex_)] =
                inputRight + delayedRight * feedback_;
        }

        if (++writeIndex_ >= size)
            writeIndex_ = 0;

        outLeft[i] += delayedLeft * wetGain;
        outRight[i] += delayedRight * wetGain;

        // The delay can feed the reverb separately from the dry send (p. 30).
        if (reverbLeft != nullptr && toReverb > 0.0f)
        {
            reverbLeft[i] += delayedLeft * toReverb;
            reverbRight[i] += delayedRight * toReverb;
        }
    }
}

} // namespace bud::fx
