#pragma once

#include "../Types.h"
#include "Step.h"

#include <array>
#include <string>

namespace bud
{

/** One track's worth of a pattern: four variations plus that track's sequencer settings.

    Length, division, rotation and swing are per track, which is what lets tracks run
    polymetrically against one another — a 12-step hi-hat over a 16-step kick, or a hat at
    1/32 against a kick at 1/16.
*/
struct TrackPattern
{
    using StepArray = std::array<Step, kStepsPerVariation>;

    std::array<StepArray, kNumVariations> variations {};

    /// Active steps per variation, 1 to 16.
    int stepLength = kStepsPerVariation;

    /// Time occupied by one step.
    StepDivision division = StepDivision::Sixteenth;

    /// Phrase rotation, in steps. Positive rotates the phrase later.
    int rotation = 0;

    /// Per-track swing, -0.5 to +0.5, delaying (or advancing) odd-numbered steps.
    float swing = 0.0f;

    /// Per-track random velocity amount, 0 to 1.
    float randomVelocity = 0.0f;

    /// The variations this track plays, in order. Length 1 to kNumVariations.
    std::array<Variation, kNumVariations> chain { Variation::A, Variation::B,
                                                  Variation::C, Variation::D };
    int chainLength = 1;

    bool muted = false;

    //==========================================================================

    StepArray& variation (Variation v) noexcept;
    const StepArray& variation (Variation v) const noexcept;

    /// The step at a position in the chained sequence, with rotation applied.
    Step& stepAt (int chainIndex, int stepIndex) noexcept;
    const Step& stepAt (int chainIndex, int stepIndex) const noexcept;

    /// Total steps in one pass of the chain.
    int totalSteps() const noexcept { return stepLength * chainLength; }

    void clear();
    void clearVariation (Variation);
    void copyVariation (Variation from, Variation to);

    /// Rotate the stored steps of a variation in place, leaving `rotation` untouched.
    /// Use this for a destructive rotate; use `rotation` for a non-destructive one.
    void rotateVariationInPlace (Variation, int amount);

    void setChain (std::initializer_list<Variation>);
};

//==============================================================================

/** A pattern: all eleven tracks, plus the settings stored with it. */
struct Pattern
{
    std::array<TrackPattern, kNumTracks> tracks {};

    double tempo = 128.0;
    float globalSwing = 0.0f;
    FeelModel feel = FeelModel::Minimal;
    float feelDepth = 0.5f;
    std::string name;

    void clear();

    TrackPattern& track (int index) noexcept { return tracks[static_cast<std::size_t> (index)]; }
    const TrackPattern& track (int index) const noexcept { return tracks[static_cast<std::size_t> (index)]; }
};

//==============================================================================

/** The 128-pattern bank. */
class PatternBank
{
public:
    PatternBank();

    Pattern& pattern (int index) noexcept;
    const Pattern& pattern (int index) const noexcept;

    static constexpr int size() noexcept { return kNumPatterns; }

    void clear (int index);
    void copy (int from, int to);

private:
    std::array<Pattern, kNumPatterns> patterns_;
};

} // namespace bud
