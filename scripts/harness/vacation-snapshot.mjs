import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { redactUrls } from './backends.mjs';
import { assertThrowaway, isHarnessTag } from './protected.mjs';
import { redactText } from './redact.mjs';

function snapshotJson(record, secrets) {
  return JSON.stringify(record, (key, value) => {
    if (/token|secret|password|cookie|authorization|api.?key|slug|session.?id|public.?url|database.?url|email/i.test(key)) {
      return '[redacted]';
    }
    if (key === 'state_json' && typeof value === 'string') return snapshotJson(JSON.parse(value), secrets);
    return typeof value === 'string' ? redactUrls(redactText(value, secrets)).replace(/\bBearer\s+\S+/gi, 'Bearer [redacted]') : value;
  }, 2);
}

export async function snapshotHarnessVacation(db, { tripId, tag, outDir, secrets = [] }) {
  if (!tripId || !isHarnessTag(tag) || !outDir) throw new Error('refused: prior vacation snapshot needs a harness tag and run directory');
  assertThrowaway({ tripId });
  const [snapshot] = await db`
    select to_jsonb(t) as trip, c.email as owner_email, c.display_name as owner_name,
      array(select to_jsonb(thing) from trip_things thing where thing.trip_id = t.id order by thing.created_at, thing.id) as trip_things,
      array(select to_jsonb(rev) from vacation_trip_state_revisions rev where rev.trip_id = t.id order by rev.revision) as trip_state_revisions,
      array(select to_jsonb(receipt) from vacation_trip_state_action_receipts receipt where receipt.trip_id = t.id order by receipt.request_id, receipt.operation_key) as action_receipts,
      array(select to_jsonb(turn) from transcript_turns turn where turn.trip_id = t.id order by turn.created_at, turn.id) as transcript_turns
    from trips t join customers c on c.id = t.customer_id
    where t.id = ${tripId} and t.metadata->>'harnessTag' = ${tag}
  `;
  if (!snapshot?.trip) throw new Error('refused: prior harness vacation missing for snapshot');
  const { owner_email: email, owner_name: displayName, ...rows } = snapshot;
  const metadata = rows.trip.metadata || {};
  const shareTokens = [metadata.publicSlug, metadata.shareToken, metadata.sharedToken, metadata.source_token].filter(Boolean);
  assertThrowaway({ tripId, email, displayName });
  if (!email?.toLowerCase().endsWith('@harness.invalid')) throw new Error('refused: prior vacation snapshot needs a harness owner');
  for (const shareToken of shareTokens) assertThrowaway({ shareToken });
  const body = snapshotJson({ readonly: true, exported_at: new Date().toISOString(), ...rows }, [...secrets, ...shareTokens]);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `prior-vacation-${tripId}-${randomUUID()}.json`);
  fs.writeFileSync(file, `${body}\n`, { flag: 'wx', mode: 0o400, flush: true });
  return file;
}
