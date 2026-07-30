cmake_minimum_required(VERSION 3.22)

project(Bud
    VERSION 0.1.0
    DESCRIPTION "Groovebox modelled on the Sonicware deconstruct MINIMAL"
    LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "" FORCE)
endif()

# The plugin and standalone targets need JUCE and (for AUv3) Xcode. The engine does not:
# BudCore is framework-free C++20 so that the whole sound engine builds and tests anywhere.
option(BUD_BUILD_TESTS  "Build the engine test suite" ON)
option(BUD_BUILD_TOOLS  "Build the offline render tools" ON)
option(BUD_BUILD_PLUGIN "Build the JUCE plugin and standalone targets" OFF)
option(BUD_BUILD_AUV3   "Include the iPad AUv3 target (implies BUD_BUILD_PLUGIN)" OFF)

add_subdirectory(source/core)
add_subdirectory(source/demo)

if(BUD_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()

if(BUD_BUILD_TOOLS)
    add_subdirectory(tools)
endif()

if(BUD_BUILD_PLUGIN OR BUD_BUILD_AUV3)
    add_subdirectory(source/plugin)
endif()

message(STATUS "")
message(STATUS "Bud ${PROJECT_VERSION}")
message(STATUS "  build type ....... ${CMAKE_BUILD_TYPE}")
message(STATUS "  engine tests ..... ${BUD_BUILD_TESTS}")
message(STATUS "  plugin targets ... ${BUD_BUILD_PLUGIN}")
message(STATUS "  iPad AUv3 ........ ${BUD_BUILD_AUV3}")
message(STATUS "")
