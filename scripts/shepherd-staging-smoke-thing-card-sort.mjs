/** SORT-BY-LABEL tab + harness grading (Shepherd thing-card). */

function rowTitlesFromScanRows(rows = []) {
  return (rows || []).map((r) => String(r?.title || '').trim()).filter(Boolean);
}

function parseThingCardRowPrice(rowText = '') {
  const m = String(rowText || '').match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return m ? Number(m[1].replace(/,/g, '')) : null;
}

function rowPriceTextsFromScanRows(rows = []) {
  return (rows || []).map((r) => `${r?.title || ''} ${r?.summaryText || ''}`);
}

export function isAscendingNameOrder(titles = []) {
  const list = titles.map((t) => String(t || '').trim()).filter(Boolean);
  if (list.length < 2) return false;
  for (let i = 1; i < list.length; i += 1) {
    if (list[i - 1].localeCompare(list[i], undefined, { sensitivity: 'base' }) > 0) return false;
  }
  return true;
}

export function isDescendingNameOrder(titles = []) {
  const list = titles.map((t) => String(t || '').trim()).filter(Boolean);
  if (list.length < 2) return false;
  for (let i = 1; i < list.length; i += 1) {
    if (list[i - 1].localeCompare(list[i], undefined, { sensitivity: 'base' }) < 0) return false;
  }
  return true;
}

export function priceOrderOk(prices = [], direction = 'asc') {
  const vals = prices.map((p) => (p == null ? null : Number(p)));
  const pricedIdx = vals.map((p, i) => (p != null && !Number.isNaN(p) ? i : -1)).filter((i) => i >= 0);
  const unpricedIdx = vals.map((p, i) => (p == null || Number.isNaN(p) ? i : -1)).filter((i) => i >= 0);
  if (pricedIdx.length >= 2) {
    for (let k = 1; k < pricedIdx.length; k += 1) {
      const a = vals[pricedIdx[k - 1]];
      const b = vals[pricedIdx[k]];
      if (direction === 'asc' && a > b) return false;
      if (direction === 'desc' && a < b) return false;
    }
  }
  if (unpricedIdx.length && pricedIdx.length) {
    const atStart = unpricedIdx.every((i) => i < pricedIdx[0]);
    const atEnd = unpricedIdx.every((i) => i > pricedIdx[pricedIdx.length - 1]);
    if (!atStart && !atEnd) return false;
  }
  return pricedIdx.length >= 1 || unpricedIdx.length >= 2;
}

