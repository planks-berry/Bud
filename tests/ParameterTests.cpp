#include "TestFramework.h"

#include "core/Types.h"
#include "core/params/Curves.h"
#include "core/params/ParameterIds.h"
#include "core/params/ParameterSet.h"
#include "core/sequencer/Pattern.h"

#include <algorithm>
#include <set>

using namespace bud;

BUD_TEST (Parameters, tableRowOrderMatchesEnum)
{
    const auto table = paramTable();
    CHECK_EQ (static_cast<int> (table.size()), kNumParamKinds);

    for (std::size_t i = 0; i < table.size(); ++i)
        CHECK_EQ (static_cast<int> (table[i].kind), static_cast<int> (i));
}

BUD_TEST (Parameters, stringIdsAreUnique)
{
    // Duplicated string ids would silently collide in saved state.
    std::set<std::string_view> seen;

    for (const auto& info : paramTable())
    {
        CHECK (! info.id.empty());
        CHECK (seen.insert (info.id).second);
    }
}

BUD_TEST (Parameters, defaultsAreInRange)
{
    for (const auto& info : paramTable())
    {
        CHECK (info.minValue < info.maxValue);
        CHECK (info.defaultValue >= info.minValue);
        CHECK (info.defaultValue <= info.maxValue);
    }
}

BUD_TEST (Parameters, enumParametersHaveLabelForEveryValue)
{
    for (const auto& info : paramTable())
    {
        if (info.unit != ParamUnit::Enum && info.unit != ParamUnit::Bool)
            continue;

        CHECK_EQ (info.minValue, 0);

        const auto expected = static_cast<std::size_t> (info.maxValue) + 1;
        CHECK_EQ (info.labels.size(), expected);
    }
}

BUD_TEST (Parameters, excludedParametersCannotBeLocked)
{
    // The device excludes accent, isolator, MFX, reverb, delay, swing and master from parameter
    // locking (p. 44).
    const ParamKind excluded[] = {
        ParamKind::AccentHardDepth, ParamKind::AccentSoftDepth,
        ParamKind::IsolatorLow, ParamKind::IsolatorMid, ParamKind::IsolatorHigh,
        ParamKind::MasterFxType, ParamKind::MasterFxAmount, ParamKind::MasterFxEnabled,
        ParamKind::ReverbType, ParamKind::ReverbMix,
        ParamKind::DelayMix, ParamKind::DelayTime, ParamKind::DelayFeedback,
        ParamKind::Swing, ParamKind::TrackSwing,
        ParamKind::MasterVolume,
    };

    for (auto kind : excluded)
        CHECK (! paramInfo (kind).plockable);
}

BUD_TEST (Parameters, plockMapRefusesExcludedParameters)
{
    // Enforced at the store, so no caller can create a lock the hardware could not.
    PlockMap locks;

    locks.set (makeParamId (ParamKind::MasterFxAmount), 100);
    CHECK (locks.empty());

    locks.set (makeParamId (ParamKind::Swing), 70);
    CHECK (locks.empty());

    locks.set (makeParamId (ParamKind::TrackLevel, 0), 42);
    CHECK_EQ (locks.size(), std::size_t (1));
}

BUD_TEST (Parameters, valuesClampToTheirRange)
{
    CHECK_EQ (clampToRange (ParamKind::TrackLevel, 999), 127);
    CHECK_EQ (clampToRange (ParamKind::TrackLevel, -5), 0);
    CHECK_EQ (clampToRange (ParamKind::TrackStepLength, 0), 1);
    CHECK_EQ (clampToRange (ParamKind::TrackStepLength, 99), 16);
    CHECK_EQ (clampToRange (ParamKind::Transpose, -99), -12);
    CHECK_EQ (clampToRange (ParamKind::Swing, 10), 50);
}

BUD_TEST (Parameters, normaliseRoundTrips)
{
    for (const auto& info : paramTable())
    {
        for (int v = info.minValue; v <= info.maxValue; ++v)
        {
            const auto n = normalise (info.kind, v);
            CHECK_EQ (denormalise (info.kind, n), v);
        }
    }
}

BUD_TEST (Parameters, idPacksKindAndTrack)
{
    for (int k = 0; k < kNumParamKinds; ++k)
    {
        const auto kind = static_cast<ParamKind> (k);

        const auto globalId = makeParamId (kind);
        CHECK_EQ (static_cast<int> (kindOf (globalId)), k);
        CHECK_EQ (trackOf (globalId), -1);

        for (int track = 0; track < kNumTracks; ++track)
        {
            const auto id = makeParamId (kind, track);
            CHECK_EQ (static_cast<int> (kindOf (id)), k);
            CHECK_EQ (trackOf (id), track);
        }
    }
}

