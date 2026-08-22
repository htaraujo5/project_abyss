import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'tmp-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.locator('.intake-input').fill('anonimo');
await page.keyboard.press('Enter');
await page.waitForTimeout(4000);

for (const label of ['Trace', 'Evidence', 'Code']) {
  await page.locator('.dock-btn', { hasText: label }).first().click();
  await page.waitForTimeout(1200);
}
await page.keyboard.press('Control+Shift+G');
await page.waitForTimeout(900);

for (const ch of ['surface', 'mariana', 'primarch', 'observer']) {
  await page.evaluate((c) => {
    document.documentElement.dataset.chapter = c;
  }, ch);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/ch-${ch}.png` });
}

await browser.close();
console.log('ok');
