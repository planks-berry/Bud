#pragma once

#include "../Types.h"
#include "Step.h"

#include <array>
#include <string>

namespace bud
{

/** One track's sequence within a pattern.

    Holds only what is structural: the steps themselves, which variations are chained, and the
    phrase rotation. Everything adjustable by a knob — note length, step length, swing, random
    velocity, sound, level — lives in ParameterSet, so there is exactly one source of truth for
    a parameter value.

    Saving a pattern (a later milestone) snapshots the relevant parameters alongside this data,
    which is how the hardware behaves: selecting a pattern reloads its sound settings.
*/
struct TrackPattern
{
    using StepArray = std::array<Step, kStepsPerVariation>;

    std::array<StepArray, kNumVariations> variations {};

    /// The variations this track plays, in order. Length 1 to kNumVariations.
    std::array<Variation, kNumVariations> chain { Variation::A, Variation::B,
                                                  Variation::C, Variation::D };
    int chainLength = 1;

    /// Phrase rotation, in steps. Positive moves the phrase later. Not saved with the pattern
    /// (p. 55) and applied as a read offset, so it can be swept during playback.
    int rotation = 0;

    //==========================================================================

    StepArray& variation (Variation v) noexcept;
    const StepArray& variation (Variation v) const noexcept;

    /// The step at a position in the chained sequence, with rotation applied.
    /// `stepLength` comes from the parameter set, so it is passed in.
    Step& stepAt (int chainIndex, int stepIndex, int stepLength) noexcept;
    const Step& stepAt (int chainIndex, int stepIndex, int stepLength) const noexcept;

    void clear();
    void clearVariation (Variation);
    void copyVariation (Variation from, Variation to);

    /// Destructively rotate the stored steps of a variation, as opposed to the non-destructive
    /// `rotation` read offset.
    void rotateVariationInPlace (Variation, int amount, int stepLength);

    void setChain (std::initializer_list<Variation>);
};

//==============================================================================

/** A pattern: all eleven tracks' sequences, plus its name. */
struct Pattern
{
    std::array<TrackPattern, kNumTracks> tracks {};
    std::string name;

    void clear();

    TrackPattern& track (int index) noexcept { return tracks[static_cast<std::size_t> (index)]; }
    const TrackPattern& track (int index) const noexcept { return tracks[static_cast<std::size_t> (index)]; }
};

//==============================================================================

/** The pattern store: 8 banks of 16 (p. 17).

    Patterns are addressed either by a flat 0-127 index or by bank and slot; the hardware
    presents the latter, so both are offered.
*/
class PatternBank
{
public:
    PatternBank();

    Pattern& pattern (int index) noexcept;
    const Pattern& pattern (int index) const noexcept;

    Pattern& pattern (int bank, int slot) noexcept { return pattern (flatIndex (bank, slot)); }

    static constexpr int flatIndex (int bank, int slot) noexcept
    {
        return bank * kPatternsPerBank + slot;
    }

    static constexpr int bankOf (int index) noexcept { return index / kPatternsPerBank; }
    static constexpr int slotOf (int index) noexcept { return index % kPatternsPerBank; }

    static constexpr int size() noexcept { return kNumPatterns; }

    void clear (int index);
    void copy (int from, int to);

private:
    std::array<Pattern, kNumPatterns> patterns_;
};

} // namespace bud
