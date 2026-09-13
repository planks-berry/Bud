// Little Kitchen — a cooking game for toddlers.
//
// The rules of the kitchen, all of them:
//
//   - Nothing is wrong. Any ingredient goes in any dish, and every dish gets eaten.
//   - Nothing is timed, counted or scored. The only clock in the game is the one that cooks.
//   - Nothing flashes. The quickest thing on screen is a spoon following a finger.
//   - Nothing needs reading. Words appear only where a grown-up would read them aloud.
//
// A dish is a short list of steps — add, stir, heat, serve — and each step is one large,
// forgiving interaction. Dragging works; so does tapping, because a two-year-old's drag is
// often a tap with ambitions. The recipe card at the top suggests ingredients and quietly
// ticks them off, and that is the whole of the teaching: matching, a little counting, and
// the order in which things happen.
//
// The scene is a single SVG whose viewBox is kept the same shape as the window, so one set of
// coordinates serves a phone held upright and a tablet on its side. Everything is positioned
// from `L`, the layout, which is recomputed on resize.

import {
    INGREDIENTS, VESSELS, PALETTE, ingredient, SPOON, BURNER, flames, knob, steam, bubbles,
    friend, button, ICONS,
} from './art.js';
import { Sound } from './audio.js';

//==============================================================================
// The dishes

const DISHES = [
    {
        id: 'fruit-salad', name: 'Fruit salad', vessel: 'bowl', friend: 'bunny',
        tray: ['strawberry', 'banana', 'blueberry', 'apple', 'orange', 'kiwi'],
        recipe: [['strawberry', 2], ['banana', 1], ['blueberry', 2], ['apple', 1], ['kiwi', 1]],
        steps: [{ kind: 'add' }, { kind: 'stir' }, { kind: 'serve', as: 'bowl' }],
    },
    {
        id: 'soup', name: 'Vegetable soup', vessel: 'pot', friend: 'bear', liquid: 'broth',
        tray: ['carrot', 'potato', 'pea', 'tomato', 'corn', 'mushroom', 'broccoli'],
        recipe: [['carrot', 2], ['potato', 1], ['pea', 2], ['tomato', 1], ['corn', 1]],
        steps: [{ kind: 'add' }, { kind: 'heat', heater: 'stove', stir: true, loop: 'simmer' }, { kind: 'serve', as: 'soup' }],
    },
    {
        id: 'pancakes', name: 'Pancakes', vessel: 'bowl', friend: 'cat', liquid: 'batter',
        tray: ['flour', 'egg', 'milk', 'butter', 'blueberry', 'banana', 'honey'],
        recipe: [['flour', 1], ['egg', 1], ['milk', 1], ['blueberry', 3]],
        steps: [
            { kind: 'add' }, { kind: 'stir' },
            { kind: 'heat', heater: 'stove', vessel: 'pan', pancake: true, loop: 'sizzle' },
            { kind: 'serve', as: 'pancakes' },
        ],
    },
    {
        id: 'pizza', name: 'Pizza', vessel: 'pizza', friend: 'mouse',
        tray: ['sauce', 'cheese', 'mushroom', 'olive', 'pepper', 'tomatoSlice', 'basil'],
        recipe: [['sauce', 1], ['cheese', 1], ['mushroom', 2], ['olive', 3], ['basil', 1]],
        steps: [{ kind: 'add' }, { kind: 'heat', heater: 'oven' }, { kind: 'serve', as: 'pizza' }],
    },
];

// How long a thing takes to cook, in milliseconds of the heat being on. Long enough to watch,
// short enough that nobody has to wait.
const COOK_TIME = 6500;

// How far a finger travels to stir a bowl through: about two and a half screens' width.
const STIR_TRAVEL = 2400;

//==============================================================================
// State

const svg = document.getElementById('scene');
const NS = 'http://www.w3.org/2000/svg';
const sound = new Sound();

const state = {
    screen: 'menu',
    dish: null,
    step: 0,
    contents: [],        // { id, r, a } — polar position in the vessel's unit ellipse
    progress: 0,         // of the current stir or heat, 0..1
    done: false,         // the current step is complete
    heating: false,
    eaten: false,
    drag: null,
    stir: null,
    busy: false,
    token: 0,            // bumps whenever a scene is torn down, to cancel animations in flight
};

const L = {};            // the layout, filled in by layout()

const el = (tag, attrs = {}, inner = '') => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
    if (inner) e.innerHTML = inner;
    return e;
};

const translate = (x, y, s = 1) => `translate(${x.toFixed(1)} ${y.toFixed(1)})${s !== 1 ? ` scale(${s})` : ''}`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, k) => a + (b - a) * k;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

function tween(ms, step, ease = easeInOut) {
    return new Promise((resolve) => {
        const start = performance.now();
        const frame = (now) => {
            const k = clamp((now - start) / ms, 0, 1);
            step(ease(k));
            if (k < 1) requestAnimationFrame(frame);
            else resolve();
        };
        requestAnimationFrame(frame);
    });
}

//==============================================================================
// Colour

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const rgb = ([r, g, b]) => `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`;

function mixColours(colours, weight = null, k = 0.5) {
    if (colours.length === 0) return weight ?? '#FFFFFF';
    const sum = [0, 0, 0];
    for (const c of colours) hex(c).forEach((v, i) => { sum[i] += v; });
    let mix = sum.map((v) => v / colours.length);
    if (weight) mix = mix.map((v, i) => lerp(v, hex(weight)[i], k));
    return rgb(mix);
}

function lerpColour(a, b, k) {
    const pa = a.startsWith('#') ? hex(a) : a.match(/\d+/g).map(Number);
    const pb = b.startsWith('#') ? hex(b) : b.match(/\d+/g).map(Number);
    return rgb(pa.map((v, i) => lerp(v, pb[i], k)));
}

//==============================================================================
// Layout

