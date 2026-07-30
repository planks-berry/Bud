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

Step& TrackPattern::stepAt (int chainIndex, int stepIndex, int stepLength) noexcept
{
    return const_cast<Step&> (std::as_const (*this).stepAt (chainIndex, stepIndex, stepLength));
}

const Step& TrackPattern::stepAt (int chainIndex, int stepIndex, int stepLength) const noexcept
{
    const auto safeChain = wrap (chainIndex, std::max (1, chainLength));
    const auto v = chain[static_cast<std::size_t> (safeChain)];

    const auto length = std::clamp (stepLength, 1, kStepsPerVariation);
    const auto rotated = wrap (stepIndex - rotation, length);

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

void TrackPattern::rotateVariationInPlace (Variation v, int amount, int stepLength)
{
    const auto length = std::clamp (stepLength, 1, kStepsPerVariation);
    const auto shift = wrap (amount, length);

    if (shift == 0)
        return;

    auto& steps = variation (v);
    StepArray rotated = steps;

    for (int i = 0; i < length; ++i)
        rotated[static_cast<std::size_t> (wrap (i + shift, length))] =
            steps[static_cast<std::size_t> (i)];

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
    *this = Pattern {};
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


//==============================================================================

namespace
{
    // See the note in Pattern.h for what is in, what is out, and why.
    constexpr ParamKind kPatternGlobals[] = {
        ParamKind::Tempo,
        ParamKind::Swing,
        ParamKind::SwingResolution,
        ParamKind::Transpose,
        ParamKind::PatternLevel,
        ParamKind::Feel,
        ParamKind::AccentHardDepth,
        ParamKind::AccentSoftDepth,
        ParamKind::IsolatorLow,
        ParamKind::IsolatorMid,
        ParamKind::IsolatorHigh,
        ParamKind::IsolatorOnLoop,
        ParamKind::MasterFxType,
        ParamKind::MasterFxAmount,
        ParamKind::ReverbType,
        ParamKind::ReverbMix,
        ParamKind::DelayMix,
        ParamKind::DelayTime,
        ParamKind::DelayFeedback,
        ParamKind::DelayToReverb,
        ParamKind::DelayPingPong,
        ParamKind::DelaySync
    };

    // Everything a kit carries, plus the per-track sequencer settings a kit deliberately leaves
    // out. A pattern owns both halves; a kit owns only the sound half.
    constexpr ParamKind kPatternTrackParams[] = {
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
        ParamKind::TrackNoteLength,
        ParamKind::TrackStepLength,
        ParamKind::TrackSwing,
        ParamKind::TrackMute,
        ParamKind::TrackChoke,
        ParamKind::TrackRepitch,
        ParamKind::TrackLoopMode,
        ParamKind::TrackSnappyType
    };

    static_assert (std::size (kPatternGlobals) <= kMaxPatternGlobals);
    static_assert (std::size (kPatternTrackParams) <= kMaxPatternTrackParams);
}

std::span<const ParamKind> patternGlobalParameters() noexcept
{
    return std::span<const ParamKind> (kPatternGlobals, std::size (kPatternGlobals));
}

std::span<const ParamKind> patternTrackParameters() noexcept
{
    return std::span<const ParamKind> (kPatternTrackParams, std::size (kPatternTrackParams));
}

//==============================================================================

void PatternBank::store (int index, const ParameterSet& parameters) noexcept
{
    if (index < 0 || index >= kNumPatterns)
        return;

    auto& settings = patterns_[static_cast<std::size_t> (index)].settings;

    const auto globals = patternGlobalParameters();
    const auto perTrack = patternTrackParameters();

    for (std::size_t i = 0; i < globals.size(); ++i)
        settings.globals[i] = parameters.get (globals[i]);

    for (int track = 0; track < kNumTracks; ++track)
    {
        auto& row = settings.perTrack[static_cast<std::size_t> (track)];

        for (std::size_t i = 0; i < perTrack.size(); ++i)
            row[i] = parameters.get (perTrack[i], track);
    }

    settings.stored = true;
}

bool PatternBank::recall (int index, ParameterSet& parameters, bool includeTempo) const noexcept
{
    if (index < 0 || index >= kNumPatterns)
        return false;

    const auto& settings = patterns_[static_cast<std::size_t> (index)].settings;

    // An unsaved pattern has no settings, only zeroes. Applying those would set every level,
    // bank and tempo to zero, so a pattern that had never been saved would arrive as silence.
    if (! settings.stored)
        return false;

    const auto globals = patternGlobalParameters();
    const auto perTrack = patternTrackParameters();

    for (std::size_t i = 0; i < globals.size(); ++i)
    {
        // With TEMPO set to GLOBAL the tempo belongs to the instrument rather than to the
        // pattern, so switching pattern must leave it where it is (p. 113).
        if (globals[i] == ParamKind::Tempo && ! includeTempo)
            continue;

        parameters.set (globals[i], settings.globals[i]);
    }

    for (int track = 0; track < kNumTracks; ++track)
    {
        const auto& row = settings.perTrack[static_cast<std::size_t> (track)];

        for (std::size_t i = 0; i < perTrack.size(); ++i)
            parameters.set (perTrack[i], track, row[i]);
    }

    return true;
}

void PatternBank::initialise (int index) noexcept
{
    if (index < 0 || index >= kNumPatterns)
        return;

    // p. 57: "Pattern settings along with note and parameter lock data will all be cleared."
    // The name goes too — an initialised pattern is a blank one, and keeping the old name would
    // leave a slot that reads as something it no longer contains.
    patterns_[static_cast<std::size_t> (index)].clear();
}

bool PatternBank::rename (int index, std::string name) noexcept
{
    if (index < 0 || index >= kNumPatterns)
        return false;

    patterns_[static_cast<std::size_t> (index)].name = std::move (name);
    return true;
}

} // namespace bud
