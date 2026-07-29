#pragma once

#include "../dsp/Envelope.h"
#include "../dsp/Filters.h"
#include "../dsp/Oscillators.h"
#include "../dsp/Saturation.h"
#include "Voice.h"

namespace bud
{

/** The analog-modelling bass synth — track 11 (p. 72-78).

    An acid-style voice: one oscillator into a 4-pole ladder low-pass with a decay envelope on
    the cutoff, plus overdrive. Beyond that it adds a sub-oscillator with its own octave that
    bypasses the filter and sends, and a fifth `S01` waveform that rewires the voice.

    Two behaviours carry most of the character:

    - **Glide** ties consecutive notes. A step marked for glide slides the pitch from the
      previous note and does *not* retrigger the envelopes, which is what produces a rolling
      legato line rather than separate plucks (p. 76).
    - **Accent** raises the level *and* pushes the filter envelope — on the hardware these are
      one control voltage, so they must move together (p. 74).

    `S01` changes the signal flow rather than just the waveform (p. 77): ATTACK becomes the
    saw/square mix, the filter envelope is added into the amp envelope to form a pseudo-ADR, and
    the sub becomes a square wave that *does* reach the filter and the sends.

    Knob mapping follows the table on p. 77 — SOUND waveform, TUNE, TONE sub octave, MOVE glide
    time, ATTACK filter-envelope curve (S01: oscillator mix), DECAY gate time, LEVEL sub level.
    The table on p. 62 has MOVE and ATTACK the other way round; p. 77 carries both a table and
    prose that agree with each other, so it wins.
*/
class BassVoice : public Voice
{
public:
    void prepare (double sampleRate) override;
    void reset() override;
    void trigger (const TriggerEvent&, const ParamView&, float elapsedFraction) override;
    void render (float* left, float* right, int numSamples) override;
    bool isActive() const override { return amplitude_.isActive(); }

private:
    void applyWaveform (const ParamView&);
    float currentFrequency() noexcept;

    dsp::BlepOscillator main_;
    dsp::BlepOscillator blend_;      ///< Second shape for the S01 saw/square blend
    dsp::SineOscillator sub_;
    dsp::BlepOscillator subSquare_;  ///< S01 replaces the sine sub with a square
    dsp::LadderFilter filter_;
    dsp::DecayEnvelope amplitude_;
    dsp::DecayEnvelope filterEnv_;
    dsp::Overdrive overdrive_;
    dsp::DcBlocker dcBlocker_;
    dsp::Smoother gateRamp_;

    double sampleRate_ = 48000.0;

    float targetFrequency_ = 110.0f;
    float glideFrequency_ = 110.0f;
    float glideCoefficient_ = 1.0f;
    float glideCurve_ = 0.5f;

    float baseCutoff_ = 800.0f;
    float envDepth_ = 0.5f;
    float accentAmount_ = 0.0f;
    float subLevel_ = 0.0f;
    float blendAmount_ = 0.0f;
    float level_ = 1.0f;

    bool s01Mode_ = false;
    bool useBlend_ = false;
    bool gliding_ = false;

    double gateSamples_ = 0.0;
};

} // namespace bud