function layout() {
    const rect = svg.getBoundingClientRect();
    const W = 1000;
    const aspect = clamp(rect.width / Math.max(1, rect.height), 0.4, 2.6);
    const H = Math.round(W / aspect);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // The scene proper lives in a box of sensible proportions in the middle of the SVG. On a
    // very tall or very wide screen the wall and the counter extend past it, and nothing else.
    const h = clamp(H, 620, 1400);
    const box = { x: 0, y: (H - h) / 2, w: W, h };
    const portrait = h > W * 1.05;

    Object.assign(L, { W, H, box, portrait });
    L.top = box.y + 66;
    L.counterY = box.y + h * (portrait ? 0.46 : 0.52);
    L.vesselY = box.y + h * (portrait ? 0.4 : 0.43);
    placeVessel(state.screen === 'cook' ? currentStep().vessel || state.dish.vessel : 'bowl');
    L.grownups = { x: 66, y: L.top + 92 };
    L.grownupsMenu = { x: 44, y: box.y + h - 44 };

    L.friend = portrait
        ? { x: 500, y: box.y + h * 0.31, s: 0.82 }
        : { x: 300, y: L.vessel.y + 60, s: 0.74 };
    L.plate = portrait
        ? { x: 500, y: box.y + h * 0.64 }
        : { x: 690, y: L.vessel.y + 110 };
    L.serveButtons = portrait ? { x: 500, y: box.y + h - 96 } : { x: W - 240, y: box.y + h - 100 };
}

// The vessel, the knob beside it and the arrow after it move together, and a shallow pan sits
// lower than a deep pot.
function placeVessel(kind) {
    const y = L.vesselY + (VESSELS[kind].offsetY || 0);
    L.vessel = { x: 500, y };
    L.knob = { x: 148, y: y + (L.portrait ? 200 : 150) };
    L.arrow = { x: L.W - 92, y: L.vesselY + 40 };
}

// The tray of ingredients along the bottom: one row on a wide screen, two on a tall one.
function trayLayout(count) {
    const rows = L.portrait && count > 4 ? 2 : 1;
    const perRow = Math.ceil(count / rows);
    const slotW = L.box.w / perRow;
    const scale = clamp(slotW / 130, 0.85, L.portrait ? 1.6 : 1.25);
    const chip = 54 * scale;
    const rowGap = chip * 2 + 26;
    const top = L.box.y + L.box.h - (rows === 2 ? rowGap * 2 + 20 : rowGap + 30);

    const slots = [];
    for (let i = 0; i < count; i++) {
        const row = Math.floor(i / perRow);
        const inRow = row === rows - 1 ? count - perRow * (rows - 1) : perRow;
        const col = i - row * perRow;
        const offset = (L.box.w - inRow * slotW) / 2;
        slots.push({ x: offset + slotW * (col + 0.5), y: top + rowGap * (row + 0.5) + 10 });
    }

    return { rows, top, slots, scale, chip };
}

//==============================================================================
// Scene scaffolding

let layers = {};

function scaffold() {
    svg.innerHTML = '';
    layers = {
        back: el('g', { class: 'layer', id: 'back' }),
        main: el('g', { class: 'layer', id: 'main' }),
        drag: el('g', { class: 'layer', id: 'drag' }),
        ui: el('g', { class: 'layer', id: 'ui' }),
    };
    for (const layer of Object.values(layers)) svg.append(layer);
}

function drawBackground() {
    const { W, H } = L;
    layers.back.innerHTML = `
        <rect width="${W}" height="${H}" fill="${PALETTE.wall}"/>
        <rect y="${L.counterY}" width="${W}" height="${H - L.counterY}" fill="${PALETTE.counter}"/>
        <rect y="${L.counterY}" width="${W}" height="14" fill="${PALETTE.counterEdge}" opacity="0.6"/>`;
}

function buttonGroup(action, icon, x, y, r = 50, label = action, extra = {}) {
    const g = el('g', {
        role: 'button', tabindex: 0, 'aria-label': label, 'data-action': action,
        transform: translate(x, y), ...extra,
    });
    g.innerHTML = `<g class="breathe-slot"><g class="press">${button(icon, r)}</g></g>`;
    return g;
}

async function pressFeedback(target) {
    const press = target.querySelector('.press');
    if (!press) return;
    await tween(180, (k) => {
        const s = 1 - 0.08 * Math.sin(k * Math.PI);
        press.setAttribute('transform', `scale(${s.toFixed(3)})`);
    }, (k) => k);
}

//==============================================================================
// The menu

function showMenu() {
    state.screen = 'menu';
    state.dish = null;
    state.token++;
    sound.stopAllLoops();
    layout();
    scaffold();
    drawBackground();

    const { box, W } = L;
    const cols = L.portrait ? 2 : 4;
    const cardW = cols === 4 ? 216 : 400;
    const cardH = cols === 4 ? 272 : 330;
    const gap = cols === 4 ? 26 : 44;
    const rows = Math.ceil(DISHES.length / cols);
    const gridW = cols * cardW + (cols - 1) * gap;
    const gridH = rows * cardH + (rows - 1) * gap;
    const gridX = (W - gridW) / 2;
    const gridY = box.y + (box.h - gridH) / 2 + 40;

    const main = layers.main;
    main.innerHTML = `
        <text x="500" y="${box.y + 96}" text-anchor="middle" font-size="46">Little Kitchen</text>
        <text x="500" y="${box.y + 136}" text-anchor="middle" font-size="21" opacity="0.65">tap a dish to cook it</text>`;

    DISHES.forEach((dish, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = gridX + col * (cardW + gap) + cardW / 2;
        const y = gridY + row * (cardH + gap) + cardH / 2;
        const scale = cols === 4 ? 0.34 : 0.55;

        const card = el('g', {
            role: 'button', tabindex: 0, 'aria-label': dish.name, 'data-action': `dish:${dish.id}`,
            transform: translate(x, y),
        });
        card.innerHTML = `
            <g class="press">
                <rect class="card-face" x="${-cardW / 2}" y="${-cardH / 2}" width="${cardW}" height="${cardH}" rx="34" fill="${PALETTE.paper}"/>
                <g transform="translate(0 ${-cardH * 0.08}) scale(${scale})">${servedDish(dish, previewContents(dish), true)}</g>
                <text y="${cardH / 2 - 34}" text-anchor="middle" font-size="${cols === 4 ? 24 : 30}">${dish.name}</text>
            </g>`;
        main.append(card);
    });

    layers.ui.append(grownupsButton());
    scheduleHint();
}

