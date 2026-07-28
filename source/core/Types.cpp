#include "Types.h"

namespace bud
{

std::string_view toString (VoiceKind v) noexcept
{
    switch (v)
    {
        case VoiceKind::KickSynth:  return "KICK";
        case VoiceKind::SnareSynth: return "SNARE";
        case VoiceKind::HiHat:      return "HAT";
        case VoiceKind::Sample:     return "SAMPLE";
        case VoiceKind::Loop:       return "LOOP";
        case VoiceKind::BassSynth:  return "BASS";
    }
    return "?";
}

std::string_view toString (Variation v) noexcept
{
    switch (v)
    {
        case Variation::A: return "A";
        case Variation::B: return "B";
        case Variation::C: return "C";
        case Variation::D: return "D";
    }
    return "?";
}

std::string_view toString (Accent a) noexcept
{
    switch (a)
    {
        case Accent::DeAccent: return "WEAK";
        case Accent::Normal:   return "NORM";
        case Accent::Accent:   return "ACC";
    }
    return "?";
}

std::string_view toString (FeelModel f) noexcept
{
    switch (f)
    {
        case FeelModel::M808:    return "808";
        case FeelModel::M909:    return "909";
        case FeelModel::Minimal: return "MINIMAL";
    }
    return "?";
}

std::string_view toString (StepDivision d) noexcept
{
    switch (d)
    {
        case StepDivision::Whole:        return "1/1";
        case StepDivision::Half:         return "1/2";
        case StepDivision::Quarter:      return "1/4";
        case StepDivision::Eighth:       return "1/8";
        case StepDivision::Sixteenth:    return "1/16";
        case StepDivision::ThirtySecond: return "1/32";
    }
    return "?";
}

} // namespace bud
