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

BUD_TEST (Transport, settingAnUnchangedTempoDoesNothingAtAll)
{
    // The engine calls setTempo once per block, whether or not the tempo moved. Re-anchoring the
    // musical origin costs a little precision every time it happens, so if an unchanged value
    // still re-anchored, the accumulated error would depend on how many blocks had gone by — that
    // is, on the host's buffer size. Setting the same value must therefore be a true no-op.
    //
    // Two transports, same tempo, same number of samples; one is told the tempo every block.
    Transport quiet, chatty;

    for (auto* t : { &quiet, &chatty })
    {
        t->prepare (48000.0);
        t->setTempo (127.3);      // deliberately not a value with an exact binary reciprocal
        t->start();
    }

    for (int block = 0; block < 20000; ++block)
    {
        quiet.beginBlock (64);
        quiet.endBlock();

        chatty.setTempo (127.3);
        chatty.beginBlock (64);
        chatty.endBlock();
    }

    CHECK_EQ (chatty.blockStartPpq(), quiet.blockStartPpq());

    // And the position is still exactly what the arithmetic says it should be, not merely equal to
    // the other one — both could have drifted together.
    const auto expected = 20000.0 * 64.0 / (48000.0 * 60.0 / 127.3);
    CHECK_NEAR (chatty.blockStartPpq(), expected, 1.0e-9);

    // An actual change must still take effect.
    chatty.setTempo (140.0);
    chatty.beginBlock (48000);
    CHECK_NEAR (chatty.blockEndPpq() - chatty.blockStartPpq(), 140.0 / 60.0, 1.0e-9);
}

BUD_TEST (Transport, settingAnUnchangedSampleRateDoesNothingEither)
{
    // Same reasoning as the tempo case: prepare() and any host rate notification funnel through
    // setSampleRate, and a redundant call must not disturb the musical origin.
    Transport t;
    t.prepare (48000.0);
    t.setTempo (120.0);
    t.start();

    t.beginBlock (24000);
    t.endBlock();

    const auto before = t.blockStartPpq();

    for (int i = 0; i < 1000; ++i)
        t.setSampleRate (48000.0);

    CHECK_EQ (t.blockStartPpq(), before);

    // A genuine change still applies: at half the rate, the same sample count is twice the music.
    t.setSampleRate (24000.0);
    t.beginBlock (24000);
    CHECK_NEAR (t.blockEndPpq() - t.blockStartPpq(), 2.0, 1.0e-9);
}
