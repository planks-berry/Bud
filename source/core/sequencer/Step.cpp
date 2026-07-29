#include "Step.h"

#include <algorithm>

namespace bud
{

namespace
{
    auto findEntry (auto& entries, ParamId id)
    {
        return std::lower_bound (entries.begin(), entries.end(), id,
                                 [] (const PlockEntry& e, ParamId target) { return e.id < target; });
    }
}

void PlockMap::set (ParamId id, int value)
{
    // The hardware excludes accent, isolator, MFX, reverb, delay, swing and master from
    // parameter locking (p. 44). Enforcing it here means no caller can create a lock the device
    // could not, however the value arrived.
    if (! paramInfo (kindOf (id)).plockable)
        return;

    const auto clamped = clampToRange (kindOf (id), value);
    auto it = findEntry (entries_, id);

    if (it != entries_.end() && it->id == id)
        it->value = clamped;
    else
        entries_.insert (it, PlockEntry { id, clamped });
}

void PlockMap::clear (ParamId id)
{
    auto it = findEntry (entries_, id);

    if (it != entries_.end() && it->id == id)
        entries_.erase (it);
}

const int* PlockMap::find (ParamId id) const noexcept
{
    auto it = findEntry (entries_, id);

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
        && subStep == SubStepPattern::Off
        && note == 0
        && ! glide
        && ! tie
        && ! retrigger
        && locks.empty();
}

} // namespace bud
