#!/usr/bin/env node
import { runThingEvidenceDossierStagingTargets } from '../src/vacation/thing-evidence-dossier-execution.mjs';
import { PR336_GATE_B_XAI_PLACE_TARGETS } from './fixtures/pr336-gate-b-xai-place-targets.mjs';

async function main() {
  const result = await runThingEvidenceDossierStagingTargets(PR336_GATE_B_XAI_PLACE_TARGETS);
  if (!result.ok) {
    console.error(JSON.stringify(result));
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    code: error?.code || 'build_failed',
    message: String(error?.message || error),
  }));
  process.exit(1);
});