BUD_TEST (Parameters, idsAreUniqueAcrossEveryInstance)
{
    std::set<ParamId> seen;

    for (int k = 0; k < kNumParamKinds; ++k)
    {
        const auto kind = static_cast<ParamKind> (k);
        CHECK (seen.insert (makeParamId (kind)).second);

        for (int track = 0; track < kNumTracks; ++track)
            CHECK (seen.insert (makeParamId (kind, track)).second);
    }
}

BUD_TEST (Parameters, idStringIncludesTrackPrefix)
{
    CHECK_EQ (paramIdString (makeParamId (ParamKind::Tempo)), std::string ("tempo"));
    CHECK_EQ (paramIdString (makeParamId (ParamKind::TrackDecay, 0)), std::string ("t01.decay"));
    CHECK_EQ (paramIdString (makeParamId (ParamKind::BassCutoff, 10)),
              std::string ("t11.bass_cutoff"));
}

BUD_TEST (Parameters, displayFormattingMatchesTheDevice)
{
    CHECK_EQ (formatValue (ParamKind::Feel, 2), std::string ("MN"));
    CHECK_EQ (formatValue (ParamKind::TrackNoteLength, 8), std::string ("16"));
    CHECK_EQ (formatValue (ParamKind::TrackNoteLength, 4), std::string ("4T"));
    CHECK_EQ (formatValue (ParamKind::ReverbType, 2), std::string ("PLAT"));
    CHECK_EQ (formatValue (ParamKind::TrackLoopMode, 4), std::string (">.MLD"));
    CHECK_EQ (formatValue (ParamKind::TrackSnappyType, 3), std::string ("NT2"));
    CHECK_EQ (formatValue (ParamKind::MasterFxType, 3), std::string ("SN.LP"));

    // Pan reads L63 - C - R63 (p. 27).
    CHECK_EQ (formatValue (ParamKind::TrackPan, 64), std::string ("C"));
    CHECK_EQ (formatValue (ParamKind::TrackPan, 1), std::string ("L63"));
    CHECK_EQ (formatValue (ParamKind::TrackPan, 127), std::string ("R63"));

    // Tone reads LPF50 - FLT OFF - HPF50 (p. 65).
    CHECK_EQ (formatValue (ParamKind::TrackTone, 64), std::string ("FLT OFF"));
    CHECK_EQ (formatValue (ParamKind::TrackTone, 0), std::string ("LPF50"));
    CHECK_EQ (formatValue (ParamKind::TrackTone, 127), std::string ("HPF50"));

    // Track swing shows PTN when it is following the pattern (p. 51).
    CHECK_EQ (formatValue (ParamKind::TrackSwing, 49), std::string ("PTN"));
    CHECK_EQ (formatValue (ParamKind::TrackSwing, 66), std::string ("66%"));
}

BUD_TEST (Parameters, trackParametersCoverOnlyWhatTheTrackSupports)
{
    const auto has = [] (const std::vector<ParamId>& ids, ParamKind kind)
    {
        return std::any_of (ids.begin(), ids.end(),
                            [kind] (ParamId id) { return kindOf (id) == kind; });
    };

    // Choke is tracks 5-6 only (p. 66).
    CHECK (has (trackParamIds (4), ParamKind::TrackChoke));
    CHECK (has (trackParamIds (5), ParamKind::TrackChoke));
    CHECK (! has (trackParamIds (0), ParamKind::TrackChoke));

    // Repitch is tracks 7-9 (p. 68); the loop mode is track 10 (p. 70).
    CHECK (has (trackParamIds (6), ParamKind::TrackRepitch));
    CHECK (has (trackParamIds (8), ParamKind::TrackRepitch));
    CHECK (! has (trackParamIds (kLoopTrack), ParamKind::TrackRepitch));
    CHECK (has (trackParamIds (kLoopTrack), ParamKind::TrackLoopMode));

    // The snappy type belongs to the snare track alone (p. 65).
    CHECK (has (trackParamIds (2), ParamKind::TrackSnappyType));
    CHECK (! has (trackParamIds (1), ParamKind::TrackSnappyType));

    // The bass section exists only on track 11.
    CHECK (has (trackParamIds (kBassTrack), ParamKind::BassCutoff));
    CHECK (has (trackParamIds (kBassTrack), ParamKind::BassDriveEnabled));
    CHECK (! has (trackParamIds (0), ParamKind::BassCutoff));

    // Every track has all eleven micro knobs.
    for (int track = 0; track < kNumTracks; ++track)
        for (auto kind : trackKnobParams())
            CHECK (has (trackParamIds (track), kind));
}

