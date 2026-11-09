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
  return [
    'tsListRowDescription=function(G){',
    'const ov=ha(G)||{};',
    'return String(ov.summary??"");},',
  ].join('');
}

