#include "TestFramework.h"

#include "core/params/Curves.h"

#include <cmath>

using namespace bud;
using namespace bud::curves;

// The curve layer is where raw 0-127 values become real quantities. docs/PARAMETERS.md marks
// each mapping Measured or Chosen; these tests pin the properties that must hold whatever the
// Chosen constants are later tuned to.

BUD_TEST (Curves, rawHelpersRespectTheDetent)
{
    CHECK_EQ (unit (0), 0.0f);
    CHECK_EQ (unit (127), 1.0f);

    // The detent must land exactly on zero, or a centred knob is audibly off-centre.
    CHECK_EQ (bipolar (kRawCentre), 0.0f);
    CHECK_EQ (bipolar (0), -1.0f);
    CHECK_EQ (bipolar (127), 1.0f);
}

BUD_TEST (Curves, levelLawIsUnityAtTheDefault)
{
    // Unity at 100 so that a track, a pattern and the master at their defaults give exactly
    // unity gain rather than compounding gain at each stage.
    CHECK_EQ (levelGain (0), 0.0f);
    CHECK_NEAR (levelGain (kLevelUnity), 1.0f, 1.0e-6);
    CHECK_NEAR (levelGain (127), 2.0f, 1.0e-6);      // +6 dB (p. 27)
    CHECK_NEAR (levelGain (50), 0.25f, 1.0e-6);      // -12 dB

    // Monotonic across the whole range.
    auto previous = -1.0f;
    for (int v = 0; v <= 127; ++v)
    {
        const auto g = levelGain (v);
        CHECK (g >= previous);
        previous = g;
    }
}

BUD_TEST (Curves, panIsConstantPower)
{
    const auto centre = panGains (kRawCentre);
    CHECK_NEAR (centre.left, centre.right, 1.0e-6);
    CHECK_NEAR (centre.left, 0.70710678f, 1.0e-4);   // -3 dB

    const auto hardLeft = panGains (0);
    CHECK_NEAR (hardLeft.left, 1.0f, 1.0e-4);
    CHECK_NEAR (hardLeft.right, 0.0f, 1.0e-4);

    const auto hardRight = panGains (127);
    CHECK_NEAR (hardRight.left, 0.0f, 1.0e-4);
    CHECK_NEAR (hardRight.right, 1.0f, 1.0e-4);

    // Constant power: the sum of squares holds across the sweep, so a swept pan does not dip.
    for (int v = 0; v <= 127; ++v)
    {
        const auto g = panGains (v);
        CHECK_NEAR (g.left * g.left + g.right * g.right, 1.0f, 1.0e-4);
    }
}

BUD_TEST (Curves, toneIsBypassedAtTheDetentAndFiltersEitherSide)
{
    // One knob spanning LPF50 - FLT OFF - HPF50 (p. 65). At the detent the filter is out of
    // circuit, not merely parked at an extreme — a filter at the top of its range still
    // colours the signal, and the device's centre position does not.
    const auto centre = toneFilter (kRawCentre);
    CHECK_EQ (centre.mode, ToneFilterMode::Bypassed);

    const auto low = toneFilter (0);
    CHECK_EQ (low.mode, ToneFilterMode::LowPass);
    CHECK_NEAR (low.cutoffHz, 180.0f, 1.0f);

    const auto high = toneFilter (127);
    CHECK_EQ (high.mode, ToneFilterMode::HighPass);
    CHECK_NEAR (high.cutoffHz, 9000.0f, 50.0f);

    // Approaching the detent from either side tends towards transparency.
    CHECK (toneFilter (kRawCentre - 1).cutoffHz > 15000.0f);
    CHECK (toneFilter (kRawCentre + 1).cutoffHz < 40.0f);
}

BUD_TEST (Curves, timeLawIsExponentialAndHitsBothEnds)
{
    CHECK_NEAR (timeMs (0, 10.0f, 2000.0f), 10.0f, 1.0e-3);
    CHECK_NEAR (timeMs (127, 10.0f, 2000.0f), 2000.0f, 1.0e-1);

    // Geometric midpoint, not arithmetic.
    CHECK_NEAR (timeMs (64, 10.0f, 2000.0f), std::sqrt (10.0f * 2000.0f), 6.0f);
}

