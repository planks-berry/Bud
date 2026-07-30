#include "TestFramework.h"

#include "core/Engine.h"
#include "core/factory/FactoryContent.h"

#include <algorithm>
#include <cmath>
#include <vector>

using namespace bud;

namespace
{

constexpr double kSampleRate = 48000.0;
constexpr int kTempo = 120;
constexpr double kSamplesPerSixteenth = 6000.0;   // at 120 bpm / 48 kHz

struct Rendered
{
    std::vector<float> left;
    std::vector<float> right;

    int size() const { return static_cast<int> (left.size()); }

    float peak() const
    {
        float p = 0.0f;
        for (std::size_t i = 0; i < left.size(); ++i)
            p = std::max (p, std::max (std::abs (left[i]), std::abs (right[i])));
        return p;
    }

    float peakRight() const
    {
        float p = 0.0f;
        for (auto v : right)
            p = std::max (p, std::abs (v));
        return p;
    }

    float peakLeft() const
    {
        float p = 0.0f;
        for (auto v : left)
            p = std::max (p, std::abs (v));
        return p;
    }

    bool allFinite() const
    {
        for (std::size_t i = 0; i < left.size(); ++i)
            if (! std::isfinite (left[i]) || ! std::isfinite (right[i]))
                return false;
        return true;
    }

    double energyFrom (std::size_t start) const
    {
        double sum = 0.0;
        for (std::size_t i = start; i < left.size(); ++i)
            sum += static_cast<double> (left[i]) * left[i];
        return sum;
    }

    /// First sample whose magnitude crosses a threshold.
    int firstCrossing (float threshold) const
    {
        for (std::size_t i = 0; i < left.size(); ++i)
            if (std::abs (left[i]) > threshold)
                return static_cast<int> (i);
        return -1;
    }
};

Rendered render (Engine& engine, int totalSamples, int blockSize)
{
    Rendered out;
    out.left.assign (static_cast<std::size_t> (totalSamples), 0.0f);
    out.right.assign (static_cast<std::size_t> (totalSamples), 0.0f);

    engine.start();

    for (int position = 0; position < totalSamples; position += blockSize)
    {
        const auto count = std::min (blockSize, totalSamples - position);
        engine.process (out.left.data() + position, out.right.data() + position, count);
    }

    return out;
}

/// An engine with one gated kick on step 0 of track 1.
void setUpSingleKick (Engine& engine, int blockSize = 512)
{
    engine.prepare (kSampleRate, blockSize);
    engine.parameters().set (ParamKind::Tempo, kTempo);
    engine.parameters().set (ParamKind::Feel, static_cast<int> (FeelModel::M909));

    engine.currentPattern().track (0).variation (Variation::A)[0].gate = true;
}

void gateEveryQuarter (TrackPattern& track)
{
    for (int step : { 0, 4, 8, 12 })
        track.variation (Variation::A)[static_cast<std::size_t> (step)].gate = true;
}

} // namespace

//==============================================================================

BUD_TEST (Engine, rendersSilenceWhileStopped)
{
    Engine engine;
    setUpSingleKick (engine);

    Rendered out;
    out.left.assign (4096, 0.0f);
    out.right.assign (4096, 0.0f);

    engine.process (out.left.data(), out.right.data(), 4096);

    CHECK_EQ (out.peak(), 0.0f);
}

BUD_TEST (Engine, rendersAudioWhenPlaying)
{
    Engine engine;
    setUpSingleKick (engine);

    const auto out = render (engine, 24000, 512);

    CHECK (out.allFinite());
    CHECK (out.peak() > 0.1f);
    CHECK (out.peak() <= 1.2f);
}

BUD_TEST (Engine, outputIsDeterministic)
{
    Engine a, b;
    setUpSingleKick (a);
    setUpSingleKick (b);

    const auto first = render (a, 24000, 512);
    const auto second = render (b, 24000, 512);

    for (int i = 0; i < first.size(); ++i)
        CHECK_EQ (first.left[static_cast<std::size_t> (i)],
                  second.left[static_cast<std::size_t> (i)]);
}

