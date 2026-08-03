#include "WaveTables.h"

#include <algorithm>
#include <cmath>
#include <numbers>

namespace bud::factory
{

namespace
{
    constexpr double kPi = std::numbers::pi;

    /// A frame built by evaluating a function of the harmonic number.
    template <typename Amplitude>
    dsp::HarmonicSpec spectrum (int harmonics, Amplitude amplitude)
    {
        dsp::HarmonicSpec spec;
        spec.amplitude.resize (static_cast<std::size_t> (harmonics));

        for (int h = 0; h < harmonics; ++h)
            spec.amplitude[static_cast<std::size_t> (h)] =
                static_cast<float> (amplitude (h + 1));   // 1 is the fundamental

        return spec;
    }

    constexpr int kH = dsp::WaveTable::kMaxHarmonics;

    //==========================================================================
    // The factory set. Each table morphs across its frames, because a table that does not is
    // just a waveform — the movement is the instrument.

    /// Sine through triangle and saw to square: the table every wavetable synth opens with,
    /// and the one that makes the MOVE knob explain itself in a single turn.
    dsp::WaveTable makeBasic()
    {
        dsp::HarmonicSpec frames[4];

        frames[0] = spectrum (1, [] (int) { return 1.0; });

        frames[1] = spectrum (kH, [] (int n) {
            return n % 2 == 1 ? 1.0 / (static_cast<double> (n) * n) * (n % 4 == 1 ? 1 : -1) : 0.0;
        });

        frames[2] = spectrum (kH, [] (int n) { return 1.0 / n; });

        frames[3] = spectrum (kH, [] (int n) {
            return n % 2 == 1 ? 1.0 / n : 0.0;
        });

        dsp::WaveTable table;
        table.build (frames);
        return table;
    }

    /// A pulse narrowing from a square to a thin spike. Classic PWM, but as a table rather than
    /// as two detuned saws, so the width is a position rather than a modulation.
    dsp::WaveTable makePulse()
    {
        dsp::HarmonicSpec frames[5];

        for (int f = 0; f < 5; ++f)
        {
            const auto width = 0.5 - 0.44 * (static_cast<double> (f) / 4.0);

            frames[f] = spectrum (kH, [width] (int n) {
                return std::sin (kPi * static_cast<double> (n) * width)
                     / (static_cast<double> (n) * kPi) * 2.0;
            });
        }

        dsp::WaveTable table;
        table.build (frames);
        return table;
    }

    /// Formant peaks that slide up through the harmonic series — a vowel opening.
    dsp::WaveTable makeFormant()
    {
        dsp::HarmonicSpec frames[6];

        for (int f = 0; f < 6; ++f)
        {
            const auto centre = 2.0 + std::pow (2.0, 1.0 + static_cast<double> (f) * 0.62);
            const auto width = 1.6 + static_cast<double> (f) * 0.8;

            frames[f] = spectrum (kH, [centre, width] (int n) {
                const auto d = (static_cast<double> (n) - centre) / width;
                const auto peak = std::exp (-d * d);
                return (0.9 / n) * (0.25 + peak);
            });
        }

        dsp::WaveTable table;
        table.build (frames);
        return table;
    }

    /// Odd harmonics only, thinning from a full square to a near sine — a clarinet-ish sweep.
    dsp::WaveTable makeHollow()
    {
        dsp::HarmonicSpec frames[5];

        for (int f = 0; f < 5; ++f)
        {
            const auto tilt = 1.0 + static_cast<double> (f) * 1.3;

            frames[f] = spectrum (kH, [tilt] (int n) {
                return n % 2 == 1 ? std::pow (1.0 / n, tilt) : 0.0;
            });
        }

        dsp::WaveTable table;
        table.build (frames);
        return table;
    }

    /// Sparse high partials with a slow roll-off: struck metal rather than a bowed string.
    dsp::WaveTable makeGlass()
    {
        dsp::HarmonicSpec frames[4];

        for (int f = 0; f < 4; ++f)
        {
            const auto spread = 1 + f * 2;

            frames[f] = spectrum (kH, [spread] (int n) {
                if (n != 1 && n % (spread + 1) != 0)
                    return 0.0;

                return 1.0 / std::pow (static_cast<double> (n), 0.7);
            });
        }

        dsp::WaveTable table;
        table.build (frames);
        return table;
    }

