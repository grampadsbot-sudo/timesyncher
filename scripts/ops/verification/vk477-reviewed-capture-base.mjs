import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const REVIEWED_CAPTURE_BASE_SHA256 = '39190e4e7dc1e1eeddfb663d5f40f64703e6737e2321c15a0713e90afd0be28a';

const DEFAULT_REVIEWED_CAPTURE_BASE_PATH = '/home/ubishere9995/tsv-dispatch/capture/capture.mjs.bak-20261018-headergroup';

export function reviewedCaptureBasePath() {
  return process.env.VK_CAPTURE_SOURCE || DEFAULT_REVIEWED_CAPTURE_BASE_PATH;
}

export function assertReviewedCaptureBase(path = reviewedCaptureBasePath()) {
  const body = readFileSync(path);
  const sha256 = createHash('sha256').update(body).digest('hex');
  if (sha256 !== REVIEWED_CAPTURE_BASE_SHA256) {
    throw new Error(
      `DATA-CONTRACT: reviewed capture base sha256 mismatch reviewed=${REVIEWED_CAPTURE_BASE_SHA256.slice(0, 12)} runtime=${sha256.slice(0, 12)}`,
    );
  }
  return path;
}
