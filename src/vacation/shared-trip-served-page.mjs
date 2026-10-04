import {
  SHARED_LIVE_TAB_KEYS,
  buildSharedLiveTabLists,
  prepareSharedTripForLiveApp,
  renderSharedLiveTabListHtml,
} from './shared-trip-live-tab-lists.mjs';

function assertLiveTabListKeys(liveTabLists = {}) {
  if (!liveTabLists || typeof liveTabLists !== 'object') {
    throw new Error('shared_live_tab_lists_missing');
  }
  for (const key of SHARED_LIVE_TAB_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(liveTabLists, key)) {
      throw new Error(`shared_live_tab_lists_${key}_key_missing`);
    }
    if (!Array.isArray(liveTabLists[key])) throw new Error('shared_live_tab_lists_invalid_shape');
  }
}

/** API + served shared page: one payload shape for the live React shell. */
export function finalizeServedSharedTripPayload(shared = {}, options = {}) {
  const prepared = prepareSharedTripForLiveApp(shared);
  const liveTabLists = buildSharedLiveTabLists(prepared, options);
  assertLiveTabListKeys(liveTabLists);
  return { ...prepared, liveTabLists };
}

/** Served /shared/<slug>/ Hotels or Cars tab markup (same HTML the bundle mounts). */
export function renderServedSharedPageLiveTabMarkup(shared = {}, tabKeyword = '', options = {}) {
  const prepared = prepareSharedTripForLiveApp(shared);
  return renderSharedLiveTabListHtml(prepared, tabKeyword, options);
}
