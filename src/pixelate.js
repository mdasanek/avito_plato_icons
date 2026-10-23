/** Average premultiplied RGBA: transparent pixels do not add black halos. */
export function pixelate(data, width, height, step) {
  if (![5, 10].includes(step)) throw new Error('Unsupported pixel size');
  const cells = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      let alpha = 0, r = 0, g = 0, b = 0;
      const w = Math.min(step, width - x), h = Math.min(step, height - y);
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const i = ((y + dy) * width + x + dx) * 4, a = data[i + 3];
        alpha += a; r += data[i] * a; g += data[i + 1] * a; b += data[i + 2] * a;
      }
      const a = Math.round(alpha / (w * h));
      if (a) cells.push({ x, y, w, h, r: Math.round(r / alpha), g: Math.round(g / alpha), b: Math.round(b / alpha), a });
    }
  }
  return cells;
}
export function toSVG(cells) {
  const rects = cells.map(c => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="rgb(${c.r},${c.g},${c.b})"${c.a < 255 ? ` fill-opacity="${c.a / 255}"` : ''}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100" shape-rendering="crispEdges">${rects}</svg>`;
}
