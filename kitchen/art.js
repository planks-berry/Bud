// Everything the game draws, as SVG fragments.
//
// Nothing here is an image file. Every ingredient, pot, spoon and face is a handful of flat
// shapes written out by hand, so the whole game is a few small text files with nothing to load
// and nothing to wait for. The style is deliberately plain — flat colour, no outlines, soft
// rounded forms, a muted palette — because the point is a calm screen rather than a busy one.
//
// Ingredients are drawn in a 100-unit box centred on the origin, so the same drawing serves on
// the tray, in the bowl, on the recipe card and on the plate at whatever scale the scene needs.
// Shapes with corners are given a round-joined stroke of their own colour: it softens every
// corner without a second set of coordinates.

export const PALETTE = {
    wall: '#F1E7D8',
    counter: '#E8D5B5',
    counterEdge: '#D9C2A0',
    board: '#F4EADB',
    ink: '#6E6258',
    line: '#8C7A66',
    paper: '#FDFBF6',
    sage: '#A8C3A0',
    peach: '#F1B8A1',
    sky: '#A9C7DA',
    water: '#C9DDE6',
    broth: '#E9C9A0',
    batter: '#F3E3C3',
    golden: '#E3B26F',
};

const soft = (colour, width = 10) =>
    `stroke="${colour}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"`;

// `tint` is the colour an ingredient lends to a broth or a batter. `base` marks the things
// that *become* the batter rather than sitting in it. `spread` marks a pizza layer — sauce,
// cheese — that covers the base instead of landing where it is dropped.
const item = (name, tint, art, extra = {}) => ({ name, tint, art, ...extra });

