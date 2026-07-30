#pragma once

#include "../params/ParameterSet.h"
#include "Pattern.h"

namespace bud
{

/** The four ways a sequence is entered (p. 37-42).

    They differ in what a key press means and when it applies, not in what they produce — all
    four write the same steps.

    - `Direct` (p. 37) — press a step key to toggle a note on that step. Works stopped or
      playing, and is the fastest way to sketch a drum part.
    - `Step` (p. 38-39) — a cursor sits on a step; playing a key writes there. With `AT.STEP` on
      the cursor advances on each press, so a phrase can be typed in without touching the steps.
    - `RealTime` (p. 40) — play along while the pattern runs and notes land on the nearest step.
    - `Keyboard` (p. 41) — hold a step key and play a note, in either order (p. 41 is explicit
      that the order does not matter).
*/
enum class RecordMode
{
    Direct,
    Step,
    RealTime,
    Keyboard
};

inline constexpr int kNumRecordModes = 4;

//==============================================================================

/** Turns key presses into step edits.

    Kept apart from the sequencer, which only reads the pattern: editing and playback are
    genuinely separate jobs, and a model that does only editing can be tested without a transport
    running. The interface is deliberately in device terms — `stepPressed`, `keyPressed` — so the
    panel can forward events without deciding what they mean.
*/
class NoteInput
{
public:
    void setPattern (Pattern* pattern) noexcept { pattern_ = pattern; }
    void setParameters (const ParameterSet* parameters) noexcept { parameters_ = parameters; }

    void setTrack (int track) noexcept;
    int track() const noexcept { return track_; }

    void setVariation (Variation v) noexcept { variation_ = v; }
    Variation variation() const noexcept { return variation_; }

    void setMode (RecordMode mode) noexcept;
    RecordMode mode() const noexcept { return mode_; }

    /// `AT.STEP` (p. 38). Only affects `Step` mode.
    void setAutoStep (bool on) noexcept { autoStep_ = on; }
    bool autoStep() const noexcept { return autoStep_; }

    /// Where step recording will write next.
    int cursor() const noexcept { return cursor_; }
    void setCursor (int step) noexcept;

    //==========================================================================
    // Input events

    /** A step key went down.

        In `Direct` mode this toggles the step (p. 37). In `Step` mode it moves the cursor there.
        In `Keyboard` mode it is held, so a note played while it is down lands on it (p. 41).
    */
    void stepPressed (int step);

    /// A step key came up. Only `Keyboard` mode cares.
    void stepReleased (int step);

    /** A key on the keyboard went down.

        @param note      semitone offset, as stored in a step
        @param velocity  0-127
        @param ppq       musical position, for `RealTime`; ignored by the other modes
    */
    void keyPressed (int note, int velocity = 100, double ppq = 0.0);

    /** A key came up.

        In `Step` mode on the loop and bass tracks this is what closes a tied note: the steps
        between where the key went down and where it came up are joined (p. 39).
    */
    void keyReleased (int note);

    /// Clear whatever is half-entered, e.g. when leaving a recording mode.
    void reset() noexcept;

    //==========================================================================

    /** Tie a run of steps together, as holding a key across them does (p. 39).

        Supported only on the loop and bass tracks — the manual is explicit — so a call naming
        any other track does nothing and returns false.
    */
    bool tieRange (int fromStep, int toStep, int note, int velocity = 100);

    /// The step a musical position falls on, rounded to the nearest rather than truncated.
    int stepForPpq (double ppq) const noexcept;

private:
    TrackPattern* trackPattern() const noexcept;
    Step* stepAt (int index) const noexcept;

    /// How many steps this track's sequence is long, from the parameter set.
    int stepLength() const noexcept;

    /// Write a note into a step, leaving its parameter locks alone.
    void writeNote (int stepIndex, int note, int velocity);

    Pattern* pattern_ = nullptr;
    const ParameterSet* parameters_ = nullptr;

    int track_ = 0;
    Variation variation_ = Variation::A;
    RecordMode mode_ = RecordMode::Direct;
    bool autoStep_ = false;

    int cursor_ = 0;

    /// The step key currently held, for Keyboard mode. -1 when none.
    int heldStep_ = -1;

    /// Where a held key started, for tie entry in Step mode. -1 when no key is down.
    int tieStart_ = -1;
    int tieNote_ = 0;
    int tieVelocity_ = 100;
};

} // namespace bud
