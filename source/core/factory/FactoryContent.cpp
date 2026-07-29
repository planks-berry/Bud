#include "FactoryContent.h"

#include "../dsp/Noise.h"

#include <algorithm>
#include <cmath>
#include <numbers>
#include <string>

namespace bud::factory
{

namespace
{
    constexpr double kTwoPi = 2.0 * std::numbers::pi;

    /// Per-bank counts, adding up to the 132 the device ships (p. 116).
    struct BankPlan { SoundBank bank; int count; };

    constexpr BankPlan kPlan[] = {
        { SoundBank::BD,    16 },
        { SoundBank::SD,    16 },
        { SoundBank::HH_CY, 20 },
        { SoundBank::CP,     8 },
        { SoundBank::ST,     8 },
        { SoundBank::TT,    12 },
        { SoundBank::PC,    20 },
        { SoundBank::SY_BS, 16 },
        { SoundBank::FX,    16 },
    };

    //==========================================================================
    // Small synthesis helpers. Everything is deterministic: a sound's index seeds its noise, so
    // regenerating produces identical audio.

    struct Canvas
    {
        std::vector<float> data;
        double sampleRate;

        Canvas (double rate, double seconds)
            : data (static_cast<std::size_t> (rate * seconds), 0.0f), sampleRate (rate) {}

        int length() const noexcept { return static_cast<int> (data.size()); }
        double time (int i) const noexcept { return static_cast<double> (i) / sampleRate; }

        void add (int i, double value) noexcept
        {
            data[static_cast<std::size_t> (i)] += static_cast<float> (value);
        }

        /// Trim trailing silence and normalise to a headroom-friendly peak.
        void finish (float peak = 0.85f)
        {
            // A guard rather than a fix: nothing here should produce a non-finite sample, but a
            // single one would propagate silently through every voice that played the sound.
            for (auto& v : data)
                if (! std::isfinite (v))
                    v = 0.0f;

            auto maximum = 0.0f;
            for (auto v : data)
                maximum = std::max (maximum, std::abs (v));

            if (maximum > 0.0f)
            {
                const auto scale = peak / maximum;
                for (auto& v : data)
                    v *= scale;
            }

            // A short fade at the tail so a truncated sound does not click.
            const auto fade = std::min<int> (256, length());
            for (int i = 0; i < fade; ++i)
            {
                const auto g = static_cast<float> (i) / static_cast<float> (fade);
                data[data.size() - 1 - static_cast<std::size_t> (i)] *= g;
            }
        }
    };

    double envExp (double t, double decay) noexcept
    {
        return std::exp (-t / std::max (1.0e-4, decay));
    }

    double sine (double t, double hz, double phase = 0.0) noexcept
    {
        return std::sin (t * kTwoPi * hz + phase);
    }

    /// A band-passed noise burst, the backbone of most percussion.
    void addNoise (Canvas& c, dsp::Noise& noise, double decay, double centreHz, double q,
                   double gain, double startTime = 0.0)
    {
        // Chamberlin state-variable band-pass, enough to colour noise without a full filter
        // object. It is only conditionally stable: the centre frequency has to stay below
        // roughly a sixth of the sample rate and the coefficient below 1, or it diverges and
        // fills the sound with infinities. The hi-hat and effect banks both ask for centre
        // frequencies above that limit, so clamp rather than trusting the caller.
        auto low = 0.0, band = 0.0;
        const auto safeCentre = std::min (centreHz, c.sampleRate / 6.0);
        const auto f = std::clamp (2.0 * std::sin (std::numbers::pi * safeCentre / c.sampleRate),
                                   0.0, 1.0);
        const auto damp = std::clamp (1.0 / std::max (0.5, q), 0.05, 1.0);

        for (int i = 0; i < c.length(); ++i)
        {
            const auto t = c.time (i);
            const auto x = static_cast<double> (noise.next());

            const auto high = x - low - damp * band;
            band += f * high;
            low += f * band;

            if (t < startTime)
                continue;

            c.add (i, band * envExp (t - startTime, decay) * gain);
        }
    }

