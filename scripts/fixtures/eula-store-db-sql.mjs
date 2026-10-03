export function handleEulaStoreDbSql(text, values, eulaStore) {
  if (/create table if not exists eula_store_objects/i.test(text)) return [];
  if (/insert into eula_store_objects/i.test(text)) {
    const key = values.find((v) => typeof v === 'string' && v.includes('timesyncher-eula'));
    const doc = values.find((v) => v && typeof v === 'object' && !Array.isArray(v));
    if (key) eulaStore[key] = doc;
    return [];
  }
  if (/select document from eula_store_objects/i.test(text) && /key like/i.test(text)) {
    const like = values.find((v) => typeof v === 'string' && v.includes('timesyncher-eula'));
    const prefix = String(like || '').replace(/%$/, '');
    return Object.entries(eulaStore)
      .filter(([key]) => key.startsWith(prefix) && key.endsWith('.json'))
      .map(([, document]) => ({ document }));
  }
  if (/select document from eula_store_objects/i.test(text)) {
    const key = values[0];
    return eulaStore[key] ? [{ document: eulaStore[key] }] : [];
  }
  return undefined;
}
