import { pixelate, toSVG, SIZE } from './pixelate.js?v=2';
const $ = s => document.querySelector(s);
const original = $('#original'), result = $('#result');
const source = original.getContext('2d', { willReadFrequently: true });
const output = result.getContext('2d');
let step = 5, cells = [], filename = 'ring', revision = 0, loading = false;
const demo = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><path fill="#000" fill-rule="evenodd" d="M100 10 180 55v95l-80 40-80-40V55Zm0 50c-22 0-40 18-40 40s18 40 40 40 40-18 40-40-18-40-40-40Z"/></svg>';
function feedback(message, error = false) { $('#feedback').textContent = message; $('#feedback').classList.toggle('error', error); }
function render() {
  cells = pixelate(source.getImageData(0, 0, SIZE, SIZE).data, SIZE, SIZE, step);
  output.clearRect(0, 0, SIZE, SIZE);
  for (const c of cells) { output.fillStyle = `rgb(${c.r},${c.g},${c.b})`; output.fillRect(c.x, c.y, c.w, c.h); }
  $('#step-tag').textContent = `Шаг ${step} px`;
  $('#cell-count').textContent = `${SIZE / step} × ${SIZE / step} клеток`;
  $('#step-hint').textContent = step === 5 ? 'Больше деталей, чёткие края' : 'Крупнее пиксель, смелее силуэт';
  $('#result-stage').style.setProperty('--grid-size', `${step / SIZE * 100}%`);
}
function imageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть изображение. Проверьте файл.')); };
    image.src = url;
  });
}
function safeSVG(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg' || doc.documentElement.namespaceURI !== 'http://www.w3.org/2000/svg') throw new Error('Не удалось прочитать SVG. Проверьте файл.');
  if (doc.doctype) throw new Error('SVG с DOCTYPE не поддерживается. Экспортируйте обычный SVG.');
  for (const el of doc.querySelectorAll('*')) {
    if (['script', 'foreignobject', 'image', 'iframe', 'object', 'embed', 'audio', 'video', 'animate', 'animatetransform', 'animatemotion', 'set'].includes(el.localName.toLowerCase())) throw new Error('SVG должен содержать только статичную векторную иконку.');
    for (const attr of el.attributes) {
      if (/^on/i.test(attr.name) || (['href', 'xlink:href'].includes(attr.name) && !attr.value.startsWith('#')) || externalURL(attr.value)) throw new Error('Внешние ресурсы и скрипты в SVG не поддерживаются.');
    }
    if (el.localName === 'style' && (/@import/i.test(el.textContent) || externalURL(el.textContent))) throw new Error('Внешние стили в SVG не поддерживаются.');
  }
  const svg = doc.documentElement;
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number);
  const dimensions = ['width', 'height'].map((name, axis) => {
    if (!svg.hasAttribute(name)) return viewBox?.length === 4 ? viewBox[axis + 2] : NaN;
    const match = /^(100|200)(?:\.0+)?(?:px)?$/.exec(svg.getAttribute(name).trim());
    return match ? Number(match[1]) : NaN;
  });
  if (![100, SIZE].includes(dimensions[0]) || dimensions[0] !== dimensions[1]) throw new Error('Нужна квадратная иконка 100 × 100 или 200 × 200 px.');
  if (!svg.hasAttribute('viewBox')) svg.setAttribute('viewBox', `0 0 ${dimensions[0]} ${dimensions[1]}`);
  svg.setAttribute('width', String(SIZE));
  svg.setAttribute('height', String(SIZE));
  return { blob: new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }), size: dimensions[0] };
}
function externalURL(value) {
  return [...value.matchAll(/url\(([^)]*)\)/gi)].some(match => !match[1].trim().replace(/^['"]|['"]$/g, '').startsWith('#'));
}
async function upload(file) {
  const ticket = ++revision;
  if (!file) return;
  loading = true;
  document.querySelectorAll('.export button').forEach(button => button.disabled = true);
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Файл слишком большой. Максимум — 5 МБ.');
    const svg = /\.svg$/i.test(file.name) || file.type === 'image/svg+xml';
    if (!svg && !/\.png$/i.test(file.name) && file.type !== 'image/png') throw new Error('Выберите SVG или PNG. Другие форматы не поддерживаются.');
    feedback('Открываем иконку…');
    const vector = svg ? safeSVG(await file.text()) : null;
    const blob = vector ? vector.blob : file;
    if (!svg) {
      const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (signature.join(',') !== '137,80,78,71,13,10,26,10') throw new Error('Этот файл не является PNG. Проверьте формат.');
    }
    const image = await imageFromBlob(blob);
    if (ticket !== revision) return;
    if (![100, SIZE].includes(image.naturalWidth) || image.naturalWidth !== image.naturalHeight) throw new Error(`Размер иконки — ${image.naturalWidth} × ${image.naturalHeight} px. Нужен 100 × 100 или 200 × 200 px.`);
    source.clearRect(0, 0, SIZE, SIZE);
    source.imageSmoothingEnabled = false;
    source.drawImage(image, 0, 0, SIZE, SIZE);
    const sourceSize = vector ? vector.size : image.naturalWidth;
    $('#source-dimensions').textContent = `${sourceSize} × ${sourceSize} px`;
    filename = file.name.replace(/\.(svg|png)$/i, '') || 'icon';
    $('#source-name').textContent = file.name; $('#source-tag').textContent = svg ? 'SVG' : 'PNG';
    render(); feedback('Готово! Выберите шаг и скачайте иконку.');
  } catch (error) { if (ticket === revision) feedback(error.message, true); }
  finally {
    if (ticket === revision) { loading = false; document.querySelectorAll('.export button').forEach(button => button.disabled = false); }
    $('#file-input').value = '';
  }
}
function download(blob, extension) {
  if (!blob) { feedback('Не удалось создать файл. Попробуйте ещё раз.', true); return; }
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `${filename}-pixel-${step}px.${extension}`; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
document.querySelectorAll('[name="step"]').forEach(input => input.addEventListener('change', () => { step = Number(input.value); render(); }));
$('#show-grid').addEventListener('change', event => $('#result-stage').classList.toggle('show-grid', event.target.checked));
$('#file-input').addEventListener('change', event => upload(event.target.files[0]));
const zone = $('#upload-zone');
let dragDepth = 0;
zone.addEventListener('dragover', event => event.preventDefault());
zone.addEventListener('dragenter', event => { event.preventDefault(); dragDepth++; zone.classList.add('dragging'); });
zone.addEventListener('dragleave', () => { if (--dragDepth <= 0) zone.classList.remove('dragging'); });
zone.addEventListener('drop', event => { event.preventDefault(); dragDepth = 0; zone.classList.remove('dragging'); if (event.dataTransfer.files.length !== 1) feedback('Загрузите одну иконку за раз.', true); else upload(event.dataTransfer.files[0]); });
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());
$('#download-png').addEventListener('click', () => { if (!loading) result.toBlob(blob => download(blob, 'png'), 'image/png'); });
$('#download-svg').addEventListener('click', () => { if (!loading) download(new Blob([toSVG(cells)], { type: 'image/svg+xml' }), 'svg'); });
const image = await imageFromBlob(new Blob([demo], { type: 'image/svg+xml' }));
if (revision === 0) { source.drawImage(image, 0, 0); render(); }
