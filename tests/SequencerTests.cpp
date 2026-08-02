#include "TestFramework.h"

#include "core/Engine.h"
#include "core/Transport.h"
#include "core/params/ParameterSet.h"
#include "core/sequencer/Groove.h"
#include "core/sequencer/Pattern.h"
#include "core/sequencer/TrackSequencer.h"

#include <algorithm>
#include <set>
#include <vector>

using namespace bud;

namespace
{

constexpr double kSampleRate = 48000.0;
constexpr int kTempo = 120;
constexpr double kSamplesPerQuarter = 24000.0;   // at 120 bpm / 48 kHz
constexpr double kSamplesPerSixteenth = 6000.0;

struct Hit
{
    double globalSample;
    int step;
    int chain;
    int subStep;
    float velocity;
};

/// Drives a single track sequencer over a run of blocks and records every trigger with its
/// position on the absolute sample timeline.
struct Harness
{
    Transport transport;
    Groove groove;
    ParameterSet params;
    TrackSequencer sequencer;
    TrackPattern pattern;
    std::vector<Hit> hits;
    int track = 0;

    explicit Harness (int trackIndex = 0)
        : track (trackIndex)
    {
        transport.prepare (kSampleRate);
        transport.setTempo (kTempo);
        groove.setTempo (kTempo);
        groove.setDepth (0.0f);   // locked to the grid unless a test asks otherwise
        params.set (ParamKind::Tempo, kTempo);
        sequencer.prepare (trackIndex);
        sequencer.setPattern (&pattern);
    }

    void set (ParamKind kind, int value) { params.set (kind, track, value); }
    void setGlobal (ParamKind kind, int value) { params.set (kind, value); }

    void gateAll (Variation v = Variation::A)
    {
        for (auto& step : pattern.variation (v))
            step.gate = true;
    }

    void gateStep (int index, Variation v = Variation::A)
    {
        pattern.variation (v)[static_cast<std::size_t> (index)].gate = true;
    }

    Step& step (int index, Variation v = Variation::A)
    {
        return pattern.variation (v)[static_cast<std::size_t> (index)];
    }

    void run (long long totalSamples, int blockSize)
    {
        transport.start();
        sequencer.reset();
        hits.clear();

        std::vector<TriggerEvent> events;
        long long consumed = 0;

        while (consumed < totalSamples)
        {
            const auto n = static_cast<int> (std::min<long long> (blockSize,
                                                                  totalSamples - consumed));

            transport.beginBlock (n);
            events.clear();
            sequencer.collectEvents (transport, groove, params, events);

            std::sort (events.begin(), events.end(),
                       [] (const TriggerEvent& a, const TriggerEvent& b)
                       { return a.sampleOffset < b.sampleOffset; });

            for (const auto& e : events)
                hits.push_back (Hit { static_cast<double> (consumed) + e.sampleOffset,
                                      e.stepIndex, e.chainIndex, e.subStep, e.velocity });

            transport.endBlock();
            consumed += n;
        }
    }
};

} // namespace

//==============================================================================

BUD_TEST (Sequencer, stepsLandExactlyOnTheGrid)
{
    Harness h;
    h.gateAll();
    h.run (96000, 512);   // exactly four quarter notes

    CHECK_EQ (h.hits.size(), std::size_t (16));

    for (std::size_t i = 0; i < h.hits.size(); ++i)
    {
        CHECK_NEAR (h.hits[i].globalSample, static_cast<double> (i) * kSamplesPerSixteenth, 1.0e-3);
        CHECK_EQ (h.hits[i].step, static_cast<int> (i));
    }
}

BUD_TEST (Sequencer, resultsAreIdenticalAtEveryBlockSize)
{
    // The load-bearing test for the lookahead/pending design: a trigger must not be dropped,
    // duplicated or moved by whatever block size the host happens to use.
    const auto reference = [] {
        Harness h;
        h.gateAll();
        h.run (96000, 512);
        return h.hits;
    }();

    CHECK_EQ (reference.size(), std::size_t (16));

    for (int blockSize : { 1, 3, 7, 32, 64, 127, 256, 1024, 4096, 8192 })
    {
        Harness h;
        h.gateAll();
        h.run (96000, blockSize);

        CHECK_EQ (h.hits.size(), reference.size());

        const auto count = std::min (h.hits.size(), reference.size());
        for (std::size_t i = 0; i < count; ++i)
        {
            CHECK_NEAR (h.hits[i].globalSample, reference[i].globalSample, 1.0e-3);
            CHECK_EQ (h.hits[i].step, reference[i].step);
        }
    }
}

