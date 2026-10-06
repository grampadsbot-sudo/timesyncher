/** Puppeteer metrics for itinerary-fresh visual gate (logo + list tabs). */

export async function measureListRowLogoCentering(page) {
  return page.evaluate(() => {
    const rows = [];
    for (const chip of document.querySelectorAll('[data-ts-logo-chip="1"]')) {
      const host = chip.parentElement;
      const row = chip.closest('button,[role="button"]') || chip.closest('div');
      const name = host?.querySelector('[data-ts-list-row-name="1"]')
        || row?.querySelector('[data-ts-list-row-name="1"]')
        || row?.querySelector('strong')
        || row?.querySelector('[data-ts-timeline-title="1"]');
      if (!chip || !name) continue;
      const chipRect = chip.getBoundingClientRect();
      const nameRect = name.getBoundingClientRect();
      if (chipRect.width < 8 || nameRect.height < 8) continue;
      const chipMid = chipRect.top + chipRect.height / 2;
      const nameMid = nameRect.top + nameRect.height / 2;
      const delta = Math.abs(chipMid - nameMid);
      rows.push({ deltaPx: delta, pass: delta <= 2.5 });
    }
    const pass = rows.length > 0 && rows.every((r) => r.pass);
    return { pass, rows, maxDeltaPx: rows.reduce((m, r) => Math.max(m, r.deltaPx), 0) };
  });
}

export async function clickSharedTab(page, label) {
  return page.evaluate((want) => {
    const norm = (value) => String(value || '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const target = norm(want);
    for (const btn of document.querySelectorAll('button,[role="tab"]')) {
      const aria = norm(btn.getAttribute('aria-label'));
      const text = norm(btn.textContent);
      if (aria === target || text === target || text.endsWith(target) || text.includes(target)) {
        btn.click();
        return true;
      }
    }
    return false;
  }, label);
}

export async function captureTabClip(page) {
  const clip = await page.evaluate(() => {
    const tab = [...document.querySelectorAll('button,[role="tab"]')].find((btn) => btn.getAttribute('aria-pressed') === 'true')
      || document.querySelector('button[aria-selected="true"]');
    const top = tab ? tab.getBoundingClientRect().bottom + 8 : 120;
    return { x: 0, y: Math.max(0, top), width: window.innerWidth, height: Math.min(560, window.innerHeight - top) };
  });
  return clip;
}
