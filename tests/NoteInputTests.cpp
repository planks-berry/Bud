#include "TestFramework.h"

#include "core/Engine.h"
#include "core/sequencer/NoteInput.h"

#include <algorithm>
#include <cmath>
#include <vector>

using namespace bud;

// Note input (p. 37-42) and mute modes (p. 103).

namespace
{

constexpr double kSampleRate = 48000.0;

struct Fixture
{
    Pattern pattern;
    ParameterSet parameters;
    NoteInput input;

    Fixture (int track = 0, RecordMode mode = RecordMode::Direct)
    {
        input.setPattern (&pattern);
        input.setParameters (&parameters);
        input.setTrack (track);
        input.setMode (mode);
    }

    Step& step (int index)
    {
        return pattern.track (input.track()).variation (Variation::A)[static_cast<std::size_t> (index)];
    }
};

} // namespace

//==============================================================================
// Direct recording (p. 37)

BUD_TEST (NoteInput, directRecordingTogglesAStep)
{
    Fixture f;

    CHECK (! f.step (4).gate);

    f.input.stepPressed (4);
    CHECK (f.step (4).gate);

    f.input.stepPressed (4);
    CHECK (! f.step (4).gate);
}

BUD_TEST (NoteInput, clearingAStepRemovesItsSubStepsButKeepsItsLocks)
{
    // p. 37: "If sub-steps are set, they will also be cleared. Parameter locks will be retained
    // and not be cleared."
    Fixture f;

    f.input.stepPressed (2);
    f.step (2).subStep = SubStepPattern::Four_1010;
    f.step (2).locks.set (makeParamId (ParamKind::TrackLevel, 0), 42);

    f.input.stepPressed (2);

    CHECK (! f.step (2).gate);
    CHECK (f.step (2).subStep == SubStepPattern::Off);

    const auto* lock = f.step (2).locks.find (makeParamId (ParamKind::TrackLevel, 0));
    CHECK (lock != nullptr);
    CHECK_EQ (*lock, 42);
}

BUD_TEST (NoteInput, stepPressesOutsideTheTracksLengthAreIgnored)
{
    Fixture f;
    f.parameters.set (ParamKind::TrackStepLength, 0, 8);

    f.input.stepPressed (12);
    CHECK (! f.step (12).gate);

    f.input.stepPressed (7);
    CHECK (f.step (7).gate);
}

//==============================================================================
// Step recording (p. 38-39)

BUD_TEST (NoteInput, stepRecordingWritesAtTheCursor)
{
    Fixture f (kBassTrack, RecordMode::Step);

    f.input.setCursor (5);
    f.input.keyPressed (7, 90);

    CHECK (f.step (5).gate);
    CHECK_EQ (static_cast<int> (f.step (5).note), 7);
    CHECK_EQ (static_cast<int> (f.step (5).velocity), 90);

    // Without auto-step the cursor stays put, so repeated presses overwrite the same step.
    CHECK_EQ (f.input.cursor(), 5);
}

BUD_TEST (NoteInput, autoStepAdvancesTheCursorOnEachKey)
{
    // p. 38: "the step can be advanced automatically each time a key of the keyboard is pressed."
    Fixture f (kBassTrack, RecordMode::Step);
    f.input.setAutoStep (true);
    f.input.setCursor (0);

    for (int i = 0; i < 4; ++i)
        f.input.keyPressed (i);

    for (int i = 0; i < 4; ++i)
    {
        CHECK (f.step (i).gate);
        CHECK_EQ (static_cast<int> (f.step (i).note), i);
    }

    CHECK_EQ (f.input.cursor(), 4);
}

BUD_TEST (NoteInput, autoStepWrapsAtTheEndOfTheTrack)
{
    Fixture f (kBassTrack, RecordMode::Step);
    f.parameters.set (ParamKind::TrackStepLength, kBassTrack, 4);
    f.input.setAutoStep (true);
    f.input.setCursor (3);

    f.input.keyPressed (1);

    CHECK (f.step (3).gate);
    CHECK_EQ (f.input.cursor(), 0);
}

BUD_TEST (NoteInput, pressingAStepMovesTheCursorInStepMode)
{
    // p. 38: "You can directly specify the step for note input by pressing the step."
    Fixture f (kBassTrack, RecordMode::Step);

    f.input.stepPressed (9);
    CHECK_EQ (f.input.cursor(), 9);

    f.input.keyPressed (3);
    CHECK (f.step (9).gate);

    // Once the key is released there is no tie in progress, so a second step press is a plain
    // cursor move — pressing a step in step mode must not toggle it the way direct recording
    // does, and must not silently tie to it either.
    f.input.keyReleased (3);
    f.input.stepPressed (11);

    CHECK_EQ (f.input.cursor(), 11);
    CHECK (! f.step (11).gate);
    CHECK (! f.step (10).gate);
    CHECK (! f.step (9).tie);
}