BUD_TEST (Engine, renderedAudioIsIdenticalAtEveryBlockSize)
{
    // The audio equivalent of the sequencer's block-size test, and a much stricter one: it
    // covers the trigger-to-sample mapping and every stateful filter in the signal path.
    const auto build = [] (int blockSize)
    {
        Engine engine;
        setUpSingleKick (engine, 8192);
        gateEveryQuarter (engine.currentPattern().track (4));   // hats, for high-frequency content
        gateEveryQuarter (engine.currentPattern().track (2));   // snare
        return render (engine, 96000, blockSize);
    };

    const auto reference = build (512);
    CHECK (reference.peak() > 0.1f);

    for (int blockSize : { 1, 7, 64, 333, 1024, 4096 })
    {
        const auto out = build (blockSize);

        // Exact equality, not a tolerance. The property is that the audio *is* the same, and a
        // tolerance here hid a real bug for two milestones: a per-block re-anchor in the
        // transport left an error of order 1e-7, small enough to pass a 1e-6 check and large
        // enough to flip a 16-bit sample on a rounded WAV.
        int differing = 0;
        for (int i = 0; i < reference.size(); ++i)
            if (out.left[static_cast<std::size_t> (i)] != reference.left[static_cast<std::size_t> (i)]
                || out.right[static_cast<std::size_t> (i)] != reference.right[static_cast<std::size_t> (i)])
                ++differing;

        CHECK_EQ (differing, 0);
    }
}

BUD_TEST (Engine, kickOnsetLandsOnTheExpectedSample)
{
    Engine engine;
    setUpSingleKick (engine);

    auto& kick = engine.currentPattern().track (0);
    kick.variation (Variation::A)[0].gate = false;
    kick.variation (Variation::A)[4].gate = true;

    const auto out = render (engine, 48000, 512);
    const auto onset = out.firstCrossing (0.02f);

    CHECK (onset >= 0);
    CHECK_NEAR (static_cast<double> (onset), 4.0 * kSamplesPerSixteenth, 64.0);
}

BUD_TEST (Engine, muteSilencesATrack)
{
    Engine engine;
    setUpSingleKick (engine);
    engine.parameters().set (ParamKind::TrackMute, 0, 1);

    CHECK_EQ (render (engine, 24000, 512).peak(), 0.0f);
}

BUD_TEST (Engine, soloIsolatesATrack)
{
    Engine engine;
    setUpSingleKick (engine, 512);
    gateEveryQuarter (engine.currentPattern().track (4));

    const auto both = render (engine, 48000, 512);

    Engine soloed;
    setUpSingleKick (soloed, 512);
    gateEveryQuarter (soloed.currentPattern().track (4));
    soloed.setSolo (4);

    const auto hatOnly = render (soloed, 48000, 512);

    CHECK (both.peak() > hatOnly.peak());
    CHECK (hatOnly.peak() > 0.0f);

    // Soloing overrides mute on the soloed track.
    soloed.parameters().set (ParamKind::TrackMute, 4, 1);
    CHECK (render (soloed, 48000, 512).peak() > 0.0f);
}

BUD_TEST (Engine, levelLawIsUnityAtTheDefault)
{
    Engine engine;
    setUpSingleKick (engine);
    engine.parameters().set (ParamKind::TrackLevel, 0, 100);
    const auto unity = render (engine, 24000, 512);

    Engine halved;
    setUpSingleKick (halved);
    halved.parameters().set (ParamKind::TrackLevel, 0, 50);
    const auto quieter = render (halved, 24000, 512);

    // 50 is a quarter of the amplitude under the square law.
    CHECK_NEAR (quieter.peak(), unity.peak() * 0.25f, 1.0e-3);
}

BUD_TEST (Engine, panPlacesTheTrackInTheStereoField)
{
    Engine engine;
    setUpSingleKick (engine);
    engine.parameters().set (ParamKind::TrackPan, 0, 0);   // hard left

    const auto left = render (engine, 24000, 512);
    CHECK (left.peakLeft() > 0.1f);
    CHECK_NEAR (left.peakRight(), 0.0f, 1.0e-4);

    Engine right;
    setUpSingleKick (right);
    right.parameters().set (ParamKind::TrackPan, 0, 127);   // hard right

    const auto out = render (right, 24000, 512);
    CHECK (out.peakRight() > 0.1f);
    CHECK_NEAR (out.peakLeft(), 0.0f, 1.0e-4);
}

