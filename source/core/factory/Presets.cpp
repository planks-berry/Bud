#include "Presets.h"

#include "../Engine.h"
#include "SoundMenu.h"

#include <array>

namespace bud::factory
{

namespace
{
    // Track indices, named so the tables below read as parts rather than numbers.
    constexpr int BD = 0, BD2 = 1, SD = 2, CP = 3, CH = 4, OH = 5,
                  TT = 6, ST = 7, PC = 8, LOOP = 9, BASS = 10;

    // Sound choices, by the names in factory::soundMenu.
    namespace kick   { constexpr int deep = 0, punch = 1, tight = 2, drive = 3, sub = 4; }
    namespace snare  { constexpr int crack = 0, fat = 1, rim = 2, brush = 3, gated = 4; }
    namespace clap   { constexpr int classic = 0, tight = 1, room = 2, wide = 3, snappy = 4; }
    namespace hat    { constexpr int tight = 0, tick = 1, pedal = 2, sizzle = 3, metal = 4; }
    namespace open   { constexpr int normal = 0, long_ = 1, splash = 2, ride = 3, crash = 4; }
    namespace tom    { constexpr int floor_ = 0, low = 1, mid = 2, high = 3, synth = 4; }
    namespace stick  { constexpr int rim = 0, clave = 1, wood = 2, tick = 3, side = 4; }
    namespace perc   { constexpr int conga = 0, cowbell = 1, shaker = 2, tamb = 3, block = 4; }
    namespace loops  { constexpr int four = 0, brk = 1, boombap = 2, sparse = 3, percussion = 4; }
    namespace osc    { constexpr int saw = 0, square = 1, tri = 2, rect = 3, s01 = 4; }

    // Basslines, as semitone offsets applied to the gated steps in order.
    constexpr int kRoot[]      = { 0 };
    constexpr int kOctave[]    = { 0, 0, 12, 0 };
    constexpr int kMinorWalk[] = { 0, 0, 3, 0, 0, 7, 3, 0 };
    constexpr int kFifth[]     = { 0, 7, 0, 5 };
    constexpr int kAcidLine[]  = { 0, 0, 12, 0, 3, 0, 10, 0, 0, 7, 0, 0 };
    constexpr int kRolling[]   = { 0, 0, 0, 12 };
    constexpr int kSubDrop[]   = { 0, 0, -5, 0 };
    constexpr int kLogDrum[]   = { 0, -5, 3, 0, 7, 0 };

    //==========================================================================
    // House and its subgenres
    //
    // The family shares a four-to-the-floor kick and a backbeat clap; what separates them is the
    // percussion, where the hats sit, and how the bass moves against the kick.

    constexpr PresetTrack kHouse[] = {
        { BD,   kick::punch,    "X...X...X...X...", 106 },
        { CP,   clap::classic,  "....x.......x...",  84 },
        { CH,   hat::tight,     "x.x.x.x.x.x.x.x.",  68 },
        { OH,   open::normal,   "..x...x...x...x.",  62 },
        { BASS, osc::saw,       "x...x...x...x...",  92, kFifth },
    };

    constexpr PresetTrack kDeepHouse[] = {
        { BD,   kick::deep,     "X...X...X...X...", 104 },
        { CP,   clap::room,     "....x.......x...",  74 },
        { CH,   hat::pedal,     "..x...x...x...x.",  62 },
        { OH,   open::normal,   "..x...x...x...x.",  56 },
        { PC,   perc::shaker,   "x.x.x.x.x.x.x.x.",  52 },
        { BASS, osc::tri,       "x..x....x..x....",  96, kMinorWalk },
    };

    constexpr PresetTrack kTechHouse[] = {
        { BD,   kick::tight,    "X...X...X...X...", 108 },
        { CP,   clap::tight,    "....x.......x...",  80 },
        { CH,   hat::tick,      "x.xxx.x.x.xxx.x.",  66 },
        { OH,   open::normal,   "..x...x...x...x.",  58 },
        { ST,   stick::rim,     "......x.......x.",  62 },
        { BASS, osc::square,    "x.x.x.x.x.x.x.x.",  88, kRolling },
    };

    constexpr PresetTrack kProgHouse[] = {
        { BD,   kick::punch,    "X...X...X...X...", 106 },
        { CP,   clap::wide,     "....x.......x...",  76 },
        { CH,   hat::tight,     "..x...x...x...x.",  60 },
        { OH,   open::long_,    "..............x.",  58 },
        { BASS, osc::saw,       "x...x...x...x...",  90, kOctave },
    };

