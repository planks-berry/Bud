#include "ParameterIds.h"

#include <algorithm>
#include <array>
#include <cassert>
#include <cmath>
#include <cstdio>

namespace bud
{

//==============================================================================
// Enum value labels.

namespace labels
{
    inline constexpr std::string_view feel[]       = { "08", "09", "MN" };
    inline constexpr std::string_view noteLength[] = { "1", "2", "4", "4D", "4T",
                                                       "8", "8D", "8T", "16", "32" };
    inline constexpr std::string_view swingRes[]   = { "8TH", "16TH" };
    inline constexpr std::string_view bank[]       = { "BD", "SD", "HH", "CP", "ST", "TT", "PC",
                                                       "SY", "FX", "S2", "S4", "S8", "BASS",
                                                       "WT" };
    inline constexpr std::string_view loopMode[]   = { "O.OFF", "O.MLD", "O.RHY",
                                                       ">.OFF", ">.MLD", ">.RHY" };
    inline constexpr std::string_view snappy[]     = { "N88", "N99", "NT1", "NT2", "NT3", "NT4" };
    inline constexpr std::string_view masterFx[]   = { "S.FLT", "PHSR", "DIST", "SN.LP", "DUCK" };
    inline constexpr std::string_view reverbType[] = { "ROOM", "HALL", "PLAT" };
    inline constexpr std::string_view onOff[]      = { "OFF", "ON" };
    inline constexpr std::string_view extSource[]  = { "LIN", "USB" };
    inline constexpr std::string_view sampleBank[] = { "S2", "S4", "S8" };
    inline constexpr std::string_view tempoSource[] = { "PTN", "GLOBAL" };
    inline constexpr std::string_view muteMode[]   = { "SOUND", "SEQ" };
    inline constexpr std::string_view knobMode[]   = { "SCALED", "LATCH", "JUMP" };
}

//==============================================================================

using S = ParamScope;
using U = ParamUnit;

namespace
{
    constexpr std::span<const std::string_view> noLabels {};

