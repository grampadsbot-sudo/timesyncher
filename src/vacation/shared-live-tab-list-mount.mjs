/** Served shared Hotels/Cars tab mount (mirrors tsSharedLiveTabListMount in the trek bundle). */
export function sharedLiveTabListMountOutcome(tabKey = '', lists = {}) {
  const key = String(tabKey || '').trim();
  if (!lists || typeof lists !== 'object') {
    throw new Error(`shared_live_tab_lists_missing:${key}`);
  }
  if (!Object.prototype.hasOwnProperty.call(lists, key)) {
    throw new Error(`shared_live_tab_lists_missing:${key}`);
  }
  const rows = lists[key];
  if (!Array.isArray(rows)) {
    throw new Error(`shared_live_tab_lists_invalid:${key}`);
  }
  if (!rows.length) {
    return { kind: 'empty' };
  }
  const html = `<ul data-shared-live-tab="${key}">${rows.join('')}</ul>`;
  return { kind: 'html', html };
}
