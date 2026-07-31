add_executable(BudCoreTests
    TestFramework.cpp
    ParameterTests.cpp
    CurveTests.cpp
    TransportTests.cpp
    SequencerTests.cpp
    GrooveTests.cpp
    DspTests.cpp
    StretchTests.cpp
    EngineTests.cpp
    FxTests.cpp
    SamplerTests.cpp
    KitTests.cpp
    PatternOpsTests.cpp
    NoteInputTests.cpp
    DemoPatternTests.cpp
    SoundMenuTests.cpp
)

target_link_libraries(BudCoreTests PRIVATE Bud::Core Bud::Demo)
target_include_directories(BudCoreTests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

if(MSVC)
    target_compile_options(BudCoreTests PRIVATE /W4)
else()
    target_compile_options(BudCoreTests PRIVATE -Wall -Wextra)
endif()

add_test(NAME BudCoreTests COMMAND BudCoreTests)
