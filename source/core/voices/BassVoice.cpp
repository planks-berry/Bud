#include "BassVoice.h"

#include <algorithm>
#include <cmath>

namespace bud
{

namespace
{
    /// Middle of the bass register; step notes are semitone offsets from here.
    constexpr float kRootFrequency = 55.0f;   // A1

    enum WaveIndex { Saw = 0, Square = 1, Triangle = 2, Rectangle = 3, S01 = 4 };

    /// The SOUND knob spans 0-127 and selects one of five oscillator settings.
    int waveformFromSound (int sound) noexcept
    {
        return std::clamp (sound * 5 / (kRawMax + 1), 0, 4);
    }

    /// Sub-oscillator octave: -2, -1 or UNISON (p. 77).
    float subDivisorFromTone (int tone) noexcept
    {
        const auto index = std::clamp (tone * 3 / (kRawMax + 1), 0, 2);
        return index == 0 ? 4.0f : (index == 1 ? 2.0f : 1.0f);
    }
}

//==============================================================================

void BassVoice::prepare (double sampleRate)
{
    sampleRate_ = std::max (1.0, sampleRate);

    main_.prepare (sampleRate_);
    blend_.prepare (sampleRate_);
    sub_.prepare (sampleRate_);
    subSquare_.prepare (sampleRate_);
    subSquare_.setShape (dsp::BlepOscillator::Shape::Square);
    filter_.prepare (sampleRate_);
    amplitude_.prepare (sampleRate_);
    filterEnv_.prepare (sampleRate_);
    dcBlocker_.prepare (sampleRate_);
    gateRamp_.prepare (sampleRate_, 4.0f);

    reset();
}

void BassVoice::reset()
{
    main_.reset();
    blend_.reset();
    sub_.reset();
    subSquare_.reset();
    filter_.reset();
    amplitude_.reset();
    filterEnv_.reset();
    dcBlocker_.reset();
    gateRamp_.snapTo (0.0f);

    gliding_ = false;
    gateSamples_ = 0.0;
    glideFrequency_ = kRootFrequency;
    targetFrequency_ = kRootFrequency;
}

void BassVoice::applyWaveform (const ParamView& params)
{
    using Shape = dsp::BlepOscillator::Shape;

    const auto wave = waveformFromSound (params (ParamKind::TrackSound));

    s01Mode_ = wave == S01;
    useBlend_ = s01Mode_;

    switch (wave)
    {
        case Saw:      main_.setShape (Shape::Saw); break;
        case Square:   main_.setShape (Shape::Square); break;
        case Triangle: main_.setShape (Shape::Triangle); break;

        case Rectangle:
            main_.setShape (Shape::Rectangle);
            main_.setPulseWidth (0.25f);
            break;

        case S01:
        default:
            // S01 crossfades saw into square rather than switching between them, with the mix
            // on ATTACK and the display reading SAW50 - C - SQR50.
            main_.setShape (Shape::Saw);
            blend_.setShape (Shape::Square);
            blendAmount_ = params.unit (ParamKind::TrackAttack);
            break;
    }
}

void BassVoice::trigger (const TriggerEvent& event, const ParamView& params,
                         float elapsedFraction)
{
    applyWaveform (params);

    const auto tune = curves::bassTuneSemitones (params (ParamKind::TrackTune))
                    + static_cast<float> (event.note);

    targetFrequency_ = kRootFrequency * curves::semitonesToRatio (tune)
                                      * curves::centsToRatio (event.pitchCents);

    // A glided note slides from wherever the previous one ended and does not retrigger.
    const auto glide = event.glide && isActive();

    if (! glide)
        glideFrequency_ = targetFrequency_;

    gliding_ = glide;

    const auto glideMs = std::max (1.0f, params.timeMs (ParamKind::TrackMove, 5.0f, 400.0f));
    const auto glideSamples = static_cast<double> (glideMs) * 0.001 * sampleRate_;
    glideCoefficient_ = static_cast<float> (std::exp (-1.0 / std::max (1.0, glideSamples)));
    glideCurve_ = params.unit (ParamKind::BassGlideCurve);

    baseCutoff_ = curves::timeMs (params (ParamKind::BassCutoff), 30.0f, 12000.0f);
    envDepth_ = params.unit (ParamKind::BassEnvDepth);
    filter_.setResonance (params.unit (ParamKind::BassResonance) * 0.98f);

    subLevel_ = params.unit (ParamKind::TrackLevel);

    const auto subDivisor = subDivisorFromTone (params (ParamKind::TrackTone));
    sub_.setFrequency (targetFrequency_ / subDivisor);
    subSquare_.setFrequency (targetFrequency_ / subDivisor);

    // DRIVE does nothing unless BS DRV is on (p. 75).
    overdrive_.setDrive (params.flag (ParamKind::BassDriveEnabled)
                         ? params.unit (ParamKind::BassDrive) : 0.0f);

    // Accent raises the level and opens the filter envelope together.
    const auto accented = event.accent == Accent::Hard;
    accentAmount_ = accented ? params.unit (ParamKind::BassAccent) : 0.0f;
    level_ = event.velocity * curves::levelGain (params (ParamKind::BassLevel))
           * (1.0f + accentAmount_ * 0.35f);

    const auto filterDecay = params.timeMs (ParamKind::BassEnvDecay, 30.0f, 3000.0f);

    // ATTACK is the filter envelope curve, except in S01 where it becomes the oscillator mix.
    const auto envCurve = s01Mode_ ? 0.4f : params.unit (ParamKind::TrackAttack);

    filterEnv_.setDecayMs (filterDecay * (accented ? 0.7f : 1.0f));
    filterEnv_.setCurve (envCurve);

    // In S01 the filter envelope is added to the amp envelope, making a pseudo-ADR; otherwise
    // the amp envelope is its own, longer shape.
    amplitude_.setDecayMs (s01Mode_ ? filterDecay * 1.4f : filterDecay * 1.6f);
    amplitude_.setCurve (s01Mode_ ? envCurve : 0.35f);

    // Gate time spans 10-90 % of the step (p. 77).
    const auto gate = 0.1f + params.unit (ParamKind::TrackDecay) * 0.8f;
    gateSamples_ = event.stepDurationSamples > 0.0
                 ? event.stepDurationSamples * static_cast<double> (gate)
                 : sampleRate_ * 0.1;

    if (! glide)
    {
        main_.reset (0.0);
        blend_.reset (0.0);
        sub_.reset (0.0);
        subSquare_.reset (0.0);

        amplitude_.trigger (1.0f);
        filterEnv_.trigger (1.0f);

        amplitude_.advanceFraction (elapsedFraction);
        filterEnv_.advanceFraction (elapsedFraction);
    }

    gateRamp_.snapTo (1.0f);
    gateRamp_.setTarget (1.0f);
}

float BassVoice::currentFrequency() noexcept
{
    if (! gliding_)
        return targetFrequency_;

    // The curve control biases the glide between an even slew and a fast departure that eases
    // into the target: 0 is a downward curve, higher values more linear (p. 76).
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
            // Settle the recursive stages, so the voice adds exactly nothing once finished no
            // matter where the block boundary fell, and the next note starts from a known state.
            filter_.reset();
            dcBlocker_.reset();
            gateRamp_.snapTo (0.0f);
            gateSamples_ = 0.0;
            return;
        }

