#pragma once

#include "../Types.h"
#include "../params/ParameterIds.h"

#include <cstdint>
#include <span>
#include <vector>

namespace bud
{

/** A per-step parameter lock: one parameter pinned to one value for the duration of a step.

    Stored sparsely and sorted by id. Steps overwhelmingly carry zero or a handful of locks, so a
    sorted small vector beats a hash map on both memory and lookup here.

    Values are raw, in the same domain as ParameterSet.
*/
struct PlockEntry
{
    ParamId id;
    int value;
};

class PlockMap
{
public:
    /// Set or replace a lock. The value is clamped to the parameter's range. Setting a lock on a
    /// parameter the hardware excludes from locking (p. 44) is ignored.
    void set (ParamId id, int value);

    void clear (ParamId id);
    void clearAll() noexcept { entries_.clear(); }

    /// Locked value, or nullptr when the parameter is not locked on this step.
    const int* find (ParamId id) const noexcept;

    bool contains (ParamId id) const noexcept { return find (id) != nullptr; }
    bool empty() const noexcept { return entries_.empty(); }
    std::size_t size() const noexcept { return entries_.size(); }

    std::span<const PlockEntry> all() const noexcept { return { entries_.data(), entries_.size() }; }

private:
    std::vector<PlockEntry> entries_;
};

//==============================================================================

/** One sequencer step. */
struct Step
{
    bool gate = false;

    /// Normal, hard accent or soft accent. Depths are global (p. 47-48).
    Accent accent = Accent::Normal;

    /// Velocity from pad or MIDI input, 0-127. Accent and random velocity apply on top.
    std::uint8_t velocity = 100;

    /// Sub-step figure: a rest mask over a 4- or 3-way division of the step (p. 49).
    SubStepPattern subStep = SubStepPattern::Off;

    /// Semitone offset for pitched tracks — the bass synth and tuned samples.
    std::int8_t note = 0;

    /// Bass synth: glide from the previous note into this one (p. 76).
    bool glide = false;

    /// Hold through the following step rather than retriggering. Tracks 10 and 11 only (p. 39).
    bool tie = false;

    /// Stereo loop track: restart the sample from its start position on this step (p. 69).
    bool retrigger = false;

    PlockMap locks;

    void clear();

    /// Whether this step differs from a default-constructed one.
    bool isDefault() const noexcept;
};

} // namespace bud
