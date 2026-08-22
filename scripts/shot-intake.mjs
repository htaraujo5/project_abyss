import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const OUT = 'tmp-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2600);

async function type(text) {
  await page.locator('.intake-input').fill(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(420);
}

await type('ajuda');
await page.screenshot({ path: `${OUT}/in-04-help.png` });

const user = `analista${Date.now().toString().slice(-6)}`;
await type('cadastrar');
await type('Helisson Ferreira');
await type(`${user}@abyss.test`);
await type('+55 11 99999-0000');
await type(user);
await type('senha-forte-3301');
await type('senha-forte-3301');
await page.waitForTimeout(4500);
await page.screenshot({ path: `${OUT}/in-05-desktop.png` });
console.log('desktop?', await page.locator('.desktop').count());
await browser.close();
console.log('ok');