    template <std::size_t N>
    constexpr std::span<const std::string_view> lab (const std::string_view (&a)[N])
    {
        return std::span<const std::string_view> (a, N);
    }
}

// The parameter table. Values are in the hardware's raw domain; what a raw value *means* is
// params/Curves.h, and docs/PARAMETERS.md tabulates every mapping.
//
// The `plockable` column follows p. 44 exactly: accent, isolator, MFX, reverb, delay, swing and
// master are excluded.
//
// clang-format off
static const std::array<ParamDescriptor, kNumParamKinds> kParamTable { {
    //  kind                           id                name       scope      min   max  def  unit             plock  labels
    { ParamKind::Tempo,                "tempo",          "TEMPO",   S::Global,  20,  300, 128, U::Bpm,          false, noLabels },
    { ParamKind::Swing,                "swing",          "SWING",   S::Global,  50,   75,  50, U::SwingPercent, false, noLabels },
    { ParamKind::SwingResolution,      "swing_res",      "SW.RES",  S::Global,   0,    1,   1, U::Enum,         false, lab (labels::swingRes) },
    { ParamKind::Transpose,            "transpose",      "TRANS",   S::Global, -12,   12,   0, U::Semitones,    false, noLabels },
    { ParamKind::MasterVolume,         "master_vol",     "MASTER",  S::Global,   0,  127, 100, U::Raw,          false, noLabels },
    { ParamKind::PatternLevel,         "pattern_level",  "PTN.LVL", S::Global,   0,  127, 100, U::Raw,          false, noLabels },
    { ParamKind::Feel,                 "feel",           "FEEL",    S::Global,   0,    2,   2, U::Enum,         false, lab (labels::feel) },
    { ParamKind::AccentHardDepth,      "accent_hard",    "AC.H",    S::Global,   0,  127,  90, U::Raw,          false, noLabels },
    { ParamKind::AccentSoftDepth,      "accent_soft",    "AC.S",    S::Global,   0,  127,  64, U::Raw,          false, noLabels },

    { ParamKind::IsolatorLow,          "iso_low",        "LOW",     S::Global, -50,   50,   0, U::IsoBand,      false, noLabels },
    { ParamKind::IsolatorMid,          "iso_mid",        "MID",     S::Global, -50,   50,   0, U::IsoBand,      false, noLabels },
    { ParamKind::IsolatorHigh,         "iso_high",       "HI",      S::Global, -50,   50,   0, U::IsoBand,      false, noLabels },
    { ParamKind::IsolatorOnLoop,       "iso_on_loop",    "ISO+LP",  S::Global,   0,    1,   0, U::Bool,         false, lab (labels::onOff) },

    { ParamKind::MasterFxEnabled,      "mfx_on",         "MFX",     S::Global,   0,    1,   0, U::Bool,         false, lab (labels::onOff) },
    { ParamKind::MasterFxType,         "mfx_type",       "FX",      S::Global,   0,    4,   0, U::Enum,         false, lab (labels::masterFx) },
    { ParamKind::MasterFxAmount,       "mfx_amount",     "AMOUNT",  S::Global,   0,  127,  64, U::Raw,          false, noLabels },

    { ParamKind::ReverbType,           "rev_type",       "RV",      S::Global,   0,    2,   0, U::Enum,         false, lab (labels::reverbType) },
    { ParamKind::ReverbMix,            "rev_mix",        "REVERB",  S::Global,   0,  127,   0, U::Raw,          false, noLabels },
    { ParamKind::DelayMix,             "dly_mix",        "DELAY",   S::Global,   0,  127,   0, U::Raw,          false, noLabels },
    { ParamKind::DelayTime,            "dly_time",       "TIME",    S::Global,   0,  127,  64, U::Raw,          false, noLabels },
    { ParamKind::DelayFeedback,        "dly_feedback",   "F.BACK",  S::Global,   0,  127,  50, U::Raw,          false, noLabels },
    { ParamKind::DelayToReverb,        "dly_to_rev",     "D>R",     S::Global,   0,  127,   0, U::Raw,          false, noLabels },
    { ParamKind::DelayPingPong,        "dly_pingpong",   "D.PP",    S::Global,   0,    1,   0, U::Bool,         false, lab (labels::onOff) },
    { ParamKind::DelaySync,            "dly_sync",       "D.SY",    S::Global,   0,    1,   1, U::Bool,         false, lab (labels::onOff) },

    { ParamKind::ExtInLineGain,        "ext_line_gain",  "LIN.",    S::Global,   0,  127,   0, U::Raw,          false, noLabels },
    { ParamKind::ExtInLineReverbSend,  "ext_line_rvb",   "L.RV",    S::Global,   0,  127,   0, U::Raw,          false, noLabels },
    { ParamKind::ExtInLineDelaySend,   "ext_line_dly",   "L.DL",    S::Global,   0,  127,   0, U::Raw,          false, noLabels },
    { ParamKind::ExtInUsbGain,         "ext_usb_gain",   "USB.",    S::Global,   0,  127,   0, U::Raw,          false, noLabels },
    { ParamKind::ExtInUsbReverbSend,   "ext_usb_rvb",    "U.RV",    S::Global,   0,  127,   0, U::Raw,          false, noLabels },
    { ParamKind::ExtInUsbDelaySend,    "ext_usb_dly",    "U.DL",    S::Global,   0,  127,   0, U::Raw,          false, noLabels },

    { ParamKind::TempoSource,          "tempo_source",   "TEMPO",   S::Global,   0,    1,   1, U::Enum,         false, lab (labels::tempoSource) },

    { ParamKind::MuteMode,             "mute_mode",      "MUTE.MD", S::Global,   0,    1,   0, U::Enum,         false, lab (labels::muteMode) },
    { ParamKind::AutoStep,             "auto_step",      "AT.STEP", S::Global,   0,    1,   0, U::Bool,         false, lab (labels::onOff) },
    { ParamKind::BassTie,              "bass_tie",       "BS.TIE",  S::Global,   0,    1,   0, U::Bool,         false, lab (labels::onOff) },
    { ParamKind::KnobMode,             "knob_mode",      "KNOB.MD", S::Global,   0,    2,   0, U::Enum,         false, lab (labels::knobMode) },
    { ParamKind::MasterTune,           "master_tune",    "M.TUNE",  S::Global, -75,   75,   0, U::Semitones,    false, noLabels },

    { ParamKind::SamplerInputGain,     "smp_in_gain",    "IN.GAIN", S::Global,   0,  127, 100, U::Raw,          false, noLabels },
    { ParamKind::SamplerAutoRecord,    "smp_auto_rec",   "AT.REC",  S::Global,   0,  127,  40, U::Raw,          false, noLabels },
    { ParamKind::SamplerSource,        "smp_source",     "SMP.SRC", S::Global,   0,    1,   0, U::Enum,         false, lab (labels::extSource) },
    { ParamKind::SamplerBank,          "smp_bank",       "SMP.BNK", S::Global,   0,    2,   0, U::Enum,         false, lab (labels::sampleBank) },

    { ParamKind::TrackSoundBank,       "bank",           "BANK",    S::Track,    0,   13,   0, U::Enum,         false, lab (labels::bank) },
    { ParamKind::TrackSound,           "sound",          "SOUND",   S::Track,    0,  127,   0, U::Raw,          true,  noLabels },
    { ParamKind::TrackTune,            "tune",           "TUNE",    S::Track,    0,  127,  64, U::Bipolar,      true,  noLabels },
    { ParamKind::TrackTone,            "tone",           "TONE",    S::Track,    0,  127,  64, U::Tone,         true,  noLabels },
    { ParamKind::TrackMove,            "move",           "MOVE",    S::Track,    0,  127,  64, U::Bipolar,      true,  noLabels },
    { ParamKind::TrackAttack,          "attack",         "ATTACK",  S::Track,    0,  127,   0, U::Raw,          true,  noLabels },
    { ParamKind::TrackDecay,           "decay",          "DECAY",   S::Track,    0,  127,  90, U::Raw,          true,  noLabels },
    { ParamKind::TrackReverbSend,      "rvb_send",       "→RVB",    S::Track,    0,  127,   0, U::Raw,          true,  noLabels },
    { ParamKind::TrackDelaySend,       "dly_send",       "→DLY",    S::Track,    0,  127,   0, U::Raw,          true,  noLabels },
    { ParamKind::TrackPan,             "pan",            "PAN",     S::Track,    0,  127,  64, U::Pan,          true,  noLabels },
    { ParamKind::TrackLevel,           "level",          "LEVEL",   S::Track,    0,  127, 100, U::Raw,          true,  noLabels },
    { ParamKind::TrackRandomVelocity,  "rnd_vel",        "RND VL",  S::Track,    0,  127,   0, U::Raw,          true,  noLabels },

    { ParamKind::TrackNoteLength,      "note_length",    "NOTE",    S::Track,    0,    9,   8, U::Enum,         false, lab (labels::noteLength) },
    { ParamKind::TrackStepLength,      "step_length",    "LEN",     S::Track,    1,   16,  16, U::Steps,        false, noLabels },
    // 49 displays as PTN and means "follow the pattern swing"; 50-75 overrides it (p. 51).
    { ParamKind::TrackSwing,           "track_swing",    "SWING",   S::Track,   49,   75,  49, U::SwingPercent, false, noLabels },
    { ParamKind::TrackMute,            "mute",           "MUTE",    S::Track,    0,    1,   0, U::Bool,         false, lab (labels::onOff) },
    { ParamKind::TrackChoke,           "choke",          "CHK",     S::Track,    0,    1,   0, U::Bool,         false, lab (labels::onOff) },
    { ParamKind::TrackRepitch,         "repitch",        "RPT",     S::Track,    0,    1,   0, U::Bool,         false, lab (labels::onOff) },
    { ParamKind::TrackLoopMode,        "loop_mode",      "LP",      S::Track,    0,    5,   0, U::Enum,         false, lab (labels::loopMode) },
    { ParamKind::TrackSnappyType,      "snappy_type",    "SNAPPY",  S::Track,    0,    5,   0, U::Enum,         false, lab (labels::snappy) },

    { ParamKind::BassCutoff,           "bass_cutoff",    "CUTOFF",  S::Track,    0,  127,  60, U::Raw,          true,  noLabels },
    { ParamKind::BassResonance,        "bass_reso",      "RESO",    S::Track,    0,  127,  80, U::Raw,          true,  noLabels },
    { ParamKind::BassEnvDepth,         "bass_env",       "ENV",     S::Track,    0,  127,  70, U::Raw,          true,  noLabels },
    { ParamKind::BassEnvDecay,         "bass_env_dec",   "DECAY",   S::Track,    0,  127,  60, U::Raw,          true,  noLabels },
    { ParamKind::BassAccent,           "bass_accent",    "ACCENT",  S::Track,    0,  127,  64, U::Raw,          true,  noLabels },
    { ParamKind::BassDrive,            "bass_drive",     "DRIVE",   S::Track,    0,  127,   0, U::Raw,          true,  noLabels },
    { ParamKind::BassDriveEnabled,     "bass_drive_on",  "BS.DRV",  S::Track,    0,    1,   0, U::Bool,         false, lab (labels::onOff) },
    { ParamKind::BassLevel,            "bass_level",     "LEVEL",   S::Track,    0,  127, 100, U::Raw,          true,  noLabels },
    { ParamKind::BassGlideCurve,       "bass_glide_crv", "GL.C",    S::Track,    0,  127,  64, U::Raw,          true,  noLabels },
} };
// clang-format on

//==============================================================================

std::span<const ParamDescriptor> paramTable() noexcept
{
    return { kParamTable.data(), kParamTable.size() };
}

const ParamDescriptor& paramInfo (ParamKind kind) noexcept
{
    const auto index = static_cast<std::size_t> (kind);
    assert (index < kParamTable.size());
    assert (kParamTable[index].kind == kind && "table row order must match ParamKind");
    return kParamTable[index];
}

std::string paramIdString (ParamId id) noexcept
{
    const auto& info = paramInfo (kindOf (id));
    const auto track = trackOf (id);

    if (track < 0)
        return std::string (info.id);

    char prefix[8] {};
    std::snprintf (prefix, sizeof (prefix), "t%02d.", track + 1);
    return std::string (prefix) + std::string (info.id);
}

//==============================================================================

int clampToRange (ParamKind kind, int value) noexcept
{
    const auto& info = paramInfo (kind);
    return std::clamp (value, info.minValue, info.maxValue);
}

float normalise (ParamKind kind, int value) noexcept
{
    const auto& info = paramInfo (kind);
    const auto span = info.maxValue - info.minValue;

    if (span <= 0)
        return 0.0f;

    return static_cast<float> (clampToRange (kind, value) - info.minValue)
         / static_cast<float> (span);
}

int denormalise (ParamKind kind, float normalised) noexcept
{
    const auto& info = paramInfo (kind);
    const auto n = std::clamp (normalised, 0.0f, 1.0f);
    const auto span = static_cast<float> (info.maxValue - info.minValue);

    return clampToRange (kind, info.minValue + static_cast<int> (std::lround (n * span)));
}

std::string formatValue (ParamKind kind, int value) noexcept
{
    const auto& info = paramInfo (kind);
    const auto v = clampToRange (kind, value);
    char buffer[32] {};

    switch (info.unit)
    {
        case ParamUnit::Enum:
        case ParamUnit::Bool:
        {
            const auto index = static_cast<std::size_t> (std::max (0, v));
            if (index < info.labels.size())
                return std::string (info.labels[index]);
            std::snprintf (buffer, sizeof (buffer), "%d", v);
            break;
        }

        case ParamUnit::Pan:
            if (v == kRawCentre)
                return "C";
            if (v < kRawCentre)
                std::snprintf (buffer, sizeof (buffer), "L%d", kRawCentre - v);
            else
                std::snprintf (buffer, sizeof (buffer), "R%d", v - kRawCentre);
            break;

        case ParamUnit::Tone:
            // LPF50 - FLT OFF - HPF50 (p. 65)
            if (v == kRawCentre)
                return "FLT OFF";
            if (v < kRawCentre)
                std::snprintf (buffer, sizeof (buffer), "LPF%d",
                               (kRawCentre - v) * 50 / kRawCentre);
            else
                std::snprintf (buffer, sizeof (buffer), "HPF%d",
                               (v - kRawCentre) * 50 / (kRawMax - kRawCentre));
            break;

        case ParamUnit::Bipolar:
            std::snprintf (buffer, sizeof (buffer), "%+d", v - kRawCentre);
            break;

        case ParamUnit::IsoBand:
        case ParamUnit::Semitones:
            std::snprintf (buffer, sizeof (buffer), "%+d", v);
            break;

        case ParamUnit::SwingPercent:
            // The track swing control shows PTN below 50 (p. 51).
            if (kind == ParamKind::TrackSwing && v < 50)
                return "PTN";
            std::snprintf (buffer, sizeof (buffer), "%d%%", v);
            break;

        case ParamUnit::Bpm:
            std::snprintf (buffer, sizeof (buffer), "%d", v);
            break;

        case ParamUnit::Steps:
        case ParamUnit::Raw:
        default:
            std::snprintf (buffer, sizeof (buffer), "%d", v);
            break;
    }

    return buffer;
}

//==============================================================================

namespace
{
    /// The eleven micro knobs, in the order of the parts list (p. 10).
    constexpr ParamKind kTrackKnobs[] = {
        ParamKind::TrackSound,
        ParamKind::TrackTune,
        ParamKind::TrackTone,
        ParamKind::TrackMove,
        ParamKind::TrackAttack,
        ParamKind::TrackDecay,
        ParamKind::TrackPan,
        ParamKind::TrackReverbSend,
        ParamKind::TrackDelaySend,
        ParamKind::TrackLevel,
        ParamKind::TrackRandomVelocity,
    };

