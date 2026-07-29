#pragma once

#include "../Types.h"
#include "../dsp/Filters.h"

#include <array>
#include <vector>

namespace bud::fx
{

/** Send reverb: Room, Hall and Plate (p. 30).

    One feedback-delay network with three tunings rather than three separate algorithms. An FDN
    scatters its delay lines through an orthogonal matrix on every pass, so the echo density
    builds quickly and there is no discrete slap-back to give away the structure — which is what
    separates a reverb from a stack of delays.

    The three types differ in delay-line lengths, feedback and damping: a room is short and
    absorbent, a hall long and diffuse, a plate short but very dense and bright.
*/
class Reverb
{
public:
    void prepare (double sampleRate);
    void reset();

    void setType (ReverbType) noexcept;

    /// Adds the reverberated input into the destination.
    void process (const float* inLeft, const float* inRight,
                  float* outLeft, float* outRight, int numSamples, float wetGain) noexcept;

private:
    static constexpr int kNumDelays = 8;

    struct DelayLine
    {
        std::vector<float> buffer;
        int writeIndex = 0;

        void prepare (int length)
        {
            buffer.assign (static_cast<std::size_t> (std::max (1, length)), 0.0f);
            writeIndex = 0;
        }

        void clear() { std::fill (buffer.begin(), buffer.end(), 0.0f); writeIndex = 0; }

        float read() const noexcept { return buffer[static_cast<std::size_t> (writeIndex)]; }

        void write (float value) noexcept
        {
            buffer[static_cast<std::size_t> (writeIndex)] = value;

            if (++writeIndex >= static_cast<int> (buffer.size()))
                writeIndex = 0;
        }
    };

    void retune();

    double sampleRate_ = 48000.0;
    ReverbType type_ = ReverbType::Room;

    std::array<DelayLine, kNumDelays> delays_;
    std::array<dsp::StateVariableFilter, kNumDelays> damping_;

    /// Input diffusion, so a transient spreads before it reaches the tank.
    std::array<DelayLine, 4> diffusers_;

    float feedback_ = 0.7f;
    float dampingHz_ = 6000.0f;
    dsp::OnePoleHighPass rumbleFilter_;
};

} // namespace bud::fx
