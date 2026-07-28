#pragma once

#include <algorithm>
#include <array>
#include <cmath>
#include <numbers>

namespace bud::dsp
{

/** Band-limited oscillator covering the bass synth's four waveforms.

    Discontinuous shapes use polyBLEP correction, which removes the aliasing that a naive
    saw or square would fold back into the audible range — audible as a gritty buzz on
    anything above the low bass register, and immediately wrong against the hardware.

    The triangle is produced by integrating the corrected square, so it inherits the same
    band-limiting rather than needing its own correction.
*/
class BlepOscillator
{
public:
    enum class Shape { Saw, Square, Triangle, Rectangle };

    void prepare (double sampleRate)
    {
        sampleRate_ = std::max (1.0, sampleRate);
        updateIncrement();
    }

    void setFrequency (float hz)
    {
        frequency_ = std::clamp (hz, 0.0f, static_cast<float> (sampleRate_ * 0.45));
        updateIncrement();
    }

    void setShape (Shape s) noexcept { shape_ = s; }

    /// Duty cycle for the rectangle shape, 0.05 to 0.95.
    void setPulseWidth (float width) noexcept
    {
        pulseWidth_ = std::clamp (width, 0.05f, 0.95f);
    }

    void reset (double startPhase = 0.0) noexcept
    {
        phase_ = startPhase;
        triangleState_ = 0.0f;
    }

    float next()
    {
        const auto value = renderShape();

        phase_ += increment_;
        if (phase_ >= 1.0)
            phase_ -= 1.0;

        return value;
    }

private:
    /// polyBLEP residual around a discontinuity at t = 0.
    float blep (double t) const noexcept
    {
        if (increment_ <= 0.0)
            return 0.0f;

        if (t < increment_)
        {
            const auto x = t / increment_;
            return static_cast<float> (x + x - x * x - 1.0);
        }

        if (t > 1.0 - increment_)
        {
            const auto x = (t - 1.0) / increment_;
            return static_cast<float> (x * x + x + x + 1.0);
        }

        return 0.0f;
    }

    float square (double phase, double width) const noexcept
    {
        auto value = phase < width ? 1.0f : -1.0f;
        value += blep (phase);

        auto fallingEdge = phase - width;
        if (fallingEdge < 0.0)
            fallingEdge += 1.0;

        value -= blep (fallingEdge);
        return value;
    }

    float renderShape()
    {
        switch (shape_)
        {
            case Shape::Saw:
                return static_cast<float> (2.0 * phase_ - 1.0) - blep (phase_);

            case Shape::Square:
                return square (phase_, 0.5);

            case Shape::Rectangle:
                return square (phase_, static_cast<double> (pulseWidth_));

            case Shape::Triangle:
            {
                // Integrating the band-limited square yields a band-limited triangle. The
                // leak term stops DC from accumulating when the frequency changes.
                const auto s = square (phase_, 0.5);
                triangleState_ += static_cast<float> (increment_) * 4.0f * s;
                triangleState_ *= 0.9995f;
                return std::clamp (triangleState_, -1.0f, 1.0f);
            }
        }

        return 0.0f;
    }

    void updateIncrement()
    {
        increment_ = static_cast<double> (frequency_) / sampleRate_;
    }

    double sampleRate_ = 48000.0;
    double phase_ = 0.0;
    double increment_ = 0.0;
    float frequency_ = 440.0f;
    float pulseWidth_ = 0.25f;
    float triangleState_ = 0.0f;
    Shape shape_ = Shape::Saw;
};

//==============================================================================

/** A plain sine, for kick bodies and the bass sub oscillator. */
class SineOscillator
{
public:
    void prepare (double sampleRate)
    {
        sampleRate_ = std::max (1.0, sampleRate);
    }

    void setFrequency (float hz) noexcept
    {
        increment_ = static_cast<double> (std::max (0.0f, hz)) / sampleRate_;
    }

    void reset (double startPhase = 0.0) noexcept { phase_ = startPhase; }

    float next() noexcept
    {
        const auto value = static_cast<float> (
            std::sin (phase_ * 2.0 * std::numbers::pi));

        phase_ += increment_;
        if (phase_ >= 1.0)
            phase_ -= 1.0;

        return value;
    }

private:
    double sampleRate_ = 48000.0;
    double phase_ = 0.0;
    double increment_ = 0.0;
};

//==============================================================================

/** A hard-synced square used to build metallic clusters for the hi-hat model. */
class SquareCluster
{
public:
    static constexpr int kNumOscillators = 6;

    void prepare (double sampleRate)
    {
        for (auto& osc : oscillators_)
        {
            osc.prepare (sampleRate);
            osc.setShape (BlepOscillator::Shape::Square);
        }
    }

    /// `character` morphs the inharmonic frequency ratios, which is where the tonal
    /// variation between individual analog hi-hat circuits comes from.
    void setFrequencies (float base, float character)
    {
        // Ratios in the neighbourhood of the classic analog hat oscillator bank. Nudging them
        // apart or together changes how metallic versus hollow the result reads.
        static constexpr float kRatios[kNumOscillators] =
            { 1.0f, 1.4471f, 1.6170f, 1.9265f, 2.5028f, 2.6637f };

        const auto spread = 0.85f + std::clamp (character, 0.0f, 1.0f) * 0.45f;

        for (int i = 0; i < kNumOscillators; ++i)
        {
            const auto ratio = 1.0f + (kRatios[i] - 1.0f) * spread;
            oscillators_[static_cast<std::size_t> (i)].setFrequency (base * ratio);
        }
    }

    void reset()
    {
        for (int i = 0; i < kNumOscillators; ++i)
            oscillators_[static_cast<std::size_t> (i)]
                .reset (static_cast<double> (i) * 0.137);
    }

    float next()
    {
        float sum = 0.0f;

        for (auto& osc : oscillators_)
            sum += osc.next();

        return sum * (1.0f / static_cast<float> (kNumOscillators));
    }

private:
    std::array<BlepOscillator, kNumOscillators> oscillators_;
};

} // namespace bud::dsp