        if (gateSamples_ > 0.0)
        {
            gateSamples_ -= 1.0;

            if (gateSamples_ <= 0.0)
                gateRamp_.setTarget (0.0f);
        }

        const auto frequency = currentFrequency();
        main_.setFrequency (frequency);

        auto oscillator = main_.next();

        if (useBlend_)
        {
            blend_.setFrequency (frequency);
            oscillator = oscillator * (1.0f - blendAmount_) + blend_.next() * blendAmount_;
        }

        // Outside S01 the sub is a sine that bypasses the filter; inside S01 it becomes a
        // square that runs through the filter with everything else (p. 77, 116).
        const auto subSample = (s01Mode_ ? subSquare_.next() : sub_.next()) * subLevel_;

        if (s01Mode_)
            oscillator += subSample;

        const auto envelope = filterEnv_.next();
        const auto modulation = envelope * (envDepth_ + accentAmount_ * 0.6f);
        filter_.setCutoff (std::clamp (baseCutoff_ * (1.0f + modulation * 12.0f),
                                       20.0f, nyquist));

        auto sample = filter_.process (oscillator);

        if (! s01Mode_)
            sample += subSample;

        sample = overdrive_.process (sample);

        // S01 adds the filter envelope into the amp envelope, giving a pseudo-ADR shape.
        auto amp = amplitude_.next();

        if (s01Mode_)
            amp = std::min (1.0f, amp + envelope * 0.5f);

        sample *= amp * level_ * gateRamp_.next();
        sample = dcBlocker_.process (sample);

        left[i] += sample;
        right[i] += sample;
    }
}

} // namespace bud
