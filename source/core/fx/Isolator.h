#pragma once

#include "../dsp/Filters.h"
#include "../params/Curves.h"

namespace bud::fx
{

/** The drum-track isolator (p. 33).

    Three bands — below 400 Hz, 400 Hz to 1500 Hz, and above 1500 Hz — each cut or boosted from
    −∞ to +6 dB by a knob spanning −50 to +50.

    It is an *isolator*, not an equaliser: at −50 the band is gone entirely, which is what lets
    you drop the whole low end out of a groove and bring it back. That places a real demand on
    the crossover, because a band that leaks even a little leaves an audible shelf where silence
    should be. Splitting with cascaded Linkwitz-Riley sections rather than a single-pole
    crossover keeps the leakage far enough down that a full cut reads as silence.

    Its values reset at startup and are saved with neither the pattern nor the global settings
    (p. 33), so this holds runtime state only and stays out of serialisation.
*/
class Isolator
{
public:
    void prepare (double sampleRate);
    void reset();

    /// Band values are −50 to +50, as the hardware displays them.
    void setBands (int low, int mid, int high) noexcept;

    /// True when all three bands sit at zero, so the engine can skip the whole stage.
    bool isNeutral() const noexcept { return neutral_; }

    void process (float* left, float* right, int numSamples) noexcept;

private:
    /// A Linkwitz-Riley crossover section: two cascaded Butterworth halves per output, which
    /// sum flat and roll off at 24 dB/octave.
    struct Crossover
    {
        dsp::StateVariableFilter lowA, lowB;
        dsp::StateVariableFilter highA, highB;

        void prepare (double sampleRate, float frequency);
        void reset();
        void split (float input, float& low, float& high) noexcept;
    };

    struct Channel
    {
        Crossover lowSplit;    ///< 400 Hz
        Crossover highSplit;   ///< 1500 Hz

        void prepare (double sampleRate);
        void reset();
    };

    Channel left_, right_;

    float lowGain_ = 1.0f;
    float midGain_ = 1.0f;
    float highGain_ = 1.0f;
    bool neutral_ = true;
};

} // namespace bud::fx