    /// Alternating phase across the harmonics, which is what gives digital tables their hard,
    /// slightly hollow edge — the amplitudes alone do not produce it.
    dsp::WaveTable makeDigital()
    {
        dsp::HarmonicSpec frames[4];

        for (int f = 0; f < 4; ++f)
        {
            auto spec = spectrum (kH, [] (int n) { return 1.0 / std::sqrt (n); });
            spec.phase.resize (static_cast<std::size_t> (kH));

            const auto twist = static_cast<double> (f) * 0.8;

            for (int h = 0; h < kH; ++h)
                spec.phase[static_cast<std::size_t> (h)] =
                    static_cast<float> (twist * kPi * static_cast<double> (h % 3));

            frames[f] = std::move (spec);
        }

        dsp::WaveTable table;
        table.build (frames);
        return table;
    }

    /// A bass table: strong fundamental, a growl of upper harmonics that comes and goes.
    dsp::WaveTable makeGrowl()
    {
        dsp::HarmonicSpec frames[5];

        for (int f = 0; f < 5; ++f)
        {
            const auto growl = static_cast<double> (f) / 4.0;

            frames[f] = spectrum (kH, [growl] (int n) {
                const auto body = 1.0 / n;
                const auto d = (static_cast<double> (n) - (3.0 + growl * 12.0)) / 3.0;
                return body * (1.0 + growl * 2.4 * std::exp (-d * d));
            });
        }

        dsp::WaveTable table;
        table.build (frames);
        return table;
    }

    struct FactoryEntry { const char* name; dsp::WaveTable (*make)(); };

    constexpr FactoryEntry kFactory[] = {
        { "BASIC",   makeBasic },
        { "PULSE",   makePulse },
        { "FORMANT", makeFormant },
        { "HOLLOW",  makeHollow },
        { "GLASS",   makeGlass },
        { "DIGITAL", makeDigital },
        { "GROWL",   makeGrowl },
    };
}

//==============================================================================

WaveTableBank::WaveTableBank() = default;

void WaveTableBank::generateFactory()
{
    // Rebuilding replaces the factory entries and leaves anything custom in place, so a sample
    // rate change does not throw away a table someone added.
    entries_.erase (entries_.begin(),
                    entries_.begin() + std::min<std::ptrdiff_t> (factoryCount_,
                                                                 static_cast<std::ptrdiff_t> (entries_.size())));

    std::vector<Entry> built;
    built.reserve (std::size (kFactory));

    for (const auto& entry : kFactory)
    {
        Entry made;
        made.name = entry.name;
        made.table = std::make_unique<dsp::WaveTable> (entry.make());
        built.push_back (std::move (made));
    }

    factoryCount_ = static_cast<int> (built.size());

    entries_.insert (entries_.begin(), std::make_move_iterator (built.begin()),
                     std::make_move_iterator (built.end()));
}

const dsp::WaveTable* WaveTableBank::at (int index) const noexcept
{
    if (entries_.empty())
        return nullptr;

    // The SOUND knob spans 0-127 and a bank holding fewer wraps rather than dead-zoning the top,
    // which is how every other bank in the instrument behaves.
    const auto wrapped = static_cast<std::size_t> (
        std::max (0, index) % static_cast<int> (entries_.size()));

    return entries_[wrapped].table.get();
}

std::string_view WaveTableBank::nameAt (int index) const noexcept
{
    if (entries_.empty())
        return {};

    const auto wrapped = static_cast<std::size_t> (
        std::max (0, index) % static_cast<int> (entries_.size()));

    return entries_[wrapped].name;
}

int WaveTableBank::indexOf (std::string_view name) const noexcept
{
    for (std::size_t i = 0; i < entries_.size(); ++i)
        if (entries_[i].name == name)
            return static_cast<int> (i);

    return -1;
}

int WaveTableBank::addHarmonic (std::string_view name, std::span<const dsp::HarmonicSpec> frames)
{
    if (frames.empty())
        return -1;

    Entry entry;
    entry.name = name;
    entry.table = std::make_unique<dsp::WaveTable>();
    entry.table->build (frames);

    if (entry.table->empty())
        return -1;

    entries_.push_back (std::move (entry));
    return static_cast<int> (entries_.size()) - 1;
}

int WaveTableBank::addCycles (std::string_view name,
                              std::span<const std::span<const float>> cycles)
{
    if (cycles.empty())
        return -1;

    Entry entry;
    entry.name = name;
    entry.table = std::make_unique<dsp::WaveTable>();
    entry.table->buildFromCycles (cycles);

    if (entry.table->empty())
        return -1;

    entries_.push_back (std::move (entry));
    return static_cast<int> (entries_.size()) - 1;
}

void WaveTableBank::clear()
{
    entries_.clear();
    factoryCount_ = 0;
}

} // namespace bud::factory
