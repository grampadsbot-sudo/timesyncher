import { captureScreens } from './live-outputs.mjs';
import { finishArtifactReport, writeFinishArtifacts } from './finish-artifacts.mjs';

export async function recordStoppedPlay({ played, origin, shareToken, sessionToken, outDir, dialogOk = false, adminDialogPdf = false, keepsakeOk = false }) {
  let screens = { ok: false, files: [], error: '' };
  if (outDir && shareToken) {
    try {
      screens = await captureScreens({ origin, shareToken, sessionToken, outDir });
    } catch (error) {
      screens = { ok: false, files: [], error: String(error?.message || error).slice(0, 200) };
    }
  }
  const artifactReport = finishArtifactReport({
    dialogPdf: dialogOk === true,
    adminDialogPdf,
    keepsakePdf: keepsakeOk === true,
    screenshotCount: Array.isArray(screens.files) ? screens.files.length : 0,
    turnCount: Number(played?.customerTurnCount) || 0,
    astraJsonTurns: Number(played?.astraJsonTurns) || 0,
    timingTurns: Array.isArray(played?.timings) ? played.timings.length : 0,
  });
  writeFinishArtifacts(outDir, artifactReport, {
    itineraryOk: Number(played?.itineraryCount) > 0,
    itineraryCount: Number.isInteger(played?.itineraryCount) ? played.itineraryCount : null,
    storagePath: played?.storagePath || '',
    harnessOk: false,
  });
  return { screens, artifactReport };
}
