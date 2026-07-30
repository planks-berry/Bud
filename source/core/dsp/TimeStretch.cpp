#include "TimeStretch.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <numbers>

namespace bud::dsp
{

namespace
{
    /// Window length. Long enough to hold a low bass period (a 40 Hz cycle is 25 ms), short
    /// enough that a transient is not smeared across two windows.
    constexpr double kWindowMs = 46.0;

    /// How far either side of the nominal position the correlation search may slide a window.
    /// Roughly a low-frequency period, which is what it needs to find a matching phase.
    constexpr double kSearchMs = 12.0;
}

//==============================================================================

void TimeStretch::prepare (double sampleRate)
{
    sampleRate_ = std::max (1.0, sampleRate);

    windowSize_ = static_cast<int> (sampleRate_ * kWindowMs * 0.001);
    windowSize_ += windowSize_ & 1;               // keep it even, so the halves match
    hopSize_ = windowSize_ / 2;                   // 50 % overlap
    searchRange_ = static_cast<int> (sampleRate_ * kSearchMs * 0.001);

    // Hann, so two 50 %-overlapped windows sum to unity.
    window_.resize (static_cast<std::size_t> (windowSize_));

    for (int i = 0; i < windowSize_; ++i)
    {
        const auto phase = 2.0 * std::numbers::pi * static_cast<double> (i)
                         / static_cast<double> (windowSize_ - 1);
        window_[static_cast<std::size_t> (i)] =
            static_cast<float> (0.5 - 0.5 * std::cos (phase));
    }

    overlapLeft_.assign (static_cast<std::size_t> (hopSize_), 0.0f);
    overlapRight_.assign (static_cast<std::size_t> (hopSize_), 0.0f);

    readyLeft_.assign (static_cast<std::size_t> (hopSize_), 0.0f);
    readyRight_.assign (static_cast<std::size_t> (hopSize_), 0.0f);

    reset();
}

void TimeStretch::reset() noexcept
{
    std::fill (overlapLeft_.begin(), overlapLeft_.end(), 0.0f);
    std::fill (overlapRight_.begin(), overlapRight_.end(), 0.0f);

    readyCount_ = 0;
    readyRead_ = 0;
    outputPosition_ = 0.0;
    active_ = sample_ != nullptr && ! sample_->empty();
}

void TimeStretch::setSource (const SampleData* sample, double regionStart,
                            double regionEnd) noexcept
{
    sample_ = sample;
    regionStart_ = regionStart;
    regionEnd_ = regionEnd;

    // A region shorter than one window plus its search range cannot be stretched — there is not
    // enough material to correlate against. Rather than fail, widen it to the minimum the
    // algorithm can work with. The region is normally most of a loop, so this only bites on a
    // region a player has cut down to under ~58 ms, where a stretch mode has little to say
    // anyway. It does mean the loop wraps over slightly more than was asked for.
    if (regionEnd_ - regionStart_ < static_cast<double> (windowSize_ + searchRange_))
        regionEnd_ = regionStart_ + static_cast<double> (windowSize_ + searchRange_);

    active_ = sample_ != nullptr && ! sample_->empty();
}

void TimeStretch::setRatios (double pitchRatio, double speedRatio) noexcept
{
    pitchRatio_ = std::clamp (pitchRatio, 0.03125, 32.0);
    speedRatio_ = std::clamp (speedRatio, 0.03125, 32.0);
}

void TimeStretch::setLooping (bool looping) noexcept
{
    looping_ = looping;
}

void TimeStretch::rewind() noexcept
{
    outputPosition_ = 0.0;
    readyCount_ = 0;
    readyRead_ = 0;

    std::fill (overlapLeft_.begin(), overlapLeft_.end(), 0.0f);
    std::fill (overlapRight_.begin(), overlapRight_.end(), 0.0f);

    active_ = sample_ != nullptr && ! sample_->empty();
}

//==============================================================================

float TimeStretch::sourceAt (int channel, double position) const noexcept
{
    if (sample_ == nullptr)
        return 0.0f;

    // A window is up to `windowSize * pitchRatio` samples long, so reads near the end of the
    // region run past it. When looping, they must come back round to the region start — the
    // region is what the player chose, and reading past it would leak material they excluded.
    // Wrapping by position alone keeps this a pure function, which block-size invariance needs.
    const auto span = regionEnd_ - regionStart_;

    if (looping_ && span > 0.0)
    {
        const auto offset = std::fmod (position - regionStart_, span);
        position = regionStart_ + (offset < 0.0 ? offset + span : offset);
    }

    // Linear interpolation is enough here: the correlation search, not the interpolator, is what
    // determines the quality of a WSOLA join.
    const auto index = static_cast<int> (std::floor (position));
    const auto fraction = static_cast<float> (position - static_cast<double> (index));

    const auto a = sample_->at (channel, index);
    const auto b = sample_->at (channel, index + 1);

    return a + (b - a) * fraction;
}

double TimeStretch::nominalReadPosition() const noexcept
{
    // Derived from total output produced, so it is independent of block boundaries.
    const auto span = regionEnd_ - regionStart_;
    auto position = regionStart_ + outputPosition_ * speedRatio_;

    if (looping_ && span > 0.0)
    {
        // Wrap into the region rather than running off the end.
        const auto offset = std::fmod (position - regionStart_, span);
        position = regionStart_ + (offset < 0.0 ? offset + span : offset);
    }

    return position;
}

int TimeStretch::findBestOffset (double nominal) const noexcept
{
    // Match the start of the candidate window against the overlap tail left by the previous one.
    // Sliding to the best match is the whole difference between WSOLA and plain overlap-add:
    // without it, tonal material phase-cancels at every join and warbles.
    if (searchRange_ <= 0 || overlapLeft_.empty())
        return 0;

    auto bestOffset = 0;
    auto bestScore = -std::numeric_limits<double>::infinity();

    // Comparing every sample would be wasteful; a stride still finds the right period.
    constexpr int kStride = 4;
    const auto compareLength = hopSize_;

    const auto scoreAt = [this, compareLength] (double nominalPosition, int offset)
    {
        double correlation = 0.0;
        double energy = 0.0;

        for (int i = 0; i < compareLength; i += kStride)
        {
            // The candidate must be read at the same rate the reference tail was written at —
            // that is, scaled by the pitch ratio. Reading it at rate 1 compares a transposed
            // sequence against an untransposed one, and the correlation then means nothing: the
            // search returns an arbitrary offset and every join lands at a random phase.
            const auto candidate = static_cast<double> (
                sourceAt (0, nominalPosition + static_cast<double> (offset)
                                 + static_cast<double> (i) * pitchRatio_));
            const auto reference = static_cast<double> (
                overlapLeft_[static_cast<std::size_t> (i)]);

            correlation += candidate * reference;
            energy += candidate * candidate;
        }

        // Normalised, so a loud window cannot win on level alone.
        return correlation / std::sqrt (energy + 1.0e-9);
    };

    // Search outward from zero rather than left to right. On periodic material every offset a
    // whole period away scores identically — an exact tie by Cauchy-Schwarz — and a strict `>`
    // keeps whichever was tested first. Testing the centre first means a tie resolves to the
    // smallest displacement, so at unity ratios the stretcher sits still and is transparent
    // instead of jumping a fixed distance back for no gain.
    for (int distance = 0; distance <= searchRange_; distance += 2)
    {
        for (const auto offset : { distance, -distance })
        {
            const auto score = scoreAt (nominal, offset);

            if (score > bestScore)
            {
                bestScore = score;
                bestOffset = offset;
            }

            if (distance == 0)
                break;
        }
    }

    return bestOffset;
}

void TimeStretch::synthesiseWindow() noexcept
{
    const auto nominal = nominalReadPosition();
    const auto offset = findBestOffset (nominal);
    const auto readPosition = nominal + static_cast<double> (offset);

    const auto stereo = sample_ != nullptr && sample_->isStereo();

    // The first half cross-fades against the previous window's tail; the second half becomes
    // the next window's tail.
    for (int i = 0; i < hopSize_; ++i)
    {
        // Pitch is applied by reading the source faster or slower *within* the window, which is
        // independent of how fast the window position advances through the source. That
        // separation is what lets pitch and length move independently.
        const auto sourceOffset = static_cast<double> (i) * pitchRatio_;

        const auto fadeIn = window_[static_cast<std::size_t> (i)];
        const auto fadeOut = window_[static_cast<std::size_t> (i + hopSize_)];

        const auto l = sourceAt (0, readPosition + sourceOffset);
        const auto r = stereo ? sourceAt (1, readPosition + sourceOffset) : l;

        readyLeft_[static_cast<std::size_t> (i)] =
            overlapLeft_[static_cast<std::size_t> (i)] * fadeOut + l * fadeIn;
        readyRight_[static_cast<std::size_t> (i)] =
            overlapRight_[static_cast<std::size_t> (i)] * fadeOut + r * fadeIn;
    }

    for (int i = 0; i < hopSize_; ++i)
    {
        const auto sourceOffset = static_cast<double> (i + hopSize_) * pitchRatio_;

        overlapLeft_[static_cast<std::size_t> (i)] = sourceAt (0, readPosition + sourceOffset);
        overlapRight_[static_cast<std::size_t> (i)] =
            stereo ? sourceAt (1, readPosition + sourceOffset) : overlapLeft_[static_cast<std::size_t> (i)];
    }

    readyCount_ = hopSize_;
    readyRead_ = 0;

    // One hop of output has been produced.
    outputPosition_ += static_cast<double> (hopSize_);

    if (! looping_ && nominalReadPosition() >= regionEnd_)
        active_ = false;
}

//==============================================================================

void TimeStretch::process (float* left, float* right, int numSamples) noexcept
{
    if (sample_ == nullptr || sample_->empty() || windowSize_ <= 0)
    {
        std::fill_n (left, numSamples, 0.0f);
        std::fill_n (right, numSamples, 0.0f);
        return;
    }

    for (int i = 0; i < numSamples; ++i)
    {
        if (readyRead_ >= readyCount_)
        {
            if (! active_)
            {
                left[i] = 0.0f;
                right[i] = 0.0f;
                continue;
            }

            synthesiseWindow();
        }

        left[i] = readyLeft_[static_cast<std::size_t> (readyRead_)];
        right[i] = readyRight_[static_cast<std::size_t> (readyRead_)];
        ++readyRead_;
    }
}

} // namespace bud::dsp
