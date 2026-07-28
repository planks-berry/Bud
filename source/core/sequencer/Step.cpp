#include "Step.h"

#include <algorithm>

namespace bud
{

void PlockMap::set (ParamId id, float value)
{
    const auto clamped = clampToRange (kindOf (id), value);

    auto it = std::lower_bound (entries_.begin(), entries_.end(), id,
                                [] (const PlockEntry& e, ParamId target) { return e.id < target; });

    if (it != entries_.end() && it->id == id)
        it->value = clamped;
    else
        entries_.insert (it, PlockEntry { id, clamped });
}

void PlockMap::clear (ParamId id)
{
    auto it = std::lower_bound (entries_.begin(), entries_.end(), id,
                                [] (const PlockEntry& e, ParamId target) { return e.id < target; });

    if (it != entries_.end() && it->id == id)
        entries_.erase (it);
}

const float* PlockMap::find (ParamId id) const noexcept
{
    auto it = std::lower_bound (entries_.begin(), entries_.end(), id,
                                [] (const PlockEntry& e, ParamId target) { return e.id < target; });

    if (it != entries_.end() && it->id == id)
        return &it->value;

    return nullptr;
}

//==============================================================================

void Step::clear()
{
    *this = Step {};
}

bool Step::isDefault() const noexcept
{
    return ! gate
        && accent == Accent::Normal
        && velocity == 100
        && subSteps == 1
        && microShift == 0.0f
        && note == 0
        && ! slide
        && ! tie
        && locks.empty();
}

} // namespace bud
