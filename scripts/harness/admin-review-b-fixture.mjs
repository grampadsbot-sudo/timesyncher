import { cannedWelcomeLiveTurn } from '../../src/vacation/onboarding-welcome.mjs';

export function buildAdminReviewBFixture(orlando) {
  const tripId = 'aaaaaaaa-0000-0000-0000-000000000116';
  const other = 'bbbbbbbb-0000-0000-0000-000000000116';
  const olderTrip = 'cccccccc-0000-0000-0000-000000000116';
  const failedTrip = 'eeeeeeee-0000-0000-0000-000000000116';
  const customerId = 'fixture-lopez-current';
  const earlierCustomerId = 'fixture-lopez-earlier';
  const fixtureTrip = 'vk-fixture-trip-001';
  const current = '2026-11-26T12:00:00.000Z';
  const before = '2026-11-25T12:00:00.000Z';
  const vacations = [
    { trip_id: tripId, title: 'Test harness review', destination: 'Fixture destination', customer_id: customerId, display_name: 'Sofia Lopez',
      customer_email: 'harness+fixture-current+vk-001-lopez@harness.invalid',
      share_slug: orlando.shareSlug, harness_tag: 'harness:fixture:review', created_at: current,
      start_date: '2027-03-01', end_date: '2027-03-05', qa: { score: 4 }, survey: { rating: 'happy' } },
    { trip_id: other, title: 'Second fixture', destination: 'Fixture destination', customer_id: 'fixture-2', display_name: 'Second fixture', created_at: before },
    { trip_id: olderTrip, title: 'Earlier fixture vacation', destination: 'Earlier destination', customer_id: earlierCustomerId,
      customer_email: 'harness+fixture-earlier+vk-001-lopez@harness.invalid', display_name: 'Sofia Lopez', created_at: before },
    { trip_id: failedTrip, title: 'Failed fixture', destination: 'Fixture destination', customer_id: 'fixture-kowalski-failed',
      customer_email: 'harness+fixture-failed+vk-002-kowalski@harness.invalid', display_name: 'Kowalski family',
      harness_tag: 'harness:fixture:failed', created_at: before },
  ];
  const names = ['vendor/first', 'vendor/second', 'vendor/third'];
  const ledger = (requestId, model, costSource, costUsd, extra = {}) => ({ tripId, requestId, model, costUsd, costSource, ...extra });
  const replies = [
    [ledger('req-1', names[0], 'openrouter_usage_cost', 0.01234567, { purpose: 'reply_draft' }),
      ledger('req-1', 'vendor/judge', 'openrouter_usage_cost', 0.002, { purpose: 'jev_quality' }),
      ledger('req-1', names[0], 'openrouter_usage_cost', 99, { tripId: other, purpose: 'reply_draft' })],
    [ledger(null, names[1], 'openrouter_listed_price', 0.05, { tripId: null, purpose: 'reply_rewrite' }),
      ledger('req-2', names[0], 'openrouter_usage_cost', 0.003, { purpose: 'reply_draft' })],
    [ledger('req-3', names[2], 'unpriced', null, { purpose: 'reply_draft' })],
  ];
  const graded = [
    { score: 4.25, disposition: 'keep' },
    { score: 3.8, disposition: 'rewrite' },
    { score: 3.5, disposition: 'keep' },
  ];
  const turns = replies.flatMap((rows, index) => {
    const common = { request_id: `req-${index + 1}`, at: current };
    const quality = { judged: true, score: graded[index].score, disposition: graded[index].disposition };
    return [
      { ...common, speaker: 'customer', direction: 'inbound', body: `Customer line ${index + 1}`,
        payload: index === 0 ? { liveTranscript: { openrouterCalls: rows.slice(0, 1) } } : {} },
      { ...common, speaker: 'app', direction: 'outbound', body: `App reply ${index + 1}`,
        payload: { liveTranscript: index === 1
          ? { modelId: names[0], quality: { ...quality, shippedModel: names[index] }, shippedRewrite: true,
            jevDisposition: graded[index].disposition, openrouterCalls: rows }
          : { shippedModel: names[index], quality, jevDisposition: graded[index].disposition, openrouterCalls: rows } } },
    ];
  });
  const openingGreeting = "Welcome, Sofia! You're all set to start planning your vacation.";
  turns.unshift({ at: current, speaker: 'app', direction: 'outbound', body: openingGreeting,
    payload: { welcomeAudience: 'owner', liveTranscript: cannedWelcomeLiveTurn({ text: openingGreeting, at: current }) } });
  turns.push({ request_id: 'req-4', at: current, speaker: 'app', direction: 'outbound', body: 'App reply 4',
    payload: { liveTranscript: { model: { responseModel: 'vendor/legacy',
      cost: { status: 'measured', currency: 'USD', dollars: 0.004, source: 'openrouter_usage_cost' } },
    quality: { judged: true, score: 4, disposition: 'keep' }, jevDisposition: 'keep' } } });
  const queries = [];
  const storedOnboarding = [{ id: 'fixture-session', status: 'completed', current_step: 'vacation_app', created_at: before, completed_at: current }];
  const db = async (parts, id) => {
    const query = parts.join('?');
    queries.push(query);
    if (query.includes('from transcript_turns')) return id === tripId ? turns : [];
    if (query.includes('from onboarding_clicks')) return [{ session_id: 'fixture-session', event_type: 'accept', target: 'Terms', clicked_at: current }];
    if (query.includes('from onboarding_sessions')) return storedOnboarding;
    if (query.includes('lower(c.email) like')) {
      const aliasPrefix = id.split('%')[1];
      return vacations.filter((row) => row.customer_email?.includes(aliasPrefix));
    }
    if (query.includes('from trips where customer_id')) return vacations.filter((row) => row.customer_id === id);
    if (query.includes('from trips')) return id ? vacations.filter((row) => row.trip_id === id) : vacations;
    throw new Error('Unknown fixture query');
  };
  return {
    tripId, other, olderTrip, failedTrip, customerId, earlierCustomerId, fixtureTrip, current, before,
    vacations, turns, openingGreeting, db, queries,
  };
}