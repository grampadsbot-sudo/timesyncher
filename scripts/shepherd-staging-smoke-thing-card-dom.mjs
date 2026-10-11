/** Serialized for page.evaluate — keep self-contained. */
export const EVALUATE_THING_CARD_TAB_DOM_SOURCE = `(() => {
  function tagFilterChips() {
    for (const btn of document.querySelectorAll('button')) {
      const st = getComputedStyle(btn);
      if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
      const label = String(btn.textContent || '').replace(/\\s+/g, ' ').trim();
      if (label !== 'All tags') continue;
      const row = btn.parentElement;
      if (!row) continue;
      const chips = [];
      for (const chip of row.querySelectorAll('button')) {
        const cst = getComputedStyle(chip);
        if (cst.display === 'none' || cst.visibility === 'hidden') continue;
        const text = String(chip.textContent || '').replace(/\\s+/g, ' ').trim();
        if (text && text !== 'All tags') chips.push(text);
      }
      return chips;
    }
    return [];
  }
  function sortControlLabel(text) {
    const label = String(text || '').replace(/\\s+/g, ' ').trim();
    if (/^(name|price)(\\s*[↑↓])?$/i.test(label)) return label;
    if (/^price\\b/i.test(label) && /[↑↓]/.test(label)) return label;
    return null;
  }
  function sortColumnBase(text) {
    const label = String(text || '').replace(/\\s+/g, ' ').trim().replace(/\\s*[↑↓]\\s*$/, '').trim().toLowerCase();
    return label === 'name' || label === 'price' ? label : null;
  }
  function isVisible(el) {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 1 && r.height >= 1;
  }
  function isPillSortButton(el) {
    const st = getComputedStyle(el);
    const br = parseFloat(st.borderRadius) || 0;
    const h = el.getBoundingClientRect().height || parseFloat(st.height) || 0;
    if (br >= 18 && h > 0 && br >= h * 0.35) return true;
    const row = el.parentElement;
    if (row && getComputedStyle(row).flexWrap === 'wrap' && sortControlLabel(el.textContent)) return true;
    return false;
  }
  function listTabColumnRoot() {
    const mount = document.querySelector('[data-shared-live-tab-mount]');
    if (mount && mount.parentElement) return mount.parentElement;
    const ul = document.querySelector('[data-shared-live-tab]');
    return ul && ul.parentElement ? ul.parentElement : null;
  }
  function isListColumnHeaderRow(rowEl) {
    if (!rowEl) return false;
    if (rowEl.matches('[data-ts-list-sort-header],[data-list-sort-header]')) return true;
    const root = listTabColumnRoot();
    if (!root || !root.contains(rowEl)) return false;
    const children = Array.from(root.children);
    const listIdx = children.findIndex((c) => c.matches('[data-shared-live-tab-mount],[data-shared-live-tab]') || c.querySelector('[data-shared-live-tab],[data-shared-live-tab-mount]'));
    const rowIdx = children.indexOf(rowEl);
    if (listIdx < 0 || rowIdx < 0 || rowIdx >= listIdx) return false;
    const buttons = [...rowEl.querySelectorAll('button,[role="button"]')].filter((b) => sortControlLabel(b.textContent));
    if (!buttons.length) return false;
    if (buttons.every(isPillSortButton)) return false;
    const rowSt = getComputedStyle(rowEl);
    if (rowSt.display === 'grid') return true;
    return buttons.some((b) => !isPillSortButton(b));
  }
  function sortControlMatches() {
    const matches = [];
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (!isVisible(el)) continue;
      const label = sortControlLabel(el.textContent);
      if (!label) continue;
      const row = el.closest('[data-ts-list-sort-header],[data-list-sort-header]') || el.parentElement;
      if (isListColumnHeaderRow(row)) continue;
      if (isPillSortButton(el) || (row && getComputedStyle(row).flexWrap === 'wrap')) {
        matches.push({ label, kind: 'pill', flexWrap: row ? getComputedStyle(row).flexWrap : null });
      }
    }
    return matches;
  }
  function columnSortLabels() {
    const out = { name: null, price: null };
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (!isVisible(el)) continue;
      const base = sortColumnBase(el.textContent);
      if (!base) continue;
      const row = el.closest('[data-ts-list-sort-header],[data-list-sort-header]') || el.parentElement;
      if (!isListColumnHeaderRow(row)) continue;
      const hit = { label: String(el.textContent || '').replace(/\\s+/g, ' ').trim() };
      out[base] = hit;
    }
    return out;
  }
  function rowNodes() {
    const live = document.querySelector('[data-shared-live-tab]');
    const scope = live || document;
    return Array.from(scope.querySelectorAll('li[data-list-row="1"], li[data-has-logo="1"]')).filter((li) => {
      const st = getComputedStyle(li);
      const r = li.getBoundingClientRect();
      return st.display !== 'none' && st.visibility !== 'hidden' && r.height > 4 && r.width > 20;
    });
  }
  function findColumnLabel(which) {
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (!isVisible(el)) continue;
      if (sortColumnBase(el.textContent) !== which) continue;
      const row = el.closest('[data-ts-list-sort-header],[data-list-sort-header]') || el.parentElement;
      if (!isListColumnHeaderRow(row)) continue;
      return el;
    }
    return null;
  }
  function findSortPill(which) {
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (!isVisible(el)) continue;
      if (sortColumnBase(el.textContent) !== which) continue;
      const row = el.closest('[data-ts-list-sort-header],[data-list-sort-header]') || el.parentElement;
      if (isListColumnHeaderRow(row)) continue;
      if (!isPillSortButton(el)) {
        const pr = el.parentElement;
        if (!(pr && getComputedStyle(pr).flexWrap === 'wrap')) continue;
      }
      return el;
    }
    return null;
  }
  function readSortButtonLabels() {
    const out = { name: null, price: null };
    for (const which of ['name', 'price']) {
      const el = findSortPill(which);
      if (el) out[which] = String(el.textContent || '').replace(/\\s+/g, ' ').trim();
    }
    return out;
  }
  return {
    evaluateThingCardTabDom() {
      const matches = sortControlMatches();
      const rows = rowNodes().map((li, index) => {
        const summaryEl = li.querySelector('[data-list-summary], [data-row-summary]');
        const title = li.querySelector('strong')?.textContent?.trim() || '';
        const chip = li.querySelector('[data-ts-logo-chip], img.tiny-logo, .thing-emoji');
        const img = li.querySelector('img.tiny-logo, [data-ts-logo-chip] img');
        const src = img?.getAttribute('src') || li.getAttribute('data-logo-src') || '';
        li.setAttribute('data-ts-thing-card-row-idx', String(index));
        return {
          index,
          title,
          summaryText: summaryEl ? String(summaryEl.textContent || '').trim() : '',
          rowText: String(li.textContent || '').replace(/\\s+/g, ' ').trim(),
          requiresLogo: Boolean(chip),
          logoSrc: String(src || '').trim(),
        };
      });
      return {
        sortControls: matches.map((m) => m.label),
        sortControlMatches: matches,
        columnSortLabels: columnSortLabels(),
        filterTags: tagFilterChips(),
        rows,
      };
    },
    clickThingCardColumnSortLabel(which) {
      const btn = findColumnLabel(which);
      if (!btn) return { clicked: false, which };
      btn.click();
      return { clicked: true, which, label: String(btn.textContent || '').replace(/\\s+/g, ' ').trim() };
    },
    clickThingCardSortButton(which) {
      const btn = findSortPill(which);
      if (!btn) return { clicked: false, which };
      btn.click();
      return { clicked: true, which, label: String(btn.textContent || '').replace(/\\s+/g, ' ').trim() };
    },
    readSortButtonLabels() {
      return readSortButtonLabels();
    },
    readThingCardRowOrder() {
      const rows = rowNodes();
      return {
        titles: rows.map((li) => li.querySelector('strong')?.textContent?.trim() || '').filter(Boolean),
        rowTexts: rows.map((li) => String(li.textContent || '').replace(/\\s+/g, ' ').trim()),
      };
    },
  };
})()`;