    // Tropical house: slower, softer, and driven by the percussion rather than the kick.
    constexpr PresetTrack kTropical[] = {
        { BD,   kick::deep,     "X...X...X...X...",  98 },
        { CP,   clap::room,     "....x.......x...",  66 },
        { CH,   hat::pedal,     "..x...x...x...x.",  54 },
        { PC,   perc::conga,    "..x.x...x.x.x...",  70 },
        { ST,   stick::wood,    "......x.....x...",  58 },
        { BASS, osc::tri,       "x.......x.......",  86, kFifth },
    };

    // Afro house: the congas carry the bar and the clave sits across the kick.
    constexpr PresetTrack kAfroHouse[] = {
        { BD,   kick::deep,     "X...X...X...X...", 104 },
        { CH,   hat::pedal,     "..x...x...x...x.",  56 },
        { PC,   perc::conga,    "x.xx.x.xx.x.xx.x",  78 },
        { ST,   stick::clave,   "..x..x..x...x...",  66 },
        { TT,   tom::low,       "......x.......x.",  62 },
        { BASS, osc::tri,       "x..x..x...x..x..",  88, kMinorWalk },
    };

    // Guaracha / aleteo — the Colombian house strain. Its signature is the syncopated percussion
    // riding over a straight kick, with a tresillo woodblock and a hard offbeat clap.
    constexpr PresetTrack kGuaracha[] = {
        { BD,   kick::punch,    "X...X...X...X...", 108 },
        { CP,   clap::snappy,   "....X.......X...",  88 },
        { PC,   perc::conga,    "..xx..x...xx..x.",  82 },
        { TT,   tom::mid,       "......x.x.....x.",  74 },
        { ST,   stick::wood,    "x..x..x..x..x..x",  70 },
        { CH,   hat::tick,      "x.x.x.x.x.x.x.x.",  62 },
        { BASS, osc::square,    "x...x...x...x...",  86, kRoot },
    };

    constexpr PresetTrack kFutureHouse[] = {
        { BD,   kick::punch,    "X...X...X...X...", 108 },
        { CP,   clap::tight,    "....x.......x...",  82 },
        { CH,   hat::tight,     "x.x.x.x.x.x.x.x.",  64 },
        { OH,   open::normal,   "..x...x...x...x.",  58 },
        { BASS, osc::rect,      "x.x...x.x.x...x.",  94, kOctave },
    };

    constexpr PresetTrack kBassHouse[] = {
        { BD,   kick::drive,    "X...X...X...X...", 110 },
        { CP,   clap::snappy,   "....X.......X...",  86 },
        { CH,   hat::tick,      "x.xxx.x.x.xxx.x.",  64 },
        { BASS, osc::square,    "x..x.x..x..x.x..",  98, kSubDrop },
    };

    constexpr PresetTrack kFrenchHouse[] = {
        { BD,   kick::punch,    "X...X...X...X...", 106 },
        { CP,   clap::classic,  "....x.......x...",  80 },
        { CH,   hat::tight,     "x.x.x.x.x.x.x.x.",  66 },
        { OH,   open::normal,   "..x...x...x...x.",  60 },
        { PC,   perc::tamb,     "..x...x...x...x.",  54 },
        { BASS, osc::saw,       "x...x...x...x...",  92, kFifth },
    };

    constexpr PresetTrack kLatinHouse[] = {
        { BD,   kick::punch,    "X...X...X...X...", 106 },
        { CP,   clap::classic,  "....x.......x...",  78 },
        { PC,   perc::conga,    "..x.xx..x.x.xx..",  80 },
        { ST,   stick::clave,   "..x..x..x...x...",  68 },
        { CH,   hat::pedal,     "..x...x...x...x.",  58 },
        { BASS, osc::tri,       "x..x..x...x..x..",  88, kMinorWalk },
    };

    // Amapiano: the log drum is the hook, so the bass is syncopated and the kick stays out of
    // its way.
    constexpr PresetTrack kAmapiano[] = {
        { BD,   kick::deep,     "X...X...X...X...", 100 },
        { CP,   clap::room,     "....x.......x...",  72 },
        { PC,   perc::shaker,   "x.x.x.x.x.x.x.x.",  66 },
        { ST,   stick::wood,    "......x.......x.",  60 },
        { TT,   tom::low,       "..........x...x.",  70 },
        { BASS, osc::tri,       "......x.....x...", 100, kLogDrum },
    };

