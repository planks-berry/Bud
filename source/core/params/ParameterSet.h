#pragma once

#include "../sequencer/Step.h"
#include "Curves.h"
#include "ParameterIds.h"

#include <array>

namespace bud
{

/** Current value of every parameter instance in the instrument.

    Values are integers in the hardware's own domain, so what is stored here is exactly what the
    device would store. A flat array per track rather than a map: lookup happens once per
    parameter per voice trigger, and a hash buys nothing over an indexed read of a few kilobytes
    that stays in cache.
*/
class ParameterSet
{
public:
    ParameterSet();

    void resetToDefaults();

    /// Track -1 reads the global instance.
    int get (ParamKind kind, int track = -1) const noexcept;

    void set (ParamKind kind, int track, int value) noexcept;
    void set (ParamKind kind, int value) noexcept { set (kind, -1, value); }

    int get (ParamId id) const noexcept { return get (kindOf (id), trackOf (id)); }
    void set (ParamId id, int value) noexcept { set (kindOf (id), trackOf (id), value); }

private:
    std::array<int, kNumParamKinds> globals_ {};
    std::array<std::array<int, kNumParamKinds>, kNumTracks> perTrack_ {};
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

    /// Raw value, locks applied.
    int operator() (ParamKind kind) const noexcept
    {
        if (locks != nullptr)
            if (const auto* locked = locks->find (makeParamId (kind, track)))
                return *locked;

        return parameters->get (kind, track);
    }

    bool flag (ParamKind kind) const noexcept { return (*this) (kind) != 0; }

    template <typename Enum>
    Enum enumValue (ParamKind kind) const noexcept
    {
        return static_cast<Enum> ((*this) (kind));
    }

    //==========================================================================
    // Curve shortcuts, so voices read intent rather than arithmetic.

    float unit (ParamKind kind) const noexcept { return curves::unit ((*this) (kind)); }
    float bipolar (ParamKind kind) const noexcept { return curves::bipolar ((*this) (kind)); }
    float level (ParamKind kind) const noexcept { return curves::levelGain ((*this) (kind)); }

    float timeMs (ParamKind kind, float minMs, float maxMs) const noexcept
    {
        return curves::timeMs ((*this) (kind), minMs, maxMs);
    }
};

} // namespace bud
