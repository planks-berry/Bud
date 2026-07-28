#include "WavIo.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <vector>

namespace bud::wav
{

namespace
{
    void putU32 (std::vector<char>& out, std::uint32_t value)
    {
        out.push_back (static_cast<char> (value & 0xff));
        out.push_back (static_cast<char> ((value >> 8) & 0xff));
        out.push_back (static_cast<char> ((value >> 16) & 0xff));
        out.push_back (static_cast<char> ((value >> 24) & 0xff));
    }

    void putU16 (std::vector<char>& out, std::uint16_t value)
    {
        out.push_back (static_cast<char> (value & 0xff));
        out.push_back (static_cast<char> ((value >> 8) & 0xff));
    }

    void putTag (std::vector<char>& out, const char* tag)
    {
        out.insert (out.end(), tag, tag + 4);
    }

    std::int16_t toPcm16 (float sample) noexcept
    {
        // Scale by 32768 and clamp, rather than scaling by 32767. Reading divides by 32768,
        // so matching the two makes the round trip lossless apart from quantisation; scaling
        // by 32767 on the way out would leave a systematic gain error of one part in 32768 on
        // every sample that survives a save/load cycle.
        const auto scaled = std::lrint (std::clamp (sample, -1.0f, 1.0f) * 32768.0f);
        return static_cast<std::int16_t> (std::clamp<long> (scaled, -32768, 32767));
    }

    bool writeInterleaved (const std::string& path, const float* const* channels,
                           int numChannels, int numSamples, double sampleRate)
    {
        if (numSamples < 0 || numChannels < 1)
            return false;

        const auto channelCount = static_cast<std::uint16_t> (numChannels);
        const auto bitsPerSample = std::uint16_t { 16 };
        const auto blockAlign = static_cast<std::uint16_t> (channelCount * bitsPerSample / 8);
        const auto byteRate = static_cast<std::uint32_t> (sampleRate) * blockAlign;
        const auto dataBytes = static_cast<std::uint32_t> (numSamples) * blockAlign;

        std::vector<char> header;
        header.reserve (44);

        putTag (header, "RIFF");
        putU32 (header, 36u + dataBytes);
        putTag (header, "WAVE");
        putTag (header, "fmt ");
        putU32 (header, 16u);                                    // PCM chunk size
        putU16 (header, 1u);                                     // PCM
        putU16 (header, channelCount);
        putU32 (header, static_cast<std::uint32_t> (sampleRate));
        putU32 (header, byteRate);
        putU16 (header, blockAlign);
        putU16 (header, bitsPerSample);
        putTag (header, "data");
        putU32 (header, dataBytes);

        std::ofstream file (path, std::ios::binary);

        if (! file)
            return false;

        file.write (header.data(), static_cast<std::streamsize> (header.size()));

        std::vector<std::int16_t> block;
        block.reserve (static_cast<std::size_t> (numSamples) * channelCount);

        for (int i = 0; i < numSamples; ++i)
            for (int c = 0; c < numChannels; ++c)
                block.push_back (toPcm16 (channels[c][i]));

        file.write (reinterpret_cast<const char*> (block.data()),
                    static_cast<std::streamsize> (block.size() * sizeof (std::int16_t)));

        return file.good();
    }

    std::uint32_t readU32 (const char* p) noexcept
    {
        return static_cast<std::uint32_t> (static_cast<unsigned char> (p[0]))
             | (static_cast<std::uint32_t> (static_cast<unsigned char> (p[1])) << 8)
             | (static_cast<std::uint32_t> (static_cast<unsigned char> (p[2])) << 16)
             | (static_cast<std::uint32_t> (static_cast<unsigned char> (p[3])) << 24);
    }