    /// A pitched body with a falling pitch envelope.
    void addBody (Canvas& c, double startHz, double endHz, double sweep, double decay,
                  double gain, double curve = 1.0)
    {
        double phase = 0.0;

        for (int i = 0; i < c.length(); ++i)
        {
            const auto t = c.time (i);
            const auto k = std::pow (envExp (t, sweep), curve);
            const auto hz = endHz + (startHz - endHz) * k;

            phase += kTwoPi * hz / c.sampleRate;
            c.add (i, std::sin (phase) * envExp (t, decay) * gain);
        }
    }

    /// A cluster of inharmonic squares — the analog hi-hat structure.
    void addMetal (Canvas& c, double base, double decay, double gain, double spread)
    {
        static constexpr double ratios[] = { 1.0, 1.4471, 1.6170, 1.9265, 2.5028, 2.6637 };
        double phases[6] {};

        // A high-pass on the way out is what turns a buzz into a hat.
        double previous = 0.0, filtered = 0.0;

        for (int i = 0; i < c.length(); ++i)
        {
            const auto t = c.time (i);
            double sum = 0.0;

            for (int osc = 0; osc < 6; ++osc)
            {
                const auto ratio = 1.0 + (ratios[osc] - 1.0) * spread;
                phases[osc] += kTwoPi * base * ratio / c.sampleRate;
                sum += std::sin (phases[osc]) > 0.0 ? 1.0 : -1.0;
            }

            sum /= 6.0;

            filtered = 0.93 * (filtered + sum - previous);
            previous = sum;

            c.add (i, filtered * envExp (t, decay) * gain);
        }
    }

    //==========================================================================
    // Bank generators. Each takes an index and varies its character across the bank, so a bank
    // sweeps from its most typical sound to its most extreme.

    SampleData makeKick (int index, int count, double rate)
    {
        const auto v = static_cast<double> (index) / std::max (1, count - 1);
        Canvas c (rate, 0.15 + 0.55 * (1.0 - v * 0.6));

        addBody (c, 110.0 + v * 180.0, 42.0 + v * 18.0, 0.008 + v * 0.03,
                 0.09 + (1.0 - v) * 0.38, 1.0, 1.0 + v);

        dsp::Noise noise (0x1000u + static_cast<std::uint32_t> (index));
        addNoise (c, noise, 0.002 + v * 0.004, 1800.0 + v * 2600.0, 1.2, 0.12 + v * 0.22);

        c.finish();
        return { c.data, {}, rate, "BD" + std::to_string (index + 1), 0.0 };
    }

    SampleData makeSnare (int index, int count, double rate)
    {
        const auto v = static_cast<double> (index) / std::max (1, count - 1);
        Canvas c (rate, 0.12 + 0.34 * (1.0 - v * 0.4));

        addBody (c, 210.0 + v * 120.0, 175.0 + v * 90.0, 0.01, 0.05 + (1.0 - v) * 0.12, 0.55);
        addBody (c, 340.0 + v * 180.0, 300.0 + v * 140.0, 0.01, 0.04 + (1.0 - v) * 0.09, 0.3);

        dsp::Noise noise (0x2000u + static_cast<std::uint32_t> (index));
        addNoise (c, noise, 0.035 + (1.0 - v) * 0.12, 2400.0 + v * 3200.0, 0.9 + v * 1.6, 0.8);

        c.finish();
        return { c.data, {}, rate, "SD" + std::to_string (index + 1), 0.0 };
    }

    SampleData makeHat (int index, int count, double rate)
    {
        const auto v = static_cast<double> (index) / std::max (1, count - 1);

        // The bank sweeps from tight closed hats through open hats into cymbals.
        const auto openness = v * v;
        const auto decay = 0.018 + openness * 1.1;

        Canvas c (rate, std::min (2.0, decay * 4.0 + 0.05));

        addMetal (c, 300.0 + v * 140.0, decay, 0.9, 0.8 + v * 0.5);

        dsp::Noise noise (0x3000u + static_cast<std::uint32_t> (index));
        addNoise (c, noise, decay * 0.7, 7000.0 + v * 4000.0, 0.7, 0.35);

        c.finish (0.7f);
        return { c.data, {}, rate, "HH" + std::to_string (index + 1), 0.0 };
    }

