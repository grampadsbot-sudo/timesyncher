const OE_ROW_RATING_NEEDLE =
  'tsRowRating=tsPrimaryPlaceStarRating(ha(G)),tsRowStars=tsRenderStarRatingHtml(tsRowRating)';
const OE_ROW_RATING_PATCH =
  'tsRowRating=bn(G)||Mi(G)?null:tsPrimaryPlaceStarRating(ha(G)),tsRowStars=tsRenderStarRatingHtml(tsRowRating)';

const DETAIL_HEAD_STARS_NEEDLE =
  'const tsHeadStars=tsRenderStarRatingHtml(tsPrimaryPlaceStarRating(ha(Dt)));';
const DETAIL_HEAD_STARS_PATCH =
  'const tsHeadStars=bn(Dt)||Mi(Dt)?"":tsRenderStarRatingHtml(tsPrimaryPlaceStarRating(ha(Dt)));';

export function patchVk982TravelNoRating(source = '') {
  let js = String(source || '');
  if (!js.includes(OE_ROW_RATING_PATCH)) {
    if (!js.includes(OE_ROW_RATING_NEEDLE)) throw new Error('vk982 list row rating guard anchor missing');
    js = js.replace(OE_ROW_RATING_NEEDLE, OE_ROW_RATING_PATCH);
  }
  if (!js.includes(DETAIL_HEAD_STARS_PATCH)) {
    if (!js.includes(DETAIL_HEAD_STARS_NEEDLE)) throw new Error('vk982 detail head stars anchor missing');
    js = js.replaceAll(DETAIL_HEAD_STARS_NEEDLE, DETAIL_HEAD_STARS_PATCH);
  }
  return js;
}