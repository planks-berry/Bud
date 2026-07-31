#include "TestFramework.h"

#include "core/Engine.h"
#include "core/factory/FactoryContent.h"
#include "core/factory/SoundMenu.h"
#include "core/sampler/SampleBank.h"

#include <set>
#include <string>

using namespace bud;

namespace
{
    constexpr double kSampleRate = 48000.0;

    /// How different two sounds are, as the largest sample-by-sample difference over the shorter
    /// of the two. Zero means one is a prefix of the other, which for these is the same sound.
    float largestDifference (const SampleData& a, const SampleData& b)
    {
        if (a.length() != b.length())
            return 1.0f;

        auto worst = 0.0f;

        for (int i = 0; i < a.length(); ++i)
            worst = std::max (worst, std::abs (a.at (0, i) - b.at (0, i)));

        return worst;
    }
}

//==============================================================================

BUD_TEST (SoundMenu, everyTrackOffersFiveNamedSounds)
{
    for (int track = 0; track < kNumTracks; ++track)
    {
        const auto menu = factory::soundMenu (track);

        CHECK_EQ (static_cast<int> (menu.size()), factory::kSoundsPerTrack);

        std::set<std::string_view> names;

        for (const auto& choice : menu)
        {
            CHECK (! choice.name.empty());
            CHECK (choice.sound >= 0 && choice.sound <= kRawMax);
            names.insert (choice.name);
        }

        // Two entries with the same name would be indistinguishable in the interface.
        CHECK_EQ (static_cast<int> (names.size()), factory::kSoundsPerTrack);
    }

    // Out of range asks for nothing rather than reading past the table.
    CHECK (factory::soundMenu (-1).empty());
    CHECK (factory::soundMenu (kNumTracks).empty());
}

BUD_TEST (SoundMenu, selectingWritesBankAndSoundAndReadsBack)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);

    for (int track = 0; track < kNumTracks; ++track)
    {
        for (int choice = 0; choice < factory::kSoundsPerTrack; ++choice)
        {
            engine.selectSound (track, choice);

            const auto& entry = factory::soundMenu (track)[static_cast<std::size_t> (choice)];

            CHECK_EQ (engine.parameters().get (ParamKind::TrackSoundBank, track),
                      static_cast<int> (entry.bank));
            CHECK_EQ (engine.parameters().get (ParamKind::TrackSound, track), entry.sound);

            // The round trip is what the interface depends on to show the right entry as
            // selected after a kit load or a pattern recall.
            CHECK_EQ (engine.selectedSound (track), choice);
        }
    }
}

BUD_TEST (SoundMenu, anUnnamedKnobPositionSelectsNothing)
{
    Engine engine;
    engine.prepare (kSampleRate, 512);

    engine.selectSound (0, 0);
    CHECK_EQ (engine.selectedSound (0), 0);

    // Somewhere in the continuum past the signature slots. The menu must say "not one of mine"
    // rather than claiming the nearest entry, or turning the knob would silently relabel it.
    engine.parameters().set (ParamKind::TrackSound, 0, 11);
    CHECK_EQ (engine.selectedSound (0), -1);

    // Out-of-range choices are ignored rather than clamped onto a neighbour.
    engine.selectSound (0, 99);
    CHECK_EQ (engine.parameters().get (ParamKind::TrackSound, 0), 11);
}

BUD_TEST (SoundMenu, theFiveAreActuallyDifferentSounds)
{
    SoundLibrary library;
    factory::generate (library, kSampleRate);

    for (int track = 0; track < kNumTracks; ++track)
    {
        const auto menu = factory::soundMenu (track);

        // The bass track is a synth: its five are oscillator settings, not stored audio.
        if (menu.front().bank == SoundBank::BASS)
            continue;

        for (std::size_t a = 0; a < menu.size(); ++a)
        {
            const auto* first = library.find (menu[a].bank, menu[a].sound);
            CHECK (first != nullptr);

            if (first == nullptr)
                continue;

            CHECK (first->length() > 0);

            for (auto b = a + 1; b < menu.size(); ++b)
            {
                const auto* second = library.find (menu[b].bank, menu[b].sound);

                if (second == nullptr)
                    continue;

                // The whole point of the shortlist is five different drums rather than five
                // settings of one, so this is the property that makes it worth having.
                CHECK (largestDifference (*first, *second) > 0.01f);
            }
        }
    }
}

BUD_TEST (SoundMenu, loopsAreStereoAndCarryTheirTempo)
{
    SoundLibrary library;
    factory::generate (library, kSampleRate);

    const auto menu = factory::soundMenu (kLoopTrack);

    for (const auto& choice : menu)
    {
        const auto* loop = library.find (choice.bank, choice.sound);
        CHECK (loop != nullptr);

        if (loop == nullptr)
            continue;

        CHECK (loop->isStereo());

        // Without a musical length the loop track cannot stretch or repitch to tempo, which is
        // the entire reason that track exists.
        CHECK_EQ (loop->sourceBeats, 8.0);

        // Two bars at 120 bpm.
        CHECK_EQ (loop->length(), static_cast<int> (kSampleRate * 4.0));

        // The channels have to differ, or it is a mono file in a stereo slot.
        auto differs = false;

        for (int i = 0; i < loop->length() && ! differs; ++i)
            differs = std::abs (loop->at (0, i) - loop->at (1, i)) > 1.0e-6f;

        CHECK (differs);
    }
}

BUD_TEST (SoundMenu, generationStaysDeterministicWithSignatures)
{
    SoundLibrary a, b;
    factory::generate (a, kSampleRate);
    factory::generate (b, kSampleRate);

    for (int track = 0; track < kNumTracks; ++track)
    {
        for (const auto& choice : factory::soundMenu (track))
        {
            const auto* left = a.find (choice.bank, choice.sound);
            const auto* right = b.find (choice.bank, choice.sound);

            if (left == nullptr || right == nullptr)
                continue;

            CHECK_EQ (largestDifference (*left, *right), 0.0f);
        }
    }
}
