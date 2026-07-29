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

    double peakTimingDrift (const Groove& g, SoundBank bank, int track, int steps = 4096)
    {
        double peak = 0.0;

        for (int i = 0; i < steps; ++i)
            peak = std::max (peak, std::abs (g.compute (bank, track, i).timingQuarterNotes));

        return peak;
    }

    float peakPitchDrift (const Groove& g, SoundBank bank, int track, int steps = 4096)
    {
        float peak = 0.0f;

        for (int i = 0; i < steps; ++i)
            peak = std::max (peak, std::abs (g.compute (bank, track, i).pitchCents));

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
            const auto bank = trackInfo (track).defaultBank;
            const auto x = a.compute (bank, track, step);
            const auto y = b.compute (bank, track, step);

            CHECK_EQ (x.timingQuarterNotes, y.timingQuarterNotes);
            CHECK_EQ (x.pitchCents, y.pitchCents);
        }
    }
}

BUD_TEST (Groove, zeroDepthLocksEverythingToTheGrid)
{
    auto g = makeGroove (FeelModel::Minimal, 0.0f);

    for (int step = 0; step < 128; ++step)
        for (int track = 0; track < kNumTracks; ++track)
        {
            const auto d = g.compute (trackInfo (track).defaultBank, track, step);
            CHECK_EQ (d.timingQuarterNotes, 0.0);
            CHECK_EQ (d.pitchCents, 0.0f);
        }

    CHECK_EQ (g.maxTimingDriftQuarterNotes(), 0.0);
}

BUD_TEST (Groove, exemptBanksAreCompletelyUntouched)
{
    // FX and every sample bank are "not affected by Feel" (p. 61) — not merely lightly
    // affected. Nothing at all should move.
    for (auto model : { FeelModel::M808, FeelModel::M909, FeelModel::Minimal })
    {
        auto g = makeGroove (model);

        for (auto bank : { SoundBank::FX, SoundBank::S2, SoundBank::S4, SoundBank::S8,
                           SoundBank::BASS })
        {
            for (int step = 0; step < 256; ++step)
            {
                const auto d = g.compute (bank, 0, step);
                CHECK_EQ (d.timingQuarterNotes, 0.0);
                CHECK_EQ (d.pitchCents, 0.0f);
            }
        }
    }
}

BUD_TEST (Groove, pitchModulationBelongsToTheHiHatsAlone)
{
    // 08 and MN "randomly modulate the hi-hat pitch" (p. 54); nothing else is pitched by FEEL.
    for (auto model : { FeelModel::M808, FeelModel::Minimal })
    {
        auto g = makeGroove (model);

        CHECK (peakPitchDrift (g, SoundBank::HH_CY, 4) > 0.0f);

        for (auto bank : { SoundBank::BD, SoundBank::SD, SoundBank::CP, SoundBank::TT,
                           SoundBank::PC, SoundBank::ST, SoundBank::SY_BS })
            CHECK_EQ (peakPitchDrift (g, bank, 0), 0.0f);
    }
}

BUD_TEST (Groove, minimalMovesHatPitchFurtherThan808)
{
    // MN applies "large random pitch variations to the hi-hat"; 08 merely "randomly modulates"
    // it (p. 54).
    auto m808 = makeGroove (FeelModel::M808);
    auto minimal = makeGroove (FeelModel::Minimal);

    CHECK (peakPitchDrift (minimal, SoundBank::HH_CY, 4)
           > peakPitchDrift (m808, SoundBank::HH_CY, 4));
}

BUD_TEST (Groove, m909HasNoPitchModulationAtAll)
{
    // 09 is described purely in terms of timing (p. 54).
    auto g = makeGroove (FeelModel::M909);
    CHECK_EQ (peakPitchDrift (g, SoundBank::HH_CY, 4), 0.0f);
}

BUD_TEST (Groove, m808AppliesAUniformDelay)
{
    // "uniformly delaying the entire rhythm" — the shared component must be a delay, so the
    // average offset across many steps is positive rather than centred on zero.
    auto g = makeGroove (FeelModel::M808);

    double sum = 0.0;
    const int steps = 4096;

    for (int i = 0; i < steps; ++i)
        sum += g.compute (SoundBank::BD, 0, i).timingQuarterNotes;

    CHECK (sum / steps > 0.0);
}

