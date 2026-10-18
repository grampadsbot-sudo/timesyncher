create table if not exists trip_thing_logo_audit (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  thing_id uuid not null references trip_things(id) on delete cascade,
  actor text not null,
  old_value text,
  new_value text,
  source_url text,
  outcome text not null,
  created_at timestamptz not null default now()
);

create index if not exists trip_thing_logo_audit_thing_idx
  on trip_thing_logo_audit (thing_id, created_at);
