// Renders icon.svg to the PNG sizes a home screen asks for. Run once, commit the result.
//
//   node kitchen/icons.mjs
//
// The SVG is the icon; the PNGs exist because iOS reads only `apple-touch-icon` and some
// launchers still want a raster in the manifest.

import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const svg = await readFile(join(here, 'icon.svg'), 'utf8');
const data = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const CONTAINER_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
    executablePath: process.env.KITCHEN_CHROME || (existsSync(CONTAINER_CHROME) ? CONTAINER_CHROME : undefined),
});

for (const [file, size] of [['icon-512.png', 512], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<img src="${data}" style="display:block;width:${size}px;height:${size}px">`);
    await page.screenshot({ path: join(here, file), omitBackground: true });
    await page.close();
    console.log(`${file}  ${size}×${size}`);
}

await browser.close();
