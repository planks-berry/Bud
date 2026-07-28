#pragma once

#include "../params/ParameterSet.h"
#include "../sequencer/TrackSequencer.h"

namespace bud
{

/** Base class for the six voice engines.

    Voices render additively into a stereo pair so the engine can trigger one mid-buffer
    without splitting the block: it renders up to the trigger sample, calls trigger(), then
    renders the remainder into the same buffer.
*/
class Voice
{
public:
    virtual ~Voice() = default;

    virtual void prepare (double sampleRate) = 0;
    virtual void reset() = 0;

    /** Start a note.

        @param event            the scheduled trigger
        @param params           track parameters with this step's locks applied
        @param elapsedFraction  time in samples that had already passed when rendering starts,
                                in [0, 1) — see DecayEnvelope::advanceFraction
    */
    virtual void trigger (const TriggerEvent& event, const ParamView& params,
                          float elapsedFraction) = 0;

    /// Add `numSamples` of output. Must not clear the destination.
    virtual void render (float* left, float* right, int numSamples) = 0;

    virtual bool isActive() const = 0;

    /// Voices that hold a note until released (currently only the bass synth).
    virtual void release() {}

protected:
    /// Semitones to a frequency ratio.
    static float semitonesToRatio (float semitones) noexcept
    {
        return std::pow (2.0f, semitones * (1.0f / 12.0f));
    }

    /// Cents to a frequency ratio, for FEEL pitch drift.
    static float centsToRatio (float cents) noexcept
    {
        return std::pow (2.0f, cents * (1.0f / 1200.0f));
    }
};

} // namespace bud
