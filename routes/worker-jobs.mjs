import { requireWorkerAuth } from '../src/vacation/auth.mjs';
import { sql } from '../src/vacation/db.mjs';
import { cleanText, readJson, sendJson } from '../src/vacation/http.mjs';
import { classifyTurn } from '../src/vacation/turn-tags.mjs';

async function claimJobs(db, { workerId, limit }) {
  const rows = await db`
    with claimable as (
      select id
      from worker_jobs
      where status in ('pending', 'retry')
        and run_after <= now()
        and attempts < max_attempts
      order by priority asc, created_at asc
      limit ${limit}
      for update skip locked
    ),
    claimed as (
      update worker_jobs job
      set status = 'running',
        locked_by = ${workerId},
        locked_at = now(),
        attempts = attempts + 1,
        updated_at = now()
      from claimable
      where job.id = claimable.id
      returning job.*
    )
    select
      claimed.*,
      vacation_requests.customer_id,
      vacation_requests.request_type,
      vacation_requests.request_text,
      vacation_requests.source,
      (
        select onboarding_sessions.token
        from onboarding_sessions
        where onboarding_sessions.trip_id = claimed.trip_id
        order by onboarding_sessions.created_at desc
        limit 1
      ) as onboarding_token,
      (
        select coalesce(jsonb_agg(row_to_json(turns) order by turns.created_at), '[]'::jsonb)
        from (
          select id, speaker, channel, direction, body, payload, turn_category, turn_tags, created_at
          from transcript_turns
          where trip_id = claimed.trip_id
          order by created_at desc
          limit 20
        ) turns
      ) as trip_transcript
    from claimed
    join vacation_requests on vacation_requests.id = claimed.request_id
  `;

  for (const job of rows) {
    await db`
      update vacation_requests
      set status = 'running',
        worker_started_at = coalesce(worker_started_at, now()),
        agent_runtime = ${workerId},
        updated_at = now()
      where id = ${job.request_id}
    `;
    await db`
      insert into vacation_request_events (request_id, event_type, actor, details)
      values (${job.request_id}, 'worker_claimed', ${workerId}, ${{ jobId: job.id, attempts: job.attempts }})
    `;
  }

  return rows;
}

async function completeJob(db, body) {
  const jobId = cleanText(body.jobId || body.job_id, 80);
  const workerId = cleanText(body.workerId || body.worker_id || 'TimeStopper', 120);
  const status = cleanText(body.status || 'completed', 40);
  if (!jobId) throw Object.assign(new Error('jobId is required.'), { statusCode: 400 });
  if (!['completed', 'failed', 'retry'].includes(status)) {
    throw Object.assign(new Error('status must be completed, failed, or retry.'), { statusCode: 400 });
  }

  const rows = await db`
    update worker_jobs
    set status = ${status === 'completed' ? 'completed' : status},
      result = ${JSON.stringify(body.result || {})}::jsonb,
      error_summary = ${cleanText(body.errorSummary || body.error_summary, 1000) || null},
      run_after = case when ${status} = 'retry' then now() + interval '5 minutes' else run_after end,
      updated_at = now()
    where id = ${jobId}
    returning request_id, trip_id
  `;
  if (!rows[0]) throw Object.assign(new Error('job not found.'), { statusCode: 404 });

  const requestStatus = status === 'completed' ? 'completed' : status;
  await db`
    update vacation_requests
    set status = ${requestStatus},
      first_response_at = coalesce(first_response_at, case when ${body.customerResponse || ''} <> '' then now() else first_response_at end),
      completed_at = case when ${status} = 'completed' then now() else completed_at end,
      error_summary = ${cleanText(body.errorSummary || body.error_summary, 1000) || null},
      tooling_used = ${JSON.stringify(body.toolingUsed || body.tooling_used || [])}::jsonb,
      updated_at = now()
    where id = ${rows[0].request_id}
  `;

  if (body.customerResponse) {
    const turnTag = classifyTurn({
      text: body.customerResponse,
      speaker: 'assistant',
      direction: 'outbound',
      channel: 'worker',
      payload: body.result || {},
    });
    await db`
      insert into transcript_turns (
        trip_id, request_id, speaker, channel, body, payload, direction,
        turn_category, turn_tags, turn_tag_source, turn_tag_confidence, turn_tagged_at
      )
      values (
        ${rows[0].trip_id}, ${rows[0].request_id}, 'assistant', 'worker', ${cleanText(body.customerResponse, 12000)}, ${JSON.stringify(body.result || {})}::jsonb, 'outbound',
        ${turnTag.category}, ${turnTag.tags}, ${turnTag.source}, ${turnTag.confidence}, now()
      )
    `;
  }
  await persistArtifacts(db, rows[0], body.result || {});
  await db`
    insert into vacation_request_events (request_id, event_type, actor, details)
    values (${rows[0].request_id}, ${status === 'completed' ? 'worker_completed' : 'worker_' || status}, ${workerId}, ${JSON.stringify(body.result || {})}::jsonb)
  `;

  return { requestId: rows[0].request_id, tripId: rows[0].trip_id };
}