//==============================================================================
// Tied notes (p. 39)

BUD_TEST (NoteInput, holdingAKeyAcrossStepsTiesTheRange)
{
    // p. 39's own example: a note starting on step 2 and ending on step 5.
    Fixture f (kBassTrack, RecordMode::Step);

    f.input.stepPressed (1);       // step 2 on the panel
    f.input.keyPressed (5, 100);
    f.input.stepPressed (4);       // step 5

    for (int index = 1; index <= 4; ++index)
    {
        CHECK (f.step (index).gate);
        CHECK_EQ (static_cast<int> (f.step (index).note), 5);
    }

    // Every step but the last holds through; the last ends the note.
    CHECK (f.step (1).tie);
    CHECK (f.step (2).tie);
    CHECK (f.step (3).tie);
    CHECK (! f.step (4).tie);
}

BUD_TEST (NoteInput, tiesAreOnlyAvailableOnTheLoopAndBassTracks)
{
    // p. 39: "Tied note input is supported only on Track 10 and Track 11."
    for (int track = 0; track < kNumTracks; ++track)
    {
        Fixture f (track, RecordMode::Step);

        const auto allowed = f.input.tieRange (0, 3, 0);
        const auto expected = (track == kLoopTrack || track == kBassTrack);

        CHECK_EQ (allowed, expected);

        if (! expected)
            CHECK (! f.step (0).gate);
    }
}

BUD_TEST (NoteInput, aTieEnteredBackwardsStillCoversTheSameRange)
{
    // Pressing the later step first is a plausible slip and should not produce an empty range.
    Fixture f (kLoopTrack, RecordMode::Step);

    CHECK (f.input.tieRange (6, 2, 0));

    for (int index = 2; index <= 6; ++index)
        CHECK (f.step (index).gate);

    CHECK (f.step (5).tie);
    CHECK (! f.step (6).tie);
}

BUD_TEST (NoteInput, autoStepAndTieEntryDoNotCollide)
{
    // With auto-step on, the cursor has already moved by the time a second step is pressed, so
    // there is no coherent range to tie. The press should just move the cursor.
    Fixture f (kBassTrack, RecordMode::Step);
    f.input.setAutoStep (true);

    f.input.setCursor (0);
    f.input.keyPressed (4);
    f.input.stepPressed (6);

    CHECK_EQ (f.input.cursor(), 6);
    CHECK (f.step (0).gate);
    CHECK (! f.step (0).tie);
    CHECK (! f.step (3).gate);
}

//==============================================================================
// Real-time recording (p. 40)

BUD_TEST (NoteInput, realTimeRecordingLandsNotesOnTheNearestStep)
{
    Fixture f (kBassTrack, RecordMode::RealTime);

    // Sixteenths by default: a quarter note is four steps.
    f.input.keyPressed (0, 100, 0.0);        // step 0
    f.input.keyPressed (2, 100, 0.5);        // step 2
    f.input.keyPressed (4, 100, 0.7501);     // step 3, a hair late

    CHECK (f.step (0).gate);
    CHECK (f.step (2).gate);
    CHECK (f.step (3).gate);
}

BUD_TEST (NoteInput, aNotePlayedSlightlyEarlyBelongsToTheStepItWasAimingAt)
{
    // Truncating would push every marginally early note back a whole step, which is exactly the
    // opposite of what a player intends.
    Fixture f (kBassTrack, RecordMode::RealTime);

    f.input.keyPressed (0, 100, 0.49);   // just before step 2

    CHECK (f.step (2).gate);
    CHECK (! f.step (1).gate);
}

BUD_TEST (NoteInput, realTimeRecordingWrapsWithinTheTracksLength)
{
    Fixture f (kBassTrack, RecordMode::RealTime);
    f.parameters.set (ParamKind::TrackStepLength, kBassTrack, 4);

    f.input.keyPressed (9, 100, 1.25);   // step 5 nominally, which wraps to step 1

    CHECK (f.step (1).gate);
    CHECK_EQ (static_cast<int> (f.step (1).note), 9);
}

//==============================================================================
// Keyboard recording (p. 41)

