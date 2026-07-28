#pragma once

#include "../dsp/Envelope.h"
#include "../sampler/SampleBank.h"
#include "Voice.h"

namespace bud
{

/// Catmull-Rom interpolation. Linear interpolation audibly dulls repitched percussion, and
/// these voices are repitched constantly by tuning, drift and repitch-to-tempo.
float interpolateSample (const SampleData&, int channel, double position) noexcept;

//==============================================================================

/** One-shot sample playback (tracks 2, 4 and 7-9).

    Reads the S2 or S4 bank. Tracks 7-9 additionally offer repitch-to-tempo, which speeds the
    sample up or down to follow the pattern tempo and lets the pitch move with it — the
    cheaper, more characterful of the two tempo-matching options the device provides.
*/
class SampleVoice : public Voice
{
public:
    void setLibrary (const SampleLibrary* library) noexcept { library_ = library; }
    void setTempo (double bpm) noexcept { tempo_ = bpm; }

    void prepare (double sampleRate) override;
    void reset() override;
    void trigger (const TriggerEvent&, const ParamView&, float elapsedFraction) override;
    void render (float* left, float* right, int numSamples) override;
    bool isActive() const override { return playing_ && amplitude_.isActive(); }

private:
    const SampleLibrary* library_ = nullptr;
    const SampleData* sample_ = nullptr;

    dsp::DecayEnvelope amplitude_;
    double sampleRate_ = 48000.0;
    double tempo_ = 128.0;
    double position_ = 0.0;
    double increment_ = 1.0;
    bool playing_ = false;
};

//==============================================================================

/** Stereo loop playback (track 10).

    Plays a region of an S8 slot, either looping with an equal-power crossfade at the seam or
    as a one-shot. Time-stretch arrives with the sampler milestone; until then the loop
    follows tempo by repitching, and the STRETCH flag selects which behaviour is requested.
*/
class LoopVoice : public Voice
{
public:
    void setLibrary (const SampleLibrary* library) noexcept { library_ = library; }
    void setTempo (double bpm) noexcept { tempo_ = bpm; }

    void prepare (double sampleRate) override;
    void reset() override;
    void trigger (const TriggerEvent&, const ParamView&, float elapsedFraction) override;
    void render (float* left, float* right, int numSamples) override;
    bool isActive() const override { return playing_; }

private:
    /// Gain applied near the loop seam so the wrap does not click.
    float crossfadeGain (double position) const noexcept;

    const SampleLibrary* library_ = nullptr;
    const SampleData* sample_ = nullptr;

    double sampleRate_ = 48000.0;
    double tempo_ = 128.0;
    double position_ = 0.0;
    double increment_ = 1.0;
    double regionStart_ = 0.0;
    double regionEnd_ = 0.0;
    double crossfadeSamples_ = 0.0;
    float level_ = 1.0f;
    bool looping_ = true;
    bool playing_ = false;
};

} // namespace bud
