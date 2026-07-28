#pragma once

#include "SampleBank.h"

#include <string>

namespace bud::wav
{

/** Minimal WAV support for 16-bit linear PCM, the format the modelled device records and
    exports. Kept dependency-free so the engine and its tests need no audio library.

    Reading accepts mono or stereo 16-bit and 24-bit PCM and 32-bit float; writing always
    produces 16-bit, matching the device.
*/

/// Write interleaved stereo. Returns false if the file could not be created.
bool writeStereo (const std::string& path, const float* left, const float* right,
                  int numSamples, double sampleRate);

/// Write a single channel.
bool writeMono (const std::string& path, const float* samples, int numSamples,
                double sampleRate);

/// Load into a sample slot. Returns false on a malformed or unsupported file.
bool read (const std::string& path, SampleData& destination);

} // namespace bud::wav
