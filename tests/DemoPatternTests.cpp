#include "TestFramework.h"

#include "core/Engine.h"
#include "demo/DemoPattern.h"

#include <algorithm>
#include <cmath>
#include <vector>

using namespace bud;

// The demo pattern is the busiest thing the engine plays: both synthesis engines, sampled banks,
// a polymetric track at a different division, sub-step ratchets, swing, choke, random velocity, a
// parameter lock, both sends and the whole effects chain. That makes it the best single fixture
// for whole-engine properties, and it is also what `docs/BUILDING.md` tells a reader to render.
//
// These tests exist because that document made a claim the suite did not check. It says rendering
// this pattern at two buffer sizes produces identical files — and it did not, because the
// transport re-anchored its musical origin once per block. The suite's own fixtures were simple
// enough to stay clean while this one diverged, so nothing caught it.

namespace
{

constexpr double kSampleRate = 48000.0;

struct Render
{
    std::vector<float> left, right;

    float peak() const
    {
        auto p = 0.0f;

        for (std::size_t i = 0; i < left.size(); ++i)
            p = std::max (p, std::max (std::abs (left[i]), std::abs (right[i])));

        return p;
    }
};

/// Four bars at the pattern's own tempo, which is what `bud-render` produces by default.
Render renderDemo (int blockSize, int totalSamples = static_cast<int> (kSampleRate * 7.5))
{
    Engine engine;
    engine.prepare (kSampleRate, 8192);
    demo::buildPattern (engine);

    Render out;
    out.left.assign (static_cast<std::size_t> (totalSamples), 0.0f);
    out.right.assign (static_cast<std::size_t> (totalSamples), 0.0f);

    engine.start();

    for (int position = 0; position < totalSamples; position += blockSize)
    {
        const auto count = std::min (blockSize, totalSamples - position);
        engine.process (out.left.data() + position, out.right.data() + position, count);
    }

    return out;
}

} // namespace

//==============================================================================

BUD_TEST (Demo, patternMakesSoundAndStaysInRange)
{
    const auto out = renderDemo (512);

    CHECK (out.peak() > 0.2f);
    CHECK (out.peak() < 1.0f);   // headroom left, so nothing is clipping

    for (std::size_t i = 0; i < out.left.size(); ++i)
    {
        CHECK (std::isfinite (out.left[i]));
        CHECK (std::isfinite (out.right[i]));
    }
}

BUD_TEST (Demo, renderIsIdenticalAtEveryBlockSizeSampleForSample)
{
    // The claim in docs/BUILDING.md, asserted rather than trusted. Exact equality: a tolerance is
    // the wrong assertion, and a 1e-6 one is what let a 1e-7 per-block error survive long enough
    // to flip samples in a rendered 16-bit WAV.
    const auto reference = renderDemo (512);

    CHECK (reference.peak() > 0.2f);

    for (int blockSize : { 1, 2, 7, 64, 333, 1024, 4096, 8192 })
    {
        const auto out = renderDemo (blockSize);

        int differing = 0;

        for (std::size_t i = 0; i < reference.left.size(); ++i)
            if (out.left[i] != reference.left[i] || out.right[i] != reference.right[i])
                ++differing;

        CHECK_EQ (differing, 0);
    }
}

BUD_TEST (Demo, aBlockSizeThatChangesEveryCallIsAlsoIdentical)
{
    // Hosts do not promise a constant buffer size. A varying one is the case a fixed-size loop
    // can pass while still being wrong, so it is worth its own check: the engine must not care
    // where the boundaries fall, only how many samples have gone by.
    const auto reference = renderDemo (512);

    Engine engine;
    engine.prepare (kSampleRate, 8192);
    demo::buildPattern (engine);

    const auto total = static_cast<int> (reference.left.size());
    std::vector<float> left (static_cast<std::size_t> (total), 0.0f);
    std::vector<float> right (static_cast<std::size_t> (total), 0.0f);

    engine.start();

    // A repeating cycle of awkward sizes, including 1.
    constexpr int sizes[] = { 1, 129, 17, 512, 3, 700, 64, 1, 2048, 5 };
    int which = 0;

    for (int position = 0; position < total;)
    {
        const auto count = std::min (sizes[which % 10], total - position);
        engine.process (left.data() + position, right.data() + position, count);
        position += count;
        ++which;
    }

    int differing = 0;

    for (std::size_t i = 0; i < reference.left.size(); ++i)
        if (left[i] != reference.left[i] || right[i] != reference.right[i])
            ++differing;

    CHECK_EQ (differing, 0);
}

BUD_TEST (Demo, aSecondRenderFromAFreshEngineIsIdentical)
{
    // Determinism across instances, not just within one. FEEL drift and random velocity are both
    // seeded, so two fresh engines must agree exactly — otherwise a rendered demo would not be
    // reproducible and the invariance checks above would be comparing moving targets.
    const auto first = renderDemo (512, static_cast<int> (kSampleRate * 2));
    const auto second = renderDemo (512, static_cast<int> (kSampleRate * 2));

    int differing = 0;

    for (std::size_t i = 0; i < first.left.size(); ++i)
        if (first.left[i] != second.left[i] || first.right[i] != second.right[i])
            ++differing;

    CHECK_EQ (differing, 0);
}

