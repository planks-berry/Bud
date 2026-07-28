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

void Transport::setSampleRate (double newRate)
{
    reanchor();
    sampleRate_ = std::max (1.0, newRate);
    samplesPerQuarterNote_ = sampleRate_ * 60.0 / tempo_;
}

void Transport::setTempo (double bpm)
{
    reanchor();
    tempo_ = std::clamp (bpm, 20.0, 300.0);
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