BUD_TEST (Sequencer, driftedTriggersSurviveEveryBlockSize)
{
    // Same again with FEEL running, where triggers land off-grid and can cross block
    // boundaries in both directions. Track 4 defaults to the HH bank, which FEEL does affect.
    const auto runAt = [] (int blockSize)
    {
        Harness h (4);
        h.groove.setModel (FeelModel::Minimal);
        h.groove.setDepth (1.0f);
        h.gateAll();
        h.run (96000 * 4, blockSize);
        return h.hits;
    };

    const auto reference = runAt (512);
    CHECK_EQ (reference.size(), std::size_t (64));

    for (int blockSize : { 1, 13, 64, 333, 2048 })
    {
        const auto hits = runAt (blockSize);
        CHECK_EQ (hits.size(), reference.size());

        const auto count = std::min (hits.size(), reference.size());
        for (std::size_t i = 0; i < count; ++i)
            CHECK_NEAR (hits[i].globalSample, reference[i].globalSample, 1.0e-3);
    }
}

BUD_TEST (Sequencer, gatesOffProduceNothing)
{
    Harness h;
    h.run (96000, 512);
    CHECK_EQ (h.hits.size(), std::size_t (0));
}

BUD_TEST (Sequencer, stepLengthShortensThePhrase)
{
    Harness h;
    h.set (ParamKind::TrackStepLength, 5);
    h.gateAll();
    h.run (96000, 256);

    CHECK_EQ (h.hits.size(), std::size_t (16));

    for (std::size_t i = 0; i < h.hits.size(); ++i)
        CHECK_EQ (h.hits[i].step, static_cast<int> (i % 5));
}

BUD_TEST (Sequencer, chainPlaysAllFourVariationsInOrder)
{
    Harness h;
    h.pattern.setChain ({ Variation::A, Variation::B, Variation::C, Variation::D });

    for (auto v : { Variation::A, Variation::B, Variation::C, Variation::D })
        h.gateStep (0, v);

    h.run (static_cast<long long> (kSamplesPerSixteenth) * 64, 512);

    CHECK_EQ (h.hits.size(), std::size_t (4));

    for (std::size_t i = 0; i < h.hits.size(); ++i)
    {
        CHECK_EQ (h.hits[i].chain, static_cast<int> (i));
        CHECK_NEAR (h.hits[i].globalSample,
                    static_cast<double> (i) * 16.0 * kSamplesPerSixteenth, 1.0e-3);
    }
}

BUD_TEST (Sequencer, rotationShiftsThePhraseWithoutDestroyingIt)
{
    Harness h;
    h.gateStep (0);
    h.pattern.rotation = 3;
    h.run (96000, 512);

    CHECK_EQ (h.hits.size(), std::size_t (1));
    CHECK_EQ (h.hits[0].step, 3);

    // The stored pattern is untouched — rotation is a read offset, so it can be swept live.
    CHECK (h.pattern.variation (Variation::A)[0].gate);
}

//==============================================================================
// Sub-step figures (p. 49)

BUD_TEST (Sequencer, subStepFiguresProduceTheirDocumentedRhythms)
{
    struct Case
    {
        SubStepPattern pattern;
        int divisions;
        std::vector<int> sounding;   ///< Which divisions fire
    };

    const Case cases[] = {
        { SubStepPattern::Off,       1, { 0 } },
        { SubStepPattern::Four_1111, 4, { 0, 1, 2, 3 } },
        { SubStepPattern::Four_1100, 4, { 0, 1 } },
        { SubStepPattern::Four_1010, 4, { 0, 2 } },
        { SubStepPattern::Four_0010, 4, { 2 } },
        { SubStepPattern::Four_1001, 4, { 0, 3 } },
        { SubStepPattern::Four_1011, 4, { 0, 2, 3 } },
        { SubStepPattern::Four_0001, 4, { 3 } },
        { SubStepPattern::Four_0011, 4, { 2, 3 } },
        { SubStepPattern::Three_111, 3, { 0, 1, 2 } },
        { SubStepPattern::Three_110, 3, { 0, 1 } },
    };

    for (const auto& c : cases)
    {
        Harness h;
        h.gateStep (0);
        h.step (0).subStep = c.pattern;
        h.run (96000, 512);

        CHECK_EQ (h.hits.size(), c.sounding.size());

        const auto spacing = kSamplesPerSixteenth / static_cast<double> (c.divisions);

        for (std::size_t i = 0; i < std::min (h.hits.size(), c.sounding.size()); ++i)
        {
            CHECK_EQ (h.hits[i].subStep, c.sounding[i]);
            CHECK_NEAR (h.hits[i].globalSample,
                        static_cast<double> (c.sounding[i]) * spacing, 1.0e-3);
        }
    }
}