BUD_TEST (Engine, toneFilterIsBypassedAtTheDetent)
{
    // On a sample-based bank TONE is the track filter; at the detent it must be out of circuit,
    // not parked at an extreme (p. 65).
    const auto renderWithTone = [] (int tone)
    {
        Engine engine;
        engine.prepare (kSampleRate, 512);
        engine.parameters().set (ParamKind::Tempo, kTempo);
        gateEveryQuarter (engine.currentPattern().track (4));
        engine.parameters().set (ParamKind::TrackTone, 4, tone);
        return render (engine, 48000, 512);
    };

    const auto neutral = renderWithTone (kRawCentre);
    const auto lowPassed = renderWithTone (10);
    const auto highPassed = renderWithTone (120);

    CHECK (neutral.peak() > 0.0f);

    // A hi-hat is mostly high frequency, so a heavy low-pass takes far more away than the
    // bypassed setting, and a heavy high-pass takes less.
    CHECK (lowPassed.peak() < neutral.peak());
    CHECK (highPassed.peak() < neutral.peak() * 1.5f);
}

BUD_TEST (Engine, chokeStopsTheOpenHat)
{
    // With choke on, tracks 5 and 6 do not overlap and the last trigger wins (p. 66).
    const auto tailEnergy = [] (bool choke)
    {
        Engine engine;
        engine.prepare (kSampleRate, 512);
        engine.parameters().set (ParamKind::Tempo, kTempo);
        engine.parameters().set (ParamKind::Feel, static_cast<int> (FeelModel::M909));

        // A long open hat on step 0, then a closed hat on step 1 to cut it off.
        engine.currentPattern().track (5).variation (Variation::A)[0].gate = true;
        engine.currentPattern().track (4).variation (Variation::A)[1].gate = true;

        engine.parameters().set (ParamKind::TrackSound, 5, 110);   // the open end of the bank
        engine.parameters().set (ParamKind::TrackDecay, 5, 127);
        engine.parameters().set (ParamKind::TrackChoke, 4, choke ? 1 : 0);
        engine.parameters().set (ParamKind::TrackChoke, 5, choke ? 1 : 0);

        const auto out = render (engine, 48000, 512);

        // Energy well after the closed hat has itself decayed.
        return out.energyFrom (static_cast<std::size_t> (kSamplesPerSixteenth * 2));
    };

    const auto open = tailEnergy (false);
    const auto choked = tailEnergy (true);

    CHECK (open > 0.0);
    CHECK (choked < open * 0.5);
}

BUD_TEST (Engine, parameterLockOverridesTheTrackValue)
{
    const auto tailEnergy = [] (bool locked)
    {
        Engine engine;
        engine.prepare (kSampleRate, 512);
        engine.parameters().set (ParamKind::Tempo, kTempo);
        engine.parameters().set (ParamKind::Feel, static_cast<int> (FeelModel::M909));

        auto& track = engine.currentPattern().track (4);
        track.variation (Variation::A)[0].gate = true;

        engine.parameters().set (ParamKind::TrackSound, 4, 110);
        engine.parameters().set (ParamKind::TrackDecay, 4, 10);

        if (locked)
            track.variation (Variation::A)[0].locks.set (
                makeParamId (ParamKind::TrackDecay, 4), 127);

        return render (engine, 48000, 512).energyFrom (8000);
    };

    CHECK (tailEnergy (true) > tailEnergy (false) * 4.0);
}

BUD_TEST (Engine, everyFactoryBankIsAudible)
{
    // The drum engine is sample-based, so a bank with no content is a silent track.
    for (int bankIndex = 0; bankIndex < kNumSoundBanks; ++bankIndex)
    {
        const auto bank = static_cast<SoundBank> (bankIndex);

        if (bankInfo (bank).isUserSample || bank == SoundBank::BASS)
            continue;

        Engine engine;
        engine.prepare (kSampleRate, 512);
        engine.parameters().set (ParamKind::Tempo, kTempo);

        // Track 7 is a plain sample track, so no synthesis engine intercepts the trigger.
        engine.currentPattern().track (6).variation (Variation::A)[0].gate = true;
        engine.parameters().set (ParamKind::TrackSoundBank, 6, bankIndex);
        engine.parameters().set (ParamKind::TrackSound, 6, 0);

        const auto out = render (engine, 48000, 512);

        CHECK (out.allFinite());
        CHECK (out.peak() > 0.01f);
    }
}

