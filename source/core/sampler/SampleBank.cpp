#include "SampleBank.h"

namespace bud
{

SoundLibrary::SoundLibrary()
{
    user_[0].resize (static_cast<std::size_t> (userSlotCount (SoundBank::S2)));
    user_[1].resize (static_cast<std::size_t> (userSlotCount (SoundBank::S4)));
    user_[2].resize (static_cast<std::size_t> (userSlotCount (SoundBank::S8)));
}

int SoundLibrary::userBankIndex (SoundBank bank) noexcept
{
    switch (bank)
    {
        case SoundBank::S2: return 0;
        case SoundBank::S4: return 1;
        case SoundBank::S8: return 2;
        default:            return -1;
    }
}

SampleData& SoundLibrary::userSlot (SoundBank bank, int index) noexcept
{
    const auto bankIndex = userBankIndex (bank);

    if (bankIndex < 0)
        return empty_;

    auto& slots = user_[static_cast<std::size_t> (bankIndex)];

    if (slots.empty())
        return empty_;

    const auto clamped = std::clamp (index, 0, static_cast<int> (slots.size()) - 1);
    return slots[static_cast<std::size_t> (clamped)];
}

const SampleData& SoundLibrary::userSlot (SoundBank bank, int index) const noexcept
{
    return const_cast<SoundLibrary*> (this)->userSlot (bank, index);
}

int SoundLibrary::count (SoundBank bank) const noexcept
{
    const auto bankIndex = userBankIndex (bank);

    if (bankIndex >= 0)
        return static_cast<int> (user_[static_cast<std::size_t> (bankIndex)].size());

    return static_cast<int> (factory_[static_cast<std::size_t> (bank)].size());
}

const SampleData* SoundLibrary::find (SoundBank bank, int index) const noexcept
{
    const SampleData* sample = nullptr;

    if (userBankIndex (bank) >= 0)
    {
        sample = &userSlot (bank, index);
    }
    else
    {
        const auto& sounds = factory_[static_cast<std::size_t> (bank)];

        if (sounds.empty())
            return nullptr;

        // The SOUND knob spans 0-127; a bank holding fewer sounds wraps rather than
        // dead-zoning the top of the knob.
        const auto wrapped = static_cast<std::size_t> (
            std::max (0, index) % static_cast<int> (sounds.size()));

        sample = &sounds[wrapped];
    }

    return (sample != nullptr && ! sample->empty()) ? sample : nullptr;
}

void SoundLibrary::clearAll()
{
    for (auto& bank : factory_)
        bank.clear();

    for (auto& bank : user_)
        for (auto& slot : bank)
            slot.clear();
}

} // namespace bud
