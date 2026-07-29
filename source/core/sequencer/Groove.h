#pragma once

#include "../Types.h"

#include <cstdint>

namespace bud
{

/** FEEL — the drift model (p. 54).

    The three settings are not three strengths of one effect; they are structurally different,
    and the manual describes each in its own terms:

    - **08** "uniformly delaying the entire rhythm while randomly modulating the hi-hat pitch" —
      a constant offset applied to every voice alike, plus pitch instability on the hats.
    - **09** "applying slight random offsets to the note timing" — no uniform component at all,
      just small independent jitter per note. This is the tight, urgent one.
    - **MN** "uniformly modulates the overall rhythm while applying large random pitch
      variations to the hi-hat" — a slow wander shared across voices, and much deeper hat pitch
      movement.

    Two consequences worth stating, because both were modelled wrongly before the manual was
    available: the pitch modulation is **specific to the hi-hat bank**, not applied to every
    voice; and how much extra timing offset a voice takes is a property of its **sound bank**,
    not its track (p. 61) — with FX and every sample bank exempt from FEEL entirely.

    Drift is fully deterministic for a given (model, seed, bank, track, step), so patterns
    reproduce exactly and the timing tests can assert sample positions.
*/
class Groove
{
public:
    struct Drift
    {
        double timingQuarterNotes = 0.0;  ///< Onset offset, signed
        float pitchCents = 0.0f;          ///< Hi-hat only
    };

    Groove();

    void setModel (FeelModel) noexcept;
    FeelModel model() const noexcept { return model_; }

    /// Overall amount, 0 (locked to the grid) to 1 (full modelled character).
    void setDepth (float depth) noexcept;
    float depth() const noexcept { return depth_; }

    /// Hardware drift is roughly constant in milliseconds, so its musical size grows with
    /// tempo — which is what makes fast patterns feel more urgent.
    void setTempo (double bpm) noexcept;

    void setSeed (std::uint32_t) noexcept;
    std::uint32_t seed() const noexcept { return seed_; }

    /// Drift for a voice at an absolute step index. Deterministic and side-effect free.
    Drift compute (SoundBank, int track, long long absoluteStep) const noexcept;

    /// Largest timing offset the current settings can produce, for scheduler lookahead.
    double maxTimingDriftQuarterNotes() const noexcept;

    /// Deterministic 0..1 value used for random velocity. Shares the seed so a pattern
    /// reproduces exactly.
    float randomUnit (int track, long long absoluteStep, std::uint32_t salt) const noexcept;

private:
    struct Profile
    {
        float uniformDelayMs;   ///< Constant offset applied to every voice (08)
        float uniformWanderMs;  ///< Slow shared wander (MN)
        float uniformRate;      ///< Cycles per step for the wander
        float perNoteMs;        ///< Independent jitter per note (09)
        float hatPitchCents;    ///< Hi-hat pitch modulation depth
    };

    const Profile& profile() const noexcept;

    FeelModel model_ = FeelModel::Minimal;
    float depth_ = 0.5f;
    double tempo_ = 128.0;
    std::uint32_t seed_ = 0x5eed'1234u;
};

} // namespace bud
