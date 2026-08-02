#pragma once

#include "../Transport.h"
#include "../Types.h"
#include "../params/ParameterSet.h"
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
    SoundBank bank = SoundBank::BD;

    /// Offset within the current block. Fractional — the sub-sample part is where the FEEL
    /// drift lives.
    double sampleOffset = 0.0;

    /// Musical position this trigger actually landed on, drift included.
    double ppq = 0.0;

    float velocity = 1.0f;      ///< 0-1, after accent, random velocity and bank scaling
    Accent accent = Accent::Normal;

    int note = 0;               ///< Semitone offset for pitched voices, transpose included
    float pitchCents = 0.0f;    ///< FEEL pitch drift; hi-hats only

    bool glide = false;
    bool tie = false;
    bool retrigger = false;

    int stepIndex = 0;
    int chainIndex = 0;
    Variation variation = Variation::A;

    int subStep = 0;            ///< Index within the step's sub-step figure
    int numSubSteps = 1;

    /// Length of one step in samples at the current tempo. Voices need it for gate time, which
    /// is a proportion of the step rather than an absolute duration.
    double stepDurationSamples = 0.0;

    /// Parameter locks for this step, or nullptr. Points into the pattern.
    const PlockMap* locks = nullptr;
};

//==============================================================================

/** One track's playback head.

    Tracks advance independently — each has its own step length, note length and rotation — so
    eleven of these run in parallel over a shared transport, which is what produces the device's
    polymetric behaviour.

    Scheduling is two-stage. Nominal step times are consumed slightly ahead of the block, then
    offset by swing, nudge and FEEL drift to produce their *actual* times and parked in a pending
    queue. Only events whose actual time lands inside the block are emitted. Without that
    lookahead, a step drifting backwards across a block boundary would be lost and one drifting
    forwards would fire twice.
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
    void collectEvents (const Transport&, const Groove&, const ParameterSet&,
                        std::vector<TriggerEvent>& out);

    int trackIndex()      const noexcept { return track_; }
    int currentStep()     const noexcept { return stepIndex_; }
    int currentChain()    const noexcept { return chainIndex_; }
    long long stepCount() const noexcept { return absoluteStep_; }

    /** Where this track's sequence has reached, for the UI playhead.

        A position rather than a record of the last hit, so a track with nothing on it still
        shows the sequence running across it, and every track advances together. Each keeps its
        own note length and step length, so a polymetric track legitimately reads differently
        from its neighbours rather than being forced into a shared column.
    */
    int playheadStep() const noexcept { return playheadStep_; }

private:
    void consumeStep (const Groove&, const ParameterSet&, double stepQuarterNotes,
                      double samplesPerQuarterNote, double tempo);

    void advanceHead (int stepLength) noexcept;

    /// Nominal (undrifted) musical time of the next step.
    ///
    /// Derived from a step count against an anchor rather than accumulated step by step. The
    /// device's note lengths include triplets and dotted values, which are not exactly
    /// representable in binary, so accumulation would drift over a long performance.
    double nextStepPpq (double stepQuarterNotes) const noexcept
    {
        return originPpq_ + static_cast<double> (stepsSinceOrigin_) * stepQuarterNotes;
    }

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
