import { pixelate, toSVG } from './pixelate.js';
const $ = s => document.querySelector(s);
const original = $('#original'), result = $('#result');
const source = original.getContext('2d', { willReadFrequently: true });
const output = result.getContext('2d');
let step = 5, cells = [], filename = 'flower', revision = 0, loading = false;
const demo = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><path d="M49 54h6v40h-6z" fill="#366a48"/><path d="M52 78C31 79 25 67 27 59c17-1 27 8 25 19" fill="#5c9561"/><path d="M53 86c17-1 24-12 21-21-14 0-23 8-21 21" fill="#83aa65"/><path d="M50 16C33-8 17 12 24 27 0 23-4 49 19 54 5 74 27 91 42 73c7 25 33 17 32-4 25 7 36-19 14-30 16-18-5-38-22-25-3-18-14-18-16 2" fill="#f17663"/><circle cx="50" cy="45" r="14" fill="#f8cd61"/></svg>';
function feedback(message, error = false) { $('#feedback').textContent = message; $('#feedback').classList.toggle('error', error); }
function render() {
  cells = pixelate(source.getImageData(0, 0, 100, 100).data, 100, 100, step);
  output.clearRect(0, 0, 100, 100);
  for (const c of cells) { output.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a / 255})`; output.fillRect(c.x, c.y, c.w, c.h); }
  $('#step-tag').textContent = `Шаг ${step} px`;
  $('#cell-count').textContent = `${100 / step} × ${100 / step} клеток`;
  $('#step-hint').textContent = step === 5 ? 'Больше деталей, мягче силуэт' : 'Крупнее пиксель, смелее силуэт';
  $('#result-stage').style.setProperty('--grid-size', `${step}%`);
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
  for (const name of ['width', 'height']) {
    if (!svg.hasAttribute(name)) {
      if (viewBox?.length !== 4 || viewBox[2] !== 100 || viewBox[3] !== 100) throw new Error('Нужна иконка размером 100 × 100 px.');
      svg.setAttribute(name, '100');
    } else if (!/^100(?:\.0+)?(?:px)?$/.test(svg.getAttribute(name).trim())) throw new Error('Нужна иконка размером 100 × 100 px.');
  }
  return new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
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
    const blob = svg ? safeSVG(await file.text()) : file;
    if (!svg) {
      const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (signature.join(',') !== '137,80,78,71,13,10,26,10') throw new Error('Этот файл не является PNG. Проверьте формат.');
    }
    const image = await imageFromBlob(blob);
    if (ticket !== revision) return;
    if (image.naturalWidth !== 100 || image.naturalHeight !== 100) throw new Error(`Размер иконки — ${image.naturalWidth} × ${image.naturalHeight} px. Нужен 100 × 100 px.`);
    source.clearRect(0, 0, 100, 100); source.drawImage(image, 0, 0);
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
