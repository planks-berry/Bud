# BudCore — the sound engine.
#
# Deliberately depends on nothing but the C++20 standard library: no JUCE, no GUI toolkit,
# no host SDK. That keeps every part of the engine buildable and testable on any platform,
# including CI, while the macOS/iPadOS shells are built with Xcode.

add_library(BudCore STATIC
    Types.cpp
    Transport.cpp
    Engine.cpp
    params/ParameterIds.cpp
    params/ParameterSet.cpp
    sequencer/Step.cpp
    sequencer/Pattern.cpp
    sequencer/TrackSequencer.cpp
    sequencer/NoteInput.cpp
    sequencer/Groove.cpp
    dsp/TimeStretch.cpp
    factory/FactoryContent.cpp
    factory/SoundMenu.cpp
    factory/Presets.cpp
    kit/DrumKit.cpp
    fx/Isolator.cpp
    fx/MasterFx.cpp
    fx/Reverb.cpp
    fx/TapeEcho.cpp
    sampler/SampleBank.cpp
    sampler/Sampler.cpp
    sampler/WavIo.cpp
    voices/DrumVoices.cpp
    voices/SampleVoices.cpp
    voices/BassVoice.cpp
)

target_include_directories(BudCore PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/..)

target_compile_features(BudCore PUBLIC cxx_std_20)

if(MSVC)
    target_compile_options(BudCore PRIVATE /W4)
else()
    target_compile_options(BudCore PRIVATE
        -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wno-sign-conversion)
endif()

add_library(Bud::Core ALIAS BudCore)
