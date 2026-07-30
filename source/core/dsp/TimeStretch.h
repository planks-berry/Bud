#pragma once

#include "../sampler/SampleBank.h"

#include <vector>

namespace bud::dsp
{

/** WSOLA time-stretch, for the loop track's melodic and rhythmic modes (p. 70).

    The device offers three tempo behaviours on the stereo loop track, and two of them cannot be
    done by changing the playback rate:

    - `OFF` — plain playback. Rate changes move pitch and length together.
    - `MLD` **melodic** — the length stays put when the pitch changes. Transpose a pad and it
      still fills the same bar.
    - `RHY` **rhythmic** — the pitch stays put when the tempo changes. Pull a loop from 120 to
      140 bpm and it fits without going sharp.

    Both need the same underlying trick: resample for pitch, then stretch the *time* back to
    where it should be — or the reverse. WSOLA does the stretching by overlapping short windows
    of the source and sliding each one to wherever it best correlates with what has already been
    written, so the waveform stays continuous across the joins. Without that search it is plain
    overlap-add, which phase-cancels on tonal material and produces the warbling that gives
    cheap stretching away.

    This is a *streaming* stretcher: it is asked for output a block at a time and keeps its
    analysis position between calls. That matters for the engine's block-size invariance — the
    window search must depend only on how much output has been produced, never on how that
    output happened to be divided into blocks.
*/
class TimeStretch
{
public:
    void prepare (double sampleRate);
    void reset() noexcept;

    /// Point at the material to stretch, and the region of it to loop within.
    void setSource (const SampleData* sample, double regionStart, double regionEnd) noexcept;

    /** Set the two rates independently.

        @param pitchRatio  how much to transpose: 2.0 is an octave up
        @param speedRatio  how fast to advance through the source: 2.0 plays it in half the time

        Plain playback is both equal. Melodic stretch raises the pitch ratio while holding the
        speed at 1. Rhythmic stretch raises the speed while holding the pitch at 1.
    */
    void setRatios (double pitchRatio, double speedRatio) noexcept;

    void setLooping (bool) noexcept;

    /// Restart from the region start.
    void rewind() noexcept;

    /// True while there is still material to read; only ever false when not looping.
    bool isActive() const noexcept { return active_; }

    /// Produce output. Adds nothing to left/right — it overwrites them.
    void process (float* left, float* right, int numSamples) noexcept;

private:
    /// Refill the output ring with one more analysis window, sliding it to the best correlation.
    void synthesiseWindow() noexcept;

    /// Where in the source the next window should be taken from, before the correlation search.
    double nominalReadPosition() const noexcept;

    /// Find the offset near `nominal` whose overlap best matches what was written last.
    int findBestOffset (double nominal) const noexcept;

    float sourceAt (int channel, double position) const noexcept;

    const SampleData* sample_ = nullptr;

    double sampleRate_ = 48000.0;
    double regionStart_ = 0.0;
    double regionEnd_ = 0.0;

    double pitchRatio_ = 1.0;
    double speedRatio_ = 1.0;

    /// Analysis window and hop, in samples at the engine's rate.
    int windowSize_ = 0;
    int hopSize_ = 0;
    int searchRange_ = 0;

    std::vector<float> window_;        ///< Hann window, precomputed
    std::vector<float> overlapLeft_;   ///< Tail of the last window, awaiting its cross-fade
    std::vector<float> overlapRight_;

    /// Output waiting to be handed out, and how much of it has been consumed.
    std::vector<float> readyLeft_, readyRight_;
    int readyCount_ = 0;
    int readyRead_ = 0;

    /// How much output has been produced in total. The analysis position derives from this, so
    /// it cannot depend on block boundaries.
    double outputPosition_ = 0.0;

    bool looping_ = true;
    bool active_ = false;
};

} // namespace bud::dsp
