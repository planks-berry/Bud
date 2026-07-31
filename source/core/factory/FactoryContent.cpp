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
    // Signature sounds — the first few slots of each bank.
    //
    // The rest of a bank sweeps one parameter from typical to extreme, which gives range but
    // makes any five neighbours sound like the same drum at five settings. These are written
    // individually instead, so the five a track offers are five *different* drums: the
    // archetypes that category is actually known for.
    //
    // They are original synthesis, like everything else here. Nothing is sampled from any
    // hardware, and the names describe the character rather than naming a machine.

    constexpr int kSignatures = 5;

    /// Mix an already-rendered sound into a canvas at a time offset. Used to build loops out of
    /// the one-shots, so a loop and the kit agree with each other.
    void place (Canvas& c, const SampleData& sound, double atSeconds, double gain)
    {
        const auto start = static_cast<int> (atSeconds * c.sampleRate);

        for (int i = 0; i < sound.length(); ++i)
        {
            const auto target = start + i;

            if (target >= c.length())
                break;

            if (target >= 0)
                c.add (target, sound.at (0, i) * gain);
        }
    }

    /// Normalise two canvases together. Doing them separately would move the stereo image.
    void finishStereo (Canvas& left, Canvas& right, float peak = 0.85f)
    {
        auto maximum = 0.0f;

        for (const auto* c : { &left, &right })
            for (auto v : c->data)
                maximum = std::max (maximum, std::isfinite (v) ? std::abs (v) : 0.0f);

        for (auto* c : { &left, &right })
        {
            for (auto& v : c->data)
                v = std::isfinite (v) ? (maximum > 0.0f ? v * peak / maximum : 0.0f) : 0.0f;

            const auto fade = std::min<int> (256, c->length());

            for (int i = 0; i < fade; ++i)
            {
                const auto g = static_cast<float> (i) / static_cast<float> (fade);
                c->data[c->data.size() - 1 - static_cast<std::size_t> (i)] *= g;
            }
        }
    }

    SampleData signatureKick (int pick, double rate)
    {
        dsp::Noise noise (0x1A00u + static_cast<std::uint32_t> (pick));

        switch (pick)
        {
            case 0:   // Long, round, almost no click — the one that carries a room.
            {
                Canvas c (rate, 0.85);
                addBody (c, 95.0, 44.0, 0.030, 0.52, 1.0, 1.0);
                addNoise (c, noise, 0.002, 1600.0, 1.2, 0.05);
                c.finish();
                return { c.data, {}, rate, "DEEP", 0.0 };
            }

            case 1:   // Fast pitch drop and a hard attack: cuts through a dense mix.
            {
                Canvas c (rate, 0.34);
                addBody (c, 210.0, 50.0, 0.006, 0.16, 1.0, 2.2);
                addNoise (c, noise, 0.003, 3600.0, 1.0, 0.30);
                c.finish();
                return { c.data, {}, rate, "PUNCH", 0.0 };
            }

            case 2:   // Short and dry, for patterns that need space between hits.
            {
                Canvas c (rate, 0.18);
                addBody (c, 150.0, 60.0, 0.010, 0.075, 1.0, 1.6);
                addNoise (c, noise, 0.002, 2800.0, 1.1, 0.18);
                c.finish();
                return { c.data, {}, rate, "TIGHT", 0.0 };
            }

            case 3:   // Driven into shape — the body clips rather than swells.
            {
                Canvas c (rate, 0.42);
                addBody (c, 130.0, 48.0, 0.014, 0.26, 1.0, 1.3);
                addNoise (c, noise, 0.004, 2200.0, 1.0, 0.22);

                for (auto& v : c.data)
                    v = static_cast<float> (std::tanh (v * 3.4));

                c.finish();
                return { c.data, {}, rate, "DRIVE", 0.0 };
            }

            default:  // Nearly pure low sine: felt more than heard.
            {
                Canvas c (rate, 1.05);
                addBody (c, 62.0, 36.0, 0.045, 0.70, 1.0, 1.0);
                c.finish();
                return { c.data, {}, rate, "SUB", 0.0 };
            }
        }
    }

    SampleData signatureSnare (int pick, double rate)
    {
        dsp::Noise noise (0x2A00u + static_cast<std::uint32_t> (pick));

        switch (pick)
        {
            case 0:   // Bright and short: the backbeat that sits on top.
            {
                Canvas c (rate, 0.26);
                addBody (c, 240.0, 190.0, 0.008, 0.055, 0.5);
                addNoise (c, noise, 0.085, 3400.0, 1.4, 0.9);
                c.finish();
                return { c.data, {}, rate, "CRACK", 0.0 };
            }

            case 1:   // More shell, longer body — fills the middle of a sparse pattern.
            {
                Canvas c (rate, 0.46);
                addBody (c, 195.0, 155.0, 0.014, 0.15, 0.75);
                addBody (c, 310.0, 260.0, 0.012, 0.11, 0.4);
                addNoise (c, noise, 0.16, 2100.0, 0.9, 0.75);
                c.finish();
                return { c.data, {}, rate, "FAT", 0.0 };
            }

            case 2:   // Rimshot: a hard woody transient over a short shell.
            {
                Canvas c (rate, 0.20);
                addBody (c, 420.0, 330.0, 0.004, 0.030, 0.7);

                for (int i = 0; i < c.length(); ++i)
                {
                    const auto t = c.time (i);
                    c.add (i, sine (t, 1750.0) * 0.5 * envExp (t, 0.006));
                }

                addNoise (c, noise, 0.045, 4200.0, 1.6, 0.8);
                c.finish();
                return { c.data, {}, rate, "RIM", 0.0 };
            }

            case 3:   // Mostly noise, soft attack — brushed rather than struck.
            {
                Canvas c (rate, 0.40);
                addBody (c, 180.0, 160.0, 0.020, 0.06, 0.22);
                addNoise (c, noise, 0.22, 5200.0, 0.7, 0.85);
                c.finish (0.8f);
                return { c.data, {}, rate, "BRUSH", 0.0 };
            }

            default:  // Cut off abruptly, the way a gate does.
            {
                Canvas c (rate, 0.17);
                addBody (c, 220.0, 175.0, 0.010, 0.09, 0.6);
                addNoise (c, noise, 0.30, 2800.0, 1.1, 0.9);

                // A hard close near the end is the whole point of the sound.
                const auto hold = static_cast<int> (rate * 0.115);

                for (int i = hold; i < c.length(); ++i)
                {
                    const auto g = 1.0 - static_cast<double> (i - hold)
                                             / static_cast<double> (c.length() - hold);
                    c.data[static_cast<std::size_t> (i)] *= static_cast<float> (g * g);
                }

                c.finish();
                return { c.data, {}, rate, "GATED", 0.0 };
            }
        }
    }

    /// Hats occupy ten signature slots: five closed, then five open.
    SampleData signatureHat (int pick, bool open, double rate)
    {
        dsp::Noise noise (0x3A00u + static_cast<std::uint32_t> (pick + (open ? 16 : 0)));

        struct Shape { const char* name; double decay; double base; double spread; double air; };

        constexpr Shape closed[] = {
            { "TIGHT",  0.022, 320.0, 0.85, 0.30 },
            { "TICK",   0.012, 430.0, 1.10, 0.45 },
            { "PEDAL",  0.038, 270.0, 0.70, 0.22 },
            { "SIZZLE", 0.055, 350.0, 1.25, 0.55 },
            { "METAL",  0.030, 520.0, 1.45, 0.35 },
        };

        constexpr Shape opened[] = {
            { "OPEN",   0.34, 315.0, 0.90, 0.35 },
            { "LONG",   0.62, 300.0, 0.80, 0.28 },
            { "SPLASH", 0.44, 400.0, 1.30, 0.60 },
            { "RIDE",   0.80, 240.0, 0.65, 0.20 },
            { "CRASH",  1.15, 280.0, 1.40, 0.50 },
        };

        const auto& s = open ? opened[pick] : closed[pick];

        Canvas c (rate, std::min (2.0, s.decay * 4.0 + 0.05));

        addMetal (c, s.base, s.decay, 0.9, s.spread);
        addNoise (c, noise, s.decay * 0.7, 7500.0, 0.7, s.air);

        c.finish (0.7f);
        return { c.data, {}, rate, s.name, 0.0 };
    }

    SampleData signatureClap (int pick, double rate)
    {
        dsp::Noise noise (0x4A00u + static_cast<std::uint32_t> (pick));

        struct Shape { const char* name; int taps; double spacing; double tail; double tone; };

        constexpr Shape shapes[] = {
            { "CLASSIC", 3, 0.011, 0.13, 1500.0 },
            { "TIGHT",   2, 0.007, 0.06, 2200.0 },
            { "ROOM",    3, 0.013, 0.30, 1200.0 },
            { "WIDE",    4, 0.017, 0.20, 1700.0 },
            { "SNAPPY",  3, 0.008, 0.09, 2600.0 },
        };

        const auto& s = shapes[pick];
        Canvas c (rate, 0.14 + s.tail * 2.2);

        for (int tap = 0; tap < s.taps; ++tap)
            addNoise (c, noise, 0.014, s.tone, 1.1, 0.55,
                      static_cast<double> (tap) * s.spacing);

        addNoise (c, noise, s.tail, s.tone * 0.85, 1.4, 0.7,
                  static_cast<double> (s.taps) * s.spacing);

        c.finish (0.8f);
        return { c.data, {}, rate, s.name, 0.0 };
    }

    SampleData signatureStick (int pick, double rate)
    {
        dsp::Noise noise (0x5A00u + static_cast<std::uint32_t> (pick));

        struct Shape { const char* name; double low; double high; double decay; double click; };

        constexpr Shape shapes[] = {
            { "RIM",   1500.0, 2400.0, 0.010, 0.35 },
            { "CLAVE", 2400.0, 3900.0, 0.022, 0.20 },
            { "WOOD",   900.0, 1450.0, 0.030, 0.25 },
            { "TICK",  3200.0, 5100.0, 0.006, 0.45 },
            { "SIDE",  1150.0, 3050.0, 0.014, 0.55 },
        };

        const auto& s = shapes[pick];
        Canvas c (rate, 0.10 + s.decay * 2.0);

        for (int i = 0; i < c.length(); ++i)
        {
            const auto t = c.time (i);
            const auto e = envExp (t, s.decay);
            c.add (i, (sine (t, s.low) * 0.6 + sine (t, s.high) * 0.4) * e);
        }

        addNoise (c, noise, 0.004, 5500.0, 0.8, s.click);

        c.finish (0.8f);
        return { c.data, {}, rate, s.name, 0.0 };
    }

    SampleData signatureTom (int pick, double rate)
    {
        dsp::Noise noise (0x6A00u + static_cast<std::uint32_t> (pick));

        struct Shape { const char* name; double pitch; double decay; double bend; double skin; };

        constexpr Shape shapes[] = {
            { "FLOOR",  70.0, 0.46, 0.030, 0.12 },
            { "LOW",    98.0, 0.38, 0.026, 0.14 },
            { "MID",   140.0, 0.30, 0.022, 0.15 },
            { "HIGH",  198.0, 0.24, 0.018, 0.16 },
            { "SYNTH",  86.0, 0.55, 0.070, 0.04 },
        };

        const auto& s = shapes[pick];
        Canvas c (rate, s.decay * 2.2);

        addBody (c, s.pitch * 1.7, s.pitch, s.bend, s.decay, 1.0);
        addNoise (c, noise, 0.02, s.pitch * 6.0, 1.0, s.skin);

        c.finish();
        return { c.data, {}, rate, s.name, 0.0 };
    }

    SampleData signaturePerc (int pick, double rate)
    {
        dsp::Noise noise (0x7A00u + static_cast<std::uint32_t> (pick));

        switch (pick)
        {
            case 0:   // Conga: a tuned skin with very little noise.
            {
                Canvas c (rate, 0.34);
                addBody (c, 245.0, 205.0, 0.016, 0.16, 1.0);
                addNoise (c, noise, 0.008, 3000.0, 1.0, 0.14);
                c.finish (0.85f);
                return { c.data, {}, rate, "CONGA", 0.0 };
            }

            case 1:   // Cowbell: two detuned squares, no skin at all.
            {
                Canvas c (rate, 0.40);

                for (int i = 0; i < c.length(); ++i)
                {
                    const auto t = c.time (i);
                    const auto e = envExp (t, 0.16);
                    const auto a = sine (t, 540.0) > 0.0 ? 1.0 : -1.0;
                    const auto b = sine (t, 800.0) > 0.0 ? 1.0 : -1.0;
                    c.add (i, (a * 0.5 + b * 0.5) * e * 0.5);
                }

                c.finish (0.75f);
                return { c.data, {}, rate, "COWBELL", 0.0 };
            }

            case 2:   // Shaker: filtered noise with a soft attack.
            {
                Canvas c (rate, 0.16);
                addNoise (c, noise, 0.045, 8000.0, 0.6, 0.9);

                const auto attack = static_cast<int> (rate * 0.006);

                for (int i = 0; i < std::min (attack, c.length()); ++i)
                    c.data[static_cast<std::size_t> (i)] *=
                        static_cast<float> (i) / static_cast<float> (attack);

                c.finish (0.7f);
                return { c.data, {}, rate, "SHAKER", 0.0 };
            }

            case 3:   // Tambourine: jingles over a short noise burst.
            {
                Canvas c (rate, 0.30);
                addMetal (c, 760.0, 0.10, 0.6, 1.6);
                addNoise (c, noise, 0.075, 9000.0, 0.8, 0.6);
                c.finish (0.7f);
                return { c.data, {}, rate, "TAMB", 0.0 };
            }

            default:  // Woodblock: one hard pitched click.
            {
                Canvas c (rate, 0.14);

                for (int i = 0; i < c.length(); ++i)
                {
                    const auto t = c.time (i);
                    c.add (i, (sine (t, 1150.0) * 0.75 + sine (t, 3100.0) * 0.25)
                                  * envExp (t, 0.020));
                }

                c.finish (0.8f);
                return { c.data, {}, rate, "BLOCK", 0.0 };
            }
        }
    }

    /// Loops, built by sequencing the signature one-shots — so a loop and the kit under it are
    /// made of the same drums and agree with each other. Two bars at 120 bpm, which is what
    /// `sourceBeats` records, so the loop track can stretch or repitch it to any tempo.
    SampleData signatureLoop (int pick, double rate)
    {
        constexpr double kLoopBpm = 120.0;
        constexpr double kBeats = 8.0;

        const auto sixteenth = 60.0 / kLoopBpm / 4.0;
        const auto seconds = kBeats * 60.0 / kLoopBpm;

        Canvas left (rate, seconds);
        Canvas right (rate, seconds);

        const auto kick = signatureKick (pick == 2 ? 0 : 1, rate);
        const auto snare = signatureSnare (pick == 2 ? 1 : 0, rate);
        const auto hat = signatureHat (0, false, rate);
        const auto openHat = signatureHat (0, true, rate);
        const auto perc = signaturePerc (pick == 4 ? 2 : 4, rate);

        // Each entry is a sixteenth-note position within the two bars.
        struct Pattern
        {
            const char* name;
            std::initializer_list<int> kicks;
            std::initializer_list<int> snares;
            std::initializer_list<int> hats;
            std::initializer_list<int> opens;
            std::initializer_list<int> percs;
        };

        const Pattern patterns[] = {
            { "FOURFOUR",
              { 0, 4, 8, 12, 16, 20, 24, 28 },
              { 4, 12, 20, 28 },
              { 2, 6, 10, 14, 18, 22, 26, 30 },
              { 14, 30 },
              {} },
            { "BREAK",
              { 0, 10, 16, 22, 26 },
              { 4, 12, 20, 28 },
              { 2, 6, 8, 14, 18, 24, 30 },
              { 11 },
              { 7, 23 } },
            { "BOOMBAP",
              { 0, 7, 16, 22 },
              { 4, 12, 20, 28 },
              { 0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30 },
              {},
              { 15, 31 } },
            { "SPARSE",
              { 0, 16, 27 },
              { 8, 24 },
              { 12, 13, 14, 28, 29, 30, 31 },
              { 20 },
              {} },
            { "PERCUSSION",
              {},
              {},
              { 0, 4, 8, 12, 16, 20, 24, 28 },
              {},
              { 2, 3, 6, 10, 11, 14, 18, 19, 22, 26, 27, 30 } },
        };

        const auto& p = patterns[pick];

        // Slight level differences between the channels give the loop a stereo image without
        // any delay, which would smear it once the stretcher gets hold of it.
        const auto stereo = [&] (Canvas& c, const SampleData& sound,
                                 std::initializer_list<int> steps, double gain, double side)
        {
            for (auto step : steps)
                place (c, sound, static_cast<double> (step) * sixteenth, gain * side);
        };

        for (auto* c : { &left, &right })
        {
            const auto isLeft = (c == &left);

            stereo (*c, kick, p.kicks, 1.0, 1.0);
            stereo (*c, snare, p.snares, 0.85, 1.0);
            stereo (*c, hat, p.hats, 0.45, isLeft ? 1.08 : 0.92);
            stereo (*c, openHat, p.opens, 0.40, isLeft ? 0.92 : 1.08);
            stereo (*c, perc, p.percs, 0.50, isLeft ? 0.88 : 1.12);
        }

        finishStereo (left, right, 0.8f);

        return { left.data, right.data, rate, p.name, kBeats };
    }

    //==========================================================================
    // Bank generators. Past the signature slots, each takes an index and varies its character
    // across the bank, so a bank sweeps from its most typical sound to its most extreme.

    SampleData makeKick (int index, int count, double rate)
    {
        if (index < kSignatures)
            return signatureKick (index, rate);


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
        if (index < kSignatures)
            return signatureSnare (index, rate);

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
        // Ten signature slots here rather than five: the closed and open hats are different
        // instruments on different tracks, and each wants its own five.
        if (index < kSignatures * 2)
            return signatureHat (index % kSignatures, index >= kSignatures, rate);

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
        if (index < kSignatures)
            return signatureClap (index, rate);

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
        if (index < kSignatures)
            return signatureStick (index, rate);

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
        if (index < kSignatures)
            return signatureTom (index, rate);

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
        if (index < kSignatures)
            return signaturePerc (index, rate);

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
        // The loop track has no factory bank of its own — S8 is where a person's own recordings
        // go — so its five live at the head of FX, which no track uses as its default.
        if (index < kSignatures)
            return signatureLoop (index, rate);

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
