#pragma once

#include "../dsp/Envelope.h"
#include "../dsp/Filters.h"
#include "../dsp/Noise.h"
#include "../dsp/Oscillators.h"
#include "../dsp/Saturation.h"
#include "Voice.h"

namespace bud
{

/** Bass drum synthesis — the BD bank on track 1 (p. 60, 63).

    One of only two voices on the instrument that synthesises rather than plays a sample. A sine
    body whose pitch falls from a swept starting point into a fixed tone, plus an attack pulse.
    That pitch sweep is the whole character of an analog kick.

    Knob mapping (p. 63): TONE is tone, MOVE the modulation time, ATTACK the attack-pulse mix,
    DECAY the envelope decay.
*/
class KickVoice : public Voice
{
public:
    void prepare (double sampleRate) override;
    void reset() override;
    void trigger (const TriggerEvent&, const ParamView&, float elapsedFraction) override;
    void render (float* left, float* right, int numSamples) override;
    bool isActive() const override { return amplitude_.isActive(); }

private:
    void settle();

    dsp::SineOscillator body_;
    dsp::DecayEnvelope amplitude_;
    dsp::DecayEnvelope pitchSweep_;
    dsp::DecayEnvelope pulse_;
    dsp::Noise noise_ { 0x4b1c'6d01u };
    dsp::OnePoleHighPass pulseFilter_;
    dsp::StateVariableFilter toneFilter_;
    dsp::DcBlocker dcBlocker_;

    float baseFrequency_ = 50.0f;
    float pulseMix_ = 0.3f;
};

//==============================================================================

/** Snare synthesis — the SD bank on track 3 (p. 60, 64).

    Two shell modes plus band-passed noise for the wires, with independent decays. Knob mapping
    (p. 64): TONE is the snappy volume, `func`+TONE the snappy type, MOVE the nudge (handled by
    the sequencer), ATTACK the overtone mix, DECAY the snappy decay.
*/
class SnareVoice : public Voice
{
public:
    void prepare (double sampleRate) override;
    void reset() override;
    void trigger (const TriggerEvent&, const ParamView&, float elapsedFraction) override;
    void render (float* left, float* right, int numSamples) override;
    bool isActive() const override { return toneEnv_.isActive() || noiseEnv_.isActive(); }

private:
    void settle();
    void applySnappyType (SnappyType);

    dsp::SineOscillator tone1_;
    dsp::SineOscillator tone2_;
    dsp::DecayEnvelope toneEnv_;
    dsp::DecayEnvelope noiseEnv_;
    dsp::Noise noise_ { 0x77e3'22a5u };
    dsp::StateVariableFilter noiseBand_;
    dsp::OnePoleHighPass noiseHighPass_;
    dsp::DcBlocker dcBlocker_;

    float snappyVolume_ = 0.5f;
    float overtoneMix_ = 0.3f;
    float noiseResonance_ = 0.25f;
};

} // namespace bud
