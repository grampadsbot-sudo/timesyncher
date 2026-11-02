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

export function mergeBudgetEvidence(region, budget, rowSelector) {
  region.budget_row_count = budget.budget_row_count;
  region.budget_membership = budget.budget_membership;
  region.budget_text = budget.budget_text;
  const items = Array.isArray(region.items) ? region.items : [];
  for (const row of budget.budget_membership || []) {
    items.push({
      name: row.name,
      price_text: row.amount_text,
      box: row.box,
      place_id: row.place_id,
      cat: 'budget',
      budget_row: true,
      text: `${row.name} ${row.amount_text || ''}`.trim(),
    });
  }
  region.items = items;
  region.row_count = (region.row_count || 0) + budget.budget_row_count;
  region.row_selector = `${rowSelector}, [data-ts-budget-row], div budget lines`;
  if (region.struct && typeof region.struct === 'object') {
    region.struct.budget_row_count = region.budget_row_count;
    region.struct.budget_membership = region.budget_membership;
    region.struct.budget_text = region.budget_text;
  }
}

export function attachFixtureBudgetCounts(region, shared) {
  const places = Array.isArray(shared && shared.places) ? shared.places.filter((place) => place && place.id != null) : [];
  const ids = [];
  const assignments = shared && shared.assignments && typeof shared.assignments === 'object' ? shared.assignments : {};
  for (const rows of Object.values(assignments)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const place = row && row.place && typeof row.place === 'object' ? row.place : {};
      const id = Number((row && (row.place_id || place.id)) || 0);
      if (id) ids.push(id);
    }
  }
  const timeline = [...new Set(ids)].sort((a, b) => a - b);
  region.budget_catalog_count = places.length;
  region.budget_timeline_place_ids = timeline.map(String);
  if (region.struct && typeof region.struct === 'object') {
    region.struct.budget_catalog_count = region.budget_catalog_count;
    region.struct.budget_timeline_place_ids = region.budget_timeline_place_ids;
    region.struct.budget_row_count = region.budget_row_count;
    region.struct.budget_membership = region.budget_membership;
    region.struct.budget_text = region.budget_text;
  }
}
