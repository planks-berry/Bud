#include "Isolator.h"

namespace bud::fx
{

namespace
{
    // Band edges from the manual (p. 33): LOW is 20-400 Hz, MID 400-1500 Hz, HI 1500-20 kHz.
    constexpr float kLowCrossover = 400.0f;
    constexpr float kHighCrossover = 1500.0f;

    /// Butterworth Q. Cascading two of these makes a 4th-order Linkwitz-Riley crossover, whose
    /// halves each sit 6 dB down at the corner and sum back to flat. Any other Q breaks that:
    /// at Q = 0.5 each section is already 6 dB down, so the cascade lands at 12 dB and a band
    /// that should have kept half the signal keeps a quarter of it.
    constexpr float kButterworthQ = 0.70710678f;
}

//==============================================================================

void Isolator::Crossover::prepare (double sampleRate, float frequency)
{
    for (auto* filter : { &lowA, &lowB })
    {
        filter->prepare (sampleRate);
        filter->setMode (dsp::StateVariableFilter::Mode::LowPass);
        filter->setCutoff (frequency);
        filter->setQ (kButterworthQ);
    }

    for (auto* filter : { &highA, &highB })
    {
        filter->prepare (sampleRate);
        filter->setMode (dsp::StateVariableFilter::Mode::HighPass);
        filter->setCutoff (frequency);
        filter->setQ (kButterworthQ);
    }
}

void Isolator::Crossover::reset()
{
    lowA.reset();
    lowB.reset();
    highA.reset();
    highB.reset();
}

void Isolator::Crossover::split (float input, float& low, float& high) noexcept
{
    low = lowB.process (lowA.process (input));
    high = highB.process (highA.process (input));
}

//==============================================================================

void Isolator::Channel::prepare (double sampleRate)
{
    lowSplit.prepare (sampleRate, kLowCrossover);
    highSplit.prepare (sampleRate, kHighCrossover);
}

void Isolator::Channel::reset()
{
    lowSplit.reset();
    highSplit.reset();
}

//==============================================================================

void Isolator::prepare (double sampleRate)
{
    left_.prepare (sampleRate);
    right_.prepare (sampleRate);
    reset();
}

void Isolator::reset()
{
    left_.reset();
    right_.reset();
}

void Isolator::setBands (int low, int mid, int high) noexcept
{
    lowGain_ = curves::isolatorGain (low);
    midGain_ = curves::isolatorGain (mid);
    highGain_ = curves::isolatorGain (high);

    neutral_ = low == 0 && mid == 0 && high == 0;
}

void Isolator::process (float* left, float* right, int numSamples) noexcept
{
    if (neutral_)
        return;

    const auto processChannel = [] (Channel& channel, float input,
                                    float lowGain, float midGain, float highGain)
    {
        // Split off the lows first, then divide what is left into mid and high.
        float low = 0.0f, aboveLow = 0.0f;
        channel.lowSplit.split (input, low, aboveLow);

        float mid = 0.0f, high = 0.0f;
        channel.highSplit.split (aboveLow, mid, high);

        return low * lowGain + mid * midGain + high * highGain;
    };

    for (int i = 0; i < numSamples; ++i)
    {
        left[i] = processChannel (left_, left[i], lowGain_, midGain_, highGain_);
        right[i] = processChannel (right_, right[i], lowGain_, midGain_, highGain_);
    }
}

} // namespace bud::fx