export const INGREDIENTS = {
    strawberry: item('strawberry', '#E8908A', `
        <path d="M0 40 C -30 26 -40 -2 -30 -18 C -22 -32 -8 -28 0 -22 C 8 -28 22 -32 30 -18
                 C 40 -2 30 26 0 40 Z" fill="#E8908A"/>
        <g fill="#F6CFC9">
            <circle cx="-12" cy="0" r="3"/><circle cx="11" cy="-3" r="3"/><circle cx="0" cy="14" r="3"/>
            <circle cx="-15" cy="17" r="3"/><circle cx="14" cy="16" r="3"/><circle cx="0" cy="-11" r="3"/>
        </g>
        <g fill="#8FB98B">
            <ellipse cx="-14" cy="-27" rx="11" ry="6" transform="rotate(-28 -14 -27)"/>
            <ellipse cx="14" cy="-27" rx="11" ry="6" transform="rotate(28 14 -27)"/>
            <ellipse cx="0" cy="-31" rx="6" ry="11"/>
        </g>`),

    banana: item('banana', '#F5DE8A', `
        <path d="M-38 -14 C -34 18 -4 42 34 32 C 42 30 42 20 34 22 C 6 24 -14 6 -22 -20
                 C -25 -28 -37 -26 -38 -14 Z" fill="#F5DE8A"/>
        <path d="M-38 -14 C -36 -22 -30 -26 -22 -20" fill="none" ${soft('#B8975A', 5)}/>
        <circle cx="36" cy="27" r="4" fill="#B8975A"/>`),

    blueberry: item('blueberries', '#8FA5D3', `
        <g fill="#8FA5D3">
            <circle cx="-16" cy="10" r="18"/><circle cx="16" cy="12" r="18"/><circle cx="0" cy="-14" r="18"/>
        </g>
        <g fill="#6F86B8">
            <circle cx="0" cy="-19" r="4.5"/><circle cx="-16" cy="5" r="4.5"/><circle cx="16" cy="7" r="4.5"/>
        </g>`, { scale: 0.9 }),

    apple: item('apple', '#E39B93', `
        <path d="M0 -18 C 12 -34 38 -28 36 0 C 34 22 20 40 8 38 C 4 37 -4 37 -8 38
                 C -20 40 -34 22 -36 0 C -38 -28 -12 -34 0 -18 Z" fill="#E39B93"/>
        <path d="M0 -22 C 2 -30 4 -34 8 -40" fill="none" ${soft('#8C6A4E', 5)}/>
        <ellipse cx="14" cy="-33" rx="10" ry="5" fill="#8FB98B" transform="rotate(-30 14 -33)"/>
        <ellipse cx="-15" cy="-4" rx="6" ry="11" fill="#F2C2BC" opacity="0.7"/>`),

    orange: item('orange', '#F3B36B', `
        <circle r="37" fill="#F3B36B"/>
        <circle r="30" fill="#F8D39A"/>
        <g stroke="#F3B36B" stroke-width="3.5" stroke-linecap="round">
            <line x1="0" y1="0" x2="0" y2="-29"/><line x1="0" y1="0" x2="25" y2="-14.5"/>
            <line x1="0" y1="0" x2="25" y2="14.5"/><line x1="0" y1="0" x2="0" y2="29"/>
            <line x1="0" y1="0" x2="-25" y2="14.5"/><line x1="0" y1="0" x2="-25" y2="-14.5"/>
        </g>`),

    kiwi: item('kiwi', '#A8C97A', `
        <circle r="37" fill="#9A7B5B"/>
        <circle r="32" fill="#A8C97A"/>
        <circle r="10" fill="#F1EBC8"/>
        <g fill="#4B4335">
            <circle cx="0" cy="-18" r="2.4"/><circle cx="12.7" cy="-12.7" r="2.4"/><circle cx="18" cy="0" r="2.4"/>
            <circle cx="12.7" cy="12.7" r="2.4"/><circle cx="0" cy="18" r="2.4"/><circle cx="-12.7" cy="12.7" r="2.4"/>
            <circle cx="-18" cy="0" r="2.4"/><circle cx="-12.7" cy="-12.7" r="2.4"/>
        </g>`),

    carrot: item('carrot', '#F0A868', `
        <g fill="none" ${soft('#8FB98B', 7)}>
            <path d="M0 -22 L 0 -44"/><path d="M-5 -24 L -18 -40"/><path d="M5 -24 L 18 -40"/>
        </g>
        <path d="M-13 -22 C -13 -32 13 -32 13 -22 C 15 2 8 26 0 42 C -8 26 -15 2 -13 -22 Z" fill="#F0A868"/>
        <g ${soft('#E2955A', 3.5)}>
            <line x1="-7" y1="-6" x2="4" y2="-6"/><line x1="-5" y1="10" x2="4" y2="10"/>
        </g>`),

    potato: item('potato', '#E1C79B', `
        <ellipse rx="36" ry="27" fill="#E1C79B" transform="rotate(-18)"/>
        <g fill="#C9AE80">
            <circle cx="-14" cy="-6" r="3"/><circle cx="10" cy="8" r="3"/><circle cx="16" cy="-10" r="2.5"/>
            <circle cx="-6" cy="14" r="2.5"/>
        </g>`),

    pea: item('peas', '#A6C98F', `
        <path d="M-42 6 C -32 -24 32 -24 42 6 C 32 24 -32 24 -42 6 Z" fill="#8FB98B"/>
        <g fill="#BDDDA9">
            <circle cx="-19" cy="2" r="9.5"/><circle cx="0" cy="0" r="9.5"/><circle cx="19" cy="2" r="9.5"/>
        </g>`),

    tomato: item('tomato', '#E88A7A', `
        <circle cy="4" r="34" fill="#E88A7A"/>
        <g fill="#8FB98B">
            <ellipse cx="0" cy="-28" rx="5" ry="11"/>
            <ellipse cx="0" cy="-28" rx="5" ry="11" transform="rotate(55 0 -20)"/>
            <ellipse cx="0" cy="-28" rx="5" ry="11" transform="rotate(-55 0 -20)"/>
        </g>
        <circle cx="-13" cy="-8" r="7" fill="#F2B1A6" opacity="0.8"/>`),

    tomatoSlice: item('tomato', '#E88A7A', `
        <circle r="34" fill="#E88A7A"/>
        <circle r="26" fill="#F2B1A6"/>
        <g fill="#E88A7A">
            <ellipse cx="0" cy="-13" rx="6" ry="9"/><ellipse cx="12" cy="7" rx="6" ry="9" transform="rotate(120 12 7)"/>
            <ellipse cx="-12" cy="7" rx="6" ry="9" transform="rotate(-120 -12 7)"/>
        </g>
        <circle r="6" fill="#E88A7A"/>`, { scale: 0.85 }),

    corn: item('corn', '#F3D77E', `
        <path d="M-16 -8 C -36 0 -36 30 -20 46 C -19 26 -18 8 -16 -8 Z" fill="#8FB98B"/>
        <path d="M16 -8 C 36 0 36 30 20 46 C 19 26 18 8 16 -8 Z" fill="#A8C3A0"/>
        <rect x="-17" y="-42" width="34" height="84" rx="17" fill="#F3D77E"/>
        <g fill="#E9C25E">
            <circle cx="-8" cy="-30" r="3.5"/><circle cx="8" cy="-30" r="3.5"/>
            <circle cx="-8" cy="-18" r="3.5"/><circle cx="8" cy="-18" r="3.5"/>
            <circle cx="-8" cy="-6" r="3.5"/><circle cx="8" cy="-6" r="3.5"/>
            <circle cx="-8" cy="6" r="3.5"/><circle cx="8" cy="6" r="3.5"/>
            <circle cx="-8" cy="18" r="3.5"/><circle cx="8" cy="18" r="3.5"/>
            <circle cx="-8" cy="30" r="3.5"/><circle cx="8" cy="30" r="3.5"/>
        </g>`),

    mushroom: item('mushroom', '#D8C2A6', `
        <rect x="-12" y="0" width="24" height="36" rx="10" fill="#EFE3D2"/>
        <path d="M-38 8 C -38 -32 38 -32 38 8 Z" fill="#C9A886" ${soft('#C9A886', 8)}/>
        <g fill="#E8D5BE">
            <circle cx="-15" cy="-10" r="5"/><circle cx="10" cy="-14" r="6"/><circle cx="24" cy="0" r="3.5"/>
        </g>`),

    broccoli: item('broccoli', '#8FB58F', `
        <rect x="-10" y="4" width="20" height="36" rx="8" fill="#C7DDB6"/>
        <g fill="#8FB58F">
            <circle cx="-21" cy="-4" r="17"/><circle cx="21" cy="-4" r="17"/>
            <circle cx="0" cy="-19" r="19"/><circle cx="0" cy="3" r="16"/>
        </g>
        <g fill="#A6C79E" opacity="0.9">
            <circle cx="-17" cy="-11" r="5"/><circle cx="8" cy="-24" r="5"/><circle cx="21" cy="-1" r="4"/>
        </g>`),

    flour: item('flour', '#F7F1E6', `
        <path d="M-27 -18 L 27 -18 L 31 40 L -31 40 Z" fill="#EFE6D5" ${soft('#EFE6D5', 8)}/>
        <ellipse cx="0" cy="-26" rx="22" ry="9" fill="#FBF7EE"/>
        <rect x="-30" y="-26" width="60" height="14" rx="5" fill="#DCCFB8"/>
        <rect x="-19" y="2" width="38" height="18" rx="6" fill="#A9C7DA"/>`, { base: true }),

    egg: item('egg', '#F9F1E1', `
        <ellipse rx="27" ry="35" fill="#F9F1E1"/>
        <path d="M0 -35 C 18 -33 27 -12 27 6 C 27 24 15 35 0 35 Z" fill="#EBDDC3" opacity="0.45"/>
        <ellipse cx="-9" cy="-10" rx="7" ry="11" fill="#FFFFFF" opacity="0.7"/>`, { base: true }),

    milk: item('milk', '#FBFDFE', `
        <rect x="-18" y="-42" width="36" height="16" rx="6" fill="#A9C7DA"/>
        <path d="M-14 -30 L 14 -30 L 14 -20 C 26 -14 26 -2 26 6 L 26 32 C 26 38 22 42 16 42
                 L -16 42 C -22 42 -26 38 -26 32 L -26 6 C -26 -2 -26 -14 -14 -20 Z" fill="#FBFDFE"/>
        <rect x="-26" y="8" width="52" height="14" fill="#A9C7DA" opacity="0.7"/>`, { base: true }),

    butter: item('butter', '#F7E5A6', `
        <path d="M-34 -6 L -10 -22 L 36 -22 L 12 -6 Z" fill="#FBF0C0" ${soft('#FBF0C0', 6)}/>
        <path d="M12 -6 L 36 -22 L 36 8 L 12 24 Z" fill="#E9D28C" ${soft('#E9D28C', 6)}/>
        <rect x="-34" y="-6" width="46" height="30" rx="3" fill="#F7E5A6" ${soft('#F7E5A6', 6)}/>`,
        { base: true }),

    honey: item('honey', '#E9B85B', `
        <rect x="-24" y="-18" width="48" height="56" rx="12" fill="#E9B85B"/>
        <rect x="-20" y="-36" width="40" height="20" rx="6" fill="#B98A5A"/>
        <rect x="-14" y="-4" width="28" height="26" rx="6" fill="#F6D89A" opacity="0.6"/>`),

    sauce: item('tomato sauce', '#DE8677', `
        <path d="M-30 4 C -34 -20 -12 -34 4 -30 C 20 -34 38 -18 34 0 C 40 14 26 30 8 28
                 C -8 36 -32 26 -30 4 Z" fill="#DE8677"/>
        <circle cx="-6" cy="-8" r="6" fill="#EBA79B" opacity="0.8"/>`, { spread: 'sauce' }),

    cheese: item('cheese', '#F6D98B', `
        <path d="M-34 24 L 0 -30 L 34 24 Z" fill="#F6D98B" ${soft('#F6D98B', 12)}/>
        <g fill="#E9C46B">
            <circle cx="-7" cy="10" r="5"/><circle cx="13" cy="16" r="4"/><circle cx="3" cy="-6" r="3"/>
        </g>`, { spread: 'cheese' }),

    olive: item('olives', '#6E6F5B', `
        <circle r="24" fill="#6E6F5B"/>
        <circle r="8" fill="#F0E9DA"/>`, { scale: 0.8 }),

    pepper: item('pepper', '#9CC28F', `
        <circle r="26" fill="none" stroke="#9CC28F" stroke-width="13"/>`, { scale: 0.85 }),

    basil: item('basil', '#7FAE7A', `
        <g transform="rotate(30)">
            <ellipse rx="17" ry="32" fill="#7FAE7A"/>
            <line x1="0" y1="22" x2="0" y2="-22" stroke="#A8C9A0" stroke-width="3.5" stroke-linecap="round"/>
        </g>`),
};

