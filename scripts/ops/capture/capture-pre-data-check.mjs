import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function captureModuleRoot() {
  const fromEnv = String(process.env.TSV_CAPTURE_REPO_ROOT || '').trim();
  if (fromEnv && existsSync(join(fromEnv, 'src/vacation/thing-detail-fields.mjs'))) return fromEnv;
  const fromRepo = join(here, '../../..');
  if (existsSync(join(fromRepo, 'src/vacation/thing-detail-fields.mjs'))) return fromRepo;
  throw new Error('capture pre-data check: cannot resolve vacation src root (set TSV_CAPTURE_REPO_ROOT)');
}

async function loadVacationDeps() {
  const root = captureModuleRoot();
  const vacDir = pathToFileURL(join(root, 'src/vacation/'));
  const [{ descriptionPassesDetailJudge }, { productThingCategory }] = await Promise.all([
    import(new URL('thing-detail-fields.mjs', vacDir).href),
    import(new URL('keepsake-product-overrides.mjs', vacDir).href),
  ]);
  return { descriptionPassesDetailJudge, productThingCategory };
}

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function renderedPrice(shared = {}, place = {}) {
  const override = shared.thingOverrides?.[`place:${place.id}`] || shared.thingOverrides?.[String(place.id)] || {};
  const row = { ...place, ...override };
  const raw = row.price ?? place.price;
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const nums = [...String(raw).matchAll(/\$?([0-9][0-9,]*(?:\.\d+)?)/g)]
    .map((match) => Number(String(match[1]).replace(/,/g, '')))
    .filter((n) => Number.isFinite(n));
  if (!nums.length) return null;
  if (nums.length >= 2) return Math.round((nums[0] + nums[1]) / 2);
  return nums[0];
}

function hotelLongDetails(place = {}, override = {}) {
  const merged = { ...place, ...override };
  return text(
    merged.longDetails
      || override.longDetails
      || override.description
      || place.description
      || merged.description,
  );
}

export async function gateBCapturePreDataCheck(shared = {}) {
  const { descriptionPassesDetailJudge, productThingCategory } = await loadVacationDeps();
  const failures = [];
  for (const place of shared.places || []) {
    if (!place || place.id == null) continue;
    const override = shared.thingOverrides?.[`place:${place.id}`] || shared.thingOverrides?.[String(place.id)] || {};
    const category = productThingCategory(place, override);
    if (!['hotel', 'flight', 'car'].includes(category)) continue;
    if (category === 'hotel') {
      const longDetails = hotelLongDetails(place, override);
      if (!descriptionPassesDetailJudge(longDetails, place.name || place.title)) {
        failures.push({
          id: place.id,
          name: place.name || place.title,
          category,
          reason: 'hotel_description_judge',
          detail: longDetails ? longDetails.slice(0, 120) : '(empty)',
        });
      }
    }
    if (renderedPrice(shared, place) === null) {
      failures.push({
        id: place.id,
        name: place.name || place.title,
        category,
        reason: 'blank_price',
      });
    }
  }
  return { pass: failures.length === 0, failures };
}

async function assertGateBCapturePreDataCheck(shared = {}) {
  const result = await gateBCapturePreDataCheck(shared);
  if (result.pass) return result;
  const lines = result.failures.map(
    (row) => `${row.id}:${row.name} (${row.category}) ${row.reason}${row.detail ? ` — ${row.detail}` : ''}`,
  );
  const err = new Error(`capture pre-data check failed (${result.failures.length}):\n${lines.join('\n')}`);
  err.failures = result.failures;
  throw err;
}

export async function assertGateBCapturePreDataCheckPayload(payloadBuffer) {
  const shared = JSON.parse(Buffer.from(payloadBuffer).toString('utf8'));
  return assertGateBCapturePreDataCheck(shared);
}
