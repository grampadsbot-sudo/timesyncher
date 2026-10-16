import { PNG } from 'pngjs';

const INK_ALPHA = 16;

function readPng(input) {
  return PNG.sync.read(Buffer.isBuffer(input) ? input : Buffer.from(input));
}

function inkBounds(png) {
  const { width, height, data } = png;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < INK_ALPHA) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function centreLogoPng(input, size = 18) {
  const side = Math.max(1, Math.round(Number(size) || 18));
  const src = readPng(input);
  const bounds = inkBounds(src);
  const out = new PNG({ width: side, height: side });
  if (!bounds) return PNG.sync.write(out);
  const scale = Math.min(side / bounds.w, side / bounds.h, 1);
  const dw = Math.max(1, Math.round(bounds.w * scale));
  const dh = Math.max(1, Math.round(bounds.h * scale));
  const dx = Math.floor((side - dw) / 2);
  const dy = Math.floor((side - dh) / 2);
  for (let y = 0; y < dh; y += 1) {
    for (let x = 0; x < dw; x += 1) {
      const sx = bounds.minX + Math.min(bounds.w - 1, Math.floor(x / scale));
      const sy = bounds.minY + Math.min(bounds.h - 1, Math.floor(y / scale));
      const si = (sy * src.width + sx) * 4;
      const di = ((dy + y) * side + (dx + x)) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return PNG.sync.write(out);
}

function centreDataPngLogo(url, size = 18) {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(url || '').trim());
  if (!match) return url;
  const centred = centreLogoPng(Buffer.from(match[1], 'base64'), size);
  return `data:image/png;base64,${centred.toString('base64')}`;
}

export function centreResolvedLogoPayload(shared = {}) {
  const next = {
    ...shared,
    places: Array.isArray(shared.places) ? shared.places.map((place) => ({ ...place })) : [],
    thingOverrides: shared.thingOverrides && typeof shared.thingOverrides === 'object'
      ? { ...shared.thingOverrides }
      : {},
  };
  for (const place of next.places) {
    const key = `place:${place.id}`;
    const override = { ...(next.thingOverrides[key] || {}) };
    if (override.logoUrl) override.logoUrl = centreDataPngLogo(override.logoUrl);
    if (place.logoUrl) place.logoUrl = centreDataPngLogo(place.logoUrl);
    if (place.captured_logo_url) place.captured_logo_url = centreDataPngLogo(place.captured_logo_url);
    next.thingOverrides[key] = override;
  }
  return next;
}
