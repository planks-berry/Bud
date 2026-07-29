#include "ParameterSet.h"

namespace bud
{

ParameterSet::ParameterSet()
{
    resetToDefaults();
}

void ParameterSet::resetToDefaults()
{
    for (const auto& info : paramTable())
    {
        const auto index = static_cast<std::size_t> (info.kind);

        globals_[index] = info.defaultValue;

        for (auto& track : perTrack_)
            track[index] = info.defaultValue;
    }

    // Each track starts on the bank the hardware assigns it (p. 25).
    for (int track = 0; track < kNumTracks; ++track)
        set (ParamKind::TrackSoundBank, track,
             static_cast<int> (trackInfo (track).defaultBank));
}

int ParameterSet::get (ParamKind kind, int track) const noexcept
{
    const auto index = static_cast<std::size_t> (kind);

    if (track < 0 || track >= kNumTracks)
        return globals_[index];

    return perTrack_[static_cast<std::size_t> (track)][index];
}

void ParameterSet::set (ParamKind kind, int track, int value) noexcept
{
    const auto index = static_cast<std::size_t> (kind);
    const auto clamped = clampToRange (kind, value);

    if (track < 0 || track >= kNumTracks)
        globals_[index] = clamped;
    else
        perTrack_[static_cast<std::size_t> (track)][index] = clamped;
}

} // namespace bud
