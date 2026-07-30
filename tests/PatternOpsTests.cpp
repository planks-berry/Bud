#include "TestFramework.h"

#include "core/Engine.h"

#include <algorithm>
#include <cmath>
#include <vector>

using namespace bud;

// Pattern operations (p. 56-59, 113): save, initialise, rename, chain playback, and TEMPO
// following either the pattern or the global setting.

namespace
{

constexpr double kSampleRate = 48000.0;

struct Rendered
{
    std::vector<float> left, right;
};

Rendered render (Engine& engine, int totalSamples, int blockSize)
{
    Rendered out;
    out.left.assign (static_cast<std::size_t> (totalSamples), 0.0f);
    out.right.assign (static_cast<std::size_t> (totalSamples), 0.0f);

    for (int position = 0; position < totalSamples; position += blockSize)
    {
        const auto count = std::min (blockSize, totalSamples - position);
        engine.process (out.left.data() + position, out.right.data() + position, count);
    }

    return out;
}

/// Gate the kick on every quarter of a pattern, so a pattern change is audible.
void gateKick (Pattern& pattern, int sound)
{
    for (int step = 0; step < kStepsPerVariation; step += 4)
        pattern.track (0).variation (Variation::A)[static_cast<std::size_t> (step)].gate = true;

    (void) sound;
}

} // namespace

//==============================================================================
// Save and recall (p. 56)

BUD_TEST (PatternOps, savingCapturesSettingsAndSelectingRestoresThem)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);

    engine.parameters().set (ParamKind::TrackLevel, 0, 111);
    engine.parameters().set (ParamKind::ReverbMix, 99);
    engine.savePattern();

    // Move to another pattern, change things, save that too.
    engine.selectPattern (1);
    engine.process (nullptr, nullptr, 0);   // no-op; the switch applies on the next real block

    std::vector<float> l (64, 0.0f), r (64, 0.0f);
    engine.process (l.data(), r.data(), 64);

    engine.parameters().set (ParamKind::TrackLevel, 0, 22);
    engine.parameters().set (ParamKind::ReverbMix, 5);
    engine.savePattern();

    // Back to the first: its settings come with it.
    engine.selectPattern (0);
    engine.process (l.data(), r.data(), 64);

    CHECK_EQ (engine.parameters().get (ParamKind::TrackLevel, 0), 111);
    CHECK_EQ (engine.parameters().get (ParamKind::ReverbMix), 99);
}

BUD_TEST (PatternOps, anUnsavedPatternRecallsNothingRatherThanZeroes)
{
    // Applying an unsaved pattern's empty settings would set every level, bank and tempo to zero
    // and arrive as silence.
    PatternBank patterns;
    ParameterSet parameters;

    const auto levelBefore = parameters.get (ParamKind::TrackLevel, 0);
    const auto tempoBefore = parameters.get (ParamKind::Tempo);

    CHECK (! patterns.recall (4, parameters, true));

    CHECK_EQ (parameters.get (ParamKind::TrackLevel, 0), levelBefore);
    CHECK_EQ (parameters.get (ParamKind::Tempo), tempoBefore);
}

BUD_TEST (PatternOps, aPatternCarriesItsSoundsAndItsSequencerSettings)
{
    // Unlike a kit, a pattern owns both halves — a kit is stamped *into* a pattern (p. 79).
    PatternBank patterns;
    ParameterSet parameters;

    parameters.set (ParamKind::TrackSound, 3, 77);
    parameters.set (ParamKind::TrackStepLength, 3, 7);
    parameters.set (ParamKind::TrackNoteLength, 3, static_cast<int> (StepDivision::Eighth));
    parameters.set (ParamKind::TrackMute, 3, 1);

    patterns.store (0, parameters);

    parameters.set (ParamKind::TrackSound, 3, 1);
    parameters.set (ParamKind::TrackStepLength, 3, 16);
    parameters.set (ParamKind::TrackNoteLength, 3, static_cast<int> (StepDivision::Sixteenth));
    parameters.set (ParamKind::TrackMute, 3, 0);

    CHECK (patterns.recall (0, parameters, true));

    CHECK_EQ (parameters.get (ParamKind::TrackSound, 3), 77);
    CHECK_EQ (parameters.get (ParamKind::TrackStepLength, 3), 7);
    CHECK_EQ (parameters.get (ParamKind::TrackNoteLength, 3),
              static_cast<int> (StepDivision::Eighth));
    CHECK_EQ (parameters.get (ParamKind::TrackMute, 3), 1);
}