function artifactList(result, key) {
  const artifacts = result?.artifacts && typeof result.artifacts === 'object' ? result.artifacts : {};
  return Array.isArray(artifacts[key]) ? artifacts[key].slice(0, 25) : [];
}

async function persistArtifacts(db, row, result) {
  const tripThings = artifactList(result, 'tripThings');
  const budgetItems = artifactList(result, 'budgetItems');
  const supportNotes = artifactList(result, 'supportNotes');

  for (const thing of tripThings) {
    const category = cleanText(thing.category || 'note', 80) || 'note';
    const title = cleanText(thing.title, 240);
    if (!title) continue;
    await db`
      insert into trip_things (
        trip_id, source_request_id, category, subtype, title, description, starts_at, ends_at,
        cost_estimate_cents, currency, location, links, ratings, metadata
      )
      values (
        ${row.trip_id}, ${row.request_id}, ${category}, ${cleanText(thing.subtype, 120) || null},
        ${title}, ${cleanText(thing.description, 4000) || null},
        ${thing.startsAt || thing.starts_at || null}, ${thing.endsAt || thing.ends_at || null},
        ${Number.isInteger(thing.costEstimateCents) ? thing.costEstimateCents : thing.cost_estimate_cents || null},
        ${cleanText(thing.currency || 'usd', 12) || 'usd'},
        ${JSON.stringify(thing.location || {})}::jsonb,
        ${JSON.stringify(thing.links || [])}::jsonb,
        ${JSON.stringify(thing.ratings || {})}::jsonb,
        ${JSON.stringify(thing.metadata || {})}::jsonb
      )
    `;
  }

  for (const item of budgetItems) {
    const label = cleanText(item.label, 240);
    if (!label) continue;
    await db`
      insert into budget_items (trip_id, category, label, amount_cents, currency, metadata)
      values (
        ${row.trip_id}, ${cleanText(item.category || 'general', 80) || 'general'}, ${label},
        ${Number.isInteger(item.amountCents) ? item.amountCents : item.amount_cents || 0},
        ${cleanText(item.currency || 'usd', 12) || 'usd'},
        ${JSON.stringify(item.metadata || {})}::jsonb
      )
    `;
  }

  for (const note of supportNotes) {
    const noteText = cleanText(note.note, 4000);
    if (!noteText) continue;
    await db`
      insert into support_notes (trip_id, request_id, actor, note, metadata)
      values (
        ${row.trip_id}, ${row.request_id}, ${cleanText(note.actor || 'worker', 120) || 'worker'},
        ${noteText}, ${JSON.stringify(note.metadata || {})}::jsonb
      )
    `;
  }
}

export default async function handler(req, res) {
  try {
    requireWorkerAuth(req, process.env);
    const db = sql(process.env);

    if (req.method === 'GET') {
      const url = new URL(req.url || '/', 'https://timesyncher.com');
      const workerId = cleanText(url.searchParams.get('workerId') || 'TimeStopper', 120);
      const limit = Math.max(1, Math.min(10, Number.parseInt(url.searchParams.get('limit') || '1', 10)));
      const jobs = await claimJobs(db, { workerId, limit });
      return sendJson(res, 200, { ok: true, jobs });
    }

    if (req.method === 'POST') {
      const body = await readJson(req);
      const result = await completeJob(db, body);
      return sendJson(res, 200, { ok: true, ...result });
    }

    return sendJson(res, 405, { ok: false, error: 'method not allowed' });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Worker job request failed.' });
  }
}
