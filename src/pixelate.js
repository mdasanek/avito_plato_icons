/** Hard-edged cells: binary coverage and a dominant source color, never a blend. */
export function pixelate(data, width, height, step) {
  if (![5, 10].includes(step)) throw new Error('Unsupported pixel size');
  const cells = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const w = Math.min(step, width - x), h = Math.min(step, height - y);
      const colors = new Map();
      let covered = 0;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const i = ((y + dy) * width + x + dx) * 4;
        if (data[i + 3] < 128) continue;
        covered++;
        const color = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        colors.set(color, (colors.get(color) || 0) + data[i + 3]);
      }
      if (covered < w * h / 2) continue;
      let dominant = 0, highestWeight = -1;
      for (const [color, weight] of colors) {
        if (weight > highestWeight) { dominant = color; highestWeight = weight; }
      }
      cells.push({ x, y, w, h, r: dominant >> 16, g: (dominant >> 8) & 255, b: dominant & 255, a: 255 });
    }
  }
  return cells;
}
export function toSVG(cells, width, height) {
  const rects = cells.map(c => `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" fill="rgb(${c.r},${c.g},${c.b})"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${rects}</svg>`;
}
