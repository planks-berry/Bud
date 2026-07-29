#include "MasterFx.h"

#include "../params/Curves.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace bud::fx
{

namespace
{
    constexpr double kTwoPi = 2.0 * std::numbers::pi;

    /// The ring buffer behind snip loop. Long enough to hold the maximum repeat length
    /// (128 sixteenths) at the slowest tempo the device allows.
    constexpr double kRingSeconds = 18.0;

    /// Phaser speed spans 1/16 to 8 (p. 32), interpreted as tempo-synced cycles per beat.
    float phaserRateHz (int amount, double tempo) noexcept
    {
        const auto cyclesPerBeat = 0.0625f
                                 * std::pow (128.0f, curves::unit (amount));   // 1/16 .. 8
        return cyclesPerBeat * static_cast<float> (tempo) / 60.0f;
    }

    /// Snip repeat length spans 1 to 128 sixteenth notes (p. 32).
    int snipLengthSamples (int amount, double tempo, double sampleRate) noexcept
    {
        const auto sixteenths = 1 + static_cast<int> (
            std::lround (curves::unit (amount) * 127.0f));

        const auto secondsPerSixteenth = 60.0 / tempo / 4.0;
        return static_cast<int> (static_cast<double> (sixteenths) * secondsPerSixteenth
                                 * sampleRate);
    }
}

//==============================================================================

void MasterFx::prepare (double sampleRate, int maxBlockSize)
{
    sampleRate_ = std::max (1.0, sampleRate);
    (void) maxBlockSize;

    for (auto* filter : { &sweepLeft_, &sweepRight_ })
    {
        filter->prepare (sampleRate_);
        filter->setResonance (0.3f);
    }

    distortionDcLeft_.prepare (sampleRate_);
    distortionDcRight_.prepare (sampleRate_);

    const auto ringSize = static_cast<std::size_t> (sampleRate_ * kRingSeconds);
    ringLeft_.assign (ringSize, 0.0f);
    ringRight_.assign (ringSize, 0.0f);

    // Fast enough to catch a kick, slow enough on release to pump rather than chatter.
    duckAttack_ = std::exp (-1.0f / static_cast<float> (sampleRate_ * 0.002));
    duckRelease_ = std::exp (-1.0f / static_cast<float> (sampleRate_ * 0.18));

    reset();
}

void MasterFx::reset()
{
    sweepLeft_.reset();
    sweepRight_.reset();

    for (auto& stage : allpassLeft_) stage = 0.0f;
    for (auto& stage : allpassRight_) stage = 0.0f;

    phaserPhase_ = 0.0;
    phaserFeedbackLeft_ = 0.0f;
    phaserFeedbackRight_ = 0.0f;

    distortionDcLeft_.reset();
    distortionDcRight_.reset();

    std::fill (ringLeft_.begin(), ringLeft_.end(), 0.0f);
    std::fill (ringRight_.begin(), ringRight_.end(), 0.0f);
    ringWrite_ = 0;
    snipPlay_ = 0;
    snipArmed_ = false;

    duckEnvelope_ = 0.0f;
}

void MasterFx::setType (MasterFxType type) noexcept
{
    if (type == type_)
        return;

    type_ = type;

    // Clear the state of whatever was running, but leave the capture ring alone — it has to
    // keep running so snip loop has something to grab.
    sweepLeft_.reset();
    sweepRight_.reset();
    for (auto& stage : allpassLeft_) stage = 0.0f;
    for (auto& stage : allpassRight_) stage = 0.0f;
    duckEnvelope_ = 0.0f;
    snipArmed_ = false;
}

void MasterFx::setAmount (int raw) noexcept
{
    amount_ = curves::clampRaw (raw);
}

void MasterFx::setTempo (double bpm) noexcept
{
    tempo_ = std::clamp (bpm, 20.0, 300.0);
}

void MasterFx::setEnabled (bool enabled) noexcept
{
    if (enabled == enabled_)
        return;

    enabled_ = enabled;

    if (enabled_)
    {
        // Snip loop "repeats the sound that is playing when the master effect is turned on"
        // (p. 32), so the slice is decided here, at the moment of engagement, from audio the
        // ring has already captured.
        snipLength_ = std::min (snipLengthSamples (amount_, tempo_, sampleRate_),
                                static_cast<int> (ringLeft_.size()));

        snipStart_ = ringWrite_ - snipLength_;
        while (snipStart_ < 0)
            snipStart_ += static_cast<int> (ringLeft_.size());

        snipPlay_ = 0;
        snipArmed_ = snipLength_ > 0;
    }
    else
    {
        snipArmed_ = false;
    }
}

//==============================================================================

void MasterFx::captureToRing (const float* left, const float* right, int numSamples) noexcept
{
    const auto size = static_cast<int> (ringLeft_.size());

    if (size <= 0)
        return;

    for (int i = 0; i < numSamples; ++i)
    {
        ringLeft_[static_cast<std::size_t> (ringWrite_)] = left[i];
        ringRight_[static_cast<std::size_t> (ringWrite_)] = right[i];

        if (++ringWrite_ >= size)
            ringWrite_ = 0;
    }
}

void MasterFx::process (float* left, float* right, const float* keyLeft, const float* keyRight,
                        int numSamples) noexcept
{
    // Capture first and always, so a slice is ready the instant snip loop is engaged.
    captureToRing (left, right, numSamples);

    if (! enabled_)
        return;

    switch (type_)
    {
        case MasterFxType::SweepFilter: processSweepFilter (left, right, numSamples); break;
        case MasterFxType::Phaser:      processPhaser (left, right, numSamples); break;
        case MasterFxType::Distortion:  processDistortion (left, right, numSamples); break;
        case MasterFxType::SnipLoop:    processSnipLoop (left, right, numSamples); break;
        case MasterFxType::DuckingComp: processDucking (left, right, keyLeft, keyRight,
                                                        numSamples); break;
    }
}

//==============================================================================

void MasterFx::processSweepFilter (float* left, float* right, int numSamples) noexcept
{
    // The same bipolar law as the per-track TONE knob, on the master bus: L50 - OFF - H50.
    const auto tone = curves::toneFilter (amount_);

    if (tone.mode == curves::ToneFilterMode::Bypassed)
        return;

    const auto mode = tone.mode == curves::ToneFilterMode::LowPass
                    ? dsp::StateVariableFilter::Mode::LowPass
                    : dsp::StateVariableFilter::Mode::HighPass;

    for (auto* filter : { &sweepLeft_, &sweepRight_ })
    {
        filter->setMode (mode);
        filter->setCutoff (tone.cutoffHz);
    }

    for (int i = 0; i < numSamples; ++i)
    {
        left[i] = sweepLeft_.process (left[i]);
        right[i] = sweepRight_.process (right[i]);
    }
}

void MasterFx::processPhaser (float* left, float* right, int numSamples) noexcept
{
    const auto rate = phaserRateHz (amount_, tempo_);
    const auto increment = static_cast<double> (rate) / sampleRate_;

    for (int i = 0; i < numSamples; ++i)
    {
        phaserPhase_ += increment;
        if (phaserPhase_ >= 1.0)
            phaserPhase_ -= 1.0;

        // Sweep the allpass coefficient rather than a cutoff: cheaper, and the notches move
        // the way a phaser's should.
        const auto lfo = 0.5f + 0.5f * static_cast<float> (std::sin (phaserPhase_ * kTwoPi));
        const auto coefficient = 0.1f + lfo * 0.8f;

        auto processChannel = [&] (float input, float* stages, float& feedbackState)
        {
            auto x = input + feedbackState * 0.6f;

            for (int stage = 0; stage < kPhaserStages; ++stage)
            {
                const auto y = coefficient * (x + stages[stage]) - stages[stage];
                stages[stage] = x;
                x = y;
            }

            feedbackState = x;
            return (input + x) * 0.5f;
        };

        left[i] = processChannel (left[i], allpassLeft_, phaserFeedbackLeft_);
        right[i] = processChannel (right[i], allpassRight_, phaserFeedbackRight_);
    }
}

void MasterFx::processDistortion (float* left, float* right, int numSamples) noexcept
{
    distortion_.setDrive (curves::unit (amount_));

    for (int i = 0; i < numSamples; ++i)
    {
        left[i] = distortionDcLeft_.process (distortion_.process (left[i]));
        right[i] = distortionDcRight_.process (distortion_.process (right[i]));
    }
}

void MasterFx::processSnipLoop (float* left, float* right, int numSamples) noexcept
{
    if (! snipArmed_ || snipLength_ <= 0)
        return;

    const auto size = static_cast<int> (ringLeft_.size());

    for (int i = 0; i < numSamples; ++i)
    {
        auto index = snipStart_ + snipPlay_;
        while (index >= size)
            index -= size;

        left[i] = ringLeft_[static_cast<std::size_t> (index)];
        right[i] = ringRight_[static_cast<std::size_t> (index)];

        if (++snipPlay_ >= snipLength_)
            snipPlay_ = 0;
    }

    // The slice keeps repeating, so the capture ring must not be overwritten with the repeat
    // itself — rewind the write head to where it was before this block.
    ringWrite_ -= numSamples;
    while (ringWrite_ < 0)
        ringWrite_ += size;
}

void MasterFx::processDucking (float* left, float* right,
                               const float* keyLeft, const float* keyRight,
                               int numSamples) noexcept
{
    // Threshold runs downwards: a higher knob value ducks more.
    const auto threshold = 1.0f - curves::unit (amount_) * 0.9f;
    const auto depth = curves::unit (amount_);

    for (int i = 0; i < numSamples; ++i)
    {
        // Key off the drum bus rather than the mix being compressed. That is what the separate
        // tap in the architecture diagram means, and it is what makes this pump with the kick
        // instead of merely levelling the output.
        const auto key = keyLeft != nullptr
                       ? std::max (std::abs (keyLeft[i]), std::abs (keyRight[i]))
                       : std::max (std::abs (left[i]), std::abs (right[i]));

        const auto coefficient = key > duckEnvelope_ ? duckAttack_ : duckRelease_;
        duckEnvelope_ = key + (duckEnvelope_ - key) * coefficient;

        const auto over = std::max (0.0f, duckEnvelope_ - threshold);
        const auto gain = std::clamp (1.0f - over * depth * 2.0f, 0.0f, 1.0f);

        left[i] *= gain;
        right[i] *= gain;
    }
}

} // namespace bud::fx
