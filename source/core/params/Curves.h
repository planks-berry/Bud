#pragma once

#include "../Types.h"

#include <algorithm>
#include <cmath>

/** Mapping from the hardware's raw 0-127 domain to real quantities.

    Parameters are stored exactly as the device stores them — an integer 0-127 for nearly
    everything. That keeps MIDI CC, parameter locks, saved state and the display identical to the
    hardware, but it means something has to decide that decay 64 is *this many* milliseconds.
    That decision lives here and nowhere else.

    The manual gives control ranges and directions ("higher values result in a longer time") but
    almost never the underlying quantity, so most of these curves are choices rather than facts.
    docs/PARAMETERS.md tabulates every one of them and marks it Measured or Chosen; this header
    is that document in executable form. Calibrating against hardware means editing one constant
    here and the matching row there.
*/
namespace bud::curves
{

//==============================================================================
// Raw helpers

/// Clamp to the hardware's raw domain.
constexpr int clampRaw (int v) noexcept
{
    return std::clamp (v, kRawMin, kRawMax);
}

/// Raw 0-127 to a 0-1 unit value.
constexpr float unit (int v) noexcept
{
    return static_cast<float> (clampRaw (v)) * (1.0f / static_cast<float> (kRawMax));
}

/// Raw 0-127 to -1..+1, with the detent at 64 landing exactly on zero.
constexpr float bipolar (int v) noexcept
{
    const auto c = clampRaw (v) - kRawCentre;
    const auto span = v >= kRawCentre ? (kRawMax - kRawCentre) : kRawCentre;
    return static_cast<float> (c) / static_cast<float> (span);
}

//==============================================================================
// Global laws — see docs/PARAMETERS.md

/** Level law. Raw 0-127 spans -inf to +6 dB (Measured, p. 27).

    Unity sits at **100**, which is also the default, so a track, a pattern and the master at
    their default values give exactly unity gain rather than compounding a couple of decibels
    at each of the three stages. Above 100 the law runs linearly to +6 dB at 127; below it a
    square taper keeps resolution at the quiet end, where fader precision is wanted.
*/
inline constexpr int kLevelUnity = 100;

inline float levelGain (int v) noexcept
{
    const auto raw = clampRaw (v);

    if (raw <= 0)
        return 0.0f;

    if (raw <= kLevelUnity)
    {
        const auto u = static_cast<float> (raw) / static_cast<float> (kLevelUnity);
        return u * u;
    }

    return 1.0f + static_cast<float> (raw - kLevelUnity)
                / static_cast<float> (kRawMax - kLevelUnity);
}

/** Constant-power pan. Raw 0-127 spans L63 - C - R63 (Measured, p. 27).

    Constant power rather than linear because pan is parameter-lockable per step, and a linear
    law makes a swept pan audibly dip through the centre.
*/
struct PanGains { float left, right; };

inline PanGains panGains (int v) noexcept
{
    // Positioned from the detent rather than from unit(v): 0-127 has 128 values, so its
    // arithmetic midpoint is 63.5 and a knob at the detent of 64 would sit slightly right of
    // centre. Going through bipolar() puts 64 exactly in the middle.
    const auto t = (static_cast<double> (bipolar (v)) + 1.0) * 0.5;
    const auto theta = t * 1.5707963267948966;

    return { static_cast<float> (std::cos (theta)), static_cast<float> (std::sin (theta)) };
}

/// Send law. Squared so low send amounts stay controllable (Measured range, p. 27).
inline float sendAmount (int v) noexcept
{
    const auto u = unit (v);
    return u * u;
}

/// The general time law: exponential, because time is perceived logarithmically.
inline float timeMs (int v, float minMs, float maxMs) noexcept
{
    if (minMs <= 0.0f)
        return minMs + (maxMs - minMs) * unit (v);

    return minMs * std::pow (maxMs / minMs, unit (v));
}

/// Tune, +/- 24 semitones with the detent at 64.
inline float tuneSemitones (int v) noexcept
{
    return bipolar (v) * 24.0f;
}

inline float semitonesToRatio (float semitones) noexcept
{
    return std::pow (2.0f, semitones * (1.0f / 12.0f));
}

inline float centsToRatio (float cents) noexcept
{
    return std::pow (2.0f, cents * (1.0f / 1200.0f));
}

//==============================================================================
// TONE — the bipolar filter (Measured, p. 65)

enum class ToneFilterMode { Bypassed, LowPass, HighPass };

struct ToneFilter
{
    ToneFilterMode mode;
    float cutoffHz;
};

/** One knob spanning LPF50 - FLT OFF - HPF50.

    Below the detent it is a low-pass, above it a high-pass, and *at* the detent the filter is
    bypassed outright rather than parked at an extreme — a filter sitting at the top of its range
    still colours the signal, and the device's centre position does not.
*/
inline ToneFilter toneFilter (int v) noexcept
{
    const auto raw = clampRaw (v);

    if (raw == kRawCentre)
        return { ToneFilterMode::Bypassed, 0.0f };

    if (raw < kRawCentre)
    {
        // 0 -> 180 Hz, approaching the detent -> 20 kHz
        const auto t = static_cast<float> (raw) / static_cast<float> (kRawCentre);
        return { ToneFilterMode::LowPass, 180.0f * std::pow (20000.0f / 180.0f, t) };
    }

    // Just past the detent -> 20 Hz, 127 -> 9 kHz
    const auto t = static_cast<float> (raw - kRawCentre)
                 / static_cast<float> (kRawMax - kRawCentre);
    return { ToneFilterMode::HighPass, 20.0f * std::pow (9000.0f / 20.0f, t) };
}

//==============================================================================
// Per-bank behaviour

/// Random velocity depth ceiling for a bank (Measured classes, p. 61; depths Chosen).
constexpr float randomVelocityCeiling (RandomClass c) noexcept
{
    switch (c)
    {
        case RandomClass::Subtle:     return 0.15f;
        case RandomClass::Moderate:   return 0.35f;
        case RandomClass::Strong:     return 0.60f;
        case RandomClass::Aggressive: return 0.75f;
    }
    return 0.15f;
}

/// Extra timing offset a bank takes on top of the FEEL offset, in milliseconds
/// (Measured classes, p. 61; magnitudes Chosen).
constexpr float feelExtraMs (FeelClass c) noexcept
{
    switch (c)
    {
        case FeelClass::None:        return 0.0f;
        case FeelClass::Tiny:        return 0.4f;
        case FeelClass::Slight:      return 1.2f;
        case FeelClass::Moderate:    return 2.6f;
        case FeelClass::Significant: return 4.5f;
    }
    return 0.0f;
}

/// Whether FEEL touches a bank at all. FX and every sample bank are exempt (p. 61).
constexpr bool bankTakesFeel (SoundBank bank) noexcept
{
    return bankInfo (bank).feel != FeelClass::None;
}

//==============================================================================
// Sequencer

/// Swing is 50-75 % (p. 51); 50 is straight. The value is where the midpoint of a swing pair
/// lands, as a fraction of the pair.
constexpr float swingFraction (int percent) noexcept
{
    return static_cast<float> (std::clamp (percent, 50, 75)) / 100.0f;
}

/** Warp a position within a swing pair.

    `position` is 0 to 1 across the pair; the result is where it lands. Swing stretches the
    first half of the pair and compresses the second, so the midpoint moves to `fraction` while
    the pair's start and end stay put.

    Displacing the whole second half rigidly instead — the obvious first approach — works at
    16TH resolution where a pair holds two steps, but at 8TH resolution a pair holds four, and
    the last step of one pair then lands on top of the first step of the next.
*/
constexpr float swingWarp (float position, float fraction) noexcept
{
    const auto p = std::clamp (position, 0.0f, 1.0f);

    return p < 0.5f ? p * 2.0f * fraction
                    : fraction + (p - 0.5f) * 2.0f * (1.0f - fraction);
}

/// MOVE as Nudge: a small trigger delay (Measured direction, p. 65; magnitude Chosen).
inline float nudgeMs (int v) noexcept
{
    return unit (v) * 28.0f;
}

/// Accent depth. Hard scales velocity up, soft scales it down (Measured p. 47-48; Chosen scale).
inline float hardAccentScale (int depth) noexcept
{
    return 1.0f + unit (depth) * 0.6f;
}

inline float softAccentScale (int depth) noexcept
{
    return 1.0f - unit (depth) * 0.7f;
}

//==============================================================================
// Isolator (Measured bands and span, p. 33; law Chosen)

/// A band value is -50..0..+50, spanning -inf to +6 dB. Full cut is what makes it an isolator
/// rather than an equaliser.
inline float isolatorGain (int value) noexcept
{
    const auto v = std::clamp (value, -50, 50);

    if (v <= -50)
        return 0.0f;

    if (v == 0)
        return 1.0f;

    if (v > 0)
        return std::pow (10.0f, (6.0f * static_cast<float> (v) / 50.0f) / 20.0f);

    // Cut: taper to silence at -50.
    const auto t = static_cast<float> (v + 50) / 50.0f;
    return t * t;
}

} // namespace bud::curves
