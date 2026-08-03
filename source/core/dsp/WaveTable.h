#pragma once

#include <span>
#include <string>
#include <vector>

namespace bud::dsp
{

/** A single cycle described by what it contains rather than by its samples.

    Specifying a wavetable as harmonics instead of a buffer is what makes band-limiting exact:
    to render a version safe at a given pitch you simply stop summing at the last harmonic that
    fits below Nyquist. Starting from a buffer means filtering something that has already
    aliased, which cannot be undone.

    `amplitude[0]` is the fundamental. `phase` may be shorter than `amplitude` (or empty), in
    which case the missing entries are zero — a cosine phase.
*/
struct HarmonicSpec
{
    std::vector<float> amplitude;
    std::vector<float> phase;      ///< Radians
};

/** A morphing wavetable, band-limited by octave.

    Two interpolations happen on every sample: along the cycle, and *between frames*. The second
    is the point of a wavetable rather than a plain oscillator — moving through the frames is a
    timbre control that no filter can imitate, because it changes the harmonic structure itself
    rather than shaping what is already there.

    Band-limiting is by mip level. Level k holds half the harmonics of level k-1 and half as
    many samples, which is exactly the right trade: a table with fewer harmonics needs fewer
    points to represent it, so the whole pyramid costs about a third more than the base level
    rather than ten times as much.
*/
class WaveTable
{
public:
    /// Base cycle length. A power of two, so the phase wrap is a mask.
    static constexpr int kFrameSize = 2048;

    /// Harmonics kept at mip 0. 512 covers a saw down to about 47 Hz at 48 kHz before the
    /// mip below it takes over, and keeps generation cheap enough to do at startup.
    static constexpr int kMaxHarmonics = 512;

    /// Enough levels to reach one harmonic, which is a sine at any pitch.
    static constexpr int kMipLevels = 10;

    /// Mips stop shrinking here: below this the phase resolution starts to matter more than
    /// the memory saved.
    static constexpr int kMinFrameSize = 64;

    WaveTable() = default;

    /// Build from harmonic content, one spec per frame. At least one frame is required.
    void build (std::span<const HarmonicSpec> frames);

    /** Build by analysing single cycles.

        Each cycle is transformed to harmonics and then rebuilt band-limited, so an arbitrary
        buffer — a recording, a drawing, something generated elsewhere — becomes a table that
        plays cleanly at any pitch. Cycles may be any length; they are read with linear
        interpolation.
    */
    void buildFromCycles (std::span<const std::span<const float>> cycles);

    bool empty() const noexcept { return frames_.empty(); }
    int frameCount() const noexcept { return frameCount_; }

    /// Which mip is safe to play at this frequency, given the sample rate.
    int mipForFrequency (double hz, double sampleRate) const noexcept;

    /** One sample.

        @param phase01    position in the cycle, [0, 1)
        @param position01 position across the frames, [0, 1]
        @param mip        from mipForFrequency
    */
    float read (double phase01, float position01, int mip) const noexcept;

    /// Harmonics retained at a mip level. Exposed for tests and for reasoning about aliasing.
    static int harmonicsAtMip (int mip) noexcept;
    static int sizeAtMip (int mip) noexcept;

private:
    void renderMips (std::span<const HarmonicSpec> frames);

    /// frames_[mip] holds frameCount_ frames laid end to end, each sizeAtMip(mip) long.
    std::vector<std::vector<float>> frames_;
    int frameCount_ = 0;
};

//==============================================================================

/** Plays a WaveTable.

    Holds phase as a fraction of a cycle rather than in samples, so the mip can change between
    one sample and the next — which it must, since the pitch envelope and the note both move it
    — without the phase jumping.
*/
class WaveTableOscillator
{
public:
    void prepare (double sampleRate) noexcept;
    void reset() noexcept;

    void setTable (const WaveTable* table) noexcept { table_ = table; }
    const WaveTable* table() const noexcept { return table_; }

    void setFrequency (double hz) noexcept;

    /// Where between the frames to read, [0, 1].
    void setPosition (float position01) noexcept;

    float next() noexcept;

private:
    const WaveTable* table_ = nullptr;
    double sampleRate_ = 48000.0;
    double phase_ = 0.0;
    double increment_ = 0.0;
    double frequency_ = 0.0;
    float position_ = 0.0f;
    int mip_ = 0;
};

} // namespace bud::dsp
