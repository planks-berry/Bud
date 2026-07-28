#pragma once

#include "../Types.h"
#include "../params/ParameterIds.h"

#include <cstdint>
#include <span>
#include <vector>

namespace bud
{

/** A per-step parameter lock: one parameter pinned to one value for the duration of a step.

    Stored sparsely and sorted by id. Steps overwhelmingly carry zero or a handful of locks, so
    a sorted small vector beats a hash map on both memory and lookup here.
*/
struct PlockEntry
{
    ParamId id;
    float value;
};

class PlockMap
{
public:
    /// Set or replace a lock. Value is clamped to the parameter's range.
    void set (ParamId id, float value);

    /// Remove a lock. Does nothing if not present.
    void clear (ParamId id);

    void clearAll() noexcept { entries_.clear(); }

    /// Locked value, or nullptr when the parameter is not locked on this step.
    const float* find (ParamId id) const noexcept;

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

    Accent accent = Accent::Normal;

    /// Base velocity, 0-127. Accent and random velocity are applied on top at trigger time.
    std::uint8_t velocity = 100;

    /// Retriggers within this step, 1 to kMaxSubSteps.
    std::uint8_t subSteps = 1;

    /// Manual nudge, as a fraction of one step (-0.5 to +0.5). Independent of FEEL drift.
    float microShift = 0.0f;

    /// Semitone offset for pitched tracks (the bass synth, and tuned sample tracks).
    std::int8_t note = 0;

    /// Bass synth: glide from the previous note into this one.
    bool slide = false;

    /// Hold through the following step rather than retriggering.
    bool tie = false;

    PlockMap locks;

    void clear();

    /// Whether this step differs from a default-constructed one.
    bool isDefault() const noexcept;
};

} // namespace bud