BUD_TEST (Groove, m909IsCentredJitterRatherThanADelay)
{
    // "applying slight random offsets to the note timing" — no systematic delay.
    auto g = makeGroove (FeelModel::M909);

    double sum = 0.0;
    const int steps = 8192;

    for (int i = 0; i < steps; ++i)
        sum += g.compute (SoundBank::SD, 2, i).timingQuarterNotes;

    const auto mean = std::abs (sum / steps);
    CHECK (mean < g.maxTimingDriftQuarterNotes() * 0.1);
}

BUD_TEST (Groove, uniformComponentMovesEveryVoiceTogether)
{
    // Under MN the shared wander is what makes the whole rhythm move as one, so two voices on
    // the same bank must stay correlated rather than wandering independently.
    auto minimal = makeGroove (FeelModel::Minimal);

    double sharedAgreement = 0.0;
    const int steps = 512;

    for (int i = 0; i < steps; ++i)
    {
        const auto a = minimal.compute (SoundBank::SD, 2, i).timingQuarterNotes;
        const auto b = minimal.compute (SoundBank::SD, 3, i).timingQuarterNotes;
        sharedAgreement += (a > 0.0) == (b > 0.0) ? 1.0 : 0.0;
    }

    // With a dominant shared component the two agree in sign far more often than chance.
    CHECK (sharedAgreement / steps > 0.7);

    // Under 09, which has no shared component, they should not.
    auto m909 = makeGroove (FeelModel::M909);
    double jitterAgreement = 0.0;

    for (int i = 0; i < steps; ++i)
    {
        const auto a = m909.compute (SoundBank::SD, 2, i).timingQuarterNotes;
        const auto b = m909.compute (SoundBank::SD, 3, i).timingQuarterNotes;
        jitterAgreement += (a > 0.0) == (b > 0.0) ? 1.0 : 0.0;
    }

    CHECK (jitterAgreement / steps < 0.7);
}

BUD_TEST (Groove, bankClassScalesTheExtraOffset)
{
    // A clap takes a "significant" extra offset where a bass drum takes an "extremely small"
    // one (p. 61).
    auto g = makeGroove (FeelModel::M909);

    CHECK (peakTimingDrift (g, SoundBank::BD, 0) < peakTimingDrift (g, SoundBank::SD, 2));
    CHECK (peakTimingDrift (g, SoundBank::SD, 2) < peakTimingDrift (g, SoundBank::HH_CY, 4));
    CHECK (peakTimingDrift (g, SoundBank::HH_CY, 4) < peakTimingDrift (g, SoundBank::CP, 3));
}

BUD_TEST (Groove, driftStaysWithinTheAdvertisedBound)
{
    // The scheduler sizes its lookahead from this; if real drift could exceed it, triggers
    // would be lost at block boundaries.
    for (auto model : { FeelModel::M808, FeelModel::M909, FeelModel::Minimal })
    {
        auto g = makeGroove (model);
        const auto bound = g.maxTimingDriftQuarterNotes();

        for (int bankIndex = 0; bankIndex < kNumSoundBanks; ++bankIndex)
        {
            const auto bank = static_cast<SoundBank> (bankIndex);

            for (int track = 0; track < kNumTracks; ++track)
                CHECK (peakTimingDrift (g, bank, track, 512) <= bound + 1.0e-12);
        }
    }
}

BUD_TEST (Groove, m909IsTighterThanTheOthers)
{
    auto m808 = makeGroove (FeelModel::M808);
    auto m909 = makeGroove (FeelModel::M909);
    auto minimal = makeGroove (FeelModel::Minimal);

    // "a tight, powerful Feel" against 08's laid-back one and MN's unstable one (p. 54).
    CHECK (peakTimingDrift (m909, SoundBank::HH_CY, 4)
           < peakTimingDrift (minimal, SoundBank::HH_CY, 4));
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

BUD_TEST (Groove, seedChangesTheDrift)
{
    auto a = makeGroove (FeelModel::Minimal);
    auto b = makeGroove (FeelModel::Minimal);
    b.setSeed (0xabcd'1234u);

    bool differed = false;
    for (int step = 0; step < 128 && ! differed; ++step)
        if (std::abs (a.compute (SoundBank::HH_CY, 4, step).timingQuarterNotes
                      - b.compute (SoundBank::HH_CY, 4, step).timingQuarterNotes) > 1.0e-9)
            differed = true;

    CHECK (differed);
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
