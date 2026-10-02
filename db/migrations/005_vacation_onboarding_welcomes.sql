create table if not exists vacation_onboarding_welcomes (
  id uuid primary key default gen_random_uuid(),
  onboarding_session_id uuid not null references onboarding_sessions(id) on delete cascade,
  welcome_for text not null,
  trip_id uuid references trips(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists vacation_onboarding_welcomes_session_slot_idx
  on vacation_onboarding_welcomes (
    onboarding_session_id,
    welcome_for,
    coalesce(trip_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
