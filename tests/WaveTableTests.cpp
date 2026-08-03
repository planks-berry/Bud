#include "TestFramework.h"

#include "core/Engine.h"
#include "core/dsp/WaveTable.h"
#include "core/factory/WaveTables.h"

#include <cmath>
#include <numbers>
#include <vector>

using namespace bud;

namespace
{
    constexpr double kSampleRate = 48000.0;
    constexpr double kTwoPi = 2.0 * std::numbers::pi;

    dsp::HarmonicSpec sawSpec (int harmonics)
    {
        dsp::HarmonicSpec spec;
        spec.amplitude.resize (static_cast<std::size_t> (harmonics));

        for (int h = 0; h < harmonics; ++h)
            spec.amplitude[static_cast<std::size_t> (h)] = 1.0f / static_cast<float> (h + 1);

        return spec;
    }

    dsp::HarmonicSpec sineSpec()
    {
        dsp::HarmonicSpec spec;
        spec.amplitude = { 1.0f };
        return spec;
    }

    /// Render a run of the oscillator at one pitch.
    std::vector<float> play (const dsp::WaveTable& table, double hz, int frames,
                             float position = 0.0f)
    {
        dsp::WaveTableOscillator osc;
        osc.prepare (kSampleRate);
        osc.setTable (&table);
        osc.setFrequency (hz);
        osc.setPosition (position);

        std::vector<float> out (static_cast<std::size_t> (frames));

        for (auto& v : out)
            v = osc.next();

        return out;
    }

    /// Magnitude at one exact frequency. Correlating against the frequency of interest rather
    /// than binning avoids the leakage a rectangular window spreads over neighbouring bins,
    /// which is what makes a pure tone look broadband.
    double magnitudeAt (const std::vector<float>& signal, double hz)
    {
        const auto w = kTwoPi * hz / kSampleRate;
        auto re = 0.0, im = 0.0;

        for (std::size_t i = 0; i < signal.size(); ++i)
        {
            re += signal[i] * std::cos (w * static_cast<double> (i));
            im += signal[i] * std::sin (w * static_cast<double> (i));
        }

        return std::sqrt (re * re + im * im);
    }

    /// How much a rendered note holds at its third harmonic relative to its fundamental. A sine
    /// is near zero; a saw is about a third.
    double thirdHarmonicRatio (const std::vector<float>& signal, double fundamental)
    {
        const auto first = magnitudeAt (signal, fundamental);
        return first > 0.0 ? magnitudeAt (signal, fundamental * 3.0) / first : 0.0;
    }

    /// Energy at frequencies above `hz`, as a fraction of the total. Used only for the aliasing
    /// check, where the question is broadband and leakage does not change the answer.
    double energyAbove (const std::vector<float>& signal, double hz)
    {
        // A Goertzel-style sweep is enough here: sum the magnitude in bins either side of the
        // split rather than running a full transform.
        const auto n = static_cast<int> (signal.size());
        auto above = 0.0, total = 0.0;

        const auto bins = 400;
        const auto top = kSampleRate * 0.5;

        for (int b = 1; b <= bins; ++b)
        {
            const auto f = top * static_cast<double> (b) / bins;
            const auto w = kTwoPi * f / kSampleRate;

            auto re = 0.0, im = 0.0;

            for (int i = 0; i < n; ++i)
            {
                re += signal[static_cast<std::size_t> (i)] * std::cos (w * i);
                im += signal[static_cast<std::size_t> (i)] * std::sin (w * i);
            }

            const auto magnitude = std::sqrt (re * re + im * im);
            total += magnitude;

            if (f > hz)
                above += magnitude;
        }

        return total > 0.0 ? above / total : 0.0;
    }
}

//==============================================================================

BUD_TEST (WaveTable, mipLevelsHalveTheirHarmonics)
{
    CHECK_EQ (dsp::WaveTable::harmonicsAtMip (0), dsp::WaveTable::kMaxHarmonics);
    CHECK_EQ (dsp::WaveTable::harmonicsAtMip (1), dsp::WaveTable::kMaxHarmonics / 2);

    // Every level has to keep at least the fundamental, or a high note would be silent rather
    // than merely dull.
    for (int mip = 0; mip < dsp::WaveTable::kMipLevels; ++mip)
    {
        CHECK (dsp::WaveTable::harmonicsAtMip (mip) >= 1);
        CHECK (dsp::WaveTable::sizeAtMip (mip) >= dsp::WaveTable::kMinFrameSize);
    }
}

