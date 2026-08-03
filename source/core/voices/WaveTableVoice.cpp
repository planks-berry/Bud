#include "WaveTableVoice.h"

#include "../factory/WaveTables.h"

#include <algorithm>
#include <cmath>

namespace bud
{

namespace
{
    /// The note a step of 0 plays. A2, so the table has room to move an octave either way
    /// before the mips run out at one end or the fundamental leaves the room at the other.
    constexpr float kRootFrequency = 110.0f;

    /// Longest a MOVE sweep takes to cross the whole table, at the extremes of the knob.
    constexpr double kSweepSeconds = 1.2;
}

void WaveTableVoice::prepare (double sampleRate)
{
    sampleRate_ = std::max (1.0, sampleRate);

    oscillator_.prepare (sampleRate_);
    decay_.prepare (sampleRate_);

    reset();
}

void WaveTableVoice::reset()
{
    oscillator_.reset();
    decay_.reset();

    attackSamples_ = 0.0;
    attackProgress_ = 0.0;
    position_ = 0.0f;
    positionStep_ = 0.0f;
    playing_ = false;
}

void WaveTableVoice::trigger (const TriggerEvent& event, const ParamView& params,
                              float elapsedFraction)
{
    if (bank_ == nullptr || bank_->empty())
    {
        playing_ = false;
        return;
    }

    const auto* table = bank_->at (params (ParamKind::TrackSound));

    if (table == nullptr || table->empty())
    {
        playing_ = false;
        return;
    }

    oscillator_.setTable (table);

    // A retriggered note starts its cycle again. Without this the phase would carry over from
    // the previous note, so the same pattern would render differently depending on what came
    // before it — which is exactly the class of bug the block-size tests exist to catch.
    oscillator_.reset();
    oscillator_.setTable (table);

    const auto tune = curves::tuneSemitones (params (ParamKind::TrackTune)) * (5.0f / 24.0f)
                    + static_cast<float> (event.note);

    const auto frequency = kRootFrequency * curves::semitonesToRatio (tune)
                                          * curves::centsToRatio (event.pitchCents);

    oscillator_.setFrequency (static_cast<double> (frequency));

    // MOVE: centre holds still, either side sweeps. Reading it as a signed rate rather than a
    // position is what makes the knob do the thing the engine is for; a table that never moves
    // is only a waveform.
    const auto move = params.bipolar (ParamKind::TrackMove);   // -1 … +1

    if (move >= 0.0f)
    {
        position_ = 0.0f;
        positionStep_ = static_cast<float> (
            static_cast<double> (move) / (kSweepSeconds * sampleRate_));
    }
    else
    {
        position_ = 1.0f;
        positionStep_ = static_cast<float> (
            static_cast<double> (move) / (kSweepSeconds * sampleRate_));
    }

    oscillator_.setPosition (position_);

    attackSamples_ = static_cast<double> (params.timeMs (ParamKind::TrackAttack, 0.0f, 500.0f))
                   * 0.001 * sampleRate_;
    attackProgress_ = 0.0;

    decay_.setDecayMs (params.timeMs (ParamKind::TrackDecay, 20.0f, 4000.0f));
    decay_.setCurve (0.35f);

    level_ = event.velocity * params.unit (ParamKind::TrackLevel);

    decay_.trigger (1.0f);
    decay_.advanceFraction (elapsedFraction);
    playing_ = true;
}

void WaveTableVoice::render (float* left, float* right, int numSamples)
{
    if (! playing_)
        return;

    const auto pan = 0.5f;   // The engine pans the track; the voice renders centred.

    for (int i = 0; i < numSamples; ++i)
    {
        if (! decay_.isActive())
        {
            playing_ = false;
            return;
        }

        auto gain = decay_.next() * level_;

        if (attackSamples_ > 0.0 && attackProgress_ < attackSamples_)
        {
            gain *= static_cast<float> (attackProgress_ / attackSamples_);
            attackProgress_ += 1.0;
        }

        // The sweep stops at the ends rather than wrapping: arriving back at the first frame
        // would be heard as a jump, since the frames are not a loop.
        position_ = std::clamp (position_ + positionStep_, 0.0f, 1.0f);
        oscillator_.setPosition (position_);

        const auto sample = oscillator_.next() * gain;

        left[i] += sample * (1.0f - pan);
        right[i] += sample * pan;
    }
}

} // namespace bud
