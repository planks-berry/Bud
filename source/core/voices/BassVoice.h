#pragma once

#include "../dsp/Envelope.h"
#include "../dsp/Filters.h"
#include "../dsp/Oscillators.h"
#include "../dsp/Saturation.h"
#include "Voice.h"

namespace bud
{

/** The analog-modelling bass synth (track 11).

    Monophonic, in the 303 lineage: one oscillator into a 4-pole ladder low-pass with a
    decay envelope on the cutoff, plus overdrive. Beyond that lineage the modelled device adds
    a sine sub oscillator with its own octave and a filter bypass, a fifth `S01` waveform that
    blends continuously between saw and square, and curve controls on both the glide and the
    decay.

    Two behaviours carry most of the character and are easy to get wrong:

    - **Slide** ties consecutive notes. A slid step glides the pitch from the previous note
      and does *not* retrigger the envelopes, which is what produces the rolling legato line
      rather than a series of separate plucks.
    - **Accent** raises the level *and* pushes the filter envelope, so accented notes open up
      rather than merely getting louder.
*/
class BassVoice : public Voice
{
public:
    void prepare (double sampleRate) override;
    void reset() override;
    void trigger (const TriggerEvent&, const ParamView&, float elapsedFraction) override;
    void render (float* left, float* right, int numSamples) override;
    bool isActive() const override { return amplitude_.isActive() || gateSamples_ > 0.0; }
    void release() override;

private:
    void applyWaveform (const ParamView&);
    float currentFrequency() noexcept;

    dsp::BlepOscillator main_;
    dsp::BlepOscillator blend_;      ///< Second shape for the S01 saw/square blend
    dsp::SineOscillator sub_;
    dsp::LadderFilter filter_;
    dsp::DecayEnvelope amplitude_;
    dsp::DecayEnvelope filterEnv_;
    dsp::Overdrive overdrive_;
    dsp::DcBlocker dcBlocker_;
    dsp::Smoother releaseRamp_;

    double sampleRate_ = 48000.0;

    float targetFrequency_ = 110.0f;
    float glideFrequency_ = 110.0f;
    float glideCoefficient_ = 1.0f;
    float glideCurve_ = 0.5f;

    float baseCutoff_ = 800.0f;
    float envModAmount_ = 0.5f;
    float accentAmount_ = 0.0f;
    float subLevel_ = 0.0f;
    float blendAmount_ = 0.0f;
    float level_ = 1.0f;

    bool useBlend_ = false;
    bool subBypassesFilter_ = false;
    bool gliding_ = false;

    double gateSamples_ = 0.0;
};

} // namespace bud
