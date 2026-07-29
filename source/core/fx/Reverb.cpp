#include "Reverb.h"

#include <algorithm>
#include <cmath>

namespace bud::fx
{

namespace
{
    /// Delay lengths in milliseconds, mutually prime-ish so their echoes do not line up and
    /// produce a ringing pitch. One set per reverb type.
    struct Tuning
    {
        float delays[8];
        float diffusers[4];
        float feedback;
        float dampingHz;
    };

    constexpr Tuning kRoom = {
        { 23.1f, 29.7f, 37.3f, 43.9f, 51.1f, 58.3f, 64.7f, 71.3f },
        { 4.7f, 6.1f, 8.3f, 11.9f },
        0.62f, 4200.0f
    };

    constexpr Tuning kHall = {
        { 47.3f, 59.9f, 71.7f, 83.9f, 97.1f, 109.3f, 123.7f, 137.9f },
        { 7.1f, 9.7f, 13.3f, 17.9f },
        0.80f, 5200.0f
    };

    // A plate is short like a room but far denser and brighter, so: short delays, high feedback,
    // damping well out of the way.
    constexpr Tuning kPlate = {
        { 17.9f, 22.3f, 27.1f, 31.7f, 37.9f, 42.3f, 47.1f, 53.9f },
        { 3.1f, 4.3f, 5.9f, 7.7f },
        0.76f, 9000.0f
    };

    const Tuning& tuningFor (ReverbType type) noexcept
    {
        switch (type)
        {
            case ReverbType::Room:  return kRoom;
            case ReverbType::Hall:  return kHall;
            case ReverbType::Plate: return kPlate;
        }
        return kRoom;
    }
}

//==============================================================================

void Reverb::prepare (double sampleRate)
{
    sampleRate_ = std::max (1.0, sampleRate);

    for (auto& filter : damping_)
    {
        filter.prepare (sampleRate_);
        filter.setMode (dsp::StateVariableFilter::Mode::LowPass);
        filter.setResonance (0.0f);
    }

    rumbleFilter_.prepare (sampleRate_);
    rumbleFilter_.setCutoff (120.0f);

    retune();
    reset();
}

void Reverb::reset()
{
    for (auto& delay : delays_)
        delay.clear();

    for (auto& diffuser : diffusers_)
        diffuser.clear();

    for (auto& filter : damping_)
        filter.reset();

    rumbleFilter_.reset();
}

void Reverb::setType (ReverbType type) noexcept
{
    if (type == type_)
        return;

    type_ = type;
    retune();
    reset();
}

void Reverb::retune()
{
    const auto& tuning = tuningFor (type_);

    const auto toSamples = [this] (float ms)
    {
        return static_cast<int> (static_cast<double> (ms) * 0.001 * sampleRate_);
    };

    for (int i = 0; i < kNumDelays; ++i)
    {
        delays_[static_cast<std::size_t> (i)].prepare (toSamples (tuning.delays[i]));
        damping_[static_cast<std::size_t> (i)].setCutoff (tuning.dampingHz);
    }

    for (int i = 0; i < 4; ++i)
        diffusers_[static_cast<std::size_t> (i)].prepare (toSamples (tuning.diffusers[i]));

    feedback_ = tuning.feedback;
    dampingHz_ = tuning.dampingHz;
}

//==============================================================================

void Reverb::process (const float* inLeft, const float* inRight,
                      float* outLeft, float* outRight, int numSamples, float wetGain) noexcept
{
    if (wetGain <= 0.0f)
        return;

    for (int i = 0; i < numSamples; ++i)
    {
        auto input = (inLeft[i] + inRight[i]) * 0.5f;
        input = rumbleFilter_.process (input);

        // Allpass diffusion: spreads a transient into a dense cloud before it reaches the tank,
        // so the early part of the tail has no audible individual echoes.
        for (auto& diffuser : diffusers_)
        {
            const auto delayed = diffuser.read();
            const auto scattered = input + delayed * -0.6f;
            diffuser.write (scattered);
            input = delayed + scattered * 0.6f;
        }

        // Read the tank.
        std::array<float, kNumDelays> taps {};

        for (int d = 0; d < kNumDelays; ++d)
            taps[static_cast<std::size_t> (d)] =
                damping_[static_cast<std::size_t> (d)].process (
                    delays_[static_cast<std::size_t> (d)].read());

        // A Hadamard matrix mixes every line into every other on each pass. That is what builds
        // density — without the scattering the lines stay independent and it sounds like eight
        // separate echoes rather than one space. Unrolled, since it is eight fixed points.
        std::array<float, kNumDelays> mixed {};

        const auto a0 = taps[0] + taps[1], a1 = taps[0] - taps[1];
        const auto a2 = taps[2] + taps[3], a3 = taps[2] - taps[3];
        const auto a4 = taps[4] + taps[5], a5 = taps[4] - taps[5];
        const auto a6 = taps[6] + taps[7], a7 = taps[6] - taps[7];

        const auto b0 = a0 + a2, b1 = a1 + a3, b2 = a0 - a2, b3 = a1 - a3;
        const auto b4 = a4 + a6, b5 = a5 + a7, b6 = a4 - a6, b7 = a5 - a7;

        constexpr auto normalise = 0.35355339f;   // 1 / sqrt(8)

        mixed[0] = (b0 + b4) * normalise;
        mixed[1] = (b1 + b5) * normalise;
        mixed[2] = (b2 + b6) * normalise;
        mixed[3] = (b3 + b7) * normalise;
        mixed[4] = (b0 - b4) * normalise;
        mixed[5] = (b1 - b5) * normalise;
        mixed[6] = (b2 - b6) * normalise;
        mixed[7] = (b3 - b7) * normalise;

        for (int d = 0; d < kNumDelays; ++d)
            delays_[static_cast<std::size_t> (d)].write (
                input + mixed[static_cast<std::size_t> (d)] * feedback_);

        // Alternate lines to each side, for a wide tail from a mono send.
        const auto wetLeft = (taps[0] + taps[2] + taps[4] + taps[6]) * 0.25f;
        const auto wetRight = (taps[1] + taps[3] + taps[5] + taps[7]) * 0.25f;

        outLeft[i] += wetLeft * wetGain;
        outRight[i] += wetRight * wetGain;
    }
}

} // namespace bud::fx
