#pragma once

#include <algorithm>
#include <cmath>

namespace bud::dsp
{

/** Decay envelope with a continuously variable curve.

    The device exposes a decay *curve* control on the bass synth, and the drum voices need the
    same shaping internally — the difference between an 808 kick and a 909 kick is as much the
    shape of the decay as its length.

    The curve is a rational response mapping rather than a power function, so it costs a
    multiply and a divide per sample instead of a `pow`, while staying monotonic and pinned to
    1 at the start and 0 at the end.
*/
class DecayEnvelope
{
public:
    void prepare (double sampleRate)
    {
        sampleRate_ = std::max (1.0, sampleRate);
        updateRate();
    }

    void setDecayMs (float ms)
    {
        decayMs_ = std::max (0.1f, ms);
        updateRate();
    }

    /// 0 gives a snappy exponential decay, 0.5 is linear, 1 holds then drops away.
    void setCurve (float curve01)
    {
        const auto c = std::clamp (curve01, 0.0f, 1.0f);
        shape_ = std::pow (20.0f, c * 2.0f - 1.0f) - 1.0f;
    }

    void trigger (float level)
    {
        level_ = level;
        phase_ = 0.0;
        active_ = true;
    }

    void reset()
    {
        active_ = false;
        phase_ = 1.0;
        level_ = 0.0f;
    }

    /// Advance by a fraction of a sample.
    ///
    /// A trigger rarely falls exactly on a sample. The engine starts the voice on the next
    /// whole sample and calls this with the time that had already elapsed by then, so the
    /// envelope is positioned to the true onset rather than snapped to the sample grid.
    void advanceFraction (float fraction)
    {
        if (! active_)
            return;

        phase_ += rate_ * static_cast<double> (std::clamp (fraction, 0.0f, 1.0f));

        if (phase_ >= 1.0)
            active_ = false;
    }

    bool isActive() const noexcept { return active_; }

    float next()
    {
        if (! active_)
            return 0.0f;

        const auto remaining = static_cast<float> (1.0 - phase_);
        phase_ += rate_;

        if (phase_ >= 1.0)
            active_ = false;

        return level_ * shape (std::max (0.0f, remaining));
    }

    /// Current value without advancing.
    float peek() const
    {
        return active_ ? level_ * shape (static_cast<float> (std::max (0.0, 1.0 - phase_)))
                       : 0.0f;
    }

private:
    float shape (float x) const noexcept
    {
        return x * (1.0f + shape_) / (1.0f + shape_ * x);
    }

    void updateRate()
    {
        rate_ = 1.0 / std::max (1.0, sampleRate_ * static_cast<double> (decayMs_) * 0.001);
    }

    double sampleRate_ = 48000.0;
    double phase_ = 1.0;
    double rate_ = 0.001;
    float decayMs_ = 200.0f;
    float level_ = 0.0f;
    float shape_ = -0.776f;   // an exponential-ish default, matching curve 0.25
    bool active_ = false;
};

//==============================================================================

/** A one-pole smoother, for de-zippering parameter changes. */
class Smoother
{
public:
    void prepare (double sampleRate, float milliseconds = 5.0f)
    {
        const auto samples = std::max (1.0, sampleRate * static_cast<double> (milliseconds) * 0.001);
        coefficient_ = static_cast<float> (std::exp (-1.0 / samples));
    }

    void setTarget (float target) noexcept { target_ = target; }
    void snapTo (float value) noexcept { target_ = value; current_ = value; }
    float current() const noexcept { return current_; }

    float next() noexcept
    {
        current_ = target_ + (current_ - target_) * coefficient_;
        return current_;
    }

private:
    float coefficient_ = 0.99f;
    float target_ = 0.0f;
    float current_ = 0.0f;
};

} // namespace bud::dsp
