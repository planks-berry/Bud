#pragma once

#include "Transport.h"
#include "Types.h"
#include "dsp/Filters.h"
#include "fx/Isolator.h"
#include "fx/MasterFx.h"
#include "fx/Reverb.h"
#include "fx/TapeEcho.h"
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

    Owns the transport, the groove model, eleven track sequencers and their voices, the pattern
    store, the sound library and the parameter set.

    Each track carries two voices: a sampler, and — on tracks 1 and 3 — a dedicated synthesis
    engine. Which one a trigger reaches depends on the track's current sound bank, since BD on
    track 1 and SD on track 3 are synthesised while every other bank plays samples (p. 60). Both
    render every block; the idle one contributes nothing.

    The per-track chain follows the architecture diagram on p. 112:
    `OSC -> EG -> FILTER -> PAN -> track level -> mute`, then the sends. The filter is the TONE
    knob, and it is bypassed on the banks where TONE means something else.
*/
class Engine
{
public:
    Engine();
    ~Engine();

    void prepare (double sampleRate, int maxBlockSize);
    void reset();

    /** Start playback from the top of the pattern.

        Use this rather than transport().start(): starting the transport alone rewinds the clock
        but leaves the track sequencers where they were, so the pattern would resume from
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

    SoundLibrary& sounds() noexcept { return sounds_; }
    const SoundLibrary& sounds() const noexcept { return sounds_; }

    PatternBank& patterns() noexcept { return patterns_; }
    const PatternBank& patterns() const noexcept { return patterns_; }

    Pattern& currentPattern() noexcept { return patterns_.pattern (patternIndex_); }
    const Pattern& currentPattern() const noexcept { return patterns_.pattern (patternIndex_); }

    /// Switching pattern takes effect at the next block, not mid-step.
    void selectPattern (int index);
    void selectPattern (int bank, int slot) { selectPattern (PatternBank::flatIndex (bank, slot)); }
    int patternIndex() const noexcept { return patternIndex_; }

    /// -1 clears solo. While a track is soloed, mutes on other tracks are ignored.
    void setSolo (int track) noexcept { solo_ = track; }
    int solo() const noexcept { return solo_; }

    int playheadStep (int track) const noexcept;

    double sampleRate() const noexcept { return sampleRate_; }

private:
    struct TrackVoices
    {
        std::unique_ptr<Voice> sampler;   ///< Sample playback, or the loop / bass voice
        std::unique_ptr<Voice> synth;     ///< BD on track 1, SD on track 3; null elsewhere
    };

    void buildVoices();
    void rebindSequencers();
    void syncFromParameters();
    void renderTrack (int track, int numSamples);

    /// Fold a track into the buses it feeds: the drum bus or the direct bus, plus the sends.
    void mixTrack (int track, int numSamples);

    /// Isolator, master effect, pattern and master level.
    void mixBusesToOutput (float* left, float* right, int numSamples);

    /// Delay time in milliseconds, snapped to a tempo division when D.SY is on (p. 31).
    float delayTimeMs() const noexcept;

    bool trackAudible (int track) const noexcept;

    /// The voice a trigger on this bank should reach.
    Voice* voiceFor (int track, SoundBank) noexcept;

    /// The track whose triggers choke this one, or -1. Tracks 5 and 6 choke each other (p. 66).
    int chokePartner (int track) const noexcept;

    Transport transport_;
    Groove groove_;
    ParameterSet parameters_;
    SoundLibrary sounds_;
    PatternBank patterns_;

    std::array<TrackSequencer, kNumTracks> sequencers_;
    std::array<TrackVoices, kNumTracks> voices_;

    /// Locks belonging to the step each track is currently playing. Continuous parameters —
    /// level, pan, filter, sends — read through these so a lock holds for the whole step rather
    /// than only at the instant of the trigger.
    std::array<const PlockMap*, kNumTracks> activeLocks_ {};

    std::array<std::vector<float>, kNumTracks> trackLeft_;
    std::array<std::vector<float>, kNumTracks> trackRight_;
    std::array<std::vector<TriggerEvent>, kNumTracks> trackEvents_;

    std::array<dsp::StateVariableFilter, kNumTracks> filterLeft_;
    std::array<dsp::StateVariableFilter, kNumTracks> filterRight_;

    //==========================================================================
    // Buses, following the architecture on p. 112.
    //
    // The drum bus is separate from the direct bus because the isolator applies to the drum
    // tracks alone (and optionally the loop track), and because the ducking compressor keys off
    // it rather than off the mix it compresses.

    struct StereoBus
    {
        std::vector<float> left, right;

        void prepare (int size)
        {
            left.assign (static_cast<std::size_t> (size), 0.0f);
            right.assign (static_cast<std::size_t> (size), 0.0f);
        }

        void clear (int numSamples)
        {
            std::fill_n (left.data(), numSamples, 0.0f);
            std::fill_n (right.data(), numSamples, 0.0f);
        }
    };

    StereoBus drumBus_;     ///< Tracks 1-9, and track 10 when ISO+LP is on
    StereoBus directBus_;   ///< Everything that bypasses the isolator
    StereoBus reverbSend_;
    StereoBus delaySend_;

    fx::Isolator isolator_;
    fx::Reverb reverb_;
    fx::TapeEcho delay_;
    fx::MasterFx masterFx_;

    double sampleRate_ = 48000.0;
    int maxBlockSize_ = 512;
    int patternIndex_ = 0;
    int pendingPatternIndex_ = 0;
    int solo_ = -1;
};

} // namespace bud
