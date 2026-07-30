#pragma once

#include "../params/ParameterSet.h"

#include <array>
#include <span>
#include <string>

namespace bud
{

/// `kNumDrumKits` (16) comes from Types.h, alongside the rest of the instrument's fixed counts.
///
/// Kit data covers tracks 1-9 (p. 79) — the drum machine proper. The loop and bass tracks keep
/// their settings when a kit is loaded.
inline constexpr int kNumKitTracks = 9;

/** Which parameters a kit carries.

    The manual says only that "drum kit data is saved for Tracks 1-9" (p. 79) and never lists the
    parameters, so the membership below is ours. The principle it follows comes from what the
    feature is *for*: "swapping sounds while keeping the sequence intact" (p. 79). So a kit holds
    everything that describes how a track sounds, and nothing that describes what it plays.

    In: the eleven per-track knobs — bank, sound, tune, tone, move, attack, decay, both sends,
    pan, level — plus random velocity, choke, repitch and the snappy type, which are sound
    settings that happen to live off the knob row.

    Out: note length, step length, swing and mute. Those are sequencer settings; a kit that
    carried them would change the rhythm when it was only asked to change the sound. Mute is
    especially clear — loading a kit must not silence a track the player had left playing.

    The two stores are deliberately independent: "saving a drum kit does not save the pattern
    itself. Likewise, saving a pattern does not update the drum kit parameters" (p. 80).
*/
std::span<const ParamKind> kitParameters() noexcept;

//==============================================================================

/** One kit: a name and a value for every kit parameter on every kit track.

    Stored raw, exactly as the parameter set holds them, so saving and loading are copies rather
    than conversions and cannot drift from what the device would store.
*/
struct DrumKit
{
    std::string name;

    /// False until something has been saved here. An empty slot loads as nothing rather than as
    /// a kit of zeroes, which would silence the machine.
    bool used = false;

    std::array<std::array<int, 16>, kNumKitTracks> values {};

    void clear();
};

//==============================================================================

/** The sixteen kit slots (p. 79-80).

    `save` captures the current sound settings into a slot; `load` applies a slot to them. Both
    touch only the kit parameters on tracks 1-9 — everything else in the parameter set, and the
    entire pattern, is left exactly as it was.
*/
class KitBank
{
public:
    KitBank();

    DrumKit& kit (int index) noexcept;
    const DrumKit& kit (int index) const noexcept;

    /// Capture the current sound settings into a slot (`D.K.SAVE`, p. 80).
    bool save (int index, const ParameterSet&, std::string name = {}) noexcept;

    /// Apply a slot to the current sound settings (`D.K.LOAD`, p. 80). False if it is empty.
    bool load (int index, ParameterSet&) const noexcept;

    /// `RENAME` (p. 79). Renaming an unused slot does nothing.
    bool rename (int index, std::string) noexcept;

    void clearAll();

    static bool isValidIndex (int index) noexcept
    {
        return index >= 0 && index < kNumDrumKits;
    }

private:
    std::array<DrumKit, kNumDrumKits> kits_;
};

} // namespace bud
