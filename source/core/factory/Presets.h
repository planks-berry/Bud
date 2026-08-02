#pragma once

#include "../Types.h"

#include <span>
#include <string_view>

namespace bud
{
class Engine;
}

namespace bud::factory
{

/** Genre starting points.

    A preset is a whole setting rather than a sound: tempo, FEEL, swing, which of each track's
    five sounds to use, and a one-bar pattern. Loading one gives you something playing that
    already sounds like the genre, which is a far better place to start editing from than an
    empty grid at 120 bpm.

    They are **starting points, not transcriptions**. Each is the rhythmic skeleton a genre is
    built on — the kick placement, where the backbeat sits, how the hats subdivide, what the
    percussion does — written from the conventions of the style rather than copied from any
    particular record. Nothing here reproduces a specific track, and the sounds are the same
    original synthesis the rest of the instrument uses.
*/

/// One track's part within a preset.
struct PresetTrack
{
    int track;                 ///< 0 … kNumTracks - 1

    /// Which of that track's five sounds (factory::soundMenu), or -1 to leave the sound alone.
    int sound;

    /** Sixteen characters, one per step:

            .  silent      x  play       X  hard accent      o  soft accent

        A string rather than a list of indices because a drum pattern is a *shape*, and reading
        it as one in the source is what makes 30 of them reviewable.
    */
    std::string_view steps;

    /// Track level 0-127, or -1 for the parameter default.
    int level = -1;

    /** Semitone offsets applied to the gated steps in order, cycling if shorter.

        Only meaningful on the pitched tracks. Empty leaves every note on the root, which is
        what the drum tracks want.
    */
    std::span<const int> notes = {};
};

struct Preset
{
    std::string_view name;
    std::string_view family;   ///< "House", "Techno", "Trance", "Bass"
    int tempo;
    FeelModel feel;
    int swing;                 ///< 50-75, as the device counts it: 50 is straight
    std::span<const PresetTrack> tracks;
};

/// Every preset, grouped by family in order.
std::span<const Preset> presets() noexcept;

/** Load one into the engine: clears the current pattern, then writes the whole setting.

    Only the current pattern and the parameters the preset names are touched, so the other
    fifteen patterns, the user sample banks and the effects settings are left as they were.
*/
void applyPreset (Engine&, int index);

} // namespace bud::factory
