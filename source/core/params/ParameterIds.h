#pragma once

#include "../Types.h"

#include <cstdint>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace bud
{

//==============================================================================
/** Every distinct parameter in the instrument.

    This enum, together with @ref kParamTable, is the single source of truth for parameters.
    The APVTS layout, the parameter-lock target list, the MIDI CC map, display formatting and
    the micro-knob assignments are all derived from it. Adding a parameter means adding one
    enum entry and one table row — never editing five parallel lists.

    Order is significant only in that it defines the table; ids are stabilised by the string
    id in the descriptor, so entries may be reordered but string ids must never change once
    a project file has been saved with them.
*/
enum class ParamKind : std::uint16_t
{
    // ---- Global -------------------------------------------------------------
    Tempo = 0,
    GlobalSwing,
    MasterVolume,
    Feel,
    FeelDepth,

    // ---- Per track, common --------------------------------------------------
    TrackLevel,          ///< Control knob D
    TrackEqFreq,         ///< Control knob A
    TrackEqRes,          ///< Control knob B
    TrackReverbSend,     ///< Control knob C (reverb bus)
    TrackDelaySend,      ///< Control knob C (delay bus)
    TrackMute,
    TrackStepLength,     ///< 1-16
    TrackNoteLength,     ///< StepDivision, 1/1 to 1/32
    TrackRotation,       ///< Phrase rotation, in steps
    TrackSwing,          ///< Per-track swing
    TrackRandomVelocity, ///< Per-track random velocity amount

    // ---- Kick synthesis (track 1) -------------------------------------------
    KickTune,
    KickDecay,
    KickPunch,
    KickSweepDepth,
    KickSweepTime,
    KickDrive,

    // ---- Snare synthesis (track 3) ------------------------------------------
    SnareTune,
    SnareDecay,
    SnareSnap,           ///< Tone/noise balance
    SnareNoiseDecay,
    SnareDrive,

    // ---- Hi-hat model -------------------------------------------------------
    HatTune,
    HatDecay,
    HatTone,
    HatCharacter,        ///< Analog tonal variation

    // ---- Sample voice (tracks 2, 4, 7-9) ------------------------------------
    SampleBank,          ///< S2 or S4
    SampleSlot,
    SampleTune,
    SampleStart,
    SampleDecay,
    SampleRepitchToTempo,

    // ---- Loop voice (track 10) ----------------------------------------------
    LoopSlot,
    LoopPitch,
    LoopPlayMode,        ///< Loop or one-shot
    LoopCrossfade,
    LoopStretch,         ///< Time-stretch to tempo
    LoopStart,
    LoopLength,

    // ---- Bass synth (track 11) ----------------------------------------------
    BassWave,
    BassWaveBlend,       ///< S01 mode: continuous SAW <-> SQUARE blend
    BassSubRange,        ///< -2, -1, UNISON
    BassSubLevel,
    BassSubBypass,       ///< Sub bypasses filter and sends
    BassTune,
    BassCutoff,
    BassResonance,
    BassEnvMod,
    BassDecay,
    BassDecayCurve,
    BassAccentAmount,    ///< Filter-linked accent
    BassGlideTime,
    BassGlideCurve,
    BassGateTime,
    BassOverdrive,

    // ---- Master effect ------------------------------------------------------
    MasterFxType,        ///< Sweep filter, phaser, distortion, snip loop, ducking comp
    MasterFxAmount,      ///< The single performance macro

    // ---- Send effects -------------------------------------------------------
    ReverbType,          ///< Room, Hall, Plate
    ReverbTime,
    ReverbLevel,
    DelayTime,
    DelayFeedback,
    DelayLevel,
    DelayPingPong,

    Count
};

inline constexpr int kNumParamKinds = static_cast<int> (ParamKind::Count);

//==============================================================================

enum class ParamScope : std::uint8_t
{
    Global,   ///< One instance for the instrument
    Track     ///< One instance per track
};

enum class ParamUnit : std::uint8_t
{
    None, Percent, Hertz, Decibels, Milliseconds, Semitones, Steps, Bpm, Enum, Bool
};

enum class ParamCurve : std::uint8_t
{
    Linear,       ///< Uniform
    Exponential,  ///< Skewed towards the low end; for times and frequencies
    Stepped       ///< Discrete integer values
};

struct ParamDescriptor
{
    ParamKind kind;
    std::string_view id;       ///< Stable string id, used in serialised state. Never change.
    std::string_view name;     ///< Display name, sized for the character display
    ParamScope scope;
    float minValue;
    float maxValue;
    float defaultValue;
    ParamCurve curve;
    ParamUnit unit;
    bool plockable;            ///< May be recorded as a per-step parameter lock
    std::span<const std::string_view> labels;  ///< Enum value labels, empty otherwise
};

/// The parameter table. Indexed by ParamKind; `kParamTable[i].kind == ParamKind(i)` holds.
std::span<const ParamDescriptor> paramTable() noexcept;

/// Descriptor lookup.
const ParamDescriptor& paramInfo (ParamKind) noexcept;

//==============================================================================
// Parameter identity.
//
// A ParamId packs a kind with the track it belongs to, so one integer names any parameter
// instance in the instrument. Global parameters use track -1.

using ParamId = std::uint16_t;

inline constexpr int kTrackBits = 4;
inline constexpr int kTrackMask = (1 << kTrackBits) - 1;

/// Pack a kind and track into a stable id. Pass track = -1 for global parameters.
constexpr ParamId makeParamId (ParamKind kind, int track = -1) noexcept
{
    return static_cast<ParamId> ((static_cast<int> (kind) << kTrackBits)
                                 | ((track + 1) & kTrackMask));
}

constexpr ParamKind kindOf (ParamId id) noexcept
{
    return static_cast<ParamKind> (id >> kTrackBits);
}

/// Track index, or -1 for a global parameter.
constexpr int trackOf (ParamId id) noexcept
{
    return static_cast<int> (id & kTrackMask) - 1;
}

/// The string id used in serialised state, e.g. "t03.kick_decay" or "tempo".
std::string paramIdString (ParamId) noexcept;

//==============================================================================
// Value helpers.

/// Clamp to the descriptor's range, snapping to integers for stepped parameters.
float clampToRange (ParamKind, float value) noexcept;

/// Map a real value to 0..1 using the descriptor's curve.
float normalise (ParamKind, float value) noexcept;

/// Map 0..1 back to a real value using the descriptor's curve.
float denormalise (ParamKind, float normalised) noexcept;

/// Format for the character display, e.g. "  62%", "1/16", "PLATE".
std::string formatValue (ParamKind, float value) noexcept;

//==============================================================================
// Which parameters a voice exposes. Drives micro-knob assignment and the edit pages.

/// The parameters common to every track (level, EQ, sends, sequencer settings).
std::span<const ParamKind> commonTrackParams() noexcept;

/// The parameters specific to a voice engine, in panel order.
std::span<const ParamKind> voiceParams (VoiceKind) noexcept;

/// Every parameter instance that exists for a given track, common then voice-specific.
std::vector<ParamId> trackParamIds (int track);

} // namespace bud
