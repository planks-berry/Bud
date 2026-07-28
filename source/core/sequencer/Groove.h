#pragma once

#include "../Types.h"

#include <cstdint>

namespace bud
{

/** FEEL — the per-voice micro-timing and pitch drift model.

    This is the modelled device's signature behaviour, and the reason the sequencer schedules in
    fractional quarter notes rather than on step boundaries: the drift is *sub-step*, and
    quantising it away removes the entire effect.

    Drift is applied per voice rather than as a global swing, so a hi-hat can wander on one
    curve while the kick stays locked. It is also fully deterministic — a given (model, seed,
    track, step) always produces the same drift — so patterns are reproducible across runs and
    the timing tests can assert exact sample positions.

    The profile constants below are analytically chosen starting points. They are the values to
    tune by ear against the hardware; see docs/DEVICE_SPEC.md.
*/
class Groove
{
public:
    struct Drift
    {
        double timingQuarterNotes = 0.0;  ///< Onset offset, signed
        float pitchCents = 0.0f;          ///< Pitch deviation
        float levelScale = 1.0f;          ///< Amplitude multiplier around 1.0
    };

    Groove();

    void setModel (FeelModel) noexcept;
    FeelModel model() const noexcept { return model_; }

    /// Overall drift amount, 0 (locked to the grid) to 1 (full modelled character).
    void setDepth (float depth) noexcept;
    float depth() const noexcept { return depth_; }

    /// Tempo is needed because hardware drift is roughly constant in milliseconds, so its
    /// musical size grows with tempo — which is what makes fast patterns feel more urgent.
    void setTempo (double bpm) noexcept;

    void setSeed (std::uint32_t) noexcept;
    std::uint32_t seed() const noexcept { return seed_; }

    /// Drift for a track at an absolute step index. Deterministic and side-effect free.
    Drift compute (int track, long long absoluteStep) const noexcept;

    /// Largest timing offset the current settings can produce, for scheduler lookahead.
    double maxTimingDriftQuarterNotes() const noexcept;

    /// Deterministic 0..1 value used for random velocity. Shares the seed so a pattern
    /// reproduces exactly.
    float randomUnit (int track, long long absoluteStep, std::uint32_t salt) const noexcept;

private:
    struct Profile
    {
        float timingSpreadMs;    ///< Peak wander of the onset
        float timingRate;        ///< Cycles per step; lower evolves more slowly
        float pushMs;            ///< Systematic offset; negative rushes
        float pitchSpreadCents;
        float pitchRate;
        float levelSpread;
    };

    const Profile& profile() const noexcept;

    FeelModel model_ = FeelModel::Minimal;
    float depth_ = 0.5f;
    double tempo_ = 128.0;
    std::uint32_t seed_ = 0x5eed'1234u;
};

} // namespace bud
