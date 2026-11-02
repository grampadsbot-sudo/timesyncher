#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { buildNycThingEvidenceDossierTargets } from '../src/vacation/nyc-passb-dossier-inventory.mjs';
import { missingSearchKeys, xaiPlaceSearchModelId } from '../src/vacation/provider-env.mjs';

export { buildNycThingEvidenceDossierTargets } from '../src/vacation/nyc-passb-dossier-inventory.mjs';

async function main() {
  if (!process.env.XAI_API_KEY) throw Object.assign(new Error('XAI_API_KEY is not set.'), { code: 'missing_xai_api_key' });
  xaiPlaceSearchModelId();
  const missingKeys = missingSearchKeys();
  if (missingKeys.length) throw Object.assign(new Error(`Missing search configuration: ${missingKeys.join(', ')}`), { code: 'missing_search_keys' });
  const result = await runThingEvidenceDossierStagingTargets(buildNycThingEvidenceDossierTargets());
  if (!result.ok) {
    console.error(JSON.stringify(result));
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    code: error?.code || 'build_failed',
    message: String(error?.message || error),
  }));
  process.exit(1);
});
