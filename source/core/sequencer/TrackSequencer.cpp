#include "TrackSequencer.h"

#include <algorithm>
#include <cmath>

namespace bud
{

namespace
{
    constexpr std::uint32_t kVelocitySalt = 0x3c6e'f372u;

    /// Accent scaling. The default step velocity of 100 with an accent reaches full scale,
    /// which keeps accented hits at unity and everything else below it.
    constexpr float accentScale (Accent a) noexcept
    {
        switch (a)
        {
            case Accent::DeAccent: return 0.65f;
            case Accent::Normal:   return 1.00f;
            case Accent::Accent:   return 1.27f;
        }
        return 1.0f;
    }

    /// Safety valve: a pathological division and block size combination must not spin.
    constexpr int kMaxStepsPerBlock = 4096;
}

//==============================================================================

void TrackSequencer::prepare (int trackIndex)
{
    track_ = trackIndex;
    pending_.reserve (16);
    reset();
}

void TrackSequencer::reset() noexcept
{
    originPpq_ = 0.0;
    stepsSinceOrigin_ = 0;
    anchorDivision_ = StepDivision::Sixteenth;
    started_ = false;
    stepIndex_ = 0;
    chainIndex_ = 0;
    playheadStep_ = 0;
    absoluteStep_ = 0;
    pending_.clear();
}

void TrackSequencer::reanchor (double previousStepQuarterNotes, StepDivision newDivision) noexcept
{
    originPpq_ = nextStepPpq (previousStepQuarterNotes);
    stepsSinceOrigin_ = 0;
    anchorDivision_ = newDivision;
}

void TrackSequencer::advanceHead() noexcept
{
    const auto length = std::clamp (pattern_->stepLength, 1, kStepsPerVariation);
    const auto chainLength = std::clamp (pattern_->chainLength, 1, kNumVariations);

    ++absoluteStep_;

    if (++stepIndex_ >= length)
    {
        stepIndex_ = 0;

        if (++chainIndex_ >= chainLength)
            chainIndex_ = 0;
    }
}

//==============================================================================

void TrackSequencer::consumeStep (const Groove& groove, double stepQuarterNotes,
                                  float globalSwing, double samplesPerQuarterNote)
{
    const auto& step = pattern_->stepAt (chainIndex_, stepIndex_);
    const auto drift = groove.compute (track_, absoluteStep_);

    // Swing displaces every other step against the time grid. Combining the global and
    // per-track amounts lets a single track sit against the rest of the kit.
    const auto swingAmount = std::clamp (globalSwing + pattern_->swing, -0.5f, 0.5f);
    const auto swung = (absoluteStep_ % 2 != 0)
                     ? static_cast<double> (swingAmount) * stepQuarterNotes
                     : 0.0;

    const auto nudge = static_cast<double> (std::clamp (step.microShift, -0.5f, 0.5f))
                     * stepQuarterNotes;

    const auto actualPpq = nextStepPpq (stepQuarterNotes) + swung + nudge
                         + drift.timingQuarterNotes;

    if (step.gate)
    {
        const auto subSteps = std::clamp<int> (step.subSteps, 1, kMaxSubSteps);
        const auto subSpacing = stepQuarterNotes / static_cast<double> (subSteps);

        auto velocity = static_cast<float> (step.velocity) * (1.0f / 127.0f);
        velocity *= accentScale (step.accent);

        if (pattern_->randomVelocity > 0.0f)
        {
            const auto r = groove.randomUnit (track_, absoluteStep_, kVelocitySalt);
            velocity *= 1.0f - std::clamp (pattern_->randomVelocity, 0.0f, 1.0f) * r;
        }

        velocity *= drift.levelScale;
        velocity = std::clamp (velocity, 0.0f, 1.0f);

        for (int sub = 0; sub < subSteps; ++sub)
        {
            TriggerEvent e;
            e.track = track_;
            e.ppq = actualPpq + static_cast<double> (sub) * subSpacing;
            e.velocity = velocity;
            e.accent = step.accent;
            e.note = step.note;
            e.pitchCents = drift.pitchCents;
            e.slide = step.slide;
            e.tie = step.tie;
            e.stepIndex = stepIndex_;
            e.chainIndex = chainIndex_;
            e.variation = pattern_->chain[static_cast<std::size_t> (chainIndex_)];
            e.subStep = sub;
            e.numSubSteps = subSteps;
            e.stepDurationSamples = stepQuarterNotes * samplesPerQuarterNote;
            e.locks = &step.locks;

            pending_.push_back (e);
        }
    }

    ++stepsSinceOrigin_;
    advanceHead();
}

//==============================================================================

void TrackSequencer::collectEvents (const Transport& transport, const Groove& groove,
                                    float globalSwing, std::vector<TriggerEvent>& out)
{
    if (pattern_ == nullptr || ! transport.isPlaying())
        return;

    const auto blockStart = transport.blockStartPpq();
    const auto blockEnd = transport.blockEndPpq();

    if (blockEnd <= blockStart)
        return;

    const auto division = pattern_->division;
    const auto stepQn = quarterNotesPerStep (division);

    if (stepQn <= 0.0)
        return;

    if (! started_)
    {
        originPpq_ = blockStart;
        stepsSinceOrigin_ = 0;
        anchorDivision_ = division;
        started_ = true;
    }
    else if (division != anchorDivision_)
    {
        reanchor (quarterNotesPerStep (anchorDivision_), division);
    }

    // Look far enough ahead that any step whose drift could pull it back into this block has
    // already been turned into a pending event. Manual nudge reaches half a step either way.
    const auto lookahead = groove.maxTimingDriftQuarterNotes() + 0.5 * stepQn;

    for (int guard = 0; nextStepPpq (stepQn) < blockEnd + lookahead; ++guard)
    {
        if (guard >= kMaxStepsPerBlock)
            break;

        consumeStep (groove, stepQn, globalSwing, transport.samplesPerQuarterNote());
    }

    // Emit everything that landed inside the block, keeping the rest for later blocks.
    //
    // The offset is a position in a half-open window, so it belongs to [0, blockSize) — the
    // upper bound is the largest double below blockSize, not blockSize - 1. Clamping to
    // blockSize - 1 would throw away the fractional part, and the fractional part is exactly
    // where the FEEL drift lives; at a block size of one it would erase the effect entirely.
    const auto maxOffset = std::nextafter (static_cast<double> (transport.blockSize()), 0.0);

    auto it = pending_.begin();
    while (it != pending_.end())
    {
        if (it->ppq >= blockEnd)
        {
            ++it;
            continue;
        }

        auto e = *it;

        // A trigger that drifted back past the block boundary is clamped to the block start
        // rather than dropped. The error is bounded by the drift itself — well under a
        // millisecond — and preserves the hit.
        const auto offset = transport.sampleOffsetFor (std::max (e.ppq, blockStart));
        e.sampleOffset = std::clamp (offset, 0.0, maxOffset);

        out.push_back (e);
        playheadStep_ = e.stepIndex;

        it = pending_.erase (it);
    }
}

} // namespace bud
