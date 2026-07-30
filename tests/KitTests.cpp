#include "TestFramework.h"

#include "core/Engine.h"
#include "core/kit/DrumKit.h"

#include <algorithm>
#include <cmath>
#include <vector>

using namespace bud;

// Drum kits (p. 79-80). The feature exists to "swap sounds while keeping the sequence intact",
// and the manual is explicit that the two stores are separate: "saving a drum kit does not save
// the pattern itself. Likewise, saving a pattern does not update the drum kit parameters."
//
// That independence is the property worth defending, so most of what follows is about what a kit
// operation must leave alone rather than what it changes.

namespace
{

constexpr double kSampleRate = 48000.0;

/// Give tracks 1-9 a recognisable set of sound settings.
void applySounds (ParameterSet& parameters, int offset)
{
    for (int track = 0; track < kNumKitTracks; ++track)
    {
        parameters.set (ParamKind::TrackSound, track, (track * 7 + offset) % 128);
        parameters.set (ParamKind::TrackTune, track, (track * 3 + offset) % 128);
        parameters.set (ParamKind::TrackDecay, track, (track * 11 + offset) % 128);
        parameters.set (ParamKind::TrackLevel, track, (track * 5 + offset) % 128);
        parameters.set (ParamKind::TrackPan, track, (track * 13 + offset) % 128);
    }
}

/// A pattern with something on every kit track, so a disturbed sequence would be obvious.
void gateEveryTrack (Pattern& pattern)
{
    for (int track = 0; track < kNumKitTracks; ++track)
        for (int step = track; step < kStepsPerVariation; step += 4)
            pattern.track (track).variation (Variation::A)[static_cast<std::size_t> (step)].gate = true;
}

std::vector<bool> gatesOf (const Pattern& pattern)
{
    std::vector<bool> out;

    for (int track = 0; track < kNumTracks; ++track)
        for (int step = 0; step < kStepsPerVariation; ++step)
            out.push_back (
                pattern.track (track).variation (Variation::A)[static_cast<std::size_t> (step)].gate);

    return out;
}

std::vector<int> soundsOf (const ParameterSet& parameters)
{
    std::vector<int> out;

    for (int track = 0; track < kNumKitTracks; ++track)
        for (const auto kind : kitParameters())
            out.push_back (parameters.get (kind, track));

    return out;
}

} // namespace

//==============================================================================

BUD_TEST (Kit, savingCapturesTheCurrentSoundsAndLoadingRestoresThem)
{
    KitBank kits;
    ParameterSet parameters;

    applySounds (parameters, 1);
    const auto saved = soundsOf (parameters);

    CHECK (kits.save (0, parameters, "FIRST"));

    // Change everything, then load it back.
    applySounds (parameters, 40);
    CHECK (soundsOf (parameters) != saved);

    CHECK (kits.load (0, parameters));
    CHECK (soundsOf (parameters) == saved);
}

BUD_TEST (Kit, thereAreSixteenSlotsAndTheyAreIndependent)
{
    // p. 79: sixteen kits, selected with keys 1-16.
    KitBank kits;
    ParameterSet parameters;

    for (int slot = 0; slot < kNumDrumKits; ++slot)
    {
        applySounds (parameters, slot * 3 + 1);
        CHECK (kits.save (slot, parameters));
    }

    for (int slot = 0; slot < kNumDrumKits; ++slot)
    {
        ParameterSet expected;
        applySounds (expected, slot * 3 + 1);

        ParameterSet actual;
        CHECK (kits.load (slot, actual));
        CHECK (soundsOf (actual) == soundsOf (expected));
    }
}

BUD_TEST (Kit, outOfRangeSlotsAreRefused)
{
    KitBank kits;
    ParameterSet parameters;

    CHECK (! kits.save (-1, parameters));
    CHECK (! kits.save (kNumDrumKits, parameters));
    CHECK (! kits.load (-1, parameters));
    CHECK (! kits.load (kNumDrumKits, parameters));
}

