import { runDossierFetchTask } from './dossier-fetch-process.mjs';
import { gatherDossierWithEscalation as gather, gatherThingEvidence, topUpDossierFields as topUp } from './thing-evidence-dossier.mjs';

export function gatherDossierWithEscalation(place, gatherImpl, options) {
  return gatherImpl === gatherThingEvidence && (options.fetchIsolation || options.fetchTaskImpl)
    ? (options.fetchTaskImpl || runDossierFetchTask)('gather', place, options)
    : gather(place, gatherImpl, options);
}

export function topUpDossierFields(dossier, place, options) {
  return options.fetchIsolation || options.fetchTaskImpl
    ? (options.fetchTaskImpl || runDossierFetchTask)('topUp', place, { ...options, dossier })
    : topUp(dossier, place, options);
}
