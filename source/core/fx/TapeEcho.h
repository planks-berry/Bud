#pragma once

#include "../dsp/Filters.h"
#include "../dsp/Noise.h"
#include "../dsp/Saturation.h"

#include <vector>

namespace bud::fx
{

/** Tape-echo style send delay (p. 29-31).

    A plain digital delay repeats a signal exactly; a tape echo does not, and the difference is
    most of the character. Three things are modelled: the playback head wanders slightly (wow and
    flutter), each pass through the loop loses top and bottom end, and the tape saturates as the
    feedback builds. Together they make repeats degrade into a soft wash rather than stacking up
    as identical copies.

    Delay time either follows the tempo or is set freely (`D.SY`, p. 31). Ping-pong alternates
    the repeats across the stereo field (`D.PP`, p. 30), and a separate tap feeds the delay into
    the reverb (`D>R`, p. 30).
*/
class TapeEcho
{
public:
    void prepare (double sampleRate);
    void reset();

    /// Delay time in milliseconds. The engine converts from a tempo division when sync is on.
    void setDelayMs (float milliseconds) noexcept;
    void setFeedback (int raw) noexcept;
    void setPingPong (bool) noexcept;

    /// Process a send and add the repeats to the destination.
    ///
    /// `reverbOut` receives the same repeats scaled by the delay-to-reverb amount, so the tail
    /// can be sent on into the reverb (p. 30). Pass nullptr to skip it.
    void process (const float* inLeft, const float* inRight,
                  float* outLeft, float* outRight,
                  float* reverbLeft, float* reverbRight,
                  int numSamples, float wetGain, float toReverb) noexcept;

private:
    float readInterpolated (const std::vector<float>& buffer, double position) const noexcept;

    double sampleRate_ = 48000.0;

    std::vector<float> bufferLeft_, bufferRight_;
    int writeIndex_ = 0;

    double delaySamples_ = 12000.0;
    double smoothedDelay_ = 12000.0;

    /// False until the first block after a reset has snapped the glide to the commanded time.
    /// The glide exists so that *changing* the delay sounds like tape speeding up; it should not
    /// apply to the value the effect starts at.
    bool delayPrimed_ = false;

    float feedback_ = 0.4f;
    bool pingPong_ = false;

    /// Wow is a slow wander, flutter a faster one; together they detune the repeats.
    double wowPhase_ = 0.0;
    double flutterPhase_ = 0.0;

    dsp::OnePoleHighPass loopHighPass_;
    dsp::StateVariableFilter loopLowPassLeft_, loopLowPassRight_;
    dsp::Overdrive saturation_;
};

} // namespace bud::fx