// A stable arrangement of the recipe's ingredients, for the menu card. Seeded so the pictures
// on the menu are the same every time the game opens: sameness is a comfort.
function previewContents(dish) {
    let seed = 7;
    const random = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const contents = [];
    for (const [id, count] of dish.recipe) {
        for (let i = 0; i < count; i++) {
            contents.push({ id, r: INGREDIENTS[id].spread ? 0 : 0.2 + random() * 0.6, a: random() * Math.PI * 2 });
        }
    }
    return contents;
}

//==============================================================================
// Cooking

function startDish(dish) {
    state.screen = 'cook';
    state.dish = dish;
    state.contents = [];
    state.eaten = false;
    enterStep(0);
}

const currentStep = () => state.dish.steps[state.step];

function enterStep(index) {
    state.step = index;
    state.progress = 0;
    state.done = false;
    state.heating = false;
    state.drag = null;
    state.stir = null;
    state.token++;
    sound.stopAllLoops();

    layout();
    scaffold();
    drawBackground();
    buildStep();
    buildUI();
    scheduleHint();
}

function buildStep() {
    const step = currentStep();
    const main = layers.main;
    main.innerHTML = '';

    if (step.kind === 'serve') {
        buildServe();
        return;
    }

    const vesselKind = step.vessel || state.dish.vessel;
    placeVessel(vesselKind);
    const { x, y } = L.vessel;

    if (step.kind === 'heat') {
        if (step.heater === 'stove') {
            const stove = el('g', { class: 'stove', transform: translate(x, y + VESSELS[vesselKind].baseY + 4) });
            stove.innerHTML = BURNER;
            main.append(stove);
        } else {
            const oven = el('g', { class: 'oven', transform: translate(x, y) });
            oven.innerHTML = `<rect class="oven-glow" x="-250" y="-250" width="500" height="500" rx="60" fill="#F2B16B" opacity="0"/>`;
            main.append(oven);
        }
    }

    main.append(buildVessel(vesselKind, x, y));
    renderContents();

    if (step.kind === 'heat' && step.heater === 'stove') {
        // The flames sit in front of the vessel's base, licking up around it.
        const flame = el('g', { class: 'flame-slot', opacity: 0, transform: translate(x, y + VESSELS[vesselKind].baseY + 10, 0.75) });
        flame.innerHTML = flames();
        main.append(flame);
    }

    if (step.kind === 'add') {
        main.append(buildTray());
    }

    if (step.kind === 'stir' || step.stir) {
        const spoon = el('g', { class: 'spoon-slot', transform: translate(x + VESSELS[vesselKind].region.rx * 0.7, y - 20) });
        spoon.innerHTML = `<g class="spoon-hint">${SPOON}</g>`;
        main.append(spoon);
    }

    if (step.kind === 'heat') {
        const k = buttonGroup('knob', 'arrow', L.knob.x, L.knob.y, 60, 'Turn the heat on');
        k.innerHTML = `<g class="knob-hint"><g class="press">${knob(false)}</g></g>`;
        main.append(k);
    }
}

// The vessel is built once per step; its contents group is re-rendered from state as things
// are added, and repositioned in place while stirring.
function buildVessel(kind, x, y) {
    const v = VESSELS[kind];
    const g = el('g', { class: 'vessel', 'data-vessel': kind, transform: translate(x, y) });
    g.innerHTML = `
        <defs><clipPath id="clip-${kind}"><ellipse rx="${v.region.rx}" ry="${v.region.ry}"/></clipPath></defs>
        <g class="behind">${v.behind}</g>
        <g class="contents" clip-path="url(#clip-${kind})"></g>
        <g class="front">${v.front}</g>
        <g class="over"></g>`;
    return g;
}

const vesselEl = () => layers.main.querySelector('.vessel');
const vesselKind = () => vesselEl()?.dataset.vessel;
const region = () => VESSELS[vesselKind()].region;

const unitToLocal = ({ r, a }, reg) => ({ x: Math.cos(a) * r * reg.rx, y: Math.sin(a) * r * reg.ry });

function renderContents() {
    const vessel = vesselEl();
    if (!vessel) return;
    const kind = vesselKind();
    const v = VESSELS[kind];
    const step = currentStep();
    const contents = vessel.querySelector('.contents');
    const over = vessel.querySelector('.over');
    contents.innerHTML = '';
    over.innerHTML = '';

    // Liquid first: water in the pot, batter in the bowl once it is stirred.
    if (state.dish.liquid === 'broth' && kind === 'pot') {
        contents.append(el('ellipse', { class: 'liquid', rx: v.region.rx, ry: v.region.ry, fill: PALETTE.water }));
    }
    if (state.dish.liquid === 'batter' && kind === 'bowl') {
        contents.append(el('ellipse', { class: 'liquid', rx: v.region.rx, ry: v.region.ry, fill: PALETTE.batter, opacity: 0 }));
    }

    if (step.pancake) {
        // The batter has left the bowl and is a disc in the pan, with whatever was not batter
        // sitting on top of it.
        const extras = state.contents.filter((c) => !INGREDIENTS[c.id].base && !INGREDIENTS[c.id].spread);
        const pancake = el('g', { class: 'pancake', role: 'button', tabindex: 0, 'aria-label': 'Flip the pancake', 'data-action': 'flip' });
        pancake.innerHTML = `
            <g class="flip">
                <ellipse class="disc" rx="120" ry="40" fill="${batterColour()}"/>
                <ellipse class="disc-top" rx="98" ry="28" cy="-4" fill="#F1CF94" opacity="0"/>
                ${extras.map((c) => {
                    const p = unitToLocal(c, { rx: 90, ry: 26 });
                    return `<g transform="${translate(p.x, p.y - 6, 0.42 * (INGREDIENTS[c.id].scale || 1))}">${INGREDIENTS[c.id].art}</g>`;
                }).join('')}
            </g>`;
        contents.append(pancake);
    } else {
        // Spreads cover the base; everything else lands where it was dropped, the lower items
        // drawn last so they sit in front.
        for (const c of state.contents.filter((c) => INGREDIENTS[c.id].spread)) contents.append(spreadEl(c.id, v.region.rx));

        const items = state.contents
            .map((c, index) => ({ c, index }))
            .filter(({ c }) => !INGREDIENTS[c.id].spread)
            .sort((p, q) => Math.sin(p.c.a) * p.c.r - Math.sin(q.c.a) * q.c.r);

        for (const { c, index } of items) {
            const ing = INGREDIENTS[c.id];
            const p = unitToLocal(c, v.region);
            const g = el('g', { class: 'content-item', 'data-index': index, transform: translate(p.x, p.y, v.itemScale * (ing.scale || 1)) }, ing.art);
            if (state.dish.liquid === 'batter' && kind === 'bowl' && ing.base) g.setAttribute('opacity', 1 - state.progress);
            contents.append(g);
        }
    }

    if (step.kind === 'heat' && step.heater === 'stove' && !step.pancake) {
        contents.append(el('g', { class: 'bubble-slot', opacity: 0 }, bubbles(v.region.rx, v.region.ry)));
    }
    if (step.kind === 'heat') {
        over.append(el('g', { class: 'steam-slot', opacity: 0, transform: translate(0, -v.region.ry - 20) }, steam()));
    }

    updateCooking();
}

