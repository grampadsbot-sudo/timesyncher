import { gatherDossierWithEscalation, gatherThingEvidence, topUpDossierFields } from './thing-evidence-dossier.mjs';
import { pathToFileURL } from 'node:url';

function send(message) {
  return new Promise((resolve, reject) => process.send(message, (error) => error ? reject(error) : resolve()));
}

export function serveDossierFetchWorker({ gatherImpl = gatherThingEvidence, topUpImpl = topUpDossierFields } = {}) {
  process.once('disconnect', () => process.exit(1));
  process.once('message', async ({ operation, place, options }) => {
    process.channel.ref();
    const bravePace = options.bravePace || { nextAt: 0 };
    const onProgress = async (dossier) => {
      const acknowledged = new Promise((resolve) => process.once('message', resolve));
      await send({ type: 'progress', dossier, bravePace });
      await acknowledged;
    };
    try {
      const opts = { ...options, bravePace, onProgress };
      let dossier;
      if (operation === 'gather') dossier = await gatherDossierWithEscalation(place, gatherImpl, opts);
      else if (operation === 'topUp') dossier = await topUpImpl(options.dossier, place, opts);
      else throw new Error('unknown_fetch_operation');
      await send({ type: 'result', dossier, bravePace });
    } catch {
      await send({ type: 'error' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) serveDossierFetchWorker();
