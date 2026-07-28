#include "DrumVoices.h"

#include <algorithm>

namespace bud
{

//==============================================================================
// Kick

void KickVoice::prepare (double sampleRate)
{
    body_.prepare (sampleRate);
    amplitude_.prepare (sampleRate);
    pitchSweep_.prepare (sampleRate);
    click_.prepare (sampleRate);
    clickFilter_.prepare (sampleRate);
    clickFilter_.setCutoff (1200.0f);
    dcBlocker_.prepare (sampleRate);

    // A fast, strongly convex sweep — the pitch must arrive at the body tone quickly or the
    // kick reads as a tom.
    pitchSweep_.setCurve (0.05f);
    click_.setCurve (0.0f);
    amplitude_.setCurve (0.22f);

    reset();
}

void KickVoice::reset()
{
    body_.reset();
    amplitude_.reset();
    pitchSweep_.reset();
    click_.reset();
    clickFilter_.reset();
    dcBlocker_.reset();
}

void KickVoice::trigger (const TriggerEvent& event, const ParamView& params,
                         float elapsedFraction)
{
    const auto tune = params (ParamKind::KickTune);
    const auto pitchRatio = semitonesToRatio (tune) * centsToRatio (event.pitchCents);

    baseFrequency_ = 50.0f * pitchRatio;
    sweepDepth_ = params (ParamKind::KickSweepDepth);
    punch_ = params (ParamKind::KickPunch);

    amplitude_.setDecayMs (params (ParamKind::KickDecay));
    pitchSweep_.setDecayMs (params (ParamKind::KickSweepTime));
    click_.setDecayMs (3.0f);

    drive_.setDrive (params (ParamKind::KickDrive));

    body_.reset (0.0);
    amplitude_.trigger (event.velocity);
    pitchSweep_.trigger (1.0f);
    click_.trigger (event.velocity * punch_);

    amplitude_.advanceFraction (elapsedFraction);
    pitchSweep_.advanceFraction (elapsedFraction);
    click_.advanceFraction (elapsedFraction);
}

void KickVoice::settle()
{
    clickFilter_.reset();
    dcBlocker_.reset();
}

void KickVoice::render (float* left, float* right, int numSamples)
{
    for (int i = 0; i < numSamples; ++i)
    {
        if (! amplitude_.isActive())
        {
            settle();
            return;
        }

        // Sweep spans up to three octaves above the body tone at full depth.
        const auto sweep = pitchSweep_.next();
        const auto frequency = baseFrequency_ * (1.0f + sweepDepth_ * 7.0f * sweep);
        body_.setFrequency (frequency);

        auto sample = body_.next() * amplitude_.next();

        const auto clickLevel = click_.next();
        if (clickLevel > 0.0f)
            sample += clickFilter_.process (noise_.next()) * clickLevel * 0.6f;

        sample = dcBlocker_.process (drive_.process (sample));

        left[i] += sample;
        right[i] += sample;
    }
}

//==============================================================================
// Snare

void SnareVoice::prepare (double sampleRate)
{
    tone1_.prepare (sampleRate);
    tone2_.prepare (sampleRate);
    toneEnv_.prepare (sampleRate);
    noiseEnv_.prepare (sampleRate);
    noiseBand_.prepare (sampleRate);
    noiseHighPass_.prepare (sampleRate);
    dcBlocker_.prepare (sampleRate);

    noiseBand_.setMode (dsp::StateVariableFilter::Mode::BandPass);
    noiseBand_.setCutoff (3200.0f);
    noiseBand_.setResonance (0.25f);
    noiseHighPass_.setCutoff (400.0f);

    toneEnv_.setCurve (0.18f);
    noiseEnv_.setCurve (0.3f);

    reset();
}

void SnareVoice::reset()
{
    tone1_.reset();
    tone2_.reset();
    toneEnv_.reset();
    noiseEnv_.reset();
    noiseBand_.reset();
    noiseHighPass_.reset();
    dcBlocker_.reset();
}

void SnareVoice::trigger (const TriggerEvent& event, const ParamView& params,
                          float elapsedFraction)
{
    const auto tune = params (ParamKind::SnareTune);
    const auto ratio = semitonesToRatio (tune) * centsToRatio (event.pitchCents);

    // The two shell modes sit roughly a major sixth apart, which is what gives the snare its
    // characteristic hollow ring rather than a pitched tom thump.
    tone1_.setFrequency (185.0f * ratio);
    tone2_.setFrequency (330.0f * ratio);
    tone1_.reset (0.0);
    tone2_.reset (0.0);

    snap_ = params (ParamKind::SnareSnap);

    toneEnv_.setDecayMs (params (ParamKind::SnareDecay));
    noiseEnv_.setDecayMs (params (ParamKind::SnareNoiseDecay));
    drive_.setDrive (params (ParamKind::SnareDrive));

    toneEnv_.trigger (event.velocity);
    noiseEnv_.trigger (event.velocity);

    toneEnv_.advanceFraction (elapsedFraction);
    noiseEnv_.advanceFraction (elapsedFraction);
}

void SnareVoice::settle()
{
    noiseBand_.reset();
    noiseHighPass_.reset();
    dcBlocker_.reset();
}

void SnareVoice::render (float* left, float* right, int numSamples)
{
    const auto toneGain = (1.0f - snap_) * 0.9f;
    const auto noiseGain = snap_ * 0.9f;

    for (int i = 0; i < numSamples; ++i)
    {
        if (! isActive())
        {
            settle();
            return;
        }

        const auto tone = (tone1_.next() * 0.7f + tone2_.next() * 0.3f) * toneEnv_.next();

        const auto filtered = noiseHighPass_.process (noiseBand_.process (noise_.next()));
        const auto wires = filtered * noiseEnv_.next();

        auto sample = tone * toneGain + wires * noiseGain;
        sample = dcBlocker_.process (drive_.process (sample));

        left[i] += sample;
        right[i] += sample;
    }
}

//==============================================================================
// Hi-hat

void HiHatVoice::prepare (double sampleRate)
{
    cluster_.prepare (sampleRate);
    amplitude_.prepare (sampleRate);
    highPass_.prepare (sampleRate);
    body_.prepare (sampleRate);
    dcBlocker_.prepare (sampleRate);

    body_.setMode (dsp::StateVariableFilter::Mode::BandPass);
    body_.setResonance (0.15f);

    // Hats decay almost linearly at the start then fall away — a pure exponential sounds too
    // soft at the leading edge.
    amplitude_.setCurve (0.12f);

    reset();
}

void HiHatVoice::reset()
{
    cluster_.reset();
    amplitude_.reset();
    highPass_.reset();
    body_.reset();
    dcBlocker_.reset();
}

void HiHatVoice::trigger (const TriggerEvent& event, const ParamView& params,
                          float elapsedFraction)
{
    const auto tune = params (ParamKind::HatTune);
    const auto ratio = semitonesToRatio (tune) * centsToRatio (event.pitchCents);
    const auto character = params (ParamKind::HatCharacter);
    const auto tone = params (ParamKind::HatTone);

    cluster_.setFrequencies (317.0f * ratio, character);

    // Tone opens the high-pass from a full-bodied hat up to a thin tick.
    highPass_.setCutoff (2000.0f + tone * 7000.0f);
    body_.setCutoff (std::clamp (6000.0f + tone * 4000.0f, 200.0f, 16000.0f));

    noiseMix_ = 0.1f + character * 0.25f;

    amplitude_.setDecayMs (params (ParamKind::HatDecay));
    amplitude_.trigger (event.velocity);
    amplitude_.advanceFraction (elapsedFraction);
}

void HiHatVoice::settle()
{
    highPass_.reset();
    body_.reset();
    dcBlocker_.reset();
}

void HiHatVoice::render (float* left, float* right, int numSamples)
{
    for (int i = 0; i < numSamples; ++i)
    {
        if (! amplitude_.isActive())
        {
            settle();
            return;
        }

        auto source = cluster_.next() * (1.0f - noiseMix_) + noise_.next() * noiseMix_;

        source = highPass_.process (source);
        source = source * 0.7f + body_.process (source) * 0.3f;

        const auto sample = dcBlocker_.process (source * amplitude_.next() * 0.8f);

        left[i] += sample;
        right[i] += sample;
    }
}

} // namespace bud
