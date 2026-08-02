#include "TestFramework.h"

#include "core/Engine.h"
#include "core/factory/Presets.h"
#include "core/factory/SoundMenu.h"

#include <cmath>
#include <set>
#include <string>

using namespace bud;

namespace
{
    constexpr double kSampleRate = 48000.0;

    /// Peak of one bar rendered from the top.
    float peakOfOneBar (Engine& engine)
    {
        const auto beats = 4.0;
        const auto seconds = beats * 60.0
                           / static_cast<double> (engine.parameters().get (ParamKind::Tempo));

        const auto frames = static_cast<int> (kSampleRate * seconds);

        std::vector<float> left (512), right (512);
        auto peak = 0.0f;

        for (int done = 0; done < frames; done += 512)
        {
            engine.process (left.data(), right.data(), 512);

            for (int i = 0; i < 512; ++i)
                peak = std::max (peak, std::max (std::abs (left[i]), std::abs (right[i])));
        }

        return peak;
    }
}

//==============================================================================

BUD_TEST (Presets, thirtyGenresWithUniqueNames)
{
    const auto all = factory::presets();

    CHECK_EQ (static_cast<int> (all.size()), 30);

    std::set<std::string_view> names;
    std::set<std::string_view> families;

    for (const auto& preset : all)
    {
        CHECK (! preset.name.empty());
        CHECK (! preset.family.empty());
        names.insert (preset.name);
        families.insert (preset.family);
    }

    // A duplicate name would be indistinguishable in a menu.
    CHECK_EQ (static_cast<int> (names.size()), 30);
    CHECK (families.size() >= 4);
}

BUD_TEST (Presets, houseSubgenresAreCovered)
{
    std::set<std::string_view> house;

    for (const auto& preset : factory::presets())
        if (preset.family == "House")
            house.insert (preset.name);

    // The three asked for by name, plus enough of the family around them to be a family.
    CHECK (house.count ("TROPICAL") == 1);
    CHECK (house.count ("AFRO HOUSE") == 1);
    CHECK (house.count ("GUARACHA") == 1);
    CHECK (house.size() >= 10);
}

BUD_TEST (Presets, everyPresetIsWellFormed)
{
    for (const auto& preset : factory::presets())
    {
        // Tempo has to be inside what the transport accepts, or the preset would be clamped
        // into something other than the genre it names.
        CHECK (preset.tempo >= 20 && preset.tempo <= 300);
        // Swing is 50-75 on this instrument, 50 being straight. A value outside that is
        // silently clamped, so the preset would not be the groove it names.
        CHECK (preset.swing >= 50 && preset.swing <= 75);
        CHECK (! preset.tracks.empty());

        for (const auto& part : preset.tracks)
        {
            CHECK (part.track >= 0 && part.track < kNumTracks);

            // Sixteen characters, one per step — a short string would silently leave the tail
            // of the bar empty.
            CHECK_EQ (static_cast<int> (part.steps.size()), kStepsPerVariation);

            for (const auto c : part.steps)
                CHECK (c == '.' || c == 'x' || c == 'X' || c == 'o');

            CHECK (part.sound >= -1 && part.sound < factory::kSoundsPerTrack);
            CHECK (part.level <= kRawMax);

            // At least one note, or the part is a track that does nothing.
            CHECK (part.steps.find_first_not_of ('.') != std::string_view::npos);
        }
    }
}

BUD_TEST (Presets, loadingOneWritesTempoFeelAndSounds)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);

    const auto all = factory::presets();

    for (int index = 0; index < static_cast<int> (all.size()); ++index)
    {
        engine.applyPreset (index);

        const auto& preset = all[static_cast<std::size_t> (index)];

        CHECK_EQ (engine.parameters().get (ParamKind::Tempo), preset.tempo);
        CHECK_EQ (engine.parameters().get (ParamKind::Feel), static_cast<int> (preset.feel));
        CHECK_EQ (engine.parameters().get (ParamKind::Swing), preset.swing);

        for (const auto& part : preset.tracks)
        {
            if (part.sound >= 0)
                CHECK_EQ (engine.selectedSound (part.track), part.sound);

            const auto& steps = engine.currentPattern().track (part.track)
                                      .variation (Variation::A);

            for (std::size_t i = 0; i < part.steps.size(); ++i)
                CHECK_EQ (steps[i].gate, part.steps[i] != '.');
        }
    }
}

BUD_TEST (Presets, loadingClearsWhatWasThereBefore)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);

    // Fill a track that the first preset does not use, then check it is gone. A preset written
    // over an existing pattern would otherwise play both.
    auto& before = engine.currentPattern().track (6).variation (Variation::A);

    for (auto& step : before)
        step.gate = true;

    engine.applyPreset (0);

    auto lit = 0;

    for (const auto& step : engine.currentPattern().track (6).variation (Variation::A))
        if (step.gate)
            ++lit;

    CHECK_EQ (lit, 0);
}

BUD_TEST (Presets, everyPresetActuallyPlays)
{
    for (int index = 0; index < static_cast<int> (factory::presets().size()); ++index)
    {
        // A fresh engine each time, so one preset cannot be carried by the tail of the last.
        Engine engine;
        engine.prepare (kSampleRate, 512);

        engine.applyPreset (index);
        engine.start();

        const auto peak = peakOfOneBar (engine);

        // The claim a preset makes is that loading it gives you something playing. Silence
        // would mean a part pointing at an empty slot, which nothing else here would catch.
        CHECK (peak > 0.05f);
        CHECK (peak <= 1.0f);
    }
}

BUD_TEST (Presets, outOfRangeIsIgnored)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);

    engine.applyPreset (0);
    const auto tempo = engine.parameters().get (ParamKind::Tempo);

    engine.applyPreset (-1);
    engine.applyPreset (9999);

    CHECK_EQ (engine.parameters().get (ParamKind::Tempo), tempo);
}