BUD_TEST (Kit, anEmptySlotLoadsNothingRatherThanASilentKit)
{
    // A kit of zeroes would set every bank, level and sound index to zero — that is a silent
    // machine, which is a far worse outcome than the load simply not happening.
    KitBank kits;
    ParameterSet parameters;

    applySounds (parameters, 9);
    const auto before = soundsOf (parameters);

    CHECK (! kits.load (5, parameters));
    CHECK (soundsOf (parameters) == before);
}

BUD_TEST (Kit, renamingKeepsTheSoundsAndOnlyWorksOnUsedSlots)
{
    // p. 79: RENAME changes the name of the current drum kit.
    KitBank kits;
    ParameterSet parameters;

    applySounds (parameters, 2);
    CHECK (kits.save (3, parameters, "OLD"));

    const auto saved = soundsOf (parameters);

    CHECK (kits.rename (3, "NEW"));
    CHECK (kits.kit (3).name == "NEW");

    ParameterSet restored;
    CHECK (kits.load (3, restored));
    CHECK (soundsOf (restored) == saved);

    // Nothing to rename in an empty slot.
    CHECK (! kits.rename (7, "GHOST"));
    CHECK (kits.kit (7).name.empty());
}

BUD_TEST (Kit, resavingWithoutANameKeepsTheOldOne)
{
    // Re-saving over a kit after tweaking a sound should not strip the name it was given.
    KitBank kits;
    ParameterSet parameters;

    CHECK (kits.save (1, parameters, "HOUSE"));

    applySounds (parameters, 21);
    CHECK (kits.save (1, parameters));

    CHECK (kits.kit (1).name == "HOUSE");
}

//==============================================================================
// Independence from the pattern — the point of the feature

BUD_TEST (Kit, loadingAKitLeavesTheSequenceAlone)
{
    // p. 79: "By swapping sounds while keeping the sequence intact."
    Engine engine;
    engine.prepare (kSampleRate, 512);

    gateEveryTrack (engine.currentPattern());
    applySounds (engine.parameters(), 4);

    CHECK (engine.kits().save (0, engine.parameters(), "A"));

    const auto gatesBefore = gatesOf (engine.currentPattern());

    applySounds (engine.parameters(), 33);
    CHECK (engine.kits().save (1, engine.parameters(), "B"));

    CHECK (engine.kits().load (0, engine.parameters()));

    CHECK (gatesOf (engine.currentPattern()) == gatesBefore);
}

BUD_TEST (Kit, loadingAKitLeavesSequencerSettingsAlone)
{
    // Note length, step length, swing and mute describe what a track plays, not how it sounds.
    // A kit that carried them would change the rhythm when asked only to change the sound — and
    // would silence a track the player had left playing.
    KitBank kits;
    ParameterSet parameters;

    CHECK (kits.save (0, parameters, "PLAIN"));

    for (int track = 0; track < kNumKitTracks; ++track)
    {
        parameters.set (ParamKind::TrackNoteLength, track, static_cast<int> (StepDivision::Eighth));
        parameters.set (ParamKind::TrackStepLength, track, 6);
        parameters.set (ParamKind::TrackSwing, track, 60);
        parameters.set (ParamKind::TrackMute, track, 1);
    }

    CHECK (kits.load (0, parameters));

    for (int track = 0; track < kNumKitTracks; ++track)
    {
        CHECK_EQ (parameters.get (ParamKind::TrackNoteLength, track),
                  static_cast<int> (StepDivision::Eighth));
        CHECK_EQ (parameters.get (ParamKind::TrackStepLength, track), 6);
        CHECK_EQ (parameters.get (ParamKind::TrackSwing, track), 60);
        CHECK_EQ (parameters.get (ParamKind::TrackMute, track), 1);
    }
}