export function ingredient(id, scale = 1, cls = '') {
    return `<g class="ingredient ${cls}" data-ingredient="${id}" transform="scale(${scale})">${INGREDIENTS[id].art}</g>`;
}

//==============================================================================
// Vessels
//
// A vessel is drawn in two halves with the contents between them: `behind` is the body, the
// inside and the liquid, `front` is the rim. Contents are clipped to `region`, an ellipse (or a
// circle, when rx equals ry) in the vessel's own coordinates, `itemScale` is how large an
// ingredient is drawn once it is in there, `baseY` is where the vessel meets the stove, and
// `offsetY` lowers a shallow vessel so it sits on the counter rather than floating above it.

export const VESSELS = {
    bowl: {
        region: { rx: 186, ry: 64 },
        itemScale: 0.72,
        baseY: 160,
        behind: `
            <ellipse cy="160" rx="72" ry="14" fill="#94AEC0"/>
            <path d="M-206 0 C -196 92 -108 150 0 150 C 108 150 196 92 206 0 Z" fill="#B7CFDD"/>
            <ellipse rx="206" ry="78" fill="#8FB0C4"/>
            <ellipse rx="192" ry="66" fill="#9DBACB"/>`,
        front: `<ellipse rx="206" ry="78" fill="none" stroke="#CFE0EA" stroke-width="10"/>`,
    },

    pot: {
        region: { rx: 176, ry: 58 },
        itemScale: 0.68,
        baseY: 180,
        behind: `
            <rect x="-256" y="-8" width="80" height="24" rx="12" fill="#9E98AE"/>
            <rect x="176" y="-8" width="80" height="24" rx="12" fill="#9E98AE"/>
            <path d="M-200 0 L -190 148 C -190 164 -176 176 -160 176 L 160 176 C 176 176 190 164 190 148
                     L 200 0 Z" fill="#B9B4C4"/>
            <ellipse rx="200" ry="72" fill="#8E8AA0"/>
            <ellipse rx="184" ry="60" fill="#A29DB3"/>`,
        front: `<ellipse rx="200" ry="72" fill="none" stroke="#D2CEDB" stroke-width="10"/>`,
    },

    pan: {
        region: { rx: 166, ry: 52 },
        itemScale: 0.66,
        baseY: 92,
        offsetY: 110,
        behind: `
            <rect x="184" y="-16" width="160" height="32" rx="16" fill="#8C6A4E"/>
            <ellipse cy="26" rx="204" ry="76" fill="#4F4E57"/>
            <ellipse rx="204" ry="76" fill="#5F5E66"/>
            <ellipse rx="176" ry="56" fill="#7A7982"/>`,
        front: '',
    },

    pizza: {
        region: { rx: 118, ry: 118 },
        itemScale: 0.62,
        baseY: 0,
        behind: `
            <circle r="172" fill="#B9B4C4"/>
            <circle r="150" fill="#E9C48F"/>
            <circle class="crust" r="150" fill="#D9A867" opacity="0"/>
            <circle r="128" fill="#F3DFB0"/>`,
        front: '',
    },

    plate: {
        region: { rx: 160, ry: 56 },
        itemScale: 0.6,
        baseY: 0,
        behind: `
            <ellipse cy="6" rx="236" ry="86" fill="#E4DCCD"/>
            <ellipse rx="236" ry="86" fill="#FBF8F1"/>
            <ellipse rx="184" ry="64" fill="#F1ECE2"/>`,
        front: '',
    },
};

