# The demo pattern, as a library rather than as part of the render tool.
#
# Both the renderer and the test suite need it: docs/BUILDING.md tells a reader to verify
# block-size invariance by rendering this pattern at two buffer sizes and comparing, so the suite
# must be able to assert that same property on that same pattern. While it could not, the two
# drifted apart and a real invariance bug survived in the gap.

add_library(BudDemo STATIC
    DemoPattern.cpp
)

target_link_libraries(BudDemo PUBLIC Bud::Core)

target_include_directories(BudDemo PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/..)

if(MSVC)
    target_compile_options(BudDemo PRIVATE /W4)
else()
    target_compile_options(BudDemo PRIVATE
        -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wno-sign-conversion)
endif()

add_library(Bud::Demo ALIAS BudDemo)