BUD_TEST (Sequencer, tripletSubStepsDivideTheStepInThree)
{
    Harness h;
    h.gateStep (0);
    h.step (0).subStep = SubStepPattern::Three_111;
    h.run (96000, 512);

    CHECK_EQ (h.hits.size(), std::size_t (3));

    // Three in the space of one step, not four.
    const auto spacing = kSamplesPerSixteenth / 3.0;
    CHECK_NEAR (h.hits[1].globalSample - h.hits[0].globalSample, spacing, 1.0e-3);
    CHECK_NEAR (h.hits[2].globalSample - h.hits[1].globalSample, spacing, 1.0e-3);
}

//==============================================================================
// Note lengths (p. 35)

BUD_TEST (Sequencer, noteLengthChangesTheStepRate)
{
    struct Case { StepDivision division; double quarterNotes; };

    const Case cases[] = {
        { StepDivision::Quarter,        1.0 },
        { StepDivision::DottedQuarter,  1.5 },
        { StepDivision::TripletQuarter, 2.0 / 3.0 },
        { StepDivision::Eighth,         0.5 },
        { StepDivision::DottedEighth,   0.75 },
        { StepDivision::TripletEighth,  1.0 / 3.0 },
        { StepDivision::Sixteenth,      0.25 },
        { StepDivision::ThirtySecond,   0.125 },
    };

    for (const auto& c : cases)
    {
        Harness h;
        h.set (ParamKind::TrackNoteLength, static_cast<int> (c.division));
        h.gateAll();
        h.run (static_cast<long long> (kSamplesPerQuarter) * 4, 512);

        CHECK (h.hits.size() > 1);

        const auto expected = c.quarterNotes * kSamplesPerQuarter;

        for (std::size_t i = 1; i < h.hits.size(); ++i)
            CHECK_NEAR (h.hits[i].globalSample - h.hits[i - 1].globalSample, expected, 1.0e-3);
    }
}

BUD_TEST (Sequencer, tripletsStayOnGridOverALongRun)
{
    // Triplet divisions are not exactly representable in binary. Deriving step times from a
    // step count against an anchor, rather than accumulating them, is what keeps this exact.
    Harness h;
    h.set (ParamKind::TrackNoteLength, static_cast<int> (StepDivision::TripletEighth));
    h.gateAll();

    const long long samples = static_cast<long long> (kSamplesPerQuarter) * 4 * 64;
    h.run (samples, 480);

    const auto stepSamples = kSamplesPerQuarter / 3.0;
    const auto expected = static_cast<std::size_t> (static_cast<double> (samples) / stepSamples);

    // Allow one either way for the boundary.
    CHECK (h.hits.size() + 1 >= expected);
    CHECK (h.hits.size() <= expected + 1);

    // The last hit must still be where arithmetic says it should be, not a sample adrift.
    const auto index = static_cast<double> (h.hits.size() - 1);
    CHECK_NEAR (h.hits.back().globalSample, index * stepSamples, 0.5);
}

