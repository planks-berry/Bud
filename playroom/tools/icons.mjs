// Renders the home-screen icons and the iPad launch images from the playroom's own drawing code,
// so the icon on the home screen is the same bud the playroom opens on, and the launch image is
// the opening screen itself: tapping the icon goes from one to the other with nothing changing.
//
//   cd playroom
//   npm install --no-save playwright
//   node tools/icons.mjs
//
// The PNGs are committed. iOS fetches them by URL, and drawing them needs a browser that a deploy
// should not have to install.

import { chromium } from 'playwright';
import { deflateSync } from 'node:zlib';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.js': 'text/javascript', '.html': 'text/html' };

const server = createServer(async (request, response) => {
    if (request.url === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end('<!doctype html><meta charset="utf-8"><body></body>');
        return;
    }
    try {
        const path = request.url.split('?')[0];
        const body = await readFile(join(root, path));
        response.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
        response.end(body);
    } catch {
        response.writeHead(404).end();
    }
});
await new Promise((resolve) => server.listen(0, resolve));

// The same browser lookup as test.mjs: the container's own Chromium if there is one.
const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const executablePath =
    process.env.BUD_CHROME || (existsSync(CONTAINER_CHROME) ? CONTAINER_CHROME : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/`);

const images = await page.evaluate(async () => {
    const { drawBud, drawLeaf, StartScene } = await import('/js/start.js');
    const { PALETTE } = await import('/js/draw.js');

    // The bud on its stem, close up, on the playroom's wall colour. iOS rounds the corners itself.
    function icon(size) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const s = size;
        const u = s / 240;
        ctx.fillStyle = PALETTE.wall;
        ctx.fillRect(0, 0, s, s);
        const glow = ctx.createRadialGradient(s * 0.5, s * 0.4, 0, s * 0.5, s * 0.4, s * 0.62);
        glow.addColorStop(0, 'rgba(255, 246, 222, 1)');
        glow.addColorStop(1, 'rgba(255, 246, 222, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, s, s);

        ctx.strokeStyle = PALETTE.sageDeep;
        ctx.lineWidth = Math.max(2, 11 * u);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s * 0.5, s * 1.05);
        ctx.quadraticCurveTo(s * 0.45, s * 0.76, s * 0.5, s * 0.52);
        ctx.stroke();
        for (const [x, y, angle, length, colour] of [
            [0.48, 0.84, -0.75, 0.25, PALETTE.sage],
            [0.47, 0.7, Math.PI + 0.65, 0.21, PALETTE.sageDeep],
        ]) {
            ctx.save();
            ctx.translate(s * x, s * y);
            ctx.rotate(angle);
            drawLeaf(ctx, s * length, colour, u);
            ctx.restore();
        }
        ctx.save();
        ctx.translate(s * 0.5, s * 0.36);
        drawBud(ctx, s * 0.2, u);
        ctx.restore();
        return pixels(canvas);
    }

    // Raw RGB, base64: the browser's own PNG encoder favours speed over size, and the files are
    // encoded properly below instead.
    function pixels(canvas) {
        const rgba = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const rgb = new Uint8Array((rgba.length / 4) * 3);
        for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
            rgb[j] = rgba[i];
            rgb[j + 1] = rgba[i + 1];
            rgb[j + 2] = rgba[i + 2];
        }
        let binary = '';
        for (let i = 0; i < rgb.length; i += 0x8000)
            binary += String.fromCharCode.apply(null, rgb.subarray(i, i + 0x8000));
        return { width: canvas.width, height: canvas.height, data: btoa(binary) };
    }

    // The opening screen, still: the moment in its sway where the stem stands upright and the
    // invitation ring has faded out.
    function splash(w, h) {
        const scene = new StartScene({ enterShelf() {}, warmUp() {} }, { grain: false });
        scene.resize(w, h, 2);
        scene.time = 10.399;
        const canvas = document.createElement('canvas');
        canvas.width = w * 2;
        canvas.height = h * 2;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        scene.draw(ctx);
        return pixels(canvas);
    }

    const out = {};
    for (const size of [32, 152, 167, 180, 192, 512]) out[`icon-${size}.png`] = icon(size);
    out['splash-1536x2048.png'] = splash(768, 1024);
    out['splash-2048x1536.png'] = splash(1024, 768);
    return out;
});

for (const [name, image] of Object.entries(images)) {
    const data = encodePng(image.width, image.height, Buffer.from(image.data, 'base64'));
    await writeFile(join(root, 'icons', name), data);
    console.log(`  icons/${name}  ${(data.length / 1024).toFixed(1)} KB`);
}

await browser.close();
server.close();

//==============================================================================
// A small PNG encoder: 8-bit RGB, the best of the five row filters chosen per row by the usual
// minimum-sum-of-absolute-differences heuristic, deflated at level 9. A quarter the size of what
// the browser writes for the same pixels, losslessly.

function encodePng(width, height, rgb) {
    const stride = width * 3;
    const raw = Buffer.alloc((stride + 1) * height);
    const candidates = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
    for (let y = 0; y < height; y++) {
        const row = rgb.subarray(y * stride, (y + 1) * stride);
        const above = y > 0 ? rgb.subarray((y - 1) * stride, y * stride) : null;
        let best = 0;
        let bestScore = Infinity;
        for (let filter = 0; filter < 5; filter++) {
            const out = candidates[filter];
            let score = 0;
            for (let x = 0; x < stride; x++) {
                const a = x >= 3 ? row[x - 3] : 0;
                const b = above ? above[x] : 0;
                const c = above && x >= 3 ? above[x - 3] : 0;
                let predicted = 0;
                if (filter === 1) predicted = a;
                else if (filter === 2) predicted = b;
                else if (filter === 3) predicted = (a + b) >> 1;
                else if (filter === 4) {
                    const p = a + b - c;
                    const pa = Math.abs(p - a);
                    const pb = Math.abs(p - b);
                    const pc = Math.abs(p - c);
                    predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
                }
                const value = (row[x] - predicted) & 0xff;
                out[x] = value;
                score += value < 128 ? value : 256 - value;
            }
            if (score < bestScore) {
                bestScore = score;
                best = filter;
            }
        }
        raw[y * (stride + 1)] = best;
        candidates[best].copy(raw, y * (stride + 1) + 1);
    }

    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 2;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
}

// The table hangs off the function rather than a module-level `let`: the encoder is called from
// top-level code above, before any later declaration would be initialised.
function crc32(buffer) {
    if (!crc32.table) {
        crc32.table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            crc32.table[n] = c >>> 0;
        }
    }
    const table = crc32.table;
    let crc = 0xffffffff;
    for (let i = 0; i < buffer.length; i++) crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
