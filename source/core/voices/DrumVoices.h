#pragma once

#include "../dsp/Envelope.h"
#include "../dsp/Filters.h"
#include "../dsp/Noise.h"
#include "../dsp/Oscillators.h"
#include "../dsp/Saturation.h"
#include "Voice.h"

namespace bud
{

/** Bass drum synthesis (track 1).

    A sine body whose pitch falls from a swept starting point into a fixed tone, plus a
    transient. That pitch sweep is the entire character of an analog kick: sweep depth sets
    how far above the tone it starts, sweep time how quickly it arrives.
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
    /// Clear the filter state once the note has finished.
    ///
    /// A voice must contribute exactly nothing after its envelope ends. The filters here are
    /// recursive, so continuing to run them past that point emits a decaying tail whose length
    /// depends on where the block boundary happened to fall — which makes the rendered audio
    /// differ between hosts, and leaves different state behind for the next trigger.
    void settle();

    dsp::SineOscillator body_;
    dsp::DecayEnvelope amplitude_;
    dsp::DecayEnvelope pitchSweep_;
    dsp::DecayEnvelope click_;
    dsp::Noise noise_ { 0x4b1c'6d01u };
    dsp::OnePoleHighPass clickFilter_;
    dsp::Overdrive drive_;
    dsp::DcBlocker dcBlocker_;

    float baseFrequency_ = 50.0f;
    float sweepDepth_ = 0.6f;
    float punch_ = 0.4f;
};

//==============================================================================

/** Snare synthesis (track 3).

    Two detuned tone oscillators for the drum shell plus band-passed noise for the wires, with
    independent decays. `snap` balances the two, which is the control that moves the sound
    between a thick rimshot and a tight crack.
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
    void settle();   ///< See KickVoice::settle

    dsp::SineOscillator tone1_;
    dsp::SineOscillator tone2_;
    dsp::DecayEnvelope toneEnv_;
    dsp::DecayEnvelope noiseEnv_;
    dsp::Noise noise_ { 0x77e3'22a5u };
    dsp::StateVariableFilter noiseBand_;
    dsp::OnePoleHighPass noiseHighPass_;
    dsp::Overdrive drive_;
    dsp::DcBlocker dcBlocker_;

    float snap_ = 0.5f;
};

//==============================================================================

/** Hi-hat model (tracks 5 and 6).

    A cluster of inharmonically related squares through a high-pass — the structure of the
    classic analog hat circuit. `character` spreads the oscillator ratios, which is where the
    tonal variation between individual units comes from, and `tone` moves the high-pass corner.
*/
class HiHatVoice : public Voice
{
public:
    void prepare (double sampleRate) override;
    void reset() override;
    void trigger (const TriggerEvent&, const ParamView&, float elapsedFraction) override;
    void render (float* left, float* right, int numSamples) override;
    bool isActive() const override { return amplitude_.isActive(); }

private:
    void settle();   ///< See KickVoice::settle

    dsp::SquareCluster cluster_;
    dsp::DecayEnvelope amplitude_;
    dsp::OnePoleHighPass highPass_;
    dsp::StateVariableFilter body_;
    dsp::Noise noise_ { 0x2f9a'1183u };
    dsp::DcBlocker dcBlocker_;

    float noiseMix_ = 0.2f;
};

} // namespace bud
