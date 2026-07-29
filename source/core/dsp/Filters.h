#pragma once

#include "Saturation.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace bud::dsp
{

/** Topology-preserving state variable filter.

    Used for the per-track EQ/filter on control knobs A and B, and inside the drum voices.
    The TPT form stays stable as the cutoff approaches Nyquist, which matters because the
    per-track frequency knob sweeps the full 20 Hz to 20 kHz range and parameter locks can
    jump it discontinuously between steps.
*/
class StateVariableFilter
{
public:
    enum class Mode { LowPass, HighPass, BandPass, Notch };

    void prepare (double sampleRate)
    {
        sampleRate_ = std::max (1.0, sampleRate);
        reset();
        update();
    }

    void setCutoff (float hz)
    {
        cutoff_ = std::clamp (hz, 10.0f, static_cast<float> (sampleRate_ * 0.49));
        update();
    }

    /// Resonance as 0 to 1; mapped to a musically useful Q range.
    void setResonance (float amount01)
    {
        const auto r = std::clamp (amount01, 0.0f, 1.0f);
        q_ = 0.5f + r * r * 12.0f;
        update();
    }

    /// Set Q directly.
    ///
    /// Crossovers need an exact Q — a Linkwitz-Riley pair is two cascaded Butterworth sections
    /// at Q = 0.7071, which puts each output 6 dB down at the corner so the two sum flat. Going
    /// through setResonance to reach a specific Q means depending on its mapping, which is
    /// tuned for musical sweeps rather than for hitting a number.
    void setQ (float q)
    {
        q_ = std::max (0.05f, q);
        update();
    }

    void setMode (Mode m) noexcept { mode_ = m; }

    void reset() noexcept
    {
        ic1_ = 0.0f;
        ic2_ = 0.0f;
    }

    float process (float input) noexcept
    {
        const auto v3 = input - ic2_;
        const auto v1 = a1_ * ic1_ + a2_ * v3;
        const auto v2 = ic2_ + a2_ * ic1_ + a3_ * v3;

        ic1_ = 2.0f * v1 - ic1_;
        ic2_ = 2.0f * v2 - ic2_;

        switch (mode_)
        {
            case Mode::LowPass:  return v2;
            case Mode::HighPass: return input - k_ * v1 - v2;
            case Mode::BandPass: return v1;
            case Mode::Notch:    return input - k_ * v1;
        }

        return v2;
    }

private:
    void update()
    {
        const auto g = static_cast<float> (
            std::tan (std::numbers::pi * static_cast<double> (cutoff_) / sampleRate_));

        k_ = 1.0f / q_;
        a1_ = 1.0f / (1.0f + g * (g + k_));
        a2_ = g * a1_;
        a3_ = g * a2_;
    }

    double sampleRate_ = 48000.0;
    float cutoff_ = 1000.0f;
    float q_ = 0.7071f;
    float k_ = 1.414f, a1_ = 0.0f, a2_ = 0.0f, a3_ = 0.0f;
    float ic1_ = 0.0f, ic2_ = 0.0f;
    Mode mode_ = Mode::LowPass;
};

//==============================================================================

/** Four-pole resonant ladder low-pass, for the bass synth.

    A cascade of one-pole sections with a saturated feedback path — the structure that gives
    a 303-style filter its self-oscillating squelch, as opposed to the clean roll-off of a
    biquad. The tanh in the feedback path is what keeps high resonance from blowing up while
    adding the harmonic thickening that the real circuit has.
*/
class LadderFilter
{
public:
    void prepare (double sampleRate)
    {
        sampleRate_ = std::max (1.0, sampleRate);
        reset();
        update();
    }

    void setCutoff (float hz)
    {
        cutoff_ = std::clamp (hz, 20.0f, static_cast<float> (sampleRate_ * 0.45));
        update();
    }

    /// 0 to 1; approaching 1 brings the filter close to self-oscillation.
    void setResonance (float amount01) noexcept
    {
        resonance_ = std::clamp (amount01, 0.0f, 1.0f);
    }

    void reset() noexcept
    {
        for (auto& s : stage_) s = 0.0f;
        for (auto& d : delay_) d = 0.0f;
    }

    float process (float input) noexcept
    {
        // Feedback loses strength as the cutoff rises, which keeps the resonant peak from
        // dominating at the top of the sweep the way the hardware does.
        const auto feedback = resonance_ * 4.0f * (1.0f - 0.15f * g_ * g_);

        auto x = input - stage_[3] * feedback;
        x = fastTanh (x);
        x *= 0.35013f * (g_ * g_) * (g_ * g_);

        stage_[0] = x + 0.3f * delay_[0] + (1.0f - g_) * stage_[0];
        delay_[0] = x;

        stage_[1] = stage_[0] + 0.3f * delay_[1] + (1.0f - g_) * stage_[1];
        delay_[1] = stage_[0];

        stage_[2] = stage_[1] + 0.3f * delay_[2] + (1.0f - g_) * stage_[2];
        delay_[2] = stage_[1];

        stage_[3] = stage_[2] + 0.3f * delay_[3] + (1.0f - g_) * stage_[3];
        delay_[3] = stage_[2];

        return stage_[3];
    }

private:
    void update()
    {
        const auto normalised = static_cast<float> (
            static_cast<double> (cutoff_) / sampleRate_);

        g_ = std::clamp (normalised * 2.0f * 1.16f, 0.0f, 1.16f);
    }

    double sampleRate_ = 48000.0;
    float cutoff_ = 800.0f;
    float resonance_ = 0.0f;
    float g_ = 0.0f;
    float stage_[4] {};
    float delay_[4] {};
};

//==============================================================================

/** One-pole high-pass, for hat and snare noise shaping. */
class OnePoleHighPass
{
public:
    void prepare (double sampleRate) noexcept
    {
        sampleRate_ = std::max (1.0, sampleRate);
        reset();
        update();
    }

    void setCutoff (float hz) noexcept
    {
        cutoff_ = std::clamp (hz, 10.0f, static_cast<float> (sampleRate_ * 0.49));
        update();
    }

    void reset() noexcept
    {
        lastInput_ = 0.0f;
        lastOutput_ = 0.0f;
    }

    float process (float x) noexcept
    {
        const auto y = coefficient_ * (lastOutput_ + x - lastInput_);
        lastInput_ = x;
        lastOutput_ = y;
        return y;
    }

private:
    void update() noexcept
    {
        const auto rc = 1.0 / (2.0 * std::numbers::pi * static_cast<double> (cutoff_));
        const auto dt = 1.0 / sampleRate_;
        coefficient_ = static_cast<float> (rc / (rc + dt));
    }

    double sampleRate_ = 48000.0;
    float cutoff_ = 100.0f;
    float coefficient_ = 0.99f;
    float lastInput_ = 0.0f;
    float lastOutput_ = 0.0f;
};

} // namespace bud::dsp