function spreadEl(id, rx) {
    if (id === 'sauce') return el('circle', { class: 'spread sauce', r: rx * 0.92, fill: '#DE8677' });
    const g = el('g', { class: 'spread cheese' });
    g.innerHTML = `
        <circle r="${rx * 0.84}" fill="#F6D98B"/>
        <g class="melted" opacity="0">
            <circle r="${rx * 0.84}" fill="#EFC87A"/>
            <circle cx="${-rx * 0.4}" cy="${-rx * 0.2}" r="9" fill="#D9A867" opacity="0.7"/>
            <circle cx="${rx * 0.3}" cy="${rx * 0.35}" r="7" fill="#D9A867" opacity="0.7"/>
            <circle cx="${rx * 0.45}" cy="${-rx * 0.4}" r="6" fill="#D9A867" opacity="0.7"/>
        </g>`;
    return g;
}

// The colour of a batter or a broth is mixed from what went into it — that is the one place
// the game answers a question a toddler might actually be asking.
function batterColour() {
    const bases = state.contents.filter((c) => INGREDIENTS[c.id].base).map((c) => INGREDIENTS[c.id].tint);
    return mixColours(bases, PALETTE.batter, 0.6);
}

function brothColour() {
    const tints = state.contents.map((c) => INGREDIENTS[c.id].tint);
    return mixColours(tints, PALETTE.broth, 0.45);
}

// Everything that changes with progress: the broth darkening, the batter blending, the
// pancake browning, the cheese melting.
function updateCooking() {
    const vessel = vesselEl();
    if (!vessel) return;
    const step = currentStep();
    const p = clamp(state.progress, 0, 1);
    const kind = vesselKind();

    const liquid = vessel.querySelector('.liquid');
    if (liquid && state.dish.liquid === 'broth') liquid.setAttribute('fill', lerpColour(PALETTE.water, brothColour(), Math.sqrt(p)));
    if (liquid && state.dish.liquid === 'batter') {
        liquid.setAttribute('fill', batterColour());
        liquid.setAttribute('opacity', clamp(p * 1.15, 0, 1));
        for (const item of vessel.querySelectorAll('.content-item')) {
            const id = state.contents[item.dataset.index].id;
            if (INGREDIENTS[id].base) item.setAttribute('opacity', clamp(1 - p * 1.2, 0, 1));
        }
    }

    if (step.pancake) {
        vessel.querySelector('.disc')?.setAttribute('fill', lerpColour(batterColour(), PALETTE.golden, p));
        vessel.querySelector('.disc-top')?.setAttribute('opacity', p * 0.9);
    }

    if (kind === 'pizza') {
        vessel.querySelector('.crust')?.setAttribute('opacity', p);
        vessel.querySelector('.melted')?.setAttribute('opacity', p);
    }
}

//==============================================================================
// The tray

function buildTray() {
    const dish = state.dish;
    const T = trayLayout(dish.tray.length);
    L.tray = T;

    const tray = el('g', { class: 'tray' });
    tray.append(el('rect', {
        x: 20, y: T.top, width: L.box.w - 40, height: L.box.y + L.box.h - T.top - 12, rx: 36,
        fill: PALETTE.board, opacity: 0.9,
    }));

    dish.tray.forEach((id, i) => {
        const slot = T.slots[i];
        const g = el('g', { class: 'slot', transform: translate(slot.x, slot.y) });
        g.innerHTML = `
            <g class="tray-item" data-tray="${id}" role="button" tabindex="0" aria-label="${INGREDIENTS[id].name}">
                <circle r="${T.chip}" fill="#FFFFFF" opacity="0.6"/>
                ${ingredient(id, T.scale * 0.92 * (INGREDIENTS[id].scale || 1))}
            </g>`;
        tray.append(g);
    });

    return tray;
}

//==============================================================================
// Dragging, tapping, dropping

function toSvg(event) {
    const point = new DOMPoint(event.clientX, event.clientY);
    return point.matrixTransform(svg.getScreenCTM().inverse());
}

// Where a point is relative to the vessel's opening, in units of its radius: below 1 is inside.
function vesselDistance(x, y) {
    const reg = region();
    const dx = x - L.vessel.x;
    const dy = y - L.vessel.y;
    return { n: Math.hypot(dx / reg.rx, dy / reg.ry), a: Math.atan2(dy / reg.ry, dx / reg.rx) };
}

function beginDrag(id, slotEl, event) {
    const p = toSvg(event);
    const scale = L.tray.scale * (INGREDIENTS[id].scale || 1);
    const clone = el('g', { class: 'drag-item', transform: translate(p.x, p.y) });
    clone.innerHTML = `<g class="lift" transform="scale(${(scale * 1.08).toFixed(3)})">${INGREDIENTS[id].art}</g>`;
    layers.drag.append(clone);
    slotEl.setAttribute('opacity', 0.35);

    state.drag = { id, clone, slotEl, startX: p.x, startY: p.y, x: p.x, y: p.y, moved: false, scale };
    sound.play('pick');
}

function moveDrag(event) {
    const d = state.drag;
    const p = toSvg(event);
    d.x = p.x;
    d.y = p.y;
    if (Math.hypot(p.x - d.startX, p.y - d.startY) > 12) d.moved = true;
    d.clone.setAttribute('transform', translate(p.x, p.y));
}

