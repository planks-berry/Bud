#pragma once

#include "../sampler/SampleBank.h"

namespace bud::factory
{

/** The factory sound set.

    The drum engine is sample-based for every bank except BD on track 1 and SD on track 3
    (p. 60), so this is not decoration — it is what most of the instrument plays. Without it the
    drum tracks are silent.

    The modelled device ships 132 sounds across ten banks. These are **original** sounds
    synthesized to fill the same structure; no audio is copied from any hardware device, and none
    is committed to the repository. Generation is deterministic, so a rendered pattern is
    reproducible and the golden-file tests hold.
*/

/// Number of sounds this generator produces for a bank.
int soundCount (SoundBank) noexcept;

/// Total across every factory bank. Matches the device's count.
int totalSoundCount() noexcept;

/// Fill every factory bank. Existing user sample banks are left alone.
void generate (SoundLibrary&, double sampleRate);

/// Fill a single bank, for tests and for regenerating after a sample-rate change.
void generateBank (SoundLibrary&, SoundBank, double sampleRate);

} // namespace bud::factory
