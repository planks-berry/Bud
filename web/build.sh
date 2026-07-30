#!/usr/bin/env bash
#
# Build the engine to WebAssembly.
#
# Emscripten is fetched through npm rather than assumed to be installed, so this works on a bare
# machine — the same reasoning as the engine depending on nothing but the standard library.
#
#   ./web/build.sh          builds web/bud.js and the wasm it embeds
#
# The result is a single JavaScript file with the wasm inlined, because an AudioWorklet cannot
# fetch: it has no access to `fetch` or `importScripts`, so the module has to arrive as code.

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(dirname "$here")"
cd "$here"

if [[ ! -x node_modules/.bin/empp ]]; then
    echo "Fetching emscripten (first run only)..."
    npm install --no-audit --no-fund emsdk
fi

echo "Compiling the engine to WebAssembly..."

node_modules/.bin/empp \
    -std=c++20 -O3 \
    -I "$root/source" \
    bridge.cpp \
    "$root"/source/core/*.cpp \
    "$root"/source/core/*/*.cpp \
    "$root"/source/demo/*.cpp \
    -o bud.js \
    -sMODULARIZE=1 \
    -sEXPORT_ES6=1 \
    -sEXPORT_NAME=createBud \
    -sSINGLE_FILE=1 \
    -sEXPORTED_RUNTIME_METHODS=cwrap,HEAPF32,UTF8ToString \
    -sALLOW_MEMORY_GROWTH=1 \
    -sENVIRONMENT=web,worker \
    -sINITIAL_MEMORY=33554432

echo "Built $(du -h bud.js | cut -f1) of JavaScript with the wasm inlined."
