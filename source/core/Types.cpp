#include "Types.h"

namespace bud
{

std::string_view toString (TrackKind k) noexcept
{
    switch (k)
    {
        case TrackKind::Drum:   return "DRUM";
        case TrackKind::Sample: return "SMPL";
        case TrackKind::Bass:   return "BASS";
    }
    return "?";
}

std::string_view toString (SoundBank b) noexcept
{
    return bankInfo (b).name;
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
        case Accent::Normal: return "NORM";
        case Accent::Hard:   return "ACC-H";
        case Accent::Soft:   return "ACC-S";
    }
    return "?";
}

std::string_view toString (FeelModel f) noexcept
{
    // The display shows these as two characters.
    switch (f)
    {
        case FeelModel::M808:    return "08";
        case FeelModel::M909:    return "09";
        case FeelModel::Minimal: return "MN";
    }
    return "?";
}

std::string_view toString (StepDivision d) noexcept
{
    switch (d)
    {
        case StepDivision::Whole:          return "1";
        case StepDivision::Half:           return "2";
        case StepDivision::Quarter:        return "4";
        case StepDivision::DottedQuarter:  return "4D";
        case StepDivision::TripletQuarter: return "4T";
        case StepDivision::Eighth:         return "8";
        case StepDivision::DottedEighth:   return "8D";
        case StepDivision::TripletEighth:  return "8T";
        case StepDivision::Sixteenth:      return "16";
        case StepDivision::ThirtySecond:   return "32";
    }
    return "?";
}

std::string_view toString (SubStepPattern p) noexcept
{
    return subStepInfo (p).display;
}

std::string_view toString (LoopMode m) noexcept
{
    switch (m)
    {
        case LoopMode::LoopNoStretch:    return "O.OFF";
        case LoopMode::LoopMelodic:      return "O.MLD";
        case LoopMode::LoopRhythmic:     return "O.RHY";
        case LoopMode::OneShotNoStretch: return ">.OFF";
        case LoopMode::OneShotMelodic:   return ">.MLD";
        case LoopMode::OneShotRhythmic:  return ">.RHY";
    }
    return "?";
}

std::string_view toString (SnappyType s) noexcept
{
    switch (s)
    {
        case SnappyType::N88: return "N88";
        case SnappyType::N99: return "N99";
        case SnappyType::NT1: return "NT1";
        case SnappyType::NT2: return "NT2";
        case SnappyType::NT3: return "NT3";
        case SnappyType::NT4: return "NT4";
    }
    return "?";
}

std::string_view toString (MasterFxType t) noexcept
{
    switch (t)
    {
        case MasterFxType::SweepFilter: return "S.FLT";
        case MasterFxType::Phaser:      return "PHSR";
        case MasterFxType::Distortion:  return "DIST";
        case MasterFxType::SnipLoop:    return "SN.LP";
        case MasterFxType::DuckingComp: return "DUCK";
    }
    return "?";
}

std::string_view toString (ReverbType t) noexcept
{
    switch (t)
    {
        case ReverbType::Room:  return "ROOM";
        case ReverbType::Hall:  return "HALL";
        case ReverbType::Plate: return "PLAT";
    }
    return "?";
}

} // namespace bud
