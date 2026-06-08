import { sql } from '../src/vacation/db.mjs';
import { cleanText, sendJson } from '../src/vacation/http.mjs';

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = item[key] || 'other';
    groups[value] = groups[value] || [];
    groups[value].push(item);
    return groups;
  }, {});
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'method not allowed' });

  try {
    const url = new URL(req.url || '/', 'https://timesyncher.com');
    const token = cleanText(url.searchParams.get('session') || url.searchParams.get('token'), 160);
    if (!token) return sendJson(res, 400, { ok: false, error: 'session is required.' });

    const db = sql(process.env);
    const sessions = await db`
      select
        onboarding_sessions.token,
        onboarding_sessions.status as onboarding_status,
        trips.id as trip_id,
        trips.title,
        trips.start_date,
        trips.end_date,
        trips.destination,
        trips.status,
        customers.display_name,
        customers.first_name,
        customers.last_name
      from onboarding_sessions
      join trips on trips.id = onboarding_sessions.trip_id
      left join customers on customers.id = onboarding_sessions.customer_id
      where onboarding_sessions.token = ${token}
      limit 1
    `;
    const session = sessions[0];
    if (!session) return sendJson(res, 404, { ok: false, error: 'Itinerary not found.' });

    const things = await db`
      select id, category, subtype, title, description, starts_at, ends_at, cost_estimate_cents,
        currency, location, links, ratings, metadata, created_at
      from trip_things
      where trip_id = ${session.trip_id}
      order by
        coalesce(starts_at, created_at) asc,
        case category
          when 'transport' then 1
          when 'hotel' then 2
          when 'activity' then 3
          when 'restaurant' then 4
          else 9
        end,
        created_at asc
    `;
    const budgets = await db`
      select category, label, amount_cents, currency, metadata, created_at
      from budget_items
      where trip_id = ${session.trip_id}
      order by created_at asc
    `;

    return sendJson(res, 200, {
      ok: true,
      trip: {
        title: session.title,
        destination: session.destination,
        startDate: session.start_date,
        endDate: session.end_date,
        status: session.status,
        travelerName: session.display_name || [session.first_name, session.last_name].filter(Boolean).join(' '),
      },
      sections: groupBy(things, 'category'),
      things,
      budgets,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: error.message || 'Unable to load itinerary.' });
  }
}
