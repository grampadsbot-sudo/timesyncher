/** @param {Element} el */
function textCenterY(el) {
  if (!el) return null;
  const range = document.createRange();
  range.selectNodeContents(el);
  const rect = range.getBoundingClientRect();
  if (!rect.height) return null;
  return rect.top + rect.height / 2;
}

/** @param {import('puppeteer-core').Page} page */
export async function collectCategoryTabIconMetrics(page) {
  return page.evaluate(() => {
    function textCenterY(el) {
      if (!el) return null;
      const range = document.createRange();
      range.selectNodeContents(el);
      const rect = range.getBoundingClientRect();
      if (!rect.height) return null;
      return rect.top + rect.height / 2;
    }

    const tabs = [];
    for (const btn of document.querySelectorAll('button')) {
      const chip = btn.querySelector('[data-ts-logo-chip]');
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
      const tabLabel = labelText || iconText;
      if (!tabLabel) continue;

      const btnBox = btn.getBoundingClientRect();
      const chipBox = chip.getBoundingClientRect();
      const iconInner = chip.querySelector('span') || chip;
      const iconCenterY = textCenterY(iconInner) ?? (chipBox.top + chipBox.height / 2);
      const btnCenterY = btnBox.top + btnBox.height / 2;
      const labelCenterY = labelVisible ? textCenterY(label) : null;

      tabs.push({
        tab: tabLabel,
        chipVsButtonPx: iconCenterY - btnCenterY,
        chipVsLabelPx: labelCenterY == null ? 0 : iconCenterY - labelCenterY,
        buttonHeightPx: btnBox.height,
        chipHeightPx: chipBox.height,
        labelHeightPx: labelVisible ? label.getBoundingClientRect().height : null,
        labelVisible,
      });
    }
    return tabs;
  });
}

export function assertTabIconMetricsWithinTolerance(metrics, maxOffsetPx = 1) {
  const failures = [];
  for (const row of metrics) {
    if (Math.abs(row.chipVsButtonPx) > maxOffsetPx) {
      failures.push(`${row.tab}: icon vs tab box ${row.chipVsButtonPx.toFixed(2)}px`);
    }
    if (row.labelVisible && Math.abs(row.chipVsLabelPx) > maxOffsetPx) {
      failures.push(`${row.tab}: icon vs label ${row.chipVsLabelPx.toFixed(2)}px`);
    }
  }
  if (failures.length) {
    throw new Error(`category tab icon centering out of tolerance (<= ${maxOffsetPx}px): ${failures.join('; ')}`);
  }
}
