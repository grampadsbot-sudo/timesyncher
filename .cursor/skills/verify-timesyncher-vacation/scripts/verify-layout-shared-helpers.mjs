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
    return {
      eula: paints(document.querySelector('#eulaScreen')),
      gate: paints(document.querySelector('#sessionForm')),
      composer: Boolean(document.querySelector('#messageText')) && paints(document.querySelector('#messageText')),
      options: document.querySelectorAll('#tripMenu [role="option"], .trip-option').length,
      hasSite: paints(document.querySelector('.site-pane iframe')),
    };
  });
}

export function stateId(detected) {
  if (!detected.composer) return '';
  if (detected.options >= 2) return 'app-2-plus';
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
