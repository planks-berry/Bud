// Renders a demo pattern to a WAV file.
//
// The engine is framework-free, so the whole instrument can be driven offline from a command
// line. That makes the sound engine audible and testable long before there is a plugin or a
// user interface to host it.

#include "core/Engine.h"
#include "core/factory/FactoryContent.h"
#include "core/sampler/WavIo.h"

#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

using namespace bud;

namespace
{

/// Gate a set of steps on a track.
void gate (TrackPattern& track, std::initializer_list<int> steps,
           Accent accent = Accent::Normal, SubStepPattern sub = SubStepPattern::Off)
{
    for (auto index : steps)
    {
        auto& step = track.variation (Variation::A)[static_cast<std::size_t> (index)];
        step.gate = true;
        step.accent = accent;
        step.subStep = sub;
    }
}

void buildDemoPattern (Engine& engine)
{
    auto& params = engine.parameters();
    auto& pattern = engine.currentPattern();

    params.set (ParamKind::Tempo, 128);
    params.set (ParamKind::Feel, static_cast<int> (FeelModel::Minimal));
    params.set (ParamKind::MasterVolume, 88);
    params.set (ParamKind::Swing, 54);

    // ---- Track 1, BD: four on the floor, synthesised ------------------------
    auto& kick = pattern.track (0);
    gate (kick, { 0, 4, 8, 12 }, Accent::Hard);
    params.set (ParamKind::TrackSoundBank, 0, static_cast<int> (SoundBank::BD));
    params.set (ParamKind::TrackTone, 0, 78);      // brighter body
    params.set (ParamKind::TrackMove, 0, 48);      // modulation time
    params.set (ParamKind::TrackAttack, 0, 40);    // attack pulse
    params.set (ParamKind::TrackDecay, 0, 84);
    params.set (ParamKind::TrackLevel, 0, 104);

    // ---- Track 3, SD: backbeat, synthesised ---------------------------------
    auto& snare = pattern.track (2);
    gate (snare, { 4, 12 });
    params.set (ParamKind::TrackSoundBank, 2, static_cast<int> (SoundBank::SD));
    params.set (ParamKind::TrackSnappyType, 2, static_cast<int> (SnappyType::N99));
    params.set (ParamKind::TrackTone, 2, 88);      // snappy volume
    params.set (ParamKind::TrackAttack, 2, 52);    // overtone mix
    params.set (ParamKind::TrackDecay, 2, 58);
    params.set (ParamKind::TrackLevel, 2, 82);
    params.set (ParamKind::TrackPan, 2, 60);

    // ---- Track 4, CP: clap doubling the backbeat ----------------------------
    auto& clap = pattern.track (3);
    gate (clap, { 4, 12 });
    params.set (ParamKind::TrackSoundBank, 3, static_cast<int> (SoundBank::CP));
    params.set (ParamKind::TrackSound, 3, 20);
    params.set (ParamKind::TrackLevel, 3, 74);
    params.set (ParamKind::TrackPan, 3, 74);

    // ---- Track 5, CH: closed hats with a ratcheted sixteenth ---------------
    auto& closedHat = pattern.track (4);
    gate (closedHat, { 2, 6, 10 });
    gate (closedHat, { 14 }, Accent::Normal, SubStepPattern::Four_1010);
    gate (closedHat, { 3, 7, 11, 15 }, Accent::Soft);
    params.set (ParamKind::TrackSoundBank, 4, static_cast<int> (SoundBank::HH_CY));
    params.set (ParamKind::TrackSound, 4, 8);      // tight end of the bank
    params.set (ParamKind::TrackTone, 4, 78);      // slight high-pass
    params.set (ParamKind::TrackDecay, 4, 40);
    params.set (ParamKind::TrackLevel, 4, 70);
    params.set (ParamKind::TrackRandomVelocity, 4, 70);
    params.set (ParamKind::TrackChoke, 4, 1);

    // ---- Track 6, OH: open hat lifting the bar ------------------------------
    auto& openHat = pattern.track (5);
    gate (openHat, { 14 });
    params.set (ParamKind::TrackSoundBank, 5, static_cast<int> (SoundBank::HH_CY));
    params.set (ParamKind::TrackSound, 5, 90);     // open end of the bank
    params.set (ParamKind::TrackDecay, 5, 96);
    params.set (ParamKind::TrackLevel, 5, 62);
    params.set (ParamKind::TrackChoke, 5, 1);

    // ---- Track 7, TT: a tom fill on the offbeat -----------------------------
    auto& tom = pattern.track (6);
    gate (tom, { 7 });
    gate (tom, { 15 }, Accent::Normal, SubStepPattern::Three_111);
    params.set (ParamKind::TrackSoundBank, 6, static_cast<int> (SoundBank::TT));
    params.set (ParamKind::TrackSound, 6, 40);
    params.set (ParamKind::TrackLevel, 6, 68);
    params.set (ParamKind::TrackPan, 6, 48);

    // ---- Track 9, PC: percussion running at 1/8 against the rest -----------
    auto& perc = pattern.track (8);
    gate (perc, { 1, 5 });
    params.set (ParamKind::TrackSoundBank, 8, static_cast<int> (SoundBank::PC));
    params.set (ParamKind::TrackSound, 8, 55);
    params.set (ParamKind::TrackNoteLength, 8, static_cast<int> (StepDivision::Eighth));
    params.set (ParamKind::TrackStepLength, 8, 6);   // polymetric against the 16-step tracks
    params.set (ParamKind::TrackLevel, 8, 58);
    params.set (ParamKind::TrackPan, 8, 84);

    // ---- Track 11, BASS: acid line with glide and a parameter lock ---------
    auto& bass = pattern.track (kBassTrack);
    gate (bass, { 0, 3, 6, 8, 11, 14 });

    auto& bassSteps = bass.variation (Variation::A);
    bassSteps[0].note = 0;
    bassSteps[3].note = 0;
    bassSteps[6].note = 12;
    bassSteps[6].glide = true;
    bassSteps[8].note = 0;
    bassSteps[11].note = 3;
    bassSteps[11].accent = Accent::Hard;
    bassSteps[14].note = 10;
    bassSteps[14].glide = true;

    // A parameter lock: this one step opens the filter well past the track setting, and the
    // lock holds for the whole step.
    bassSteps[11].locks.set (makeParamId (ParamKind::BassCutoff, kBassTrack), 105);

    params.set (ParamKind::TrackSoundBank, kBassTrack, static_cast<int> (SoundBank::BASS));
    params.set (ParamKind::TrackSound, kBassTrack, 0);     // SAW
    params.set (ParamKind::TrackTone, kBassTrack, 40);     // sub one octave down
    params.set (ParamKind::TrackMove, kBassTrack, 58);     // glide time
    params.set (ParamKind::TrackAttack, kBassTrack, 40);   // filter envelope curve
    params.set (ParamKind::TrackDecay, kBassTrack, 70);    // gate time
    params.set (ParamKind::TrackLevel, kBassTrack, 46);    // sub oscillator level
    params.set (ParamKind::BassCutoff, kBassTrack, 54);
    params.set (ParamKind::BassResonance, kBassTrack, 96);
    params.set (ParamKind::BassEnvDepth, kBassTrack, 78);
    params.set (ParamKind::BassEnvDecay, kBassTrack, 56);
    params.set (ParamKind::BassAccent, kBassTrack, 92);
    params.set (ParamKind::BassDriveEnabled, kBassTrack, 1);
    params.set (ParamKind::BassDrive, kBassTrack, 46);
    params.set (ParamKind::BassLevel, kBassTrack, 96);
    params.set (ParamKind::BassGlideCurve, kBassTrack, 80);
}

int usage()
{
    std::cout << "usage: bud-render [--out FILE] [--bars N] [--tempo BPM]\n"
                 "                  [--feel 808|909|minimal] [--rate HZ] [--block N]\n";
    return 1;
}

} // namespace

