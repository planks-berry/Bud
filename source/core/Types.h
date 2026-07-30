#pragma once

#include <array>
#include <cstdint>
#include <string_view>

namespace bud
{

//==============================================================================
// Fixed dimensions of the instrument. See docs/DEVICE_SPEC.md, which cites the manual page
// for each of these.

inline constexpr int kNumTracks         = 11;
inline constexpr int kNumDrumTracks     = 6;    ///< Tracks 1-6
inline constexpr int kNumSampleTracks   = 4;    ///< Tracks 7-10
inline constexpr int kNumVariations     = 4;    ///< A, B, C, D
inline constexpr int kStepsPerVariation = 16;
inline constexpr int kMaxChainedSteps   = kNumVariations * kStepsPerVariation;  // 64

inline constexpr int kPatternsPerBank = 16;
inline constexpr int kNumPatternBanks = 8;
inline constexpr int kNumPatterns     = kPatternsPerBank * kNumPatternBanks;  // 128

inline constexpr int kNumDrumKits = 16;
/// Drum kits cover tracks 1-9 only.
inline constexpr int kDrumKitTracks = 9;

/// Index of the dedicated stereo loop track.
inline constexpr int kLoopTrack = 9;
/// Index of the bass synth track.
inline constexpr int kBassTrack = 10;

/// The raw domain the hardware stores nearly every parameter in.
inline constexpr int kRawMin    = 0;
inline constexpr int kRawMax    = 127;
inline constexpr int kRawCentre = 64;

//==============================================================================

enum class TrackKind : std::uint8_t
{
    Drum,    ///< Tracks 1-6
    Sample,  ///< Tracks 7-10
    Bass     ///< Track 11
};

/** Sound banks.

    The bank, not the track, decides how strongly FEEL and random velocity apply — the manual
    tabulates both against the bank (p. 61). It also decides what the TONE and MOVE knobs mean
    (p. 62), which is why so much of the engine dispatches on this rather than on track index.
*/
enum class SoundBank : std::uint8_t
{
    BD = 0,   ///< Bass drum. Dedicated synthesis on track 1.
    SD,       ///< Snare drum. Dedicated synthesis on track 3.
    HH_CY,    ///< Hi-hats and cymbals
    CP,       ///< Clap
    ST,       ///< Stick
    TT,       ///< Tom
    PC,       ///< Percussion
    SY_BS,    ///< Synth
    FX,       ///< Sound effect
    S2,       ///< User samples, 2 s mono
    S4,       ///< User samples, 4 s mono
    S8,       ///< User samples, 8 s stereo (track 10)
    BASS      ///< Bass synth (track 11)
};

inline constexpr int kNumSoundBanks = 13;

/// How much extra timing offset a bank takes on top of the FEEL offset (p. 61).
enum class FeelClass : std::uint8_t
{
    None = 0,     ///< FX and every sample bank: not affected by FEEL at all
    Tiny,         ///< BD, ST, SY/BS
    Slight,       ///< SD, TT, PC
    Moderate,     ///< HH/CY
    Significant   ///< CP
};

/// How deep random velocity can go on a bank (p. 61).
enum class RandomClass : std::uint8_t
{
    Subtle = 0,   ///< "Subtle randomness even at the maximum value"
    Moderate,
    Strong,
    Aggressive    ///< Bass only
};

struct SoundBankInfo
{
    std::string_view name;      ///< As shown on the display
    std::string_view longName;
    FeelClass feel;
    RandomClass random;
    bool isUserSample;          ///< Content comes from the sample banks, not the factory set
};

inline constexpr std::array<SoundBankInfo, kNumSoundBanks> kSoundBankTable { {
    { "BD",   "Bass Drum",    FeelClass::Tiny,        RandomClass::Subtle,     false },
    { "SD",   "Snare Drum",   FeelClass::Slight,      RandomClass::Moderate,   false },
    { "HH",   "HiHat / Cym",  FeelClass::Moderate,    RandomClass::Strong,     false },
    { "CP",   "Clap",         FeelClass::Significant, RandomClass::Strong,     false },
    { "ST",   "Stick",        FeelClass::Tiny,        RandomClass::Subtle,     false },
    { "TT",   "Tom",          FeelClass::Slight,      RandomClass::Moderate,   false },
    { "PC",   "Percussion",   FeelClass::Slight,      RandomClass::Moderate,   false },
    { "SY",   "Synth",        FeelClass::Tiny,        RandomClass::Subtle,     false },
    { "FX",   "Sound Effect", FeelClass::None,        RandomClass::Subtle,     false },
    { "S2",   "Sample 2s",    FeelClass::None,        RandomClass::Subtle,     true  },
    { "S4",   "Sample 4s",    FeelClass::None,        RandomClass::Subtle,     true  },
    { "S8",   "Sample 8s",    FeelClass::None,        RandomClass::Subtle,     true  },
    { "BASS", "Bass Synth",   FeelClass::None,        RandomClass::Aggressive, false },
} };

constexpr const SoundBankInfo& bankInfo (SoundBank bank) noexcept
{
    return kSoundBankTable[static_cast<std::size_t> (bank)];
}

/// Whether a bank has a dedicated synthesis engine rather than sample playback (p. 60, 116).
/// Only BD on track 1 and SD on track 3 do; the same banks on other tracks play samples.
constexpr bool bankHasSynthEngine (SoundBank bank, int track) noexcept
{
    return (bank == SoundBank::BD && track == 0)
        || (bank == SoundBank::SD && track == 2);
}

//==============================================================================

/// One of the four pattern variations. Chaining them yields up to 64 steps.
enum class Variation : std::uint8_t { A = 0, B = 1, C = 2, D = 3 };

/// Per-step emphasis. The device offers a hard and a soft accent, each with its own globally
/// adjustable depth (p. 47-48).
enum class Accent : std::uint8_t { Normal = 0, Hard = 1, Soft = 2 };

/// FEEL: the drift profile, displayed as 08, 09 and MN (p. 54).
enum class FeelModel : std::uint8_t { M808 = 0, M909 = 1, Minimal = 2 };

inline constexpr int kNumFeelModels = 3;

/** Step time division — the device's "note length" (p. 35).

    Includes dotted and triplet values, which are not exactly representable in binary. The
    sequencer derives step times from a step count against an anchor rather than accumulating
    them, so these cannot drift over a long performance.
*/
enum class StepDivision : std::uint8_t
{
    Whole = 0,       // 1
    Half,            // 2
    Quarter,         // 4
    DottedQuarter,   // 4D
    TripletQuarter,  // 4T
    Eighth,          // 8
    DottedEighth,    // 8D
    TripletEighth,   // 8T
    Sixteenth,       // 16
    ThirtySecond     // 32
};

inline constexpr int kNumStepDivisions = 10;

/// MUTE.MD (p. 103). SOUND silences the track; SEQ silences only its sequenced notes, leaving it
/// playable from the keyboard or incoming MIDI.
enum class MuteMode
{
    Sound = 0,
    Sequencer
};

inline constexpr int kNumMuteModes = 2;

/// Length of one step in quarter notes.
constexpr double quarterNotesPerStep (StepDivision d) noexcept
{
    switch (d)
    {
        case StepDivision::Whole:          return 4.0;
        case StepDivision::Half:           return 2.0;
        case StepDivision::Quarter:        return 1.0;
        case StepDivision::DottedQuarter:  return 1.5;
        case StepDivision::TripletQuarter: return 2.0 / 3.0;
        case StepDivision::Eighth:         return 0.5;
        case StepDivision::DottedEighth:   return 0.75;
        case StepDivision::TripletEighth:  return 1.0 / 3.0;
        case StepDivision::Sixteenth:      return 0.25;
        case StepDivision::ThirtySecond:   return 0.125;
    }
    return 0.25;
}

//==============================================================================

/** Sub-step figures (p. 49).

    A step is divided into four or three equal parts, and the figure is a mask over those parts
    saying which of them sound. This is not a count of evenly spaced retriggers — several of the
    figures are syncopated, and two are triplets.
*/
enum class SubStepPattern : std::uint8_t
{
    Off = 0,          ///< A single hit at the start of the step
    Four_1111,        ///< 4 [][][][]  four 16ths
    Four_1100,        ///< 4 [][]__    two 16ths
    Four_1010,        ///< 4 []_[]_    two 8ths
    Four_0010,        ///< 4 __[]_     8th rest + 8th note
    Four_1001,        ///< 4 []__[]    8th + 16th rest + 16th
    Four_1011,        ///< 4 []_[][]   8th + two 16ths
    Four_0001,        ///< 4 ___[]     8th rest + 16th rest + 16th
    Four_0011,        ///< 4 __[][]    8th rest + two 16ths
    Three_111,        ///< 3 [][][]    16th triplets
    Three_110         ///< 3 [][]_     16th triplets, two of three
};

inline constexpr int kNumSubStepPatterns = 11;

struct SubStepInfo
{
    std::string_view display;  ///< As printed in the manual
    std::uint8_t divisions;    ///< 1, 3 or 4
    std::uint8_t mask;         ///< Bit i set means division i sounds; bit 0 is the first
};

inline constexpr std::array<SubStepInfo, kNumSubStepPatterns> kSubStepTable { {
    { "OFF",       1, 0b0001 },
    { "[][][][]",  4, 0b1111 },
    { "[][]__",    4, 0b0011 },
    { "[]_[]_",    4, 0b0101 },
    { "__[]_",     4, 0b0100 },
    { "[]__[]",    4, 0b1001 },
    { "[]_[][]",   4, 0b1101 },
    { "___[]",     4, 0b1000 },
    { "__[][]",    4, 0b1100 },
    { "[][][]",    3, 0b111  },
    { "[][]_",     3, 0b011  },
} };

constexpr const SubStepInfo& subStepInfo (SubStepPattern p) noexcept
{
    return kSubStepTable[static_cast<std::size_t> (p)];
}

//==============================================================================

/// Playback and time-stretch mode for the stereo loop track (p. 70).
enum class LoopMode : std::uint8_t
{
    LoopNoStretch = 0,  ///< O.OFF
    LoopMelodic,        ///< O.MLD — holds length when pitch changes
    LoopRhythmic,       ///< O.RHY — holds pitch when tempo changes
    OneShotNoStretch,   ///< >.OFF
    OneShotMelodic,     ///< >.MLD
    OneShotRhythmic     ///< >.RHY
};

inline constexpr int kNumLoopModes = 6;

constexpr bool loopModeLoops (LoopMode m) noexcept
{
    return m == LoopMode::LoopNoStretch || m == LoopMode::LoopMelodic
        || m == LoopMode::LoopRhythmic;
}

/// Snare snappy noise type (p. 65).
enum class SnappyType : std::uint8_t { N88 = 0, N99, NT1, NT2, NT3, NT4 };

inline constexpr int kNumSnappyTypes = 6;

/// Master effect type (p. 32).
enum class MasterFxType : std::uint8_t
{
    SweepFilter = 0,  ///< S.FLT
    Phaser,           ///< PHSR
    Distortion,       ///< DIST
    SnipLoop,         ///< SN.LP
    DuckingComp       ///< DUCK
};

inline constexpr int kNumMasterFxTypes = 5;

/// Send reverb type (p. 30).
enum class ReverbType : std::uint8_t { Room = 0, Hall, Plate };

/// Swing resolution (p. 51).
enum class SwingResolution : std::uint8_t
{
    Eighth = 0,    ///< 8TH — twice the current note length
    Sixteenth      ///< 16TH — the current note length
};

//==============================================================================

/// Panel LED colour, for the interface (p. 25).
struct Colour
{
    std::uint8_t r, g, b;
};

struct TrackDescriptor
{
    std::string_view shortName;
    std::string_view longName;
    TrackKind kind;
    SoundBank defaultBank;
    Colour colour;
};

/** The track layout: 6 drum, 4 sample, 1 bass (p. 16, 25).

    Tracks 7-9 work as either drum or mono sample tracks; track 10 is the dedicated stereo loop
    track. Marketing's "9-track drum machine" counts tracks 1-9.
*/
inline constexpr std::array<TrackDescriptor, kNumTracks> kTrackTable { {
    { "BD1",  "Bass Drum 1",  TrackKind::Drum,   SoundBank::BD,   { 255, 140,   0 } },
    { "BD2",  "Bass Drum 2",  TrackKind::Drum,   SoundBank::BD,   { 255, 190, 120 } },
    { "SD",   "Snare Drum",   TrackKind::Drum,   SoundBank::SD,   { 232, 208, 168 } },
    { "CP",   "Clap",         TrackKind::Drum,   SoundBank::CP,   { 242, 228, 200 } },
    { "CH",   "Closed Hat",   TrackKind::Drum,   SoundBank::HH_CY,{ 255, 190, 205 } },
    { "OH",   "Open Hat",     TrackKind::Drum,   SoundBank::HH_CY,{ 255, 105, 180 } },
    { "TT",   "Tom",          TrackKind::Sample, SoundBank::TT,   { 199,  21, 133 } },
    { "ST",   "Stick",        TrackKind::Sample, SoundBank::ST,   { 148,   0, 211 } },
    { "PC",   "Percussion",   TrackKind::Sample, SoundBank::PC,   { 110,  70, 220 } },
    { "LOOP", "Stereo Loop",  TrackKind::Sample, SoundBank::S8,   {  40,  90, 240 } },
    { "BASS", "Bass Synth",   TrackKind::Bass,   SoundBank::BASS, { 150, 190, 255 } },
} };

constexpr const TrackDescriptor& trackInfo (int track) noexcept
{
    return kTrackTable[static_cast<std::size_t> (track)];
}

/// Tracks 7-9 can hold user samples from the S2/S4 banks; track 10 uses S8.
constexpr bool trackIsSampleable (int track) noexcept
{
    return track >= 6 && track <= kLoopTrack;
}

/// Tracks 5 and 6 support choke, so the closed and open hats do not overlap (p. 66).
/// Tied notes are entered on the loop and bass tracks only (p. 39).
constexpr bool trackSupportsTies (int track) noexcept
{
    return track == kLoopTrack || track == kBassTrack;
}

constexpr bool trackSupportsChoke (int track) noexcept
{
    return track == 4 || track == 5;
}

/// Whether the TONE knob acts as the bipolar LPF/HPF on a bank (p. 62).
///
/// On BD it is a tone control inside the synthesis engine, on SD the snappy volume, and on the
/// bass track the sub-oscillator octave — so the track filter is bypassed on those three.
constexpr bool toneIsFilter (SoundBank bank) noexcept
{
    return bank != SoundBank::BD && bank != SoundBank::SD && bank != SoundBank::BASS;
}

/// Whether the MOVE knob acts as Nudge on a bank (p. 62).
///
/// Nudge delays the trigger, so unlike MOVE's other meanings it belongs to the sequencer rather
/// than the voice — which is why it needs asking about before scheduling.
constexpr bool moveIsNudge (SoundBank bank) noexcept
{
    switch (bank)
    {
        case SoundBank::SD:
        case SoundBank::HH_CY:
        case SoundBank::CP:
        case SoundBank::ST:
        case SoundBank::TT:
        case SoundBank::PC:
            return true;
        default:
            return false;
    }
}

//==============================================================================
// Display strings, defined in Types.cpp.

std::string_view toString (TrackKind) noexcept;
std::string_view toString (SoundBank) noexcept;
std::string_view toString (Variation) noexcept;
std::string_view toString (Accent) noexcept;
std::string_view toString (FeelModel) noexcept;
std::string_view toString (StepDivision) noexcept;
std::string_view toString (SubStepPattern) noexcept;
std::string_view toString (LoopMode) noexcept;
std::string_view toString (SnappyType) noexcept;
std::string_view toString (MasterFxType) noexcept;
std::string_view toString (ReverbType) noexcept;

} // namespace bud