BUD_TEST (Sequencer, tracksWithDifferentDivisionsRunPolymetrically)
{
    Harness fast (0);
    fast.set (ParamKind::TrackNoteLength, static_cast<int> (StepDivision::Sixteenth));
    fast.set (ParamKind::TrackStepLength, 16);
    fast.gateAll();

    Harness slow (1);
    slow.set (ParamKind::TrackNoteLength, static_cast<int> (StepDivision::Eighth));
    slow.set (ParamKind::TrackStepLength, 12);
    slow.gateAll();

    const long long samples = static_cast<long long> (kSamplesPerQuarter * 12.0);
    fast.run (samples, 512);
    slow.run (samples, 512);

    CHECK_EQ (fast.hits.size(), std::size_t (48));
    CHECK_EQ (slow.hits.size(), std::size_t (24));

    CHECK_EQ (slow.hits[11].step, 11);
    CHECK_EQ (slow.hits[12].step, 0);
}

//==============================================================================
// Swing (p. 51)

BUD_TEST (Sequencer, swingIsStraightAtFifty)
{
    Harness h;
    h.gateAll();
    h.setGlobal (ParamKind::Swing, 50);
    h.run (96000, 512);

    for (std::size_t i = 0; i < h.hits.size(); ++i)
        CHECK_NEAR (h.hits[i].globalSample, static_cast<double> (i) * kSamplesPerSixteenth,
                    1.0e-3);
}

BUD_TEST (Sequencer, swingDisplacesTheSecondHalfOfEachPair)
{
    Harness h;
    h.gateAll();
    h.setGlobal (ParamKind::Swing, 75);   // maximum
    h.setGlobal (ParamKind::SwingResolution, static_cast<int> (SwingResolution::Sixteenth));
    h.run (96000, 512);

    CHECK_EQ (h.hits.size(), std::size_t (16));

    // At 75 % the offbeat sits half a step late.
    const auto offset = 0.5 * kSamplesPerSixteenth;

    for (std::size_t i = 0; i < h.hits.size(); ++i)
    {
        const auto nominal = static_cast<double> (i) * kSamplesPerSixteenth;
        const auto expected = (i % 2 == 0) ? nominal : nominal + offset;
        CHECK_NEAR (h.hits[i].globalSample, expected, 1.0e-3);
    }
}

BUD_TEST (Sequencer, swingResolutionWidensThePair)
{
    // At 8TH resolution the swing unit is twice the note length, so a pair spans four
    // sixteenths and every step inside it moves proportionally.
    Harness h;
    h.gateAll();
    h.setGlobal (ParamKind::Swing, 75);
    h.setGlobal (ParamKind::SwingResolution, static_cast<int> (SwingResolution::Eighth));
    h.run (96000 + static_cast<long long> (kSamplesPerSixteenth) * 2, 512);

    CHECK (h.hits.size() >= std::size_t (16));

    // The pair spans steps 0-3: its start stays put, its midpoint moves three quarters of the
    // way through, and the steps around that are stretched and compressed to match.
    CHECK_NEAR (h.hits[0].globalSample, 0.0, 1.0e-3);
    CHECK_NEAR (h.hits[1].globalSample, 1.5 * kSamplesPerSixteenth, 1.0e-3);
    CHECK_NEAR (h.hits[2].globalSample, 3.0 * kSamplesPerSixteenth, 1.0e-3);
    CHECK_NEAR (h.hits[3].globalSample, 3.5 * kSamplesPerSixteenth, 1.0e-3);

    // The next pair starts where it should, not on top of the previous one.
    CHECK_NEAR (h.hits[4].globalSample, 4.0 * kSamplesPerSixteenth, 1.0e-3);
}

BUD_TEST (Sequencer, swingNeverCollapsesTwoStepsOntoEachOther)
{
    // Whatever the amount and resolution, steps must stay strictly in order. Displacing the
    // second half of each pair rigidly — the obvious first approach — puts the last step of one
    // pair on top of the first step of the next once the pair spans more than two steps.
    for (int percent : { 50, 58, 66, 75 })
    {
        for (auto resolution : { SwingResolution::Sixteenth, SwingResolution::Eighth })
        {
            Harness h;
            h.gateAll();
            h.setGlobal (ParamKind::Swing, percent);
            h.setGlobal (ParamKind::SwingResolution, static_cast<int> (resolution));
            h.run (96000, 512);

            CHECK (h.hits.size() > 8);

            for (std::size_t i = 1; i < h.hits.size(); ++i)
                CHECK (h.hits[i].globalSample > h.hits[i - 1].globalSample);
        }
    }
}

