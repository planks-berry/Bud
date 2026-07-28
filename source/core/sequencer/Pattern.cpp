#include "Pattern.h"

#include <algorithm>
#include <cassert>
#include <utility>

namespace bud
{

namespace
{
    /// Positive modulo, so rotation works for negative amounts.
    int wrap (int value, int size) noexcept
    {
        if (size <= 0)
            return 0;

        const auto m = value % size;
        return m < 0 ? m + size : m;
    }
}

//==============================================================================

TrackPattern::StepArray& TrackPattern::variation (Variation v) noexcept
{
    return variations[static_cast<std::size_t> (v)];
}

const TrackPattern::StepArray& TrackPattern::variation (Variation v) const noexcept
{
    return variations[static_cast<std::size_t> (v)];
}

Step& TrackPattern::stepAt (int chainIndex, int stepIndex) noexcept
{
    return const_cast<Step&> (std::as_const (*this).stepAt (chainIndex, stepIndex));
}

const Step& TrackPattern::stepAt (int chainIndex, int stepIndex) const noexcept
{
    const auto safeChain = wrap (chainIndex, std::max (1, chainLength));
    const auto v = chain[static_cast<std::size_t> (safeChain)];

    // Rotation is non-destructive: it offsets the read position within the active length.
    const auto rotated = wrap (stepIndex - rotation, std::max (1, stepLength));

    return variation (v)[static_cast<std::size_t> (rotated)];
}

void TrackPattern::clear()
{
    *this = TrackPattern {};
}

void TrackPattern::clearVariation (Variation v)
{
    for (auto& step : variation (v))
        step.clear();
}

void TrackPattern::copyVariation (Variation from, Variation to)
{
    if (from != to)
        variation (to) = variation (from);
}

void TrackPattern::rotateVariationInPlace (Variation v, int amount)
{
    const auto length = std::clamp (stepLength, 1, kStepsPerVariation);
    const auto shift = wrap (amount, length);

    if (shift == 0)
        return;

    auto& steps = variation (v);
    StepArray rotated = steps;

    for (int i = 0; i < length; ++i)
        rotated[static_cast<std::size_t> (wrap (i + shift, length))] = steps[static_cast<std::size_t> (i)];

    steps = rotated;
}

void TrackPattern::setChain (std::initializer_list<Variation> order)
{
    chainLength = std::clamp (static_cast<int> (order.size()), 1, kNumVariations);

    int i = 0;
    for (auto v : order)
    {
        if (i >= chainLength)
            break;

        chain[static_cast<std::size_t> (i++)] = v;
    }
}

//==============================================================================

void Pattern::clear()
{
    const auto keptTempo = tempo;
    *this = Pattern {};
    tempo = keptTempo;
}

//==============================================================================

PatternBank::PatternBank() = default;

Pattern& PatternBank::pattern (int index) noexcept
{
    assert (index >= 0 && index < kNumPatterns);
    return patterns_[static_cast<std::size_t> (index)];
}

const Pattern& PatternBank::pattern (int index) const noexcept
{
    assert (index >= 0 && index < kNumPatterns);
    return patterns_[static_cast<std::size_t> (index)];
}

void PatternBank::clear (int index)
{
    pattern (index).clear();
}

void PatternBank::copy (int from, int to)
{
    if (from != to)
        pattern (to) = pattern (from);
}

} // namespace bud
