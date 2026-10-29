/** Budget lines are flex divs (`zl`), not `li[data-list-row]`. */

export function isLegacyBudgetLine({ display, justifyContent, hasButton, priceText, insideListRow, marked }) {
  if (insideListRow) return false;
  if (marked) return true;
  return display === 'flex'
    && justifyContent === 'space-between'
    && hasButton
    && /(\$|add price)/i.test(String(priceText || ''));
}

export function collectBudgetEvidence() {
  const visible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
  };
  const box = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  const priceTextOf = (el) => {
    const span = [...el.children].find((k) => k.tagName === 'SPAN' && /(\$|add price)/i.test(k.textContent || ''));
    return span ? span.textContent : '';
  };
  const marked = [...document.querySelectorAll('[data-ts-budget-row]')];
  const legacy = [...document.querySelectorAll('div')].filter((el) => {
    if (el.hasAttribute('data-ts-budget-row') || el.closest('[data-ts-budget-row]') || el.closest('li[data-list-row]')) return false;
    const cs = getComputedStyle(el);
    const btn = [...el.children].find((k) => k.tagName === 'BUTTON');
    const priceText = priceTextOf(el);
    return cs.display === 'flex'
      && cs.justifyContent === 'space-between'
      && Boolean(btn)
      && /(\$|add price)/i.test(String(priceText || ''));
  });
  const rows = [...marked, ...legacy].filter(visible);
  const membership = rows.map((el) => {
    const btn = el.querySelector('button');
    const priceEl = [...el.children].find((k) => k.tagName === 'SPAN' && /(\$|add price)/i.test(k.textContent || ''));
    const name = ((btn && btn.textContent) || '').replace(/\s+/g, ' ').trim();
    return {
      name: name.slice(0, 160),
      place_id: el.getAttribute('data-place-id') || null,
      amount_text: priceEl ? priceEl.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : null,
      box: box(el.getBoundingClientRect()),
    };
  });
  const panel = document.querySelector('[data-ts-budget-panel]')
    || [...document.querySelectorAll('div')].find((el) => /overall trip budget/i.test(el.textContent || '') && el.querySelector('[data-ts-budget-row], button'));
  return {
    budget_row_count: membership.length,
    budget_membership: membership,
    budget_text: panel ? String(panel.innerText || '').slice(0, 20000) : membership.map((row) => `${row.name} ${row.amount_text || ''}`).join('\n'),
  };
}