BUD_TEST (Demo, aBlockLargerThanPreparedForIsSplitRatherThanTruncated)
{
    // Hosts do ask for more than they promised — an offline bounce is the usual way. Truncating
    // filled only the first `maxBlockSize` frames and left the rest of the caller's buffer
    // untouched, which in a plugin means whatever the host had in it gets played.
    const auto reference = renderDemo (512, static_cast<int> (kSampleRate * 2));
    const auto total = static_cast<int> (reference.left.size());

    Engine engine;
    engine.prepare (kSampleRate, 256);      // promised 256
    demo::buildPattern (engine);

    // Poison the buffers, so anything the engine fails to write shows up rather than reading as
    // plausible silence.
    std::vector<float> left (static_cast<std::size_t> (total), 12345.0f);
    std::vector<float> right (static_cast<std::size_t> (total), 12345.0f);

    engine.start();

    for (int position = 0; position < total; position += 4096)   // asked for 4096
        engine.process (left.data() + position, right.data() + position,
                        std::min (4096, total - position));

    int untouched = 0;

    for (std::size_t i = 0; i < left.size(); ++i)
        if (left[i] == 12345.0f || right[i] == 12345.0f)
            ++untouched;

    CHECK_EQ (untouched, 0);

    // And the split output is the same audio, not merely present — which holds only because the
    // engine is block-size invariant in the first place.
    int differing = 0;

    for (std::size_t i = 0; i < reference.left.size(); ++i)
        if (left[i] != reference.left[i] || right[i] != reference.right[i])
            ++differing;

    CHECK_EQ (differing, 0);
}

BUD_TEST (Demo, aReusedEngineRendersIdenticallyAfterBeingPreparedAgain)
{
    // Hosts call prepareToPlay repeatedly — on a sample-rate change, a buffer-size change, or
    // simply when reopening a project — and an offline bounce must match what was heard. So
    // preparing an engine that has already rendered has to put it back where it started.
    //
    // Every other test builds a fresh Engine, which is why nothing caught this: two separate
    // faults survived, and both only showed on a *reused* engine. The synth voices' noise
    // generators carried their PRNG state across `reset`, and the tape echo's glide restored to
    // the last commanded delay rather than to a defined starting point.
    Engine engine;

    const auto render = [&engine]
    {
        engine.prepare (kSampleRate, 8192);
        demo::buildPattern (engine);
        engine.start();

        const auto total = static_cast<int> (kSampleRate * 2);
        Render out;
        out.left.assign (static_cast<std::size_t> (total), 0.0f);
        out.right.assign (static_cast<std::size_t> (total), 0.0f);

        for (int position = 0; position < total; position += 512)
            engine.process (out.left.data() + position, out.right.data() + position,
                            std::min (512, total - position));

        return out;
    };

    const auto first = render();
    const auto second = render();
    const auto third = render();

    CHECK (first.peak() > 0.2f);

    int differing = 0;

    for (std::size_t i = 0; i < first.left.size(); ++i)
    {
        if (first.left[i] != second.left[i] || first.right[i] != second.right[i])
            ++differing;

        if (second.left[i] != third.left[i] || second.right[i] != third.right[i])
            ++differing;
    }

    CHECK_EQ (differing, 0);
}

BUD_TEST (Demo, aReusedEngineMatchesAFreshOne)
{
    // Stronger than self-consistency: a reused engine must agree with one that has never
    // rendered, or a re-opened project would sound different from a new one.
    Engine fresh;
    fresh.prepare (kSampleRate, 8192);
    demo::buildPattern (fresh);
    fresh.start();

    const auto play = [] (Engine& engine)
    {
        constexpr auto count = static_cast<int> (kSampleRate * 2);

        std::vector<float> left (static_cast<std::size_t> (count), 0.0f);
        std::vector<float> right (static_cast<std::size_t> (count), 0.0f);

        for (int position = 0; position < count; position += 512)
            engine.process (left.data() + position, right.data() + position,
                            std::min (512, count - position));

        return std::pair { left, right };
    };

    const auto [freshLeft, freshRight] = play (fresh);

    Engine reused;
    reused.prepare (kSampleRate, 8192);
    demo::buildPattern (reused);
    reused.start();
    play (reused);                       // burn one render, leaving state behind

    reused.prepare (kSampleRate, 8192);  // and prepare again, as a host would
    demo::buildPattern (reused);
    reused.start();
    const auto [reusedLeft, reusedRight] = play (reused);

    int differing = 0;

    for (std::size_t i = 0; i < freshLeft.size(); ++i)
        if (freshLeft[i] != reusedLeft[i] || freshRight[i] != reusedRight[i])
            ++differing;

    CHECK_EQ (differing, 0);
}