BUD_TEST (WaveTable, aHighNoteMovesToACoarserMip)
{
    dsp::WaveTable table;
    const dsp::HarmonicSpec frames[] = { sawSpec (dsp::WaveTable::kMaxHarmonics) };
    table.build (frames);

    const auto low = table.mipForFrequency (55.0, kSampleRate);
    const auto high = table.mipForFrequency (3520.0, kSampleRate);

    CHECK (high > low);

    // Whatever level is chosen, its harmonics have to fit below Nyquist — that is the entire
    // contract, and it is checkable directly rather than by ear.
    for (const auto hz : { 27.5, 55.0, 220.0, 880.0, 3520.0, 12000.0 })
    {
        const auto mip = table.mipForFrequency (hz, kSampleRate);
        const auto highest = dsp::WaveTable::harmonicsAtMip (mip) * hz;

        CHECK (highest <= kSampleRate * 0.5 + 1.0);
    }
}

BUD_TEST (WaveTable, aSawStaysCleanWhereAnUnlimitedOneWouldAlias)
{
    dsp::WaveTable table;
    const dsp::HarmonicSpec frames[] = { sawSpec (dsp::WaveTable::kMaxHarmonics) };
    table.build (frames);

    // 2 kHz: an unlimited saw has harmonics well past Nyquist here, which fold back down into
    // the audible band as inharmonic tones.
    const auto rendered = play (table, 2000.0, 8192);

    // Everything the table legitimately contains at this pitch lives below 24 kHz and is a
    // multiple of 2 kHz. Fold-back would appear between the harmonics; band-limited output puts
    // almost nothing there.
    auto peak = 0.0f;

    for (const auto v : rendered)
        peak = std::max (peak, std::abs (v));

    CHECK (peak > 0.1f);
    CHECK (peak <= 1.0f);

    // A naive saw at this pitch would put a large share of its energy above the last real
    // harmonic. This one must not.
    const auto folded = energyAbove (rendered, 22000.0);
    CHECK (folded < 0.02);
}

BUD_TEST (WaveTable, morphingChangesTheHarmonicContent)
{
    dsp::WaveTable table;
    const dsp::HarmonicSpec frames[] = { sineSpec(), sawSpec (64) };
    table.build (frames);

    CHECK_EQ (table.frameCount(), 2);

    const auto atSine = play (table, 220.0, 8192, 0.0f);
    const auto atSaw = play (table, 220.0, 8192, 1.0f);

    // A sine has nothing at its third harmonic; a saw has a third of its fundamental there. If
    // the position never reached the oscillator these would be identical.
    const auto sineThird = thirdHarmonicRatio (atSine, 220.0);
    const auto sawThird = thirdHarmonicRatio (atSaw, 220.0);

    CHECK (sineThird < 0.02);
    CHECK (sawThird > 0.2);

    // And halfway is genuinely between the two rather than snapping to a frame.
    const auto middle = thirdHarmonicRatio (play (table, 220.0, 8192, 0.5f), 220.0);
    CHECK (middle > sineThird * 2.0);
    CHECK (middle < sawThird);
}