    SampleData makeClap (int index, int count, double rate)
    {
        const auto v = static_cast<double> (index) / std::max (1, count - 1);
        Canvas c (rate, 0.42);

        dsp::Noise noise (0x4000u + static_cast<std::uint32_t> (index));

        // Three fast repeats then a longer body — the structure that reads as a clap rather
        // than a noise burst.
        const double taps[] = { 0.0, 0.010 + v * 0.006, 0.021 + v * 0.010, 0.033 + v * 0.014 };

        for (int tap = 0; tap < 3; ++tap)
            addNoise (c, noise, 0.014, 1500.0 + v * 1400.0, 1.1, 0.55, taps[tap]);

        addNoise (c, noise, 0.10 + v * 0.13, 1300.0 + v * 900.0, 1.4, 0.7, taps[3]);

        c.finish (0.8f);
        return { c.data, {}, rate, "CP" + std::to_string (index + 1), 0.0 };
    }

    SampleData makeStick (int index, int count, double rate)
    {
        const auto v = static_cast<double> (index) / std::max (1, count - 1);
        Canvas c (rate, 0.10);

        // Two inharmonic partials give the woody click of a rim or stick.
        for (int i = 0; i < c.length(); ++i)
        {
            const auto t = c.time (i);
            const auto e = envExp (t, 0.008 + v * 0.014);
            c.add (i, (sine (t, 1500.0 + v * 900.0) * 0.6
                       + sine (t, 2400.0 + v * 1500.0) * 0.4) * e);
        }

        dsp::Noise noise (0x5000u + static_cast<std::uint32_t> (index));
        addNoise (c, noise, 0.004, 5000.0 + v * 3000.0, 0.8, 0.35);

        c.finish (0.8f);
        return { c.data, {}, rate, "ST" + std::to_string (index + 1), 0.0 };
    }

    SampleData makeTom (int index, int count, double rate)
    {
        const auto v = static_cast<double> (index) / std::max (1, count - 1);

        // Low toms at the bottom of the bank through to high toms at the top.
        const auto pitch = 80.0 * std::pow (2.6, v);
        Canvas c (rate, 0.55 - v * 0.25);

        addBody (c, pitch * 1.7, pitch, 0.02, 0.20 + (1.0 - v) * 0.22, 1.0);

        dsp::Noise noise (0x6000u + static_cast<std::uint32_t> (index));
        addNoise (c, noise, 0.02, pitch * 6.0, 1.0, 0.14);

        c.finish();
        return { c.data, {}, rate, "TT" + std::to_string (index + 1), 0.0 };
    }

    SampleData makePercussion (int index, int count, double rate)
    {
        const auto v = static_cast<double> (index) / std::max (1, count - 1);
        dsp::Noise noise (0x7000u + static_cast<std::uint32_t> (index));

        // Alternate between metallic, wooden and skin-like characters across the bank, so the
        // bank covers a spread rather than sweeping one parameter.
        const auto character = index % 3;
        Canvas c (rate, 0.18 + 0.4 * (1.0 - v * 0.5));

        if (character == 0)
        {
            addMetal (c, 420.0 + v * 900.0, 0.05 + v * 0.12, 0.7, 1.0 + v);
            addNoise (c, noise, 0.03, 4200.0 + v * 3000.0, 1.0, 0.3);
        }
        else if (character == 1)
        {
            const auto pitch = 200.0 + v * 700.0;
            for (int i = 0; i < c.length(); ++i)
            {
                const auto t = c.time (i);
                c.add (i, (sine (t, pitch) * 0.7 + sine (t, pitch * 2.7) * 0.3)
                              * envExp (t, 0.02 + v * 0.05));
            }
            addNoise (c, noise, 0.006, 3000.0, 0.9, 0.25);
        }
        else
        {
            addBody (c, 340.0 + v * 260.0, 150.0 + v * 200.0, 0.03, 0.10 + v * 0.16, 0.85);
            addNoise (c, noise, 0.05 + v * 0.05, 1800.0 + v * 1600.0, 1.3, 0.4);
        }

        c.finish (0.8f);
        return { c.data, {}, rate, "PC" + std::to_string (index + 1), 0.0 };
    }

