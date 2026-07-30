// Renders a demo pattern to a WAV file.
//
// The engine is framework-free, so the whole instrument can be driven offline from a command
// line. That makes the sound engine audible and testable long before there is a plugin or a
// user interface to host it.

#include "core/Engine.h"
#include "core/factory/FactoryContent.h"
#include "core/sampler/WavIo.h"
#include "demo/DemoPattern.h"

#include <cmath>
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

using namespace bud;

namespace
{

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

    demo::buildPattern (engine);
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