    std::uint16_t readU16 (const char* p) noexcept
    {
        return static_cast<std::uint16_t> (
            static_cast<unsigned char> (p[0])
            | (static_cast<unsigned int> (static_cast<unsigned char> (p[1])) << 8));
    }
}

//==============================================================================

bool writeStereo (const std::string& path, const float* left, const float* right,
                  int numSamples, double sampleRate)
{
    const float* channels[2] { left, right };
    return writeInterleaved (path, channels, 2, numSamples, sampleRate);
}

bool writeMono (const std::string& path, const float* samples, int numSamples,
                double sampleRate)
{
    const float* channels[1] { samples };
    return writeInterleaved (path, channels, 1, numSamples, sampleRate);
}

//==============================================================================

bool read (const std::string& path, SampleData& destination)
{
    std::ifstream file (path, std::ios::binary | std::ios::ate);

    if (! file)
        return false;

    const auto size = static_cast<std::size_t> (file.tellg());

    if (size < 44)
        return false;

    file.seekg (0);
    std::vector<char> bytes (size);
    file.read (bytes.data(), static_cast<std::streamsize> (size));

    if (std::memcmp (bytes.data(), "RIFF", 4) != 0
        || std::memcmp (bytes.data() + 8, "WAVE", 4) != 0)
        return false;

    std::uint16_t format = 0;
    std::uint16_t channels = 0;
    std::uint16_t bits = 0;
    std::uint32_t rate = 44100;
    std::size_t dataOffset = 0;
    std::size_t dataBytes = 0;

    // Walk the chunk list rather than assuming a canonical 44-byte header — files written by
    // DAWs routinely carry LIST or fact chunks before the data.
    std::size_t cursor = 12;

    while (cursor + 8 <= size)
    {
        const auto* id = bytes.data() + cursor;
        const auto chunkSize = readU32 (bytes.data() + cursor + 4);
        const auto body = cursor + 8;

        if (std::memcmp (id, "fmt ", 4) == 0 && body + 16 <= size)
        {
            format = readU16 (bytes.data() + body);
            channels = readU16 (bytes.data() + body + 2);
            rate = readU32 (bytes.data() + body + 4);
            bits = readU16 (bytes.data() + body + 14);
        }
        else if (std::memcmp (id, "data", 4) == 0)
        {
            dataOffset = body;
            dataBytes = std::min (static_cast<std::size_t> (chunkSize), size - body);
        }

        cursor = body + chunkSize + (chunkSize & 1u);   // chunks are word aligned
    }

    if (dataOffset == 0 || channels == 0 || channels > 2)
        return false;

    const auto bytesPerSample = static_cast<std::size_t> (bits / 8);

    if (bytesPerSample == 0)
        return false;

    const auto frames = dataBytes / (bytesPerSample * channels);

    destination.clear();
    destination.sampleRate = static_cast<double> (rate);
    destination.left.resize (frames);

    if (channels == 2)
        destination.right.resize (frames);

    const auto* data = bytes.data() + dataOffset;

    for (std::size_t frame = 0; frame < frames; ++frame)
    {
        for (std::uint16_t channel = 0; channel < channels; ++channel)
        {
            const auto* p = data + (frame * channels + channel) * bytesPerSample;
            float value = 0.0f;

            if (format == 3 && bits == 32)          // IEEE float
            {
                std::memcpy (&value, p, sizeof (float));
            }
            else if (bits == 16)
            {
                std::int16_t raw = 0;
                std::memcpy (&raw, p, sizeof (raw));
                value = static_cast<float> (raw) / 32768.0f;
            }
            else if (bits == 24)
            {
                const auto raw = static_cast<std::int32_t> (
                    (static_cast<std::uint32_t> (static_cast<unsigned char> (p[0])) << 8)
                    | (static_cast<std::uint32_t> (static_cast<unsigned char> (p[1])) << 16)
                    | (static_cast<std::uint32_t> (static_cast<unsigned char> (p[2])) << 24));
                value = static_cast<float> (raw) / 2147483648.0f;
            }
            else
            {
                return false;
            }

            if (channel == 0)
                destination.left[frame] = value;
            else
                destination.right[frame] = value;
        }
    }

    return true;
}

} // namespace bud::wav
