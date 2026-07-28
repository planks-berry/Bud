#pragma once

#include <algorithm>
#include <cmath>

namespace bud::dsp
{

/// Fast tanh-shaped saturator: the [3/2] Pade approximant of tanh, clamped.
///
/// It tracks tanh to within about 2% and saturates fully by |x| = 3. That is not accurate
/// enough to stand in for tanh in a numerical context, but a waveshaper only needs a curve
/// that is smooth, odd, monotonic and bounded, and this is all four for a fraction of the
/// cost of std::tanh.
inline float fastTanh (float x) noexcept
{
    const auto x2 = x * x;
    const auto numerator = x * (27.0f + x2);
    const auto denominator = 27.0f + 9.0f * x2;
    return std::clamp (numerator / denominator, -1.0f, 1.0f);
}

/** Drive stage used by the kick, snare and bass overdrive.

    Gain compensation keeps the perceived level roughly constant as drive increases, so the
    control shapes tone rather than doubling as a volume knob.
*/
class Overdrive
{
public:
    /// 0 leaves the signal alone; 1 is heavily saturated.
    void setDrive (float amount01) noexcept
    {
        const auto a = std::clamp (amount01, 0.0f, 1.0f);
        gain_ = 1.0f + a * 24.0f;
        makeup_ = 1.0f / (1.0f + a * 3.2f);
        mix_ = a;
    }

    float process (float x) const noexcept
    {
        if (mix_ <= 0.0f)
            return x;

        const auto driven = fastTanh (x * gain_) * makeup_;
        return x + (driven - x) * mix_;
    }

private:
    float gain_ = 1.0f;
    float makeup_ = 1.0f;
    float mix_ = 0.0f;
};

//==============================================================================

/// Removes DC that saturation and envelope-modulated oscillators can introduce.
class DcBlocker
{
public:
    void prepare (double sampleRate) noexcept
    {
        // ~20 Hz corner
        coefficient_ = static_cast<float> (1.0 - 2.0 * 3.14159265358979 * 20.0 / sampleRate);
        coefficient_ = std::clamp (coefficient_, 0.9f, 0.9999f);
        reset();
    }

    void reset() noexcept
    {
        lastInput_ = 0.0f;
        lastOutput_ = 0.0f;
    }

    float process (float x) noexcept
    {
        const auto y = x - lastInput_ + coefficient_ * lastOutput_;
        lastInput_ = x;
        lastOutput_ = y;
        return y;
    }

private:
    float coefficient_ = 0.995f;
    float lastInput_ = 0.0f;
    float lastOutput_ = 0.0f;
};

} // namespace bud::dsp
