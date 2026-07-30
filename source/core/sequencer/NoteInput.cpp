#include "NoteInput.h"

#include <algorithm>
#include <cmath>

namespace bud
{

void NoteInput::setTrack (int track) noexcept
{
    if (track == track_)
        return;

    track_ = std::clamp (track, 0, kNumTracks - 1);
    reset();
}

void NoteInput::setMode (RecordMode mode) noexcept
{
    if (mode == mode_)
        return;

    mode_ = mode;
    reset();   // a half-entered tie or a held step does not survive a mode change
}

void NoteInput::reset() noexcept
{
    heldStep_ = -1;
    tieStart_ = -1;
}

void NoteInput::setCursor (int step) noexcept
{
    cursor_ = std::clamp (step, 0, stepLength() - 1);
}

//==============================================================================

TrackPattern* NoteInput::trackPattern() const noexcept
{
    return pattern_ != nullptr ? &pattern_->track (track_) : nullptr;
}

int NoteInput::stepLength() const noexcept
{
    if (parameters_ == nullptr)
        return kStepsPerVariation;

    return std::clamp (parameters_->get (ParamKind::TrackStepLength, track_),
                       1, kStepsPerVariation);
}

Step* NoteInput::stepAt (int index) const noexcept
{
    auto* track = trackPattern();

    if (track == nullptr || index < 0 || index >= stepLength())
        return nullptr;

    return &track->variation (variation_)[static_cast<std::size_t> (index)];
}

int NoteInput::stepForPpq (double ppq) const noexcept
{
    const auto division = parameters_ != nullptr
        ? static_cast<StepDivision> (std::clamp (
              parameters_->get (ParamKind::TrackNoteLength, track_), 0, kNumStepDivisions - 1))
        : StepDivision::Sixteenth;

    const auto perStep = quarterNotesPerStep (division);

    if (perStep <= 0.0)
        return 0;

    const auto length = stepLength();

    // Rounded, not truncated: a note played a hair early belongs to the step it was aiming at,
    // and truncating would push every slightly-early note back a whole step.
    auto index = static_cast<long long> (std::llround (ppq / perStep));

    index %= length;

    if (index < 0)
        index += length;

    return static_cast<int> (index);
}

void NoteInput::writeNote (int stepIndex, int note, int velocity)
{
    auto* step = stepAt (stepIndex);

    if (step == nullptr)
        return;

    step->gate = true;
    step->note = static_cast<std::int8_t> (std::clamp (note, -128, 127));
    step->velocity = static_cast<std::uint8_t> (std::clamp (velocity, 0, 127));

    // Parameter locks are deliberately left alone — p. 37 says so for step clearing, and the
    // same reasoning holds here: a lock belongs to the step, not to the note occupying it.
}

//==============================================================================

void NoteInput::stepPressed (int step)
{
    if (pattern_ == nullptr || step < 0 || step >= stepLength())
        return;

    switch (mode_)
    {
        case RecordMode::Direct:
        {
            // p. 37: pressing a step toggles a note there.
            auto* target = stepAt (step);

            if (target == nullptr)
                return;

            if (target->gate)
            {
                // Clearing removes the note and its sub-steps, but keeps the parameter locks —
                // the manual calls this out explicitly (p. 37).
                target->gate = false;
                target->subStep = SubStepPattern::Off;
                target->tie = false;
                target->retrigger = false;
            }
            else
            {
                target->gate = true;
            }

            break;
        }

        case RecordMode::Step:
        {
            // p. 39: with a key held, pressing a second step ties the run between them. Otherwise
            // the press just moves the cursor (p. 38: "You can directly specify the step for note
            // input by pressing the step").
            if (tieStart_ >= 0 && tieStart_ != step)
            {
                tieRange (tieStart_, step, tieNote_, tieVelocity_);
                tieStart_ = -1;
            }

            cursor_ = step;
            break;
        }

        case RecordMode::Keyboard:
            // p. 41: hold the step, then play the note. Held until released.
            heldStep_ = step;
            break;

        case RecordMode::RealTime:
            break;
    }
}

void NoteInput::stepReleased (int step)
{
    if (mode_ == RecordMode::Keyboard && heldStep_ == step)
        heldStep_ = -1;
}

void NoteInput::keyPressed (int note, int velocity, double ppq)
{
    if (pattern_ == nullptr)
        return;

    switch (mode_)
    {
        case RecordMode::Direct:
            break;   // notes come from the step keys here, not the keyboard

        case RecordMode::Step:
        {
            writeNote (cursor_, note, velocity);

            // Remember where this key went down so a tie can be closed on release or by a second
            // step press (p. 39).
            tieStart_ = cursor_;
            tieNote_ = note;
            tieVelocity_ = velocity;

            if (autoStep_)
            {
                cursor_ = cursor_ + 1;

                if (cursor_ >= stepLength())
                    cursor_ = 0;

                // The cursor has moved on, so a tie can no longer be closed against where the
                // note was written; auto-step and tie entry are alternatives, not companions.
                tieStart_ = -1;
            }

            break;
        }

        case RecordMode::RealTime:
            // p. 40: play along and the note lands on the step it falls nearest.
            writeNote (stepForPpq (ppq), note, velocity);
            break;

        case RecordMode::Keyboard:
            // p. 41: "Notes can also be input if procedures 2 and 3 are done in reverse order",
            // so a note with no step held is simply not an input event rather than an error.
            if (heldStep_ >= 0)
                writeNote (heldStep_, note, velocity);

            break;
    }
}

void NoteInput::keyReleased (int note)
{
    if (mode_ != RecordMode::Step || tieStart_ < 0)
        return;

    // A key released without a second step press leaves a single note, which is already written.
    (void) note;
    tieStart_ = -1;
}

//==============================================================================

bool NoteInput::tieRange (int fromStep, int toStep, int note, int velocity)
{
    // p. 39: "Tied note input is supported only on Track 10 and Track 11."
    if (! trackSupportsTies (track_) || pattern_ == nullptr)
        return false;

    const auto length = stepLength();

    if (fromStep < 0 || toStep < 0 || fromStep >= length || toStep >= length)
        return false;

    const auto first = std::min (fromStep, toStep);
    const auto last = std::max (fromStep, toStep);

    writeNote (first, note, velocity);

    // Every step from the first up to but not including the last holds through to the next; the
    // last one ends the note, so it is gated but does not tie onward. The manual's example runs
    // from step 2 to step 5 and sounds as one note across all four.
    for (int index = first; index < last; ++index)
    {
        auto* step = stepAt (index);

        if (step == nullptr)
            return false;

        step->gate = true;
        step->note = static_cast<std::int8_t> (std::clamp (note, -128, 127));
        step->velocity = static_cast<std::uint8_t> (std::clamp (velocity, 0, 127));
        step->tie = true;
    }

    auto* end = stepAt (last);

    if (end == nullptr)
        return false;

    end->gate = true;
    end->note = static_cast<std::int8_t> (std::clamp (note, -128, 127));
    end->velocity = static_cast<std::uint8_t> (std::clamp (velocity, 0, 127));
    end->tie = false;

    return true;
}

} // namespace bud
