import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** @param {import('puppeteer-core').Page} page */
export async function collectBrandLogoChips(page) {
  return page.evaluate(() => {
    const out = [];
    const imgs = document.querySelectorAll(
      'img.tiny-logo[src], span[data-ts-logo-chip="1"] img[src][alt=""]',
    );
    for (const img of imgs) {
      const src = String(img.getAttribute('src') || '').trim();
      if (!src || /^data:image\/svg\+xml/i.test(src)) continue;
      const wrapper = img.closest('[data-ts-logo-chip="1"]') || img.parentElement;
      if (!wrapper) continue;
      const rect = wrapper.getBoundingClientRect();
      if (rect.width < 12 || rect.height < 12) continue;
      const id = `brand-${out.length}`;
      wrapper.setAttribute('data-ts-logo-chip-id', id);
      out.push({
        kind: 'brand',
        selector: `[data-ts-logo-chip-id="${id}"]`,
      });
    }
    return out;
  });
}

/** @param {import('puppeteer-core').Page} page @param {string} selector */
export async function measureCenterOfMassOffset(page, selector) {
  return page.evaluate(async (sel) => {
    const chip = document.querySelector(sel);
    if (!chip) return null;
    const rect = chip.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, w, h);

    const img = chip.matches('img') ? chip : chip.querySelector('img');
    const emojiSpan = !img
      ? (chip.matches('span') && !chip.querySelector('img')
        ? chip
        : chip.querySelector('span'))
      : null;

    const drawContainedImage = (image, boxW, boxH) => {
      const nw = image.naturalWidth;
      const nh = image.naturalHeight;
      if (!nw || !nh) return false;
      const scale = Math.min(boxW / nw, boxH / nh);
      const dw = nw * scale;
      const dh = nh * scale;
      const dx = (boxW - dw) / 2;
      const dy = (boxH - dh) / 2;
      ctx.drawImage(image, dx, dy, dw, dh);
      return true;
    };

    const draw = () => {
      if (img && img.complete && img.naturalWidth > 0) {
        return drawContainedImage(img, w, h);
      }
      if (emojiSpan) {
        const fontSize = Math.max(12, Math.round(Math.min(w, h) * 0.62));
        ctx.font = `${fontSize}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#111827';
        ctx.fillText(emojiSpan.textContent || '', w / 2, h / 2);
        return true;
      }
      return false;
    };

    if (img && !img.complete) {
      await new Promise((resolve, reject) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', reject, { once: true });
      });
    }
    if (!draw()) return null;

    const { data } = ctx.getImageData(0, 0, w, h);
    let sumX = 0;
    let sumY = 0;
    let mass = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const i = (y * w + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a < 16) continue;
        if (r > 245 && g > 245 && b > 245) continue;
        if (r > 248 && g > 250 && b > 252) continue;
        const weight = a / 255;
        sumX += x * weight;
        sumY += y * weight;
        mass += weight;
      }
    }
    if (mass < 4) return null;
    const cx = sumX / mass;
    const cy = sumY / mass;
    const boxCx = (w - 1) / 2;
    const boxCy = (h - 1) / 2;
    return {
      dx: cx - boxCx,
      dy: cy - boxCy,
      absDx: Math.abs(cx - boxCx),
      absDy: Math.abs(cy - boxCy),
      width: w,
      height: h,
      mass,
    };
  }, selector);
}

export async function screenshotChipCrop(page, selector, filePath) {
  const el = await page.$(selector);
  if (!el) throw new Error(`missing chip for screenshot: ${selector}`);
  await mkdir(path.dirname(filePath), { recursive: true });
  await el.screenshot({ path: filePath, type: 'png' });
}

export function assertComWithinTolerance(metrics, maxOffset = 1.5) {
  for (const row of metrics) {
    if (!row.offset) throw new Error(`missing offset for ${row.place} ${row.surface}`);
    const err = Math.hypot(row.offset.absDx, row.offset.absDy);
    if (err > maxOffset) {
      throw new Error(
        `${row.place}/${row.surface} center-of-mass offset ${err.toFixed(2)}px (dx=${row.offset.dx.toFixed(2)}, dy=${row.offset.dy.toFixed(2)})`,
      );
    }
  }
}