int main (int argc, char** argv)
{
    std::string outputPath = "bud-demo.wav";
    int bars = 4;
    int tempo = 128;
    double sampleRate = 48000.0;
    int blockSize = 512;
    auto feel = FeelModel::Minimal;

    for (int i = 1; i < argc; ++i)
    {
        const auto arg = std::string (argv[i]);
        const auto next = [&] { return i + 1 < argc ? std::string (argv[++i]) : std::string(); };

        if (arg == "--out")        outputPath = next();
        else if (arg == "--bars")  bars = std::atoi (next().c_str());
        else if (arg == "--tempo") tempo = std::atoi (next().c_str());
        else if (arg == "--rate")  sampleRate = std::atof (next().c_str());
        else if (arg == "--block") blockSize = std::atoi (next().c_str());
        else if (arg == "--feel")
        {
            const auto value = next();
            if (value == "808")          feel = FeelModel::M808;
            else if (value == "909")     feel = FeelModel::M909;
            else if (value == "minimal") feel = FeelModel::Minimal;
            else return usage();
        }
        else return usage();
    }

    if (bars <= 0 || tempo <= 0 || sampleRate <= 0.0 || blockSize <= 0)
        return usage();

    Engine engine;
    engine.prepare (sampleRate, blockSize);

    buildDemoPattern (engine);
    engine.parameters().set (ParamKind::Tempo, tempo);
    engine.parameters().set (ParamKind::Feel, static_cast<int> (feel));

    // Four quarter notes to the bar, at the pattern's sixteenth-note resolution.
    const auto samplesPerBar = sampleRate * 60.0 / tempo * 4.0;
    const auto totalSamples = static_cast<int> (samplesPerBar * bars);

    std::vector<float> left (static_cast<std::size_t> (totalSamples), 0.0f);
    std::vector<float> right (static_cast<std::size_t> (totalSamples), 0.0f);

    engine.start();

    for (int position = 0; position < totalSamples; position += blockSize)
    {
        const auto count = std::min (blockSize, totalSamples - position);
        engine.process (left.data() + position, right.data() + position, count);
    }

    if (! wav::writeStereo (outputPath, left.data(), right.data(), totalSamples, sampleRate))
    {
        std::cerr << "could not write " << outputPath << "\n";
        return 1;
    }

    auto peak = 0.0f;
    for (int i = 0; i < totalSamples; ++i)
        peak = std::max (peak, std::max (std::abs (left[i]), std::abs (right[i])));

    std::cout << "wrote " << outputPath << "  " << bars << " bars at " << tempo << " bpm, feel "
              << toString (feel) << ", " << factory::totalSoundCount()
              << " factory sounds, peak " << peak << "\n";

    return 0;
}
