#pragma once

#include "../Types.h"

#include <array>
#include <string>
#include <vector>

namespace bud
{

/** The three sample banks. Slot counts and lengths follow the modelled device. */
enum class BankId : std::uint8_t { S2 = 0, S4 = 1, S8 = 2 };

inline constexpr int kNumBanks = 3;

constexpr int slotCount (BankId bank) noexcept
{
    switch (bank)
    {
        case BankId::S2: return 32;
        case BankId::S4: return 16;
        case BankId::S8: return 12;
    }
    return 0;
}

constexpr double maxSeconds (BankId bank) noexcept
{
    switch (bank)
    {
        case BankId::S2: return 2.0;
        case BankId::S4: return 4.0;
        case BankId::S8: return 8.0;
    }
    return 0.0;
}

/// Only the loop bank is stereo.
constexpr bool isStereo (BankId bank) noexcept { return bank == BankId::S8; }

//==============================================================================

/** One sample slot.

    Audio is held as float at the engine's sample rate. The device records 48 kHz / 16-bit
    linear PCM, and that is what import and export use, but keeping the working copy in float
    avoids requantising on every edit.
*/
struct SampleData
{
    std::vector<float> left;
    std::vector<float> right;   ///< Empty for mono slots
    double sampleRate = 48000.0;
    std::string name;

    /// Musical length of the recorded material, when known. Drives repitch- and
    /// stretch-to-tempo.
    double sourceBeats = 0.0;

    bool isStereo() const noexcept { return ! right.empty(); }
    bool empty() const noexcept { return left.empty(); }
    int length() const noexcept { return static_cast<int> (left.size()); }

    void clear()
    {
        left.clear();
        right.clear();
        name.clear();
        sourceBeats = 0.0;
    }

    /// Reads a channel with bounds checking, so voices can interpolate past the end safely.
    float at (int channel, int index) const noexcept
    {
        if (index < 0 || index >= length())
            return 0.0f;

        const auto& data = (channel > 0 && isStereo()) ? right : left;
        return data[static_cast<std::size_t> (index)];
    }
};

//==============================================================================

class SampleBank
{
public:
    explicit SampleBank (BankId id) : id_ (id), slots_ (static_cast<std::size_t> (slotCount (id))) {}

    BankId id() const noexcept { return id_; }
    int numSlots() const noexcept { return static_cast<int> (slots_.size()); }

    SampleData& slot (int index) noexcept { return slots_[clampIndex (index)]; }
    const SampleData& slot (int index) const noexcept { return slots_[clampIndex (index)]; }

    void clear (int index) { slot (index).clear(); }

    void clearAll()
    {
        for (auto& s : slots_)
            s.clear();
    }

private:
    std::size_t clampIndex (int index) const noexcept
    {
        if (index < 0)
            return 0;

        const auto last = slots_.empty() ? 0 : slots_.size() - 1;
        return std::min (static_cast<std::size_t> (index), last);
    }

    BankId id_;
    std::vector<SampleData> slots_;
};

//==============================================================================

/** All three banks together — the instrument's sample content. */
class SampleLibrary
{
public:
    SampleLibrary() : banks_ { SampleBank (BankId::S2), SampleBank (BankId::S4),
                               SampleBank (BankId::S8) } {}

    SampleBank& bank (BankId id) noexcept { return banks_[static_cast<std::size_t> (id)]; }
    const SampleBank& bank (BankId id) const noexcept { return banks_[static_cast<std::size_t> (id)]; }

    void clearAll()
    {
        for (auto& b : banks_)
            b.clearAll();
    }

private:
    std::array<SampleBank, kNumBanks> banks_;
};

} // namespace bud
