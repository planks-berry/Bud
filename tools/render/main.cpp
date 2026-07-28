// Renders a demo pattern to a WAV file.
//
// The engine is framework-free, so the whole instrument can be driven offline from a command
// line. That makes the sound engine audible and testable long before there is a plugin or a
// user interface to host it.

#include "core/Engine.h"
#include "core/sampler/WavIo.h"

#include <cmath>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

using namespace bud;

namespace
{

//==============================================================================
// Stand-in sample content.
//
// The factory sound set is generated procedurally by tools/factory_gen in a later milestone.
// These two hits exist so the sample tracks are audible now.

void makeClap (SampleData& out, double sampleRate)
{
    const auto length = static_cast<int> (sampleRate * 0.35);
    out.clear();
    out.sampleRate = sampleRate;
    out.left.assign (static_cast<std::size_t> (length), 0.0f);
    out.name = "CLAP";

    std::uint32_t state = 0x9e37'79b9u;
    const auto noise = [&state]
    {
        state ^= state << 13;
        state ^= state >> 17;
        state ^= state << 5;
        return static_cast<float> (state) * (2.0f / 4294967295.0f) - 1.0f;
    };

    // Three fast repeats then a longer body — the structure that reads as a clap rather than
    // a noise burst.
    const double taps[] = { 0.0, 0.011, 0.022, 0.034 };
    const double decays[] = { 0.020, 0.020, 0.020, 0.190 };

    float bandState = 0.0f;

    for (int i = 0; i < length; ++i)
    {
        const auto t = static_cast<double> (i) / sampleRate;
        float envelope = 0.0f;

        for (int tap = 0; tap < 4; ++tap)
            if (t >= taps[tap])
                envelope += static_cast<float> (std::exp (-(t - taps[tap]) / decays[tap]));

        // A gentle band-pass keeps it from sounding like white noise.
        const auto raw = noise();
        bandState += 0.35f * (raw - bandState);
        const auto shaped = raw - bandState;

        out.left[static_cast<std::size_t> (i)] = shaped * envelope * 0.32f;
    }
}

void makeRim (SampleData& out, double sampleRate)
{
    const auto length = static_cast<int> (sampleRate * 0.12);
    out.clear();
    out.sampleRate = sampleRate;
    out.left.assign (static_cast<std::size_t> (length), 0.0f);
    out.name = "RIM";

    for (int i = 0; i < length; ++i)
    {
        const auto t = static_cast<double> (i) / sampleRate;
        const auto envelope = std::exp (-t / 0.018);

        // Two inharmonic partials give the woody click of a rim shot.
        const auto tone = std::sin (t * 2.0 * M_PI * 1720.0) * 0.6
                        + std::sin (t * 2.0 * M_PI * 2630.0) * 0.4;

        out.left[static_cast<std::size_t> (i)] = static_cast<float> (tone * envelope * 0.55);
    }
}

//==============================================================================

void gate (TrackPattern& track, std::initializer_list<int> steps, int velocity = 100,
           Accent accent = Accent::Normal)
{
    for (auto index : steps)
    {
        auto& step = track.variation (Variation::A)[static_cast<std::size_t> (index)];
        step.gate = true;
        step.velocity = static_cast<std::uint8_t> (velocity);
        step.accent = accent;
    }
}

void buildDemoPattern (Engine& engine)
{
    auto& params = engine.parameters();
    auto& pattern = engine.currentPattern();

    params.set (ParamKind::Tempo, 128.0f);
    params.set (ParamKind::Feel, static_cast<float> (FeelModel::Minimal));
    params.set (ParamKind::FeelDepth, 0.65f);
    params.set (ParamKind::MasterVolume, 0.85f);

    // ---- Kick: four on the floor -------------------------------------------
    auto& kick = pattern.track (0);
    gate (kick, { 0, 4, 8, 12 }, 110, Accent::Accent);
    params.set (ParamKind::KickDecay, 0, 520.0f);
    params.set (ParamKind::KickSweepDepth, 0, 0.55f);
    params.set (ParamKind::KickSweepTime, 0, 28.0f);
    params.set (ParamKind::KickPunch, 0, 0.35f);
    params.set (ParamKind::KickDrive, 0, 0.25f);
    params.set (ParamKind::TrackLevel, 0, 0.95f);

    // ---- Snare on the backbeat ---------------------------------------------
    auto& snare = pattern.track (2);
    gate (snare, { 4, 12 }, 96);
    params.set (ParamKind::SnareDecay, 2, 160.0f);
    params.set (ParamKind::SnareNoiseDecay, 2, 190.0f);
    params.set (ParamKind::SnareSnap, 2, 0.62f);
    params.set (ParamKind::TrackLevel, 2, 0.55f);

    // ---- Closed hats on the offbeats, with a ghosted sixteenth -------------
    auto& closedHat = pattern.track (4);
    gate (closedHat, { 2, 6, 10, 14 }, 92);
    gate (closedHat, { 3, 7, 11, 15 }, 52, Accent::DeAccent);
    closedHat.randomVelocity = 0.22f;
    params.set (ParamKind::HatDecay, 4, 52.0f);
    params.set (ParamKind::HatTone, 4, 0.62f);
    params.set (ParamKind::HatCharacter, 4, 0.45f);
    params.set (ParamKind::TrackLevel, 4, 0.42f);

    // ---- Open hat lifting the second half of the bar ------------------------
    auto& openHat = pattern.track (5);
    gate (openHat, { 14 }, 88);
    params.set (ParamKind::HatDecay, 5, 320.0f);
    params.set (ParamKind::HatTone, 5, 0.5f);
    params.set (ParamKind::TrackLevel, 5, 0.35f);

    // ---- Clap and rim from the sample banks ---------------------------------
    auto& clapTrack = pattern.track (3);
    gate (clapTrack, { 4, 12 }, 88);
    params.set (ParamKind::SampleBank, 3, 0.0f);   // S2
    params.set (ParamKind::SampleSlot, 3, 0.0f);   // clap
    params.set (ParamKind::TrackLevel, 3, 0.5f);

    auto& rimTrack = pattern.track (6);
    gate (rimTrack, { 7, 15 }, 74);
    rimTrack.variation (Variation::A)[15].subSteps = 2;
    params.set (ParamKind::SampleBank, 6, 0.0f);
    params.set (ParamKind::SampleSlot, 6, 1.0f);   // rim
    params.set (ParamKind::TrackLevel, 6, 0.45f);

    // ---- Bass line, with slides and a parameter lock ------------------------
    auto& bass = pattern.track (kBassTrack);
    gate (bass, { 0, 3, 6, 8, 11, 14 }, 100);

    auto& bassSteps = bass.variation (Variation::A);
    bassSteps[0].note = 0;    // A1
    bassSteps[3].note = 0;
    bassSteps[6].note = 12;
    bassSteps[6].slide = true;
    bassSteps[8].note = 0;
    bassSteps[11].note = 3;
    bassSteps[11].accent = Accent::Accent;
    bassSteps[14].note = 10;
    bassSteps[14].slide = true;

    // A parameter lock: this one step opens the filter well past the track setting, and the
    // lock holds for the whole step.
    bassSteps[11].locks.set (makeParamId (ParamKind::BassCutoff, kBassTrack), 2600.0f);

    params.set (ParamKind::BassWave, kBassTrack, 0.0f);   // SAW
    params.set (ParamKind::BassCutoff, kBassTrack, 620.0f);
    params.set (ParamKind::BassResonance, kBassTrack, 0.72f);
    params.set (ParamKind::BassEnvMod, kBassTrack, 0.58f);
    params.set (ParamKind::BassDecay, kBassTrack, 280.0f);
    params.set (ParamKind::BassDecayCurve, kBassTrack, 0.3f);
    params.set (ParamKind::BassAccentAmount, kBassTrack, 0.7f);
    params.set (ParamKind::BassGlideTime, kBassTrack, 55.0f);
    params.set (ParamKind::BassGateTime, kBassTrack, 0.62f);
    params.set (ParamKind::BassSubLevel, kBassTrack, 0.3f);
    params.set (ParamKind::BassOverdrive, kBassTrack, 0.3f);
    params.set (ParamKind::TrackLevel, kBassTrack, 0.7f);
}

//==============================================================================

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
    double tempo = 128.0;
    double sampleRate = 48000.0;
    int blockSize = 512;
    auto feel = FeelModel::Minimal;

    for (int i = 1; i < argc; ++i)
    {
        const auto arg = std::string (argv[i]);
        const auto next = [&] { return i + 1 < argc ? std::string (argv[++i]) : std::string(); };

        if (arg == "--out")        outputPath = next();
        else if (arg == "--bars")  bars = std::atoi (next().c_str());
        else if (arg == "--tempo") tempo = std::atof (next().c_str());
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

    if (bars <= 0 || tempo <= 0.0 || sampleRate <= 0.0 || blockSize <= 0)
        return usage();

    Engine engine;
    engine.prepare (sampleRate, blockSize);

    buildDemoPattern (engine);
    engine.parameters().set (ParamKind::Tempo, static_cast<float> (tempo));
    engine.parameters().set (ParamKind::Feel, static_cast<float> (feel));

    makeClap (engine.samples().bank (BankId::S2).slot (0), sampleRate);
    makeRim (engine.samples().bank (BankId::S2).slot (1), sampleRate);

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

    std::cout << "wrote " << outputPath << "  " << bars << " bars at " << tempo << " bpm, "
              << toString (feel) << " feel, peak " << peak << "\n";

    return 0;
}