BUD_TEST (Sequencer, trackSwingOverridesThePattern)
{
    Harness h;
    h.gateAll();
    h.setGlobal (ParamKind::Swing, 50);           // pattern is straight
    h.set (ParamKind::TrackSwing, 75);            // this track is not
    h.setGlobal (ParamKind::SwingResolution, static_cast<int> (SwingResolution::Sixteenth));
    h.run (96000, 512);

    CHECK_NEAR (h.hits[1].globalSample,
                kSamplesPerSixteenth + 0.5 * kSamplesPerSixteenth, 1.0e-3);

    // Below 50 the track follows the pattern again.
    Harness following;
    following.gateAll();
    following.setGlobal (ParamKind::Swing, 50);
    following.set (ParamKind::TrackSwing, 49);
    following.run (96000, 512);

    CHECK_NEAR (following.hits[1].globalSample, kSamplesPerSixteenth, 1.0e-3);
}

//==============================================================================
// Accent, random velocity, nudge

BUD_TEST (Sequencer, hardAndSoftAccentMoveInOppositeDirections)
{
    Harness h;
    h.gateAll();
    h.step (0).accent = Accent::Hard;
    h.step (1).accent = Accent::Normal;
    h.step (2).accent = Accent::Soft;
    h.run (96000, 512);

    CHECK (h.hits[0].velocity > h.hits[1].velocity);
    CHECK (h.hits[1].velocity > h.hits[2].velocity);
}

BUD_TEST (Sequencer, accentDepthsScaleTheEffect)
{
    const auto velocityWithDepth = [] (int depth)
    {
        Harness h;
        h.gateStep (0);
        h.step (0).accent = Accent::Hard;
        h.setGlobal (ParamKind::AccentHardDepth, depth);
        h.run (96000, 512);
        return h.hits.at (0).velocity;
    };

    CHECK (velocityWithDepth (127) > velocityWithDepth (0));
}

BUD_TEST (Sequencer, randomVelocityDepthFollowsTheBank)
{
    // The same RND VL setting reaches further on a strong-random bank than a subtle one (p. 61).
    const auto spread = [] (SoundBank bank)
    {
        Harness h;
        h.gateAll();
        h.set (ParamKind::TrackSoundBank, static_cast<int> (bank));
        h.set (ParamKind::TrackRandomVelocity, 127);
        h.run (96000 * 4, 512);

        auto lowest = 2.0f;
        for (const auto& hit : h.hits)
            lowest = std::min (lowest, hit.velocity);

        return lowest;
    };

    // A lower floor means a wider spread.
    CHECK (spread (SoundBank::HH_CY) < spread (SoundBank::BD));
    CHECK (spread (SoundBank::SD) < spread (SoundBank::BD));
}

BUD_TEST (Sequencer, nudgeDelaysTheTriggerOnBanksThatUseIt)
{
    // MOVE is Nudge on the snare and general drum banks (p. 65), and something else elsewhere.
    Harness nudged (6);
    nudged.set (ParamKind::TrackSoundBank, static_cast<int> (SoundBank::TT));
    nudged.set (ParamKind::TrackMove, 127);
    nudged.gateStep (0);
    nudged.run (96000, 512);

    CHECK_EQ (nudged.hits.size(), std::size_t (1));
    CHECK (nudged.hits[0].globalSample > 1.0);

    // On the BD bank MOVE is the modulation time and must not move the trigger.
    Harness unmoved (0);
    unmoved.set (ParamKind::TrackSoundBank, static_cast<int> (SoundBank::BD));
    unmoved.set (ParamKind::TrackMove, 127);
    unmoved.gateStep (0);
    unmoved.run (96000, 512);

    CHECK_NEAR (unmoved.hits.at (0).globalSample, 0.0, 1.0e-3);
}

BUD_TEST (Sequencer, transposeShiftsEveryNote)
{
    Harness h (kBassTrack);
    h.gateStep (0);
    h.step (0).note = 5;
    h.setGlobal (ParamKind::Transpose, -12);

    h.transport.start();
    h.sequencer.reset();
    h.transport.beginBlock (4096);

    std::vector<TriggerEvent> events;
    h.sequencer.collectEvents (h.transport, h.groove, h.params, events);

    CHECK_EQ (events.size(), std::size_t (1));
    CHECK_EQ (events[0].note, -7);
}

