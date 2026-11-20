import crypto from 'node:crypto';
import { webAccessTokenHash } from '../../src/vacation/web-access.mjs';

function clone(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = clone(v);
    return out;
  }
  return value;
}

export function createMcpTestDb() {
  const tables = {
    customers: [],
    trips: [],
    trip_things: [],
    thing_media_bindings: [],
    vacation_web_access_grants: [],
    vacation_mcp_tokens: [],
    vacation_mcp_change_sets: [],
    vacation_mcp_draft_media: [],
    vacation_media_usage: [],
  };

  function sqlTag(strings, ...values) {
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();
    const nowIso = new Date().toISOString();

    if (/^(create|alter)\s/.test(text)) return Promise.resolve([]);

    if (text.startsWith('insert into vacation_mcp_tokens')) {
      const row = {
        id: crypto.randomUUID(),
        trip_id: String(values[0]),
        owner_customer_id: values[1] ? String(values[1]) : null,
        created_by_email: values[2] || null,
        label: String(values[3] || 'AI access'),
        role: String(values[4] || 'collaborator'),
        token_hash: String(values[5]),
        token_prefix: String(values[6]),
        status: 'active',
        created_at: nowIso,
        last_used_at: null,
        revoked_at: null,
        expires_at: values[7] || null,
        metadata: {},
      };
      tables.vacation_mcp_tokens.push(row);
      return Promise.resolve([clone(row)]);
    }

    if (text.includes('from vacation_mcp_tokens where trip_id =')) {
      return Promise.resolve(tables.vacation_mcp_tokens.filter((r) => String(r.trip_id) === String(values[0])).map(clone));
    }

    if (text.includes('from vacation_mcp_tokens where token_hash =')) {
      const found = tables.vacation_mcp_tokens.find((r) => r.token_hash === String(values[0]));
      return Promise.resolve(found ? [clone(found)] : []);
    }

    if (text.startsWith("update vacation_mcp_tokens set status = 'revoked'")) {
      const found = tables.vacation_mcp_tokens.find((r) => String(r.id) === String(values[0]) && String(r.trip_id) === String(values[1]));
      if (!found) return Promise.resolve([]);
      found.status = 'revoked';
      found.revoked_at = nowIso;
      return Promise.resolve([clone(found)]);
    }

    if (text.startsWith('update vacation_mcp_tokens set last_used_at =')) {
      const found = tables.vacation_mcp_tokens.find((r) => String(r.id) === String(values[1]));
      if (found) found.last_used_at = String(values[0]);
      return Promise.resolve([]);
    }

    if (text.includes('from vacation_web_access_grants') && text.includes('session_token_hash =')) {
      const sessionHash = String(values[0]);
      if (text.includes('join trips')) {
        const roles = Array.isArray(values[1]) ? values[1] : [];
        const shareToken = String(values[2] || '');
        const found = tables.vacation_web_access_grants.find((g) => {
          if (g.session_token_hash !== sessionHash || g.status !== 'accepted') return false;
          if (roles.length && !roles.includes(g.role)) return false;
          const trip = tables.trips.find((t) => String(t.id) === String(g.trip_id));
          const gm = g.metadata || {};
          const tm = trip?.metadata || {};
          return [gm.shareToken, gm.sharedToken, gm.publicSlug, tm.sharedToken, tm.shareToken, tm.publicSlug, tm.source_token, tm.slug].includes(shareToken);
        });
        return Promise.resolve(found ? [clone(found)] : []);
      }
      const tripId = String(values[1]);
      const roles = Array.isArray(values[2]) ? values[2] : [];
      const found = tables.vacation_web_access_grants.find((g) =>
        g.session_token_hash === sessionHash && String(g.trip_id) === tripId && g.status === 'accepted' && (!roles.length || roles.includes(g.role)),
      );
      return Promise.resolve(found ? [clone(found)] : []);
    }

    if (text.startsWith('update vacation_web_access_grants set last_seen_at')) {
      const found = tables.vacation_web_access_grants.find((g) => String(g.id) === String(values[0]));
      if (found) found.last_seen_at = nowIso;
      return Promise.resolve([]);
    }

    if (text.startsWith('insert into vacation_mcp_change_sets')) {
      const hasCommitted = text.includes('committed_at');
      const row = {
        id: crypto.randomUUID(),
        scope_trip_id: String(values[0]),
        target_trip_id: values[1] ? String(values[1]) : null,
        published_trip_id: null,
        token_id: values[2] ? String(values[2]) : null,
        kind: hasCommitted ? 'targeted_edit' : 'draft_import',
        apply_mode: hasCommitted ? 'targeted_edit' : String(values[3]),
        status: hasCommitted ? 'pending_approval' : 'draft',
        summary: String(hasCommitted ? values[3] : values[4]),
        payload: clone(hasCommitted ? values[4] : values[5]),
        preview: clone(hasCommitted ? values[5] : values[6]),
        committed_at: hasCommitted ? nowIso : null,
        reviewed_at: null,
        reviewed_by: null,
        review_note: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      tables.vacation_mcp_change_sets.push(row);
      return Promise.resolve([clone(row)]);
    }

    if (text.includes('from vacation_mcp_change_sets where id =')) {
      const found = tables.vacation_mcp_change_sets.find((r) => String(r.id) === String(values[0]));
      return Promise.resolve(found ? [clone(found)] : []);
    }

    if (text.includes('from vacation_mcp_change_sets where scope_trip_id =')) {
      return Promise.resolve(tables.vacation_mcp_change_sets.filter((r) => String(r.scope_trip_id) === String(values[0])).map(clone));
    }

    if (text.startsWith('update vacation_mcp_change_sets set preview =')) {
      const found = tables.vacation_mcp_change_sets.find((r) => String(r.id) === String(values[2]));
      if (found) { found.preview = clone(values[0]); found.summary = String(values[1] || ''); found.updated_at = nowIso; }
      return Promise.resolve([]);
    }

    if (text.startsWith("update vacation_mcp_change_sets set status = 'pending_approval'")) {
      const found = tables.vacation_mcp_change_sets.find((r) => String(r.id) === String(values[1]));
      if (found) { found.status = 'pending_approval'; found.committed_at = nowIso; found.review_note = values[0] || null; }
      return Promise.resolve([]);
    }

    if (text.startsWith("update vacation_mcp_change_sets set status = 'approved'")) {
      const found = tables.vacation_mcp_change_sets.find((r) => String(r.id) === String(values[2]));
      if (found) { found.status = 'approved'; found.published_trip_id = String(values[0]); found.reviewed_by = String(values[1]); found.reviewed_at = nowIso; }
      return Promise.resolve([]);
    }

    if (text.startsWith("update vacation_mcp_change_sets set status = 'declined'")) {
      const found = tables.vacation_mcp_change_sets.find((r) => String(r.id) === String(values[2]));
      if (found) { found.status = 'declined'; found.reviewed_by = String(values[0]); found.review_note = values[1] || null; found.reviewed_at = nowIso; }
      return Promise.resolve([]);
    }

    if (text.startsWith('insert into vacation_mcp_draft_media')) {
      const row = {
        id: crypto.randomUUID(),
        scope_trip_id: String(values[0]),
        change_set_id: values[1] ? String(values[1]) : null,
        filename: String(values[2]),
        mime_type: String(values[3]),
        media_kind: String(values[4]),
        expected_bytes: values[5] ?? null,
        actual_bytes: 0,
        upload_status: 'signed',
        upload_token_hash: String(values[6]),
        upload_expires_at: String(values[7]),
        storage_provider: 'pending',
        storage_pathname: null,
        public_url: null,
        caption: values[8] || null,
        target_thing_ref: values[9] || null,
        assigned_day_date: null,
        assigned_day_number: null,
        assignment_bucket: 'unassigned',
        exif_captured_at: null,
        exif_lat: null,
        exif_lng: null,
        exif_raw: {},
        file_bytes: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      tables.vacation_mcp_draft_media.push(row);
      return Promise.resolve([clone(row)]);
    }

    if (text.includes('from vacation_mcp_draft_media where id =')) {
      const found = tables.vacation_mcp_draft_media.find((r) => String(r.id) === String(values[0]));
      return Promise.resolve(found ? [clone(found)] : []);
    }

    if (text.includes('from vacation_mcp_draft_media where scope_trip_id =')) {
      const tripId = String(values[0]);
      const changeSetId = values.length > 1 ? String(values[1]) : null;
      return Promise.resolve(tables.vacation_mcp_draft_media.filter((r) =>
        String(r.scope_trip_id) === tripId && (!changeSetId || String(r.change_set_id || '') === changeSetId || r.change_set_id === null),
      ).map(clone));
    }

    if (text.startsWith('update vacation_mcp_draft_media set upload_token_hash =')) {
      const found = tables.vacation_mcp_draft_media.find((r) => String(r.id) === String(values[2]));
      if (found) { found.upload_token_hash = String(values[0]); found.upload_expires_at = String(values[1]); }
      return Promise.resolve([]);
    }

    if (text.startsWith("update vacation_mcp_draft_media set upload_status = 'expired'")) {
      const found = tables.vacation_mcp_draft_media.find((r) => String(r.id) === String(values[0]));
      if (found) found.upload_status = 'expired';
      return Promise.resolve([]);
    }

    if (text.startsWith('update vacation_mcp_draft_media set actual_bytes =')) {
      const found = tables.vacation_mcp_draft_media.find((r) => String(r.id) === String(values[10]));
      if (found) {
        found.actual_bytes = Number(values[0]);
        found.mime_type = String(values[1]);
        found.upload_status = 'uploaded';
        found.storage_provider = String(values[2]);
        found.storage_pathname = String(values[3]);
        found.public_url = String(values[4]);
        found.exif_captured_at = values[5] || null;
        found.exif_lat = values[6] ?? null;
        found.exif_lng = values[7] ?? null;
        found.exif_raw = clone(values[8] || {});
        found.file_bytes = values[9] ? Buffer.from(values[9]) : null;
      }
      return Promise.resolve([]);
    }

    if (text.startsWith('update vacation_mcp_draft_media set change_set_id =')) {
      const found = tables.vacation_mcp_draft_media.find((r) => String(r.id) === String(values[4]));
      if (found) {
        found.change_set_id = values[0] ? String(values[0]) : null;
        found.upload_status = 'finalized';
        found.assigned_day_date = values[1] || null;
        found.assigned_day_number = values[2] ?? null;
        found.assignment_bucket = String(values[3]);
      }
      return Promise.resolve([]);
    }

    if (text.startsWith("update vacation_mcp_draft_media set upload_status = 'published'")) {
      const found = tables.vacation_mcp_draft_media.find((r) => String(r.id) === String(values[4]));
      if (found) {
        found.upload_status = 'published';
        found.assigned_day_date = values[0] || null;
        found.assigned_day_number = values[1] ?? null;
        found.assignment_bucket = String(values[2]);
        found.caption = values[3] || null;
      }
      return Promise.resolve([]);
    }

    if (text.startsWith('insert into vacation_media_usage')) {
      const tripId = String(values[0]);
      let row = tables.vacation_media_usage.find((r) => String(r.trip_id) === tripId);
      if (!row) {
        row = { trip_id: tripId, total_bytes: Number(values[1] || 0), media_count: Number(values[2] || 0), updated_at: nowIso };
        tables.vacation_media_usage.push(row);
      } else {
        row.total_bytes += Number(values[1] || 0);
        row.media_count += Number(values[2] || 0);
        row.updated_at = nowIso;
      }
      return Promise.resolve([clone(row)]);
    }

    if (text.includes('from vacation_media_usage where trip_id =')) {
      const found = tables.vacation_media_usage.find((r) => String(r.trip_id) === String(values[0]));
      return Promise.resolve(found ? [clone(found)] : []);
    }

    if (text.startsWith('insert into trips')) {
      const row = {
        id: crypto.randomUUID(),
        customer_id: values[0] ? String(values[0]) : null,
        title: String(values[1]),
        destination: values[2] || null,
        start_date: values[3] || null,
        end_date: values[4] || null,
        status: 'active',
        metadata: clone(values[5] || {}),
        created_at: nowIso,
        updated_at: nowIso,
      };
      tables.trips.push(row);
      return Promise.resolve([clone(row)]);
    }

    if (text.includes('from trips where id =')) {
      const found = tables.trips.find((r) => String(r.id) === String(values[0]));
      return Promise.resolve(found ? [clone(found)] : []);
    }

    if (text.startsWith('update trips set metadata =')) {
      const found = tables.trips.find((r) => String(r.id) === String(values[1]));
      if (found) found.metadata = clone(values[0]);
      return Promise.resolve([]);
    }

    if (text.startsWith('update trips set title =') && text.includes('start_date =')) {
      const found = tables.trips.find((r) => String(r.id) === String(values[5]));
      if (found) {
        found.title = String(values[0]);
        found.destination = values[1] || null;
        found.start_date = values[2] || null;
        found.end_date = values[3] || null;
        found.metadata = clone(values[4]);
        found.status = 'active';
      }
      return Promise.resolve([]);
    }

    if (text.startsWith('update trips set title =')) {
      const found = tables.trips.find((r) => String(r.id) === String(values[3]));
      if (found) { found.title = String(values[0]); found.destination = values[1] || null; found.metadata = clone(values[2]); }
      return Promise.resolve([]);
    }

    if (text.startsWith('insert into trip_things')) {
      const hasSubtype = text.includes('subtype');
      const offset = hasSubtype ? 1 : 0;
      const row = {
        id: crypto.randomUUID(),
        trip_id: String(values[0]),
        category: String(values[1]),
        subtype: hasSubtype ? (values[2] || null) : null,
        title: String(values[2 + offset]),
        description: values[3 + offset] || null,
        starts_at: values[4 + offset] || null,
        ends_at: values[5 + offset] || null,
        cost_estimate_cents: values[6 + offset] ?? null,
        currency: String(values[7 + offset] || 'usd'),
        location: clone(values[8 + offset] || {}),
        links: clone(values[9 + offset] || []),
        ratings: clone(values[10 + offset] || {}),
        metadata: clone(values[11 + offset] || {}),
        created_at: nowIso,
        updated_at: nowIso,
      };
      tables.trip_things.push(row);
      return Promise.resolve([clone(row)]);
    }

    if (text.startsWith('select') && text.includes('from trip_things where id =') && text.includes('and trip_id =')) {
      const found = tables.trip_things.find((r) => String(r.id) === String(values[0]) && String(r.trip_id) === String(values[1]));
      return Promise.resolve(found ? [clone(found)] : []);
    }

    if (text.startsWith('select') && text.includes('from trip_things where trip_id =')) {
      return Promise.resolve(tables.trip_things.filter((r) => String(r.trip_id) === String(values[0])).map(clone));
    }

    if (text.startsWith('update trip_things set title =')) {
      const found = tables.trip_things.find((r) => String(r.id) === String(values[7]) && String(r.trip_id) === String(values[8]));
      if (found) {
        found.title = String(values[0]);
        found.description = values[1] ?? null;
        found.starts_at = values[2] ?? null;
        found.ends_at = values[3] ?? null;
        found.cost_estimate_cents = values[4] ?? null;
        found.location = clone(values[5] || {});
        found.metadata = clone(values[6] || {});
        found.updated_at = nowIso;
      }
      return Promise.resolve([]);
    }

    if (text.startsWith('delete from trip_things where id =')) {
      const idx = tables.trip_things.findIndex((r) => String(r.id) === String(values[0]) && String(r.trip_id) === String(values[1]));
      if (idx >= 0) tables.trip_things.splice(idx, 1);
      return Promise.resolve([]);
    }

    if (text.startsWith('insert into thing_media_bindings')) {
      const row = {
        id: crypto.randomUUID(),
        share_token: String(values[0]),
        trek_trip_id: values[1],
        trek_place_id: values[2],
        day_number: values[3] ?? null,
        thing_name: values[4] || null,
        caption: values[5] || null,
        media_kind: String(values[6] || 'photo'),
        mime_type: String(values[7] || ''),
        original_name: String(values[8] || ''),
        file_size_bytes: Number(values[9] || 0),
        public_url: String(values[10] || ''),
        storage_provider: String(values[11] || 'neon'),
        storage_pathname: values[12] || null,
        trek_apply_status: 'applied',
        metadata: clone(values[13] || {}),
        file_bytes: values[14] ? Buffer.from(values[14]) : null,
        created_at: nowIso,
      };
      tables.thing_media_bindings.push(row);
      return Promise.resolve([clone(row)]);
    }

    if (text.includes('from thing_media_bindings where share_token =')) {
      return Promise.resolve(tables.thing_media_bindings.filter((r) => String(r.share_token) === String(values[0])).map(clone));
    }

    throw new Error(`Unhandled test SQL: ${text}`);
  }

  sqlTag.tables = tables;
  sqlTag.liveSnapshot = () => JSON.stringify({
    trips: tables.trips,
    trip_things: tables.trip_things,
    thing_media_bindings: tables.thing_media_bindings.map((r) => ({ ...r, file_bytes: r.file_bytes ? r.file_bytes.length : null })),
  });
  sqlTag.seedVacation = ({ id = crypto.randomUUID(), ownerCustomerId = crypto.randomUUID(), title, destination, startDate, endDate, timezone = 'America/Los_Angeles', shareSlug }) => {
    tables.customers.push({ id: ownerCustomerId, email: `owner-${id.slice(0, 6)}@example.com` });
    const trip = {
      id,
      customer_id: ownerCustomerId,
      title,
      destination,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      metadata: { timezone, publicSlug: shareSlug || `intake-${id.replace(/-/g, '').slice(0, 12)}` },
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };
    tables.trips.push(trip);
    return trip;
  };
  sqlTag.seedThing = ({ id = crypto.randomUUID(), tripId, category, title, description = '', startsAt = null, costEstimateCents = null, metadata = {} }) => {
    const row = {
      id,
      trip_id: tripId,
      category,
      subtype: null,
      title,
      description,
      starts_at: startsAt,
      ends_at: null,
      cost_estimate_cents: costEstimateCents,
      currency: 'usd',
      location: {},
      links: [],
      ratings: {},
      metadata,
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };
    tables.trip_things.push(row);
    return row;
  };
  sqlTag.seedEditorSession = ({ tripId, ownerCustomerId, email, role = 'owner', sessionToken, shareSlug }) => {
    const row = {
      id: crypto.randomUUID(),
      owner_customer_id: ownerCustomerId,
      trip_id: tripId,
      email,
      role,
      status: 'accepted',
      session_token_hash: webAccessTokenHash(sessionToken, process.env),
      metadata: { shareToken: shareSlug },
      expires_at: null,
    };
    tables.vacation_web_access_grants.push(row);
    return row;
  };
  return sqlTag;
}
