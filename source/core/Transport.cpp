#include "Transport.h"

#include <algorithm>

namespace bud
{

Transport::Transport()
{
    samplesPerQuarterNote_ = sampleRate_ * 60.0 / tempo_;
}

void Transport::prepare (double newSampleRate)
{
    setSampleRate (newSampleRate);
    reset();
}

void Transport::reset()
{
    samplePosition_ = 0;
    originSample_ = 0;
    originPpq_ = 0.0;
    blockStartPpq_ = 0.0;
    blockEndPpq_ = 0.0;
    blockSize_ = 0;
    playing_ = false;
}

void Transport::reanchor()
{
    originPpq_ = ppqAtSample (samplePosition_);
    originSample_ = samplePosition_;
}

// Both setters below re-anchor, and re-anchoring costs a little precision: it adds an elapsed
// span to `originPpq_` in floating point, which rounds. Doing that once per genuine tempo change
// is free. Doing it repeatedly is the accumulating-fractional-ppq error this anchor design exists
// to avoid, and because the engine calls these once per block, "repeatedly" would mean once per
// block — making the accumulated error a function of the host's buffer size. Hence the guards:
// an unchanged value must be a no-op, not a cheap re-anchor. The value is clamped *before* the
// comparison so a caller repeatedly passing an out-of-range number settles rather than
// re-anchoring forever.

void Transport::setSampleRate (double newRate)
{
    const auto clamped = std::max (1.0, newRate);

    if (clamped == sampleRate_)
        return;

    reanchor();
    sampleRate_ = clamped;
    samplesPerQuarterNote_ = sampleRate_ * 60.0 / tempo_;
}

void Transport::setTempo (double bpm)
{
    const auto clamped = std::clamp (bpm, 20.0, 300.0);

    if (clamped == tempo_)
        return;

    reanchor();
    tempo_ = clamped;
    samplesPerQuarterNote_ = sampleRate_ * 60.0 / tempo_;
}

void Transport::start()
{
    samplePosition_ = 0;
    originSample_ = 0;
    originPpq_ = 0.0;
    blockStartPpq_ = 0.0;
    blockEndPpq_ = 0.0;
    playing_ = true;
}

void Transport::stop()
{
    playing_ = false;
}

void Transport::continuePlaying()
{
    playing_ = true;
}

void Transport::beginBlock (int numSamples)
{
    blockSize_ = std::max (0, numSamples);
    blockStartPpq_ = ppqAtSample (samplePosition_);

    // When stopped the window stays collapsed, so nothing schedules.
    blockEndPpq_ = playing_ ? ppqAtSample (samplePosition_ + blockSize_)
                            : blockStartPpq_;
}

void Transport::endBlock()
{
    if (playing_)
    {
        samplePosition_ += blockSize_;
        blockStartPpq_ = ppqAtSample (samplePosition_);
        blockEndPpq_ = blockStartPpq_;
    }
}

void Transport::setPositionPpq (double ppq)
{
    originPpq_ = ppq;
    originSample_ = samplePosition_;
    blockStartPpq_ = ppq;
    blockEndPpq_ = ppq;
}

} // namespace bud
