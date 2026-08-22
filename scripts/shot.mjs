import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'tmp-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text());
});
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/01-boot.png` });

await page.locator('.intake-input').fill('anonimo');
await page.keyboard.press('Enter');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/02-desktop.png` });

async function open(label, file, wait = 1400) {
  await page.locator('.dock-btn', { hasText: label }).first().click();
  await page.waitForTimeout(wait);
  await page.screenshot({ path: `${OUT}/${file}` });
}

await open('Trace', '03-trace.png', 2200);
await open('Evidence', '04-evidence.png');
await open('Graph', '05-graph.png', 2000);
await open('Img Lab', '06-imagelab.png');
await open('Code', '07-code.png', 2600);
await open('Orpheus', '08-orpheus.png');
await open('Packet', '09-packet.png');
await open('Hex', '10-hex.png');

await page.keyboard.press('Control+K');
await page.waitForTimeout(700);
await page.keyboard.type('orpheus');
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/11-palette.png` });
await page.keyboard.press('Escape');

await page.keyboard.press('Control+Shift+G');
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/12-tiled.png` });

await browser.close();
console.log('ok');
