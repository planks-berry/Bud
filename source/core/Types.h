#pragma once

#include <array>
#include <cstdint>
#include <string_view>

namespace bud
{

//==============================================================================
// Fixed dimensions of the instrument. See docs/DEVICE_SPEC.md.

inline constexpr int kNumTracks         = 11;
inline constexpr int kNumVariations     = 4;   // A, B, C, D
inline constexpr int kStepsPerVariation = 16;
inline constexpr int kMaxChainedSteps   = kNumVariations * kStepsPerVariation;  // 64
inline constexpr int kNumPatterns       = 128;
inline constexpr int kNumDrumKits       = 16;

/// Retriggers within a single step. Provisional — confirm the ceiling against the manual.
inline constexpr int kMaxSubSteps = 4;

//==============================================================================

enum class VoiceKind : std::uint8_t
{
    KickSynth,   ///< Dedicated bass drum synthesis (track 1)
    SnareSynth,  ///< Dedicated snare synthesis (track 3)
    HiHat,       ///< Metallic hi-hat model with analog tonal variation
    Sample,      ///< One-shot sample playback, S2/S4 banks
    Loop,        ///< Stereo loop playback with time-stretch, S8 bank
    BassSynth    ///< Monophonic analog-modelling bass (track 11)
};

/// One of the four pattern variations. Chaining them yields up to 64 steps.
enum class Variation : std::uint8_t { A = 0, B = 1, C = 2, D = 3 };

/// Per-step emphasis. The device offers both accent and de-accent.
enum class Accent : std::uint8_t { DeAccent = 0, Normal = 1, Accent = 2 };

/// FEEL: the per-voice micro-timing and pitch drift profile.
enum class FeelModel : std::uint8_t { M808 = 0, M909 = 1, Minimal = 2 };

inline constexpr int kNumFeelModels = 3;

/// Step time division ("note length", 1/1 to 1/32). Set per track, which is what lets
/// tracks run polymetrically against one another.
enum class StepDivision : std::uint8_t
{
    Whole = 0,      // 1/1
    Half,           // 1/2
    Quarter,        // 1/4
    Eighth,         // 1/8
    Sixteenth,      // 1/16
    ThirtySecond    // 1/32
};

inline constexpr int kNumStepDivisions = 6;

/// Length of one step expressed in quarter notes.
constexpr double quarterNotesPerStep (StepDivision d) noexcept
{
    switch (d)
    {
        case StepDivision::Whole:        return 4.0;
        case StepDivision::Half:         return 2.0;
        case StepDivision::Quarter:      return 1.0;
        case StepDivision::Eighth:       return 0.5;
        case StepDivision::Sixteenth:    return 0.25;
        case StepDivision::ThirtySecond: return 0.125;
    }
    return 0.25;
}

//==============================================================================

struct TrackDescriptor
{
    std::string_view shortName;   ///< As printed on the panel
    std::string_view longName;
    VoiceKind voice;
    bool userSampleable;          ///< Can hold a user sample recorded on the device
};

/// The track layout. Tracks 2 and 4-6 are a working default: public sources confirm only
/// that tracks 1-9 are drums with dedicated synthesis on BD1 and SD, that 7-9 are
/// sampleable, that 10 is the loop track and 11 the bass synth. Correct against the manual.
inline constexpr std::array<TrackDescriptor, kNumTracks> kTrackTable { {
    { "BD1",  "Bass Drum 1",  VoiceKind::KickSynth,  false },
    { "BD2",  "Bass Drum 2",  VoiceKind::Sample,     false },
    { "SD",   "Snare Drum",   VoiceKind::SnareSynth, false },
    { "RS",   "Rim / Clap",   VoiceKind::Sample,     false },
    { "CH",   "Closed Hat",   VoiceKind::HiHat,      false },
    { "OH",   "Open Hat",     VoiceKind::HiHat,      false },
    { "PC1",  "Percussion 1", VoiceKind::Sample,     true  },
    { "PC2",  "Percussion 2", VoiceKind::Sample,     true  },
    { "PC3",  "Percussion 3", VoiceKind::Sample,     true  },
    { "LOOP", "Loop",         VoiceKind::Loop,       true  },
    { "BASS", "Bass Synth",   VoiceKind::BassSynth,  false },
} };

constexpr const TrackDescriptor& trackInfo (int track) noexcept
{
    return kTrackTable[static_cast<std::size_t> (track)];
}

/// Index of the dedicated loop track.
inline constexpr int kLoopTrack = 9;
/// Index of the bass synth track.
inline constexpr int kBassTrack = 10;

//==============================================================================
// Display strings, defined in Types.cpp.

std::string_view toString (VoiceKind) noexcept;
std::string_view toString (Variation) noexcept;
std::string_view toString (Accent) noexcept;
std::string_view toString (FeelModel) noexcept;
std::string_view toString (StepDivision) noexcept;

} // namespace bud
