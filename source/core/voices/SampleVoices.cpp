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

        if (sourceTempo <= 0.0)
            return 1.0;

        return tempo / sourceTempo;
    }
}

//==============================================================================
// One-shot sample voice

void SampleVoice::prepare (double sampleRate)
{
    sampleRate_ = std::max (1.0, sampleRate);
    amplitude_.prepare (sampleRate_);
    amplitude_.setCurve (0.35f);
    reset();
}

void SampleVoice::reset()
{
    amplitude_.reset();
    sample_ = nullptr;
    position_ = 0.0;
    playing_ = false;
}

void SampleVoice::trigger (const TriggerEvent& event, const ParamView& params,
                           float elapsedFraction)
{
    if (library_ == nullptr)
        return;

    const auto bankId = params.index (ParamKind::SampleBank) == 0 ? BankId::S2 : BankId::S4;
    const auto& bank = library_->bank (bankId);
    const auto& slot = bank.slot (params.index (ParamKind::SampleSlot));

    if (slot.empty())
    {
        playing_ = false;
        return;
    }

    sample_ = &slot;

    const auto tune = params (ParamKind::SampleTune) + static_cast<float> (event.note);
    auto ratio = static_cast<double> (semitonesToRatio (tune)
                                      * centsToRatio (event.pitchCents));

    if (params.flag (ParamKind::SampleRepitchToTempo))
        ratio *= tempoRatio (slot, tempo_);

    // Rate also corrects for a sample recorded at a different rate than the engine runs at.
    increment_ = ratio * slot.sampleRate / sampleRate_;

    const auto start = std::clamp (params (ParamKind::SampleStart), 0.0f, 1.0f);
    position_ = static_cast<double> (start) * static_cast<double> (slot.length());

    // Advancing by the elapsed fraction keeps the sample start aligned to the true onset
    // rather than the sample grid.
    position_ += increment_ * static_cast<double> (elapsedFraction);

    amplitude_.setDecayMs (params (ParamKind::SampleDecay));
    amplitude_.trigger (event.velocity);
    amplitude_.advanceFraction (elapsedFraction);

    playing_ = true;
}

void SampleVoice::render (float* left, float* right, int numSamples)
{
    if (! playing_ || sample_ == nullptr)
        return;

    const auto length = static_cast<double> (sample_->length());
    const auto stereo = sample_->isStereo();

    for (int i = 0; i < numSamples; ++i)
    {
        if (position_ >= length || ! amplitude_.isActive())
        {
            playing_ = false;
            break;
        }

        const auto gain = amplitude_.next();
        const auto l = interpolateSample (*sample_, 0, position_) * gain;
        const auto r = stereo ? interpolateSample (*sample_, 1, position_) * gain : l;

        left[i] += l;
        right[i] += r;

        position_ += increment_;
    }
}

//==============================================================================
// Loop voice

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

    const auto& slot = library_->bank (BankId::S8).slot (params.index (ParamKind::LoopSlot));

    if (slot.empty())
    {
        playing_ = false;
        return;
    }

    sample_ = &slot;

    const auto length = static_cast<double> (slot.length());
    const auto start = std::clamp (params (ParamKind::LoopStart), 0.0f, 1.0f);
    const auto span = std::clamp (params (ParamKind::LoopLength), 0.0f, 1.0f);

    regionStart_ = static_cast<double> (start) * length;
    regionEnd_ = std::min (length, regionStart_ + static_cast<double> (span) * length);

    if (regionEnd_ - regionStart_ < 4.0)
        regionEnd_ = std::min (length, regionStart_ + 4.0);

    const auto pitch = params (ParamKind::LoopPitch) + static_cast<float> (event.note);
    auto ratio = static_cast<double> (semitonesToRatio (pitch)
                                      * centsToRatio (event.pitchCents));

    // Time-stretch (tempo without pitch) lands with the sampler milestone; until then STRETCH
    // requests tempo following by repitching, which at least keeps the loop in time.
    if (params.flag (ParamKind::LoopStretch))
        ratio *= tempoRatio (slot, tempo_);

    increment_ = ratio * slot.sampleRate / sampleRate_;

    const auto crossfadeMs = params (ParamKind::LoopCrossfade);
    crossfadeSamples_ = std::min (static_cast<double> (crossfadeMs) * 0.001 * sampleRate_,
                                  (regionEnd_ - regionStart_) * 0.5);

    looping_ = params.index (ParamKind::LoopPlayMode) == 0;
    level_ = event.velocity;

    position_ = regionStart_ + increment_ * static_cast<double> (elapsedFraction);
    playing_ = true;
}

float LoopVoice::crossfadeGain (double position) const noexcept
{
    if (crossfadeSamples_ <= 0.0)
        return 1.0f;

    const auto fromStart = position - regionStart_;
    const auto toEnd = regionEnd_ - position;

    const auto edge = std::min (fromStart, toEnd);

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
                break;
            }

            position_ -= (regionEnd_ - regionStart_);
        }

        const auto gain = level_ * crossfadeGain (position_);

        left[i] += interpolateSample (*sample_, 0, position_) * gain;
        right[i] += (stereo ? interpolateSample (*sample_, 1, position_) :
                              interpolateSample (*sample_, 0, position_)) * gain;

        position_ += increment_;
    }
}

} // namespace bud
