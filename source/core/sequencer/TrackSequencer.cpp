#include "TrackSequencer.h"

#include "../params/Curves.h"

#include <algorithm>
#include <cmath>

namespace bud
{

namespace
{
    constexpr std::uint32_t kVelocitySalt = 0x2545'f491u;

    /// Safety valve: a pathological division and block size combination must not spin.
    constexpr int kMaxStepsPerBlock = 4096;

    /// Steps spanned by one swing unit. At 8TH resolution the unit is twice the note length
    /// (p. 51), so the pair to swing against is twice as wide.
    constexpr int swingUnitSteps (SwingResolution r) noexcept
    {
        return r == SwingResolution::Eighth ? 2 : 1;
    }
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

void TrackSequencer::advanceHead (int stepLength) noexcept
{
    const auto length = std::clamp (stepLength, 1, kStepsPerVariation);
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

void TrackSequencer::consumeStep (const Groove& groove, const ParameterSet& parameters,
                                  double stepQuarterNotes, double samplesPerQuarterNote,
                                  double tempo)
{
    const auto stepLength = parameters.get (ParamKind::TrackStepLength, track_);
    const auto& step = pattern_->stepAt (chainIndex_, stepIndex_, stepLength);

    // Read this step's parameters through its locks, so a locked nudge or sound moves with the
    // step exactly as an unlocked one would.
    const ParamView view { &parameters, track_, &step.locks };

    const auto bank = view.enumValue<SoundBank> (ParamKind::TrackSoundBank);
    const auto drift = groove.compute (bank, track_, absoluteStep_);

    // ---- swing ---------------------------------------------------------------
    // A track either follows the pattern swing or overrides it (p. 51); the control shows PTN
    // below 50.
    const auto trackSwing = parameters.get (ParamKind::TrackSwing, track_);
    const auto swingPercent = trackSwing >= 50 ? trackSwing
                                               : parameters.get (ParamKind::Swing);

    const auto resolution = static_cast<SwingResolution> (
        parameters.get (ParamKind::SwingResolution));
    const auto unitSteps = swingUnitSteps (resolution);
    const auto pairSteps = unitSteps * 2;

    // Swing warps position within the pair rather than displacing its second half rigidly, so
    // every step inside a swung unit moves proportionally and none collides with the next.
    const auto positionInPair = static_cast<float> (absoluteStep_ % pairSteps)
                              / static_cast<float> (pairSteps);

    const auto warped = curves::swingWarp (positionInPair, curves::swingFraction (swingPercent));
    const auto pairQuarterNotes = static_cast<double> (pairSteps) * stepQuarterNotes;
    const auto swung = static_cast<double> (warped - positionInPair) * pairQuarterNotes;

    // ---- nudge ---------------------------------------------------------------
    // MOVE acts as Nudge on the snare and the general drum banks, delaying the trigger slightly
    // (p. 65). Being a timing offset it belongs here rather than in the voice.
    auto nudgeQn = 0.0;

    if (moveIsNudge (bank))
        nudgeQn = static_cast<double> (curves::nudgeMs (view (ParamKind::TrackMove)))
                * tempo / 60000.0;

    const auto actualPpq = nextStepPpq (stepQuarterNotes) + swung + nudgeQn
                         + drift.timingQuarterNotes;

    if (step.gate)
    {
        const auto& figure = subStepInfo (step.subStep);
        const auto divisions = std::max<int> (1, figure.divisions);
        const auto spacing = stepQuarterNotes / static_cast<double> (divisions);

        // ---- velocity --------------------------------------------------------
        auto velocity = static_cast<float> (step.velocity) * (1.0f / 127.0f);

        switch (step.accent)
        {
            case Accent::Hard:
                velocity *= curves::hardAccentScale (parameters.get (ParamKind::AccentHardDepth));
                break;
            case Accent::Soft:
                velocity *= curves::softAccentScale (parameters.get (ParamKind::AccentSoftDepth));
                break;
            case Accent::Normal:
                break;
        }

        // Random velocity is scaled by the bank's depth class (p. 61).
        const auto randomAmount = curves::unit (view (ParamKind::TrackRandomVelocity))
                                * curves::randomVelocityCeiling (bankInfo (bank).random);

        if (randomAmount > 0.0f)
            velocity *= 1.0f - randomAmount
                             * groove.randomUnit (track_, absoluteStep_, kVelocitySalt);

        velocity = std::clamp (velocity, 0.0f, 1.0f);

        const auto transpose = parameters.get (ParamKind::Transpose);

        for (int index = 0; index < divisions; ++index)
        {
            if ((figure.mask & (1u << index)) == 0)
                continue;

            TriggerEvent e;
            e.track = track_;
            e.bank = bank;
            e.ppq = actualPpq + static_cast<double> (index) * spacing;
            e.velocity = velocity;
            e.accent = step.accent;
            e.note = step.note + transpose;
            e.pitchCents = drift.pitchCents;
            e.glide = step.glide;
            e.tie = step.tie;
            e.retrigger = step.retrigger;
            e.stepIndex = stepIndex_;
            e.chainIndex = chainIndex_;
            e.variation = pattern_->chain[static_cast<std::size_t> (chainIndex_)];
            e.subStep = index;
            e.numSubSteps = divisions;
            e.stepDurationSamples = stepQuarterNotes * samplesPerQuarterNote;
            e.locks = &step.locks;

            pending_.push_back (e);
        }
    }

    ++stepsSinceOrigin_;
    advanceHead (stepLength);
}

//==============================================================================

void TrackSequencer::collectEvents (const Transport& transport, const Groove& groove,
                                    const ParameterSet& parameters,
                                    std::vector<TriggerEvent>& out)
{
    if (pattern_ == nullptr || ! transport.isPlaying())
        return;

    const auto blockStart = transport.blockStartPpq();
    const auto blockEnd = transport.blockEndPpq();

    if (blockEnd <= blockStart)
        return;

    const auto division = static_cast<StepDivision> (
        std::clamp (parameters.get (ParamKind::TrackNoteLength, track_), 0, kNumStepDivisions - 1));

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

    // Look far enough ahead that any step whose drift or swing could pull it into this block has
    // already become a pending event.
    const auto lookahead = groove.maxTimingDriftQuarterNotes() + stepQn;

    for (int guard = 0; nextStepPpq (stepQn) < blockEnd + lookahead; ++guard)
    {
        if (guard >= kMaxStepsPerBlock)
            break;

        consumeStep (groove, parameters, stepQn, transport.samplesPerQuarterNote(),
                     transport.tempo());
    }

    // Emit everything that landed inside the block, keeping the rest for later blocks.
    //
    // The offset is a position in a half-open window, so it belongs to [0, blockSize) — the
    // upper bound is the largest double below blockSize, not blockSize - 1. Clamping to
    // blockSize - 1 would discard the fractional part, which is exactly where the drift lives.
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
        // rather than dropped. The error is bounded by the drift itself and preserves the hit.
        const auto offset = transport.sampleOffsetFor (std::max (e.ppq, blockStart));
        e.sampleOffset = std::clamp (offset, 0.0, maxOffset);

        out.push_back (e);
        playheadStep_ = e.stepIndex;

        it = pending_.erase (it);
    }
}

} // namespace bud
