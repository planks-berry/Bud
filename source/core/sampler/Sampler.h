#pragma once

#include "SampleBank.h"

namespace bud
{

/// Where the sampler takes its input from (p. 81). The device selects this with the KBD and
/// BS DRV keys while in sampling mode.
enum class SampleSource
{
    LineIn,
    Usb
};

inline constexpr int kNumSampleSources = 2;

//==============================================================================

/** Sampling mode, as a state machine (p. 81-83).

    The device's flow has more states than "recording or not", and each one behaves differently:

    - `Idle`      — not in sampling mode.
    - `Standby`   — in sampling mode, setting the input level. REC blinks; the meter is live.
    - `Armed`     — REC pressed. REC is solid and recording begins the moment the input crosses
                    the auto-record threshold. With auto-record off this state is skipped and
                    pressing REC records immediately (p. 83).
    - `Recording` — capturing. Ends on its own when the bank's length is full, or when REC is
                    pressed again.
    - `Review`    — choosing a slot. The capture can be auditioned before it is committed.
    - `Done`      — written to a slot; the device shows DONE.

    Two details are easy to miss and both are load-bearing. Recording ends *automatically* at the
    bank limit rather than overwriting or truncating silently, and the capture is normalised once
    it ends (p. 83) — so a quiet source still fills the slot.
*/
enum class SamplerState
{
    Idle,
    Standby,
    Armed,
    Recording,
    Review,
    Done
};

//==============================================================================

/** The sampler: level metering, auto-record, capture, normalise, commit.

    Deliberately owns no audio device and no file access. It is handed input by whatever is
    driving the engine and writes into a `SoundLibrary` slot, which keeps it testable offline and
    identical whether the input came from an audio interface, a host bus or a test.
*/
class Sampler
{
public:
    /// The device meters and shows progress on the sixteen step keys.
    static constexpr int kMeterSteps = 16;

    /// Auto-record off, the low end of the raw range (p. 83).
    static constexpr int kAutoRecordOff = 0;

    void prepare (double sampleRate);
    void reset() noexcept;

    //==========================================================================
    // Settings

    /// S2, S4 or S8 — chosen with the A/B/C keys (p. 81). Anything else is ignored.
    void setBank (SoundBank) noexcept;
    SoundBank bank() const noexcept { return bank_; }

    void setSource (SampleSource source) noexcept { source_ = source; }
    SampleSource source() const noexcept { return source_; }

    /// Input gain: the TEMPO knob while sampling (p. 81, 83). Raw 0-127.
    void setInputGain (int raw) noexcept;

    /// `kAutoRecordOff`, or a raw value mapping to a -60 to -20 dB trigger level (p. 83).
    void setAutoRecordThreshold (int raw) noexcept;
    int autoRecordThreshold() const noexcept { return autoRecordRaw_; }

    /// Tempo at the time of recording, used to record the capture's musical length.
    void setTempo (double bpm) noexcept;

    //==========================================================================
    // Transport. Each maps to a key on the device.

    /// func + sampling.
    void enterSamplingMode() noexcept;

    /// REC. Standby arms (or records outright with auto-record off); recording stops and reviews.
    void recordKey() noexcept;

    /// CLR — abandons whatever is in progress and leaves sampling mode (p. 82).
    void cancel() noexcept;

    /// OK, from `Review`: write the capture to a slot. False if the state or slot is wrong.
    bool commit (SoundLibrary&, int slot) noexcept;

    //==========================================================================

    /** Feed the input. Safe to call in any state — the meter runs throughout, because the whole
        point of Standby is watching it, and the arming threshold needs it too.

        `right` may be null for a mono source.
    */
    void processInput (const float* left, const float* right, int numSamples) noexcept;

    //==========================================================================
    // State and metering

    SamplerState state() const noexcept { return state_; }
    bool isRecording() const noexcept { return state_ == SamplerState::Recording; }

    /// Input level as lit step keys, 0-16. Step 12 is -6 dB and step 16 is 0 dB (p. 82).
    int inputMeterSteps() const noexcept;

    /// Recording progress as lit step keys, 0-16. Step 16 means the bank limit is reached (p. 82).
    int progressSteps() const noexcept;

    const SampleData& captured() const noexcept { return capture_; }
    double capturedSeconds() const noexcept;

    /// How long this bank can record for, in samples.
    int capacitySamples() const noexcept;

private:
    void beginRecording() noexcept;
    void finishRecording() noexcept;

    /// Scale the capture so its peak reaches full scale (p. 83). Silence is left alone.
    void normalise() noexcept;

    SampleData capture_;
    double sampleRate_ = 48000.0;
    double tempo_ = 128.0;

    SoundBank bank_ = SoundBank::S2;
    SampleSource source_ = SampleSource::LineIn;
    SamplerState state_ = SamplerState::Idle;

    float inputGain_ = 1.0f;
    int autoRecordRaw_ = kAutoRecordOff;
    float autoRecordLevel_ = 0.0f;

    /// Peak follower behind the meter: instant attack, exponential release.
    float meterPeak_ = 0.0f;
    float meterRelease_ = 0.0f;
};

} // namespace bud