export function gradeThingCardSortByLabel({
  tab = 'unknown',
  viewport = null,
  columnSortLabels = {},
  rows = [],
  orders = {},
} = {}) {
  const failures = [];
  const rowCount = (rows || []).length;
  const titles = rowTitlesFromScanRows(rows);
  const rowTexts = rowPriceTextsFromScanRows(rows);
  const gate = {
    rule: 'SORT-BY-LABEL',
    tab,
    viewport,
    rowCount,
    columnSortLabels,
    orders,
    sortControlMatches: orders.sortControlMatches,
  };

  if (rowCount < 2) {
    return {
      pass: true,
      status: 'not_enough_rows',
      rowSortExercised: false,
      priceSortExercised: false,
      priceStatus: null,
      failures: [],
      gate: { ...gate, status: 'not_enough_rows' },
    };
  }

  if (!columnSortLabels?.name) {
    failures.push({
      rule: 'SORT-BY-LABEL',
      tab,
      viewport,
      detail: 'missing Name column label',
    });
  }
  if (!columnSortLabels?.price) {
    failures.push({
      rule: 'SORT-BY-LABEL',
      tab,
      viewport,
      detail: 'missing Price column label',
    });
  }

  const nameAfterFirst = orders.nameAfterFirst || [];
  const nameAfterSecond = orders.nameAfterSecond || [];
  const priceAfter = orders.priceAfter || [];
  let priceSortExercised = false;
  let priceStatus = null;

  if (columnSortLabels?.name) {
    if (!isAscendingNameOrder(nameAfterFirst)) {
      failures.push({
        rule: 'SORT-BY-LABEL',
        tab,
        viewport,
        detail: `Name click did not sort ascending: [${nameAfterFirst.join(', ')}]`,
        observed: nameAfterFirst,
      });
    }
    if (nameAfterSecond.length >= 2
      && nameAfterFirst.join('\0') === nameAfterSecond.join('\0')) {
      failures.push({
        rule: 'SORT-BY-LABEL',
        tab,
        viewport,
        detail: 'second Name click did not reverse or change order',
        observed: nameAfterSecond,
      });
    }
    if (nameAfterSecond.length >= 2 && isAscendingNameOrder(nameAfterSecond)) {
      failures.push({
        rule: 'SORT-BY-LABEL',
        tab,
        viewport,
        detail: `second Name click still ascending: [${nameAfterSecond.join(', ')}]`,
        observed: nameAfterSecond,
      });
    }
  }

  if (columnSortLabels?.price) {
    if (priceAfter.length >= 2) {
      const prices = priceAfter.map((text) => parseThingCardRowPrice(text));
      const pricedCount = prices.filter((p) => p != null && !Number.isNaN(p)).length;
      if (pricedCount < 2) {
        priceStatus = 'price_not_exercised';
      } else {
        const dir = orders.priceDirection || 'asc';
        if (!priceOrderOk(prices, dir)) {
          priceStatus = 'failed';
          failures.push({
            rule: 'SORT-BY-LABEL',
            tab,
            viewport,
            detail: `Price click order invalid (${dir}): prices=${JSON.stringify(prices)}`,
            observed: priceAfter,
          });
        } else {
          priceStatus = 'ok';
          priceSortExercised = true;
        }
      }
    } else if (orders.priceClicked) {
      priceStatus = 'price_not_exercised';
    }
  }

  return {
    pass: failures.length === 0,
    status: failures.length ? 'failed' : 'ok',
    rowSortExercised: true,
    priceSortExercised,
    priceStatus,
    failures,
    gate: {
      ...gate,
      status: failures.length ? 'failed' : 'ok',
      titlesBefore: titles,
      rowTextsBefore: rowTexts,
      priceStatus,
      priceSortExercised,
      rowSortExercised: true,
    },
  };
}

function probeSortByLabelMeta(probe = {}) {
  const gate = probe.sortByLabelGate || {};
  const sort = probe.sortByLabel || {};
  return {
    rowCount: probe.rowCount ?? gate.rowCount ?? 0,
    status: gate.status ?? sort.status,
    rowSortExercised: gate.rowSortExercised ?? sort.rowSortExercised,
    priceSortExercised: gate.priceSortExercised ?? sort.priceSortExercised,
    priceStatus: gate.priceStatus ?? sort.priceStatus,
  };
}

export function gradeThingCardSortByLabelHarness(probes = []) {
  const failures = [];
  const viewports = [...new Set((probes || []).map((p) => p.viewport).filter(Boolean))];
  for (const viewport of viewports) {
    const vpProbes = (probes || []).filter((p) => p.viewport === viewport && !p.skipped);
    const rowExercised = vpProbes.some((p) => {
      const meta = probeSortByLabelMeta(p);
      return meta.rowCount >= 2 && meta.status !== 'not_enough_rows';
    });
    if (!rowExercised) {
      failures.push({
        rule: 'SORT-BY-LABEL',
        viewport,
        detail: `no tab exercised with >=2 rows at viewport ${viewport}`,
      });
    }
    const priceExercised = vpProbes.some((p) => probeSortByLabelMeta(p).priceSortExercised === true);
    if (!priceExercised) {
      failures.push({
        rule: 'SORT-BY-LABEL',
        viewport,
        detail: `no tab with >=2 priced rows sorted correctly at viewport ${viewport}`,
      });
    }
  }
  return failures;
}
