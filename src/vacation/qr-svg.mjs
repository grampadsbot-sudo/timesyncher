import QRCode from 'qrcode';

export function qrModules(value) {
  const qr = QRCode.create(String(value || ''), { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const grid = [];
  for (let y = 0; y < size; y += 1) {
    const row = [];
    for (let x = 0; x < size; x += 1) row.push(qr.modules.get(x, y) ? 1 : 0);
    grid.push(row);
  }
  return grid;
}

export function qrSvg(value, { size = 96 } = {}) {
  const modules = qrModules(value);
  const n = modules.length;
  const quiet = 2;
  const dim = n + quiet * 2;
  const cell = size / dim;
  let rects = '';
  for (let r = 0; r < n; r += 1) {
    for (let c = 0; c < n; c += 1) {
      if (!modules[r][c]) continue;
      rects += `<rect x="${((c + quiet) * cell).toFixed(2)}" y="${((r + quiet) * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" />`;
    }
  }
  return `<svg class="qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR">${rects}</svg>`;
}

export function qrDataUri(value, { size = 96 } = {}) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrSvg(value, { size }))}`;
}
