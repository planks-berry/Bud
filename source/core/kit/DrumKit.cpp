#include "DrumKit.h"

#include <algorithm>

namespace bud
{

namespace
{
    // See the note in DrumKit.h for why each of these is in and what is deliberately left out.
    constexpr ParamKind kKitParameters[] = {
        ParamKind::TrackSoundBank,
        ParamKind::TrackSound,
        ParamKind::TrackTune,
        ParamKind::TrackTone,
        ParamKind::TrackMove,
        ParamKind::TrackAttack,
        ParamKind::TrackDecay,
        ParamKind::TrackReverbSend,
        ParamKind::TrackDelaySend,
        ParamKind::TrackPan,
        ParamKind::TrackLevel,
        ParamKind::TrackRandomVelocity,
        ParamKind::TrackChoke,
        ParamKind::TrackRepitch,
        ParamKind::TrackSnappyType
    };

    static_assert (std::size (kKitParameters) <= 16,
                   "DrumKit::values is sized for 16 parameters per track");
}

std::span<const ParamKind> kitParameters() noexcept
{
    return std::span<const ParamKind> (kKitParameters, std::size (kKitParameters));
}

//==============================================================================

void DrumKit::clear()
{
    name.clear();
    used = false;

    for (auto& track : values)
        track.fill (0);
}

//==============================================================================

KitBank::KitBank()
{
    clearAll();
}

void KitBank::clearAll()
{
    for (auto& kit : kits_)
        kit.clear();
}

DrumKit& KitBank::kit (int index) noexcept
{
    return kits_[static_cast<std::size_t> (std::clamp (index, 0, kNumDrumKits - 1))];
}

const DrumKit& KitBank::kit (int index) const noexcept
{
    return kits_[static_cast<std::size_t> (std::clamp (index, 0, kNumDrumKits - 1))];
}

//==============================================================================

bool KitBank::save (int index, const ParameterSet& parameters, std::string name) noexcept
{
    if (! isValidIndex (index))
        return false;

    auto& target = kits_[static_cast<std::size_t> (index)];
    const auto kinds = kitParameters();

    for (int track = 0; track < kNumKitTracks; ++track)
    {
        auto& row = target.values[static_cast<std::size_t> (track)];

        for (std::size_t i = 0; i < kinds.size(); ++i)
            row[i] = parameters.get (kinds[i], track);
    }

    // An explicit name replaces the old one; an empty one leaves whatever was there, so
    // re-saving over a named kit does not silently strip its name.
    if (! name.empty())
        target.name = std::move (name);

    target.used = true;
    return true;
}

bool KitBank::load (int index, ParameterSet& parameters) const noexcept
{
    if (! isValidIndex (index))
        return false;

    const auto& source = kits_[static_cast<std::size_t> (index)];

    // An empty slot is not a kit of zeroes. Loading one would set every bank and level to zero
    // and silence the machine, which is a worse outcome than doing nothing.
    if (! source.used)
        return false;

    const auto kinds = kitParameters();

    for (int track = 0; track < kNumKitTracks; ++track)
    {
        const auto& row = source.values[static_cast<std::size_t> (track)];

        for (std::size_t i = 0; i < kinds.size(); ++i)
            parameters.set (kinds[i], track, row[i]);
    }

    return true;
}

bool KitBank::rename (int index, std::string name) noexcept
{
    if (! isValidIndex (index))
        return false;

    auto& target = kits_[static_cast<std::size_t> (index)];

    if (! target.used)
        return false;

    target.name = std::move (name);
    return true;
}

} // namespace bud