    constexpr PresetTrack kMelodicHouse[] = {
        { BD,   kick::deep,     "X...X...X...X...", 102 },
        { CH,   hat::pedal,     "..x...x...x...x.",  58 },
        { OH,   open::long_,    "..............x.",  54 },
        { PC,   perc::shaker,   "x.x.x.x.x.x.x.x.",  50 },
        { BASS, osc::tri,       "x.....x...x.....",  90, kMinorWalk },
    };

    //==========================================================================
    // Techno

    constexpr PresetTrack kTechno[] = {
        { BD,   kick::drive,    "X...X...X...X...", 112 },
        { CH,   hat::tight,     "..x...x...x...x.",  64 },
        { OH,   open::normal,   "..............x.",  58 },
        { ST,   stick::rim,     "....x.......x...",  60 },
        { BASS, osc::square,    "x...x...x...x...",  84, kRoot },
    };

    constexpr PresetTrack kMinimalTechno[] = {
        { BD,   kick::tight,    "X...X...X...X...", 108 },
        { CH,   hat::tick,      "..x...x...x...x.",  58 },
        { ST,   stick::tick,    "..x..x..x..x..x.",  54 },
        { BASS, osc::square,    "x.......x.......",  80, kRoot },
    };

    constexpr PresetTrack kDetroit[] = {
        { BD,   kick::punch,    "X...X...X...X...", 106 },
        { CP,   clap::classic,  "....x.......x...",  78 },
        { CH,   hat::tight,     "x.x.x.x.x.x.x.x.",  62 },
        { OH,   open::normal,   "..x...x...x...x.",  56 },
        { PC,   perc::cowbell,  "......x.......x.",  58 },
        { BASS, osc::saw,       "x..x..x...x..x..",  86, kMinorWalk },
    };

    constexpr PresetTrack kAcid[] = {
        { BD,   kick::punch,    "X...X...X...X...", 108 },
        { CH,   hat::tick,      "x.x.x.x.x.x.x.x.",  62 },
        { OH,   open::normal,   "..............x.",  56 },
        { BASS, osc::s01,       "x.xx.x.xx.x.xx.x", 100, kAcidLine },
    };

    constexpr PresetTrack kHardTechno[] = {
        { BD,   kick::drive,    "X...X...X...X...", 116 },
        { BD2,  kick::sub,      "..x...x...x...x.",  76 },
        { CH,   hat::metal,     "x.x.x.x.x.x.x.x.",  62 },
        { ST,   stick::rim,     "....x.......x...",  60 },
        { BASS, osc::square,    "x...x...x...x...",  82, kRoot },
    };

    //==========================================================================
    // Trance

    constexpr PresetTrack kTrance[] = {
        { BD,   kick::punch,    "X...X...X...X...", 108 },
        { CP,   clap::wide,     "....x.......x...",  76 },
        { CH,   hat::tight,     "..x...x...x...x.",  60 },
        { OH,   open::normal,   "..x...x...x...x.",  56 },
        { BASS, osc::saw,       "..x...x...x...x.",  92, kOctave },
    };

    constexpr PresetTrack kPsytrance[] = {
        { BD,   kick::tight,    "X...X...X...X...", 112 },
        { CH,   hat::tick,      "..x...x...x...x.",  58 },
        { OH,   open::normal,   "..............x.",  54 },
        { PC,   perc::block,    "....x.......x...",  56 },
        { BASS, osc::square,    ".xx..xx..xx..xx.",  98, kRolling },
    };

    constexpr PresetTrack kProgTrance[] = {
        { BD,   kick::punch,    "X...X...X...X...", 106 },
        { CP,   clap::wide,     "....x.......x...",  74 },
        { CH,   hat::tight,     "x.x.x.x.x.x.x.x.",  60 },
        { OH,   open::normal,   "..x...x...x...x.",  56 },
        { BASS, osc::saw,       "..x...x...x...x.",  90, kFifth },
    };

    //==========================================================================
    // Bass music and breaks
    //
    // Where the family above is built on a four-to-the-floor kick, these are built on a backbeat
    // that lands halfway through the bar — which at these tempos is what "half time" means.

