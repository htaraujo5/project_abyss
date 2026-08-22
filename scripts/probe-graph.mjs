import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message, '\n', e.stack));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /iniciar investigação/i }).click();
await page.waitForTimeout(2500);
await page.locator('.dock-btn', { hasText: 'Graph' }).first().click();
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  const svg = document.querySelector('.graph-canvas svg');
  const lines = [...document.querySelectorAll('.graph-canvas svg line')];
  return {
    svg: svg ? svg.getBoundingClientRect() : null,
    count: lines.length,
    sample: lines.slice(0, 5).map((l) => ({
      x1: l.getAttribute('x1'),
      y1: l.getAttribute('y1'),
      x2: l.getAttribute('x2'),
      y2: l.getAttribute('y2'),
      stroke: getComputedStyle(l).stroke,
      width: getComputedStyle(l).strokeWidth,
      box: l.getBoundingClientRect().width,
    })),
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
