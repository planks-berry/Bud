#include "TestFramework.h"

#include "core/Transport.h"

using namespace bud;

BUD_TEST (Transport, samplesPerQuarterNoteFollowsTempo)
{
    Transport t;
    t.prepare (48000.0);

    t.setTempo (120.0);
    CHECK_NEAR (t.samplesPerQuarterNote(), 24000.0, 1.0e-9);

    t.setTempo (60.0);
    CHECK_NEAR (t.samplesPerQuarterNote(), 48000.0, 1.0e-9);

    t.setTempo (128.0);
    CHECK_NEAR (t.samplesPerQuarterNote(), 22500.0, 1.0e-9);
}

BUD_TEST (Transport, stoppedTransportHasACollapsedWindow)
{
    Transport t;
    t.prepare (48000.0);
    t.setTempo (120.0);

    t.beginBlock (512);
    CHECK_EQ (t.blockStartPpq(), t.blockEndPpq());
    CHECK (! t.blockContains (0.0));

    t.endBlock();
    CHECK_EQ (t.blockStartPpq(), 0.0);
}

BUD_TEST (Transport, positionAdvancesByExactlyOneBlock)
{
    Transport t;
    t.prepare (48000.0);
    t.setTempo (120.0);
    t.start();

    t.beginBlock (24000);
    CHECK_NEAR (t.blockStartPpq(), 0.0, 1.0e-12);
    CHECK_NEAR (t.blockEndPpq(), 1.0, 1.0e-12);
    t.endBlock();

    t.beginBlock (12000);
    CHECK_NEAR (t.blockStartPpq(), 1.0, 1.0e-12);
    CHECK_NEAR (t.blockEndPpq(), 1.5, 1.0e-12);
    t.endBlock();

    CHECK_NEAR (t.blockStartPpq(), 1.5, 1.0e-12);
}

BUD_TEST (Transport, sampleOffsetRoundTripsWithMusicalPosition)
{
    Transport t;
    t.prepare (48000.0);
    t.setTempo (128.0);
    t.start();
    t.beginBlock (1024);

    for (double offset : { 0.0, 1.0, 511.5, 1023.0 })
    {
        const auto ppq = t.ppqForSampleOffset (offset);
        CHECK_NEAR (t.sampleOffsetFor (ppq), offset, 1.0e-9);
    }
}

BUD_TEST (Transport, blockWindowIsHalfOpen)
{
    Transport t;
    t.prepare (48000.0);
    t.setTempo (120.0);
    t.start();
    t.beginBlock (24000);

    // The start belongs to this block, the end belongs to the next — so a trigger exactly on
    // a boundary fires once, not twice.
    CHECK (t.blockContains (t.blockStartPpq()));
    CHECK (! t.blockContains (t.blockEndPpq()));
}

BUD_TEST (Transport, startRewindsButContinueDoesNot)
{
    Transport t;
    t.prepare (48000.0);
    t.setTempo (120.0);

    t.start();
    t.beginBlock (24000);
    t.endBlock();
    CHECK_NEAR (t.blockStartPpq(), 1.0, 1.0e-12);

    t.stop();
    CHECK (! t.isPlaying());

    t.continuePlaying();
    CHECK (t.isPlaying());
    CHECK_NEAR (t.blockStartPpq(), 1.0, 1.0e-12);

    t.start();
    CHECK_NEAR (t.blockStartPpq(), 0.0, 1.0e-12);
}

BUD_TEST (Transport, hostPositionCanBeImposed)
{
    Transport t;
    t.prepare (48000.0);
    t.setTempo (120.0);
    t.start();

    t.setPositionPpq (16.25);
    t.beginBlock (24000);

    CHECK_NEAR (t.blockStartPpq(), 16.25, 1.0e-12);
    CHECK_NEAR (t.blockEndPpq(), 17.25, 1.0e-12);
}
