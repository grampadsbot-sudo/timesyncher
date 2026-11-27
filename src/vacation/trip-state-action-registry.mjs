import { tripStateActionsEnabled } from './trip-state-actions-enabled.mjs';

const definitions = {
  set_time: ['existing', ['item', 'day', 'time']],
  add_bar_before: ['existing', ['anchor', 'day']],
  undo: ['existing', ['edit_id']],
  search_places: ['adapter', ['area', 'category', 'criteria']],
  invite_collaborator: ['adapter', ['name', 'email', 'access', 'send_request']],
  place_on_day: ['new', ['item', 'day', 'role']],
  add_from_search: ['new', ['candidate']],
  add_named_item: ['new', ['type', 'label', 'evidence']],
  set_stay: ['new', ['hotel', 'check_in', 'check_out']],
  save_plan: ['new', ['operations', 'authority']],
  hold_invite: ['new', ['name', 'access']],
};

export function tripStateCapabilities({
  env, trip, backing, grant, locked, read, serviceAvailable, emailHeld, accessRights, productFacts,
} = {}) {
  const actions = Object.fromEntries(Object.entries(definitions).map(([name, [wiring, requires]]) => {
    let reason = 'ready';
    if (name === 'invite_collaborator' && emailHeld) reason = 'on_hold';
    else if (wiring !== 'new' || !tripStateActionsEnabled({ env, trip }) || backing !== 'intake') reason = 'not_wired';
    else if (locked) reason = 'trip_locked';
    else if (grant !== 'owner' && (grant !== 'edit' || name === 'hold_invite')) reason = 'no_grant';
    else if (serviceAvailable === false) reason = 'service_unavailable';
    else if (read !== 'current') reason = 'reader_unavailable';
    return [name, { wiring, requires: [...requires], enabled: reason === 'ready', reason }];
  }));
  return {
    actions, booking: false, payment: false, email: emailHeld ? 'held' : 'explicit_request_only',
    product_facts: productFacts ?? [],
    access_rights: accessRights ?? { view: [], edit_after_accept: [] },
  };
}
