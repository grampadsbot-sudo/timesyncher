import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { analyzeLogoChipPngBuffer } from './logo-pixel-ink-grade.mjs';

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

export async function measureCenterOfMassOffset(page, selector) {
  const handle = await page.$(selector);
  if (!handle) return null;
  const pngBuf = Buffer.from(await handle.screenshot({ type: 'png' }));
  await handle.dispose();
  const com = analyzeLogoChipPngBuffer(pngBuf);
  if (com.error || com.mass < 4) return null;
  return {
    dx: com.comX - com.chipCx,
    dy: com.comY - com.chipCy,
    absDx: com.dxPx,
    absDy: com.dyPx,
    width: com.w,
    height: com.h,
    mass: com.mass,
  };
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