BUD_TEST (NoteInput, keyboardRecordingWritesToAHeldStep)
{
    Fixture f (kBassTrack, RecordMode::Keyboard);

    f.input.stepPressed (10);
    f.input.keyPressed (3, 80);
    f.input.stepReleased (10);

    CHECK (f.step (10).gate);
    CHECK_EQ (static_cast<int> (f.step (10).note), 3);
    CHECK_EQ (static_cast<int> (f.step (10).velocity), 80);
}

BUD_TEST (NoteInput, aKeyWithNoStepHeldWritesNothing)
{
    // p. 41 allows either order, so a key alone is simply not yet an input event.
    Fixture f (kBassTrack, RecordMode::Keyboard);

    f.input.keyPressed (3);

    for (int index = 0; index < kStepsPerVariation; ++index)
        CHECK (! f.step (index).gate);
}

BUD_TEST (NoteInput, releasingTheStepEndsKeyboardEntry)
{
    Fixture f (kBassTrack, RecordMode::Keyboard);

    f.input.stepPressed (2);
    f.input.stepReleased (2);
    f.input.keyPressed (7);

    CHECK (! f.step (2).gate);
}

//==============================================================================

BUD_TEST (NoteInput, changingModeOrTrackClearsAnythingHalfEntered)
{
    Fixture f (kBassTrack, RecordMode::Keyboard);

    f.input.stepPressed (5);
    f.input.setMode (RecordMode::Direct);
    f.input.setMode (RecordMode::Keyboard);

    // The held step did not survive the round trip, so the key writes nothing.
    f.input.keyPressed (1);
    CHECK (! f.step (5).gate);
}

//==============================================================================
// Mute modes (p. 103)

namespace
{

float peakOfTrack (int muteMode, bool muted)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);
    engine.parameters().set (ParamKind::MuteMode, muteMode);
    engine.parameters().set (ParamKind::TrackMute, 0, muted ? 1 : 0);
    engine.parameters().set (ParamKind::TrackSoundBank, 0, static_cast<int> (SoundBank::BD));

    for (int step = 0; step < kStepsPerVariation; step += 4)
        engine.currentPattern().track (0).variation (Variation::A)[static_cast<std::size_t> (step)].gate = true;

    std::vector<float> left (48000, 0.0f), right (48000, 0.0f);
    engine.start();

    for (int position = 0; position < 48000; position += 512)
        engine.process (left.data() + position, right.data() + position,
                        std::min (512, 48000 - position));

    auto peak = 0.0f;

    for (std::size_t i = 0; i < left.size(); ++i)
        peak = std::max (peak, std::abs (left[i]));

    return peak;
}

} // namespace

BUD_TEST (NoteInput, bothMuteModesSilenceSequencedNotes)
{
    // p. 103: SOUND "mutes all sounds of the track"; SEQ "mutes only the notes entered in the
    // track's sequencer". Either way the sequence stops sounding — the difference is what else
    // can still play the track.
    CHECK (peakOfTrack (static_cast<int> (MuteMode::Sound), false) > 0.05f);
    CHECK (peakOfTrack (static_cast<int> (MuteMode::Sequencer), false) > 0.05f);

    CHECK_NEAR (static_cast<double> (peakOfTrack (static_cast<int> (MuteMode::Sound), true)),
                0.0, 1.0e-6);
    CHECK_NEAR (static_cast<double> (peakOfTrack (static_cast<int> (MuteMode::Sequencer), true)),
                0.0, 1.0e-6);
}

BUD_TEST (NoteInput, seqMuteLetsASoundingNoteRingOutWhileSoundMuteCutsIt)
{
    // The audible difference between the two modes. SOUND mutes the track, so whatever is
    // sounding stops dead. SEQ mutes only the sequencer, so the track is still a live voice —
    // a note already ringing finishes, and only the notes that would have followed are dropped.
    // That is the same mechanism which leaves the track playable from the keyboard or MIDI.
    const auto energyAfterMuting = [] (int muteMode)
    {
        Engine engine;
        engine.prepare (kSampleRate, 512);
        engine.parameters().set (ParamKind::MuteMode, muteMode);
        engine.parameters().set (ParamKind::Tempo, 120);
        engine.parameters().set (ParamKind::TrackSoundBank, 0, static_cast<int> (SoundBank::BD));
        engine.parameters().set (ParamKind::TrackDecay, 0, 127);   // a long tail to catch

        // One hit at the top of the pattern, nothing after it.
        engine.currentPattern().track (0).variation (Variation::A)[0].gate = true;

        std::vector<float> left (24000, 0.0f), right (24000, 0.0f);
        engine.start();

        // Let the hit start, then mute part-way through its decay.
        engine.process (left.data(), right.data(), 2400);
        engine.parameters().set (ParamKind::TrackMute, 0, 1);

        for (int position = 2400; position < 24000; position += 512)
            engine.process (left.data() + position, right.data() + position,
                            std::min (512, 24000 - position));

        auto energy = 0.0;

        for (std::size_t i = 2400; i < left.size(); ++i)
            energy += static_cast<double> (left[i]) * left[i];

        return energy;
    };

    const auto soundMuted = energyAfterMuting (static_cast<int> (MuteMode::Sound));
    const auto seqMuted = energyAfterMuting (static_cast<int> (MuteMode::Sequencer));

    // SOUND cuts it dead.
    CHECK_NEAR (soundMuted, 0.0, 1.0e-9);

    // SEQ lets the tail finish.
    CHECK (seqMuted > 0.01);
}

