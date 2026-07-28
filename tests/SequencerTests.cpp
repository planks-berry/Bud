#include "TestFramework.h"

#include "core/Transport.h"
#include "core/sequencer/Groove.h"
#include "core/sequencer/Pattern.h"
#include "core/sequencer/TrackSequencer.h"

#include <algorithm>
#include <vector>

using namespace bud;

namespace
{

constexpr double kSampleRate = 48000.0;
constexpr double kTempo = 120.0;
constexpr double kSamplesPerQuarter = 24000.0;   // at 120 bpm / 48 kHz
constexpr double kSamplesPerSixteenth = 6000.0;

struct Hit
{
    double globalSample;
    double ppq;
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
    TrackSequencer sequencer;
    TrackPattern pattern;
    float globalSwing = 0.0f;
    std::vector<Hit> hits;

    explicit Harness (int track = 0, double tempo = kTempo)
    {
        transport.prepare (kSampleRate);
        transport.setTempo (tempo);
        groove.setTempo (tempo);
        groove.setDepth (0.0f);   // locked to the grid unless a test asks otherwise
        sequencer.prepare (track);
        sequencer.setPattern (&pattern);
    }

    void gateAll (Variation v = Variation::A)
    {
        for (auto& step : pattern.variation (v))
            step.gate = true;
    }