//==============================================================================
// Tools, heat and weather

export const SPOON = `
    <g class="spoon" transform="rotate(-32)">
        <rect x="-9" y="-160" width="18" height="150" rx="9" fill="#C9A27A"/>
        <ellipse cy="8" rx="30" ry="40" fill="#D9B48C"/>
        <ellipse cy="10" rx="20" ry="28" fill="#CDA47C"/>
    </g>`;

export const BURNER = `
    <ellipse rx="150" ry="30" fill="#8C8895"/>
    <ellipse rx="130" ry="20" fill="#6F6B7C"/>`;

// A ring of small, slow flames. They are kept low and pale on purpose: the stove should read as
// warm rather than dramatic.
export function flames() {
    const one = (x, y, s) => `
        <g transform="translate(${x} ${y}) scale(${s})">
            <path d="M0 0 C -14 -14 -9 -36 0 -48 C 9 -36 14 -14 0 0 Z" fill="#F2B16B" opacity="0.9"/>
            <path d="M0 -4 C -7 -12 -5 -24 0 -32 C 5 -24 7 -12 0 -4 Z" fill="#F8D79A"/>
        </g>`;

    return `<g class="flames">
        ${one(-96, -6, 0.8)}${one(-52, 2, 1)}${one(0, 6, 1.1)}${one(52, 2, 1)}${one(96, -6, 0.8)}
    </g>`;
}

