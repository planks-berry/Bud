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

    This enum, together with @ref paramTable, is the single source of truth for parameters. The
    APVTS layout, the parameter-lock target list, the MIDI CC map, display formatting and the
    micro-knob assignments are all derived from it. Adding a parameter means adding one enum
    entry and one table row — never editing five parallel lists.

    Values are stored in the hardware's own domain: an integer 0-127 for nearly everything, with
    a few bipolar and enumerated exceptions. Mapping raw values to real quantities is the job of
    params/Curves.h.

    The string id in each descriptor is what appears in saved state, so entries may be reordered
    but ids must never change once a project has been written with them.
*/
enum class ParamKind : std::uint16_t
{
    // ---- Global -------------------------------------------------------------
    Tempo = 0,
    Swing,               ///< 50-75 %
    SwingResolution,     ///< 8TH / 16TH
    Transpose,           ///< -12 to +12 semitones
    MasterVolume,
    PatternLevel,
    Feel,                ///< 08 / 09 / MN
    AccentHardDepth,     ///< AC.h
    AccentSoftDepth,     ///< AC.s

    // ---- Isolator, on the drum bus -----------------------------------------
    IsolatorLow,         ///< -50 to +50
    IsolatorMid,
    IsolatorHigh,
    IsolatorOnLoop,      ///< ISO+LP

    // ---- Master effect ------------------------------------------------------
    MasterFxEnabled,     ///< Not saved with the pattern
    MasterFxType,
    MasterFxAmount,      ///< The single performance macro

    // ---- Send effects -------------------------------------------------------
    ReverbType,
    ReverbMix,
    DelayMix,
    DelayTime,
    DelayFeedback,
    DelayToReverb,       ///< D>R
    DelayPingPong,       ///< D.PP
    DelaySync,           ///< D.SY

    // ---- External input -----------------------------------------------------
    // LINE and USB are separate inputs with their own gain and sends, not one input with a
    // source switch (p. 85): func + ext-in walks LIN., USB., L.RV, U.RV and the delay pair.
    ExtInLineGain,
    ExtInLineReverbSend,
    ExtInLineDelaySend,
    ExtInUsbGain,
    ExtInUsbReverbSend,
    ExtInUsbDelaySend,

    // ---- System (func + system, p. 113) -------------------------------------
    TempoSource,         ///< PTN: the tempo belongs to the pattern; GLOBAL: to the instrument
    MuteMode,            ///< SOUND mutes the voice; SEQ mutes only sequenced notes (p. 103)
    AutoStep,            ///< AT.STEP: step recording advances on each key press (p. 38)
    BassTie,             ///< BS.TIE: tie-note input during real-time bass recording (p. 113)
    KnobMode,            ///< SCALED / LATCH / JUMP (p. 103)
    MasterTune,          ///< -75 to +75 cents (p. 105)

    // ---- Sampler ------------------------------------------------------------
    SamplerInputGain,    ///< The TEMPO knob while sampling (p. 81, 83)
    SamplerAutoRecord,   ///< OFF, or a -60 to -20 dB trigger level (p. 83)
    SamplerSource,       ///< LINE or USB (p. 81)
    SamplerBank,         ///< S2 / S4 / S8, the A/B/C keys (p. 81)

    // ---- Per track, the eleven micro knobs ----------------------------------
    TrackSoundBank,
    TrackSound,          ///< Index within the bank
    TrackTune,
    TrackTone,           ///< Meaning depends on the bank
    TrackMove,           ///< Meaning depends on the bank
    TrackAttack,         ///< Meaning depends on the bank
    TrackDecay,          ///< Meaning depends on the bank
    TrackReverbSend,
    TrackDelaySend,
    TrackPan,
    TrackLevel,
    TrackRandomVelocity,

    // ---- Per track, sequencer settings --------------------------------------
    TrackNoteLength,
    TrackStepLength,     ///< 1-16
    TrackSwing,          ///< 49 means "follow the pattern"; 50-75 overrides it
    TrackMute,
    TrackChoke,          ///< Tracks 5-6 only
    TrackRepitch,        ///< Tracks 7-9 only
    TrackLoopMode,       ///< Track 10 only
    TrackSnappyType,     ///< SD bank only

    // ---- Bass synth, its own knob section -----------------------------------
    BassCutoff,
    BassResonance,
    BassEnvDepth,
    BassEnvDecay,
    BassAccent,
    BassDrive,
    BassDriveEnabled,    ///< BS DRV; DRIVE does nothing while this is off
    BassLevel,
    BassGlideCurve,

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
    Raw,         ///< 0-127, shown as a number
    Bipolar,     ///< 0-127 with a detent at 64, shown as -63 to +63
    Pan,         ///< 0-127 with a detent at 64, shown as L63 / C / R63
    Tone,        ///< 0-127 with a detent at 64, shown as LPF50 / FLT OFF / HPF50
    IsoBand,     ///< -50 to +50
    Semitones,
    SwingPercent,
    Bpm,
    Steps,
    Enum,
    Bool
};

struct ParamDescriptor
{
    ParamKind kind;
    std::string_view id;       ///< Stable string id, used in serialised state. Never change.
    std::string_view name;     ///< Display name, sized for the character display
    ParamScope scope;
    int minValue;
    int maxValue;
    int defaultValue;
    ParamUnit unit;
    bool plockable;            ///< May be recorded as a per-step parameter lock (p. 44)
    std::span<const std::string_view> labels;  ///< Enum value labels, empty otherwise
};

/// The parameter table. Indexed by ParamKind; `paramTable()[i].kind == ParamKind(i)` holds.
std::span<const ParamDescriptor> paramTable() noexcept;

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

/// The string id used in serialised state, e.g. "t03.decay" or "tempo".
std::string paramIdString (ParamId) noexcept;

//==============================================================================
// Value helpers. Raw values are integers; only tempo is continuous.

int clampToRange (ParamKind, int value) noexcept;

/// Map a raw value to 0..1 for a host parameter.
float normalise (ParamKind, int value) noexcept;

/// Map 0..1 back to a raw value.
int denormalise (ParamKind, float normalised) noexcept;

/// Format for the character display, e.g. "64", "L21", "LPF32", "1/16", "PLAT".
std::string formatValue (ParamKind, int value) noexcept;

//==============================================================================
// Which parameters apply where.

/// The eleven micro knobs, in panel order.
std::span<const ParamKind> trackKnobParams() noexcept;

/// Per-track sequencer settings.
std::span<const ParamKind> trackSequencerParams() noexcept;

/// The bass synth's own knob section.
std::span<const ParamKind> bassParams() noexcept;

/// Every parameter instance that exists for a given track, including the bass section on
/// track 11 and only those conditional parameters the track actually supports.
std::vector<ParamId> trackParamIds (int track);

/// Display name for a knob on a given bank — TONE on a BD track is "TONE", on a bass track
/// "SUBOCT" (p. 62). Falls back to the descriptor's name.
std::string_view knobNameForBank (ParamKind, SoundBank) noexcept;

} // namespace bud
