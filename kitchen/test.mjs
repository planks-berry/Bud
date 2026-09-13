// End-to-end test of Little Kitchen, in a real browser.
//
// What matters here cannot be checked by reading the code: that a tap and a drag both put an
// ingredient in the bowl, that stirring a bowl round actually finishes the step, that the stove
// cooks, that the friend eats, that the touch targets are big enough for a two-year-old's
// finger on a tablet and a phone, and — the one a parent notices first — that the music plays
// and stops when asked.
//
//   node kitchen/test.mjs          the game as served from this directory
//   node kitchen/test.mjs --csp    the same, under a Content-Security-Policy that forbids
//                                  inline script and style and anything off-origin
//
// The CSP run is the proof that the game is self-contained: no font, no CDN, no inline
// handler, nothing that needs a network once the files are on the device.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));

const TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.webmanifest': 'application/manifest+json',
};

const CSP = process.argv.includes('--csp')
    ? "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
      + "manifest-src 'self'; worker-src 'self'; connect-src 'self'"
    : null;

let failures = 0;

function check(label, condition, detail = '') {
    const mark = condition ? 'ok  ' : 'FAIL';
    if (!condition) failures++;
    console.log(`  ${mark}  ${label}${detail ? `  (${detail})` : ''}`);
}

const server = createServer(async (request, response) => {
    const path = request.url === '/' ? '/index.html' : request.url.split('?')[0];
    try {
        const body = await readFile(join(here, path));
        const headers = { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream' };
        if (CSP) headers['Content-Security-Policy'] = CSP;
        response.writeHead(200, headers);
        response.end(body);
    } catch {
        response.writeHead(404).end('not found');
    }
});

await new Promise((resolve) => server.listen(0, resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

// This container ships its own Chromium; a CI runner installs one through Playwright.
const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath = process.env.KITCHEN_CHROME
    || (existsSync(CONTAINER_CHROME) ? CONTAINER_CHROME : undefined);

const browser = await chromium.launch({ executablePath });

const errors = [];
const watch = (page) => {
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
};

console.log(`\nLittle Kitchen${CSP ? ' — under CSP' : ''}\n`);

// ---- a tablet on its side --------------------------------------------------

const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const page = await context.newPage();
watch(page);
await page.goto(url);
await page.waitForFunction(() => window.kitchen && document.querySelectorAll('[data-action^="dish:"]').length > 0);

// A point in the scene's coordinates, on the screen.
const at = (x, y) => page.evaluate(([x, y]) => {
    const m = document.getElementById('scene').getScreenCTM();
    return { x: m.a * x + m.e, y: m.d * y + m.f };
}, [x, y]);

const centreOf = async (selector, p = page) => {
    const box = await p.locator(selector).first().boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// Playwright's own click waits for the element to hold still, and a button that breathes
// never does. A tap is a click at the element's centre, the way a finger does it.
const tap = async (selector, p = page) => {
    const c = await centreOf(selector, p);
    if (p.context()._options?.hasTouch) await p.touchscreen.tap(c.x, c.y);
    else await p.mouse.click(c.x, c.y);
};

const S = () => page.evaluate(() => {
    const s = window.kitchen.state;
    return {
        screen: s.screen, dish: s.dish?.id, step: s.step, kind: s.dish?.steps[s.step].kind,
        contents: s.contents.length, ids: s.contents.map((c) => c.id), progress: s.progress,
        done: s.done, heating: s.heating, eaten: s.eaten, busy: s.busy,
    };
});

const count = (selector) => page.evaluate((sel) => document.querySelectorAll(sel).length, selector);

// ---- the menu ---------------------------------------------------------------

check('four dishes on the menu', await count('[data-action^="dish:"]') === 4);
check('every dish has a picture', await count('[data-action^="dish:"] .food') === 4);
check('no audio before a touch', await page.evaluate(() => window.kitchen.sound.context === null));

// ---- fruit salad, the whole way through --------------------------------------

await tap('[data-action="dish:fruit-salad"]');
await page.waitForTimeout(300);

let s = await S();
check('choosing a dish opens the kitchen', s.screen === 'cook' && s.dish === 'fruit-salad');
check('the first step is adding', s.kind === 'add');
check('the bowl is on the counter', await count('.vessel[data-vessel="bowl"]') === 1);
check('six things on the tray', await count('.tray-item') === 6);
check('the recipe card suggests seven', await count('.recipe .chip') === 7);
check('nothing is ticked yet', await count('.recipe .chip.done') === 0);
check('no arrow until something is in the bowl', await count('[data-action="next"]') === 0);

// The tap unlocked audio, and the music began.
check('the first touch starts audio',
      await page.evaluate(() => window.kitchen.sound.context?.state) === 'running');

await page.evaluate(() => {
    const sound = window.kitchen.sound;
    const analyser = sound.context.createAnalyser();
    analyser.fftSize = 2048;
    sound.master.connect(analyser);
    window.__analyser = analyser;
    window.__buffer = new Float32Array(analyser.fftSize);
});

const measure = () => page.evaluate(async () => {
    let peak = 0;
    for (let i = 0; i < 20; i++) {
        window.__analyser.getFloatTimeDomainData(window.__buffer);
        for (const v of window.__buffer) peak = Math.max(peak, Math.abs(v));
        await new Promise((r) => setTimeout(r, 50));
    }
    return peak;
});

await page.waitForTimeout(2500);
const musicPeak = await measure();
check('the music plays', musicPeak > 0.01, `peak ${musicPeak.toFixed(4)}`);
check('and it is quiet', musicPeak < 0.35, `peak ${musicPeak.toFixed(4)}`);

// A tap on an ingredient — no dragging — sends it into the bowl by itself.
await tap('.tray-item[data-tray="banana"]');
await page.waitForTimeout(900);
s = await S();
check('a tap puts the ingredient in the bowl', s.contents === 1 && s.ids[0] === 'banana', s.ids.join(','));
check('it is drawn in the bowl', await count('.vessel .content-item') === 1);
check('the recipe ticks it off', await count('.recipe .chip.done') === 1);
check('the arrow appears', await count('[data-action="next"]') === 1);
check('it does not breathe yet', await count('[data-action="next"] .breathe') === 0);
check('the tray still has the banana', await count('.tray-item[data-tray="banana"]') === 1);

// A real drag, from the tray into the bowl.
const strawberry = await centreOf('.tray-item[data-tray="strawberry"]');
const bowl = await page.evaluate(() => window.kitchen.layout.vessel);
const target = await at(bowl.x - 40, bowl.y + 10);

await page.mouse.move(strawberry.x, strawberry.y);
await page.mouse.down();
await page.mouse.move(target.x, target.y, { steps: 12 });
check('the dragged ingredient is lifted', await count('.drag-item') === 1);
await page.mouse.up();
await page.waitForTimeout(400);
s = await S();
check('a drag into the bowl lands', s.contents === 2 && s.ids.includes('strawberry'), s.ids.join(','));
check('and the lifted copy is gone', await count('.drag-item') === 0);

// A drag that misses goes quietly back to the tray.
const apple = await centreOf('.tray-item[data-tray="apple"]');
const miss = await at(500, 40);
await page.mouse.move(apple.x, apple.y);
await page.mouse.down();
await page.mouse.move(miss.x, miss.y, { steps: 10 });
await page.mouse.up();
await page.waitForTimeout(500);
s = await S();
check('a drop outside the bowl adds nothing', s.contents === 2, `${s.contents}`);
check('and returns to the tray', await count('.drag-item') === 0);
check('the tray item is back to full strength',
      await page.evaluate(() => !document.querySelector('.tray-item[data-tray="apple"]').hasAttribute('opacity')));

// Finish the suggested list, and the arrow starts to breathe.
await page.evaluate(() => {
    const k = window.kitchen;
    for (const id of ['strawberry', 'blueberry', 'blueberry', 'apple', 'kiwi']) k.addContent(id, 0.4, Math.random() * 6);
});
await page.waitForTimeout(100);
check('the recipe card fills up', await count('.recipe .chip.done') === 7);
check('the arrow breathes when the recipe is complete', await count('[data-action="next"] .breathe') === 1);

// An ingredient the recipe never asked for goes in just the same.
await tap('.tray-item[data-tray="orange"]');
await page.waitForTimeout(900);
s = await S();
check('an extra ingredient is welcome', s.ids.includes('orange'), s.ids.join(','));

// On to stirring.
await tap('[data-action="next"]');
await page.waitForTimeout(800);
s = await S();
check('the arrow moves to the next step', s.step === 1 && s.kind === 'stir');
check('the tray has gone', await count('.tray-item') === 0);
check('a spoon has appeared', await count('.spoon') === 1);
check('the ingredients came with us', await count('.vessel .content-item') === s.contents);
check('the step dots show where we are', await count('.dots circle') === 3);
check('no arrow until the stirring is done', await count('[data-action="next"]') === 0);

// Stir: circles over the bowl with the finger down.
const centre = await at(bowl.x, bowl.y);
const radius = await page.evaluate(() => {
    const m = document.getElementById('scene').getScreenCTM();
    return 110 * m.a;
});

const before = await page.evaluate(() => window.kitchen.state.contents[0].a);
await page.mouse.move(centre.x + radius, centre.y);
await page.mouse.down();
for (let i = 1; i <= 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    await page.mouse.move(centre.x + Math.cos(t) * radius, centre.y + Math.sin(t) * radius * 0.5);
}
s = await S();
check('stirring makes progress', s.progress > 0.1 && s.progress < 1, `progress ${s.progress.toFixed(2)}`);
const after = await page.evaluate(() => window.kitchen.state.contents[0].a);
check('the ingredients go round', after !== before);
check('the spoon follows the finger',
      await page.evaluate(() => !document.querySelector('.spoon-slot').getAttribute('transform').includes('undefined')));

for (let lap = 0; lap < 6; lap++) {
    for (let i = 1; i <= 48; i++) {
        const t = (i / 48) * Math.PI * 2;
        await page.mouse.move(centre.x + Math.cos(t) * radius, centre.y + Math.sin(t) * radius * 0.5);
    }
}
await page.mouse.up();
s = await S();
check('enough stirring finishes the step', s.done === true && s.progress === 1, `progress ${s.progress.toFixed(2)}`);
check('and the arrow returns, breathing', await count('[data-action="next"] .breathe') === 1);

// Serve.
await tap('[data-action="next"]');
await page.waitForTimeout(800);
s = await S();
check('the last step is serving', s.kind === 'serve');
check('the bunny is waiting', await count('.friend[data-friend="bunny"]') === 1);
check('the salad is on the table', await count('.plate-slot .food') === 1);
check('no buttons until the food is eaten', await count('[data-action="again"]') === 0);

await tap('.plate-slot');
await page.waitForTimeout(600);
check('the plate goes over to the friend', (await S()).busy === true);
await page.waitForTimeout(3200);
s = await S();
check('the friend eats it all', s.eaten === true);
check('and looks happy', await count('.friend.mood-happy') === 1);
check('again and home appear', await count('[data-action="again"]') === 1 && await count('[data-action="home"]') === 2);

await tap('[data-action="again"]');
await page.waitForTimeout(400);
s = await S();
check('again starts the same dish over', s.dish === 'fruit-salad' && s.step === 0 && s.contents === 0);

await tap('[data-action="home"]');
await page.waitForTimeout(400);
check('home returns to the menu', (await S()).screen === 'menu' && await count('[data-action^="dish:"]') === 4);

// ---- soup: the stove ---------------------------------------------------------

await tap('[data-action="dish:soup"]');
await page.waitForTimeout(300);
await page.evaluate(() => {
    const k = window.kitchen;
    k.addContent('carrot', 0.3, 1); k.addContent('carrot', 0.5, 3); k.addContent('pea', 0.6, 5);
});
check('the pot starts with water', await page.evaluate(() =>
    document.querySelector('.vessel .liquid').getAttribute('fill') === 'rgb(201 221 230)'));

await tap('[data-action="next"]');
await page.waitForTimeout(800);
s = await S();
check('soup goes on the heat', s.kind === 'heat');
check('a knob to turn', await count('[data-action="knob"]') === 1);
check('the flames are out', await page.evaluate(() => document.querySelector('.flame-slot').getAttribute('opacity') === '0'));
check('a pot with the vegetables in it', await count('.vessel[data-vessel="pot"] .content-item') === 3);

const water = await page.evaluate(() => document.querySelector('.vessel .liquid').getAttribute('fill'));

await tap('[data-action="knob"]');
await page.waitForTimeout(700);
s = await S();
check('the knob turns the heat on', s.heating === true);
check('the flames come up', await page.evaluate(() => parseFloat(document.querySelector('.flame-slot').getAttribute('opacity')) > 0.9));
check('the pot simmers', await page.evaluate(() => window.kitchen.sound.loops.has('simmer')));
check('the bubbles rise', await page.evaluate(() => parseFloat(document.querySelector('.bubble-slot').getAttribute('opacity')) > 0.9));

await tap('[data-action="knob"]');
await page.waitForTimeout(700);
check('and turns it off again', (await S()).heating === false && await page.evaluate(() => !window.kitchen.sound.loops.has('simmer')));

await tap('[data-action="knob"]');
await page.waitForTimeout(7500);
s = await S();
check('left on, the soup cooks', s.done === true && s.progress === 1, `progress ${s.progress.toFixed(2)}`);
check('the heat goes off by itself', s.heating === false);
check('the simmering stops', await page.evaluate(() => window.kitchen.sound.loops.size === 0));
const broth = await page.evaluate(() => document.querySelector('.vessel .liquid').getAttribute('fill'));
check('the water has become broth', broth !== water, `${water} -> ${broth}`);
check('the steam stays', await page.evaluate(() => parseFloat(document.querySelector('.steam-slot').getAttribute('opacity')) > 0.9));
check('the arrow is back', await count('[data-action="next"]') === 1);

await tap('[data-action="next"]');
await page.waitForTimeout(800);
check('served in a bowl, steaming', await count('.plate-slot .food') === 1 && await count('.plate-slot .steam') === 1);
check('to the bear', await count('.friend[data-friend="bear"]') === 1);

// ---- pancakes: batter, then the pan ------------------------------------------

await page.evaluate(() => window.kitchen.showMenu());
await tap('[data-action="dish:pancakes"]');
await page.waitForTimeout(300);
await page.evaluate(() => {
    const k = window.kitchen;
    for (const id of ['flour', 'egg', 'milk', 'blueberry', 'blueberry']) k.addContent(id, 0.4, Math.random() * 6);
});
await tap('[data-action="next"]');
await page.waitForTimeout(800);
check('pancakes are stirred first', (await S()).kind === 'stir');
check('the batter is not there yet', await page.evaluate(() => document.querySelector('.vessel .liquid').getAttribute('opacity') === '0'));

await page.mouse.move(centre.x + radius, centre.y);
await page.mouse.down();
for (let lap = 0; lap < 8; lap++) {
    for (let i = 1; i <= 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        await page.mouse.move(centre.x + Math.cos(t) * radius, centre.y + Math.sin(t) * radius * 0.5);
    }
}
await page.mouse.up();
s = await S();
check('stirring makes batter', s.done === true);
check('the flour, egg and milk have blended in', await page.evaluate(() =>
    parseFloat(document.querySelector('.vessel .liquid').getAttribute('opacity')) === 1
    && [...document.querySelectorAll('.vessel .content-item')].filter((e) => e.getAttribute('opacity') === '0').length === 3));

await tap('[data-action="next"]');
await page.waitForTimeout(800);
s = await S();
check('then it goes in the pan', s.kind === 'heat' && await count('.vessel[data-vessel="pan"]') === 1);
check('as one pancake', await count('.pancake') === 1);

await tap('.pancake');
await page.waitForTimeout(600);
check('tapping the pancake flips it', (await S()).progress > 0.1);

await tap('[data-action="knob"]');
await page.waitForTimeout(700);
check('the pan sizzles', await page.evaluate(() => window.kitchen.sound.loops.has('sizzle')));
await page.waitForTimeout(7000);
check('the pancake cooks', (await S()).done === true);

await tap('[data-action="next"]');
await page.waitForTimeout(800);
check('a stack on a plate for the cat', await count('.friend[data-friend="cat"]') === 1 && await count('.plate-slot .food ellipse') >= 6);

// ---- pizza: spreads and the oven ---------------------------------------------

await page.evaluate(() => window.kitchen.showMenu());
await tap('[data-action="dish:pizza"]');
await page.waitForTimeout(300);
await tap('.tray-item[data-tray="sauce"]');
await page.waitForTimeout(900);
check('sauce spreads over the base', await count('.vessel .spread.sauce') === 1);
await tap('.tray-item[data-tray="sauce"]');
await page.waitForTimeout(900);
check('a second sauce does not pile up', await count('.vessel .spread.sauce') === 1 && (await S()).contents === 1);
await page.evaluate(() => {
    const k = window.kitchen;
    k.addContent('cheese', 0, 0); k.addContent('olive', 0.5, 1); k.addContent('mushroom', 0.6, 4);
});
check('toppings sit on the cheese', await count('.vessel .spread.cheese') === 1 && await count('.vessel .content-item') === 2);

await tap('[data-action="next"]');
await page.waitForTimeout(800);
check('pizza goes in the oven', (await S()).kind === 'heat' && await count('.oven-glow') === 1);
await tap('[data-action="knob"]');
await page.waitForTimeout(700);
check('the oven glows', await page.evaluate(() => parseFloat(document.querySelector('.oven-glow').getAttribute('opacity')) > 0.2));
await page.waitForTimeout(7000);
check('the pizza bakes', (await S()).done === true);
check('the crust browns and the cheese melts', await page.evaluate(() =>
    document.querySelector('.vessel .crust').getAttribute('opacity') === '1'
    && document.querySelector('.vessel .melted').getAttribute('opacity') === '1'));

// ---- the sheet for grown-ups ---------------------------------------------------

const mark = await centreOf('[data-action="grownups"]');
await page.mouse.move(mark.x, mark.y);
await page.mouse.down();
await page.waitForTimeout(400);
await page.mouse.up();
check('a short press does not open the sheet', await page.evaluate(() => document.getElementById('sheet').hidden));

await page.mouse.down();
await page.waitForTimeout(1400);
await page.mouse.up();
check('press and hold opens it', await page.evaluate(() => !document.getElementById('sheet').hidden));

await page.click('#opt-music');
await page.waitForTimeout(1500);
check('music can be turned off', await page.evaluate(() => window.kitchen.sound.settings.music === false));
check('and is remembered', await page.evaluate(() => JSON.parse(localStorage.getItem('little-kitchen.sound')).music === false));
check('the music bus falls silent', await page.evaluate(() => window.kitchen.sound.musicBus.gain.value < 0.05));
await page.click('#opt-music');
await page.click('#opt-close');
check('the sheet closes', await page.evaluate(() => document.getElementById('sheet').hidden));

// ---- a tablet held upright, with a finger --------------------------------------

const touch = await browser.newContext({ viewport: { width: 834, height: 1194 }, hasTouch: true, deviceScaleFactor: 2 });
const tablet = await touch.newPage();
watch(tablet);
await tablet.goto(url);
await tablet.waitForFunction(() => window.kitchen && document.querySelectorAll('[data-action^="dish:"]').length > 0);

const overflow = await tablet.evaluate(() => ({
    scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth,
}));
check('no sideways scrolling on a tablet', overflow.scroll <= overflow.client, `${overflow.scroll} vs ${overflow.client}`);

await tap('[data-action="dish:soup"]', tablet);
await tablet.waitForTimeout(300);
check('a finger chooses a dish', await tablet.evaluate(() => window.kitchen.state.screen === 'cook'));

const trayOnTablet = await tablet.evaluate(() => ({
    rows: window.kitchen.layout.tray.rows,
    chip: document.querySelector('.tray-item circle').getBoundingClientRect().width,
    knobless: document.querySelectorAll('[data-action="knob"]').length,
}));
check('the tray wraps to two rows upright', trayOnTablet.rows === 2);
check('tray items are a generous touch target', trayOnTablet.chip >= 80, `${trayOnTablet.chip.toFixed(0)}px`);

await tap('.tray-item[data-tray="corn"]', tablet);
await tablet.waitForTimeout(900);
check('a finger tap puts corn in the pot', await tablet.evaluate(() => window.kitchen.state.contents.length === 1));

const homeSize = await tablet.evaluate(() => document.querySelector('[data-action="home"] .button-face').getBoundingClientRect().width);
check('buttons are finger-sized', homeSize >= 60, `${homeSize.toFixed(0)}px`);
await touch.close();

// ---- and a phone ------------------------------------------------------------------

const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3, isMobile: true });
const small = await phone.newPage();
watch(small);
await small.goto(url);
await small.waitForFunction(() => window.kitchen && document.querySelectorAll('[data-action^="dish:"]').length > 0);
await tap('[data-action="dish:fruit-salad"]', small);
await small.waitForTimeout(300);
const phoneChip = await small.evaluate(() => document.querySelector('.tray-item circle').getBoundingClientRect().width);
check('tray items are still tappable on a phone', phoneChip >= 44, `${phoneChip.toFixed(0)}px`);
const phoneOverflow = await small.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
check('no sideways scrolling on a phone', phoneOverflow);
await phone.close();

// ---- errors ----------------------------------------------------------------------

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

console.log(`\n${failures === 0 ? 'PASSED' : 'FAILED'} — ${failures} failure(s)\n`);
process.exit(failures === 0 ? 0 : 1);