async function endDrag() {
    const d = state.drag;
    state.drag = null;
    if (!d) return;

    const { n, a } = vesselDistance(d.x, d.y);

    if (!d.moved) {
        // A tap. The ingredient makes its own way into the bowl.
        await flyIn(d, 0.2 + Math.random() * 0.55, Math.random() * Math.PI * 2);
    } else if (n <= 1.45) {
        await land(d, Math.min(n, 0.86), a);
    } else {
        await returnToTray(d);
    }
}

async function flyIn(d, r, a) {
    const reg = region();
    const target = unitToLocal({ r, a }, reg);
    const tx = L.vessel.x + target.x;
    const ty = L.vessel.y + target.y;
    const { x: sx, y: sy } = d;
    const token = state.token;

    await tween(420, (k) => {
        // An arc: up a little on the way over, then down into the bowl.
        const x = lerp(sx, tx, k);
        const y = lerp(sy, ty, k) - Math.sin(k * Math.PI) * 90;
        d.clone.setAttribute('transform', translate(x, y));
    });

    if (token !== state.token) return;
    await land(d, r, a);
}

async function land(d, r, a) {
    const token = state.token;
    d.clone.remove();
    d.slotEl.removeAttribute('opacity');
    addContent(d.id, r, a);

    // Settle: a small bounce on arrival.
    const target = INGREDIENTS[d.id].spread
        ? layers.main.querySelector(`.spread.${INGREDIENTS[d.id].spread}`)
        : layers.main.querySelector(`.content-item[data-index="${state.contents.length - 1}"]`);
    if (!target) return;
    const base = target.getAttribute('transform') || '';
    await tween(260, (k) => {
        if (token !== state.token) return;
        const s = 1 + 0.18 * Math.sin(k * Math.PI);
        target.setAttribute('transform', `${base} scale(${s.toFixed(3)})`);
    });
    if (token === state.token) target.setAttribute('transform', base);
}

async function returnToTray(d) {
    const token = state.token;
    const slot = L.tray.slots[state.dish.tray.indexOf(d.id)];
    const { x: sx, y: sy } = d;
    sound.play('back');

    await tween(320, (k) => {
        d.clone.setAttribute('transform', translate(lerp(sx, slot.x, k), lerp(sy, slot.y, k)));
    }, easeOut);

    if (token !== state.token) return;
    d.clone.remove();
    d.slotEl.removeAttribute('opacity');
}

function addContent(id, r, a) {
    const ing = INGREDIENTS[id];

    if (ing.spread) {
        // One layer of sauce is plenty; a second just refreshes the first.
        if (!state.contents.some((c) => c.id === id)) state.contents.push({ id, r: 0, a: 0 });
        sound.play('pour');
    } else {
        state.contents.push({ id, r, a });
        if (state.contents.length > 28) {
            const oldest = state.contents.findIndex((c) => !INGREDIENTS[c.id].spread);
            if (oldest >= 0) state.contents.splice(oldest, 1);
        }
        sound.play('plop');
    }

    renderContents();
    buildUI();
}

//==============================================================================
// Stirring

function beginStir(event) {
    const p = toSvg(event);
    state.stir = { x: p.x, y: p.y, lastSwoosh: 0 };
    moveSpoon(p.x, p.y);
}

function moveStir(event) {
    const s = state.stir;
    const p = toSvg(event);
    const distance = Math.hypot(p.x - s.x, p.y - s.y);
    s.x = p.x;
    s.y = p.y;
    moveSpoon(p.x, p.y);

    if (distance < 0.5) return;
    const step = currentStep();

    // Stirring a heated pot helps a little; stirring a bowl is the whole job.
    const share = step.kind === 'stir' ? distance / STIR_TRAVEL : distance / (STIR_TRAVEL * 3);
    if (!state.done) {
        state.progress = clamp(state.progress + share, 0, 1);
        updateCooking();
        if (state.progress >= 1) completeStep();
    }

    swirl(distance * 0.0045);

    const now = performance.now();
    if (now - s.lastSwoosh > 380 && distance > 6) {
        s.lastSwoosh = now;
        sound.play('stir');
    }
}

function endStir() {
    state.stir = null;
    restSpoon();
}

function moveSpoon(x, y) {
    const spoon = layers.main.querySelector('.spoon-slot');
    if (!spoon) return;
    const { n, a } = vesselDistance(x, y);
    const reg = region();
    const r = Math.min(n, 0.9);
    const p = unitToLocal({ r, a }, reg);
    spoon.setAttribute('transform', translate(L.vessel.x + p.x, L.vessel.y + p.y));
}

function restSpoon() {
    const spoon = layers.main.querySelector('.spoon-slot');
    if (!spoon) return;
    spoon.setAttribute('transform', translate(L.vessel.x + region().rx * 0.7, L.vessel.y - 20));
}

// Everything in the vessel goes round with the spoon.
function swirl(radians) {
    const vessel = vesselEl();
    if (!vessel) return;
    const v = VESSELS[vesselKind()];
    for (const c of state.contents) if (!INGREDIENTS[c.id].spread) c.a += radians;
    for (const item of vessel.querySelectorAll('.content-item')) {
        const c = state.contents[item.dataset.index];
        if (!c) continue;
        const p = unitToLocal(c, v.region);
        item.setAttribute('transform', translate(p.x, p.y, v.itemScale * (INGREDIENTS[c.id].scale || 1)));
    }
}

//==============================================================================
// Heat

let heatFrame = null;
let heatLast = 0;

function toggleHeat() {
    if (state.done) return;
    state.heating = !state.heating;
    sound.play('knob');

    const step = currentStep();
    const main = layers.main;
    const face = main.querySelector('.knob-face');
    const mark = main.querySelector('.knob-mark');
    face?.setAttribute('fill', state.heating ? '#E7B792' : '#D8D1C1');
    mark?.setAttribute('transform', state.heating ? 'rotate(90)' : '');

    fadeTo(main.querySelector('.flame-slot'), state.heating ? 1 : 0);
    fadeTo(main.querySelector('.oven-glow'), state.heating ? 0.32 : 0);
    fadeTo(main.querySelector('.bubble-slot'), state.heating ? 1 : 0);
    fadeTo(main.querySelector('.steam-slot'), state.heating ? 1 : 0);

    if (state.heating) {
        if (step.heater === 'oven') sound.play('warm');
        if (step.loop) sound.startLoop(step.loop);
        heatLast = performance.now();
        if (!heatFrame) heatFrame = requestAnimationFrame(heatTick);
    } else {
        sound.stopAllLoops();
    }
}

