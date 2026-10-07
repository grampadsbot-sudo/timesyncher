create table if not exists thing_media_bindings (
  id uuid primary key default gen_random_uuid(),
  share_token text not null,
  trek_trip_id integer,
  trek_place_id integer not null,
  trek_day_id integer,
  day_number integer,
  thing_name text,
  caption text,
  media_kind text not null default 'photo',
  mime_type text,
  original_name text,
  file_size_bytes bigint,
  public_url text not null,
  storage_provider text not null default 'url',
  storage_pathname text,
  trek_apply_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (media_kind in ('photo', 'video'))
);

alter table thing_media_bindings add column if not exists file_bytes bytea;

create index if not exists thing_media_bindings_token_idx
  on thing_media_bindings (share_token, trek_place_id, created_at desc);
