#include "SampleVoices.h"

#include <algorithm>
#include <cmath>

namespace bud
{

float interpolateSample (const SampleData& sample, int channel, double position) noexcept
{
    const auto index = static_cast<int> (std::floor (position));
    const auto t = static_cast<float> (position - static_cast<double> (index));

    const auto p0 = sample.at (channel, index - 1);
    const auto p1 = sample.at (channel, index);
    const auto p2 = sample.at (channel, index + 1);
    const auto p3 = sample.at (channel, index + 2);

    const auto a = 0.5f * (-p0 + 3.0f * p1 - 3.0f * p2 + p3);
    const auto b = p0 - 2.5f * p1 + 2.0f * p2 - 0.5f * p3;
    const auto c = 0.5f * (-p0 + p2);

    return ((a * t + b) * t + c) * t + p1;
}

namespace
{
    /// Playback rate that makes a sample of known musical length fit the current tempo.
    double tempoRatio (const SampleData& sample, double tempo) noexcept
    {
        if (sample.sourceBeats <= 0.0 || sample.empty())
            return 1.0;

        const auto seconds = static_cast<double> (sample.length()) / sample.sampleRate;

        if (seconds <= 0.0)
            return 1.0;

        const auto sourceTempo = sample.sourceBeats * 60.0 / seconds;
        return sourceTempo > 0.0 ? tempo / sourceTempo : 1.0;
    }