BUD_TEST (Engine, synthesisEnginesRunOnlyOnTracksOneAndThree)
{
    // BD on track 1 is synthesised; the same bank on track 2 plays a sample (p. 60). Both must
    // make sound, and they must not be the same sound.
    const auto renderBd = [] (int track)
    {
        Engine engine;
        engine.prepare (kSampleRate, 512);
        engine.parameters().set (ParamKind::Tempo, kTempo);
        engine.parameters().set (ParamKind::Feel, static_cast<int> (FeelModel::M909));
        engine.currentPattern().track (track).variation (Variation::A)[0].gate = true;
        engine.parameters().set (ParamKind::TrackSoundBank, track,
                                 static_cast<int> (SoundBank::BD));
        return render (engine, 24000, 512);
    };

    const auto synthesised = renderBd (0);
    const auto sampled = renderBd (1);

    CHECK (synthesised.peak() > 0.05f);
    CHECK (sampled.peak() > 0.05f);

    auto difference = 0.0f;
    for (int i = 0; i < synthesised.size(); ++i)
        difference = std::max (difference,
                               std::abs (synthesised.left[static_cast<std::size_t> (i)]
                                         - sampled.left[static_cast<std::size_t> (i)]));

    CHECK (difference > 0.01f);
}

BUD_TEST (Engine, bassVoiceRespondsToNotesAndGlide)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);
    engine.parameters().set (ParamKind::Tempo, kTempo);

    auto& steps = engine.currentPattern().track (kBassTrack).variation (Variation::A);
    steps[0].gate = true;
    steps[0].note = 0;
    steps[4].gate = true;
    steps[4].note = 12;
    steps[4].glide = true;

    const auto out = render (engine, 48000, 512);

    CHECK (out.allFinite());
    CHECK (out.peak() > 0.05f);
}

BUD_TEST (Engine, bassDriveIsGatedByItsSwitch)
{
    const auto renderDrive = [] (bool enabled)
    {
        Engine engine;
        engine.prepare (kSampleRate, 512);
        engine.parameters().set (ParamKind::Tempo, kTempo);
        engine.currentPattern().track (kBassTrack).variation (Variation::A)[0].gate = true;
        engine.parameters().set (ParamKind::BassDrive, kBassTrack, 127);
        engine.parameters().set (ParamKind::BassDriveEnabled, kBassTrack, enabled ? 1 : 0);
        return render (engine, 24000, 512);
    };

    const auto off = renderDrive (false);
    const auto on = renderDrive (true);

    // DRIVE is active only when BS DRV is on (p. 75), so the two must differ.
    auto difference = 0.0f;
    for (int i = 0; i < off.size(); ++i)
        difference = std::max (difference, std::abs (on.left[static_cast<std::size_t> (i)]
                                                     - off.left[static_cast<std::size_t> (i)]));

    CHECK (difference > 1.0e-3f);
}

BUD_TEST (Engine, everyTrackRendersWithoutBlowingUp)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);
    engine.parameters().set (ParamKind::Tempo, kTempo);

    // Give the user sample banks something to play too.
    for (auto bank : { SoundBank::S2, SoundBank::S4, SoundBank::S8 })
    {
        auto& slot = engine.sounds().userSlot (bank, 0);
        slot.sampleRate = kSampleRate;
        slot.left.assign (9600, 0.0f);

        for (std::size_t i = 0; i < slot.left.size(); ++i)
            slot.left[i] = 0.4f * std::sin (static_cast<float> (i) * 0.03f);

        if (userBankIsStereo (bank))
            slot.right = slot.left;
    }

    engine.parameters().set (ParamKind::TrackSoundBank, 6, static_cast<int> (SoundBank::S2));
    engine.parameters().set (ParamKind::TrackSoundBank, 7, static_cast<int> (SoundBank::S4));

    for (int track = 0; track < kNumTracks; ++track)
        gateEveryQuarter (engine.currentPattern().track (track));

    // Push the bass hard, where instability would show first.
    engine.parameters().set (ParamKind::BassResonance, kBassTrack, 127);
    engine.parameters().set (ParamKind::BassDriveEnabled, kBassTrack, 1);
    engine.parameters().set (ParamKind::BassDrive, kBassTrack, 127);
    engine.parameters().set (ParamKind::BassEnvDepth, kBassTrack, 127);

    const auto out = render (engine, 96000 * 2, 512);

    CHECK (out.allFinite());
    CHECK (out.peak() > 0.1f);
    CHECK (out.peak() < 8.0f);   // headroom before the isolator and master effects
}

