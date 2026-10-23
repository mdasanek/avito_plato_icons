import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const svg = body => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">${body}</svg>`);
async function open(page) { await page.goto('/'); await expect(page.locator('#cell-count')).toHaveText('20 × 20 клеток'); }
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
  await upload(page, svg('<rect x="20" y="20" width="60" height="60" fill="#ef4934"/>'));
  const five = await download(page, '#download-svg');
  expect(five.name).toBe('test-pixel-5px.svg');
  expect((five.bytes.toString().match(/<rect /g) || []).length).toBe(144);
  expect(five.bytes.toString()).not.toContain('<image');
  await page.getByRole('radio', { name: '10 px' }).check();
  await expect(page.locator('#cell-count')).toHaveText('10 × 10 клеток');
  const ten = await download(page, '#download-svg');
  expect((ten.bytes.toString().match(/<rect /g) || []).length).toBe(36);
  await page.getByRole('switch').check();
  const png = await download(page, '#download-png');
  expect(png.name).toBe('test-pixel-10px.png');
  const pixels = await page.evaluate(async data => {
    const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 100;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, corner: [...ctx.getImageData(0, 0, 1, 1).data], center: [...ctx.getImageData(50, 50, 1, 1).data] };
  }, png.bytes.toString('base64'));
  expect(pixels).toEqual({ width: 100, height: 100, corner: [0, 0, 0, 0], center: [239, 73, 52, 255] });
});
test('PNG upload and rejection of wrong dimensions preserves the previous result', async ({ page }) => {
  await open(page);
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = c.height = 100;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#2563eb'; ctx.fillRect(0, 0, 100, 100);
    return c.toDataURL().split(',')[1];
  });
  await upload(page, Buffer.from(png, 'base64'), 'blue.png', 'image/png');
  await expect(page.locator('#source-tag')).toHaveText('PNG');
  const before = await page.locator('#result').evaluate(c => c.toDataURL());
  await page.locator('#file-input').setInputFiles({ name: 'wrong.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"/>') });
  await expect(page.locator('#feedback')).toContainText('100 × 100');
  expect(await page.locator('#result').evaluate(c => c.toDataURL())).toBe(before);
});
test('invalid and unsafe files are rejected; viewBox-only SVG works', async ({ page }) => {
  await open(page);
  await page.locator('#file-input').setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: svg('<script>alert(1)</script>') });
  await expect(page.locator('#feedback')).toContainText('статичную');
  await page.locator('#file-input').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not a PNG') });
  await expect(page.locator('#feedback')).toContainText('не является PNG');
  await upload(page, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="green"/></svg>'));
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
test('alpha-aware averaging preserves colors and SVG/PNG match', async ({ page }) => {
  await open(page); await upload(page, svg('<rect x="20" y="20" width="3" height="5" fill="red"/>'));
  const exported = await download(page, '#download-svg');
  expect(exported.bytes.toString()).toContain('fill="rgb(255,0,0)" fill-opacity="0.6"');
  const equal = await page.evaluate(async text => {
    const img = new Image(); img.src = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })); await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 100;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); URL.revokeObjectURL(img.src);
    const a = ctx.getImageData(0, 0, 100, 100).data;
    const b = document.querySelector('#result').getContext('2d').getImageData(0, 0, 100, 100).data;
    return a.every((v, i) => Math.abs(v - b[i]) <= 1);
  }, exported.bytes.toString());
  expect(equal).toBe(true);
});
test('SVG internal gradients work and external resources are rejected', async ({ page }) => {
  await open(page);
  await upload(page, svg('<defs><linearGradient id="g"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><rect width="100" height="100" fill="url(\'#g\')"/>'));
  const center = await page.locator('#result').evaluate(c => [...c.getContext('2d').getImageData(50, 50, 1, 1).data]);
  expect(center[3]).toBe(255);
  await page.locator('#file-input').setInputFiles({ name: 'external.svg', mimeType: 'image/svg+xml', buffer: svg('<rect width="100" height="100" fill="url(https://example.com/paint.svg)"/>') });
  await expect(page.locator('#feedback')).toContainText('Внешние ресурсы');
});