BUD_TEST (Curves, tuneSpansTwoOctavesEitherWay)
{
    CHECK_NEAR (tuneSemitones (kRawCentre), 0.0f, 1.0e-6);
    CHECK_NEAR (tuneSemitones (0), -24.0f, 1.0e-4);
    CHECK_NEAR (tuneSemitones (127), 24.0f, 1.0e-4);

    CHECK_NEAR (semitonesToRatio (12.0f), 2.0f, 1.0e-5);
    CHECK_NEAR (centsToRatio (1200.0f), 2.0f, 1.0e-5);
}

BUD_TEST (Curves, randomDepthFollowsTheBankClass)
{
    // "Subtle randomness even at the maximum value" is the manual's own phrasing, so that
    // class has to cap well below the others (p. 61).
    CHECK (randomVelocityCeiling (RandomClass::Subtle)
           < randomVelocityCeiling (RandomClass::Moderate));
    CHECK (randomVelocityCeiling (RandomClass::Moderate)
           < randomVelocityCeiling (RandomClass::Strong));
    CHECK (randomVelocityCeiling (RandomClass::Strong)
           < randomVelocityCeiling (RandomClass::Aggressive));

    CHECK (randomVelocityCeiling (RandomClass::Subtle) < 0.25f);
}

BUD_TEST (Curves, feelExtraFollowsTheBankClass)
{
    CHECK_EQ (feelExtraMs (FeelClass::None), 0.0f);
    CHECK (feelExtraMs (FeelClass::Tiny) < feelExtraMs (FeelClass::Slight));
    CHECK (feelExtraMs (FeelClass::Slight) < feelExtraMs (FeelClass::Moderate));
    CHECK (feelExtraMs (FeelClass::Moderate) < feelExtraMs (FeelClass::Significant));
}

BUD_TEST (Curves, swingIsStraightAtFifty)
{
    // The device's swing range is 50-75 % (p. 51).
    CHECK_NEAR (swingWarp (0.5f, swingFraction (50)), 0.5f, 1.0e-6);
    CHECK_NEAR (swingWarp (0.5f, swingFraction (75)), 0.75f, 1.0e-6);
    CHECK_NEAR (swingWarp (0.5f, swingFraction (62)), 0.62f, 1.0e-6);

    // Out-of-range values clamp rather than wrapping.
    CHECK_NEAR (swingWarp (0.5f, swingFraction (10)), 0.5f, 1.0e-6);
    CHECK_NEAR (swingWarp (0.5f, swingFraction (200)), 0.75f, 1.0e-6);
}

BUD_TEST (Curves, isolatorCutsToSilenceAndBoostsToSixDecibels)
{
    // Full cut at -50 is what makes it an isolator rather than an equaliser (p. 33).
    CHECK_EQ (isolatorGain (-50), 0.0f);
    CHECK_NEAR (isolatorGain (0), 1.0f, 1.0e-6);
    CHECK_NEAR (isolatorGain (50), 1.99526f, 1.0e-3);   // +6 dB

    auto previous = -1.0f;
    for (int v = -50; v <= 50; ++v)
    {
        const auto g = isolatorGain (v);
        CHECK (g >= previous);
        previous = g;
    }
}

BUD_TEST (Curves, nudgeIsASmallForwardDelay)
{
    // Nudge only ever delays — a negative nudge would move a hit before its step (p. 65).
    CHECK_EQ (nudgeMs (0), 0.0f);
    CHECK (nudgeMs (127) > 0.0f);
    CHECK (nudgeMs (127) < 50.0f);
    CHECK (nudgeMs (64) < nudgeMs (127));
}

BUD_TEST (Curves, accentScalesInOppositeDirections)
{
    // Hard accent raises the level, soft lowers it (p. 47-48).
    CHECK_NEAR (hardAccentScale (0), 1.0f, 1.0e-6);
    CHECK (hardAccentScale (127) > 1.0f);

    CHECK_NEAR (softAccentScale (0), 1.0f, 1.0e-6);
    CHECK (softAccentScale (127) < 1.0f);
    CHECK (softAccentScale (127) > 0.0f);
}
