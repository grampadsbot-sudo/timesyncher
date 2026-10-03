import {
  buildSharedLiveTabLists,
  prepareSharedTripForLiveApp,
  renderSharedLiveTabListHtml,
} from './shared-trip-live-tab-lists.mjs';

/** API + served shared page: one payload shape for the live React shell. */
export function finalizeServedSharedTripPayload(shared = {}) {
  const prepared = prepareSharedTripForLiveApp(shared);
  const liveTabLists = buildSharedLiveTabLists(prepared);
  return { ...prepared, liveTabLists };
}

/** Served /shared/<slug>/ Hotels or Cars tab markup (same HTML the bundle mounts). */
export function renderServedSharedPageLiveTabMarkup(shared = {}, tabKeyword = '') {
  const prepared = prepareSharedTripForLiveApp(shared);
  return renderSharedLiveTabListHtml(prepared, tabKeyword);
}
