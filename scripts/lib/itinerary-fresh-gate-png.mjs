import { PNG } from 'pngjs';

function downscale(png, factor = 4) {
  const w = Math.max(1, Math.floor(png.width / factor));
  const h = Math.max(1, Math.floor(png.height / factor));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(png.width - 1, x * factor);
      const sy = Math.min(png.height - 1, y * factor);
      const si = (png.width * sy + sx) << 2;
      const di = (w * y + x) << 2;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

function diffMasked(a, b, masks, factor, inside) {
  const da = downscale(a, factor);
  const db = downscale(b, factor);
  const w = Math.min(da.width, db.width);
  const h = Math.min(da.height, db.height);
  let compared = 0;
  let mism = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const fx = x * factor;
      const fy = y * factor;
      const inMask = masks.some((m) => fx >= m.x && fx < m.x + m.width && fy >= m.y && fy < m.y + m.height);
      if (inside !== inMask) continue;
      compared += 1;
      const j = (da.width * y + x) << 2;
      const k = (db.width * y + x) << 2;
      if (Math.abs(da.data[j] - db.data[k]) > 18
        || Math.abs(da.data[j + 1] - db.data[k + 1]) > 18
        || Math.abs(da.data[j + 2] - db.data[k + 2]) > 18) mism += 1;
    }
  }
  return { ratio: compared ? mism / compared : 0, mism, compared };
}

export function diffOutsideMasks(a, b, masks, factor = 4) {
  return diffMasked(a, b, masks, factor, false);
}

export function diffInsideMasks(a, b, masks, factor = 4) {
  return diffMasked(a, b, masks, factor, true);
}

export function cropPng(png, clip) {
  const x = Math.max(0, Math.floor(clip.x));
  const y = Math.max(0, Math.floor(clip.y));
  const w = Math.max(1, Math.min(png.width - x, Math.floor(clip.width)));
  const h = Math.max(1, Math.min(png.height - y, Math.floor(clip.height)));
  const out = new PNG({ width: w, height: h });
  for (let row = 0; row < h; row += 1) {
    for (let col = 0; col < w; col += 1) {
      const si = ((y + row) * png.width + (x + col)) << 2;
      const di = (row * w + col) << 2;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}

export function stitch(left, right) {
  const h = Math.max(left.height, right.height);
  const out = new PNG({ width: left.width + right.width, height: h });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < left.width; x += 1) {
      if (y >= left.height) continue;
      const si = (left.width * y + x) << 2;
      const di = (out.width * y + x) << 2;
      out.data[di] = left.data[si];
      out.data[di + 1] = left.data[si + 1];
      out.data[di + 2] = left.data[si + 2];
      out.data[di + 3] = 255;
    }
    for (let x = 0; x < right.width; x += 1) {
      if (y >= right.height) continue;
      const si = (right.width * y + x) << 2;
      const di = (out.width * y + left.width + x) << 2;
      out.data[di] = right.data[si];
      out.data[di + 1] = right.data[si + 1];
      out.data[di + 2] = right.data[si + 2];
      out.data[di + 3] = 255;
    }
  }
  return out;
}
