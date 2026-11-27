create table if not exists vacation_trip_state_action_receipts (
  trip_id uuid not null references trips(id) on delete cascade,
  request_id text not null,
  operation_key text not null,
  record jsonb not null,
  primary key (trip_id, request_id, operation_key)
);

create table if not exists vacation_trip_state_held_invites (
  trip_id uuid not null references trips(id) on delete cascade,
  id text not null,
  record jsonb not null,
  primary key (trip_id, id)
);
