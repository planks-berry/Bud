#pragma once

#include "../dsp/Envelope.h"
#include "../dsp/TimeStretch.h"
#include "Voice.h"

namespace bud
{

/// Catmull-Rom interpolation. Linear interpolation audibly dulls repitched percussion, and
/// these voices are repitched constantly by tuning, drift and repitch-to-tempo.
float interpolateSample (const SampleData&, int channel, double position) noexcept;

//==============================================================================

/** The general drum voice: sample playback with an AD envelope.

    This is what most of the instrument is. The drum engine is sample-based for every bank
    except BD on track 1 and SD on track 3 (p. 60), so this one voice covers HH/CY, CP, ST, TT,
    PC, SY/BS and FX, as well as the user S2 and S4 banks on tracks 7-9.

    Knob mapping differs between the factory banks and the user sample banks (p. 62, 65, 67):
    on a factory bank ATTACK and DECAY are envelope times, while on S2/S4 they become the start
    position and playback length, with MOVE providing the envelope slope instead. TONE is the
    track filter and applied downstream, not here.
*/
class DrumSampleVoice : public Voice
{
public:
    void setLibrary (const SoundLibrary* library) noexcept override { library_ = library; }
    void setTempo (double bpm) noexcept override { tempo_ = bpm; }

    void prepare (double sampleRate) override;
    void reset() override;
    void trigger (const TriggerEvent&, const ParamView&, float elapsedFraction) override;
    void render (float* left, float* right, int numSamples) override;
    bool isActive() const override { return playing_; }

private:
    const SoundLibrary* library_ = nullptr;
    const SampleData* sample_ = nullptr;

    dsp::DecayEnvelope decay_;
    double sampleRate_ = 48000.0;
    double tempo_ = 128.0;
    double position_ = 0.0;
    double endPosition_ = 0.0;
    double increment_ = 1.0;

    /// Attack ramp in samples, from the ATTACK knob or a slope setting.
    double attackSamples_ = 0.0;
    double attackProgress_ = 0.0;

    float level_ = 1.0f;
    bool envelopeBypassed_ = false;
    bool playing_ = false;
};

//==============================================================================

/** The stereo loop voice — track 10, S8 bank (p. 69-70).

    Six playback modes combine looping or one-shot with three tempo behaviours:

    - **no stretch** — plain resampling, so pitch and length move together
    - **melodic** — length holds when the pitch changes
    - **rhythmic** — pitch holds when the tempo changes

    The last two need actual time-stretching, which is why this voice has two playback paths: a
    direct resampler for the unstretched modes, and a `dsp::TimeStretch` for the other four.
    Sharing one path would mean either no stretching or paying for WSOLA when nothing asked for
    it, and the unstretched modes are the ones most likely to carry a long ambient bed.

    Loop playback crossfades the seam with a curved response.
*/
class LoopVoice : public Voice
{
public:
    void setLibrary (const SoundLibrary* library) noexcept override { library_ = library; }
    void setTempo (double bpm) noexcept override { tempo_ = bpm; }

    void prepare (double sampleRate) override;
    void reset() override;
    void trigger (const TriggerEvent&, const ParamView&, float elapsedFraction) override;
    void render (float* left, float* right, int numSamples) override;
    bool isActive() const override { return playing_; }

private:
    /// Gain applied near the loop seam so the wrap does not click.
    float crossfadeGain (double position) const noexcept;

    /// Direct resampling, for the modes that ask for no stretching.
    void renderResampled (float* left, float* right, int numSamples) noexcept;

    /// WSOLA, for the melodic and rhythmic modes.
    void renderStretched (float* left, float* right, int numSamples) noexcept;

    const SoundLibrary* library_ = nullptr;
    const SampleData* sample_ = nullptr;

    dsp::TimeStretch stretch_;

    double sampleRate_ = 48000.0;
    double tempo_ = 128.0;
    double position_ = 0.0;
    double increment_ = 1.0;
    double regionStart_ = 0.0;
    double regionEnd_ = 0.0;
    double crossfadeSamples_ = 0.0;
    float level_ = 1.0f;
    bool looping_ = true;
    bool stretching_ = false;
    bool playing_ = false;
};

} // namespace bud
