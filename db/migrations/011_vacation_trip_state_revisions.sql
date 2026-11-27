create table if not exists vacation_trip_state_revisions (
  trip_id uuid not null references trips(id) on delete cascade,
  revision integer not null check (revision > 0),
  request_id text not null,
  turn integer not null check (turn > 0),
  phase text not null check (phase in ('planning', 'reply_ready', 'shipped')),
  schema_version text not null,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  state_json text not null check (jsonb_typeof(state_json::jsonb) = 'object'),
  shipped_reply_id uuid,
  primary key (trip_id, revision),
  unique (trip_id, request_id, phase),
  unique (trip_id, turn, phase),
  check ((phase = 'shipped') = (shipped_reply_id is not null))
);
