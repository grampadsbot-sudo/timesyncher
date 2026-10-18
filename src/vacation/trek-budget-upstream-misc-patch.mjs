import { OTHER_THINGS_BUCKET } from './budget-bucket-keys.mjs';
import { findLegacyMiscBucketLabelInVacationSource } from './budget-legacy-label-source-scan.mjs';

const BUDGET_BUCKET_CLASSIFIER_PATCH =
  'ua=di=>{const Xi=It(di);return Xi==="restaurant"?"Restaurants":Xi==="store"?"Stores":Xi==="flight"?"Flights":Xi==="hotel"?"Hotel":Xi==="car"?"Cars":"' +
  OTHER_THINGS_BUCKET +
  '"}';

const BUDGET_CATEGORIES_PATCH =
  'nr=["Flights","Hotel","Cars","Restaurants","Stores","' +
  OTHER_THINGS_BUCKET +
  '"],Oo=di=>di==="' +
  OTHER_THINGS_BUCKET +
  '"?"The Rest":di';

const BUDGET_BUCKET_CLASSIFIER_RE =
  /ua=di=>\{const Xi=It\(di\);return Xi==="restaurant"\?"Restaurants":Xi==="store"\?"Stores":Xi==="flight"\?"Flights":Xi==="hotel"\?"Hotel":"([^"]+)"\}/;

const BUDGET_CATEGORIES_RE =
  /nr=\["Flights","Hotel","Restaurants","Stores","([^"]+)"\],Oo=di=>di==="\1"\?"The Rest":di/;

export function extractUpstreamMiscBucketLabel(bundleJs = '') {
  const match = String(bundleJs || '').match(BUDGET_CATEGORIES_RE);
  return match ? match[1] : null;
}

export function patchBudgetUpstreamMiscBucket(bundleJs = '', options = {}) {
  const served = options.served === true;
  let js = String(bundleJs || '');
  const legacyLabel = extractUpstreamMiscBucketLabel(js);

  if (legacyLabel === OTHER_THINGS_BUCKET) {
    if (!js.includes('Xi==="car"?"Cars"')) {
      const bucketMatch = js.match(BUDGET_BUCKET_CLASSIFIER_RE);
      if (bucketMatch && bucketMatch[1] === OTHER_THINGS_BUCKET) {
        js = js.replace(bucketMatch[0], BUDGET_BUCKET_CLASSIFIER_PATCH);
      } else if (served && !js.includes(BUDGET_BUCKET_CLASSIFIER_PATCH)) {
        throw new Error('budget bucket classifier patch did not apply');
      }
    }
    return js;
  }

  if (!legacyLabel) {
    if (served && !js.includes(BUDGET_CATEGORIES_PATCH)) {
      throw new Error('budget categories patch did not apply');
    }
    return js;
  }

  const bucketMatch = js.match(BUDGET_BUCKET_CLASSIFIER_RE);
  if (bucketMatch && bucketMatch[1] === legacyLabel) {
    js = js.replace(bucketMatch[0], BUDGET_BUCKET_CLASSIFIER_PATCH);
  } else if (served) {
    throw new Error('budget bucket classifier patch did not apply');
  }

  js = js.replace(BUDGET_CATEGORIES_RE, BUDGET_CATEGORIES_PATCH);

  const miscRowNeedle = `di==="${legacyLabel}"&&!fr.includes("entertainment")`;
  const miscRowPatch = `di==="${OTHER_THINGS_BUCKET}"&&!fr.includes("entertainment")`;
  if (js.includes(miscRowNeedle)) {
    js = js.replaceAll(miscRowNeedle, miscRowPatch);
  } else if (served) {
    throw new Error('budget misc row patch did not apply');
  }

  if (served) {
    const leaks = findLegacyMiscBucketLabelInVacationSource(OTHER_THINGS_BUCKET, { assertScanProbes: false });
    if (leaks.length) {
      throw new Error(`budget legacy misc bucket label present in vacation source: ${leaks.join(',')}`);
    }
  }

  return js;
}
