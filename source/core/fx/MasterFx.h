#pragma once

#include "../Types.h"
#include "../dsp/Envelope.h"
#include "../dsp/Filters.h"
#include "../dsp/Saturation.h"

#include <vector>

namespace bud::fx
{

/** The five performance master effects (p. 32).

    One macro knob each, switched on and off with a button rather than mixed in — these are
    meant to be grabbed mid-performance, and their on/off state is deliberately not saved.

    | Type    | Knob      | Range         |
    |---------|-----------|---------------|
    | `S.FLT` | Cutoff    | L50 - OFF - H50 |
    | `PHSR`  | Speed     | 1/16 - 8      |
    | `DIST`  | Drive     | 0-127         |
    | `SN.LP` | Repeat    | 1-128         |
    | `DUCK`  | Threshold | 0-127         |

    Two of them are not simply inline processors, and both are easy to get wrong:

    **Snip loop** captures whatever is playing at the moment it is switched on and repeats that,
    stopping when it is switched off. So the capture buffer has to be running continuously —
    a buffer that starts filling when the effect engages would have nothing in it to repeat.

    **Ducking** is drawn at a different point in the signal flow from the other four (p. 112),
    which is the diagram's way of saying it is sidechained: it compresses the full mix but keys
    off the drum bus. Feeding it the mix it is compressing would turn it into an ordinary
    compressor and lose the pumping entirely.
*/
class MasterFx
{
public:
    void prepare (double sampleRate, int maxBlockSize);
    void reset();

    void setType (MasterFxType) noexcept;
    void setAmount (int raw) noexcept;
    void setTempo (double bpm) noexcept;

    /// Switching on is an event, not a state: snip loop captures at that instant.
    void setEnabled (bool) noexcept;
    bool isEnabled() const noexcept { return enabled_; }

    /** Process the master bus in place.

        @param key  the drum bus, used as the sidechain source for ducking. May be null, in
                    which case ducking falls back to keying off the mix.
    */
    void process (float* left, float* right, const float* keyLeft, const float* keyRight,
                  int numSamples) noexcept;

private:
    void processSweepFilter (float* left, float* right, int numSamples) noexcept;
    void processPhaser (float* left, float* right, int numSamples) noexcept;
    void processDistortion (float* left, float* right, int numSamples) noexcept;
    void processSnipLoop (float* left, float* right, int numSamples) noexcept;
    void processDucking (float* left, float* right, const float* keyLeft, const float* keyRight,
                         int numSamples) noexcept;

    /// Always-on capture, so snip loop has material the moment it is engaged.
    void captureToRing (const float* left, const float* right, int numSamples) noexcept;

    double sampleRate_ = 48000.0;
    double tempo_ = 128.0;

    MasterFxType type_ = MasterFxType::SweepFilter;
    int amount_ = 64;
    bool enabled_ = false;

    // ---- sweep filter -------------------------------------------------------
    dsp::StateVariableFilter sweepLeft_, sweepRight_;

    // ---- phaser -------------------------------------------------------------
    static constexpr int kPhaserStages = 6;
    float allpassLeft_[kPhaserStages] {};
    float allpassRight_[kPhaserStages] {};
    double phaserPhase_ = 0.0;
    float phaserFeedbackLeft_ = 0.0f;
    float phaserFeedbackRight_ = 0.0f;

    // ---- distortion ---------------------------------------------------------
    dsp::Overdrive distortion_;
    dsp::DcBlocker distortionDcLeft_, distortionDcRight_;

    // ---- snip loop ----------------------------------------------------------
    std::vector<float> ringLeft_, ringRight_;
    int ringWrite_ = 0;
    int snipLength_ = 0;      ///< Length of the captured slice, in samples
    int snipStart_ = 0;       ///< Where in the ring the slice begins
    int snipPlay_ = 0;        ///< Read position within the slice
    bool snipArmed_ = false;

    // ---- ducking ------------------------------------------------------------
    float duckEnvelope_ = 0.0f;
    float duckAttack_ = 0.0f;
    float duckRelease_ = 0.0f;
};

} // namespace bud::fx
