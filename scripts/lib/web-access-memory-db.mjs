const SHARE_KEYS = ['sharedToken', 'shareToken', 'publicSlug', 'source_token', 'slug'];

function sqlText(strings) {
  return strings.join('?').replace(/\s+/g, ' ').trim();
}

function live(grant) {
  return grant.status === 'accepted' && (!grant.expires_at || grant.expires_at > Date.now());
}

export function createWebAccessMemoryDb({ customers = [], trips = [] } = {}) {
  const grants = [];
  const queries = [];
  const tripById = (id) => trips.find((trip) => trip.id === id) || null;
  const db = async (strings, ...values) => {
    const text = sqlText(strings);
    queries.push(text);
    if (/^(create|alter) /i.test(text)) return [];
    if (/^insert into vacation_web_access_grants/i.test(text) && /'accepted'/.test(text)) {
      const [ownerId, tripId, email, displayName, role, hash, metadata] = values;
      let grant = grants.find((row) => row.trip_id === tripId && row.email === email && row.role === role && ['invited', 'accepted'].includes(row.status));
      if (!grant) {
        grant = { id: `grant-${grants.length + 1}`, owner_customer_id: ownerId, trip_id: tripId, email, role, metadata: {} };
        grants.push(grant);
      }
      Object.assign(grant, {
        display_name: displayName ?? grant.display_name ?? null,
        status: 'accepted',
        session_token_hash: hash,
        expires_at: Date.now() + 7 * 24 * 3600 * 1000,
        metadata: { ...grant.metadata, ...(metadata || {}) },
      });
      return [{ ...grant }];
    }
    if (/from vacation_web_access_grants/i.test(text) && /session_token_hash = \?/.test(text)) {
      const [hash] = values;
      const byTrip = /and trip_id = \?/.test(text);
      const roles = byTrip ? values[2] : values[1];
      const share = byTrip ? '' : values[2];
      const row = grants.find((grant) => {
        if (grant.session_token_hash !== hash || !live(grant) || !roles.includes(grant.role)) return false;
        if (byTrip) return grant.trip_id === values[1];
        const meta = tripById(grant.trip_id)?.metadata || {};
        return SHARE_KEYS.some((key) => meta[key] === share || grant.metadata?.[key] === share);
      });
      return row ? [{ ...row }] : [];
    }
    if (/^update vacation_web_access_grants set last_seen_at/i.test(text)) return [];
    if (/from trips join customers/i.test(text) && /trips\.customer_id = \?/.test(text)) {
      const [tripId, ownerId] = values;
      const trip = tripById(tripId);
      if (!trip || trip.customer_id !== ownerId) return [];
      const owner = customers.find((row) => row.id === ownerId) || {};
      return [{ ...trip, owner_email: owner.email || null, owner_display_name: owner.display_name || null }];
    }
    if (/^select customer_id from trips where id = \?/i.test(text)) {
      const trip = tripById(values[0]);
      return trip ? [{ customer_id: trip.customer_id }] : [];
    }
    throw new Error(`web access memory db: unexpected sql ${text}`);
  };
  return { db, grants, queries };
}
