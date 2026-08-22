import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2400);

async function type(text) {
  await page.locator('.intake-input').fill(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
}

await type('anonimo');
await page.waitForTimeout(3000);
console.log('t+3s topbar:', (await page.locator('.topbar').innerText()).replace(/\n/g, ' | '));

const shape = await page.evaluate(async () => {
  const r = await fetch('/api/meta/chapters');
  const j = await r.json();
  return { keys: Object.keys(j), metaKeys: Object.keys(j.meta ?? {}).slice(0, 3) };
});
console.log('shape:', JSON.stringify(shape));

await page.waitForTimeout(6000);
console.log('t+9s topbar:', (await page.locator('.topbar').innerText()).replace(/\n/g, ' | '));
console.log(
  't+9s statusbar:',
  (await page.locator('.statusbar').first().innerText()).replace(/\n/g, ' | '),
);
await browser.close();
