#include "BassVoice.h"

#include <algorithm>
#include <cmath>

namespace bud
{

namespace
{
    /// Middle of the bass register; step notes are semitone offsets from here.
    constexpr float kRootFrequency = 55.0f;   // A1

    /// Waveform indices, matching the BassWave label list.
    enum WaveIndex { Saw = 0, Square = 1, Triangle = 2, Rectangle = 3, S01 = 4 };
}

//==============================================================================

void BassVoice::prepare (double sampleRate)
{
    sampleRate_ = std::max (1.0, sampleRate);

    main_.prepare (sampleRate_);
    blend_.prepare (sampleRate_);
    sub_.prepare (sampleRate_);
    filter_.prepare (sampleRate_);
    amplitude_.prepare (sampleRate_);
    filterEnv_.prepare (sampleRate_);
    dcBlocker_.prepare (sampleRate_);
    releaseRamp_.prepare (sampleRate_, 4.0f);

    reset();
}

void BassVoice::reset()
{
    main_.reset();
    blend_.reset();
    sub_.reset();
    filter_.reset();
    amplitude_.reset();
    filterEnv_.reset();
    dcBlocker_.reset();
    releaseRamp_.snapTo (0.0f);

    gliding_ = false;
    gateSamples_ = 0.0;
    glideFrequency_ = kRootFrequency;
    targetFrequency_ = kRootFrequency;
}

void BassVoice::applyWaveform (const ParamView& params)
{
    using Shape = dsp::BlepOscillator::Shape;

    const auto wave = params.index (ParamKind::BassWave);
    blendAmount_ = std::clamp (params (ParamKind::BassWaveBlend), 0.0f, 1.0f);
    useBlend_ = false;

    switch (wave)
    {
        case Saw:       main_.setShape (Shape::Saw); break;
        case Square:    main_.setShape (Shape::Square); break;
        case Triangle:  main_.setShape (Shape::Triangle); break;

        case Rectangle:
            main_.setShape (Shape::Rectangle);
            // The blend knob doubles as pulse width on the rectangle wave, which is where a
            // continuous control is most useful on that shape.
            main_.setPulseWidth (0.1f + blendAmount_ * 0.8f);
            break;

        case S01:
        default:
            // S01 crossfades saw into square rather than switching between them.
            main_.setShape (Shape::Saw);
            blend_.setShape (Shape::Square);
            useBlend_ = true;
            break;
    }
}

void BassVoice::trigger (const TriggerEvent& event, const ParamView& params,
                         float elapsedFraction)
{
    applyWaveform (params);

    const auto tune = params (ParamKind::BassTune) + static_cast<float> (event.note);
    targetFrequency_ = kRootFrequency * semitonesToRatio (tune)
                                      * centsToRatio (event.pitchCents);

    // A slid note glides from wherever the previous one ended; anything else starts in place.
    const auto slide = event.slide && isActive();

    if (! slide)
        glideFrequency_ = targetFrequency_;

    gliding_ = slide;

    const auto glideMs = std::max (1.0f, params (ParamKind::BassGlideTime));
    const auto glideSamples = static_cast<double> (glideMs) * 0.001 * sampleRate_;
    glideCoefficient_ = static_cast<float> (std::exp (-1.0 / std::max (1.0, glideSamples)));
    glideCurve_ = std::clamp (params (ParamKind::BassGlideCurve), 0.0f, 1.0f);

    baseCutoff_ = params (ParamKind::BassCutoff);
    envModAmount_ = params (ParamKind::BassEnvMod);
    filter_.setResonance (params (ParamKind::BassResonance));

    subLevel_ = params (ParamKind::BassSubLevel);
    subBypassesFilter_ = params.flag (ParamKind::BassSubBypass);

    const auto subRange = params.index (ParamKind::BassSubRange);
    const auto subDivisor = subRange == 0 ? 4.0f : (subRange == 1 ? 2.0f : 1.0f);
    sub_.setFrequency (targetFrequency_ / subDivisor);

    overdrive_.setDrive (params (ParamKind::BassOverdrive));

    // Accent raises the level and opens the filter envelope — on the hardware these are the
    // same control voltage, so they must move together.
    const auto accented = event.accent == Accent::Accent;
    accentAmount_ = accented ? params (ParamKind::BassAccentAmount) : 0.0f;
    level_ = event.velocity * (1.0f + accentAmount_ * 0.35f);

    const auto decay = params (ParamKind::BassDecay);
    const auto curve = params (ParamKind::BassDecayCurve);

    amplitude_.setDecayMs (decay);
    amplitude_.setCurve (curve);

    // The filter envelope runs shorter than the amplitude envelope, and accent shortens it
    // further — that snap is what makes an accented 303 note bark.
    filterEnv_.setDecayMs (decay * (accented ? 0.55f : 0.8f));
    filterEnv_.setCurve (std::max (0.0f, curve - 0.15f));

    const auto gate = std::clamp (params (ParamKind::BassGateTime), 0.05f, 1.0f);
    gateSamples_ = event.stepDurationSamples > 0.0
                 ? event.stepDurationSamples * static_cast<double> (gate)
                 : sampleRate_ * 0.1;

    if (! slide)
    {
        main_.reset (0.0);
        blend_.reset (0.0);
        sub_.reset (0.0);

        amplitude_.trigger (1.0f);
        filterEnv_.trigger (1.0f);

        amplitude_.advanceFraction (elapsedFraction);
        filterEnv_.advanceFraction (elapsedFraction);
    }

    releaseRamp_.snapTo (1.0f);
    releaseRamp_.setTarget (1.0f);
}

void BassVoice::release()
{
    releaseRamp_.setTarget (0.0f);
    gateSamples_ = 0.0;
}

float BassVoice::currentFrequency() noexcept
{
    if (! gliding_)
        return targetFrequency_;

    // The curve control biases the glide between an even slew and a fast departure that eases
    // into the target.
    const auto shaped = glideCoefficient_
                      + (1.0f - glideCoefficient_) * (1.0f - glideCurve_) * 0.5f;

    glideFrequency_ = targetFrequency_ + (glideFrequency_ - targetFrequency_) * shaped;

    if (std::abs (glideFrequency_ - targetFrequency_) < 0.01f)
    {
        glideFrequency_ = targetFrequency_;
        gliding_ = false;
    }

    return glideFrequency_;
}

void BassVoice::render (float* left, float* right, int numSamples)
{
    const auto nyquist = static_cast<float> (sampleRate_ * 0.45);

    for (int i = 0; i < numSamples; ++i)
    {
        if (! amplitude_.isActive())
        {
            // Settle the recursive stages once the note is over, so the voice adds exactly
            // nothing afterwards regardless of where the block boundary fell, and the next
            // note starts from a known state. See KickVoice::settle.
            filter_.reset();
            dcBlocker_.reset();
            releaseRamp_.snapTo (0.0f);
            gateSamples_ = 0.0;
            return;
        }

        if (gateSamples_ > 0.0)
        {
            gateSamples_ -= 1.0;

            if (gateSamples_ <= 0.0)
                releaseRamp_.setTarget (0.0f);
        }

        const auto frequency = currentFrequency();
        main_.setFrequency (frequency);

        auto oscillator = main_.next();

        if (useBlend_)
        {
            blend_.setFrequency (frequency);
            oscillator = oscillator * (1.0f - blendAmount_) + blend_.next() * blendAmount_;
        }

        const auto subSample = sub_.next() * subLevel_;

        if (! subBypassesFilter_)
            oscillator += subSample;

        // Envelope-modulated cutoff, with the accent riding on top of it.
        const auto envelope = filterEnv_.next();
        const auto modulation = envelope * (envModAmount_ + accentAmount_ * 0.6f);
        const auto cutoff = std::clamp (baseCutoff_ * (1.0f + modulation * 12.0f),
                                        20.0f, nyquist);
        filter_.setCutoff (cutoff);

        auto sample = filter_.process (oscillator);

        if (subBypassesFilter_)
            sample += subSample;

        sample = overdrive_.process (sample);
        sample *= amplitude_.next() * level_ * releaseRamp_.next();
        sample = dcBlocker_.process (sample);

        left[i] += sample;
        right[i] += sample;
    }
}

} // namespace bud
