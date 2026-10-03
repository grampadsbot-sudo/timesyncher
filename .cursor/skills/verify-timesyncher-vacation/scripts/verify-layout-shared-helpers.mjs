#!/usr/bin/env node
/** Shared page helpers for verify-layout drives (no Vercel). */

export async function detectApp(page) {
  return page.evaluate(() => {
    const paints = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width >= 0.5 && rect.height >= 0.5;
    };
    const tripOptions = document.querySelectorAll('#vacationDropdown .trip-option, .trip-list .trip-option');
    const header = document.getElementById('appHeader');
    return {
      eula: paints(document.querySelector('#eulaScreen')),
      gate: paints(document.querySelector('#sessionForm')),
      composer: Boolean(document.querySelector('#messageText')) && paints(document.querySelector('#messageText')),
      options: tripOptions.length,
      headerVisible: paints(header),
      hasSite: paints(document.querySelector('.site-pane iframe')),
    };
  });
}

export async function fetchVacationAppSnapshot(session, baseUrl, fetchImpl = fetch) {
  const token = String(session || '').trim();
  if (!token) return { ok: false, vacationCount: 0, hasSite: false };
  const base = String(baseUrl || '').replace(/\/?$/, '');
  const res = await fetchImpl(`${base}/api/vacation-itinerary?app=1&session=${encodeURIComponent(token)}`);
  const data = await res.json().catch(() => ({}));
  const vacations = Array.isArray(data.vacations) ? data.vacations : [];
  const currentId = data.session?.currentTripId || vacations[0]?.id || '';
  const current = vacations.find((row) => row.id === currentId) || vacations[0] || null;
  const hasSite = Boolean(String(current?.publicUrl || '').trim());
  return {
    ok: res.ok && data.ok !== false,
    vacationCount: vacations.length,
    hasSite,
  };
}

export function stateIdFromSnapshot(snapshot, detected) {
  if (!detected?.composer) return '';
  const n = Number(snapshot?.vacationCount) || 0;
  if (n >= 2) return 'app-2-plus';
  if (n === 1 && (snapshot?.hasSite || detected.hasSite)) return 'app-1-with-site';
  if (n === 1) return 'app-1-no-site';
  return 'app-0-vacations';
}

/** @deprecated Use stateIdFromSnapshot; trip dropdown options exist only when 2+ vacations. */
export function stateId(detected) {
  if (!detected.composer) return '';
  if (detected.options >= 2 || detected.headerVisible) return 'app-2-plus';
  if (detected.options === 1 && detected.hasSite) return 'app-1-with-site';
  if (detected.options === 1) return 'app-1-no-site';
  return 'app-0-vacations';
}

export function showMessages(sub, hasSite) {
  return sub === 'app-0-vacations' || sub === 'app-1-no-site' || (sub === 'app-2-plus' && !hasSite);
}

export async function clickControl(page, names, id) {
  return page.evaluate((names, id) => {
    const byId = id ? document.getElementById(id) : null;
    const button = byId || [...document.querySelectorAll('button, [role="button"]')].find((el) => {
      const name = (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || '').replace(/\s+/g, ' ').trim();
      return names.includes(name);
    });
    if (!button) return false;
    button.click();
    return true;
  }, names, id);
}

export async function splitRestored(page) {
  return page.evaluate(() => {
    const paints = (el) => {
      if (!el) return false;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width >= 0.5 && rect.height >= 0.5;
    };
    return paints(document.querySelector('#messageText')) && paints(document.querySelector('#splitter'));
  });
}

export async function clickTab(page, label, sleep) {
  const clicked = await page.evaluate((name) => {
    const norm = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const button = [...document.querySelectorAll('button, [role="tab"]')].find((el) => {
      const aria = norm(el.getAttribute('aria-label'));
      const text = norm(el.innerText);
      return aria === name || text === name || (text.endsWith(name) && text.length <= name.length + 3);
    });
    if (!button) return false;
    button.click();
    return true;
  }, label);
  if (clicked) await sleep(700);
  return clicked;
}
