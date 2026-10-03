create table if not exists nominatim_geocode_cache (
  cache_key text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists nominatim_geocode_cache_expires_at_idx
  on nominatim_geocode_cache (expires_at);

create table if not exists nominatim_throttle (
  id int primary key check (id = 1),
  next_slot_ms bigint not null default 0
);

insert into nominatim_throttle (id, next_slot_ms)
values (1, 0)
on conflict (id) do nothing;