function heatTick(now) {
    heatFrame = null;
    if (!state.heating) return;
    const dt = Math.min(100, now - heatLast);
    heatLast = now;

    state.progress = clamp(state.progress + dt / COOK_TIME, 0, 1);
    updateCooking();

    if (state.progress >= 1) {
        state.heating = false;
        sound.stopAllLoops();
        const main = layers.main;
        main.querySelector('.knob-face')?.setAttribute('fill', '#D8D1C1');
        main.querySelector('.knob-mark')?.setAttribute('transform', '');
        fadeTo(main.querySelector('.flame-slot'), 0);
        fadeTo(main.querySelector('.oven-glow'), 0);
        fadeTo(main.querySelector('.bubble-slot'), 0);
        completeStep();
        return;
    }

    heatFrame = requestAnimationFrame(heatTick);
}

function fadeTo(element, opacity) {
    if (!element) return;
    const from = parseFloat(element.getAttribute('opacity') ?? 1);
    const token = state.token;
    tween(500, (k) => {
        if (token !== state.token) return;
        element.setAttribute('opacity', lerp(from, opacity, k).toFixed(3));
    });
}

async function flipPancake(target) {
    if (state.busy) return;
    state.busy = true;
    const flip = target.querySelector('.flip');
    sound.play('flip');
    const token = state.token;

    await tween(420, (k) => {
        if (token !== state.token) return;
        const s = Math.abs(Math.cos(k * Math.PI));
        const lift = Math.sin(k * Math.PI) * 40;
        flip.setAttribute('transform', `translate(0 ${-lift.toFixed(1)}) scale(1 ${Math.max(0.06, s).toFixed(3)})`);
    });

    if (token !== state.token) { state.busy = false; return; }
    flip.setAttribute('transform', '');
    if (!state.done) {
        state.progress = clamp(state.progress + 0.12, 0, 1);
        updateCooking();
        if (state.progress >= 1) completeStep();
    }
    state.busy = false;
}

//==============================================================================
// Steps completing and moving on

function completeStep() {
    if (state.done) return;
    state.done = true;
    state.progress = 1;
    updateCooking();
    sound.play('chime');
    restSpoon();
    buildUI();
}

const stepReady = () => {
    const step = currentStep();
    if (step.kind === 'add') return state.contents.length > 0;
    if (step.kind === 'serve') return false;
    return state.done;
};

const recipeComplete = () => state.dish.recipe.every(([id, count]) => have(id) >= count);
const have = (id) => state.contents.filter((c) => c.id === id).length;

async function nextStep() {
    if (state.busy || !stepReady()) return;
    state.busy = true;
    sound.play('tap');

    const step = currentStep();
    const following = state.dish.steps[state.step + 1];
    if (following?.pancake) sound.play('pour');
    else if (following?.kind === 'serve') sound.play('whoosh');

    layers.main.classList.add('hidden');
    layers.ui.classList.add('hidden');
    await wait(step.kind === 'serve' ? 0 : 460);

    enterStep(state.step + 1);
    layers.main.classList.add('hidden');
    layers.ui.classList.add('hidden');
    // Next frame, so the transition has something to fade from.
    requestAnimationFrame(() => requestAnimationFrame(() => {
        layers.main.classList.remove('hidden');
        layers.ui.classList.remove('hidden');
    }));
    state.busy = false;
}

//==============================================================================
// Serving

function buildServe() {
    const dish = state.dish;
    const main = layers.main;
    const F = L.friend;

    const who = el('g', { class: 'friend-slot', role: 'button', tabindex: 0, 'aria-label': 'Feed your friend', 'data-action': 'eat', transform: translate(F.x, F.y, F.s) });
    who.innerHTML = friend(dish.friend);
    main.append(who);

    const plate = el('g', { class: 'plate-slot', role: 'button', tabindex: 0, 'aria-label': 'The finished dish', 'data-action': 'eat', transform: translate(L.plate.x, L.plate.y) });
    plate.innerHTML = `<g class="dish-hint"><g class="served">${servedDish(dish, state.contents, false)}</g></g>`;
    main.append(plate);

    if (state.eaten) {
        who.querySelector('.friend').classList.add('mood-happy');
        plate.querySelector('.served .food')?.setAttribute('opacity', 0);
    }
}

// The dish as it looks when it is finished: the same drawings, arranged on a plate or in a
// bowl. `cooked` colours are used throughout, since by now it has been.
function servedDish(dish, contents, forMenu) {
    const as = dish.steps[dish.steps.length - 1].as;
    const items = (reg, scale, extraY = 0) => contents
        .filter((c) => !INGREDIENTS[c.id].spread)
        .sort((p, q) => Math.sin(p.a) * p.r - Math.sin(q.a) * q.r)
        .map((c) => {
            const p = unitToLocal(c, reg);
            return `<g transform="${translate(p.x, p.y + extraY, scale * (INGREDIENTS[c.id].scale || 1))}">${INGREDIENTS[c.id].art}</g>`;
        })
        .join('');

    const tints = contents.map((c) => INGREDIENTS[c.id].tint);
    const s = forMenu ? 1 : 0.86;

    if (as === 'bowl') {
        const v = VESSELS.bowl;
        return `<g transform="scale(${s})">${v.behind}<g class="food">${items(v.region, v.itemScale)}</g>${v.front}</g>`;
    }

    if (as === 'soup') {
        const v = VESSELS.bowl;
        const broth = mixColours(tints, PALETTE.broth, 0.45);
        return `<g transform="scale(${s})">${v.behind}
            <g class="food"><ellipse rx="${v.region.rx}" ry="${v.region.ry}" fill="${broth}"/>${items(v.region, v.itemScale * 0.8)}</g>
            ${v.front}<g transform="translate(0 -90)">${steam()}</g></g>`;
    }

    if (as === 'pancakes') {
        const v = VESSELS.plate;
        const extras = contents.filter((c) => !INGREDIENTS[c.id].base && !INGREDIENTS[c.id].spread && c.id !== 'honey');
        const honey = contents.some((c) => c.id === 'honey');
        const stack = [0, -22, -44].map((dy) => `
            <ellipse cy="${dy + 8}" rx="126" ry="40" fill="#C99A5E" opacity="0.5"/>
            <ellipse cy="${dy}" rx="126" ry="40" fill="${PALETTE.golden}"/>`).join('');
        const drizzle = honey ? `<path d="M-70 -56 C -40 -40 -10 -64 20 -48 C 40 -38 60 -56 80 -46" fill="none" stroke="#E9B85B" stroke-width="9" stroke-linecap="round" opacity="0.9"/>` : '';
        const topping = extras.map((c) => {
            const p = unitToLocal(c, { rx: 90, ry: 24 });
            return `<g transform="${translate(p.x, p.y - 50, 0.48 * (INGREDIENTS[c.id].scale || 1))}">${INGREDIENTS[c.id].art}</g>`;
        }).join('');
        return `<g transform="scale(${s})">${v.behind}
            <g class="food" transform="translate(0 -10)">${stack}<ellipse cy="-48" rx="100" ry="28" fill="#F1CF94" opacity="0.9"/>${drizzle}${topping}</g></g>`;
    }

    // pizza
    const v = VESSELS.pizza;
    const spreads = contents.filter((c) => INGREDIENTS[c.id].spread).map((c) => spreadEl(c.id, v.region.rx).outerHTML).join('');
    return `<g transform="scale(${s})">
        <circle r="172" fill="#B9B4C4"/><circle r="150" fill="#D9A867"/><circle r="128" fill="#F3DFB0"/>
        <g class="food">${spreads.replace(/opacity="0"/g, 'opacity="1"')}${items(v.region, v.itemScale)}</g></g>`;
}

