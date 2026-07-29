#include "DrumVoices.h"

#include <algorithm>

namespace bud
{

//==============================================================================
// Kick — BD bank, track 1

void KickVoice::prepare (double sampleRate)
{
    body_.prepare (sampleRate);
    amplitude_.prepare (sampleRate);
    pitchSweep_.prepare (sampleRate);
    pulse_.prepare (sampleRate);
    pulseFilter_.prepare (sampleRate);
    pulseFilter_.setCutoff (1200.0f);
    toneFilter_.prepare (sampleRate);
    toneFilter_.setMode (dsp::StateVariableFilter::Mode::LowPass);
    toneFilter_.setResonance (0.1f);
    dcBlocker_.prepare (sampleRate);

    // A fast, strongly convex sweep — the pitch has to reach the body tone quickly or the kick
    // reads as a tom.
    pitchSweep_.setCurve (0.05f);
    pulse_.setCurve (0.0f);
    amplitude_.setCurve (0.22f);

    reset();
}

void KickVoice::reset()
{
    body_.reset();
    amplitude_.reset();
    pitchSweep_.reset();
    pulse_.reset();
    settle();
}

void KickVoice::settle()
{
    pulseFilter_.reset();
    toneFilter_.reset();
    dcBlocker_.reset();
}

void KickVoice::trigger (const TriggerEvent& event, const ParamView& params,
                         float elapsedFraction)
{
    const auto tune = curves::tuneSemitones (params (ParamKind::TrackTune))
                    + static_cast<float> (event.note);

    baseFrequency_ = 50.0f * curves::semitonesToRatio (tune)
                           * curves::centsToRatio (event.pitchCents);

    // TONE opens a low-pass across the body: higher values give a brighter, harder kick.
    toneFilter_.setCutoff (curves::timeMs (params (ParamKind::TrackTone), 400.0f, 16000.0f));

    pulseMix_ = params.unit (ParamKind::TrackAttack);

    amplitude_.setDecayMs (params.timeMs (ParamKind::TrackDecay, 40.0f, 1800.0f));
    pitchSweep_.setDecayMs (params.timeMs (ParamKind::TrackMove, 2.0f, 220.0f));
    pulse_.setDecayMs (3.0f);

    body_.reset (0.0);
    amplitude_.trigger (event.velocity);
    pitchSweep_.trigger (1.0f);
    pulse_.trigger (event.velocity * pulseMix_);

    amplitude_.advanceFraction (elapsedFraction);
    pitchSweep_.advanceFraction (elapsedFraction);
    pulse_.advanceFraction (elapsedFraction);
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

        // The sweep spans up to three octaves above the body tone.
        const auto sweep = pitchSweep_.next();
        body_.setFrequency (baseFrequency_ * (1.0f + 7.0f * sweep));

        auto sample = toneFilter_.process (body_.next()) * amplitude_.next();

        const auto pulseLevel = pulse_.next();
        if (pulseLevel > 0.0f)
            sample += pulseFilter_.process (noise_.next()) * pulseLevel * 0.6f;

        sample = dcBlocker_.process (sample);

        left[i] += sample;
        right[i] += sample;
    }
}

//==============================================================================
// Snare — SD bank, track 3

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
    settle();
}

void SnareVoice::settle()
{
    noiseBand_.reset();
    noiseHighPass_.reset();
    dcBlocker_.reset();
}

void SnareVoice::applySnappyType (SnappyType type)
{
    // The six snappy types are different noise characters (p. 65). Centre frequency and
    // resonance of the band-pass carry most of the difference.
    switch (type)
    {
        case SnappyType::N88:   noiseBand_.setCutoff (2600.0f); noiseResonance_ = 0.20f; break;
        case SnappyType::N99:   noiseBand_.setCutoff (3400.0f); noiseResonance_ = 0.28f; break;
        case SnappyType::NT1:   noiseBand_.setCutoff (5200.0f); noiseResonance_ = 0.08f; break;
        case SnappyType::NT2:   noiseBand_.setCutoff (2100.0f); noiseResonance_ = 0.70f; break;
        case SnappyType::NT3:   noiseBand_.setCutoff (4000.0f); noiseResonance_ = 0.15f; break;
        case SnappyType::NT4:   noiseBand_.setCutoff (1500.0f); noiseResonance_ = 0.55f; break;
    }

    noiseBand_.setResonance (noiseResonance_);
}

void SnareVoice::trigger (const TriggerEvent& event, const ParamView& params,
                          float elapsedFraction)
{
    const auto tune = curves::tuneSemitones (params (ParamKind::TrackTune))
                    + static_cast<float> (event.note);
    const auto ratio = curves::semitonesToRatio (tune)
                     * curves::centsToRatio (event.pitchCents);

    // The two shell modes sit roughly a major sixth apart, which gives the snare its hollow
    // ring rather than a pitched thump.
    tone1_.setFrequency (185.0f * ratio);
    tone2_.setFrequency (330.0f * ratio);
    tone1_.reset (0.0);
    tone2_.reset (0.0);

    applySnappyType (params.enumValue<SnappyType> (ParamKind::TrackSnappyType));

    snappyVolume_ = params.unit (ParamKind::TrackTone);
    overtoneMix_ = params.unit (ParamKind::TrackAttack);

    const auto snappyDecay = params.timeMs (ParamKind::TrackDecay, 20.0f, 1200.0f);
    noiseEnv_.setDecayMs (snappyDecay);

    // The shell rings a little shorter than the wires.
    toneEnv_.setDecayMs (snappyDecay * 0.75f);

    toneEnv_.trigger (event.velocity);
    noiseEnv_.trigger (event.velocity);

    toneEnv_.advanceFraction (elapsedFraction);
    noiseEnv_.advanceFraction (elapsedFraction);
}

void SnareVoice::render (float* left, float* right, int numSamples)
{
    for (int i = 0; i < numSamples; ++i)
    {
        if (! isActive())
        {
            settle();
            return;
        }

        const auto shell = (tone1_.next() * (1.0f - overtoneMix_ * 0.5f)
                            + tone2_.next() * (0.25f + overtoneMix_ * 0.6f))
                         * toneEnv_.next();

        const auto wires = noiseHighPass_.process (noiseBand_.process (noise_.next()))
                         * noiseEnv_.next();

        auto sample = shell * 0.7f + wires * snappyVolume_ * 1.1f;
        sample = dcBlocker_.process (sample);

        left[i] += sample;
        right[i] += sample;
    }
}

} // namespace bud
