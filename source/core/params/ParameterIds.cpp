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
    inline constexpr std::string_view feel[]        = { "808", "909", "MINIMAL" };
    inline constexpr std::string_view noteLength[]  = { "1/1", "1/2", "1/4", "1/8", "1/16", "1/32" };
    inline constexpr std::string_view sampleBank[]  = { "S2", "S4" };
    inline constexpr std::string_view playMode[]    = { "LOOP", "ONESHOT" };
    inline constexpr std::string_view bassWave[]    = { "SAW", "SQR", "TRI", "RECT", "S01" };
    inline constexpr std::string_view subRange[]    = { "-2", "-1", "UNISON" };
    inline constexpr std::string_view masterFx[]    = { "SWEEP", "PHASER", "DIST", "SNIP", "DUCK" };
    inline constexpr std::string_view reverbType[]  = { "ROOM", "HALL", "PLATE" };
    inline constexpr std::string_view delayTime[]   = { "1/32", "1/16T", "1/16", "1/8T", "1/8",
                                                        "1/4T", "1/4", "1/2", "1/1" };
    inline constexpr std::string_view onOff[]       = { "OFF", "ON" };
}

//==============================================================================
// The parameter table.
//
// Ranges marked [P] are provisional: the device's exact ranges are not published, so these are
// musically sensible defaults to be corrected against docs/reference/MINIMAL_manual_en.pdf.
// Correcting one is a single-row edit here; everything downstream follows.

using S = ParamScope;
using C = ParamCurve;
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