BUD_TEST (WaveTable, buildingFromACycleRecoversIt)
{
    // A square wave drawn as samples rather than described as harmonics.
    std::vector<float> cycle (512);

    for (std::size_t i = 0; i < cycle.size(); ++i)
        cycle[i] = i < cycle.size() / 2 ? 1.0f : -1.0f;

    const std::span<const float> spans[] = { cycle };

    dsp::WaveTable table;
    table.buildFromCycles (spans);

    CHECK (! table.empty());
    CHECK_EQ (table.frameCount(), 1);

    // A square is odd harmonics only. Analysis then resynthesis has to preserve that, which is
    // the round trip the custom path depends on.
    const auto rendered = play (table, 220.0, 8192);

    auto peak = 0.0f;

    for (const auto v : rendered)
        peak = std::max (peak, std::abs (v));

    CHECK (peak > 0.5f);

    // The second harmonic of a square is absent. Measure it directly against the third.
    const auto measure = [&rendered] (double hz)
    {
        const auto w = kTwoPi * hz / kSampleRate;
        auto re = 0.0, im = 0.0;

        for (std::size_t i = 0; i < rendered.size(); ++i)
        {
            re += rendered[i] * std::cos (w * static_cast<double> (i));
            im += rendered[i] * std::sin (w * static_cast<double> (i));
        }

        return std::sqrt (re * re + im * im);
    };

    const auto second = measure (440.0);
    const auto third = measure (660.0);

    CHECK (third > second * 8.0);
}

//==============================================================================

BUD_TEST (WaveTableBank, factoryTablesAreBuiltAndNamed)
{
    factory::WaveTableBank bank;
    CHECK (bank.empty());

    bank.generateFactory();

    CHECK (bank.size() >= 6);
    CHECK_EQ (bank.factoryCount(), bank.size());

    for (int i = 0; i < bank.size(); ++i)
    {
        CHECK (! bank.nameAt (i).empty());
        CHECK (bank.at (i) != nullptr);
        CHECK (! bank.at (i)->empty());
    }

    CHECK (bank.indexOf ("BASIC") >= 0);

    // The SOUND knob spans 0-127, so the bank has to wrap rather than dead-zone the top.
    CHECK (bank.at (0) == bank.at (bank.size()));
    CHECK (bank.at (127) != nullptr);
}

BUD_TEST (WaveTableBank, aCustomTableIsPlayableImmediately)
{
    factory::WaveTableBank bank;
    bank.generateFactory();

    const auto before = bank.size();

    const dsp::HarmonicSpec frames[] = { sineSpec(), sawSpec (32) };
    const auto index = bank.addHarmonic ("MINE", frames);

    CHECK_EQ (index, before);
    CHECK_EQ (bank.size(), before + 1);
    CHECK_EQ (bank.indexOf ("MINE"), index);
    CHECK (bank.at (index) != nullptr);
    CHECK_EQ (bank.at (index)->frameCount(), 2);

    // Regenerating the factory set must not take a custom table with it.
    bank.generateFactory();
    CHECK (bank.indexOf ("MINE") >= 0);
}

BUD_TEST (WaveTableBank, emptyInputIsRejectedRatherThanStored)
{
    factory::WaveTableBank bank;

    CHECK_EQ (bank.addHarmonic ("nothing", {}), -1);
    CHECK_EQ (bank.addCycles ("nothing", {}), -1);
    CHECK_EQ (bank.size(), 0);
}

//==============================================================================

BUD_TEST (WaveTableVoice, theWtBankPlaysOnAnyTrack)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);

    CHECK (engine.waveTables().size() > 0);

    for (const auto track : { 0, 4, 8 })
    {
        engine.initialisePattern (engine.patternIndex());
        engine.parameters().set (ParamKind::TrackSoundBank, track,
                                 static_cast<int> (SoundBank::WT));
        engine.parameters().set (ParamKind::TrackLevel, track, 110);
        engine.parameters().set (ParamKind::TrackDecay, track, 90);

        auto& steps = engine.currentPattern().track (track).variation (Variation::A);
        steps[0].gate = true;

        engine.start();

        std::vector<float> left (512), right (512);
        auto peak = 0.0f;

        for (int block = 0; block < 40; ++block)
        {
            engine.process (left.data(), right.data(), 512);

            for (int i = 0; i < 512; ++i)
                peak = std::max (peak, std::max (std::abs (left[i]), std::abs (right[i])));
        }

        engine.stop();

        CHECK (peak > 0.02f);
        CHECK (peak <= 1.0f);
    }
}