    constexpr PresetTrack kDubstep[] = {
        { BD,   kick::sub,      "X.....x.........", 112 },
        { SD,   snare::crack,   "........X.......",  98 },
        { CH,   hat::tight,     "..x...x...x...x.",  58 },
        { BASS, osc::square,    "x.......x...x...", 104, kSubDrop },
    };

    constexpr PresetTrack kDrumAndBass[] = {
        { BD,   kick::punch,    "X.........x.....", 108 },
        { SD,   snare::crack,   "....X.......X...",  96 },
        { CH,   hat::tick,      "x.x.x.x.x.x.x.x.",  60 },
        { OH,   open::normal,   "..............x.",  54 },
        { BASS, osc::tri,       "x.......x.......", 100, kSubDrop },
    };

    constexpr PresetTrack kJungle[] = {
        { BD,   kick::punch,    "X.....x...x.....", 104 },
        { SD,   snare::crack,   "....X..x....X.x.",  92 },
        { CH,   hat::tick,      "x.x.x.x.x.x.x.x.",  58 },
        { LOOP, loops::brk,     "x...............",  76 },
        { BASS, osc::tri,       "x.......x.......",  98, kSubDrop },
    };

    constexpr PresetTrack kBreakbeat[] = {
        { BD,   kick::punch,    "X.....x.....x...", 106 },
        { SD,   snare::fat,     "....X.......X...",  92 },
        { CH,   hat::tight,     "x.x.x.x.x.x.x.x.",  62 },
        { OH,   open::normal,   "..........x.....",  56 },
        { BASS, osc::saw,       "x.....x...x.....",  88, kMinorWalk },
    };

    constexpr PresetTrack kUkGarage[] = {
        { BD,   kick::punch,    "X.......x..x....", 106 },
        { SD,   snare::crack,   "....X.......X...",  90 },
        { CH,   hat::tick,      "x.xx..x.x.xx..x.",  62 },
        { OH,   open::normal,   "......x.......x.",  56 },
        { BASS, osc::square,    "x.....x...x.....",  92, kFifth },
    };

    constexpr PresetTrack kFutureBass[] = {
        { BD,   kick::deep,     "X.....x.........", 106 },
        { SD,   snare::crack,   "........X.......",  94 },
        { CP,   clap::wide,     "........x.......",  78 },
        { CH,   hat::tick,      "x.x.x.x.x.x.x.x.",  60 },
        { BASS, osc::saw,       "x.......x.......",  92, kOctave },
    };

    constexpr PresetTrack kTrap[] = {
        { BD,   kick::sub,      "X.....x...x.....", 110 },
        { SD,   snare::crack,   "........X.......",  94 },
        { CH,   hat::tick,      "x.x.xxx.x.x.xxxx",  60 },
        { ST,   stick::tick,    "..............x.",  52 },
        { BASS, osc::tri,       "x.....x...x.....", 104, kSubDrop },
    };

    constexpr PresetTrack kMoombahton[] = {
        { BD,   kick::punch,    "X.....x.X.....x.", 108 },
        { SD,   snare::fat,     "....x.......x...",  86 },
        { PC,   perc::conga,    "..x..x..x..x..x.",  74 },
        { CH,   hat::pedal,     "x.x.x.x.x.x.x.x.",  58 },
        { BASS, osc::square,    "x.......x.......",  92, kFifth },
    };

    constexpr PresetTrack kHardstyle[] = {
        { BD,   kick::drive,    "X...X...X...X...", 118 },
        { CP,   clap::snappy,   "....x.......x...",  82 },
        { CH,   hat::metal,     "..x...x...x...x.",  60 },
        { ST,   stick::rim,     "..............x.",  54 },
        // The offbeat "reverse bass" that sits between the kicks is the genre's signature.
        { BASS, osc::saw,       "..x...x...x...x.",  96, kRoot },
    };

    //==========================================================================

