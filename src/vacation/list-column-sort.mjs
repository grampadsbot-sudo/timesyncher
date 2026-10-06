/** Sort helpers for offline tests (UI uses original TREK Wr pill buttons). */
export const LIST_SORT_PRESENTATION = 'pills';

export function nextColumnSort(current = {}, which = 'name') {
  const key = current.key || 'name';
  const dir = current.dir || 'asc';
  return { key: which, dir: key === which && dir === 'asc' ? 'desc' : 'asc' };
}

export function rowPriceAmount(text = '') {
  const match = String(text).match(/\$\s*([\d,]+(?:\.\d+)?)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

export function compareColumnRows(a, b, which, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  const nameA = String(a.name || '');
  const nameB = String(b.name || '');
  if (which === 'price') {
    const priceA = a.price == null ? null : Number(a.price);
    const priceB = b.price == null ? null : Number(b.price);
    if (priceA == null && priceB == null) return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    if (priceA == null) return -sign;
    if (priceB == null) return sign;
    if (priceA !== priceB) return sign * (priceA - priceB);
  }
  return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' }) * sign;
}
