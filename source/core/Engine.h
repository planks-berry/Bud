#pragma once

#include "Transport.h"
#include "Types.h"
#include "dsp/Filters.h"
#include "fx/Isolator.h"
#include "fx/MasterFx.h"
#include "fx/Reverb.h"
#include "fx/TapeEcho.h"
#include "factory/WaveTables.h"
#include "kit/DrumKit.h"
#include "params/ParameterSet.h"
#include "sampler/SampleBank.h"
#include "sampler/Sampler.h"
#include "sequencer/Groove.h"
#include "sequencer/Pattern.h"
#include "sequencer/TrackSequencer.h"
#include "voices/Voice.h"

#include <memory>
#include <span>
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

    /** Render `numSamples` frames, overwriting both buffers.

        Any block size is accepted, including one larger than `prepare` was told to expect —
        oversized requests are split internally. Hosts do exceed their declared maximum (offline
        bounces are the usual way), and silently filling only part of the buffer would leave the
        rest holding whatever the host had in it.

        Splitting is safe precisely because the engine is block-size invariant: a run divided into
        chunks produces the same samples as one that is not.
    */
    void process (float* left, float* right, int numSamples);

    /** Render with external audio present.

        The device mixes LINE and USB input into its own output with independent gain and sends
        (p. 85), and the sampler records from whichever is selected (p. 81). Both need the input
        to reach the engine, so this is the full signature; the two-buffer form above is this one
        with no input connected.

        `inputRight` may be null for a mono source. The input buffers are read, never written.
    */
    void process (float* left, float* right,
                  const float* inputLeft, const float* inputRight, int numSamples);

    //==========================================================================

    Sampler& sampler() noexcept { return sampler_; }
    const Sampler& sampler() const noexcept { return sampler_; }

    Transport& transport() noexcept { return transport_; }
    const Transport& transport() const noexcept { return transport_; }

    Groove& groove() noexcept { return groove_; }
    ParameterSet& parameters() noexcept { return parameters_; }
    const ParameterSet& parameters() const noexcept { return parameters_; }

    KitBank& kits() noexcept { return kits_; }
    const KitBank& kits() const noexcept { return kits_; }

    SoundLibrary& sounds() noexcept { return sounds_; }
    const SoundLibrary& sounds() const noexcept { return sounds_; }

    /** The wavetables the WT bank plays.

        Exposed non-const so custom tables can be added at run time — that is the point of the
        engine rather than an extra. A table added here is playable immediately: select the WT
        bank on a track and turn SOUND to it.
    */
    factory::WaveTableBank& waveTables() noexcept { return waveTables_; }
    const factory::WaveTableBank& waveTables() const noexcept { return waveTables_; }

    PatternBank& patterns() noexcept { return patterns_; }
    const PatternBank& patterns() const noexcept { return patterns_; }

    Pattern& currentPattern() noexcept { return patterns_.pattern (patternIndex_); }
    const Pattern& currentPattern() const noexcept { return patterns_.pattern (patternIndex_); }

    /// Switching pattern takes effect at the next block, not mid-step.
    void selectPattern (int index);
    void selectPattern (int bank, int slot) { selectPattern (PatternBank::flatIndex (bank, slot)); }
    int patternIndex() const noexcept { return patternIndex_; }

    //==========================================================================
    // Pattern operations (p. 56-59)

    /// Save the live parameters into the current pattern (`func` + `PTN save`, p. 56).
    void savePattern() { patterns_.store (patternIndex_, parameters_); }
    void savePatternTo (int index) { patterns_.store (index, parameters_); }

    /** Initialise a pattern (`CLR` + `PTN`, p. 57).

        Also clears mute and solo, which the manual calls out separately — an initialised pattern
        that still had tracks muted would not be blank in the way the display claims.
    */
    void initialisePattern (int index);

    /** Chain playback: select several patterns and play them in order (p. 59).

        Passing an empty list ends chain playback and leaves the current pattern playing, which is
        what pressing `PTN` again does. Indices outside the bank are ignored rather than clamped —
        clamping would silently substitute a pattern the player did not choose.
    */
    void setPatternChain (std::span<const int> indices);
    void clearPatternChain() { setPatternChain ({}); }

    std::span<const int> patternChain() const noexcept { return patternChain_; }
    bool isChaining() const noexcept { return ! patternChain_.empty(); }

    /// Position within the chain, or -1 when not chaining.
    int chainPosition() const noexcept { return patternChain_.empty() ? -1 : chainPosition_; }

    /** Length of the current pattern in quarter notes — when a chain advances.

        The manual does not define this for an instrument whose tracks can each run at their own
        division and step length, so the choice is ours: the longest track cycle, which is the
        point at which every track has completed a whole number of its own passes. Taking the
        shortest, or a fixed sixteen steps, would cut a polymetric track off mid-phrase.
    */
    double patternLengthQuarterNotes() const noexcept;

    /// -1 clears solo. While a track is soloed, mutes on other tracks are ignored.
    void setSolo (int track) noexcept { solo_ = track; }
    int solo() const noexcept { return solo_; }

    //==========================================================================
    // Sound selection

    /** Choose one of the five sounds a track offers (factory::soundMenu).

        This only writes the track's BANK and SOUND parameters, so it composes with everything
        else: a parameter lock, a kit load or a turn of the knob all still work, and none of
        them has to know the menu exists.
    */
    void selectSound (int track, int choice);

    /// Which menu entry the track is currently on, or -1 when the knob is somewhere unnamed.
    int selectedSound (int track) const;

    /** Load a genre preset (factory::presets) into the current pattern.

        Clears the pattern first, then writes tempo, FEEL, swing, each track's sound and its
        part, so what plays afterwards is the preset rather than the preset over whatever was
        there. Other patterns, the sample banks and the effects are untouched.
    */
    void applyPreset (int index);

    int playheadStep (int track) const noexcept;

    double sampleRate() const noexcept { return sampleRate_; }

