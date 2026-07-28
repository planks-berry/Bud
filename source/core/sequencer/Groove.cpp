#include "Groove.h"

#include <algorithm>
#include <array>
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

    /// Smooth 1-D value noise in -1..1. Interpolating between hashed integer lattice points
    /// makes the drift *wander* rather than jitter, which is what reads as analog instability
    /// instead of randomness.
    float valueNoise (double t, std::uint32_t seed) noexcept
    {
        const auto floored = std::floor (t);
        const auto index = static_cast<std::int64_t> (floored);
        const auto frac = static_cast<float> (t - floored);

        const auto lo = static_cast<std::uint32_t> (index) ^ seed;
        const auto hi = static_cast<std::uint32_t> (index + 1) ^ seed;

        const auto a = hashToBipolar (hashInt (lo));
        const auto b = hashToBipolar (hashInt (hi));

        // smoothstep gives a continuous first derivative across lattice points
        const auto s = frac * frac * (3.0f - 2.0f * frac);
        return a + (b - a) * s;
    }

    //==========================================================================
    // How loosely each track is allowed to drift. The kick and the loop track stay near the
    // grid because they carry the pulse; hats and percussion are where the movement lives.

    constexpr std::array<float, kNumTracks> kTrackDriftWeight { {
        0.20f,  // BD1  - anchors the pulse
        0.35f,  // BD2
        0.60f,  // SD
        0.80f,  // RS / CP
        1.00f,  // CH
        1.00f,  // OH
        0.90f,  // PC1
        0.90f,  // PC2
        0.90f,  // PC3
        0.15f,  // LOOP - a drifting loop smears; keep it tight
        0.40f,  // BASS
    } };

    float driftWeight (int track) noexcept
    {
        if (track < 0 || track >= kNumTracks)
            return 1.0f;

        return kTrackDriftWeight[static_cast<std::size_t> (track)];
    }

    //==========================================================================
    // Salts, so timing, pitch and level wander independently of one another.

    constexpr std::uint32_t kTimingSalt = 0x9e37'79b9u;
    constexpr std::uint32_t kPitchSalt  = 0x6a09'e667u;
    constexpr std::uint32_t kLevelSalt  = 0xbb67'ae85u;

    std::uint32_t channelSeed (std::uint32_t seed, int track, std::uint32_t salt) noexcept
    {
        return hashInt (seed ^ salt ^ (static_cast<std::uint32_t> (track + 1) * 0x0100'0193u));
    }
}

//==============================================================================

Groove::Groove() = default;

void Groove::setModel (FeelModel m) noexcept
{
    model_ = m;
}

void Groove::setDepth (float depth) noexcept
{
    depth_ = std::clamp (depth, 0.0f, 1.0f);
}

void Groove::setTempo (double bpm) noexcept
{
    tempo_ = std::clamp (bpm, 20.0, 300.0);
}

void Groove::setSeed (std::uint32_t s) noexcept
{
    seed_ = s;
}

const Groove::Profile& Groove::profile() const noexcept
{
    // Starting points for by-ear tuning:
    //   808     pronounced pitch instability, relaxed timing that sits behind the beat
    //   909     tighter and more urgent, with a slight systematic rush
    //   MINIMAL slow, deep, evolving wander — the "hypnotic" character
    static constexpr Profile profiles[kNumFeelModels] = {
        //  timeMs  timeRate  pushMs  pitchC  pitchRate  levelSpread
        {   4.5f,   0.130f,    0.6f,   14.0f,  0.070f,    0.050f },  // 808
        {   2.2f,   0.310f,   -1.2f,    5.0f,  0.110f,    0.030f },  // 909
        {   6.0f,   0.045f,    0.0f,    9.0f,  0.030f,    0.080f },  // MINIMAL
    };

    return profiles[static_cast<std::size_t> (model_)];
}

//==============================================================================

Groove::Drift Groove::compute (int track, long long absoluteStep) const noexcept
{
    Drift drift;

    const auto& p = profile();
    const auto weight = driftWeight (track) * depth_;

    if (weight <= 0.0f)
        return drift;

    const auto step = static_cast<double> (absoluteStep);

    // ---- timing -------------------------------------------------------------
    const auto timingNoise = valueNoise (step * static_cast<double> (p.timingRate),
                                         channelSeed (seed_, track, kTimingSalt));

    const auto timingMs = (timingNoise * p.timingSpreadMs + p.pushMs) * weight;

    // milliseconds -> quarter notes at the current tempo
    drift.timingQuarterNotes = static_cast<double> (timingMs) * tempo_ / 60000.0;

    // ---- pitch --------------------------------------------------------------
    const auto pitchNoise = valueNoise (step * static_cast<double> (p.pitchRate),
                                        channelSeed (seed_, track, kPitchSalt));

    drift.pitchCents = pitchNoise * p.pitchSpreadCents * weight;

    // ---- level --------------------------------------------------------------
    const auto levelNoise = valueNoise (step * static_cast<double> (p.timingRate * 0.7f),
                                        channelSeed (seed_, track, kLevelSalt));

    drift.levelScale = std::clamp (1.0f + levelNoise * p.levelSpread * weight, 0.0f, 2.0f);

    return drift;
}

double Groove::maxTimingDriftQuarterNotes() const noexcept
{
    const auto& p = profile();
    const auto peakMs = (p.timingSpreadMs + std::abs (p.pushMs)) * depth_;

    return static_cast<double> (peakMs) * tempo_ / 60000.0;
}

float Groove::randomUnit (int track, long long absoluteStep, std::uint32_t salt) const noexcept
{
    const auto h = hashInt (channelSeed (seed_, track, salt)
                            ^ hashInt (static_cast<std::uint32_t> (absoluteStep)));

    return hashToUnit (h);
}

} // namespace bud
