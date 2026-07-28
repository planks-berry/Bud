#pragma once

#include <cstdint>

namespace bud
{

/** The master clock.

    Holds musical position in quarter notes and converts it to sample offsets within the
    current processing block. Every scheduling decision in the engine is expressed in quarter
    notes and resolved to a *fractional* sample offset here — this is what allows the FEEL
    drift model to shift a trigger by less than a sample, instead of being quantised to block
    boundaries.

    Position is accumulated as an exact integer sample count and converted to quarter notes on
    demand, rather than by adding a fractional musical delta each block. Accumulating the
    delta loses roughly a sample over a few minutes of playback, which is enough to make a
    trigger land in the wrong block and change the step count of a long run.

    Tempo and sample-rate changes re-anchor the musical origin at the current position, so
    changing tempo moves the future without rewriting the past.

    A block is processed as: beginBlock(n) -> query -> endBlock().
*/
class Transport
{
public:
    Transport();

    void prepare (double sampleRate);
    void reset();

    void setSampleRate (double newRate);
    double sampleRate() const noexcept { return sampleRate_; }

    void setTempo (double bpm);
    double tempo() const noexcept { return tempo_; }

    /// Samples per quarter note at the current tempo and sample rate.
    double samplesPerQuarterNote() const noexcept { return samplesPerQuarterNote_; }

    void start();
    void stop();
    /// Resume without rewinding the position.
    void continuePlaying();
    bool isPlaying() const noexcept { return playing_; }

    /// Open a processing block, defining the musical window [blockStartPpq, blockEndPpq).
    void beginBlock (int numSamples);
    /// Close the block, advancing the play position to the block end.
    void endBlock();

    double blockStartPpq() const noexcept { return blockStartPpq_; }
    double blockEndPpq()   const noexcept { return blockEndPpq_; }
    int blockSize()        const noexcept { return blockSize_; }

    /// Absolute samples elapsed since the transport was started.
    std::int64_t samplePosition() const noexcept { return samplePosition_; }

    /// Whether a musical position falls inside the current block window.
    bool blockContains (double ppq) const noexcept
    {
        return ppq >= blockStartPpq_ && ppq < blockEndPpq_;
    }

    /// Fractional sample offset within the current block for a musical position.
    double sampleOffsetFor (double ppq) const noexcept
    {
        return (ppq - blockStartPpq_) * samplesPerQuarterNote_;
    }

    /// Musical position of a sample offset within the current block.
    double ppqForSampleOffset (double offset) const noexcept
    {
        return blockStartPpq_ + offset / samplesPerQuarterNote_;
    }

    /// Align to an external timeline (plugin host sync, or MIDI clock).
    void setPositionPpq (double ppq);

private:
    /// Musical position of an absolute sample index, relative to the current anchor.
    double ppqAtSample (std::int64_t sample) const noexcept
    {
        return originPpq_ + static_cast<double> (sample - originSample_) / samplesPerQuarterNote_;
    }

    /// Pin the musical origin to the current position, so a tempo change only affects what
    /// follows it.
    void reanchor();

    double sampleRate_ = 48000.0;
    double tempo_ = 128.0;
    double samplesPerQuarterNote_ = 0.0;

    std::int64_t samplePosition_ = 0;
    std::int64_t originSample_ = 0;
    double originPpq_ = 0.0;

    double blockStartPpq_ = 0.0;
    double blockEndPpq_ = 0.0;
    int blockSize_ = 0;
    bool playing_ = false;
};

} // namespace bud