BUD_TEST (Parameters, knobNamesFollowTheBank)
{
    // The same knob reads differently depending on the bank (p. 62).
    CHECK_EQ (knobNameForBank (ParamKind::TrackTone, SoundBank::BD), std::string_view ("TONE"));
    CHECK_EQ (knobNameForBank (ParamKind::TrackTone, SoundBank::SD), std::string_view ("SNAPPY"));
    CHECK_EQ (knobNameForBank (ParamKind::TrackTone, SoundBank::HH_CY), std::string_view ("LPF/HPF"));
    CHECK_EQ (knobNameForBank (ParamKind::TrackTone, SoundBank::BASS), std::string_view ("SUBOCT"));

    CHECK_EQ (knobNameForBank (ParamKind::TrackMove, SoundBank::BD), std::string_view ("MODTIME"));
    CHECK_EQ (knobNameForBank (ParamKind::TrackMove, SoundBank::TT), std::string_view ("NUDGE"));
    CHECK_EQ (knobNameForBank (ParamKind::TrackMove, SoundBank::S8), std::string_view ("XFADE"));

    CHECK_EQ (knobNameForBank (ParamKind::TrackDecay, SoundBank::S2), std::string_view ("LENGTH"));
    CHECK_EQ (knobNameForBank (ParamKind::TrackDecay, SoundBank::BASS), std::string_view ("GATE"));
}

//==============================================================================

BUD_TEST (Parameters, trackTableMatchesTheDevice)
{
    // Six drum, four sample, one bass (p. 16).
    CHECK_EQ (static_cast<int> (kTrackTable.size()), kNumTracks);

    int drums = 0, samples = 0, bass = 0;
    for (const auto& t : kTrackTable)
    {
        drums += t.kind == TrackKind::Drum;
        samples += t.kind == TrackKind::Sample;
        bass += t.kind == TrackKind::Bass;
    }

    CHECK_EQ (drums, 6);
    CHECK_EQ (samples, 4);
    CHECK_EQ (bass, 1);

    // Default banks, from the track table on p. 25.
    CHECK_EQ (trackInfo (0).defaultBank, SoundBank::BD);
    CHECK_EQ (trackInfo (1).defaultBank, SoundBank::BD);
    CHECK_EQ (trackInfo (2).defaultBank, SoundBank::SD);
    CHECK_EQ (trackInfo (3).defaultBank, SoundBank::CP);
    CHECK_EQ (trackInfo (4).defaultBank, SoundBank::HH_CY);
    CHECK_EQ (trackInfo (5).defaultBank, SoundBank::HH_CY);
    CHECK_EQ (trackInfo (6).defaultBank, SoundBank::TT);
    CHECK_EQ (trackInfo (7).defaultBank, SoundBank::ST);
    CHECK_EQ (trackInfo (8).defaultBank, SoundBank::PC);
    CHECK_EQ (trackInfo (kLoopTrack).defaultBank, SoundBank::S8);
    CHECK_EQ (trackInfo (kBassTrack).defaultBank, SoundBank::BASS);
}

BUD_TEST (Parameters, onlyBd1AndSdAreSynthesised)
{
    // Every other bank is sample-based (p. 60, 116) — including BD and SD on other tracks.
    CHECK (bankHasSynthEngine (SoundBank::BD, 0));
    CHECK (bankHasSynthEngine (SoundBank::SD, 2));

    CHECK (! bankHasSynthEngine (SoundBank::BD, 1));
    CHECK (! bankHasSynthEngine (SoundBank::SD, 0));
    CHECK (! bankHasSynthEngine (SoundBank::HH_CY, 4));
    CHECK (! bankHasSynthEngine (SoundBank::CP, 3));
}

BUD_TEST (Parameters, banksCarryTheirFeelAndRandomClasses)
{
    // From the table on p. 61.
    CHECK_EQ (bankInfo (SoundBank::BD).feel, FeelClass::Tiny);
    CHECK_EQ (bankInfo (SoundBank::SD).feel, FeelClass::Slight);
    CHECK_EQ (bankInfo (SoundBank::HH_CY).feel, FeelClass::Moderate);
    CHECK_EQ (bankInfo (SoundBank::CP).feel, FeelClass::Significant);

    // FX and every sample bank are exempt from FEEL entirely.
    for (auto bank : { SoundBank::FX, SoundBank::S2, SoundBank::S4, SoundBank::S8,
                       SoundBank::BASS })
    {
        CHECK_EQ (bankInfo (bank).feel, FeelClass::None);
        CHECK (! curves::bankTakesFeel (bank));
    }

    CHECK_EQ (bankInfo (SoundBank::HH_CY).random, RandomClass::Strong);
    CHECK_EQ (bankInfo (SoundBank::CP).random, RandomClass::Strong);
    CHECK_EQ (bankInfo (SoundBank::BD).random, RandomClass::Subtle);
    CHECK_EQ (bankInfo (SoundBank::BASS).random, RandomClass::Aggressive);
}

