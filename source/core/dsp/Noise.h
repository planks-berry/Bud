#pragma once

#include <cstdint>

namespace bud::dsp
{

/** Deterministic white noise.

    Seeded per voice so a rendered pattern is bit-identical between runs, which is what makes
    golden-file DSP regression tests possible.
*/
class Noise
{
public:
    explicit Noise (std::uint32_t seed = 0x1234'5678u) : state_ (seed | 1u) {}

    void setSeed (std::uint32_t seed) noexcept { state_ = seed | 1u; }

    /// White noise in -1 to 1.
    float next() noexcept
    {
        // xorshift32 — cheap, and long enough a period for audio
        state_ ^= state_ << 13;
        state_ ^= state_ >> 17;
        state_ ^= state_ << 5;

        return static_cast<float> (state_) * (2.0f / 4294967295.0f) - 1.0f;
    }

private:
    std::uint32_t state_;
};

} // namespace bud::dsp
