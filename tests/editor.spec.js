import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const svg = body => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">${body}</svg>`);
async function open(page) { await page.goto('/'); await expect(page.locator('#cell-count')).toHaveText('40 × 40 клеток'); }
async function upload(page, buffer, name = 'test.svg', mimeType = 'image/svg+xml') {
  await page.locator('#file-input').setInputFiles({ name, mimeType, buffer });
  await expect(page.locator('#feedback')).toHaveText('Готово! Выберите шаг и скачайте иконку.');
}
async function download(page, selector) {
  const event = page.waitForEvent('download'); await page.locator(selector).click();
  const file = await event; return { name: file.suggestedFilename(), bytes: await readFile(await file.path()) };
}
test('SVG upload, both pixel sizes, vector export and grid-independent PNG with transparency', async ({ page }) => {
  await open(page);
  await upload(page, svg('<rect x="40" y="40" width="120" height="120" fill="#ef4934"/>'));
  const five = await download(page, '#download-svg');
  expect(five.name).toBe('test-pixel-5px.svg');
  expect((five.bytes.toString().match(/<rect /g) || []).length).toBe(576);
  expect(five.bytes.toString()).not.toContain('<image');
  await page.getByRole('radio', { name: '10 px' }).check();
  await expect(page.locator('#cell-count')).toHaveText('20 × 20 клеток');
  const ten = await download(page, '#download-svg');
  expect((ten.bytes.toString().match(/<rect /g) || []).length).toBe(144);
  await page.getByRole('switch').check();
  const png = await download(page, '#download-png');
  expect(png.name).toBe('test-pixel-10px.png');
  const pixels = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 200;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, corner: [...ctx.getImageData(0, 0, 1, 1).data], center: [...ctx.getImageData(100, 100, 1, 1).data] };
  }, png.bytes.toString('base64'));
  expect(pixels).toEqual({ width: 200, height: 200, corner: [0, 0, 0, 0], center: [239, 73, 52, 255] });
});
test('PNG upload and rejection of wrong dimensions preserves the previous result', async ({ page }) => {
  await open(page);
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 200;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, 200, 200);
    return c.toDataURL().split(',')[1];
  });
  await upload(page, Buffer.from(png, 'base64'), 'blue.png', 'image/png');
  await expect(page.locator('#source-tag')).toHaveText('PNG');
  const before = await page.locator('#result').evaluate(c => c.toDataURL());
  await page.locator('#file-input').setInputFiles({ name: 'wrong.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"/>') });
  await expect(page.locator('#feedback')).toContainText('200 × 200');
  expect(await page.locator('#result').evaluate(c => c.toDataURL())).toBe(before);
});
test('invalid and unsafe files are rejected; viewBox-only SVG works', async ({ page }) => {
  await open(page);
  await page.locator('#file-input').setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: svg('<script>alert(1)</script>') });
  await expect(page.locator('#feedback')).toContainText('статичную');
  await page.locator('#file-input').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') });
  await expect(page.locator('#feedback')).toContainText('не является PNG');
  await upload(page, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="60" fill="green"/></svg>'));
});
test('mobile layout, keyboard controls, and no external requests or browser errors', async ({ page }) => {
  const errors = [], external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:4173') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.setViewportSize({ width: 390, height: 844 }); await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('#download-png')).toBeVisible();
  await page.getByRole('radio', { name: '5 px' }).focus(); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '10 px' })).toBeChecked();
  expect(errors).toEqual([]); expect(external).toEqual([]);
});
test('hard coverage preserves source colors, removes partial alpha, and SVG/PNG match', async ({ page }) => {
  await open(page); await upload(page, svg('<rect x="20" y="20" width="3" height="5" fill="red"/><rect x="30" y="20" width="2" height="5" fill="blue"/>'));
  const exported = await download(page, '#download-svg');
  expect(exported.bytes.toString()).toContain('fill="rgb(255,0,0)"');
  expect(exported.bytes.toString()).not.toContain('opacity');
  const pixels = await page.locator('#result').evaluate(c => {
    const ctx = c.getContext('2d');
    return [[...ctx.getImageData(20, 20, 1, 1).data], [...ctx.getImageData(30, 20, 1, 1).data]];
  });
  expect(pixels).toEqual([[255, 0, 0, 255], [0, 0, 0, 0]]);
  const equal = await page.evaluate(async text => {
    const img = new Image(); img.src = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })); await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 200;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); URL.revokeObjectURL(img.src);
    const a = ctx.getImageData(0, 0, 200, 200).data;
    const b = document.querySelector('#result').getContext('2d').getImageData(0, 0, 200, 200).data;
    return a.every((v, i) => Math.abs(v - b[i]) <= 1);
  }, exported.bytes.toString());
  expect(equal).toBe(true);
});
test('SVG internal gradients work and external resources are rejected', async ({ page }) => {
  await open(page);
  await upload(page, svg('<defs><linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="200" height="200" fill="url(\'#g\')"/>'));
  const center = await page.locator('#result').evaluate(c => [...c.getContext('2d').getImageData(100, 100, 1, 1).data]);
  expect(center[3]).toBe(255);
  await page.locator('#file-input').setInputFiles({ name: 'external.svg', mimeType: 'image/svg+xml', buffer: svg('<rect width="200" height="200" fill="url(https://example.com/paint.svg)"/>') });
  await expect(page.locator('#feedback')).toContainText('Внешние ресурсы');
});
for (const step of [5, 10]) {
  test(`antialiased black ring exports as solid ${step}px blocks without gray or partial alpha`, async ({ page }) => {
    await open(page);
    const png = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = c.height = 200;
      const ctx = c.getContext('2d');
      ctx.strokeStyle = '#000'; ctx.lineWidth = 37;
      ctx.beginPath(); ctx.arc(100, 100, 67, 0, Math.PI * 2); ctx.stroke();
      return c.toDataURL().split(',')[1];
    });
    await upload(page, Buffer.from(png, 'base64'), 'ring.png', 'image/png');
    await page.getByRole('radio', { name: `${step} px` }).check();
    const exported = await download(page, '#download-png');
    const stats = await page.evaluate(async ({ data, step }) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const c = document.createElement('canvas'); c.width = c.height = 200;
      const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, 200, 200).data;
      let filled = 0, transparent = 0, gray = 0, partial = 0, mixedCells = 0;
      for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
        const i = (y * 200 + x) * 4;
        if (pixels[i + 3] === 255) filled++; else if (pixels[i + 3] === 0) transparent++; else partial++;
        if (pixels[i + 3] && (pixels[i] || pixels[i + 1] || pixels[i + 2])) gray++;
        const origin = (Math.floor(y / step) * step * 200 + Math.floor(x / step) * step) * 4;
        if ([0, 1, 2, 3].some(channel => pixels[i + channel] !== pixels[origin + channel])) mixedCells++;
      }
      return { width: image.width, height: image.height, filled, transparent, gray, partial, mixedCells };
    }, { data: exported.bytes.toString('base64'), step });
    expect(stats.width).toBe(200); expect(stats.height).toBe(200);
    expect(stats.filled).toBeGreaterThan(1000); expect(stats.transparent).toBeGreaterThan(1000);
    expect(stats.gray).toBe(0); expect(stats.partial).toBe(0); expect(stats.mixedCells).toBe(0);
    const vector = await download(page, '#download-svg');
    expect(vector.bytes.toString()).toContain('width="200" height="200" viewBox="0 0 200 200"');
    expect(vector.bytes.toString()).not.toContain('opacity');
  });
}
test('black and white source edges and neighboring colors never blend into new shades', async ({ page }) => {
  await open(page);
  await upload(page, svg('<rect width="200" height="200" fill="white"/><circle cx="100" cy="100" r="68" fill="black"/>'));
  const colors = await page.locator('#result').evaluate(c => {
    const values = new Set(), data = c.getContext('2d').getImageData(0, 0, 200, 200).data;
    for (let i = 0; i < data.length; i += 4) values.add([...data.slice(i, i + 4)].join(','));
    return [...values].sort();
  });
  expect(colors).toEqual(['0,0,0,255', '255,255,255,255']);
  await upload(page, svg('<rect width="103" height="200" fill="red"/><rect x="103" width="97" height="200" fill="blue"/>'));
  const split = await page.locator('#result').evaluate(c => [...c.getContext('2d').getImageData(100, 50, 1, 1).data]);
  expect(split).toEqual([255, 0, 0, 255]);
});
test('existing 100px SVG and PNG inputs scale to 200px without clipping', async ({ page }) => {
  await open(page);
  await upload(page, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="50" y="50" width="50" height="50" fill="red"/></svg>'));
  const coverage = await page.locator('#result').evaluate(c => {
    const ctx = c.getContext('2d');
    return [[...ctx.getImageData(50, 50, 1, 1).data], [...ctx.getImageData(150, 150, 1, 1).data]];
  });
  expect(coverage).toEqual([[0, 0, 0, 0], [255, 0, 0, 255]]);
  await expect(page.locator('#source-dimensions')).toHaveText('100 × 100 px');
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 100;
    const ctx = c.getContext('2d'); ctx.fillStyle = 'red'; ctx.fillRect(50, 50, 50, 50);
    return c.toDataURL().split(',')[1];
  });
  await upload(page, Buffer.from(png, 'base64'), 'small.png', 'image/png');
  const result = await page.locator('#result').evaluate(c => [...c.getContext('2d').getImageData(150, 150, 1, 1).data]);
  expect(result).toEqual([255, 0, 0, 255]);
});