BUD_TEST (Kit, kitsCoverTracksOneToNineAndLeaveTheLoopAndBassTracksAlone)
{
    // p. 79: "Drum kit data is saved for Tracks 1-9."
    KitBank kits;
    ParameterSet parameters;

    parameters.set (ParamKind::TrackSound, kLoopTrack, 5);
    parameters.set (ParamKind::TrackTune, kLoopTrack, 20);
    parameters.set (ParamKind::TrackTune, kBassTrack, 30);

    CHECK (kits.save (0, parameters, "K"));

    parameters.set (ParamKind::TrackSound, kLoopTrack, 9);
    parameters.set (ParamKind::TrackTune, kLoopTrack, 99);
    parameters.set (ParamKind::TrackTune, kBassTrack, 111);

    CHECK (kits.load (0, parameters));

    // The loop and bass tracks keep whatever they had — the kit never touched them.
    CHECK_EQ (parameters.get (ParamKind::TrackSound, kLoopTrack), 9);
    CHECK_EQ (parameters.get (ParamKind::TrackTune, kLoopTrack), 99);
    CHECK_EQ (parameters.get (ParamKind::TrackTune, kBassTrack), 111);
}

BUD_TEST (Kit, savingAKitDoesNotTouchThePatternAndEditingThePatternDoesNotTouchTheKit)
{
    // p. 80: "Saving a drum kit does not save the pattern itself. Likewise, saving a pattern
    // does not update the drum kit parameters. Please note that they must be saved separately."
    Engine engine;
    engine.prepare (kSampleRate, 512);

    gateEveryTrack (engine.currentPattern());
    applySounds (engine.parameters(), 6);

    CHECK (engine.kits().save (2, engine.parameters(), "KIT"));

    const auto kitSnapshot = engine.kits().kit (2).values;

    // Edit the pattern afterwards. The stored kit must not follow along.
    engine.currentPattern().track (0).variation (Variation::A)[1].gate = true;
    engine.currentPattern().track (3).variation (Variation::A)[9].gate = false;
    applySounds (engine.parameters(), 77);

    CHECK (engine.kits().kit (2).values == kitSnapshot);
}

BUD_TEST (Kit, aKitChangesHowThePatternSoundsWithoutChangingWhatItPlays)
{
    // The audible version of the same property: two kits over one sequence give different audio,
    // and the note timing is untouched because the sequence never moved.
    const auto renderWithKit = [] (int slot, KitBank& kits)
    {
        Engine engine;
        engine.prepare (kSampleRate, 512);
        gateEveryTrack (engine.currentPattern());

        CHECK (kits.load (slot, engine.parameters()));

        std::vector<float> left (48000, 0.0f), right (48000, 0.0f);
        engine.start();

        for (int position = 0; position < 48000; position += 512)
            engine.process (left.data() + position, right.data() + position,
                            std::min (512, 48000 - position));

        return left;
    };

    KitBank kits;

    {
        ParameterSet parameters;

        for (int track = 0; track < kNumKitTracks; ++track)
        {
            parameters.set (ParamKind::TrackSoundBank, track, static_cast<int> (SoundBank::HH_CY));
            parameters.set (ParamKind::TrackSound, track, 10);
        }

        CHECK (kits.save (0, parameters, "HATS"));

        for (int track = 0; track < kNumKitTracks; ++track)
        {
            parameters.set (ParamKind::TrackSoundBank, track, static_cast<int> (SoundBank::TT));
            parameters.set (ParamKind::TrackSound, track, 60);
        }

        CHECK (kits.save (1, parameters, "TOMS"));
    }

    const auto hats = renderWithKit (0, kits);
    const auto toms = renderWithKit (1, kits);

    auto energyHats = 0.0;
    auto energyToms = 0.0;
    auto difference = 0.0f;

    for (std::size_t i = 0; i < hats.size(); ++i)
    {
        energyHats += static_cast<double> (hats[i]) * hats[i];
        energyToms += static_cast<double> (toms[i]) * toms[i];
        difference = std::max (difference, std::abs (hats[i] - toms[i]));
    }

    CHECK (energyHats > 0.1);
    CHECK (energyToms > 0.1);
    CHECK (difference > 1.0e-3f);
}
