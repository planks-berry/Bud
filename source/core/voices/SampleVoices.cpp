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
    stretch_.prepare (sampleRate_);
    reset();
}

void LoopVoice::reset()
{
    sample_ = nullptr;
    position_ = 0.0;
    regionStart_ = 0.0;
    regionEnd_ = 0.0;
    stretching_ = false;
    playing_ = false;
    stretch_.reset();
}

void LoopVoice::trigger (const TriggerEvent& event, const ParamView& params,
                         float elapsedFraction)
{
    if (library_ == nullptr)
        return;

    // The loop track's home is S8, the stereo bank a person records into, and that stays its
    // default. It reads the bank parameter rather than hard-coding S8 so the track is not empty
    // before anything has been recorded — the factory loops live in a bank of their own.
    const auto bank = params.enumValue<SoundBank> (ParamKind::TrackSoundBank);
    const auto* slot = library_->find (bank, params (ParamKind::TrackSound));

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

    const auto pitch = static_cast<double> (curves::semitonesToRatio (tune)
                                            * curves::centsToRatio (event.pitchCents));

    // Correct for a sample recorded at a rate other than the engine's, which applies whichever
    // path plays it.
    const auto rateCorrection = slot->sampleRate / sampleRate_;
    const auto tempoFollow = tempoRatio (*slot, tempo_);

    // The three tempo behaviours differ in which of pitch and speed each control moves. That is
    // the whole distinction between the modes, and it is why two of them need a stretcher: a
    // resampler can only move both together.
    double pitchRatio = pitch;
    double speedRatio = pitch;

    switch (mode)
    {
        case LoopMode::LoopMelodic:
        case LoopMode::OneShotMelodic:
            // Melodic: transposing must not change how long the loop takes, so the pitch moves
            // and the speed stays where it was.
            pitchRatio = pitch;
            speedRatio = 1.0;
            stretching_ = true;
            break;

        case LoopMode::LoopRhythmic:
        case LoopMode::OneShotRhythmic:
            // Rhythmic: following the tempo must not transpose it, so the speed moves and the
            // pitch stays put. Tuning still applies on top, deliberately — TUNE is a control the
            // player reached for, whereas tempo is not.
            pitchRatio = pitch;
            speedRatio = pitch * tempoFollow;
            stretching_ = true;
            break;

        default:
            // No stretch: pitch and length move together, which is what a resampler does.
            stretching_ = false;
            break;
    }

    increment_ = pitch * rateCorrection;

    if (stretching_)
    {
        stretch_.setSource (slot, regionStart_, regionEnd_);
        stretch_.setRatios (pitchRatio * rateCorrection, speedRatio * rateCorrection);
        stretch_.setLooping (looping_);
    }

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
    {
        position_ = regionStart_ + increment_ * static_cast<double> (elapsedFraction);
        stretch_.rewind();
    }

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

    if (stretching_)
        renderStretched (left, right, numSamples);
    else
        renderResampled (left, right, numSamples);
}

void LoopVoice::renderResampled (float* left, float* right, int numSamples) noexcept
{
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

void LoopVoice::renderStretched (float* left, float* right, int numSamples) noexcept
{
    // The stretcher writes rather than accumulates, so it needs its own scratch to add from.
    // Deliberately small and consumed in chunks rather than sized to the largest possible block:
    // a buffer big enough for an 8192-sample block would put 64 KB on the stack of whichever
    // thread is rendering, and an AUv3 render thread has far less to spare than a desktop one.
    // Chunking costs nothing measurable and keeps the voice allocation-free.
    static constexpr int kMaxScratch = 256;
    float scratchLeft[kMaxScratch];
    float scratchRight[kMaxScratch];

    auto remaining = numSamples;
    auto offset = 0;

    while (remaining > 0)
    {
        const auto count = std::min (remaining, kMaxScratch);

        stretch_.process (scratchLeft, scratchRight, count);

        for (int i = 0; i < count; ++i)
        {
            left[offset + i] += scratchLeft[i] * level_;
            right[offset + i] += scratchRight[i] * level_;
        }

        offset += count;
        remaining -= count;
    }

    if (! stretch_.isActive())
        playing_ = false;
}

} // namespace bud
