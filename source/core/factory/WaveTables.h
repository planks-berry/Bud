#pragma once

#include "../dsp/WaveTable.h"

#include <memory>
#include <span>
#include <string>
#include <string_view>
#include <vector>

namespace bud::factory
{

/** The wavetables the instrument can play, factory and custom, behind one lookup.

    The point of this class is the *custom* half. A wavetable engine whose tables are fixed is
    just an oscillator with more waveforms; what makes it worth building is that a table can be
    described — as harmonics, or as cycles of audio — and played immediately, band-limited, at
    any pitch.

    Two ways in, because the two things people have are different:

      addHarmonic   you know what you want it to contain: "odd harmonics falling at 1/n²"
      addCycles     you have the waveform: a recording, a drawing, something generated elsewhere

    Both end up in the same place. `addCycles` analyses what it is given into harmonics first,
    which is what allows it to be played an octave up without aliasing — filtering a buffer that
    has already aliased cannot undo it.
*/
class WaveTableBank
{
public:
    WaveTableBank();

    /// Fill with the factory set. Called by the engine; deterministic.
    void generateFactory();

    int size() const noexcept { return static_cast<int> (entries_.size()); }
    bool empty() const noexcept { return entries_.empty(); }

    /// The table at an index, wrapping like the SOUND knob does, or nullptr when empty.
    const dsp::WaveTable* at (int index) const noexcept;
    std::string_view nameAt (int index) const noexcept;

    /// Index of a table by name, or -1.
    int indexOf (std::string_view name) const noexcept;

    /** Add a table from harmonic content, one spec per frame.

        Returns its index. A table needs at least one frame; more than one gives it something to
        morph between, which is what the MOVE knob reaches.
    */
    int addHarmonic (std::string_view name, std::span<const dsp::HarmonicSpec> frames);

    /** Add a table from cycles of audio, one per frame.

        Cycles may be any length and need not match each other — each is resampled and analysed.
    */
    int addCycles (std::string_view name, std::span<const std::span<const float>> cycles);

    /// Remove everything, factory included.
    void clear();

    /// How many of the entries came from generateFactory(), so custom ones can be told apart.
    int factoryCount() const noexcept { return factoryCount_; }

private:
    struct Entry
    {
        std::string name;
        std::unique_ptr<dsp::WaveTable> table;
    };

    std::vector<Entry> entries_;
    int factoryCount_ = 0;
};

} // namespace bud::factory
