import { PNG } from 'pngjs';

function inkCenterYFromPngBuffer(buf, bgOverride = null) {
  const png = PNG.sync.read(buf);
  const { width: w, height: h, data } = png;
  if (!w || !h) return null;
  let bg = bgOverride;
  if (!bg) {
    const corners = [
      [0, 0],
      [w - 1, 0],
      [0, h - 1],
      [w - 1, h - 1],
    ].map(([x, y]) => {
      const i = (y * w + x) * 4;
      return [data[i], data[i + 1], data[i + 2], data[i + 3]];
    });
    bg = corners.reduce(
      (acc, [r, g, b]) => [acc[0] + r, acc[1] + g, acc[2] + b],
      [0, 0, 0],
    ).map((v) => v / corners.length);
  }
  const threshold = 18;
  let sumY = 0;
  let mass = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a < 16) continue;
      const dr = Math.abs(data[i] - bg[0]);
      const dg = Math.abs(data[i + 1] - bg[1]);
      const db = Math.abs(data[i + 2] - bg[2]);
      if (dr + dg + db < threshold) continue;
      const weight = (dr + dg + db) * (a / 255);
      sumY += y * weight;
      mass += weight;
    }
  }
  if (mass <= 0) return null;
  return { inkCenterY: sumY / mass, height: h, mass };
}

/** @param {import('puppeteer-core').Page} page @param {string} selector */
async function measureElementInkCenterY(page, selector) {
  const handle = await page.$(selector);
  if (!handle) return null;
  const box = await handle.boundingBox();
  if (!box || box.height < 1) {
    await handle.dispose();
    return null;
  }
  const bgRgb = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const pick = (node) => {
      const raw = getComputedStyle(node).backgroundColor;
      const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!m) return null;
      const aMatch = raw.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([0-9.]+)\)/);
      const alpha = aMatch ? Number(aMatch[1]) : 1;
      if (alpha >= 0.05) return [Number(m[1]), Number(m[2]), Number(m[3])];
      return null;
    };
    return pick(el) || pick(el.parentElement) || pick(el.closest('button')) || [255, 255, 255];
  }, selector);
  const buf = await handle.screenshot({ type: 'png' });
  await handle.dispose();
  const ink = inkCenterYFromPngBuffer(Buffer.from(buf), bgRgb);
  if (!ink) return null;
  return {
    pageInkCenterY: box.y + ink.inkCenterY,
    boxTop: box.y,
    boxHeight: box.height,
    boxCenterY: box.y + box.height / 2,
    localInkCenterY: ink.inkCenterY,
    mass: ink.mass,
  };
}

/** @param {import('puppeteer-core').Page} page */
export async function collectCategoryTabInkMetrics(page) {
  const tabs = await page.evaluate(() => {
    const categoryLabels = new Set([
      'Day-by-Day',
      'Flights',
      'Hotels',
      'Cars',
      'Restaurants',
      'Stores',
      'The Rest',
      'Budget',
    ]);
    const rows = [];
    for (const btn of document.querySelectorAll('button')) {
      const aria = String(btn.getAttribute('aria-label') || '').trim();
      const chip = btn.querySelector('[data-ts-logo-chip][data-tab-category]')
        || (categoryLabels.has(aria) ? btn.querySelector('[data-ts-logo-chip]') : null);
      if (!chip) continue;
      const label = [...btn.querySelectorAll('span')].find(
        (node) => !node.hasAttribute('data-ts-logo-chip') && !node.hasAttribute('aria-hidden'),
      );
      const labelVisible = Boolean(
        label
        && getComputedStyle(label).display !== 'none'
        && label.getBoundingClientRect().height > 0,
      );
      const labelText = labelVisible ? String(label.textContent || '').replace(/\s+/g, ' ').trim() : '';
      const iconText = String(chip.textContent || '').replace(/\s+/g, ' ').trim();
      const tabLabel = aria || labelText || iconText;
      if (!tabLabel) continue;
      const id = `tab-ink-${rows.length}`;
      chip.setAttribute('data-ts-tab-ink-chip', id);
      if (labelVisible) label.setAttribute('data-ts-tab-ink-label', id);
      btn.setAttribute('data-ts-tab-ink-btn', id);
      rows.push({ id, tab: tabLabel, labelVisible });
    }
    return rows;
  });

  const metrics = [];
  for (const row of tabs) {
    const chipInk = await measureElementInkCenterY(page, `[data-ts-tab-ink-chip="${row.id}"]`);
    const labelInk = row.labelVisible
      ? await measureElementInkCenterY(page, `[data-ts-tab-ink-label="${row.id}"]`)
      : null;
    const btnBox = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { centerY: r.top + r.height / 2 };
    }, `[data-ts-tab-ink-btn="${row.id}"]`);
    if (!btnBox || !chipInk) continue;
    metrics.push({
      tab: row.tab,
      labelVisible: row.labelVisible,
      iconVsTabPx: chipInk.pageInkCenterY - btnBox.centerY,
      iconVsLabelPx: labelInk ? chipInk.pageInkCenterY - labelInk.pageInkCenterY : null,
      chipMass: chipInk.mass,
      labelMass: labelInk?.mass ?? null,
    });
  }
  return metrics;
}

export function summarizeInkMetrics(metrics) {
  let maxIconVsTab = 0;
  let maxIconVsLabel = 0;
  for (const row of metrics) {
    maxIconVsTab = Math.max(maxIconVsTab, Math.abs(row.iconVsTabPx));
    if (row.labelVisible && row.iconVsLabelPx != null) {
      maxIconVsLabel = Math.max(maxIconVsLabel, Math.abs(row.iconVsLabelPx));
    }
  }
  return { maxIconVsTab, maxIconVsLabel };
}

export function inkMetricsFailures(metrics, maxOffsetPx = 1) {
  const failures = [];
  for (const row of metrics) {
    if (Math.abs(row.iconVsTabPx) > maxOffsetPx) {
      failures.push(`${row.tab}: icon ink vs tab box ${row.iconVsTabPx.toFixed(2)}px`);
    }
    if (row.labelVisible && row.iconVsLabelPx != null && Math.abs(row.iconVsLabelPx) > maxOffsetPx) {
      failures.push(`${row.tab}: icon ink vs label ink ${row.iconVsLabelPx.toFixed(2)}px`);
    }
  }
  return failures;
}

export function assertTabInkWithinTolerance(metrics, maxOffsetPx = 1) {
  const failures = inkMetricsFailures(metrics, maxOffsetPx);
  if (failures.length) {
    throw new Error(`category tab icon ink centering out of tolerance (<= ${maxOffsetPx}px): ${failures.join('; ')}`);
  }
}
