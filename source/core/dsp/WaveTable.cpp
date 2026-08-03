#include "WaveTable.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace bud::dsp
{

namespace
{
    constexpr double kTwoPi = 2.0 * std::numbers::pi;

    float harmonicAt (const HarmonicSpec& spec, int index) noexcept
    {
        return index < static_cast<int> (spec.amplitude.size())
             ? spec.amplitude[static_cast<std::size_t> (index)] : 0.0f;
    }

    float phaseAt (const HarmonicSpec& spec, int index) noexcept
    {
        return index < static_cast<int> (spec.phase.size())
             ? spec.phase[static_cast<std::size_t> (index)] : 0.0f;
    }
}

//==============================================================================

int WaveTable::harmonicsAtMip (int mip) noexcept
{
    return std::max (1, kMaxHarmonics >> std::clamp (mip, 0, kMipLevels - 1));
}

int WaveTable::sizeAtMip (int mip) noexcept
{
    return std::max (kMinFrameSize, kFrameSize >> std::clamp (mip, 0, kMipLevels - 1));
}

void WaveTable::build (std::span<const HarmonicSpec> frames)
{
    frames_.clear();
    frameCount_ = 0;

    if (frames.empty())
        return;

    frameCount_ = static_cast<int> (frames.size());
    renderMips (frames);
}

void WaveTable::renderMips (std::span<const HarmonicSpec> frames)
{
    frames_.resize (kMipLevels);

    for (int mip = 0; mip < kMipLevels; ++mip)
    {
        const auto size = sizeAtMip (mip);
        const auto limit = harmonicsAtMip (mip);

        auto& level = frames_[static_cast<std::size_t> (mip)];
        level.assign (static_cast<std::size_t> (size) * static_cast<std::size_t> (frameCount_),
                      0.0f);

        for (int frame = 0; frame < frameCount_; ++frame)
        {
            const auto& spec = frames[static_cast<std::size_t> (frame)];
            const auto base = static_cast<std::size_t> (frame) * static_cast<std::size_t> (size);

            // A harmonic below Nyquist for this level, and one the caller actually asked for.
            const auto highest = std::min (limit, static_cast<int> (spec.amplitude.size()));

            for (int h = 0; h < highest; ++h)
            {
                const auto amplitude = harmonicAt (spec, h);

                if (amplitude == 0.0f)
                    continue;

                // A rotating phasor rather than a sin() per sample. The whole pyramid is built
                // at startup for every table, and calling the maths library some tens of
                // millions of times is the difference between instant and noticeable.
                const auto step = kTwoPi * static_cast<double> (h + 1)
                                / static_cast<double> (size);

                const auto cosStep = std::cos (step);
                const auto sinStep = std::sin (step);

                const auto start = static_cast<double> (phaseAt (spec, h));
                auto re = std::cos (start);
                auto im = std::sin (start);

                for (int i = 0; i < size; ++i)
                {
                    level[base + static_cast<std::size_t> (i)] +=
                        static_cast<float> (im * static_cast<double> (amplitude));

                    const auto nextRe = re * cosStep - im * sinStep;
                    im = re * sinStep + im * cosStep;
                    re = nextRe;
                }
            }
        }
    }

    // Normalise the whole pyramid by the peak of the *base* level, so the mips stay in step with
    // each other. Normalising each level on its own would make the sound jump in volume as the
    // pitch crossed a mip boundary.
    auto peak = 0.0f;

    for (const auto v : frames_[0])
        peak = std::max (peak, std::abs (v));

    if (peak > 0.0f)
    {
        const auto scale = 0.9f / peak;

        for (auto& level : frames_)
            for (auto& v : level)
                v *= scale;
    }
}

void WaveTable::buildFromCycles (std::span<const std::span<const float>> cycles)
{
    frames_.clear();
    frameCount_ = 0;

    if (cycles.empty())
        return;

    std::vector<HarmonicSpec> specs;
    specs.reserve (cycles.size());

    for (const auto cycle : cycles)
    {
        HarmonicSpec spec;

        if (cycle.empty())
        {
            specs.push_back (std::move (spec));
            continue;
        }

        // Resample the cycle onto the analysis length first, so a cycle of any length can be
        // handed in. Linear interpolation is enough: what follows only keeps the low harmonics
        // anyway, and those are exactly the ones interpolation preserves.
        std::vector<double> resampled (static_cast<std::size_t> (kFrameSize));
        const auto length = static_cast<double> (cycle.size());

        for (int i = 0; i < kFrameSize; ++i)
        {
            const auto position = static_cast<double> (i) / kFrameSize * length;
            const auto index = static_cast<std::size_t> (position);
            const auto fraction = position - static_cast<double> (index);

            const auto a = cycle[index % cycle.size()];
            const auto b = cycle[(index + 1) % cycle.size()];

            resampled[static_cast<std::size_t> (i)] =
                static_cast<double> (a) + (static_cast<double> (b) - static_cast<double> (a))
                                        * fraction;
        }

        // A plain DFT over the harmonics we keep. O(N·H) once at build time, against the
        // complexity of an FFT the project would otherwise have to carry for this alone.
        spec.amplitude.resize (static_cast<std::size_t> (kMaxHarmonics));
        spec.phase.resize (static_cast<std::size_t> (kMaxHarmonics));

        for (int h = 0; h < kMaxHarmonics; ++h)
        {
            const auto step = kTwoPi * static_cast<double> (h + 1) / kFrameSize;
            const auto cosStep = std::cos (step);
            const auto sinStep = std::sin (step);

            auto re = 1.0, im = 0.0;
            auto sumRe = 0.0, sumIm = 0.0;

            for (int i = 0; i < kFrameSize; ++i)
            {
                sumRe += resampled[static_cast<std::size_t> (i)] * re;
                sumIm += resampled[static_cast<std::size_t> (i)] * im;

                const auto nextRe = re * cosStep - im * sinStep;
                im = re * sinStep + im * cosStep;
                re = nextRe;
            }

            sumRe *= 2.0 / kFrameSize;
            sumIm *= 2.0 / kFrameSize;

            spec.amplitude[static_cast<std::size_t> (h)] =
                static_cast<float> (std::sqrt (sumRe * sumRe + sumIm * sumIm));

            // The synthesis side sums sines, so the phase is measured against a sine too.
            spec.phase[static_cast<std::size_t> (h)] =
                static_cast<float> (std::atan2 (sumRe, sumIm));
        }

        specs.push_back (std::move (spec));
    }

    frameCount_ = static_cast<int> (specs.size());
    renderMips (specs);
}

int WaveTable::mipForFrequency (double hz, double sampleRate) const noexcept
{
    const auto nyquist = std::max (1.0, sampleRate * 0.5);
    const auto frequency = std::abs (hz);

    if (frequency <= 0.0)
        return 0;

    // The highest harmonic that still fits, and the coarsest level that keeps only those.
    const auto allowed = nyquist / frequency;

    auto mip = 0;

    while (mip < kMipLevels - 1
           && static_cast<double> (harmonicsAtMip (mip)) > allowed)
        ++mip;

    return mip;
}

float WaveTable::read (double phase01, float position01, int mip) const noexcept
{
    if (frames_.empty() || frameCount_ == 0)
        return 0.0f;

    mip = std::clamp (mip, 0, kMipLevels - 1);

    const auto& level = frames_[static_cast<std::size_t> (mip)];
    const auto size = sizeAtMip (mip);

    // Wrap rather than clamp: the caller's phase is allowed to sit exactly on 1.0 after an
    // increment, and clamping there would flatten the last sample of every cycle.
    auto phase = phase01 - std::floor (phase01);

    const auto x = phase * static_cast<double> (size);
    const auto i0 = static_cast<int> (x);
    const auto frac = static_cast<float> (x - static_cast<double> (i0));

    const auto a0 = static_cast<std::size_t> (i0 % size);
    const auto a1 = static_cast<std::size_t> ((i0 + 1) % size);

    // Where between the frames.
    const auto p = std::clamp (position01, 0.0f, 1.0f) * static_cast<float> (frameCount_ - 1);
    const auto f0 = static_cast<int> (p);
    const auto f1 = std::min (f0 + 1, frameCount_ - 1);
    const auto frameFrac = p - static_cast<float> (f0);

    const auto base0 = static_cast<std::size_t> (f0) * static_cast<std::size_t> (size);
    const auto base1 = static_cast<std::size_t> (f1) * static_cast<std::size_t> (size);

    const auto lower = level[base0 + a0] + (level[base0 + a1] - level[base0 + a0]) * frac;
    const auto upper = level[base1 + a0] + (level[base1 + a1] - level[base1 + a0]) * frac;

    return lower + (upper - lower) * frameFrac;
}

//==============================================================================

void WaveTableOscillator::prepare (double sampleRate) noexcept
{
    sampleRate_ = std::max (1.0, sampleRate);
    reset();
}

void WaveTableOscillator::reset() noexcept
{
    phase_ = 0.0;
    increment_ = 0.0;
    frequency_ = 0.0;
    mip_ = 0;
}

void WaveTableOscillator::setFrequency (double hz) noexcept
{
    frequency_ = std::max (0.0, hz);
    increment_ = frequency_ / sampleRate_;

    if (table_ != nullptr)
        mip_ = table_->mipForFrequency (frequency_, sampleRate_);
}

void WaveTableOscillator::setPosition (float position01) noexcept
{
    position_ = std::clamp (position01, 0.0f, 1.0f);
}

float WaveTableOscillator::next() noexcept
{
    if (table_ == nullptr || table_->empty())
        return 0.0f;

    const auto out = table_->read (phase_, position_, mip_);

    phase_ += increment_;

    if (phase_ >= 1.0)
        phase_ -= std::floor (phase_);

    return out;
}

} // namespace bud::dsp
