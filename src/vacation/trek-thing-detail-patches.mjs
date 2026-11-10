import { patchThingDetailCapture } from './trek-thing-detail-capture-patch.mjs';
import { patchThingDetailFields } from './trek-thing-detail-fields-patch.mjs';
import { patchThingDetailRatings } from './trek-thing-detail-ratings-patch.mjs';
import { patchThingDetail951 } from './trek-thing-detail-951-patch.mjs';

export function patchThingDetailPanel(source = '') {
  return patchThingDetailFields(patchThingDetailRatings(source));
}

export function patchLiveProductDetailBundle(source = '') {
  return patchThingDetailCapture(patchThingDetailPanel(source));
}

export function patchServedThingDetailBundle(source = '') {
  return patchThingDetail951(patchThingDetailCapture(source));
}