async function eat() {
    if (state.busy || state.eaten) return;
    state.busy = true;
    const token = state.token;
    const main = layers.main;
    const who = main.querySelector('.friend');
    const plate = main.querySelector('.plate-slot');
    const food = plate.querySelector('.food');
    sound.play('tap');

    // The plate goes over to the friend.
    const from = { x: L.plate.x, y: L.plate.y };
    const to = L.portrait
        ? { x: L.friend.x, y: L.friend.y + 190 * L.friend.s }
        : { x: L.friend.x + 200, y: L.friend.y + 130 };
    await tween(700, (k) => {
        if (token !== state.token) return;
        plate.setAttribute('transform', translate(lerp(from.x, to.x, k), lerp(from.y, to.y, k)));
    });
    if (token !== state.token) return;

    for (let bite = 1; bite <= 3; bite++) {
        who.classList.add('mood-open');
        sound.play('munch');
        await wait(280);
        if (token !== state.token) return;
        who.classList.remove('mood-open');
        food?.setAttribute('opacity', (1 - bite / 3).toFixed(2));
        await wait(420);
        if (token !== state.token) return;
    }

    who.classList.add('mood-happy');
    sound.play('yum');
    await wait(600);
    if (token !== state.token) return;

    state.eaten = true;
    state.busy = false;
    showServeButtons();
}

function showServeButtons() {
    const { x, y } = L.serveButtons;
    const again = buttonGroup('again', 'again', x - 80, y, 54, 'Cook it again');
    const home = buttonGroup('home', 'home', x + 80, y, 54, 'Back to the menu');
    layers.ui.append(again, home);
    for (const b of [again, home]) {
        b.setAttribute('opacity', 0);
        fadeTo(b, 1);
    }
}

//==============================================================================
// The interface: home, the step dots, the recipe card, the arrow

function buildUI() {
    if (state.screen !== 'cook') return;
    const ui = layers.ui;
    ui.innerHTML = '';
    const { W } = L;
    const step = currentStep();
    const steps = state.dish.steps;

    ui.append(buttonGroup('home', 'home', 66, L.top, 46, 'Back to the menu'));

    // One dot per step. The current one is filled, the ones done are quieter.
    const dots = el('g', { class: 'dots', transform: translate(500, L.top) });
    dots.innerHTML = steps.map((_, i) => `
        <circle cx="${(i - (steps.length - 1) / 2) * 34}" r="${i === state.step ? 10 : 7}"
                fill="${i <= state.step ? PALETTE.line : 'none'}" stroke="${PALETTE.line}" stroke-width="4"
                opacity="${i < state.step ? 0.45 : 0.9}"/>`).join('');
    ui.append(dots);

    if (step.kind === 'add') ui.append(recipeCard(W));

    if (stepReady()) {
        const arrow = buttonGroup('next', 'arrow', L.arrow.x, L.arrow.y, 54, 'Next step');
        if (step.kind !== 'add' || recipeComplete()) arrow.querySelector('.breathe-slot').classList.add('breathe');
        ui.append(arrow);
    }

    if (state.eaten) showServeButtons();
    ui.append(grownupsButton());
}

// The suggested ingredients, ticked off as they go in. Extra helpings and other ingredients
// are welcome too; the card only ever fills up, never complains.
function recipeCard(W) {
    const chips = [];
    for (const [id, count] of state.dish.recipe) {
        const got = have(id);
        for (let i = 0; i < count; i++) chips.push({ id, done: i < got });
    }

    const spacing = 52;
    const width = chips.length * spacing + 16;
    const card = el('g', { class: 'recipe', transform: translate(W - 20 - width, L.top - 34) });
    card.innerHTML = `
        <rect width="${width}" height="68" rx="34" fill="${PALETTE.paper}" opacity="0.9"/>
        ${chips.map((chip, i) => `
            <g transform="translate(${8 + spacing * i + spacing / 2} 34)" class="chip ${chip.done ? 'done' : ''}">
                <circle r="23" fill="${chip.done ? '#DCE8D6' : '#F1EBE0'}"/>
                <g opacity="${chip.done ? 1 : 0.55}">${ingredient(chip.id, 0.36 * (INGREDIENTS[chip.id].scale || 1))}</g>
                ${chip.done ? `<g transform="translate(12 12) scale(0.7)"><circle r="12" fill="#DCE8D6"/><path d="M-6 0 L -2 4 L 7 -5" fill="none" stroke="#5E8A5A" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></g>` : ''}
            </g>`).join('')}`;
    return card;
}