BUD_TEST (WaveTableVoice, aCustomTableReachesTheEngine)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);

    // A table with one loud harmonic well above the fundamental, so its presence in the output
    // is unambiguous rather than a matter of degree.
    dsp::HarmonicSpec spec;
    spec.amplitude.assign (8, 0.0f);
    spec.amplitude[7] = 1.0f;                  // the eighth harmonic, alone

    const dsp::HarmonicSpec frames[] = { spec };
    const auto index = engine.waveTables().addHarmonic ("PROBE", frames);
    CHECK (index >= 0);

    engine.initialisePattern (engine.patternIndex());
    engine.parameters().set (ParamKind::TrackSoundBank, 0, static_cast<int> (SoundBank::WT));
    engine.parameters().set (ParamKind::TrackSound, 0, index);
    engine.parameters().set (ParamKind::TrackLevel, 0, 120);
    engine.parameters().set (ParamKind::TrackDecay, 0, 100);
    engine.parameters().set (ParamKind::TrackTone, 0, 127);   // filter wide open

    auto& steps = engine.currentPattern().track (0).variation (Variation::A);
    steps[0].gate = true;

    engine.start();

    std::vector<float> left (4096), right (4096);
    engine.process (left.data(), right.data(), 4096);

    const auto measure = [&left] (double hz)
    {
        const auto w = kTwoPi * hz / kSampleRate;
        auto re = 0.0, im = 0.0;

        for (std::size_t i = 0; i < left.size(); ++i)
        {
            re += left[i] * std::cos (w * static_cast<double> (i));
            im += left[i] * std::sin (w * static_cast<double> (i));
        }

        return std::sqrt (re * re + im * im);
    };

    // The root is 110 Hz, so the eighth harmonic is 880 Hz and the fundamental should be
    // essentially absent.
    CHECK (measure (880.0) > measure (110.0) * 4.0);
}

BUD_TEST (WaveTableVoice, isSilentUntilTriggered)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);

    engine.initialisePattern (engine.patternIndex());
    engine.parameters().set (ParamKind::TrackSoundBank, 0, static_cast<int> (SoundBank::WT));

    engine.start();

    std::vector<float> left (512), right (512);
    engine.process (left.data(), right.data(), 512);

    for (int i = 0; i < 512; ++i)
        CHECK_EQ (left[i], 0.0f);
}

BUD_TEST (WaveTableVoice, rendersIdenticallyAtEveryBlockSize)
{
    const auto render = [] (int blockSize)
    {
        Engine engine;
        engine.prepare (kSampleRate, 4096);

        engine.initialisePattern (engine.patternIndex());
        engine.parameters().set (ParamKind::Tempo, 120);
        engine.parameters().set (ParamKind::TrackSoundBank, 0, static_cast<int> (SoundBank::WT));
        engine.parameters().set (ParamKind::TrackSound, 0, 2);
        engine.parameters().set (ParamKind::TrackDecay, 0, 100);
        engine.parameters().set (ParamKind::TrackLevel, 0, 110);
        // Off centre, so the frame sweep is running while the blocks are cut differently — the
        // position advances per sample, which is where a block-size dependency would hide.
        engine.parameters().set (ParamKind::TrackMove, 0, 96);

        auto& steps = engine.currentPattern().track (0).variation (Variation::A);

        for (const auto step : { 0, 3, 6, 10, 14 })
            steps[static_cast<std::size_t> (step)].gate = true;

        engine.start();

        std::vector<float> out;
        out.reserve (96000);

        std::vector<float> left (static_cast<std::size_t> (blockSize));
        std::vector<float> right (static_cast<std::size_t> (blockSize));

        for (int done = 0; done < 96000; done += blockSize)
        {
            const auto count = std::min (blockSize, 96000 - done);
            engine.process (left.data(), right.data(), count);

            for (int i = 0; i < count; ++i)
                out.push_back (left[static_cast<std::size_t> (i)]);
        }

        return out;
    };

    const auto reference = render (512);

    for (const auto blockSize : { 1, 7, 64, 333, 1024, 4096 })
    {
        const auto other = render (blockSize);

        CHECK_EQ (other.size(), reference.size());

        // Exact equality, not a tolerance. A tolerance here would hide precisely the drift this
        // is looking for.
        auto identical = true;

        for (std::size_t i = 0; i < reference.size() && i < other.size(); ++i)
            if (other[i] != reference[i])
                identical = false;

        CHECK (identical);
    }
}
