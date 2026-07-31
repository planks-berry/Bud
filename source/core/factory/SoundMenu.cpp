#include "SoundMenu.h"

#include <array>

namespace bud::factory
{

namespace
{
    /// The five bass oscillator settings the SOUND knob selects (p. 72). The knob is a 0-127
    /// range divided into fifths, so each entry names the middle of its fifth — far enough from
    /// the boundaries that rounding cannot land on a neighbour.
    constexpr SoundChoice kBass[] = {
        { "SAW",    SoundBank::BASS,  12 },
        { "SQUARE", SoundBank::BASS,  38 },
        { "TRI",    SoundBank::BASS,  64 },
        { "RECT",   SoundBank::BASS,  90 },
        { "S01",    SoundBank::BASS, 115 },
    };

    constexpr SoundChoice kKick[] = {
        { "DEEP",  SoundBank::BD, 0 },
        { "PUNCH", SoundBank::BD, 1 },
        { "TIGHT", SoundBank::BD, 2 },
        { "DRIVE", SoundBank::BD, 3 },
        { "SUB",   SoundBank::BD, 4 },
    };

    constexpr SoundChoice kSnare[] = {
        { "CRACK", SoundBank::SD, 0 },
        { "FAT",   SoundBank::SD, 1 },
        { "RIM",   SoundBank::SD, 2 },
        { "BRUSH", SoundBank::SD, 3 },
        { "GATED", SoundBank::SD, 4 },
    };

    constexpr SoundChoice kClap[] = {
        { "CLASSIC", SoundBank::CP, 0 },
        { "TIGHT",   SoundBank::CP, 1 },
        { "ROOM",    SoundBank::CP, 2 },
        { "WIDE",    SoundBank::CP, 3 },
        { "SNAPPY",  SoundBank::CP, 4 },
    };

    // Closed and open hats share the HH_CY bank but are different instruments on different
    // tracks, so the bank carries ten signature slots and each track offers its own five.
    constexpr SoundChoice kClosedHat[] = {
        { "TIGHT",  SoundBank::HH_CY, 0 },
        { "TICK",   SoundBank::HH_CY, 1 },
        { "PEDAL",  SoundBank::HH_CY, 2 },
        { "SIZZLE", SoundBank::HH_CY, 3 },
        { "METAL",  SoundBank::HH_CY, 4 },
    };

    constexpr SoundChoice kOpenHat[] = {
        { "OPEN",   SoundBank::HH_CY, 5 },
        { "LONG",   SoundBank::HH_CY, 6 },
        { "SPLASH", SoundBank::HH_CY, 7 },
        { "RIDE",   SoundBank::HH_CY, 8 },
        { "CRASH",  SoundBank::HH_CY, 9 },
    };

    constexpr SoundChoice kTom[] = {
        { "FLOOR", SoundBank::TT, 0 },
        { "LOW",   SoundBank::TT, 1 },
        { "MID",   SoundBank::TT, 2 },
        { "HIGH",  SoundBank::TT, 3 },
        { "SYNTH", SoundBank::TT, 4 },
    };

    constexpr SoundChoice kStick[] = {
        { "RIM",   SoundBank::ST, 0 },
        { "CLAVE", SoundBank::ST, 1 },
        { "WOOD",  SoundBank::ST, 2 },
        { "TICK",  SoundBank::ST, 3 },
        { "SIDE",  SoundBank::ST, 4 },
    };

    constexpr SoundChoice kPerc[] = {
        { "CONGA",   SoundBank::PC, 0 },
        { "COWBELL", SoundBank::PC, 1 },
        { "SHAKER",  SoundBank::PC, 2 },
        { "TAMB",    SoundBank::PC, 3 },
        { "BLOCK",   SoundBank::PC, 4 },
    };

    // The loop track's own bank, S8, is where a person's recordings go and starts empty, so the
    // factory loops live at the head of FX — a bank no track uses as its default. Recording into
    // S8 and selecting it still works exactly as before.
    constexpr SoundChoice kLoop[] = {
        { "FOUR/FOUR", SoundBank::FX, 0 },
        { "BREAK",     SoundBank::FX, 1 },
        { "BOOM BAP",  SoundBank::FX, 2 },
        { "SPARSE",    SoundBank::FX, 3 },
        { "PERC",      SoundBank::FX, 4 },
    };

    /// Indexed by track, in the order of kTrackInfo.
    constexpr std::span<const SoundChoice> kMenus[] = {
        kKick,        // BD1
        kKick,        // BD2
        kSnare,       // SD
        kClap,        // CP
        kClosedHat,   // CH
        kOpenHat,     // OH
        kTom,         // TT
        kStick,       // ST
        kPerc,        // PC
        kLoop,        // LOOP
        kBass,        // BASS
    };

    static_assert (std::size (kMenus) == static_cast<std::size_t> (kNumTracks),
                   "every track needs a menu");
}

//==============================================================================

std::span<const SoundChoice> soundMenu (int track) noexcept
{
    if (track < 0 || track >= kNumTracks)
        return {};

    return kMenus[static_cast<std::size_t> (track)];
}

int menuIndexFor (int track, SoundBank bank, int sound) noexcept
{
    const auto menu = soundMenu (track);

    for (std::size_t i = 0; i < menu.size(); ++i)
    {
        if (menu[i].bank != bank)
            continue;

        // The bass entries name the middle of a fifth of the knob rather than an exact value,
        // so a match there means "within the same fifth" rather than "equal".
        const auto matches = bank == SoundBank::BASS
                           ? (sound * 5 / (kRawMax + 1)) == (menu[i].sound * 5 / (kRawMax + 1))
                           : sound == menu[i].sound;

        if (matches)
            return static_cast<int> (i);
    }

    return -1;
}

} // namespace bud::factory
