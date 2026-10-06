/** Puppeteer metrics for itinerary-fresh visual gate (logo + list tabs). */

export async function measureListRowLogoCentering(page) {
  return page.evaluate(() => {
    const rows = [];
    for (const name of document.querySelectorAll('[data-ts-list-row-name="1"]')) {
      const row = name.parentElement;
      const chip = row?.querySelector('[data-ts-logo-chip="1"]')
        || row?.querySelector('span[aria-hidden="true"]');
      if (!chip || !name) continue;
      const chipRect = chip.getBoundingClientRect();
      const nameRect = name.getBoundingClientRect();
      if (chipRect.height < 4 || nameRect.height < 8) continue;
      const lineHeight = parseFloat(getComputedStyle(name).lineHeight) || 16;
      const nameMid = nameRect.top + Math.min(lineHeight, nameRect.height) / 2;
      const chipMid = chipRect.top + chipRect.height / 2;
      const deltaPx = Math.abs(chipMid - nameMid);
      rows.push({
        deltaPx,
        pass: deltaPx <= 4.5,
        title: (name.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48),
      });
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
