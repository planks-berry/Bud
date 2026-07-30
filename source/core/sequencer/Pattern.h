#pragma once

#include "../Types.h"
#include "../params/ParameterSet.h"
#include "Step.h"

#include <array>
#include <span>
#include <string>

namespace bud
{

/** One track's sequence within a pattern.

    Holds only what is structural: the steps themselves, which variations are chained, and the
    phrase rotation. Everything adjustable by a knob — note length, step length, swing, random
    velocity, sound, level — lives in ParameterSet, so there is exactly one source of truth for
    a parameter value.

    Saving a pattern snapshots the relevant parameters alongside this data, which is how the
    hardware behaves: selecting a pattern reloads its sound settings. `PatternSettings` below is
    where that snapshot lives.
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

/** Which parameters a pattern carries.

    A pattern is more than its steps: the manual describes loading a drum kit "into the current
    pattern" (p. 79), which only means anything if the pattern holds the sound settings a kit
    would overwrite. And initialising one clears "pattern settings along with note and parameter
    lock data" (p. 57) — settings and notes named separately.

    So a pattern stores its sounds *and* its sequence. Kits are a separate store that can be
    stamped over a pattern's sounds; saving one does not save the other (p. 80).

    Left out deliberately:

    - **Master volume** — a performance control on the front panel, not a property of the music.
      A pattern that reset it would make switching patterns a volume jump.
    - **`MFX ON`** — the manual marks it as not saved with the pattern; it is a momentary
      performance switch, and a pattern that restored it would re-engage an effect the player had
      let go of.
    - **External input and sampler settings** — properties of what is plugged in, not of a
      pattern.
    - **System settings** — knob mode, mute mode, clock, master tune.
    - **Phrase rotation** — explicitly not saved (p. 55).
*/
std::span<const ParamKind> patternGlobalParameters() noexcept;
std::span<const ParamKind> patternTrackParameters() noexcept;

/// Room for the lists above, checked with a static_assert where they are defined.
inline constexpr int kMaxPatternGlobals = 24;
inline constexpr int kMaxPatternTrackParams = 24;

/** A pattern's stored parameter values, in the raw domain the device uses. */
struct PatternSettings
{
    /// False until the pattern has been saved. An unsaved pattern recalls nothing rather than a
    /// set of zeroes, which would arrive as silence.
    bool stored = false;

    std::array<int, kMaxPatternGlobals> globals {};
    std::array<std::array<int, kMaxPatternTrackParams>, kNumTracks> perTrack {};
};

//==============================================================================

/** A pattern: all eleven tracks' sequences, its stored settings, and its name. */
struct Pattern
{
    std::array<TrackPattern, kNumTracks> tracks {};
    PatternSettings settings;
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

    //==========================================================================
    // Pattern operations (p. 56-58)

    /** Save: capture the live parameters into a slot's settings (`func` + `PTN save`, p. 56).

        The steps are already in the slot — they are edited in place — so what a save adds is the
        settings snapshot and the mark that makes the slot recallable.
    */
    void store (int index, const ParameterSet&) noexcept;

    /** Recall a slot's settings into the live parameters, as selecting it does.

        @param includeTempo  false when `TEMPO` is set to `GLOBAL`, so switching pattern does not
                             change the tempo (p. 113).
        @returns false for an unsaved slot, whose settings would otherwise arrive as zeroes.
    */
    bool recall (int index, ParameterSet&, bool includeTempo) const noexcept;

    /** Initialise: `CLR` + `PTN` (p. 57).

        Clears the steps, the parameter locks and the stored settings — the manual lists all
        three. Does not touch the live parameters: initialising a pattern you are not currently
        on must not reach out and change the sound of the one you are playing.
    */
    void initialise (int index) noexcept;

    /// `PT.RENM` (p. 58). Naming an unsaved pattern is allowed — the name is how it is found.
    bool rename (int index, std::string) noexcept;

private:
    std::array<Pattern, kNumPatterns> patterns_;
};

} // namespace bud
