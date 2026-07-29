#include "Groove.h"

#include "../params/Curves.h"

#include <algorithm>
#include <cmath>

namespace bud
{

namespace
{
    //==========================================================================
    // Deterministic noise.

    std::uint32_t hashInt (std::uint32_t x) noexcept
    {
        // finalising mix from MurmurHash3 — cheap and well distributed
        x ^= x >> 16;
        x *= 0x85eb'ca6bu;
        x ^= x >> 13;
        x *= 0xc2b2'ae35u;
        x ^= x >> 16;
        return x;
    }

    float hashToBipolar (std::uint32_t h) noexcept
    {
        return static_cast<float> (h) * (2.0f / 4294967295.0f) - 1.0f;
    }

    float hashToUnit (std::uint32_t h) noexcept
    {
        return static_cast<float> (h) * (1.0f / 4294967295.0f);
    }

    /// Smooth 1-D value noise in -1..1, for the shared wander. Interpolating between hashed
    /// lattice points makes it *wander* rather than jitter, which is what "uniformly modulates
    /// the overall rhythm" asks for.
    float valueNoise (double t, std::uint32_t seed) noexcept
    {
        const auto floored = std::floor (t);
        const auto index = static_cast<std::int64_t> (floored);
        const auto frac = static_cast<float> (t - floored);

        const auto a = hashToBipolar (hashInt (static_cast<std::uint32_t> (index) ^ seed));
        const auto b = hashToBipolar (hashInt (static_cast<std::uint32_t> (index + 1) ^ seed));

        const auto s = frac * frac * (3.0f - 2.0f * frac);
        return a + (b - a) * s;
    }

    /// Uncorrelated per-note value in -1..1. Independent between adjacent notes, unlike the
    /// wander — "slight random offsets to the note timing" means jitter, not drift.
    float noteNoise (std::uint32_t seed, int track, long long step, std::uint32_t salt) noexcept
    {
        const auto channel = hashInt (seed ^ salt
                                      ^ (static_cast<std::uint32_t> (track + 1) * 0x0100'0193u));
        return hashToBipolar (hashInt (channel ^ hashInt (static_cast<std::uint32_t> (step))));
    }

    constexpr std::uint32_t kUniformSalt = 0x9e37'79b9u;
    constexpr std::uint32_t kPerNoteSalt = 0x6a09'e667u;
    constexpr std::uint32_t kExtraSalt   = 0xbb67'ae85u;
    constexpr std::uint32_t kPitchSalt   = 0x3c6e'f372u;
}

//==============================================================================

Groove::Groove() = default;

void Groove::setModel (FeelModel m) noexcept { model_ = m; }

void Groove::setDepth (float depth) noexcept
{
    depth_ = std::clamp (depth, 0.0f, 1.0f);
}

void Groove::setTempo (double bpm) noexcept
{
    tempo_ = std::clamp (bpm, 20.0, 300.0);
}

void Groove::setSeed (std::uint32_t s) noexcept { seed_ = s; }

const Groove::Profile& Groove::profile() const noexcept
{
    // Magnitudes are starting points for by-ear tuning; the *structure* of each row follows the
    // manual's description of that model. See docs/PARAMETERS.md.
    static constexpr Profile profiles[kNumFeelModels] = {
        // uniformDelay  wander  rate    perNote  hatPitch
        {  3.5f,         0.0f,   0.0f,   0.4f,    35.0f },  // 08 — uniform delay, hat pitch
        {  0.0f,         0.0f,   0.0f,   2.2f,     0.0f },  // 09 — jitter only, no uniform part
        {  0.0f,         5.5f,   0.045f, 0.6f,    90.0f },  // MN — slow shared wander, deep hats
    };

    return profiles[static_cast<std::size_t> (model_)];
}

//==============================================================================

Groove::Drift Groove::compute (SoundBank bank, int track, long long absoluteStep) const noexcept
{
    Drift drift;

    const auto& info = bankInfo (bank);

    // FX and every sample bank are untouched by FEEL (p. 61).
    if (info.feel == FeelClass::None || depth_ <= 0.0f)
        return drift;

    const auto& p = profile();

    // Shared component — identical across every voice at this step, which is what makes it read
    // as the whole rhythm moving rather than the parts loosening against each other.
    auto milliseconds = p.uniformDelayMs;

    if (p.uniformWanderMs > 0.0f)
        milliseconds += valueNoise (static_cast<double> (absoluteStep)
                                        * static_cast<double> (p.uniformRate),
                                    hashInt (seed_ ^ kUniformSalt))
                      * p.uniformWanderMs;

    // Independent jitter per note.
    if (p.perNoteMs > 0.0f)
        milliseconds += noteNoise (seed_, track, absoluteStep, kPerNoteSalt) * p.perNoteMs;

    // The bank's own extra offset, on top of the FEEL offset (p. 61).
    milliseconds += noteNoise (seed_, track, absoluteStep, kExtraSalt)
                  * curves::feelExtraMs (info.feel);

    drift.timingQuarterNotes = static_cast<double> (milliseconds * depth_) * tempo_ / 60000.0;

    // Pitch modulation belongs to the hi-hats alone.
    if (bank == SoundBank::HH_CY && p.hatPitchCents > 0.0f)
        drift.pitchCents = noteNoise (seed_, track, absoluteStep, kPitchSalt)
                         * p.hatPitchCents * depth_;

    return drift;
}

double Groove::maxTimingDriftQuarterNotes() const noexcept
{
    const auto& p = profile();

    const auto peakMs = (std::abs (p.uniformDelayMs) + p.uniformWanderMs + p.perNoteMs
                         + curves::feelExtraMs (FeelClass::Significant))
                      * depth_;

    return static_cast<double> (peakMs) * tempo_ / 60000.0;
}

float Groove::randomUnit (int track, long long absoluteStep, std::uint32_t salt) const noexcept
{
    const auto channel = hashInt (seed_ ^ salt
                                  ^ (static_cast<std::uint32_t> (track + 1) * 0x0100'0193u));

    return hashToUnit (hashInt (channel ^ hashInt (static_cast<std::uint32_t> (absoluteStep))));
}

} // namespace bud
