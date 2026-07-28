#include "Engine.h"

#include "voices/BassVoice.h"
#include "voices/DrumVoices.h"
#include "voices/SampleVoices.h"

#include <algorithm>
#include <cmath>

namespace bud
{

Engine::Engine()
{
    for (int track = 0; track < kNumTracks; ++track)
    {
        voices_[static_cast<std::size_t> (track)] = makeVoice (trackInfo (track).voice);
        sequencers_[static_cast<std::size_t> (track)].prepare (track);
    }

    rebindSequencers();
}

Engine::~Engine() = default;

std::unique_ptr<Voice> Engine::makeVoice (VoiceKind kind) const
{
    switch (kind)
    {
        case VoiceKind::KickSynth:  return std::make_unique<KickVoice>();
        case VoiceKind::SnareSynth: return std::make_unique<SnareVoice>();
        case VoiceKind::HiHat:      return std::make_unique<HiHatVoice>();
        case VoiceKind::Sample:     return std::make_unique<SampleVoice>();
        case VoiceKind::Loop:       return std::make_unique<LoopVoice>();
        case VoiceKind::BassSynth:  return std::make_unique<BassVoice>();
    }

    return nullptr;
}

//==============================================================================

void Engine::prepare (double sampleRate, int maxBlockSize)
{
    sampleRate_ = std::max (1.0, sampleRate);
    maxBlockSize_ = std::max (1, maxBlockSize);

    transport_.prepare (sampleRate_);

    for (int track = 0; track < kNumTracks; ++track)
    {
        const auto t = static_cast<std::size_t> (track);

        trackLeft_[t].assign (static_cast<std::size_t> (maxBlockSize_), 0.0f);
        trackRight_[t].assign (static_cast<std::size_t> (maxBlockSize_), 0.0f);
        trackEvents_[t].reserve (64);

        filterLeft_[t].prepare (sampleRate_);
        filterRight_[t].prepare (sampleRate_);

        if (voices_[t] != nullptr)
            voices_[t]->prepare (sampleRate_);

        if (auto* sampler = dynamic_cast<SampleVoice*> (voices_[t].get()))
            sampler->setLibrary (&samples_);

        if (auto* loop = dynamic_cast<LoopVoice*> (voices_[t].get()))
            loop->setLibrary (&samples_);
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

        if (voices_[t] != nullptr)
            voices_[t]->reset();

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

        if (voices_[t] != nullptr)
            voices_[t]->reset();

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
        std::clamp (static_cast<int> (parameters_.get (ParamKind::Feel) + 0.5f),
                    0, kNumFeelModels - 1)));
    groove_.setDepth (parameters_.get (ParamKind::FeelDepth));

    const auto tempoForVoices = tempo;

    for (auto& voice : voices_)
    {
        if (auto* sampler = dynamic_cast<SampleVoice*> (voice.get()))
            sampler->setTempo (tempoForVoices);

        if (auto* loop = dynamic_cast<LoopVoice*> (voice.get()))
            loop->setTempo (tempoForVoices);
    }
}

bool Engine::trackAudible (int track) const noexcept
{
    if (solo_ >= 0)
        return track == solo_;

    if (parameters_.get (ParamKind::TrackMute, track) >= 0.5f)
        return false;

    return ! patterns_.pattern (patternIndex_).track (track).muted;
}

//==============================================================================

void Engine::renderTrack (int track, int numSamples)
{
    const auto t = static_cast<std::size_t> (track);

    auto* left = trackLeft_[t].data();
    auto* right = trackRight_[t].data();

    std::fill_n (left, numSamples, 0.0f);
    std::fill_n (right, numSamples, 0.0f);

    auto& voice = voices_[t];

    if (voice == nullptr)
        return;

    auto& events = trackEvents_[t];
    events.clear();

    const auto globalSwing = parameters_.get (ParamKind::GlobalSwing) * 0.01f;
    sequencers_[t].collectEvents (transport_, groove_, globalSwing, events);

    // Drift can reorder triggers relative to the order their steps were consumed in.
    std::sort (events.begin(), events.end(),
               [] (const TriggerEvent& a, const TriggerEvent& b)
               { return a.sampleOffset < b.sampleOffset; });

    int cursor = 0;

    for (const auto& event : events)
    {
        // Start on the next whole sample and tell the voice how much of the step had already
        // elapsed by then, so the onset is placed inside the sample rather than snapped to it.
        //
        // `start` is allowed to reach numSamples. A trigger landing in the final fractional
        // sample of a block then produces its first output at the top of the *next* block,
        // with the elapsed time carried across — which is what makes the rendered audio
        // identical no matter what block size the host chooses. Clamping to numSamples - 1
        // instead would pull those triggers a fraction of a sample earlier, and only for
        // some block sizes.
        // Snap to a whole sample first. The offset is computed as a difference of musical
        // positions scaled by samples-per-quarter, so a trigger meant to land exactly on a
        // sample can come out a few ulps above it — and bare ceil() would then push it a
        // whole sample late, but only for the block sizes where the arithmetic rounds that
        // way. That showed up as the same pattern rendering differently per block size.
        constexpr double kSampleEpsilon = 1.0e-6;

        const auto nearest = std::round (event.sampleOffset);
        const auto offset = std::abs (event.sampleOffset - nearest) < kSampleEpsilon
                          ? nearest
                          : event.sampleOffset;

        auto start = static_cast<int> (std::ceil (offset));
        start = std::clamp (start, 0, numSamples);

        const auto elapsed = std::clamp (
            static_cast<float> (static_cast<double> (start) - offset), 0.0f, 1.0f);

        if (start > cursor)
        {
            voice->render (left + cursor, right + cursor, start - cursor);
            cursor = start;
        }

        const ParamView view { &parameters_, track, event.locks };
        voice->trigger (event, view, elapsed);

        activeLocks_[t] = event.locks;
    }

    if (cursor < numSamples)
        voice->render (left + cursor, right + cursor, numSamples - cursor);
}

void Engine::mixTrack (int track, float* left, float* right, int numSamples)
{
    const auto t = static_cast<std::size_t> (track);

    if (! trackAudible (track))
        return;

    // Continuous parameters read through the current step's locks, so a locked filter or
    // level holds for the whole step.
    const ParamView view { &parameters_, track, activeLocks_[t] };

    const auto cutoff = view (ParamKind::TrackEqFreq);
    const auto resonance = view (ParamKind::TrackEqRes);
    const auto level = view (ParamKind::TrackLevel);

    filterLeft_[t].setCutoff (cutoff);
    filterLeft_[t].setResonance (resonance);
    filterRight_[t].setCutoff (cutoff);
    filterRight_[t].setResonance (resonance);

    const auto* sourceLeft = trackLeft_[t].data();
    const auto* sourceRight = trackRight_[t].data();

    for (int i = 0; i < numSamples; ++i)
    {
        left[i] += filterLeft_[t].process (sourceLeft[i]) * level;
        right[i] += filterRight_[t].process (sourceRight[i]) * level;
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

    for (int track = 0; track < kNumTracks; ++track)
    {
        renderTrack (track, numSamples);
        mixTrack (track, left, right, numSamples);
    }

    transport_.endBlock();

    const auto masterVolume = parameters_.get (ParamKind::MasterVolume);

    for (int i = 0; i < numSamples; ++i)
    {
        left[i] *= masterVolume;
        right[i] *= masterVolume;
    }
}

} // namespace bud
