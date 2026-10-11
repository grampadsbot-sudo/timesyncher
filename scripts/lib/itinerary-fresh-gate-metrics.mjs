/** Puppeteer metrics for itinerary-fresh visual gate (logo + list tabs). */

const LOGO_MAX_ABS_DELTA = 2;
const LOGO_MAX_REF_DRIFT = 1.5;

function rowTitleKey(title) {
  return String(title || '').replace(/\s+/g, ' ').trim().split(/\n/)[0].slice(0, 48);
}

function firstLineMid(el) {
  const rect = el.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(el);
  const firstLine = range.getClientRects()[0];
  range.detach();
  if (firstLine) return firstLine.top + firstLine.height / 2;
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 16;
  return rect.top + Math.min(lineHeight, rect.height) / 2;
}

export function compareLogoMidlineRows(referenceRows, candidateRows, {
  maxAbs = LOGO_MAX_ABS_DELTA,
  maxDrift = LOGO_MAX_REF_DRIFT,
} = {}) {
  const refByTitle = new Map((referenceRows || []).map((row) => [rowTitleKey(row.title), row]));
  const compared = (candidateRows || []).map((cand) => {
    const ref = refByTitle.get(rowTitleKey(cand.title));
    const refDelta = ref?.midDeltaPx ?? null;
    const candDelta = cand.midDeltaPx;
    const absCand = Math.abs(candDelta);
    const absRef = refDelta == null ? null : Math.abs(refDelta);
    const drift = refDelta == null ? null : Math.abs(candDelta - refDelta);
    const improvedVsTrek = absRef != null && absRef > maxAbs && absCand + 1 <= absRef;
    const pass = refDelta == null
      ? absCand <= maxAbs
      : improvedVsTrek
        ? true
        : absRef > maxAbs
          ? drift <= maxDrift
          : absCand <= maxAbs && drift <= maxDrift;
    return {
      title: cand.title,
      candidateMidDeltaPx: candDelta,
      referenceMidDeltaPx: refDelta,
      absCandidatePx: absCand,
      driftFromReferencePx: drift,
      pass,
      improvedVsTrek,
    };
  });
  const pass = compared.length > 0 && compared.every((row) => row.pass);
  return { pass, rows: compared };
}

export async function measureListRowLogoCentering(page, tabLabel = '') {
  return page.evaluate((label) => {
    const norm = (value) => String(value || '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const want = norm(label);
    const rows = [];
    const seen = new Set();
    const nameFrom = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 64);
    const pushRow = (chip, name) => {
      if (!chip || !name || seen.has(name)) return;
      const chipRect = chip.getBoundingClientRect();
      const nameRect = name.getBoundingClientRect();
      if (chipRect.height < 4 || nameRect.height < 8) return;
      const range = document.createRange();
      range.selectNodeContents(name);
      const firstLine = range.getClientRects()[0];
      range.detach();
      const nameMid = firstLine
        ? firstLine.top + firstLine.height / 2
        : nameRect.top + Math.min(parseFloat(getComputedStyle(name).lineHeight) || 16, nameRect.height) / 2;
      const chipMid = chipRect.top + chipRect.height / 2;
      const midDeltaPx = chipMid - nameMid;
      seen.add(name);
      rows.push({
        midDeltaPx,
        deltaPx: Math.abs(midDeltaPx),
        pass: Math.abs(midDeltaPx) <= 2,
        title: nameFrom(name),
      });
    };
    for (const name of document.querySelectorAll('[data-ts-list-row-name="1"]')) {
      const row = name.parentElement;
      const chip = row?.querySelector('[data-ts-logo-chip="1"]') || row?.querySelector('span[aria-hidden="true"]');
      pushRow(chip, name);
    }
    const tabBtn = want
      ? [...document.querySelectorAll('button,[role="tab"]')].find((btn) => norm(btn.textContent).includes(want))
      : [...document.querySelectorAll('button,[role="tab"]')].find((btn) => btn.getAttribute('aria-pressed') === 'true');
    const tabBarBottom = tabBtn?.getBoundingClientRect().bottom ?? 120;
    for (const chip of document.querySelectorAll('[data-ts-logo-chip="1"]')) {
      if (chip.getBoundingClientRect().top < tabBarBottom + 4) continue;
      let row = chip.parentElement;
      for (let depth = 0; depth < 6 && row; depth += 1) {
        const name = row.querySelector('[data-ts-list-row-name="1"], button[style*="textDecoration"], button[style*="textDecorationColor"]');
        if (name && !name.contains(chip) && name.getBoundingClientRect().top >= tabBarBottom) {
          pushRow(chip, name);
          break;
        }
        row = row.parentElement;
      }
    }
    const pass = rows.length > 0 && rows.every((r) => r.pass);
    return { pass, rows, maxDeltaPx: rows.reduce((m, r) => Math.max(m, r.deltaPx), 0) };
  }, tabLabel);
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