export function knob(on = false) {
    return `
        <circle r="60" fill="#E5DFD1"/>
        <circle r="46" fill="${on ? '#E7B792' : '#D8D1C1'}" class="knob-face"/>
        <rect x="-6" y="-38" width="12" height="30" rx="6" fill="#8C7A66" class="knob-mark"/>`;
}

// The wisps and bubbles are staggered by nth-child rules in the stylesheet rather than inline
// style attributes, so the page works under a Content-Security-Policy that forbids those.
export function steam() {
    const wisp = (x) => `
        <path class="wisp" transform="translate(${x} 0)"
              d="M0 0 C -12 -16 12 -28 0 -44 C -12 -60 12 -72 0 -88"
              fill="none" stroke="#FFFFFF" stroke-width="11" stroke-linecap="round" opacity="0"/>`;

    return `<g class="steam">${wisp(-60)}${wisp(0)}${wisp(60)}</g>`;
}

export function bubbles(rx, ry) {
    let out = '';
    for (let i = 0; i < 6; i++) {
        const x = Math.round(rx * (-0.7 + 1.4 * (i / 5)));
        const y = Math.round(ry * 0.3);
        out += `<circle class="bubble" cx="${x}" cy="${y}" r="${7 + (i % 3) * 2}" fill="#FFFFFF" opacity="0"/>`;
    }
    return `<g class="bubbles">${out}</g>`;
}

//==============================================================================
// The friend who eats the food

const FRIENDS = {
    bear:  { colour: '#C8A27A', belly: '#E4CCAA', inner: '#E4CCAA' },
    bunny: { colour: '#EADBD0', belly: '#F7F0EA', inner: '#F1C6C0' },
    cat:   { colour: '#C9C3D9', belly: '#E5E1EE', inner: '#F1C6C0' },
    mouse: { colour: '#BFC8CF', belly: '#E1E7EB', inner: '#F1C6C0' },
};

