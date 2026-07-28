#include "TestFramework.h"

#include "core/sequencer/Groove.h"

#include <algorithm>
#include <cmath>

using namespace bud;

namespace
{
    Groove makeGroove (FeelModel model, float depth = 1.0f)
    {
        Groove g;
        g.setModel (model);
        g.setDepth (depth);
        g.setTempo (128.0);
        return g;
    }

    /// Peak absolute timing drift a track shows over a long span.
    double peakTimingDrift (const Groove& g, int track, int steps = 4096)
    {
        double peak = 0.0;

        for (int i = 0; i < steps; ++i)
            peak = std::max (peak, std::abs (g.compute (track, i).timingQuarterNotes));

        return peak;
    }
}

BUD_TEST (Groove, isFullyDeterministic)
{
    auto a = makeGroove (FeelModel::M808);
    auto b = makeGroove (FeelModel::M808);

    for (int step = 0; step < 256; ++step)
    {
        for (int track = 0; track < kNumTracks; ++track)
        {
            const auto x = a.compute (track, step);
            const auto y = b.compute (track, step);

            CHECK_NEAR (x.timingQuarterNotes, y.timingQuarterNotes, 0.0);
            CHECK_NEAR (x.pitchCents, y.pitchCents, 0.0);
            CHECK_NEAR (x.levelScale, y.levelScale, 0.0);
        }
    }
}

BUD_TEST (Groove, zeroDepthLocksEverythingToTheGrid)
{
    auto g = makeGroove (FeelModel::Minimal, 0.0f);

    for (int step = 0; step < 128; ++step)
    {
        for (int track = 0; track < kNumTracks; ++track)
        {
            const auto d = g.compute (track, step);
            CHECK_EQ (d.timingQuarterNotes, 0.0);
            CHECK_EQ (d.pitchCents, 0.0f);
            CHECK_EQ (d.levelScale, 1.0f);
        }
    }

    CHECK_EQ (g.maxTimingDriftQuarterNotes(), 0.0);
}

BUD_TEST (Groove, seedChangesTheDrift)
{
    auto a = makeGroove (FeelModel::Minimal);
    auto b = makeGroove (FeelModel::Minimal);
    b.setSeed (0xabcd'1234u);

    bool differed = false;
    for (int step = 0; step < 128 && ! differed; ++step)
        if (std::abs (a.compute (4, step).timingQuarterNotes
                      - b.compute (4, step).timingQuarterNotes) > 1.0e-9)
            differed = true;

    CHECK (differed);
}

BUD_TEST (Groove, tracksDriftIndependently)
{
    // Per-voice drift, not a global swing: two voices must not move together.
    auto g = makeGroove (FeelModel::M808);

    bool differed = false;
    for (int step = 0; step < 128 && ! differed; ++step)
        if (std::abs (g.compute (4, step).timingQuarterNotes
                      - g.compute (5, step).timingQuarterNotes) > 1.0e-9)
            differed = true;

    CHECK (differed);
}

BUD_TEST (Groove, theKickStaysTighterThanTheHats)
{
    // The pulse-carrying voices are deliberately more locked than the ornamental ones.
    auto g = makeGroove (FeelModel::M808);

    const auto kick = peakTimingDrift (g, 0);
    const auto hat = peakTimingDrift (g, 4);
    const auto loop = peakTimingDrift (g, kLoopTrack);

    CHECK (kick < hat);
    CHECK (loop < hat);
}

BUD_TEST (Groove, driftStaysWithinTheAdvertisedBound)
{
    // The scheduler sizes its lookahead from maxTimingDriftQuarterNotes(); if the real drift
    // could exceed it, triggers would be lost at block boundaries.
    for (auto model : { FeelModel::M808, FeelModel::M909, FeelModel::Minimal })
    {
        auto g = makeGroove (model);
        const auto bound = g.maxTimingDriftQuarterNotes();

        for (int track = 0; track < kNumTracks; ++track)
            CHECK (peakTimingDrift (g, track) <= bound + 1.0e-12);
    }
}

BUD_TEST (Groove, driftIsContinuousRatherThanJittery)
{
    // Analog instability wanders; it does not hop randomly step to step. Consecutive steps
    // should stay close relative to the overall range.
    auto g = makeGroove (FeelModel::Minimal);

    const auto range = peakTimingDrift (g, 4);
    CHECK (range > 0.0);

    double biggestJump = 0.0;
    for (int step = 1; step < 1024; ++step)
    {
        const auto delta = std::abs (g.compute (4, step).timingQuarterNotes
                                     - g.compute (4, step - 1).timingQuarterNotes);
        biggestJump = std::max (biggestJump, delta);
    }

    // MINIMAL evolves slowly — a single step must not traverse the whole range.
    CHECK (biggestJump < range * 0.5);
}

BUD_TEST (Groove, modelsHaveDistinctCharacter)
{
    auto m808 = makeGroove (FeelModel::M808);
    auto m909 = makeGroove (FeelModel::M909);
    auto minimal = makeGroove (FeelModel::Minimal);

    // 909 is the tightest of the three; MINIMAL is the widest.
    CHECK (m909.maxTimingDriftQuarterNotes() < m808.maxTimingDriftQuarterNotes());
    CHECK (m808.maxTimingDriftQuarterNotes() < minimal.maxTimingDriftQuarterNotes());

    // 808 carries the most pitch instability.
    const auto peakPitch = [] (Groove& g, int track)
    {
        float peak = 0.0f;
        for (int i = 0; i < 4096; ++i)
            peak = std::max (peak, std::abs (g.compute (track, i).pitchCents));
        return peak;
    };

    CHECK (peakPitch (m808, 4) > peakPitch (m909, 4));
}

BUD_TEST (Groove, driftScalesWithTempo)
{
    // Drift is fixed in milliseconds, so its musical size grows with tempo.
    auto slow = makeGroove (FeelModel::Minimal);
    slow.setTempo (60.0);

    auto fast = makeGroove (FeelModel::Minimal);
    fast.setTempo (180.0);

    CHECK_NEAR (fast.maxTimingDriftQuarterNotes(),
                slow.maxTimingDriftQuarterNotes() * 3.0, 1.0e-9);
}

BUD_TEST (Groove, depthScalesDriftLinearly)
{
    auto full = makeGroove (FeelModel::M808, 1.0f);
    auto half = makeGroove (FeelModel::M808, 0.5f);

    CHECK_NEAR (half.maxTimingDriftQuarterNotes(),
                full.maxTimingDriftQuarterNotes() * 0.5, 1.0e-12);

    for (int step = 0; step < 64; ++step)
        CHECK_NEAR (half.compute (4, step).timingQuarterNotes,
                    full.compute (4, step).timingQuarterNotes * 0.5, 1.0e-12);
}

BUD_TEST (Groove, randomUnitIsReproducibleAndBounded)
{
    auto g = makeGroove (FeelModel::Minimal);

    for (int step = 0; step < 512; ++step)
    {
        const auto v = g.randomUnit (3, step, 0x1234u);
        CHECK (v >= 0.0f);
        CHECK (v <= 1.0f);
        CHECK_EQ (v, g.randomUnit (3, step, 0x1234u));
    }
}

BUD_TEST (Groove, levelDriftStaysNearUnity)
{
    auto g = makeGroove (FeelModel::Minimal);

    for (int track = 0; track < kNumTracks; ++track)
    {
        for (int step = 0; step < 512; ++step)
        {
            const auto scale = g.compute (track, step).levelScale;
            CHECK (scale > 0.8f);
            CHECK (scale < 1.2f);
        }
    }
}
