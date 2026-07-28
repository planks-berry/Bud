#include "TestFramework.h"

#include "core/Types.h"
#include "core/params/ParameterIds.h"

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

        CHECK_EQ (info.curve, ParamCurve::Stepped);
        CHECK_EQ (info.minValue, 0.0f);

        const auto expected = static_cast<std::size_t> (info.maxValue) + 1;
        CHECK_EQ (info.labels.size(), expected);
    }
}

BUD_TEST (Parameters, normaliseRoundTrips)
{
    for (const auto& info : paramTable())
    {
        for (int i = 0; i <= 10; ++i)
        {
            const auto n = static_cast<float> (i) / 10.0f;
            const auto value = denormalise (info.kind, n);
            const auto back = normalise (info.kind, value);

            // Stepped parameters snap, so they only round-trip to within one quantisation step.
            const auto tolerance = info.curve == ParamCurve::Stepped
                                 ? 1.0 / static_cast<double> (info.maxValue - info.minValue)
                                 : 1.0e-4;

            CHECK_NEAR (back, n, tolerance + 1.0e-6);
        }
    }
}

BUD_TEST (Parameters, exponentialCurveHitsBothEnds)
{
    // Frequencies and times use the exponential curve; the endpoints must still be exact.
    CHECK_NEAR (denormalise (ParamKind::TrackEqFreq, 0.0f), 20.0f, 1.0e-3);
    CHECK_NEAR (denormalise (ParamKind::TrackEqFreq, 1.0f), 20000.0f, 1.0e-1);

    // ...and the midpoint is geometric, not arithmetic — 632 Hz, not 10 kHz.
    CHECK_NEAR (denormalise (ParamKind::TrackEqFreq, 0.5f), 632.5f, 1.0f);
}

BUD_TEST (Parameters, steppedValuesSnapToIntegers)
{
    CHECK_EQ (clampToRange (ParamKind::TrackStepLength, 7.4f), 7.0f);
    CHECK_EQ (clampToRange (ParamKind::TrackStepLength, 7.6f), 8.0f);

    // ...and clamp to the declared range.
    CHECK_EQ (clampToRange (ParamKind::TrackStepLength, 99.0f), 16.0f);
    CHECK_EQ (clampToRange (ParamKind::TrackStepLength, -5.0f), 1.0f);
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
    CHECK_EQ (paramIdString (makeParamId (ParamKind::KickDecay, 0)), std::string ("t01.kick_decay"));
    CHECK_EQ (paramIdString (makeParamId (ParamKind::BassCutoff, 10)), std::string ("t11.bass_cutoff"));
}

BUD_TEST (Parameters, formattingUsesUnits)
{
    CHECK_EQ (formatValue (ParamKind::TrackLevel, 0.5f), std::string ("50%"));
    CHECK_EQ (formatValue (ParamKind::Feel, 2.0f), std::string ("MINIMAL"));
    CHECK_EQ (formatValue (ParamKind::TrackNoteLength, 4.0f), std::string ("1/16"));
    CHECK_EQ (formatValue (ParamKind::ReverbType, 2.0f), std::string ("PLATE"));
    CHECK_EQ (formatValue (ParamKind::KickDecay, 400.0f), std::string ("400ms"));
    CHECK_EQ (formatValue (ParamKind::KickTune, 7.0f), std::string ("+7"));
    CHECK_EQ (formatValue (ParamKind::TrackEqFreq, 2000.0f), std::string ("2.0k"));
    CHECK_EQ (formatValue (ParamKind::TrackMute, 1.0f), std::string ("ON"));
}

BUD_TEST (Parameters, everyTrackExposesCommonPlusVoiceParams)
{
    for (int track = 0; track < kNumTracks; ++track)
    {
        const auto ids = trackParamIds (track);
        const auto voice = trackInfo (track).voice;
        const auto expected = commonTrackParams().size() + voiceParams (voice).size();

        CHECK_EQ (ids.size(), expected);

        // Every id must belong to this track, and none may repeat.
        std::set<ParamId> seen;
        for (auto id : ids)
        {
            CHECK_EQ (trackOf (id), track);
            CHECK (seen.insert (id).second);
        }
    }
}

BUD_TEST (Parameters, bassTrackExposesTheFullBassEngine)
{
    const auto ids = trackParamIds (kBassTrack);

    const auto has = [&ids] (ParamKind kind)
    {
        return std::any_of (ids.begin(), ids.end(),
                            [kind] (ParamId id) { return kindOf (id) == kind; });
    };

    CHECK (has (ParamKind::BassCutoff));
    CHECK (has (ParamKind::BassGlideTime));
    CHECK (has (ParamKind::BassGlideCurve));
    CHECK (has (ParamKind::BassDecayCurve));
    CHECK (has (ParamKind::BassGateTime));
    CHECK (has (ParamKind::BassOverdrive));
    CHECK (has (ParamKind::BassSubRange));
    CHECK (has (ParamKind::BassWaveBlend));
}

BUD_TEST (Parameters, trackTableCoversElevenTracks)
{
    CHECK_EQ (static_cast<int> (kTrackTable.size()), kNumTracks);
    CHECK_EQ (trackInfo (0).voice, VoiceKind::KickSynth);
    CHECK_EQ (trackInfo (2).voice, VoiceKind::SnareSynth);
    CHECK_EQ (trackInfo (kLoopTrack).voice, VoiceKind::Loop);
    CHECK_EQ (trackInfo (kBassTrack).voice, VoiceKind::BassSynth);

    // Tracks 7-9 are the user-sampleable percussion tracks, plus the loop track.
    CHECK (trackInfo (6).userSampleable);
    CHECK (trackInfo (7).userSampleable);
    CHECK (trackInfo (8).userSampleable);
    CHECK (trackInfo (kLoopTrack).userSampleable);
}