function grownupsButton() {
    const at = state.screen === 'menu' ? L.grownupsMenu : L.grownups;
    const g = el('g', {
        role: 'button', tabindex: 0, 'aria-label': 'For grown-ups (press and hold)',
        'data-action': 'grownups', transform: translate(at.x, at.y),
    });
    g.innerHTML = `<circle r="30" fill="${PALETTE.paper}" opacity="0.5"/><g transform="scale(0.8)">${ICONS.grownups}</g>`;
    return g;
}

//==============================================================================
// Hints
//
// When nothing has happened for a while, the thing to touch next lifts, twice, and settles.
// Not a prompt, not a voice: just a nudge in the corner of the eye.

let hintTimer = null;

function scheduleHint() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(showHint, 9000);
}

function showHint() {
    if (state.busy || state.drag || state.stir) { scheduleHint(); return; }
    let target = null;

    if (state.screen === 'menu') {
        target = layers.main.querySelector('[data-action^="dish:"] .press');
    } else {
        const step = currentStep();
        if (stepReady() && step.kind !== 'add') target = null;                 // the arrow is already breathing
        else if (step.kind === 'add') target = layers.main.querySelector('.tray-item');
        else if (step.kind === 'stir') target = layers.main.querySelector('.spoon-hint');
        else if (step.kind === 'heat' && !state.heating) target = layers.main.querySelector('.knob-hint');
        else if (step.kind === 'serve' && !state.eaten) target = layers.main.querySelector('.dish-hint');
    }

    if (target) {
        target.classList.remove('hint');
        void target.getBBox();
        target.classList.add('hint');
    }
    scheduleHint();
}

//==============================================================================
// The sheet for grown-ups

const sheet = document.getElementById('sheet');
const optMusic = document.getElementById('opt-music');
const optSounds = document.getElementById('opt-sounds');
const optFullscreen = document.getElementById('opt-fullscreen');
let holdTimer = null;

function openSheet() {
    optMusic.checked = sound.settings.music;
    optSounds.checked = sound.settings.sounds;
    optFullscreen.hidden = !document.fullscreenEnabled;
    sheet.hidden = false;
    document.getElementById('opt-close').focus();
}

function closeSheet() {
    sheet.hidden = true;
    scheduleHint();
}

optMusic.addEventListener('change', () => sound.setMusic(optMusic.checked));
optSounds.addEventListener('change', () => sound.setSounds(optSounds.checked));
document.getElementById('opt-close').addEventListener('click', closeSheet);
optFullscreen.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
});
sheet.addEventListener('click', (event) => { if (event.target === sheet) closeSheet(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !sheet.hidden) closeSheet(); });

//==============================================================================
// Input

function act(action, target) {
    if (action === 'grownups') return;              // handled by press-and-hold
    if (action.startsWith('dish:')) {
        pressFeedback(target);
        const dish = DISHES.find((d) => d.id === action.slice(5));
        setTimeout(() => startDish(dish), 120);
        sound.play('tap');
        return;
    }
    switch (action) {
        case 'home':  pressFeedback(target); sound.play('tap'); setTimeout(showMenu, 120); break;
        case 'again': pressFeedback(target); sound.play('tap'); setTimeout(() => startDish(state.dish), 120); break;
        case 'next':  pressFeedback(target); nextStep(); break;
        case 'knob':  pressFeedback(target); toggleHeat(); break;
        case 'flip':  flipPancake(target); break;
        case 'eat':   eat(); break;
        default: break;
    }
}

svg.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) return;
    sound.unlock();
    scheduleHint();
    if (state.busy && !state.drag) return;

    const target = event.target.closest('[data-action], [data-tray]');
    const p = toSvg(event);

    if (target?.dataset.tray && currentStep().kind === 'add' && !state.drag) {
        svg.setPointerCapture(event.pointerId);
        beginDrag(target.dataset.tray, target, event);
        return;
    }

    if (target?.dataset.action === 'grownups') {
        holdTimer = setTimeout(openSheet, 1100);
        return;
    }

    if (target?.dataset.action) {
        act(target.dataset.action, target);
        return;
    }

    // Anywhere near the vessel, on a step that can be stirred, is a stir.
    const step = state.screen === 'cook' ? currentStep() : null;
    if (step && (step.kind === 'stir' || step.stir) && vesselDistance(p.x, p.y).n < 1.9) {
        svg.setPointerCapture(event.pointerId);
        beginStir(event);
    }
});

svg.addEventListener('pointermove', (event) => {
    if (!event.isPrimary) return;
    if (state.drag) moveDrag(event);
    else if (state.stir) moveStir(event);
});

const release = (event) => {
    if (!event.isPrimary) return;
    clearTimeout(holdTimer);
    if (state.drag) endDrag();
    if (state.stir) endStir();
};
svg.addEventListener('pointerup', release);
svg.addEventListener('pointercancel', release);
svg.addEventListener('lostpointercapture', release);

svg.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target.closest('[data-action], [data-tray]');
    if (!target) return;
    event.preventDefault();
    sound.unlock();

    if (target.dataset.tray) {
        if (state.drag || state.busy || currentStep().kind !== 'add') return;
        const id = target.dataset.tray;
        const { x, y } = L.tray.slots[state.dish.tray.indexOf(id)];
        const d = { id, slotEl: target, x, y, clone: el('g', { class: 'drag-item', transform: translate(x, y) }) };
        d.clone.innerHTML = `<g transform="scale(${L.tray.scale * (INGREDIENTS[id].scale || 1)})">${INGREDIENTS[id].art}</g>`;
        layers.drag.append(d.clone);
        target.setAttribute('opacity', 0.35);
        sound.play('pick');
        flyIn(d, 0.3 + Math.random() * 0.5, Math.random() * Math.PI * 2);
        return;
    }

    if (target.dataset.action === 'grownups') { openSheet(); return; }
    act(target.dataset.action, target);
});

svg.addEventListener('contextmenu', (event) => event.preventDefault());

// A resize rebuilds the scene from state. Never in the middle of a touch, and never twice
// for one rotation.
let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (state.drag || state.stir || state.busy) return;
        if (state.screen === 'menu') showMenu();
        else { layout(); scaffold(); drawBackground(); buildStep(); buildUI(); }
    }, 150);
});

//==============================================================================
// Go

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline play is a nicety, not a need */ });
}

showMenu();

// A handle for the browser test, and for anyone curious in the console.
window.kitchen = { state, sound, dishes: DISHES, layout: L, startDish, enterStep, addContent, showMenu };
