import { patchThingDetailCapture } from './trek-thing-detail-capture-patch.mjs';
import { patchThingDetailFields } from './trek-thing-detail-fields-patch.mjs';
import { patchThingDetailRatings } from './trek-thing-detail-ratings-patch.mjs';
import { patchThingDetailReadonlyBoxes } from './trek-thing-detail-readonly-patch.mjs';
import { patchThingDetailViewonlyStatus } from './trek-thing-detail-viewonly-status-patch.mjs';

export { patchThingDetailCapture };

export function patchThingDetailPanel(source = '') {
  return patchThingDetailViewonlyStatus(
    patchThingDetailReadonlyBoxes(patchThingDetailFields(patchThingDetailRatings(source))),
  );
}

function normalizeBakedV3DetailGateBNeedles(js = '') {
  if (!js.includes('function detailBodyV3(')) return js;
  let next = String(js);
  const swaps = [
    ["'data-ts-detail-info-box': 'address-hours'", '"data-ts-detail-info-box":"address-hours"'],
    ["'data-ts-detail-info-box': 'phone'", '"data-ts-detail-info-box":"phone"'],
    ["'data-ts-detail-info-box': 'website'", '"data-ts-detail-info-box":"website"'],
    ["'data-ts-detail-reviews': '1'", '"data-ts-detail-reviews":"1"'],
  ];
  for (const [from, to] of swaps) {
    if (next.includes(from)) next = next.replaceAll(from, to);
  }
  return next;
}

export function patchLiveProductDetailBundle(source = '') {
  return normalizeBakedV3DetailGateBNeedles(
    patchThingDetailCapture(patchThingDetailPanel(source)),
  );
}