    void gateStep (int index, Variation v = Variation::A)
    {
        pattern.variation (v)[static_cast<std::size_t> (index)].gate = true;
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
            const auto n = static_cast<int> (std::min<long long> (blockSize, totalSamples - consumed));

            transport.beginBlock (n);
            events.clear();
            sequencer.collectEvents (transport, groove, globalSwing, events);

            for (const auto& e : events)
                hits.push_back (Hit { static_cast<double> (consumed) + e.sampleOffset,
                                      e.ppq, e.stepIndex, e.chainIndex, e.subStep, e.velocity });

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
    // duplicated or moved by the arbitrary block size the host happens to use.
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
    // Same again with FEEL at full depth, where triggers land off-grid and can cross block
    // boundaries in both directions.
    const auto runAt = [] (int blockSize)
    {
        Harness h;
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
    h.pattern.stepLength = 5;
    h.gateAll();
    h.run (96000, 256);   // 16 sixteenth notes of time

    CHECK_EQ (h.hits.size(), std::size_t (16));

    // The head must wrap after five steps: 0 1 2 3 4 0 1 2 ...
    for (std::size_t i = 0; i < h.hits.size(); ++i)
        CHECK_EQ (h.hits[i].step, static_cast<int> (i % 5));
}

BUD_TEST (Sequencer, chainPlaysAllFourVariationsInOrder)
{
    Harness h;
    h.pattern.setChain ({ Variation::A, Variation::B, Variation::C, Variation::D });

    // One hit at the top of each variation.
    for (auto v : { Variation::A, Variation::B, Variation::C, Variation::D })
        h.gateStep (0, v);

    // 64 steps of chained time.
    h.run (static_cast<long long> (kSamplesPerSixteenth) * 64, 512);

    CHECK_EQ (h.hits.size(), std::size_t (4));

    for (std::size_t i = 0; i < h.hits.size(); ++i)
    {
        CHECK_EQ (h.hits[i].chain, static_cast<int> (i));
        CHECK_NEAR (h.hits[i].globalSample,
                    static_cast<double> (i) * 16.0 * kSamplesPerSixteenth, 1.0e-3);
    }
}

BUD_TEST (Sequencer, chainLengthOneRepeatsASingleVariation)
{
    Harness h;
    h.pattern.chainLength = 1;
    h.gateStep (0, Variation::A);
    h.gateStep (0, Variation::B);   // must never be heard

    h.run (static_cast<long long> (kSamplesPerSixteenth) * 64, 512);

    CHECK_EQ (h.hits.size(), std::size_t (4));   // four passes of variation A

    for (const auto& hit : h.hits)
        CHECK_EQ (hit.chain, 0);
}

BUD_TEST (Sequencer, rotationShiftsThePhraseWithoutDestroyingIt)
{
    Harness h;
    h.gateStep (0);
    h.pattern.rotation = 3;
    h.run (96000, 512);

    CHECK_EQ (h.hits.size(), std::size_t (1));
    CHECK_EQ (h.hits[0].step, 3);
    CHECK_NEAR (h.hits[0].globalSample, 3.0 * kSamplesPerSixteenth, 1.0e-3);

    // The stored pattern is untouched — rotation is a read offset, so it can be swept live.
    CHECK (h.pattern.variation (Variation::A)[0].gate);
}

BUD_TEST (Sequencer, destructiveRotateMovesTheStoredSteps)
{
    Harness h;
    h.gateStep (0);
    h.pattern.rotateVariationInPlace (Variation::A, 3);

    CHECK (! h.pattern.variation (Variation::A)[0].gate);
    CHECK (h.pattern.variation (Variation::A)[3].gate);
}

BUD_TEST (Sequencer, subStepsRetriggerEvenlyWithinTheStep)
{
    Harness h;
    h.gateStep (0);
    h.pattern.variation (Variation::A)[0].subSteps = 4;
    h.run (96000, 512);

    CHECK_EQ (h.hits.size(), std::size_t (4));

    const auto spacing = kSamplesPerSixteenth / 4.0;
    for (std::size_t i = 0; i < h.hits.size(); ++i)
    {
        CHECK_EQ (h.hits[i].subStep, static_cast<int> (i));
        CHECK_NEAR (h.hits[i].globalSample, static_cast<double> (i) * spacing, 1.0e-3);
    }
}

BUD_TEST (Sequencer, swingDisplacesOddStepsOnly)
{
    Harness h;
    h.gateAll();
    h.pattern.swing = 0.25f;   // a quarter of a step late
    h.run (96000, 512);

    CHECK_EQ (h.hits.size(), std::size_t (16));

    const auto offset = 0.25 * kSamplesPerSixteenth;

    for (std::size_t i = 0; i < h.hits.size(); ++i)
    {
        const auto nominal = static_cast<double> (i) * kSamplesPerSixteenth;
        const auto expected = (i % 2 == 0) ? nominal : nominal + offset;
        CHECK_NEAR (h.hits[i].globalSample, expected, 1.0e-3);
    }
}

BUD_TEST (Sequencer, globalAndTrackSwingCombine)
{
    Harness h;
    h.gateAll();
    h.globalSwing = 0.1f;
    h.pattern.swing = 0.15f;
    h.run (96000, 512);

    const auto offset = 0.25 * kSamplesPerSixteenth;
    CHECK_NEAR (h.hits[1].globalSample, kSamplesPerSixteenth + offset, 1.0e-3);
}

BUD_TEST (Sequencer, manualNudgeMovesASingleStep)
{
    Harness h;
    h.gateAll();
    h.pattern.variation (Variation::A)[4].microShift = -0.25f;
    h.run (96000, 512);

    CHECK_EQ (h.hits.size(), std::size_t (16));

    // Step 4 arrives early; its neighbours are untouched.
    CHECK_NEAR (h.hits[3].globalSample, 3.0 * kSamplesPerSixteenth, 1.0e-3);
    CHECK_NEAR (h.hits[4].globalSample, 3.75 * kSamplesPerSixteenth, 1.0e-3);
    CHECK_NEAR (h.hits[5].globalSample, 5.0 * kSamplesPerSixteenth, 1.0e-3);
}

BUD_TEST (Sequencer, noteLengthChangesTheStepRate)
{
    Harness h;
    h.pattern.division = StepDivision::Eighth;
    h.gateAll();
    h.run (96000, 512);   // four quarter notes = eight eighth notes

    CHECK_EQ (h.hits.size(), std::size_t (8));

    for (std::size_t i = 0; i < h.hits.size(); ++i)
        CHECK_NEAR (h.hits[i].globalSample,
                    static_cast<double> (i) * kSamplesPerQuarter / 2.0, 1.0e-3);
}

BUD_TEST (Sequencer, tracksWithDifferentDivisionsRunPolymetrically)
{
    // A 12-step track at 1/8 against a 16-step track at 1/16 — the phrases only realign after
    // 12 quarter notes, which is the behaviour the per-track division exists to produce.
    Harness fast (0);
    fast.pattern.division = StepDivision::Sixteenth;
    fast.pattern.stepLength = 16;
    fast.gateAll();

    Harness slow (1);
    slow.pattern.division = StepDivision::Eighth;
    slow.pattern.stepLength = 12;
    slow.gateAll();

    const long long samples = static_cast<long long> (kSamplesPerQuarter * 12.0);
    fast.run (samples, 512);
    slow.run (samples, 512);

    CHECK_EQ (fast.hits.size(), std::size_t (48));   // 12 qn / (1/4 qn per step)
    CHECK_EQ (slow.hits.size(), std::size_t (24));   // 12 qn / (1/2 qn per step)

    // The slow track wraps its 12-step phrase twice in that span.
    CHECK_EQ (slow.hits[11].step, 11);
    CHECK_EQ (slow.hits[12].step, 0);
}

BUD_TEST (Sequencer, accentRaisesVelocityAndDeAccentLowersIt)
{
    Harness h;
    h.gateAll();
    h.pattern.variation (Variation::A)[0].accent = Accent::Accent;
    h.pattern.variation (Variation::A)[1].accent = Accent::Normal;
    h.pattern.variation (Variation::A)[2].accent = Accent::DeAccent;
    h.run (96000, 512);

    CHECK (h.hits[0].velocity > h.hits[1].velocity);
    CHECK (h.hits[1].velocity > h.hits[2].velocity);

    // A default-velocity step with an accent reaches full scale.
    CHECK_NEAR (h.hits[0].velocity, 1.0f, 1.0e-3);
}

BUD_TEST (Sequencer, randomVelocityOnlyReducesAndStaysBounded)
{
    Harness h;
    h.gateAll();
    h.pattern.randomVelocity = 1.0f;
    h.run (96000 * 4, 512);

    CHECK_EQ (h.hits.size(), std::size_t (64));

    const auto nominal = 100.0f / 127.0f;
    bool sawVariation = false;

    for (const auto& hit : h.hits)
    {
        CHECK (hit.velocity >= 0.0f);
        CHECK (hit.velocity <= nominal + 1.0e-4f);

        if (std::abs (hit.velocity - nominal) > 1.0e-3f)
            sawVariation = true;
    }

    CHECK (sawVariation);
}

BUD_TEST (Sequencer, parameterLocksReachTheTrigger)
{
    Harness h;
    h.gateStep (0);

    const auto id = makeParamId (ParamKind::KickDecay, 0);
    h.pattern.variation (Variation::A)[0].locks.set (id, 750.0f);

    h.run (96000, 512);

    CHECK_EQ (h.hits.size(), std::size_t (1));

    // Re-read through the pattern, since the event holds a pointer into it.
    const auto* locked = h.pattern.variation (Variation::A)[0].locks.find (id);
    CHECK (locked != nullptr);
    CHECK_NEAR (*locked, 750.0f, 1.0e-3);
}

BUD_TEST (Sequencer, resetRewindsTheHead)
{
    Harness h;
    h.gateAll();
    h.run (96000, 512);
    CHECK_EQ (h.hits.size(), std::size_t (16));

    h.run (96000, 512);   // run() resets, so this must reproduce the first pass exactly
    CHECK_EQ (h.hits.size(), std::size_t (16));
    CHECK_EQ (h.hits[0].step, 0);
    CHECK_NEAR (h.hits[0].globalSample, 0.0, 1.0e-3);
}

BUD_TEST (Sequencer, longRunKeepsExactStepCount)
{
    // Sixty-four bars, to catch any slow accumulation of position error.
    Harness h;
    h.gateAll();

    const long long samples = static_cast<long long> (kSamplesPerQuarter) * 4 * 64;
    h.run (samples, 480);

    CHECK_EQ (h.hits.size(), std::size_t (64 * 16));

    const auto& last = h.hits.back();
    const auto expected = static_cast<double> (64 * 16 - 1) * kSamplesPerSixteenth;
    CHECK_NEAR (last.globalSample, expected, 0.5);
}
