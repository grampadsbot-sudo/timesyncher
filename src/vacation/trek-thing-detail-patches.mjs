import { patchThingDetailCapture } from './trek-thing-detail-capture-patch.mjs';
import { patchThingDetailFields } from './trek-thing-detail-fields-patch.mjs';
import { patchThingDetailRatings } from './trek-thing-detail-ratings-patch.mjs';
import { patchThingDetailReadonlyBoxes } from './trek-thing-detail-readonly-patch.mjs';

export { patchThingDetailCapture };

export function patchThingDetailPanel(source = '') {
  return patchThingDetailReadonlyBoxes(patchThingDetailFields(patchThingDetailRatings(source)));
}

export function patchLiveProductDetailBundle(source = '') {
  return patchThingDetailCapture(patchThingDetailPanel(source));
}
