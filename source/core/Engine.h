#pragma once

#include "Transport.h"
#include "Types.h"
#include "dsp/Filters.h"
#include "params/ParameterSet.h"
#include "sampler/SampleBank.h"
#include "sequencer/Groove.h"
#include "sequencer/Pattern.h"
#include "sequencer/TrackSequencer.h"
#include "voices/Voice.h"

#include <memory>
#include <vector>

namespace bud
{

/** The instrument.

    Owns the transport, the groove model, eleven track sequencers and their voices, the
    pattern bank, the sample library and the parameter set — everything except the effects,
    which arrive with the next milestone.

    Rendering is per track. Each track collects its own triggers, then renders in segments
    between them so a voice starts on the exact sample it was scheduled for rather than at the
    next block boundary. The remaining sub-sample fraction is handed to the voice, which
    positions its envelope inside that sample.
*/
class Engine
{
public:
    Engine();
    ~Engine();

    void prepare (double sampleRate, int maxBlockSize);
    void reset();

    /** Start playback from the top of the pattern.

        Use this rather than transport().start(): starting the transport alone rewinds the
        clock but leaves every track sequencer where it was, so the pattern would resume from
        wherever it had reached rather than from step one.
    */
    void start();
    void stop();
    bool isPlaying() const noexcept { return transport_.isPlaying(); }

    void process (float* left, float* right, int numSamples);

    //==========================================================================

    Transport& transport() noexcept { return transport_; }
    const Transport& transport() const noexcept { return transport_; }

    Groove& groove() noexcept { return groove_; }
    ParameterSet& parameters() noexcept { return parameters_; }
    const ParameterSet& parameters() const noexcept { return parameters_; }

    SampleLibrary& samples() noexcept { return samples_; }
    const SampleLibrary& samples() const noexcept { return samples_; }

    PatternBank& patterns() noexcept { return patterns_; }
    const PatternBank& patterns() const noexcept { return patterns_; }

    Pattern& currentPattern() noexcept { return patterns_.pattern (patternIndex_); }
    const Pattern& currentPattern() const noexcept { return patterns_.pattern (patternIndex_); }

    /// Switching pattern takes effect at the next block, not mid-step.
    void selectPattern (int index);
    int patternIndex() const noexcept { return patternIndex_; }

    /// -1 clears solo. While a track is soloed, mutes on other tracks are ignored.
    void setSolo (int track) noexcept { solo_ = track; }
    int solo() const noexcept { return solo_; }

    /// Playhead position of a track, for the step display.
    int playheadStep (int track) const noexcept;

    double sampleRate() const noexcept { return sampleRate_; }

private:
    void rebindSequencers();
    void syncFromParameters();
    void renderTrack (int track, int numSamples);
    void mixTrack (int track, float* left, float* right, int numSamples);
    bool trackAudible (int track) const noexcept;

    std::unique_ptr<Voice> makeVoice (VoiceKind) const;

    Transport transport_;
    Groove groove_;
    ParameterSet parameters_;
    SampleLibrary samples_;
    PatternBank patterns_;

    std::array<TrackSequencer, kNumTracks> sequencers_;
    std::array<std::unique_ptr<Voice>, kNumTracks> voices_;

    /// Locks belonging to the step each track is currently playing. Continuous parameters —
    /// level, filter, sends — are read through these so a lock holds for the whole step
    /// rather than only at the instant of the trigger.
    std::array<const PlockMap*, kNumTracks> activeLocks_ {};

    std::array<std::vector<float>, kNumTracks> trackLeft_;
    std::array<std::vector<float>, kNumTracks> trackRight_;
    std::array<std::vector<TriggerEvent>, kNumTracks> trackEvents_;

    std::array<dsp::StateVariableFilter, kNumTracks> filterLeft_;
    std::array<dsp::StateVariableFilter, kNumTracks> filterRight_;

    double sampleRate_ = 48000.0;
    int maxBlockSize_ = 512;
    int patternIndex_ = 0;
    int pendingPatternIndex_ = 0;
    int solo_ = -1;
};

} // namespace bud