    constexpr ParamKind kTrackSequencer[] = {
        ParamKind::TrackNoteLength,
        ParamKind::TrackStepLength,
        ParamKind::TrackSwing,
        ParamKind::TrackMute,
    };

    constexpr ParamKind kBass[] = {
        ParamKind::BassCutoff,
        ParamKind::BassResonance,
        ParamKind::BassEnvDepth,
        ParamKind::BassEnvDecay,
        ParamKind::BassAccent,
        ParamKind::BassDrive,
        ParamKind::BassDriveEnabled,
        ParamKind::BassLevel,
        ParamKind::BassGlideCurve,
    };
}

std::span<const ParamKind> trackKnobParams() noexcept
{
    return { kTrackKnobs, std::size (kTrackKnobs) };
}

std::span<const ParamKind> trackSequencerParams() noexcept
{
    return { kTrackSequencer, std::size (kTrackSequencer) };
}

std::span<const ParamKind> bassParams() noexcept
{
    return { kBass, std::size (kBass) };
}

std::vector<ParamId> trackParamIds (int track)
{
    std::vector<ParamId> ids;
    ids.reserve (32);

    ids.push_back (makeParamId (ParamKind::TrackSoundBank, track));

    for (auto kind : trackKnobParams())
        ids.push_back (makeParamId (kind, track));

    for (auto kind : trackSequencerParams())
        ids.push_back (makeParamId (kind, track));

    // Conditional parameters exist only where the hardware offers them.
    if (trackSupportsChoke (track))
        ids.push_back (makeParamId (ParamKind::TrackChoke, track));

    if (track >= 6 && track <= 8)
        ids.push_back (makeParamId (ParamKind::TrackRepitch, track));

    if (track == kLoopTrack)
        ids.push_back (makeParamId (ParamKind::TrackLoopMode, track));

    if (track == 2)
        ids.push_back (makeParamId (ParamKind::TrackSnappyType, track));

    if (track == kBassTrack)
        for (auto kind : bassParams())
            ids.push_back (makeParamId (kind, track));

    return ids;
}

std::string_view knobNameForBank (ParamKind kind, SoundBank bank) noexcept
{
    // The knob-meaning matrix from p. 62. Only the labels that differ from the panel silkscreen
    // are listed; everything else falls through to the descriptor name.
    switch (kind)
    {
        case ParamKind::TrackTone:
            switch (bank)
            {
                case SoundBank::BD:   return "TONE";
                case SoundBank::SD:   return "SNAPPY";
                case SoundBank::BASS: return "SUBOCT";
                default:              return "LPF/HPF";
            }

        case ParamKind::TrackMove:
            switch (bank)
            {
                case SoundBank::BD:    return "MODTIME";
                case SoundBank::SY_BS:
                case SoundBank::FX:    return "D.CURVE";
                case SoundBank::S2:
                case SoundBank::S4:    return "SLOPE";
                case SoundBank::S8:    return "XFADE";
                case SoundBank::BASS:  return "D.CURVE";
                default:               return "NUDGE";
            }

        case ParamKind::TrackAttack:
            switch (bank)
            {
                case SoundBank::SD:   return "OVERTON";
                case SoundBank::S2:
                case SoundBank::S4:
                case SoundBank::S8:   return "START";
                case SoundBank::BASS: return "GLIDE";
                default:              return "ATTACK";
            }

        case ParamKind::TrackDecay:
            switch (bank)
            {
                case SoundBank::S2:
                case SoundBank::S4:
                case SoundBank::S8:   return "LENGTH";
                case SoundBank::BASS: return "GATE";
                default:              return "DECAY";
            }

        case ParamKind::TrackLevel:
            return bank == SoundBank::BASS ? "SUB LVL" : "LEVEL";

        case ParamKind::TrackSound:
            return bank == SoundBank::BASS ? "OSC" : "SOUND";

        default:
            break;
    }

    return paramInfo (kind).name;
}

} // namespace bud
