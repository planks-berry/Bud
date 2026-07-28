add_executable(BudCoreTests
    TestFramework.cpp
    ParameterTests.cpp
    TransportTests.cpp
    SequencerTests.cpp
    GrooveTests.cpp
    DspTests.cpp
    EngineTests.cpp
)

target_link_libraries(BudCoreTests PRIVATE Bud::Core)
target_include_directories(BudCoreTests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

if(MSVC)
    target_compile_options(BudCoreTests PRIVATE /W4)
else()
    target_compile_options(BudCoreTests PRIVATE -Wall -Wextra)
endif()

add_test(NAME BudCoreTests COMMAND BudCoreTests)