// clang-format off
static const std::array<ParamDescriptor, kNumParamKinds> kParamTable { {
    //  kind                            id                       name        scope      min     max     def    curve  unit             plock  labels
    { ParamKind::Tempo,                 "tempo",                 "TEMPO",    S::Global, 20.f,   300.f,  128.f, C::Linear,      U::Bpm,          false, noLabels },
    { ParamKind::GlobalSwing,           "swing",                 "SWING",    S::Global, -50.f,  50.f,   0.f,   C::Linear,      U::Percent,      false, noLabels },
    { ParamKind::MasterVolume,          "master_vol",            "VOLUME",   S::Global, 0.f,    1.f,    0.8f,  C::Linear,      U::Percent,      false, noLabels },
    { ParamKind::Feel,                  "feel",                  "FEEL",     S::Global, 0.f,    2.f,    2.f,   C::Stepped,     U::Enum,         false, lab (labels::feel) },
    { ParamKind::FeelDepth,             "feel_depth",            "DEPTH",    S::Global, 0.f,    1.f,    0.5f,  C::Linear,      U::Percent,      true,  noLabels },

    { ParamKind::TrackLevel,            "level",                 "LEVEL",    S::Track,  0.f,    1.f,    0.8f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::TrackEqFreq,           "eq_freq",               "FREQ",     S::Track,  20.f,   20000.f,1000.f,C::Exponential, U::Hertz,        true,  noLabels },
    { ParamKind::TrackEqRes,            "eq_res",                "RES",      S::Track,  0.f,    1.f,    0.f,   C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::TrackReverbSend,       "rev_send",              "REV",      S::Track,  0.f,    1.f,    0.f,   C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::TrackDelaySend,        "dly_send",              "DLY",      S::Track,  0.f,    1.f,    0.f,   C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::TrackMute,             "mute",                  "MUTE",     S::Track,  0.f,    1.f,    0.f,   C::Stepped,     U::Bool,         false, lab (labels::onOff) },
    { ParamKind::TrackStepLength,       "step_length",           "LENGTH",   S::Track,  1.f,    16.f,   16.f,  C::Stepped,     U::Steps,        false, noLabels },
    { ParamKind::TrackNoteLength,       "note_length",           "NOTE",     S::Track,  0.f,    5.f,    4.f,   C::Stepped,     U::Enum,         false, lab (labels::noteLength) },
    { ParamKind::TrackRotation,         "rotation",              "ROTATE",   S::Track,  -15.f,  15.f,   0.f,   C::Stepped,     U::Steps,        false, noLabels },
    { ParamKind::TrackSwing,            "track_swing",           "SWING",    S::Track,  -50.f,  50.f,   0.f,   C::Linear,      U::Percent,      false, noLabels },
    { ParamKind::TrackRandomVelocity,   "rand_vel",              "RANDOM",   S::Track,  0.f,    1.f,    0.f,   C::Linear,      U::Percent,      false, noLabels },

    { ParamKind::KickTune,              "kick_tune",             "TUNE",     S::Track,  -24.f,  24.f,   0.f,   C::Linear,      U::Semitones,    true,  noLabels },
    { ParamKind::KickDecay,             "kick_decay",            "DECAY",    S::Track,  10.f,   2000.f, 400.f, C::Exponential, U::Milliseconds, true,  noLabels },
    { ParamKind::KickPunch,             "kick_punch",            "PUNCH",    S::Track,  0.f,    1.f,    0.4f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::KickSweepDepth,        "kick_sweep_depth",      "SWEEP",    S::Track,  0.f,    1.f,    0.6f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::KickSweepTime,         "kick_sweep_time",       "SWPTIME",  S::Track,  1.f,    200.f,  30.f,  C::Exponential, U::Milliseconds, true,  noLabels },
    { ParamKind::KickDrive,             "kick_drive",            "DRIVE",    S::Track,  0.f,    1.f,    0.f,   C::Linear,      U::Percent,      true,  noLabels },

    { ParamKind::SnareTune,             "snare_tune",            "TUNE",     S::Track,  -24.f,  24.f,   0.f,   C::Linear,      U::Semitones,    true,  noLabels },
    { ParamKind::SnareDecay,            "snare_decay",           "DECAY",    S::Track,  10.f,   1500.f, 200.f, C::Exponential, U::Milliseconds, true,  noLabels },
    { ParamKind::SnareSnap,             "snare_snap",            "SNAP",     S::Track,  0.f,    1.f,    0.5f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::SnareNoiseDecay,       "snare_noise_decay",     "NDECAY",   S::Track,  10.f,   1500.f, 250.f, C::Exponential, U::Milliseconds, true,  noLabels },
    { ParamKind::SnareDrive,            "snare_drive",           "DRIVE",    S::Track,  0.f,    1.f,    0.f,   C::Linear,      U::Percent,      true,  noLabels },

    { ParamKind::HatTune,               "hat_tune",              "TUNE",     S::Track,  -24.f,  24.f,   0.f,   C::Linear,      U::Semitones,    true,  noLabels },
    { ParamKind::HatDecay,              "hat_decay",             "DECAY",    S::Track,  5.f,    1500.f, 80.f,  C::Exponential, U::Milliseconds, true,  noLabels },
    { ParamKind::HatTone,               "hat_tone",              "TONE",     S::Track,  0.f,    1.f,    0.5f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::HatCharacter,          "hat_character",         "CHAR",     S::Track,  0.f,    1.f,    0.5f,  C::Linear,      U::Percent,      true,  noLabels },

    { ParamKind::SampleBank,            "smp_bank",              "BANK",     S::Track,  0.f,    1.f,    0.f,   C::Stepped,     U::Enum,         false, lab (labels::sampleBank) },
    { ParamKind::SampleSlot,            "smp_slot",              "SLOT",     S::Track,  0.f,    31.f,   0.f,   C::Stepped,     U::None,         true,  noLabels },
    { ParamKind::SampleTune,            "smp_tune",              "TUNE",     S::Track,  -24.f,  24.f,   0.f,   C::Linear,      U::Semitones,    true,  noLabels },
    { ParamKind::SampleStart,           "smp_start",             "START",    S::Track,  0.f,    1.f,    0.f,   C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::SampleDecay,           "smp_decay",             "DECAY",    S::Track,  5.f,    2000.f, 2000.f,C::Exponential, U::Milliseconds, true,  noLabels },
    { ParamKind::SampleRepitchToTempo,  "smp_repitch",           "RETUNE",   S::Track,  0.f,    1.f,    0.f,   C::Stepped,     U::Bool,         false, lab (labels::onOff) },

    { ParamKind::LoopSlot,              "loop_slot",             "SLOT",     S::Track,  0.f,    11.f,   0.f,   C::Stepped,     U::None,         true,  noLabels },
    { ParamKind::LoopPitch,             "loop_pitch",            "PITCH",    S::Track,  -24.f,  24.f,   0.f,   C::Linear,      U::Semitones,    true,  noLabels },
    { ParamKind::LoopPlayMode,          "loop_mode",             "MODE",     S::Track,  0.f,    1.f,    0.f,   C::Stepped,     U::Enum,         false, lab (labels::playMode) },
    { ParamKind::LoopCrossfade,         "loop_xfade",            "XFADE",    S::Track,  0.f,    500.f,  10.f,  C::Exponential, U::Milliseconds, false, noLabels },
    { ParamKind::LoopStretch,           "loop_stretch",          "STRETCH",  S::Track,  0.f,    1.f,    1.f,   C::Stepped,     U::Bool,         false, lab (labels::onOff) },
    { ParamKind::LoopStart,             "loop_start",            "START",    S::Track,  0.f,    1.f,    0.f,   C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::LoopLength,            "loop_length",           "LEN",      S::Track,  0.f,    1.f,    1.f,   C::Linear,      U::Percent,      true,  noLabels },

    { ParamKind::BassWave,              "bass_wave",             "WAVE",     S::Track,  0.f,    4.f,    0.f,   C::Stepped,     U::Enum,         true,  lab (labels::bassWave) },
    { ParamKind::BassWaveBlend,         "bass_blend",            "BLEND",    S::Track,  0.f,    1.f,    0.f,   C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::BassSubRange,          "bass_sub_range",        "SUBOCT",   S::Track,  0.f,    2.f,    1.f,   C::Stepped,     U::Enum,         false, lab (labels::subRange) },
    { ParamKind::BassSubLevel,          "bass_sub_level",        "SUBLVL",   S::Track,  0.f,    1.f,    0.f,   C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::BassSubBypass,         "bass_sub_bypass",       "SUBBYP",   S::Track,  0.f,    1.f,    0.f,   C::Stepped,     U::Bool,         false, lab (labels::onOff) },
    { ParamKind::BassTune,              "bass_tune",             "TUNE",     S::Track,  -24.f,  24.f,   0.f,   C::Linear,      U::Semitones,    true,  noLabels },
    { ParamKind::BassCutoff,            "bass_cutoff",           "CUTOFF",   S::Track,  20.f,   16000.f,800.f, C::Exponential, U::Hertz,        true,  noLabels },
    { ParamKind::BassResonance,         "bass_res",              "RESO",     S::Track,  0.f,    1.f,    0.6f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::BassEnvMod,            "bass_env_mod",          "ENVMOD",   S::Track,  0.f,    1.f,    0.5f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::BassDecay,             "bass_decay",            "DECAY",    S::Track,  20.f,   3000.f, 300.f, C::Exponential, U::Milliseconds, true,  noLabels },
    { ParamKind::BassDecayCurve,        "bass_decay_curve",      "DCURVE",   S::Track,  0.f,    1.f,    0.5f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::BassAccentAmount,      "bass_accent",           "ACCENT",   S::Track,  0.f,    1.f,    0.5f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::BassGlideTime,         "bass_glide_time",       "GLIDE",    S::Track,  1.f,    500.f,  60.f,  C::Exponential, U::Milliseconds, true,  noLabels },
    { ParamKind::BassGlideCurve,        "bass_glide_curve",      "GCURVE",   S::Track,  0.f,    1.f,    0.5f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::BassGateTime,          "bass_gate_time",        "GATE",     S::Track,  0.05f,  1.f,    0.5f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::BassOverdrive,         "bass_overdrive",        "DRIVE",    S::Track,  0.f,    1.f,    0.f,   C::Linear,      U::Percent,      true,  noLabels },

    { ParamKind::MasterFxType,          "mfx_type",              "FX",       S::Global, 0.f,    4.f,    0.f,   C::Stepped,     U::Enum,         false, lab (labels::masterFx) },
    { ParamKind::MasterFxAmount,        "mfx_amount",            "AMOUNT",   S::Global, 0.f,    1.f,    0.f,   C::Linear,      U::Percent,      true,  noLabels },

    { ParamKind::ReverbType,            "rev_type",              "TYPE",     S::Global, 0.f,    2.f,    0.f,   C::Stepped,     U::Enum,         false, lab (labels::reverbType) },
    { ParamKind::ReverbTime,            "rev_time",              "TIME",     S::Global, 0.1f,   10.f,   1.8f,  C::Exponential, U::Milliseconds, true,  noLabels },
    { ParamKind::ReverbLevel,           "rev_level",             "LEVEL",    S::Global, 0.f,    1.f,    0.5f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::DelayTime,             "dly_time",              "TIME",     S::Global, 0.f,    8.f,    4.f,   C::Stepped,     U::Enum,         true,  lab (labels::delayTime) },
    { ParamKind::DelayFeedback,         "dly_feedback",          "FDBK",     S::Global, 0.f,    1.f,    0.4f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::DelayLevel,            "dly_level",             "LEVEL",    S::Global, 0.f,    1.f,    0.5f,  C::Linear,      U::Percent,      true,  noLabels },
    { ParamKind::DelayPingPong,         "dly_pingpong",          "PINGPNG",  S::Global, 0.f,    1.f,    0.f,   C::Stepped,     U::Bool,         false, lab (labels::onOff) },
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
    assert (kParamTable[index].kind == kind && "kParamTable row order must match ParamKind");
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

float clampToRange (ParamKind kind, float value) noexcept
{
    const auto& info = paramInfo (kind);
    auto v = std::clamp (value, info.minValue, info.maxValue);

    if (info.curve == ParamCurve::Stepped)
        v = std::round (v);

    return v;
}

float normalise (ParamKind kind, float value) noexcept
{
    const auto& info = paramInfo (kind);
    const auto v = std::clamp (value, info.minValue, info.maxValue);
    const auto range = info.maxValue - info.minValue;

    if (range <= 0.f)
        return 0.f;

    if (info.curve == ParamCurve::Exponential && info.minValue > 0.f)
        return static_cast<float> (std::log (v / info.minValue)
                                   / std::log (info.maxValue / info.minValue));

    return (v - info.minValue) / range;
}

float denormalise (ParamKind kind, float normalised) noexcept
{
    const auto& info = paramInfo (kind);
    const auto n = std::clamp (normalised, 0.f, 1.f);

    if (info.curve == ParamCurve::Exponential && info.minValue > 0.f)
        return clampToRange (kind,
                             info.minValue * std::pow (info.maxValue / info.minValue, n));

    return clampToRange (kind, info.minValue + n * (info.maxValue - info.minValue));
}

std::string formatValue (ParamKind kind, float value) noexcept
{
    const auto& info = paramInfo (kind);
    const auto v = clampToRange (kind, value);
    char buffer[32] {};

    switch (info.unit)
    {
        case ParamUnit::Enum:
        case ParamUnit::Bool:
        {
            const auto index = static_cast<std::size_t> (std::max (0.f, v));
            if (index < info.labels.size())
                return std::string (info.labels[index]);
            std::snprintf (buffer, sizeof (buffer), "%d", static_cast<int> (v));
            break;
        }

        case ParamUnit::Percent:
            std::snprintf (buffer, sizeof (buffer), "%d%%", static_cast<int> (std::round (v * 100.f)));
            break;

        case ParamUnit::Hertz:
            if (v >= 1000.f)
                std::snprintf (buffer, sizeof (buffer), "%.1fk", static_cast<double> (v) / 1000.0);
            else
                std::snprintf (buffer, sizeof (buffer), "%dHz", static_cast<int> (std::round (v)));
            break;

        case ParamUnit::Milliseconds:
            if (v >= 1000.f)
                std::snprintf (buffer, sizeof (buffer), "%.2fs", static_cast<double> (v) / 1000.0);
            else
                std::snprintf (buffer, sizeof (buffer), "%dms", static_cast<int> (std::round (v)));
            break;

        case ParamUnit::Semitones:
            std::snprintf (buffer, sizeof (buffer), "%+d", static_cast<int> (std::round (v)));
            break;

        case ParamUnit::Decibels:
            std::snprintf (buffer, sizeof (buffer), "%+.1fdB", static_cast<double> (v));
            break;

        case ParamUnit::Bpm:
            std::snprintf (buffer, sizeof (buffer), "%.1f", static_cast<double> (v));
            break;

        case ParamUnit::Steps:
            std::snprintf (buffer, sizeof (buffer), "%d", static_cast<int> (std::round (v)));
            break;

        case ParamUnit::None:
        default:
            std::snprintf (buffer, sizeof (buffer), "%d", static_cast<int> (std::round (v)));
            break;
    }

    return buffer;
}

//==============================================================================

namespace
{
    constexpr ParamKind kCommonTrack[] = {
        ParamKind::TrackLevel,
        ParamKind::TrackEqFreq,
        ParamKind::TrackEqRes,
        ParamKind::TrackReverbSend,
        ParamKind::TrackDelaySend,
        ParamKind::TrackMute,
        ParamKind::TrackStepLength,
        ParamKind::TrackNoteLength,
        ParamKind::TrackRotation,
        ParamKind::TrackSwing,
        ParamKind::TrackRandomVelocity,
    };

    constexpr ParamKind kKick[] = {
        ParamKind::KickTune, ParamKind::KickDecay, ParamKind::KickPunch,
        ParamKind::KickSweepDepth, ParamKind::KickSweepTime, ParamKind::KickDrive,
    };

    constexpr ParamKind kSnare[] = {
        ParamKind::SnareTune, ParamKind::SnareDecay, ParamKind::SnareSnap,
        ParamKind::SnareNoiseDecay, ParamKind::SnareDrive,
    };

    constexpr ParamKind kHat[] = {
        ParamKind::HatTune, ParamKind::HatDecay, ParamKind::HatTone, ParamKind::HatCharacter,
    };

    constexpr ParamKind kSample[] = {
        ParamKind::SampleBank, ParamKind::SampleSlot, ParamKind::SampleTune,
        ParamKind::SampleStart, ParamKind::SampleDecay, ParamKind::SampleRepitchToTempo,
    };

    constexpr ParamKind kLoop[] = {
        ParamKind::LoopSlot, ParamKind::LoopPitch, ParamKind::LoopPlayMode,
        ParamKind::LoopCrossfade, ParamKind::LoopStretch, ParamKind::LoopStart,
        ParamKind::LoopLength,
    };

    constexpr ParamKind kBass[] = {
        ParamKind::BassWave, ParamKind::BassWaveBlend, ParamKind::BassSubRange,
        ParamKind::BassSubLevel, ParamKind::BassSubBypass, ParamKind::BassTune,
        ParamKind::BassCutoff, ParamKind::BassResonance, ParamKind::BassEnvMod,
        ParamKind::BassDecay, ParamKind::BassDecayCurve, ParamKind::BassAccentAmount,
        ParamKind::BassGlideTime, ParamKind::BassGlideCurve, ParamKind::BassGateTime,
        ParamKind::BassOverdrive,
    };
}

std::span<const ParamKind> commonTrackParams() noexcept
{
    return { kCommonTrack, std::size (kCommonTrack) };
}

std::span<const ParamKind> voiceParams (VoiceKind voice) noexcept
{
    switch (voice)
    {
        case VoiceKind::KickSynth:  return { kKick,   std::size (kKick) };
        case VoiceKind::SnareSynth: return { kSnare,  std::size (kSnare) };
        case VoiceKind::HiHat:      return { kHat,    std::size (kHat) };
        case VoiceKind::Sample:     return { kSample, std::size (kSample) };
        case VoiceKind::Loop:       return { kLoop,   std::size (kLoop) };
        case VoiceKind::BassSynth:  return { kBass,   std::size (kBass) };
    }
    return {};
}

std::vector<ParamId> trackParamIds (int track)
{
    std::vector<ParamId> ids;
    const auto voice = trackInfo (track).voice;

    ids.reserve (commonTrackParams().size() + voiceParams (voice).size());

    for (auto kind : commonTrackParams())
        ids.push_back (makeParamId (kind, track));

    for (auto kind : voiceParams (voice))
        ids.push_back (makeParamId (kind, track));

    return ids;
}

} // namespace bud