private:
    struct TrackVoices
    {
        std::unique_ptr<Voice> sampler;   ///< Sample playback, or the loop / bass voice
        std::unique_ptr<Voice> synth;     ///< BD on track 1, SD on track 3; null elsewhere
        std::unique_ptr<Voice> wavetable; ///< The WT bank, available on every track
    };

    void buildVoices();
    void rebindSequencers();
    void syncFromParameters();

    /// Step to the next pattern in the chain once the current one has run its length (p. 59).
    void advanceChainIfDue();

    /** Samples remaining before the chain advances, or `numSamples` if that is sooner.

        `process` splits its blocks here so the switch lands on the same sample whatever buffer
        size the host uses. Without it a chain would advance at the first block boundary *after*
        the musical position, which at 4096 samples is nearly a tenth of a second late — audible,
        and different for every host.
    */
    int samplesUntilChainAdvance (int numSamples) const noexcept;

    /// One block, no larger than the prepared maximum. `process` splits oversized requests down
    /// to this.
    void processBlock (float* left, float* right,
                       const float* inputLeft, const float* inputRight, int numSamples);

    /// Feed the sampler, then fold the selected external input into the buses (p. 85).
    void mixExternalInput (const float* inputLeft, const float* inputRight, int numSamples);

    void renderTrack (int track, int numSamples);

    /// Fold a track into the buses it feeds: the drum bus or the direct bus, plus the sends.
    void mixTrack (int track, int numSamples);

    /// Isolator, master effect, pattern and master level.
    void mixBusesToOutput (float* left, float* right, int numSamples);

    /// Delay time in milliseconds, snapped to a tempo division when D.SY is on (p. 31).
    float delayTimeMs() const noexcept;

    bool trackAudible (int track) const noexcept;

    /// True when the track is muted in SEQ mode: audible, but its sequenced notes are dropped.
    bool sequencerMuted (int track) const noexcept;

    /// The voice a trigger on this bank should reach.
    Voice* voiceFor (int track, SoundBank) noexcept;

    /// The track whose triggers choke this one, or -1. Tracks 5 and 6 choke each other (p. 66).
    int chokePartner (int track) const noexcept;

    Transport transport_;
    Groove groove_;
    Sampler sampler_;
    ParameterSet parameters_;
    SoundLibrary sounds_;
    factory::WaveTableBank waveTables_;
    PatternBank patterns_;
    KitBank kits_;

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

    /// Chain playback (p. 59). Empty when not chaining.
    std::vector<int> patternChain_;
    int chainPosition_ = 0;

    /// Musical position the current pattern started at, so the chain advances a pattern length
    /// after it began rather than at an absolute grid position.
    double patternStartPpq_ = 0.0;
    int solo_ = -1;
};

} // namespace bud