BUD_TEST (Sequencer, parameterLocksReachTheTrigger)
{
    Harness h;
    h.gateStep (0);

    const auto id = makeParamId (ParamKind::TrackDecay, 0);
    h.step (0).locks.set (id, 110);

    h.transport.start();
    h.sequencer.reset();
    h.transport.beginBlock (4096);

    std::vector<TriggerEvent> events;
    h.sequencer.collectEvents (h.transport, h.groove, h.params, events);

    CHECK_EQ (events.size(), std::size_t (1));
    CHECK (events[0].locks != nullptr);

    const auto* locked = events[0].locks->find (id);
    CHECK (locked != nullptr);
    CHECK_EQ (*locked, 110);
}

BUD_TEST (Sequencer, longRunKeepsExactStepCount)
{
    Harness h;
    h.gateAll();

    const long long samples = static_cast<long long> (kSamplesPerQuarter) * 4 * 64;
    h.run (samples, 480);

    CHECK_EQ (h.hits.size(), std::size_t (64 * 16));

    const auto expected = static_cast<double> (64 * 16 - 1) * kSamplesPerSixteenth;
    CHECK_NEAR (h.hits.back().globalSample, expected, 0.5);
}

//==============================================================================
// The playhead

namespace
{
    /// Run the engine forward and record where each track's playhead reaches.
    std::vector<std::set<int>> playheadPositions (Engine& engine, int blocks, int blockSize)
    {
        std::vector<float> left (static_cast<std::size_t> (blockSize));
        std::vector<float> right (static_cast<std::size_t> (blockSize));

        std::vector<std::set<int>> seen (static_cast<std::size_t> (kNumTracks));

        for (int block = 0; block < blocks; ++block)
        {
            engine.process (left.data(), right.data(), blockSize);

            for (int track = 0; track < kNumTracks; ++track)
                seen[static_cast<std::size_t> (track)].insert (engine.playheadStep (track));
        }

        return seen;
    }
}

BUD_TEST (Playhead, everyTrackAdvancesEvenWithNothingOnIt)
{
    Engine engine;
    engine.prepare (48000.0, 512);
    engine.parameters().set (ParamKind::Tempo, 120);

    // Nothing is programmed anywhere: no track has a single gate.
    engine.initialisePattern (0);
    engine.start();

    // Two bars at 120 bpm.
    const auto seen = playheadPositions (engine, 375, 512);

    for (int track = 0; track < kNumTracks; ++track)
    {
        // The playhead used to be latched when a trigger fired, so a track with no notes never
        // moved off step 0 — the sequence appeared to stop dead on empty instruments.
        CHECK_EQ (static_cast<int> (seen[static_cast<std::size_t> (track)].size()),
                  kStepsPerVariation);
    }
}

BUD_TEST (Playhead, tracksMoveTogetherAtTheSameSettings)
{
    Engine engine;
    engine.prepare (48000.0, 512);
    engine.parameters().set (ParamKind::Tempo, 120);
    engine.initialisePattern (0);
    engine.start();

    std::vector<float> left (512), right (512);

    // At the default note length and step length every track is on the same grid, so they have
    // to read the same step as each other at every instant — one column crossing the whole
    // sequencer rather than eleven independent ones.
    for (int block = 0; block < 200; ++block)
    {
        engine.process (left.data(), right.data(), 512);

        const auto first = engine.playheadStep (0);

        for (int track = 1; track < kNumTracks; ++track)
            CHECK_EQ (engine.playheadStep (track), first);
    }
}

BUD_TEST (Playhead, aPolymetricTrackKeepsItsOwnPosition)
{
    Engine engine;
    engine.prepare (48000.0, 512);
    engine.parameters().set (ParamKind::Tempo, 120);
    engine.initialisePattern (0);

    // A shorter track wraps sooner, so it must be allowed to disagree with its neighbours —
    // forcing one shared column would misreport what the sequencer is actually doing.
    engine.parameters().set (ParamKind::TrackStepLength, 3, 5);
    engine.start();

    const auto seen = playheadPositions (engine, 375, 512);

    CHECK_EQ (static_cast<int> (seen[3].size()), 5);
    CHECK_EQ (static_cast<int> (seen[0].size()), kStepsPerVariation);
}
