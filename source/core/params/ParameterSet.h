#pragma once

#include "../sequencer/Step.h"
#include "ParameterIds.h"

#include <array>

namespace bud
{

/** Current value of every parameter instance in the instrument.

    A flat array per track rather than a map: lookup happens once per parameter per voice
    trigger, and a hash on the audio thread buys nothing over an indexed read of three
    kilobytes that stays in cache.
*/
class ParameterSet
{
public:
    ParameterSet();

    void resetToDefaults();

    /// Track -1 reads the global instance.
    float get (ParamKind kind, int track = -1) const noexcept;

    void set (ParamKind kind, int track, float value) noexcept;
    void set (ParamKind kind, float value) noexcept { set (kind, -1, value); }

    float get (ParamId id) const noexcept { return get (kindOf (id), trackOf (id)); }
    void set (ParamId id, float value) noexcept { set (kindOf (id), trackOf (id), value); }

private:
    std::array<float, kNumParamKinds> globals_ {};
    std::array<std::array<float, kNumParamKinds>, kNumTracks> perTrack_ {};
};

//==============================================================================

/** A read-only view of one track's parameters with that step's locks applied.

    Voices are handed one of these at trigger time and read through it, so a locked parameter
    reaches the voice by exactly the same path as an unlocked one. That is what makes every
    plockable parameter work without per-parameter plumbing.
*/
struct ParamView
{
    const ParameterSet* parameters = nullptr;
    int track = 0;
    const PlockMap* locks = nullptr;

    float operator() (ParamKind kind) const noexcept
    {
        if (locks != nullptr)
            if (const auto* locked = locks->find (makeParamId (kind, track)))
                return *locked;

        return parameters->get (kind, track);
    }

    /// Convenience for parameters stored as an index into a label list.
    int index (ParamKind kind) const noexcept
    {
        return static_cast<int> ((*this) (kind) + 0.5f);
    }

    bool flag (ParamKind kind) const noexcept { return (*this) (kind) >= 0.5f; }
};

} // namespace bud
