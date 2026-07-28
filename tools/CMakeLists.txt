# Offline tools. These drive the engine without any framework, which is what makes the sound
# engine audible and testable on a machine that cannot build the plugin.

add_executable(bud-render render/main.cpp)
target_link_libraries(bud-render PRIVATE Bud::Core)

if(MSVC)
    target_compile_options(bud-render PRIVATE /W4)
else()
    target_compile_options(bud-render PRIVATE -Wall -Wextra)
endif()
