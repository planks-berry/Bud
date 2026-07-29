#pragma once

#include "../params/Curves.h"
#include "../params/ParameterSet.h"
#include "../sampler/SampleBank.h"
#include "../sequencer/TrackSequencer.h"

namespace bud
{

/** Base class for the voice engines.

    Voices render additively into a stereo pair so the engine can trigger one mid-buffer without
    splitting the block: it renders up to the trigger sample, calls trigger(), then renders the
    remainder into the same buffer.

    A voice must contribute *exactly nothing* once it reports itself inactive. Any recursive
    filter it owns has to be settled at that point, or the tail it emits depends on where the
    block boundary fell — which makes the same pattern render differently between hosts.
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

    /// Cut the voice short. Used by choke on tracks 5-6 (p. 66).
    virtual void choke() { reset(); }

    /// Voices that read sample content. Ignored by the synthesis voices.
    virtual void setLibrary (const SoundLibrary*) {}

    /// Voices that follow tempo — repitch- and stretch-to-tempo.
    virtual void setTempo (double) {}
};

} // namespace bud
