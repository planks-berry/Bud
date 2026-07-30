#pragma once

#include "core/Engine.h"

namespace bud::demo
{

/** The demo pattern the offline renderer plays, and the fixture the test suite renders.

    It lives here rather than inside the render tool because both need it. `docs/BUILDING.md`
    tells a reader to check block-size invariance by rendering this pattern at two buffer sizes
    and comparing the files, so the test suite has to be able to assert the same property on the
    same pattern. When it could not, the two drifted: a per-block re-anchor in the transport broke
    invariance on this pattern while the suite's simpler fixtures stayed clean.

    It is deliberately busy — both synthesis engines, sampled banks, a polymetric track, sub-step
    ratchets, swing, choke, random velocity, a parameter lock, sends and the effects chain — so it
    exercises far more of the engine at once than a purpose-built test pattern does.
*/
void buildPattern (Engine&);

} // namespace bud::demo