    constexpr Preset kPresets[] = {
        { "HOUSE",       "House",  124, FeelModel::Minimal, 52, kHouse },
        { "DEEP HOUSE",  "House",  122, FeelModel::Minimal, 56, kDeepHouse },
        { "TECH HOUSE",  "House",  126, FeelModel::M909,    54, kTechHouse },
        { "PROG HOUSE",  "House",  128, FeelModel::Minimal, 50, kProgHouse },
        { "TROPICAL",    "House",  108, FeelModel::M808,    58, kTropical },
        { "AFRO HOUSE",  "House",  122, FeelModel::M808,    60, kAfroHouse },
        { "GUARACHA",    "House",  130, FeelModel::M909,    50, kGuaracha },
        { "FUTURE HOUSE","House",  128, FeelModel::M909,    50, kFutureHouse },
        { "BASS HOUSE",  "House",  128, FeelModel::M909,    50, kBassHouse },
        { "FRENCH HOUSE","House",  120, FeelModel::M909,    56, kFrenchHouse },
        { "LATIN HOUSE", "House",  126, FeelModel::M808,    56, kLatinHouse },
        { "AMAPIANO",    "House",  112, FeelModel::M808,    62, kAmapiano },
        { "MELODIC",     "House",  122, FeelModel::Minimal, 52, kMelodicHouse },

        { "TECHNO",      "Techno", 132, FeelModel::M909,    50, kTechno },
        { "MINIMAL",     "Techno", 128, FeelModel::Minimal, 50, kMinimalTechno },
        { "DETROIT",     "Techno", 130, FeelModel::M909,    54, kDetroit },
        { "ACID",        "Techno", 130, FeelModel::M909,    50, kAcid },
        { "HARD TECHNO", "Techno", 145, FeelModel::M909,    50, kHardTechno },

        { "TRANCE",      "Trance", 138, FeelModel::Minimal, 50, kTrance },
        { "PSYTRANCE",   "Trance", 145, FeelModel::Minimal, 50, kPsytrance },
        { "PROG TRANCE", "Trance", 134, FeelModel::Minimal, 52, kProgTrance },

        { "DUBSTEP",     "Bass",   140, FeelModel::M808,    50, kDubstep },
        { "DNB",         "Bass",   174, FeelModel::Minimal, 52, kDrumAndBass },
        { "JUNGLE",      "Bass",   170, FeelModel::M808,    58, kJungle },
        { "BREAKBEAT",   "Bass",   130, FeelModel::M909,    56, kBreakbeat },
        { "UK GARAGE",   "Bass",   134, FeelModel::M808,    62, kUkGarage },
        { "FUTURE BASS", "Bass",   150, FeelModel::M808,    54, kFutureBass },
        { "TRAP",        "Bass",   140, FeelModel::M808,    50, kTrap },
        { "MOOMBAHTON",  "Bass",   108, FeelModel::M808,    58, kMoombahton },
        { "HARDSTYLE",   "Bass",   150, FeelModel::M909,    50, kHardstyle },
    };
}

//==============================================================================

std::span<const Preset> presets() noexcept
{
    return kPresets;
}

void applyPreset (Engine& engine, int index)
{
    if (index < 0 || index >= static_cast<int> (std::size (kPresets)))
        return;

    const auto& preset = kPresets[static_cast<std::size_t> (index)];

    // Start from an empty grid, so what plays is the preset and not the preset over whatever
    // happened to be there.
    engine.initialisePattern (engine.patternIndex());

    auto& params = engine.parameters();
    auto& pattern = engine.currentPattern();

    // Leave headroom. The parts below are written at the levels the genre wants relative to
    // each other, and a full kit at those levels sums past full scale — measured at up to
    // +2.8 dB across the set before this was added. Trimming the parts instead would flatten
    // the balance that makes them sound like the genre.
    params.set (ParamKind::MasterVolume, 84);

    params.set (ParamKind::Tempo, preset.tempo);
    params.set (ParamKind::Feel, static_cast<int> (preset.feel));
    params.set (ParamKind::Swing, preset.swing);

    for (const auto& part : preset.tracks)
    {
        if (part.track < 0 || part.track >= kNumTracks)
            continue;

        if (part.sound >= 0)
            engine.selectSound (part.track, part.sound);

        if (part.level >= 0)
            params.set (ParamKind::TrackLevel, part.track, part.level);

        auto& steps = pattern.track (part.track).variation (Variation::A);

        auto gated = std::size_t { 0 };

        for (std::size_t i = 0; i < part.steps.size() && i < steps.size(); ++i)
        {
            const auto c = part.steps[i];

            if (c == '.')
                continue;

            auto& step = steps[i];
            step.gate = true;
            step.accent = c == 'X' ? Accent::Hard
                        : c == 'o' ? Accent::Soft
                                   : Accent::Normal;

            if (! part.notes.empty())
                step.note = static_cast<std::int8_t> (
                    part.notes[gated % part.notes.size()]);

            ++gated;
        }
    }
}

} // namespace bud::factory
