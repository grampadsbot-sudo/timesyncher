import {
  descriptionPassesDetailJudge,
  missingDetailFieldsForCategory,
  resolvedPresentationCategory,
  text,
  thingDetailOverrideFields,
} from './thing-detail-fields.mjs';

export function thingDetailCompletenessForPlace(place = {}, override = {}) {
  const merged = thingDetailOverrideFields({
    ...place,
    title: place.name || place.title,
    category: override.category || place.category?.name || place.category_name,
    metadata: { thingDetail: { ...(place.metadata?.thingDetail || {}), ...override } },
  });
  const category = resolvedPresentationCategory({
    category: override.category || place.category?.name || place.category_name,
    title: place.name,
    description: place.description,
  });
  merged.title = text(place.name || place.title, 240);
  if (!text(merged.address)) merged.address = text(place.address, 240);
  const missing = missingDetailFieldsForCategory(merged, category);
  return {
    category,
    placeName: merged.title,
    missing,
    pass: missing.length === 0,
    descriptionJudgePass: descriptionPassesDetailJudge(merged.longDetails, merged.title),
  };
}

export function gateBThingDetailCompleteness(shared = {}) {
  const rows = [];
  for (const place of shared.places || []) {
    const override = shared.thingOverrides?.[`place:${place.id}`] || {};
    rows.push(thingDetailCompletenessForPlace(place, override));
  }
  const failing = rows.filter((row) => !row.pass);
  return {
    pass: failing.length === 0,
    rows,
    failing,
  };
}