BUD_TEST (PatternOps, aPatternDoesNotCarryMasterVolumeOrTheMasterEffectSwitch)
{
    // Master volume is a front-panel performance control, and MFX ON is explicitly not saved with
    // the pattern. A pattern that restored either would fight the player.
    PatternBank patterns;
    ParameterSet parameters;

    parameters.set (ParamKind::MasterVolume, 40);
    parameters.set (ParamKind::MasterFxEnabled, 0);
    patterns.store (0, parameters);

    parameters.set (ParamKind::MasterVolume, 120);
    parameters.set (ParamKind::MasterFxEnabled, 1);

    CHECK (patterns.recall (0, parameters, true));

    CHECK_EQ (parameters.get (ParamKind::MasterVolume), 120);
    CHECK_EQ (parameters.get (ParamKind::MasterFxEnabled), 1);
}

//==============================================================================
// Initialise (p. 57)

BUD_TEST (PatternOps, initialisingClearsStepsLocksSettingsAndTheName)
{
    // p. 57: "Pattern settings along with note and parameter lock data will all be cleared."
    Engine engine;
    engine.prepare (kSampleRate, 512);

    auto& pattern = engine.patterns().pattern (2);
    gateKick (pattern, 0);
    pattern.track (0).variation (Variation::A)[0].locks.set (
        makeParamId (ParamKind::TrackLevel, 0), 20);

    engine.patterns().rename (2, "OLD");
    engine.patterns().store (2, engine.parameters());

    CHECK (pattern.settings.stored);

    engine.initialisePattern (2);

    CHECK (! engine.patterns().pattern (2).settings.stored);
    CHECK (engine.patterns().pattern (2).name.empty());

    for (int step = 0; step < kStepsPerVariation; ++step)
        CHECK (! engine.patterns().pattern (2)
                   .track (0).variation (Variation::A)[static_cast<std::size_t> (step)].gate);

    CHECK (engine.patterns().pattern (2)
               .track (0).variation (Variation::A)[0].locks.find (
                   makeParamId (ParamKind::TrackLevel, 0)) == nullptr);
}

BUD_TEST (PatternOps, initialisingTheCurrentPatternAlsoClearsMuteAndSolo)
{
    // p. 57: "Executing CLR + PTN also clears MUTE and SOLO selection modes."
    Engine engine;
    engine.prepare (kSampleRate, 512);

    engine.parameters().set (ParamKind::TrackMute, 0, 1);
    engine.parameters().set (ParamKind::TrackMute, 4, 1);
    engine.setSolo (2);

    engine.initialisePattern (engine.patternIndex());

    CHECK_EQ (engine.parameters().get (ParamKind::TrackMute, 0), 0);
    CHECK_EQ (engine.parameters().get (ParamKind::TrackMute, 4), 0);
    CHECK_EQ (engine.solo(), -1);
}

BUD_TEST (PatternOps, initialisingAnotherPatternDoesNotTouchTheLiveOne)
{
    // Clearing a pattern you are not on must not reach out and change the sound of the one you
    // are playing.
    Engine engine;
    engine.prepare (kSampleRate, 512);

    engine.parameters().set (ParamKind::TrackMute, 0, 1);
    engine.setSolo (3);

    engine.initialisePattern (9);

    CHECK_EQ (engine.parameters().get (ParamKind::TrackMute, 0), 1);
    CHECK_EQ (engine.solo(), 3);
}

//==============================================================================
// Rename (p. 58)

BUD_TEST (PatternOps, renamingKeepsEverythingElse)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);

    gateKick (engine.patterns().pattern (5), 0);
    engine.patterns().store (5, engine.parameters());

    CHECK (engine.patterns().rename (5, "INTRO"));

    CHECK (engine.patterns().pattern (5).name == "INTRO");
    CHECK (engine.patterns().pattern (5).settings.stored);
    CHECK (engine.patterns().pattern (5).track (0).variation (Variation::A)[0].gate);

    CHECK (! engine.patterns().rename (-1, "X"));
    CHECK (! engine.patterns().rename (kNumPatterns, "X"));
}

//==============================================================================
// Tempo source (p. 113)

