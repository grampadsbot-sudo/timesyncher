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
    'const ov=ha(G)||{},meta=(G&&G.metadata&&typeof G.metadata==="object")?G.metadata:{},sr=(ov.sourceRecord&&typeof ov.sourceRecord==="object")?ov.sourceRecord:(G&&G.sourceRecord&&typeof G.sourceRecord==="object")?G.sourceRecord:(meta.sourceRecord&&typeof meta.sourceRecord==="object")?meta.sourceRecord:{};',
    'return String(ov.description??sr.description??(G&&G.description)??"");},',
  ].join('');
}
