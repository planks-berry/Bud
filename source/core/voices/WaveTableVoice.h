#pragma once

#include "Voice.h"

#include "../dsp/Envelope.h"
#include "../dsp/WaveTable.h"

namespace bud
{

namespace factory { class WaveTableBank; }

/** The wavetable synthesis voice, played by the WT bank on any track.

    Knob assignments, chosen for this bank rather than inherited — the device's own banks are all
    sample or drum engines, so there was nothing to be faithful to here:

    | Knob   | Meaning |
    |--------|---------|
    | SOUND  | which wavetable |
    | TUNE   | pitch, ±5 semitones around the step's note |
    | TONE   | the track filter, as on every sampled bank |
    | MOVE   | **position across the frames** — the control the engine exists for |
    | ATTACK | attack time, 0 to 500 ms |
    | DECAY  | decay time |

    MOVE sweeps *within the note* rather than only setting a start point: a wavetable held still
    is a waveform, and the movement is what distinguishes the engine from an oscillator with more
    shapes. Above centre it sweeps forward over the note, below centre backward, and at centre it
    holds — so the knob still reads as a position when you want one.
*/
class WaveTableVoice : public Voice
{
public:
    void setBank (const factory::WaveTableBank* bank) noexcept { bank_ = bank; }

    void prepare (double sampleRate) override;
    void reset() override;
    void trigger (const TriggerEvent&, const ParamView&, float elapsedFraction) override;
    void render (float* left, float* right, int numSamples) override;
    bool isActive() const override { return playing_; }

private:
    const factory::WaveTableBank* bank_ = nullptr;

    dsp::WaveTableOscillator oscillator_;
    dsp::DecayEnvelope decay_;

    double sampleRate_ = 48000.0;

    float level_ = 1.0f;

    /// Attack ramp, in samples, and how far through it we are.
    double attackSamples_ = 0.0;
    double attackProgress_ = 0.0;

    /// Frame position at the start of the note, and how far it travels per sample.
    float position_ = 0.0f;
    float positionStep_ = 0.0f;

    bool playing_ = false;
};

} // namespace bud
