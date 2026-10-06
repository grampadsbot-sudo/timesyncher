/**
 * React mount injected into the served trek bundle via trek-live-product-patches.mjs.
 * Must stay in sync with sharedLiveTabListMountOutcome below.
 */
export function sharedLiveTabListMountBundleExpr() {
  return 'tsSharedLiveTabListMount=G=>{const lists=window.__TS_SHARED_LIVE_TAB_LISTS__;if(!lists||!Object.prototype.hasOwnProperty.call(lists,G))throw new Error("shared_live_tab_lists_missing:"+G);const h=lists[G];if(!Array.isArray(h))throw new Error("shared_live_tab_lists_invalid:"+G);if(!h.length)return null;const ids=h.map(row=>{const m=String(row).match(/data-place-id="([^"]+)"/);return m?m[1]:""}).filter(Boolean);const source=G==="cars"?bc:Po;const rows=ids.map(id=>source.find(item=>String(item.id||item.place_id)===id)).filter(Boolean);if(rows.length===ids.length){const kind=G==="hotels"?"hotel":"";return n.jsx("div",{"data-shared-live-tab-mount":G,"data-trek-list":"1",style:{display:"contents"},children:vi(rows,G).map((item,i)=>Oe(item,kind,kind==="hotel"&&i===0))})}return n.jsx("div",{"data-shared-live-tab-mount":G,dangerouslySetInnerHTML:{__html:`<ul data-shared-live-tab="${G}">${h.join("")}</ul>`},style:{display:"contents"}})}';
}

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