BUD_TEST (Engine, patternSelectionSwitchesContent)
{
    Engine engine;
    setUpSingleKick (engine);

    engine.selectPattern (1);
    CHECK_EQ (render (engine, 24000, 512).peak(), 0.0f);
    CHECK_EQ (engine.patternIndex(), 1);

    engine.selectPattern (0);
    CHECK (render (engine, 24000, 512).peak() > 0.1f);
}

BUD_TEST (Engine, patternsAreAddressableByBankAndSlot)
{
    Engine engine;
    setUpSingleKick (engine);

    engine.patterns().pattern (2, 3).track (0).variation (Variation::A)[0].gate = true;
    engine.selectPattern (2, 3);

    // The switch takes effect at the next block rather than mid-step, so the index only
    // changes once something has been rendered.
    const auto out = render (engine, 24000, 512);

    CHECK_EQ (engine.patternIndex(), PatternBank::flatIndex (2, 3));
    CHECK (out.peak() > 0.1f);
}

//==============================================================================

BUD_TEST (Factory, generatesTheFullSoundSet)
{
    // 132 sounds across ten banks, matching the device (p. 116).
    CHECK_EQ (factory::totalSoundCount(), 132);

    SoundLibrary library;
    factory::generate (library, kSampleRate);

    int total = 0;

    for (int i = 0; i < kNumSoundBanks; ++i)
    {
        const auto bank = static_cast<SoundBank> (i);
        const auto expected = factory::soundCount (bank);

        CHECK_EQ (library.factory (bank).size(), static_cast<std::size_t> (expected));
        total += expected;

        for (const auto& sound : library.factory (bank))
        {
            CHECK (! sound.empty());
            CHECK_EQ (sound.sampleRate, kSampleRate);

            auto peak = 0.0f;
            for (auto v : sound.left)
            {
                CHECK (std::isfinite (v));
                peak = std::max (peak, std::abs (v));
            }

            CHECK (peak > 0.1f);
            CHECK (peak <= 1.0f);
        }
    }

    CHECK_EQ (total, 132);
}

BUD_TEST (Factory, generationIsDeterministic)
{
    // Golden-file DSP tests depend on this.
    SoundLibrary a, b;
    factory::generate (a, kSampleRate);
    factory::generate (b, kSampleRate);

    for (int i = 0; i < kNumSoundBanks; ++i)
    {
        const auto bank = static_cast<SoundBank> (i);
        const auto& left = a.factory (bank);
        const auto& right = b.factory (bank);

        CHECK_EQ (left.size(), right.size());

        for (std::size_t s = 0; s < left.size(); ++s)
            CHECK (left[s].left == right[s].left);
    }
}

BUD_TEST (Factory, banksSweepTheirCharacter)
{
    SoundLibrary library;
    factory::generate (library, kSampleRate);

    // The hi-hat bank runs from tight closed hats to long cymbals, so length must grow.
    const auto& hats = library.factory (SoundBank::HH_CY);
    CHECK (hats.size() > 4);
    CHECK (hats.back().length() > hats.front().length() * 3);

    // The tom bank sweeps low to high, so later sounds are shorter.
    const auto& toms = library.factory (SoundBank::TT);
    CHECK (toms.back().length() < toms.front().length());
}

BUD_TEST (Factory, userBanksAreNotTouchedByGeneration)
{
    SoundLibrary library;
    library.userSlot (SoundBank::S2, 0).left.assign (100, 0.5f);

    factory::generate (library, kSampleRate);

    CHECK_EQ (library.userSlot (SoundBank::S2, 0).length(), 100);
}
