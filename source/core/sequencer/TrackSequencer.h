#pragma once

#include "../Transport.h"
#include "../Types.h"
#include "Groove.h"
#include "Pattern.h"
#include "Step.h"

#include <vector>

namespace bud
{

/** A scheduled voice trigger, positioned to a fractional sample within the current block. */
struct TriggerEvent
{
    int track = 0;

    /// Offset within the current block. Fractional — voices should honour the sub-sample part,
    /// because that fraction is where the FEEL drift lives.
    double sampleOffset = 0.0;

    /// Musical position this trigger actually landed on, drift included.
    double ppq = 0.0;

    float velocity = 1.0f;      ///< 0-1, after accent, random velocity and drift level
    Accent accent = Accent::Normal;

    int note = 0;               ///< Semitone offset for pitched voices
    float pitchCents = 0.0f;    ///< FEEL pitch drift

    bool slide = false;
    bool tie = false;

    int stepIndex = 0;
    int chainIndex = 0;
    Variation variation = Variation::A;

    int subStep = 0;            ///< 0-based index within the step's retriggers
    int numSubSteps = 1;

    /// Parameter locks for this step, or nullptr. Points into the pattern; valid for as long
    /// as the pattern outlives the event.
    const PlockMap* locks = nullptr;
};

//==============================================================================

/** One track's playback head.

    Tracks advance independently — each has its own step length, time division and rotation —
    so eleven of these run in parallel over a shared transport, producing the device's
    polymetric behaviour naturally.

    Scheduling is two-stage. Nominal step times are consumed slightly ahead of the block, then
    each is offset by swing, manual nudge and FEEL drift to produce its *actual* time and
    parked in a pending queue. Only events whose actual time lands inside the block are
    emitted. Without that lookahead, a step drifting backwards across a block boundary would
    be lost and one drifting forwards would fire twice.
*/
class TrackSequencer
{
public:
    TrackSequencer() = default;

    void prepare (int trackIndex);
    void setPattern (const TrackPattern* pattern) noexcept { pattern_ = pattern; }
    const TrackPattern* pattern() const noexcept { return pattern_; }

    /// Rewind to the start of the chain. Call on transport start.
    void reset() noexcept;

    /// Append every trigger landing inside the transport's current block.
    void collectEvents (const Transport&, const Groove&, float globalSwing,
                        std::vector<TriggerEvent>& out);

    int trackIndex()      const noexcept { return track_; }
    int currentStep()     const noexcept { return stepIndex_; }
    int currentChain()    const noexcept { return chainIndex_; }
    long long stepCount() const noexcept { return absoluteStep_; }

    /// Step position most recently played, for the UI playhead.
    int playheadStep() const noexcept { return playheadStep_; }

private:
    /// Turn the next nominal step into pending events and advance the playback head.
    void consumeStep (const Groove&, double stepQuarterNotes, float globalSwing);

    void advanceHead() noexcept;

    /// Nominal (undrifted) musical time of the next step.
    ///
    /// Derived from a step count against an anchor rather than accumulated step by step, so
    /// that divisions which are not exactly representable in binary — triplets, when they
    /// arrive — cannot accumulate error over a long performance.
    double nextStepPpq (double stepQuarterNotes) const noexcept
    {
        return originPpq_ + static_cast<double> (stepsSinceOrigin_) * stepQuarterNotes;
    }

    /// Re-pin the anchor to the current step time, so a live division change takes effect
    /// from here rather than retroactively rescaling the phrase.
    void reanchor (double previousStepQuarterNotes, StepDivision newDivision) noexcept;

    const TrackPattern* pattern_ = nullptr;
    int track_ = 0;

    double originPpq_ = 0.0;
    long long stepsSinceOrigin_ = 0;
    StepDivision anchorDivision_ = StepDivision::Sixteenth;
    bool started_ = false;

    int stepIndex_ = 0;
    int chainIndex_ = 0;
    int playheadStep_ = 0;
    long long absoluteStep_ = 0;

    std::vector<TriggerEvent> pending_;
};

} // namespace bud