BUD_TEST (Parameters, noteLengthsIncludeDottedAndTriplets)
{
    // Ten values, 1 through 32, with dotted and triplet forms (p. 35).
    CHECK_EQ (kNumStepDivisions, 10);

    CHECK_NEAR (quarterNotesPerStep (StepDivision::Whole), 4.0, 1e-12);
    CHECK_NEAR (quarterNotesPerStep (StepDivision::Quarter), 1.0, 1e-12);
    CHECK_NEAR (quarterNotesPerStep (StepDivision::DottedQuarter), 1.5, 1e-12);
    CHECK_NEAR (quarterNotesPerStep (StepDivision::TripletQuarter), 2.0 / 3.0, 1e-12);
    CHECK_NEAR (quarterNotesPerStep (StepDivision::DottedEighth), 0.75, 1e-12);
    CHECK_NEAR (quarterNotesPerStep (StepDivision::TripletEighth), 1.0 / 3.0, 1e-12);
    CHECK_NEAR (quarterNotesPerStep (StepDivision::ThirtySecond), 0.125, 1e-12);
}

BUD_TEST (Parameters, subStepFiguresMatchTheManual)
{
    // Eleven figures over a 4- or 3-way division (p. 49). Bit 0 is the first division.
    CHECK_EQ (kNumSubStepPatterns, 11);

    const auto check = [] (SubStepPattern p, int divisions, unsigned mask)
    {
        const auto& info = subStepInfo (p);
        CHECK_EQ (static_cast<int> (info.divisions), divisions);
        CHECK_EQ (static_cast<unsigned> (info.mask), mask);
    };

    check (SubStepPattern::Off,        1, 0b0001);
    check (SubStepPattern::Four_1111,  4, 0b1111);   // four 16ths
    check (SubStepPattern::Four_1100,  4, 0b0011);   // two 16ths
    check (SubStepPattern::Four_1010,  4, 0b0101);   // two 8ths
    check (SubStepPattern::Four_0010,  4, 0b0100);   // 8th rest + 8th note
    check (SubStepPattern::Four_1001,  4, 0b1001);
    check (SubStepPattern::Four_1011,  4, 0b1101);
    check (SubStepPattern::Four_0001,  4, 0b1000);
    check (SubStepPattern::Four_0011,  4, 0b1100);
    check (SubStepPattern::Three_111,  3, 0b111);    // 16th triplets
    check (SubStepPattern::Three_110,  3, 0b011);
}

BUD_TEST (Parameters, patternStoreIsEightBanksOfSixteen)
{
    CHECK_EQ (kNumPatterns, 128);
    CHECK_EQ (kNumPatternBanks, 8);
    CHECK_EQ (kPatternsPerBank, 16);

    CHECK_EQ (PatternBank::flatIndex (0, 0), 0);
    CHECK_EQ (PatternBank::flatIndex (7, 15), 127);
    CHECK_EQ (PatternBank::bankOf (17), 1);
    CHECK_EQ (PatternBank::slotOf (17), 1);
}

//==============================================================================

BUD_TEST (ParameterSet, defaultsIncludeTheTracksOwnBank)
{
    ParameterSet params;

    for (int track = 0; track < kNumTracks; ++track)
        CHECK_EQ (params.get (ParamKind::TrackSoundBank, track),
                  static_cast<int> (trackInfo (track).defaultBank));
}

BUD_TEST (ParameterSet, setAndGetPerTrackAndGlobal)
{
    ParameterSet params;

    params.set (ParamKind::TrackLevel, 3, 55);
    CHECK_EQ (params.get (ParamKind::TrackLevel, 3), 55);

    // Other tracks are untouched.
    CHECK_EQ (params.get (ParamKind::TrackLevel, 4),
              paramInfo (ParamKind::TrackLevel).defaultValue);

    params.set (ParamKind::Tempo, 140);
    CHECK_EQ (params.get (ParamKind::Tempo), 140);
}

BUD_TEST (ParameterSet, viewResolvesLocksOverTrackValues)
{
    ParameterSet params;
    params.set (ParamKind::TrackDecay, 2, 40);

    PlockMap locks;
    locks.set (makeParamId (ParamKind::TrackDecay, 2), 110);

    const ParamView plain { &params, 2, nullptr };
    const ParamView locked { &params, 2, &locks };

    CHECK_EQ (plain (ParamKind::TrackDecay), 40);
    CHECK_EQ (locked (ParamKind::TrackDecay), 110);

    // A lock on one parameter does not shadow the others.
    CHECK_EQ (locked (ParamKind::TrackLevel), params.get (ParamKind::TrackLevel, 2));
}
