import { auditScheduledThingLogos, visibleLogoDomCheckSource } from '../../src/vacation/shared-trip-logo-audit.mjs';

async function auditLogoUrlsInPage(page, logoUrls = []) {
  const rows = await page.evaluate(async (urls) => {
    const out = [];
    for (const row of urls) {
      const src = String(row.logoUrl || '').trim();
      if (!src) {
        out.push({ ...row, pass: false, reason: 'missing_logo_url' });
        continue;
      }
      try {
        const img = new Image();
        const loaded = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 12000);
          img.onload = () => {
            clearTimeout(timer);
            resolve({
              ok: img.naturalWidth >= 16 && img.naturalHeight >= 16,
              reason: img.naturalWidth < 16 ? 'natural_width_lt_16' : null,
              nw: img.naturalWidth,
              nh: img.naturalHeight,
            });
          };
          img.onerror = () => {
            clearTimeout(timer);
            resolve({ ok: false, reason: 'error' });
          };
          img.src = src;
        });
        out.push({ ...row, pass: loaded.ok, reason: loaded.reason, nw: loaded.nw, nh: loaded.nh });
      } catch (error) {
        out.push({ ...row, pass: false, reason: String(error?.message || error) });
      }
    }
    return out;
  }, logoUrls);
  const failing = rows.filter((row) => !row.pass);
  return {
    pass: failing.length === 0,
    rows,
    failing,
  };
}

export async function runVisibleSharedLogoCheck(page, { sharedJson, logoUrls } = {}) {
  const fn = visibleLogoDomCheckSource();
  const dom = await page.evaluate(fn);
  let urlAudit = { pass: true, rows: [], failing: [] };
  const rows = logoUrls
    || (sharedJson ? auditScheduledThingLogos(sharedJson).rows.map((row) => ({
      id: row.id,
      name: row.name,
      logoUrl: row.logoUrl,
    })) : []);
  if (rows.length) {
    urlAudit = await auditLogoUrlsInPage(page, rows);
  }
  const pass = Boolean(dom?.pass) && urlAudit.pass;
  const result = {
    pass,
    dom,
    urlAudit,
    failReason: dom?.pass ? (urlAudit.pass ? null : (urlAudit.failing[0]?.reason || 'logo_url_load_fail')) : (dom?.bad?.[0]?.reason || 'visible_logo_dom_fail'),
  };
  return {
    pass: result.pass,
    checkLOGO758: result,
    failReason: result.failReason,
  };
}