    SampleData makeSynth (int index, int count, double rate)
    {
        const auto v = static_cast<double> (index) / std::max (1, count - 1);

        // Pitched synth and bass tones, an octave and a half apart across the bank.
        const auto pitch = 55.0 * std::pow (2.0, v * 2.0);
        Canvas c (rate, 0.9);

        double phase = 0.0;
        const auto detune = 1.0 + 0.004 * (1.0 + v);
        double phase2 = 0.0;

        for (int i = 0; i < c.length(); ++i)
        {
            const auto t = c.time (i);
            phase += kTwoPi * pitch / rate;
            phase2 += kTwoPi * pitch * detune / rate;

            // A saw-ish blend, softened as the bank rises so the top does not fizz.
            const auto saw = std::fmod (phase / kTwoPi, 1.0) * 2.0 - 1.0;
            const auto saw2 = std::fmod (phase2 / kTwoPi, 1.0) * 2.0 - 1.0;
            const auto mix = (saw + saw2) * 0.5 * (1.0 - v * 0.4) + sine (t, pitch) * v * 0.5;

            c.add (i, mix * envExp (t, 0.20 + (1.0 - v) * 0.5));
        }

        c.finish (0.7f);
        return { c.data, {}, rate, "SY" + std::to_string (index + 1), 0.0 };
    }

    SampleData makeEffect (int index, int count, double rate)
    {
        const auto v = static_cast<double> (index) / std::max (1, count - 1);
        dsp::Noise noise (0x8000u + static_cast<std::uint32_t> (index));
        Canvas c (rate, 0.8 + v * 0.9);

        if (index % 2 == 0)
        {
            // Rising sweep.
            double phase = 0.0;
            for (int i = 0; i < c.length(); ++i)
            {
                const auto t = c.time (i);
                const auto progress = t / (c.length() / rate);
                const auto hz = 120.0 * std::pow (40.0, progress * (0.4 + v * 0.6));
                phase += kTwoPi * hz / rate;
                c.add (i, std::sin (phase) * (0.25 + progress * 0.75) * (1.0 - progress * 0.3));
            }
        }
        else
        {
            // Noise wash with a moving filter.
            addNoise (c, noise, 0.35 + v * 0.6, 500.0 + v * 5000.0, 1.5 + v * 3.0, 0.9);
        }

        c.finish (0.65f);
        return { c.data, {}, rate, "FX" + std::to_string (index + 1), 0.0 };
    }
}

//==============================================================================

int soundCount (SoundBank bank) noexcept
{
    for (const auto& plan : kPlan)
        if (plan.bank == bank)
            return plan.count;

    return 0;
}

int totalSoundCount() noexcept
{
    int total = 0;

    for (const auto& plan : kPlan)
        total += plan.count;

    return total;
}

void generateBank (SoundLibrary& library, SoundBank bank, double sampleRate)
{
    const auto count = soundCount (bank);

    if (count <= 0)
        return;

    auto& sounds = library.factory (bank);
    sounds.clear();
    sounds.reserve (static_cast<std::size_t> (count));

    for (int i = 0; i < count; ++i)
    {
        switch (bank)
        {
            case SoundBank::BD:    sounds.push_back (makeKick (i, count, sampleRate)); break;
            case SoundBank::SD:    sounds.push_back (makeSnare (i, count, sampleRate)); break;
            case SoundBank::HH_CY: sounds.push_back (makeHat (i, count, sampleRate)); break;
            case SoundBank::CP:    sounds.push_back (makeClap (i, count, sampleRate)); break;
            case SoundBank::ST:    sounds.push_back (makeStick (i, count, sampleRate)); break;
            case SoundBank::TT:    sounds.push_back (makeTom (i, count, sampleRate)); break;
            case SoundBank::PC:    sounds.push_back (makePercussion (i, count, sampleRate)); break;
            case SoundBank::SY_BS: sounds.push_back (makeSynth (i, count, sampleRate)); break;
            case SoundBank::FX:    sounds.push_back (makeEffect (i, count, sampleRate)); break;
            default: return;
        }
    }
}

void generate (SoundLibrary& library, double sampleRate)
{
    for (const auto& plan : kPlan)
        generateBank (library, plan.bank, sampleRate);
}

} // namespace bud::factory