BUD_TEST (PatternOps, tempoFollowsThePatternOrTheGlobalSetting)
{
    PatternBank patterns;
    ParameterSet parameters;

    parameters.set (ParamKind::Tempo, 90);
    patterns.store (0, parameters);

    // PTN: the pattern's tempo comes with it.
    parameters.set (ParamKind::Tempo, 150);
    CHECK (patterns.recall (0, parameters, true));
    CHECK_EQ (parameters.get (ParamKind::Tempo), 90);

    // GLOBAL: the tempo belongs to the instrument and stays where it is.
    parameters.set (ParamKind::Tempo, 150);
    CHECK (patterns.recall (0, parameters, false));
    CHECK_EQ (parameters.get (ParamKind::Tempo), 150);

    // Everything else still arrives either way.
    parameters.set (ParamKind::TrackLevel, 0, 3);
    CHECK (patterns.recall (0, parameters, false));
    CHECK_EQ (parameters.get (ParamKind::TrackLevel, 0), 100);
}

BUD_TEST (PatternOps, theEngineHonoursTheTempoSourceWhenSwitchingPattern)
{
    const auto tempoAfterSwitch = [] (int tempoSource)
    {
        Engine engine;
        engine.prepare (kSampleRate, 512);
        engine.parameters().set (ParamKind::TempoSource, tempoSource);

        engine.parameters().set (ParamKind::Tempo, 90);
        engine.savePatternTo (0);

        engine.parameters().set (ParamKind::Tempo, 160);
        engine.savePatternTo (1);

        std::vector<float> l (128, 0.0f), r (128, 0.0f);

        // Move away from pattern 0 first — the engine starts on it, and selecting the pattern
        // already playing is not a switch.
        engine.selectPattern (1);
        engine.process (l.data(), r.data(), 128);

        engine.selectPattern (0);
        engine.process (l.data(), r.data(), 128);

        return engine.parameters().get (ParamKind::Tempo);
    };

    CHECK_EQ (tempoAfterSwitch (0), 90);    // PTN
    CHECK_EQ (tempoAfterSwitch (1), 160);   // GLOBAL — unchanged
}

//==============================================================================
// Chain playback (p. 59)

BUD_TEST (PatternOps, aChainSelectsItsFirstPatternAndReportsItsPosition)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);

    CHECK (! engine.isChaining());
    CHECK_EQ (engine.chainPosition(), -1);

    const int chain[] = { 3, 7, 1 };
    engine.setPatternChain (chain);

    CHECK (engine.isChaining());
    CHECK_EQ (engine.chainPosition(), 0);
    CHECK_EQ (static_cast<int> (engine.patternChain().size()), 3);

    std::vector<float> l (64, 0.0f), r (64, 0.0f);
    engine.process (l.data(), r.data(), 64);

    CHECK_EQ (engine.patternIndex(), 3);
}

BUD_TEST (PatternOps, outOfRangeChainEntriesAreDroppedRatherThanClamped)
{
    // Clamping would silently substitute a pattern the player did not choose.
    Engine engine;
    engine.prepare (kSampleRate, 512);

    const int chain[] = { -1, 5, kNumPatterns, 6 };
    engine.setPatternChain (chain);

    CHECK_EQ (static_cast<int> (engine.patternChain().size()), 2);
    CHECK_EQ (engine.patternChain()[0], 5);
    CHECK_EQ (engine.patternChain()[1], 6);
}

BUD_TEST (PatternOps, anEmptyChainEndsChainPlayback)
{
    // p. 59: "Press PTN again to end chain playback."
    Engine engine;
    engine.prepare (kSampleRate, 512);

    const int chain[] = { 2, 4 };
    engine.setPatternChain (chain);
    CHECK (engine.isChaining());

    engine.clearPatternChain();

    CHECK (! engine.isChaining());
    CHECK_EQ (engine.chainPosition(), -1);
}

BUD_TEST (PatternOps, aChainAdvancesThroughItsPatternsInOrderAndWrapsRound)
{
    Engine engine;
    engine.prepare (kSampleRate, 8192);
    engine.parameters().set (ParamKind::Tempo, 240);   // a 16-step pattern is one second

    const int chain[] = { 0, 1, 2 };
    engine.setPatternChain (chain);
    engine.start();

    std::vector<int> seen;
    std::vector<float> l (4800, 0.0f), r (4800, 0.0f);

    // Ten tenths of a second each; sampling the index as it goes.
    for (int i = 0; i < 40; ++i)
    {
        engine.process (l.data(), r.data(), 4800);

        if (seen.empty() || seen.back() != engine.patternIndex())
            seen.push_back (engine.patternIndex());
    }

    // Four seconds at one second per pattern: 0, 1, 2, then round to 0 again.
    CHECK (seen.size() >= 4);
    CHECK_EQ (seen[0], 0);
    CHECK_EQ (seen[1], 1);
    CHECK_EQ (seen[2], 2);
    CHECK_EQ (seen[3], 0);
}

