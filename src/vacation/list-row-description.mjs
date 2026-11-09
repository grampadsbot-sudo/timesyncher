function text(value) {
  return String(value ?? '');
}

export function pickStoredThingDescription({
  override = {},
  source = {},
  place = {},
  fields = {},
} = {}) {
  const row = fields.description ?? override.description ?? source.description ?? place.description;
  return text(row);
}

export function composeListRowDescription({ fields = {} } = {}) {
  return pickStoredThingDescription({ fields, override: fields, source: fields });
}

export function listRowDescriptionBundleSnippet() {
  // List rows bind stored Summary only (verbatim). Details/longDetails/description stay on the detail page.
  return [
    'tsListRowDescription=function(G){',
    'const ov=ha(G)||{};',
    'return String(ov.summary??"");},',
  ].join('');
}


export function pickStoredThingSummary({
  override = {},
  source = {},
  place = {},
  fields = {},
} = {}) {
  const row = fields.summary ?? override.summary ?? source.summary ?? place.summary;
  return text(row);
}

export function composeListRowSummary({ fields = {} } = {}) {
  return pickStoredThingSummary({ fields, override: fields, source: fields });
}
