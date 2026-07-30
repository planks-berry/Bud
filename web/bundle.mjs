// Fold the whole instrument into one HTML file.
//
//   node web/bundle.mjs                 -> web/bud-standalone.html
//   node web/bundle.mjs --fragment      -> web/bud-fragment.html   (no <html>/<head>/<body>)
//
// The multi-file version in this directory is the one to develop against; this exists so the
// instrument can be *handed over* — opened from a file, mailed, or dropped on a host that will
// not serve a directory. One file, no network, no build on the far side.
//
// Three things have to be rewritten on the way in, all consequences of the AudioWorklet:
//
//   1. `worklet.js` does `import createBud from './bud.js'`. A worklet loaded from a blob URL has
//      no directory to resolve that against, so the engine is concatenated into the worklet
//      source instead and the import removed.
//   2. `app.js` does `addModule('worklet.js')`. There is no such file any more, so the worklet
//      source is carried as a string and turned into a blob URL at run time.
//   3. Any remaining module syntax is removed, and the result asserted clean. AudioWorklet
//      support for `import` and `import.meta` is not universal — this is exactly why the bundle
//      is the version that gets published rather than the multi-file build.
//
// The rewrites are anchored on exact text and throw if an anchor has moved, so this cannot
// quietly emit a bundle with a dead worklet — the failure a browser would otherwise show only as
// silence.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), 'utf8');

/// Replace exactly one occurrence, or fail. Silence is the failure mode this defends against.
function replaceOnce(source, needle, replacement, what) {
    const first = source.indexOf(needle);
    if (first < 0) throw new Error(`bundle: could not find ${what}:\n  ${needle}`);
    if (source.indexOf(needle, first + needle.length) >= 0)
        throw new Error(`bundle: ${what} appears more than once, so the rewrite is ambiguous`);

    return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

/// A JS string literal that is safe inside an inline <script>. JSON.stringify handles quotes and
/// newlines; escaping `<` handles the one thing it does not — a `</script` in the payload would
/// end the element regardless of the JavaScript around it.
const literal = (text) => JSON.stringify(text).replace(/</g, '\\u003c');

//==============================================================================

const html = read('index.html');
const css = read('style.css');
const engine = read('bud.js');
const worklet = read('worklet.js');
const app = read('app.js');

// 1. The engine, inlined into the worklet in place of its import.
const engineBody = replaceOnce(
    engine,
    'export default createBud;',
    '',
    "the engine's default export",
);

const workletSource = replaceOnce(
    worklet,
    "import createBud from './bud.js';",
    engineBody,
    "the worklet's import of the engine",
);

// Nothing that looks like a module may survive into the worklet. `import.meta.url` is emitted by
// emscripten's ES6 output to locate the wasm alongside the script — dead code here, because
// -sSINGLE_FILE inlines it, and meaningless anyway for a script loaded from a blob URL. Worklet
// support for module syntax varies between engines, and a worklet that fails to parse takes the
// whole instrument with it, so the safe amount of it to ship is none.
const withoutModuleSyntax = workletSource.replaceAll('import.meta.url', '"bud.js"');

if (/\bimport\s*\.\s*meta\b|^\s*(import|export)\s/m.test(withoutModuleSyntax))
    throw new Error('bundle: module syntax still present in the worklet source');

// 2. The worklet, carried as a string and mounted as a blob URL.
const appSource = replaceOnce(
    app,
    "    await context.audioWorklet.addModule('worklet.js');",
    `    // Bundled build: the worklet is carried in this file rather than fetched, so it is
    // mounted as a blob URL. Revoked once registered — the module is compiled by then.
    const workletUrl = URL.createObjectURL(
        new Blob([BUD_WORKLET_SOURCE], { type: 'application/javascript' }),
    );

    try {
        await context.audioWorklet.addModule(workletUrl);
    } finally {
        URL.revokeObjectURL(workletUrl);
    }`,
    "the worklet's module URL",
);

const script = `const BUD_WORKLET_SOURCE = ${literal(withoutModuleSyntax)};\n\n${appSource}`;

// 3. The page, with its two external references replaced by their contents.
let page = replaceOnce(
    html,
    '<link rel="stylesheet" href="style.css">',
    `<style>\n${css}\n</style>`,
    "the stylesheet link",
);

page = replaceOnce(
    page,
    '<script type="module" src="app.js"></script>',
    `<script type="module">\n${script}\n</script>`,
    "the application script tag",
);

//==============================================================================

const fragment = process.argv.includes('--fragment');

if (fragment) {
    // A host that supplies its own <html>, <head> and <body> wants only what goes inside them.
    // The <title> is kept, because that is what such a host reads the page's name from.
    const head = page.indexOf('<body>');
    const tail = page.lastIndexOf('</body>');
    if (head < 0 || tail < 0) throw new Error('bundle: index.html no longer has a <body>');

    const title = /<title>[^<]*<\/title>/.exec(page);
    const style = /<style>[\s\S]*?<\/style>/.exec(page);
    if (!title || !style) throw new Error('bundle: expected a <title> and the inlined <style>');

    page = `${title[0]}\n${style[0]}\n${page.slice(head + '<body>'.length, tail)}`;
}

const out = join(here, fragment ? 'bud-fragment.html' : 'bud-standalone.html');
writeFileSync(out, page);

const kb = (Buffer.byteLength(page) / 1024).toFixed(0);
console.log(`Wrote ${out} — ${kb} KB, self-contained.`);