BUD_TEST (PatternOps, theChainLengthFollowsTheLongestTrack)
{
    // The manual does not define a pattern's length when tracks run at different divisions and
    // step lengths, so the choice is ours: the longest track, since taking the shortest would
    // cut a polymetric track off mid-phrase.
    Engine engine;
    engine.prepare (kSampleRate, 512);

    // Everything at the default: sixteen sixteenths is four quarter notes.
    CHECK_NEAR (engine.patternLengthQuarterNotes(), 4.0, 1.0e-9);

    // One track at eighths over sixteen steps is eight quarter notes, and it is now the longest.
    engine.parameters().set (ParamKind::TrackNoteLength, 5,
                             static_cast<int> (StepDivision::Eighth));

    CHECK_NEAR (engine.patternLengthQuarterNotes(), 8.0, 1.0e-9);

    // Shortening that track's step length shortens the pattern with it.
    engine.parameters().set (ParamKind::TrackStepLength, 5, 4);

    CHECK_NEAR (engine.patternLengthQuarterNotes(), 4.0, 1.0e-9);
}

BUD_TEST (PatternOps, chainPlaybackIsIdenticalAtEveryBlockSize)
{
    // A chain advance is musically scheduled, so it has to land on the same sample whatever the
    // host's buffer size. Left to the block boundary it would arrive up to a whole block late —
    // at 4096 samples that is nearly a tenth of a second, and different for every host.
    const auto build = [] (int blockSize)
    {
        Engine engine;
        engine.prepare (kSampleRate, 8192);
        engine.parameters().set (ParamKind::Tempo, 240);
        engine.parameters().set (ParamKind::Feel, static_cast<int> (FeelModel::M909));

        // Two patterns with clearly different content, so a mistimed switch shows up as audio.
        for (int index : { 0, 1 })
        {
            auto& pattern = engine.patterns().pattern (index);

            for (int step = 0; step < kStepsPerVariation; step += (index == 0 ? 4 : 2))
                pattern.track (0).variation (Variation::A)[static_cast<std::size_t> (step)].gate = true;
        }

        engine.parameters().set (ParamKind::TrackSoundBank, 0, static_cast<int> (SoundBank::BD));

        const int chain[] = { 0, 1 };
        engine.setPatternChain (chain);
        engine.start();

        // Two seconds at 240 bpm is two patterns, so the render spans a chain advance — enough
        // to pin the property without making the block-size-1 pass render nearly two hundred
        // thousand separate engine calls, which dominates a sanitiser run for no extra coverage.
        return render (engine, 96000, blockSize);
    };

    const auto reference = build (512);

    auto peak = 0.0f;
    for (const auto v : reference.left)
        peak = std::max (peak, std::abs (v));

    CHECK (peak > 0.05f);

    for (int blockSize : { 1, 7, 64, 333, 1024, 4096 })
    {
        const auto out = build (blockSize);

        int differing = 0;

        for (std::size_t i = 0; i < reference.left.size(); ++i)
            if (out.left[i] != reference.left[i] || out.right[i] != reference.right[i])
                ++differing;

        CHECK_EQ (differing, 0);
    }
}

BUD_TEST (PatternOps, restartingRewindsTheChainToItsFirstPattern)
{
    // Without re-anchoring on start, the chain's musical origin would still be wherever the
    // previous run had reached while the transport went back to zero — so the chain would sit on
    // one pattern until the clock caught up, for as long as the previous run had lasted.
    Engine engine;
    engine.prepare (kSampleRate, 8192);
    engine.parameters().set (ParamKind::Tempo, 240);   // one second per pattern

    const int chain[] = { 0, 1, 2 };
    engine.setPatternChain (chain);
    engine.start();

    std::vector<float> l (48000, 0.0f), r (48000, 0.0f);

    // Run two and a bit patterns in, so the chain is part-way through.
    render (engine, 120000, 4800);
    CHECK (engine.chainPosition() > 0);

    engine.stop();
    engine.start();

    CHECK_EQ (engine.chainPosition(), 0);

    // And it advances again from the top rather than stalling.
    engine.process (l.data(), r.data(), 48000);
    CHECK_EQ (engine.patternIndex(), 0);

    engine.process (l.data(), r.data(), 48000);
    CHECK_EQ (engine.chainPosition(), 1);
}