    /// A user sample bank keeps its own slot indexing; a factory bank wraps.
    bool bankIsUserSamples (SoundBank bank) noexcept
    {
        return bank == SoundBank::S2 || bank == SoundBank::S4 || bank == SoundBank::S8;
    }
}

//==============================================================================
// General drum sample voice

void DrumSampleVoice::prepare (double sampleRate)
{
    sampleRate_ = std::max (1.0, sampleRate);
    decay_.prepare (sampleRate_);
    reset();
}

void DrumSampleVoice::reset()
{
    decay_.reset();
    sample_ = nullptr;
    position_ = 0.0;
    attackProgress_ = 0.0;
    playing_ = false;
}

void DrumSampleVoice::trigger (const TriggerEvent& event, const ParamView& params,
                               float elapsedFraction)
{
    if (library_ == nullptr)
        return;

    const auto bank = params.enumValue<SoundBank> (ParamKind::TrackSoundBank);
    const auto* slot = library_->find (bank, params (ParamKind::TrackSound));

    if (slot == nullptr)
    {
        playing_ = false;
        return;
    }

    sample_ = slot;
    level_ = event.velocity;

    const auto isUser = bankIsUserSamples (bank);
    const auto length = static_cast<double> (slot->length());

    // ---- pitch ---------------------------------------------------------------
    auto ratio = 1.0;

    if (isUser && params.flag (ParamKind::TrackRepitch))
    {
        // With repitch on, the sample follows tempo and TUNE no longer applies (p. 68).
        ratio = tempoRatio (*slot, tempo_);
    }
    else
    {
        const auto tune = curves::tuneSemitones (params (ParamKind::TrackTune))
                        + static_cast<float> (event.note);
        ratio = static_cast<double> (curves::semitonesToRatio (tune)
                                     * curves::centsToRatio (event.pitchCents));
    }

    increment_ = ratio * slot->sampleRate / sampleRate_;

    // ---- region and envelope -------------------------------------------------
    if (isUser)
    {
        // On the user banks ATTACK and DECAY set the region rather than envelope times, and
        // MOVE supplies the slope (p. 67, 69).
        const auto start = params.unit (ParamKind::TrackAttack);
        const auto span = params.unit (ParamKind::TrackDecay);

        position_ = static_cast<double> (start) * length;
        endPosition_ = std::min (length, position_ + static_cast<double> (span) * length);

        const auto slope = params.bipolar (ParamKind::TrackMove);

        if (slope > 0.02f)
        {
            // A-side: an attack ramp.
            attackSamples_ = static_cast<double> (slope) * (endPosition_ - position_);
            envelopeBypassed_ = true;
        }
        else if (slope < -0.02f)
        {
            attackSamples_ = 0.0;
            envelopeBypassed_ = false;
            decay_.setCurve (0.3f);
            decay_.setDecayMs (static_cast<float> ((endPosition_ - position_)
                                                   / sampleRate_ * 1000.0)
                               * (1.0f + slope));
        }
        else
        {
            // OFF: plain one-shot.
            attackSamples_ = 0.0;
            envelopeBypassed_ = true;
        }
    }
    else
    {
        position_ = 0.0;
        endPosition_ = length;

        const auto attackRaw = params (ParamKind::TrackAttack);
        const auto decayRaw = params (ParamKind::TrackDecay);

        // ATTACK at 0 with DECAY at 127 turns the envelope off entirely (p. 65).
        envelopeBypassed_ = attackRaw == kRawMin && decayRaw == kRawMax;

        attackSamples_ = static_cast<double> (curves::timeMs (attackRaw, 0.0f, 400.0f))
                       * 0.001 * sampleRate_;

        decay_.setCurve (0.35f);
        decay_.setDecayMs (curves::timeMs (decayRaw, 10.0f, 2000.0f));
    }

    position_ += increment_ * static_cast<double> (elapsedFraction);
    attackProgress_ = 0.0;

    if (! envelopeBypassed_)
    {
        decay_.trigger (1.0f);
        decay_.advanceFraction (elapsedFraction);
    }

    playing_ = true;
}

void DrumSampleVoice::render (float* left, float* right, int numSamples)
{
    if (! playing_ || sample_ == nullptr)
        return;

    const auto stereo = sample_->isStereo();

    for (int i = 0; i < numSamples; ++i)
    {
        if (position_ >= endPosition_ || (! envelopeBypassed_ && ! decay_.isActive()))
        {
            playing_ = false;
            return;
        }

        auto gain = level_;

        if (! envelopeBypassed_)
            gain *= decay_.next();

        // The attack ramp is a simple linear fade-in over its length.
        if (attackSamples_ > 0.0 && attackProgress_ < attackSamples_)
        {
            gain *= static_cast<float> (attackProgress_ / attackSamples_);
            attackProgress_ += 1.0;
        }

        const auto l = interpolateSample (*sample_, 0, position_) * gain;
        const auto r = stereo ? interpolateSample (*sample_, 1, position_) * gain : l;

        left[i] += l;
        right[i] += r;

        position_ += increment_;
    }
}

//==============================================================================
// Loop voice — track 10

void LoopVoice::prepare (double sampleRate)
{
    sampleRate_ = std::max (1.0, sampleRate);
    reset();
}

void LoopVoice::reset()
{
    sample_ = nullptr;
    position_ = 0.0;
    regionStart_ = 0.0;
    regionEnd_ = 0.0;
    playing_ = false;
}

void LoopVoice::trigger (const TriggerEvent& event, const ParamView& params,
                         float elapsedFraction)
{
    if (library_ == nullptr)
        return;

    const auto* slot = library_->find (SoundBank::S8, params (ParamKind::TrackSound));

    if (slot == nullptr)
    {
        playing_ = false;
        return;
    }

    // A retrigger step restarts from the region start without re-reading the settings (p. 69).
    const auto wasPlaying = playing_ && sample_ == slot;

    sample_ = slot;

    const auto length = static_cast<double> (slot->length());
    const auto start = params.unit (ParamKind::TrackAttack);
    const auto span = params.unit (ParamKind::TrackDecay);

    regionStart_ = static_cast<double> (start) * length;
    regionEnd_ = std::min (length, regionStart_ + static_cast<double> (span) * length);

    if (regionEnd_ - regionStart_ < 4.0)
        regionEnd_ = std::min (length, regionStart_ + 4.0);

    const auto mode = params.enumValue<LoopMode> (ParamKind::TrackLoopMode);
    looping_ = loopModeLoops (mode);

    // ---- pitch and stretch ---------------------------------------------------
    const auto tune = curves::tuneSemitones (params (ParamKind::TrackTune))
                    + static_cast<float> (event.note);

    auto ratio = static_cast<double> (curves::semitonesToRatio (tune)
                                      * curves::centsToRatio (event.pitchCents));

    switch (mode)
    {
        case LoopMode::LoopRhythmic:
        case LoopMode::OneShotRhythmic:
            // Rhythmic: hold pitch while following tempo. Proper time-stretch lands with the
            // sampler milestone; repitching at least keeps the loop in time until then.
            ratio *= tempoRatio (*slot, tempo_);
            break;

        case LoopMode::LoopMelodic:
        case LoopMode::OneShotMelodic:
            // Melodic: hold length while the pitch moves. Also awaiting the stretch engine.
            break;

        default:
            break;
    }

    increment_ = ratio * slot->sampleRate / sampleRate_;

    // MOVE is the crossfade in loop mode and the slope in one-shot mode (p. 69). Crossfade
    // spans up to four seconds, and cannot exceed half the region.
    if (looping_)
    {
        const auto xfade = params.unit (ParamKind::TrackMove);
        crossfadeSamples_ = std::min (static_cast<double> (xfade) * 4.0 * sampleRate_,
                                      (regionEnd_ - regionStart_) * 0.5);
    }
    else
    {
        crossfadeSamples_ = 0.0;
    }

    level_ = event.velocity;

    if (! wasPlaying || event.retrigger || ! looping_)
        position_ = regionStart_ + increment_ * static_cast<double> (elapsedFraction);

    playing_ = true;
}

float LoopVoice::crossfadeGain (double position) const noexcept
{
    if (crossfadeSamples_ <= 0.0)
        return 1.0f;

    const auto edge = std::min (position - regionStart_, regionEnd_ - position);

    if (edge >= crossfadeSamples_)
        return 1.0f;

    // Equal-power taper, so the seam holds a constant perceived level.
    const auto t = std::clamp (edge / crossfadeSamples_, 0.0, 1.0);
    return static_cast<float> (std::sin (t * 1.5707963267948966));
}

void LoopVoice::render (float* left, float* right, int numSamples)
{
    if (! playing_ || sample_ == nullptr)
        return;

    const auto stereo = sample_->isStereo();

    for (int i = 0; i < numSamples; ++i)
    {
        if (position_ >= regionEnd_)
        {
            if (! looping_)
            {
                playing_ = false;
                return;
            }

            position_ -= (regionEnd_ - regionStart_);
        }

        const auto gain = level_ * crossfadeGain (position_);

        const auto l = interpolateSample (*sample_, 0, position_);
        const auto r = stereo ? interpolateSample (*sample_, 1, position_) : l;

        left[i] += l * gain;
        right[i] += r * gain;

        position_ += increment_;
    }
}

} // namespace bud
