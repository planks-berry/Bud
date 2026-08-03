#include "Engine.h"

#include "factory/FactoryContent.h"
#include "factory/Presets.h"
#include "factory/SoundMenu.h"
#include "voices/BassVoice.h"
#include "voices/DrumVoices.h"
#include "voices/SampleVoices.h"
#include "voices/WaveTableVoice.h"

#include <algorithm>
#include <cmath>

namespace bud
{

Engine::Engine()
{
    buildVoices();

    for (int track = 0; track < kNumTracks; ++track)
        sequencers_[static_cast<std::size_t> (track)].prepare (track);

    rebindSequencers();
}

Engine::~Engine() = default;

void Engine::buildVoices()
{
    for (int track = 0; track < kNumTracks; ++track)
    {
        auto& slot = voices_[static_cast<std::size_t> (track)];

        if (track == kBassTrack)
            slot.sampler = std::make_unique<BassVoice>();
        else if (track == kLoopTrack)
            slot.sampler = std::make_unique<LoopVoice>();
        else
            slot.sampler = std::make_unique<DrumSampleVoice>();

        // Only BD on track 1 and SD on track 3 are synthesised (p. 60). Those tracks carry
        // both engines and dispatch on the bank in use.
        if (track == 0)
            slot.synth = std::make_unique<KickVoice>();
        else if (track == 2)
            slot.synth = std::make_unique<SnareVoice>();

        // Unlike BD and SD synthesis, which the device fixes to two tracks, the wavetable bank
        // can be selected anywhere — so every track carries one.
        slot.wavetable = std::make_unique<WaveTableVoice>();
    }
}

Voice* Engine::voiceFor (int track, SoundBank bank) noexcept
{
    auto& slot = voices_[static_cast<std::size_t> (track)];

    if (bank == SoundBank::WT)
        return slot.wavetable.get();

    if (slot.synth != nullptr && bankHasSynthEngine (bank, track))
        return slot.synth.get();

    return slot.sampler.get();
}

int Engine::chokePartner (int track) const noexcept
{
    if (! trackSupportsChoke (track))
        return -1;

    const auto partner = track == 4 ? 5 : 4;

    // Both sides have to have choke enabled for it to apply.
    return (parameters_.get (ParamKind::TrackChoke, track) != 0
            && parameters_.get (ParamKind::TrackChoke, partner) != 0)
         ? partner : -1;
}

//==============================================================================

void Engine::prepare (double sampleRate, int maxBlockSize)
{
    sampleRate_ = std::max (1.0, sampleRate);
    maxBlockSize_ = std::max (1, maxBlockSize);

    transport_.prepare (sampleRate_);

    // The factory set is generated rather than shipped, and it is generated at the engine's
    // sample rate so nothing has to be resampled on playback.
    factory::generate (sounds_, sampleRate_);

    // Rebuilt here rather than in the constructor because the mip pyramid is chosen against the
    // sample rate. Custom tables survive: generateFactory only replaces its own entries.
    waveTables_.generateFactory();

    for (int track = 0; track < kNumTracks; ++track)
    {
        const auto t = static_cast<std::size_t> (track);

        trackLeft_[t].assign (static_cast<std::size_t> (maxBlockSize_), 0.0f);
        trackRight_[t].assign (static_cast<std::size_t> (maxBlockSize_), 0.0f);
        trackEvents_[t].reserve (64);

        filterLeft_[t].prepare (sampleRate_);
        filterRight_[t].prepare (sampleRate_);

        for (auto* voice : { voices_[t].sampler.get(), voices_[t].synth.get(),
                             voices_[t].wavetable.get() })
        {
            if (voice == nullptr)
                continue;

            voice->prepare (sampleRate_);
            voice->setLibrary (&sounds_);
        }

        if (auto* wt = dynamic_cast<WaveTableVoice*> (voices_[t].wavetable.get()))
            wt->setBank (&waveTables_);
    }

    for (auto* bus : { &drumBus_, &directBus_, &reverbSend_, &delaySend_ })
        bus->prepare (maxBlockSize_);

    sampler_.prepare (sampleRate_);
    isolator_.prepare (sampleRate_);
    reverb_.prepare (sampleRate_);
    delay_.prepare (sampleRate_);
    masterFx_.prepare (sampleRate_, maxBlockSize_);

    reset();
}

void Engine::reset()
{
    transport_.reset();

    for (int track = 0; track < kNumTracks; ++track)
    {
        const auto t = static_cast<std::size_t> (track);

        sequencers_[t].reset();
        activeLocks_[t] = nullptr;

        for (auto* voice : { voices_[t].sampler.get(), voices_[t].synth.get(),
                             voices_[t].wavetable.get() })
            if (voice != nullptr)
                voice->reset();

        filterLeft_[t].reset();
        filterRight_[t].reset();
    }

    isolator_.reset();
    reverb_.reset();
    delay_.reset();
    masterFx_.reset();
}

void Engine::start()
{
    // Rewind the sequencers and silence the voices before the clock restarts, so playback
    // begins from step one with nothing ringing over from the previous run.
    for (int track = 0; track < kNumTracks; ++track)
    {
        const auto t = static_cast<std::size_t> (track);

        sequencers_[t].reset();
        activeLocks_[t] = nullptr;

        for (auto* voice : { voices_[t].sampler.get(), voices_[t].synth.get(),
                             voices_[t].wavetable.get() })
            if (voice != nullptr)
                voice->reset();

        filterLeft_[t].reset();
        filterRight_[t].reset();
    }

    // Re-anchor the chain. Without this a stop and restart would leave `patternStartPpq_` at the
    // position playback had reached while the transport went back to zero, so the chain would sit
    // on its current pattern until the clock caught up again — silently, and for as long as the
    // previous run had lasted.
    chainPosition_ = 0;
    patternStartPpq_ = 0.0;

    if (! patternChain_.empty())
        selectPattern (patternChain_.front());

    transport_.start();
}

void Engine::stop()
{
    transport_.stop();
}

void Engine::rebindSequencers()
{
    auto& pattern = patterns_.pattern (patternIndex_);

    for (int track = 0; track < kNumTracks; ++track)
        sequencers_[static_cast<std::size_t> (track)].setPattern (&pattern.track (track));
}

void Engine::selectPattern (int index)
{
    pendingPatternIndex_ = std::clamp (index, 0, kNumPatterns - 1);
}

//==============================================================================

void Engine::initialisePattern (int index)
{
    patterns_.initialise (index);

    // p. 57: "Executing CLR + PTN also clears MUTE and SOLO selection modes." An initialised
    // pattern that still had tracks muted would not be blank in the way the display claims.
    if (index == patternIndex_)
    {
        for (int track = 0; track < kNumTracks; ++track)
            parameters_.set (ParamKind::TrackMute, track, 0);

        solo_ = -1;
    }
}

void Engine::setPatternChain (std::span<const int> indices)
{
    patternChain_.clear();

    for (const auto index : indices)
        if (index >= 0 && index < kNumPatterns)
            patternChain_.push_back (index);

    chainPosition_ = 0;
    patternStartPpq_ = transport_.blockStartPpq();

    // Starting a chain jumps to its first entry; ending one leaves whatever is playing alone,
    // which is what pressing PTN again does.
    if (! patternChain_.empty())
        selectPattern (patternChain_.front());
}

double Engine::patternLengthQuarterNotes() const noexcept
{
    const auto& pattern = patterns_.pattern (patternIndex_);

    auto longest = 0.0;

    for (int track = 0; track < kNumTracks; ++track)
    {
        const auto division = static_cast<StepDivision> (std::clamp (
            parameters_.get (ParamKind::TrackNoteLength, track), 0, kNumStepDivisions - 1));

        const auto stepLength = std::clamp (
            parameters_.get (ParamKind::TrackStepLength, track), 1, kStepsPerVariation);

        const auto chainLength = std::clamp (pattern.track (track).chainLength,
                                             1, kNumVariations);

        const auto steps = static_cast<double> (stepLength) * chainLength;

        longest = std::max (longest, steps * quarterNotesPerStep (division));
    }

    // A pattern with nothing set still has to have a length, or a chain would never advance.
    return longest > 0.0 ? longest : static_cast<double> (kStepsPerVariation) * 0.25;
}

int Engine::samplesUntilChainAdvance (int numSamples) const noexcept
{
    if (patternChain_.empty() || ! transport_.isPlaying())
        return numSamples;

    const auto length = patternLengthQuarterNotes();

    if (length <= 0.0)
        return numSamples;

    const auto remaining = (patternStartPpq_ + length - transport_.blockStartPpq())
                         * transport_.samplesPerQuarterNote();

    // Already due, or so close that a block of one sample would still overshoot: let the block
    // run and `advanceChainIfDue` will switch at its start.
    if (remaining <= 0.0)
        return numSamples;

    return std::max (1, std::min (numSamples, static_cast<int> (std::ceil (remaining))));
}

void Engine::advanceChainIfDue()
{
    if (patternChain_.empty() || ! transport_.isPlaying())
        return;

    const auto length = patternLengthQuarterNotes();

    if (length <= 0.0)
        return;

    // Compared against the block's start, so the switch lands on a block boundary the same way a
    // manual pattern change does — `selectPattern` already defers to the next block.
    if (transport_.blockStartPpq() < patternStartPpq_ + length)
        return;

    patternStartPpq_ += length;

    if (++chainPosition_ >= static_cast<int> (patternChain_.size()))
        chainPosition_ = 0;

    selectPattern (patternChain_[static_cast<std::size_t> (chainPosition_)]);
}

int Engine::playheadStep (int track) const noexcept
{
    if (track < 0 || track >= kNumTracks)
        return 0;

    return sequencers_[static_cast<std::size_t> (track)].playheadStep();
}

//==============================================================================

void Engine::selectSound (int track, int choice)
{
    const auto menu = factory::soundMenu (track);

    if (choice < 0 || choice >= static_cast<int> (menu.size()))
        return;

    const auto& entry = menu[static_cast<std::size_t> (choice)];

    parameters_.set (ParamKind::TrackSoundBank, track, static_cast<int> (entry.bank));
    parameters_.set (ParamKind::TrackSound, track, entry.sound);
}

void Engine::applyPreset (int index)
{
    factory::applyPreset (*this, index);
}

int Engine::selectedSound (int track) const
{
    if (track < 0 || track >= kNumTracks)
        return -1;

    return factory::menuIndexFor (track,
                                  static_cast<SoundBank> (
                                      parameters_.get (ParamKind::TrackSoundBank, track)),
                                  parameters_.get (ParamKind::TrackSound, track));
}

//==============================================================================

void Engine::syncFromParameters()
{
    const auto tempo = static_cast<double> (parameters_.get (ParamKind::Tempo));

    transport_.setTempo (tempo);
    groove_.setTempo (tempo);
    groove_.setModel (static_cast<FeelModel> (
        std::clamp (parameters_.get (ParamKind::Feel), 0, kNumFeelModels - 1)));

    // FEEL has no depth control on the hardware — the model itself carries the amount — so the
    // engine runs it at full depth and leaves depth as an internal scaling hook.
    groove_.setDepth (1.0f);

    for (auto& slot : voices_)
        for (auto* voice : { slot.sampler.get(), slot.synth.get(), slot.wavetable.get() })
            if (voice != nullptr)
                voice->setTempo (tempo);

    // Sampling settings. The bank parameter indexes S2/S4/S8 rather than naming a SoundBank, so
    // that the A/B/C keys map to 0/1/2 the way the device presents them (p. 81).
    static constexpr SoundBank kSampleBanks[] = { SoundBank::S2, SoundBank::S4, SoundBank::S8 };

    const auto bankIndex = std::clamp (parameters_.get (ParamKind::SamplerBank), 0, 2);

    sampler_.setBank (kSampleBanks[bankIndex]);
    sampler_.setSource (parameters_.get (ParamKind::SamplerSource) == 0 ? SampleSource::LineIn
                                                                       : SampleSource::Usb);
    sampler_.setInputGain (parameters_.get (ParamKind::SamplerInputGain));
    sampler_.setAutoRecordThreshold (parameters_.get (ParamKind::SamplerAutoRecord));
    sampler_.setTempo (tempo);
}

bool Engine::trackAudible (int track) const noexcept
{
    if (solo_ >= 0)
        return track == solo_;

    if (parameters_.get (ParamKind::TrackMute, track) == 0)
        return true;

    // MUTE.MD (p. 103). SOUND mutes the track outright. SEQ mutes only the notes in the track's
    // sequencer — "playback via the keyboard or external MIDI notes remains possible" — so the
    // track stays audible and it is the sequenced triggers that are dropped instead.
    return parameters_.get (ParamKind::MuteMode) == static_cast<int> (MuteMode::Sequencer);
}

bool Engine::sequencerMuted (int track) const noexcept
{
    // Solo is a sound-level decision and `trackAudible` already handles it; this only asks
    // whether *sequenced* notes should be suppressed for an otherwise audible track.
    if (solo_ >= 0)
        return false;

    return parameters_.get (ParamKind::TrackMute, track) != 0
        && parameters_.get (ParamKind::MuteMode) == static_cast<int> (MuteMode::Sequencer);
}

//==============================================================================

void Engine::renderTrack (int track, int numSamples)
{
    const auto t = static_cast<std::size_t> (track);

    auto* left = trackLeft_[t].data();
    auto* right = trackRight_[t].data();

    std::fill_n (left, numSamples, 0.0f);
    std::fill_n (right, numSamples, 0.0f);

    auto& slot = voices_[t];
    auto& events = trackEvents_[t];

    // Choke points from the partner track, merged into this track's timeline so the hat that
    // was triggered last wins (p. 66).
    const auto partner = chokePartner (track);

    struct Action { double offset; const TriggerEvent* event; };
    std::vector<Action> actions;
    actions.reserve (events.size() + 4);

    for (const auto& event : events)
        actions.push_back ({ event.sampleOffset, &event });

    if (partner >= 0)
        for (const auto& event : trackEvents_[static_cast<std::size_t> (partner)])
            actions.push_back ({ event.sampleOffset, nullptr });

    std::sort (actions.begin(), actions.end(),
               [] (const Action& a, const Action& b) { return a.offset < b.offset; });

    int cursor = 0;

    const auto renderTo = [&] (int target)
    {
        if (target <= cursor)
            return;

        for (auto* voice : { slot.sampler.get(), slot.synth.get(), slot.wavetable.get() })
            if (voice != nullptr)
                voice->render (left + cursor, right + cursor, target - cursor);

        cursor = target;
    };

    for (const auto& action : actions)
    {
        // Snap to a whole sample first. The offset is a difference of musical positions scaled
        // by samples-per-quarter, so a trigger meant to land exactly on a sample can come out a
        // few ulps above it — and bare ceil() would then push it a whole sample late, but only
        // for the block sizes where the arithmetic rounds that way.
        constexpr double kSampleEpsilon = 1.0e-6;

        const auto nearest = std::round (action.offset);
        const auto offset = std::abs (action.offset - nearest) < kSampleEpsilon
                          ? nearest : action.offset;

        auto start = static_cast<int> (std::ceil (offset));
        start = std::clamp (start, 0, numSamples);

        renderTo (start);

        if (action.event == nullptr)
        {
            // A partner trigger: choke whatever this track is playing.
            for (auto* voice : { slot.sampler.get(), slot.synth.get(), slot.wavetable.get() })
                if (voice != nullptr)
                    voice->choke();

            continue;
        }

        const auto elapsed = std::clamp (
            static_cast<float> (static_cast<double> (start) - offset), 0.0f, 1.0f);

        const ParamView view { &parameters_, track, action.event->locks };

        if (auto* voice = voiceFor (track, action.event->bank))
            voice->trigger (*action.event, view, elapsed);

        activeLocks_[t] = action.event->locks;
    }

    renderTo (numSamples);
}

void Engine::mixTrack (int track, int numSamples)
{
    const auto t = static_cast<std::size_t> (track);

    if (! trackAudible (track))
        return;

    // Continuous parameters read through the current step's locks, so a locked level, pan or
    // filter holds for the whole step.
    const ParamView view { &parameters_, track, activeLocks_[t] };

    const auto bank = view.enumValue<SoundBank> (ParamKind::TrackSoundBank);

    // TONE is the track filter only on the banks where it is not something else (p. 62).
    const auto tone = toneIsFilter (bank)
                    ? curves::toneFilter (view (ParamKind::TrackTone))
                    : curves::ToneFilter { curves::ToneFilterMode::Bypassed, 0.0f };

    const auto filtering = tone.mode != curves::ToneFilterMode::Bypassed;

    if (filtering)
    {
        const auto mode = tone.mode == curves::ToneFilterMode::LowPass
                        ? dsp::StateVariableFilter::Mode::LowPass
                        : dsp::StateVariableFilter::Mode::HighPass;

        for (auto* filter : { &filterLeft_[t], &filterRight_[t] })
        {
            filter->setMode (mode);
            filter->setCutoff (tone.cutoffHz);
            filter->setResonance (0.0f);
        }
    }

    // The bass track has its own level knob; every other track uses the shared one.
    const auto level = track == kBassTrack ? 1.0f
                                           : curves::levelGain (view (ParamKind::TrackLevel));

    const auto pan = curves::panGains (view (ParamKind::TrackPan));

    const auto reverbSend = curves::sendAmount (view (ParamKind::TrackReverbSend));
    const auto delaySend = curves::sendAmount (view (ParamKind::TrackDelaySend));

    // The isolator covers the drum tracks, and the loop track only when ISO+LP is on (p. 71).
    const auto throughIsolator = track < kLoopTrack
                              || (track == kLoopTrack
                                  && parameters_.get (ParamKind::IsolatorOnLoop) != 0);

    auto& bus = throughIsolator ? drumBus_ : directBus_;

    const auto* sourceLeft = trackLeft_[t].data();
    const auto* sourceRight = trackRight_[t].data();

    for (int i = 0; i < numSamples; ++i)
    {
        auto l = sourceLeft[i];
        auto r = sourceRight[i];

        if (filtering)
        {
            l = filterLeft_[t].process (l);
            r = filterRight_[t].process (r);
        }

        l *= level * pan.left;
        r *= level * pan.right;

        bus.left[static_cast<std::size_t> (i)] += l;
        bus.right[static_cast<std::size_t> (i)] += r;

        // Sends are taken post-fader and post-pan, so riding a track's level takes its
        // reverb and delay with it.
        if (reverbSend > 0.0f)
        {
            reverbSend_.left[static_cast<std::size_t> (i)] += l * reverbSend;
            reverbSend_.right[static_cast<std::size_t> (i)] += r * reverbSend;
        }

        if (delaySend > 0.0f)
        {
            delaySend_.left[static_cast<std::size_t> (i)] += l * delaySend;
            delaySend_.right[static_cast<std::size_t> (i)] += r * delaySend;
        }
    }
}

//==============================================================================

float Engine::delayTimeMs() const noexcept
{
    const auto raw = parameters_.get (ParamKind::DelayTime);
    const auto tempo = static_cast<double> (parameters_.get (ParamKind::Tempo));
    const auto quarterMs = 60000.0 / std::max (1.0, tempo);

    if (parameters_.get (ParamKind::DelaySync) != 0)
    {
        // Snapped to a musical division. A tape echo locked to the grid is most of what makes
        // a dub delay sit inside a pattern rather than smear across it.
        //
        // The manual does not list the sync divisions, so this set is chosen. It includes the
        // dotted eighth, which is the classic dub delay and would be conspicuous by its
        // absence. See docs/PARAMETERS.md.
        static constexpr double kDivisions[] = {
            0.125,        // 1/32
            1.0 / 6.0,    // 1/16T
            0.25,         // 1/16
            1.0 / 3.0,    // 1/8T
            0.5,          // 1/8
            2.0 / 3.0,    // 1/4T
            0.75,         // 1/8 dotted
            1.0,          // 1/4
            1.5,          // 1/4 dotted
            2.0,          // 1/2
            4.0           // 1/1
        };

        constexpr auto count = static_cast<int> (std::size (kDivisions));
        const auto index = std::clamp (raw * count / (kRawMax + 1), 0, count - 1);

        return static_cast<float> (kDivisions[index] * quarterMs);
    }

    return curves::timeMs (raw, 20.0f, 1500.0f);
}

void Engine::mixExternalInput (const float* inputLeft, const float* inputRight, int numSamples)
{
    if (inputLeft == nullptr)
        return;

    // The sampler sees the input before any of the mix gains, because its own level control is a
    // separate one — the TEMPO knob in sampling mode (p. 81) — and its meter has to show what is
    // about to be recorded, not what is being monitored.
    sampler_.processInput (inputLeft, inputRight, numSamples);

    // LINE and USB are separate inputs with their own gain and sends (p. 85). Which one is
    // physically connected is outside the engine's knowledge, so both are mixed; a disconnected
    // input is silence, and both default to a gain of zero so nothing arrives unasked.
    struct InputStrip { ParamKind gain, reverb, delay; };

    static constexpr InputStrip strips[] = {
        { ParamKind::ExtInLineGain, ParamKind::ExtInLineReverbSend, ParamKind::ExtInLineDelaySend },
        { ParamKind::ExtInUsbGain,  ParamKind::ExtInUsbReverbSend,  ParamKind::ExtInUsbDelaySend  }
    };

    for (const auto& strip : strips)
    {
        const auto gain = curves::levelGain (parameters_.get (strip.gain));

        if (gain <= 0.0f)
            continue;

        const auto reverbSend = curves::sendAmount (parameters_.get (strip.reverb));
        const auto delaySend = curves::sendAmount (parameters_.get (strip.delay));

        for (int i = 0; i < numSamples; ++i)
        {
            const auto l = inputLeft[i] * gain;
            const auto r = (inputRight != nullptr ? inputRight[i] : inputLeft[i]) * gain;

            // External input joins the direct bus, not the drum bus: the isolator is a drum-track
            // effect (p. 71), and ducking keys off the drums so routing input through the drum
            // bus would make it trigger its own gain reduction.
            directBus_.left[static_cast<std::size_t> (i)] += l;
            directBus_.right[static_cast<std::size_t> (i)] += r;

            if (reverbSend > 0.0f)
            {
                reverbSend_.left[static_cast<std::size_t> (i)] += l * reverbSend;
                reverbSend_.right[static_cast<std::size_t> (i)] += r * reverbSend;
            }

            if (delaySend > 0.0f)
            {
                delaySend_.left[static_cast<std::size_t> (i)] += l * delaySend;
                delaySend_.right[static_cast<std::size_t> (i)] += r * delaySend;
            }
        }
    }
}

void Engine::mixBusesToOutput (float* left, float* right, int numSamples)
{
    // ---- isolator, on the drum bus only -------------------------------------
    isolator_.setBands (parameters_.get (ParamKind::IsolatorLow),
                        parameters_.get (ParamKind::IsolatorMid),
                        parameters_.get (ParamKind::IsolatorHigh));

    isolator_.process (drumBus_.left.data(), drumBus_.right.data(), numSamples);

    // ---- delay, which can feed the reverb ------------------------------------
    delay_.setFeedback (parameters_.get (ParamKind::DelayFeedback));
    delay_.setPingPong (parameters_.get (ParamKind::DelayPingPong) != 0);
    delay_.setDelayMs (delayTimeMs());

    const auto delayMix = curves::sendAmount (parameters_.get (ParamKind::DelayMix));
    const auto delayToReverb = curves::sendAmount (parameters_.get (ParamKind::DelayToReverb));

    delay_.process (delaySend_.left.data(), delaySend_.right.data(),
                    directBus_.left.data(), directBus_.right.data(),
                    reverbSend_.left.data(), reverbSend_.right.data(),
                    numSamples, delayMix, delayToReverb);

    // ---- reverb --------------------------------------------------------------
    reverb_.setType (static_cast<ReverbType> (
        std::clamp (parameters_.get (ParamKind::ReverbType), 0, 2)));

    const auto reverbMix = curves::sendAmount (parameters_.get (ParamKind::ReverbMix));

    reverb_.process (reverbSend_.left.data(), reverbSend_.right.data(),
                     directBus_.left.data(), directBus_.right.data(),
                     numSamples, reverbMix);

    // ---- sum, then the master effect -----------------------------------------
    for (int i = 0; i < numSamples; ++i)
    {
        left[i] = drumBus_.left[static_cast<std::size_t> (i)]
                + directBus_.left[static_cast<std::size_t> (i)];
        right[i] = drumBus_.right[static_cast<std::size_t> (i)]
                 + directBus_.right[static_cast<std::size_t> (i)];
    }

    masterFx_.setType (static_cast<MasterFxType> (
        std::clamp (parameters_.get (ParamKind::MasterFxType), 0, kNumMasterFxTypes - 1)));
    masterFx_.setAmount (parameters_.get (ParamKind::MasterFxAmount));
    masterFx_.setTempo (static_cast<double> (parameters_.get (ParamKind::Tempo)));
    masterFx_.setEnabled (parameters_.get (ParamKind::MasterFxEnabled) != 0);

    // Ducking keys off the drum bus, not off the mix it is compressing.
    masterFx_.process (left, right, drumBus_.left.data(), drumBus_.right.data(), numSamples);

    const auto gain = curves::levelGain (parameters_.get (ParamKind::PatternLevel))
                    * curves::levelGain (parameters_.get (ParamKind::MasterVolume));

    for (int i = 0; i < numSamples; ++i)
    {
        left[i] *= gain;
        right[i] *= gain;
    }
}

//==============================================================================

void Engine::process (float* left, float* right, int numSamples)
{
    process (left, right, nullptr, nullptr, numSamples);
}

void Engine::process (float* left, float* right,
                      const float* inputLeft, const float* inputRight, int numSamples)
{
    if (numSamples <= 0)
        return;

    // Split anything larger than the prepared maximum rather than truncating it. Truncating
    // filled only the first `maxBlockSize_` frames and left the rest of the caller's buffer
    // untouched — in a plugin that is whatever the host happened to leave there, played as audio.
    for (int offset = 0; offset < numSamples;)
    {
        auto count = std::min (numSamples - offset, maxBlockSize_);

        // Split at a chain boundary so the pattern switch is sample-accurate rather than landing
        // wherever the host's buffer happens to end.
        count = samplesUntilChainAdvance (count);

        processBlock (left + offset, right + offset,
                      inputLeft != nullptr ? inputLeft + offset : nullptr,
                      inputRight != nullptr ? inputRight + offset : nullptr,
                      count);

        offset += count;
    }
}

void Engine::processBlock (float* left, float* right,
                           const float* inputLeft, const float* inputRight, int numSamples)
{
    std::fill_n (left, numSamples, 0.0f);
    std::fill_n (right, numSamples, 0.0f);

    advanceChainIfDue();

    if (pendingPatternIndex_ != patternIndex_)
    {
        patternIndex_ = pendingPatternIndex_;
        rebindSequencers();
        activeLocks_.fill (nullptr);

        // Selecting a pattern restores its settings, which is what makes a pattern a pattern
        // rather than just a set of steps. With TEMPO on GLOBAL the tempo stays put (p. 113).
        const auto followsPattern = parameters_.get (ParamKind::TempoSource) == 0;

        patterns_.recall (patternIndex_, parameters_, followsPattern);
    }

    syncFromParameters();
    transport_.beginBlock (numSamples);

    // Collect every track's triggers before rendering any of them, so choke can see a partner
    // track's hits that land later in the same block.
    for (int track = 0; track < kNumTracks; ++track)
    {
        auto& events = trackEvents_[static_cast<std::size_t> (track)];
        events.clear();

        sequencers_[static_cast<std::size_t> (track)]
            .collectEvents (transport_, groove_, parameters_, events);

        // In SEQ mute mode the track still sounds, but nothing its sequencer produced reaches a
        // voice. Dropping the events here rather than silencing the track is what leaves the
        // keyboard and incoming MIDI free to play it (p. 103).
        if (sequencerMuted (track))
            events.clear();

        // Drift can reorder triggers relative to the order their steps were consumed in.
        std::sort (events.begin(), events.end(),
                   [] (const TriggerEvent& a, const TriggerEvent& b)
                   { return a.sampleOffset < b.sampleOffset; });
    }

    for (auto* bus : { &drumBus_, &directBus_, &reverbSend_, &delaySend_ })
        bus->clear (numSamples);

    for (int track = 0; track < kNumTracks; ++track)
    {
        renderTrack (track, numSamples);
        mixTrack (track, numSamples);
    }

    mixExternalInput (inputLeft, inputRight, numSamples);

    mixBusesToOutput (left, right, numSamples);

    transport_.endBlock();
}

} // namespace bud