//==============================================================================
// Loop input (p. 42)

BUD_TEST (NoteInput, aRunOfLoopStepsPlaysThroughAndANoteAfterAGapRetriggers)
{
    // p. 42: "When notes are entered on all steps from 1 to 16, the sample will play in a loop
    // without retriggering." A retrigger happens where one is entered, "or when there is no note
    // on the step immediately preceding a note".
    Engine engine;
    engine.prepare (kSampleRate, 512);

    auto& loop = engine.currentPattern().track (kLoopTrack).variation (Variation::A);

    // Steps 0-3 continuous, a gap, then 8-11.
    for (int step = 0; step < 4; ++step)
        loop[static_cast<std::size_t> (step)].gate = true;

    for (int step = 8; step < 12; ++step)
        loop[static_cast<std::size_t> (step)].gate = true;

    TrackSequencer sequencer;
    sequencer.prepare (kLoopTrack);
    sequencer.setPattern (&engine.currentPattern().track (kLoopTrack));
    sequencer.reset();

    Transport transport;
    transport.prepare (kSampleRate);
    transport.setTempo (120.0);
    transport.start();

    Groove groove;
    groove.setTempo (120.0);
    groove.setModel (FeelModel::M909);

    std::vector<TriggerEvent> events;
    std::vector<bool> retriggers;

    // One bar of sixteenths.
    for (int block = 0; block < 32; ++block)
    {
        transport.beginBlock (6000);
        events.clear();
        sequencer.collectEvents (transport, groove, engine.parameters(), events);

        for (const auto& e : events)
            retriggers.push_back (e.retrigger);

        transport.endBlock();
    }

    CHECK (retriggers.size() >= 8);

    // Step 0 opens a run, so it retriggers; 1-3 continue it.
    CHECK (retriggers[0]);
    CHECK (! retriggers[1]);
    CHECK (! retriggers[2]);
    CHECK (! retriggers[3]);

    // Step 8 follows a gap, so it retriggers; 9-11 continue.
    CHECK (retriggers[4]);
    CHECK (! retriggers[5]);
    CHECK (! retriggers[6]);
    CHECK (! retriggers[7]);
}

BUD_TEST (NoteInput, aFullyGatedLoopTrackRetriggersOnlyOnceAtTheTop)
{
    // Sixteen gated steps is the documented "plays in a loop without retriggering" case. The
    // wrap from step 16 back to step 1 is a continuation, not a gap, so nothing retriggers
    // inside the bar — only the very first pass, which has nothing before it.
    Engine engine;
    engine.prepare (kSampleRate, 512);

    auto& loop = engine.currentPattern().track (kLoopTrack).variation (Variation::A);

    for (int step = 0; step < kStepsPerVariation; ++step)
        loop[static_cast<std::size_t> (step)].gate = true;

    TrackSequencer sequencer;
    sequencer.prepare (kLoopTrack);
    sequencer.setPattern (&engine.currentPattern().track (kLoopTrack));
    sequencer.reset();

    Transport transport;
    transport.prepare (kSampleRate);
    transport.setTempo (120.0);
    transport.start();

    Groove groove;
    groove.setTempo (120.0);
    groove.setModel (FeelModel::M909);

    std::vector<TriggerEvent> events;
    int retriggerCount = 0;
    int total = 0;

    for (int block = 0; block < 32; ++block)
    {
        transport.beginBlock (6000);
        events.clear();
        sequencer.collectEvents (transport, groove, engine.parameters(), events);

        for (const auto& e : events)
        {
            ++total;

            if (e.retrigger)
                ++retriggerCount;
        }

        transport.endBlock();
    }

    CHECK (total >= 16);
    CHECK_EQ (retriggerCount, 0);
}
