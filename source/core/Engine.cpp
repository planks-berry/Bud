#include "Engine.h"

#include "factory/FactoryContent.h"
#include "voices/BassVoice.h"
#include "voices/DrumVoices.h"
#include "voices/SampleVoices.h"

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
    }
}

Voice* Engine::voiceFor (int track, SoundBank bank) noexcept
{
    auto& slot = voices_[static_cast<std::size_t> (track)];

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

    for (int track = 0; track < kNumTracks; ++track)
    {
        const auto t = static_cast<std::size_t> (track);

        trackLeft_[t].assign (static_cast<std::size_t> (maxBlockSize_), 0.0f);
        trackRight_[t].assign (static_cast<std::size_t> (maxBlockSize_), 0.0f);
        trackEvents_[t].reserve (64);

        filterLeft_[t].prepare (sampleRate_);
        filterRight_[t].prepare (sampleRate_);

        for (auto* voice : { voices_[t].sampler.get(), voices_[t].synth.get() })
        {
            if (voice == nullptr)
                continue;

            voice->prepare (sampleRate_);
            voice->setLibrary (&sounds_);
        }
    }

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

        for (auto* voice : { voices_[t].sampler.get(), voices_[t].synth.get() })
            if (voice != nullptr)
                voice->reset();

        filterLeft_[t].reset();
        filterRight_[t].reset();
    }
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

        for (auto* voice : { voices_[t].sampler.get(), voices_[t].synth.get() })
            if (voice != nullptr)
                voice->reset();

        filterLeft_[t].reset();
        filterRight_[t].reset();
    }

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

int Engine::playheadStep (int track) const noexcept
{
    if (track < 0 || track >= kNumTracks)
        return 0;

    return sequencers_[static_cast<std::size_t> (track)].playheadStep();
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
        for (auto* voice : { slot.sampler.get(), slot.synth.get() })
            if (voice != nullptr)
                voice->setTempo (tempo);
}

bool Engine::trackAudible (int track) const noexcept
{
    if (solo_ >= 0)
        return track == solo_;

    return parameters_.get (ParamKind::TrackMute, track) == 0;
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

        for (auto* voice : { slot.sampler.get(), slot.synth.get() })
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
            for (auto* voice : { slot.sampler.get(), slot.synth.get() })
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

void Engine::mixTrack (int track, float* left, float* right, int numSamples)
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

        left[i] += l * level * pan.left;
        right[i] += r * level * pan.right;
    }
}

//==============================================================================

void Engine::process (float* left, float* right, int numSamples)
{
    if (numSamples <= 0)
        return;

    numSamples = std::min (numSamples, maxBlockSize_);

    std::fill_n (left, numSamples, 0.0f);
    std::fill_n (right, numSamples, 0.0f);

    if (pendingPatternIndex_ != patternIndex_)
    {
        patternIndex_ = pendingPatternIndex_;
        rebindSequencers();
        activeLocks_.fill (nullptr);
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

        // Drift can reorder triggers relative to the order their steps were consumed in.
        std::sort (events.begin(), events.end(),
                   [] (const TriggerEvent& a, const TriggerEvent& b)
                   { return a.sampleOffset < b.sampleOffset; });
    }

    for (int track = 0; track < kNumTracks; ++track)
    {
        renderTrack (track, numSamples);
        mixTrack (track, left, right, numSamples);
    }

    transport_.endBlock();

    const auto patternLevel = curves::levelGain (parameters_.get (ParamKind::PatternLevel));
    const auto masterLevel = curves::levelGain (parameters_.get (ParamKind::MasterVolume));
    const auto gain = patternLevel * masterLevel;

    for (int i = 0; i < numSamples; ++i)
    {
        left[i] *= gain;
        right[i] *= gain;
    }
}

} // namespace bud