export function friend(kind) {
    const { colour, belly, inner } = FRIENDS[kind];

    const ears = {
        bear: `
            <circle cx="-84" cy="-80" r="36" fill="${colour}"/><circle cx="84" cy="-80" r="36" fill="${colour}"/>
            <circle cx="-84" cy="-80" r="18" fill="${inner}"/><circle cx="84" cy="-80" r="18" fill="${inner}"/>`,
        bunny: `
            <ellipse cx="-50" cy="-158" rx="27" ry="74" fill="${colour}" transform="rotate(-8 -50 -158)"/>
            <ellipse cx="50" cy="-158" rx="27" ry="74" fill="${colour}" transform="rotate(8 50 -158)"/>
            <ellipse cx="-50" cy="-158" rx="13" ry="52" fill="${inner}" transform="rotate(-8 -50 -158)"/>
            <ellipse cx="50" cy="-158" rx="13" ry="52" fill="${inner}" transform="rotate(8 50 -158)"/>`,
        cat: `
            <path d="M-104 -50 L -84 -146 L -22 -100 Z" fill="${colour}" ${soft(colour, 18)}/>
            <path d="M104 -50 L 84 -146 L 22 -100 Z" fill="${colour}" ${soft(colour, 18)}/>
            <path d="M-88 -66 L -78 -122 L -40 -96 Z" fill="${inner}" ${soft(inner, 10)}/>
            <path d="M88 -66 L 78 -122 L 40 -96 Z" fill="${inner}" ${soft(inner, 10)}/>`,
        mouse: `
            <circle cx="-96" cy="-72" r="46" fill="${colour}"/><circle cx="96" cy="-72" r="46" fill="${colour}"/>
            <circle cx="-96" cy="-72" r="28" fill="${inner}"/><circle cx="96" cy="-72" r="28" fill="${inner}"/>`,
    }[kind];

    const nose = kind === 'cat' || kind === 'mouse'
        ? `<ellipse cx="0" cy="14" rx="9" ry="6" fill="#E7A5A5"/>`
        : '';

    return `
        <g class="friend mood-idle" data-friend="${kind}">
            ${ears}
            <ellipse cx="0" cy="176" rx="132" ry="96" fill="${colour}"/>
            <ellipse cx="0" cy="192" rx="82" ry="62" fill="${belly}"/>
            <circle r="114" fill="${colour}"/>
            <g class="face">
                <g class="eyes-open">
                    <circle cx="-42" cy="-12" r="10" fill="#4A4038"/><circle cx="42" cy="-12" r="10" fill="#4A4038"/>
                </g>
                <g class="eyes-happy" fill="none" ${soft('#4A4038', 8)}>
                    <path d="M-56 -8 Q -42 -26 -28 -8"/><path d="M28 -8 Q 42 -26 56 -8"/>
                </g>
                <circle cx="-70" cy="24" r="16" fill="#F1B8A1" opacity="0.55"/>
                <circle cx="70" cy="24" r="16" fill="#F1B8A1" opacity="0.55"/>
                ${nose}
                <g class="mouth-smile" fill="none" ${soft('#4A4038', 7)}>
                    <path d="M-20 34 Q 0 52 20 34"/>
                </g>
                <g class="mouth-open">
                    <ellipse cx="0" cy="44" rx="21" ry="17" fill="#8A5F5F"/>
                    <ellipse cx="0" cy="52" rx="10" ry="6" fill="#D98C8C"/>
                </g>
                <g class="mouth-big">
                    <path d="M-30 30 Q 0 64 30 30 Z" fill="#8A5F5F"/>
                </g>
            </g>
        </g>`;
}

//==============================================================================
// Buttons and small marks

const stroke = soft('#8C7A66', 8);

export const ICONS = {
    home: `<g fill="none" ${stroke}>
        <path d="M-30 -2 L 0 -28 L 30 -2"/>
        <path d="M-22 -6 L -22 26 L 22 26 L 22 -6"/>
    </g>`,
    arrow: `<g fill="none" ${stroke}>
        <path d="M-22 0 L 22 0"/><path d="M6 -16 L 22 0 L 6 16"/>
    </g>`,
    again: `<g fill="none" ${stroke}>
        <path d="M22 -4 A 24 24 0 1 1 14 -18"/><path d="M10 -28 L 18 -16 L 4 -12"/>
    </g>`,
    check: `<path d="M-14 0 L -4 10 L 16 -10" fill="none" ${soft('#6E9A6A', 6)}/>`,
    grownups: `<g fill="none" ${soft('#B7AA99', 6)}>
        <path d="M-20 -10 L 20 -10"/><path d="M-20 10 L 20 10"/>
        <circle cx="-6" cy="-10" r="6" fill="#B7AA99"/><circle cx="8" cy="10" r="6" fill="#B7AA99"/>
    </g>`,
    note: `<g fill="none" ${stroke}>
        <path d="M-4 20 L -4 -22 L 22 -28 L 22 14"/>
        <circle cx="-14" cy="20" r="10" fill="#8C7A66"/><circle cx="12" cy="14" r="10" fill="#8C7A66"/>
    </g>`,
};

export function button(icon, r = 50, cls = '') {
    return `
        <circle r="${r}" fill="#FDFBF6" class="button-face"/>
        <g class="button-icon ${cls}">${ICONS[icon]}</g>`;
}
