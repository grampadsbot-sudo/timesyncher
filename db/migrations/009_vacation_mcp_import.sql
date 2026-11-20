create table if not exists vacation_mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  owner_customer_id uuid references customers(id) on delete set null,
  created_by_email text,
  label text not null default 'AI access',
  role text not null default 'collaborator',
  token_hash text not null unique,
  token_prefix text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  check (role in ('owner', 'collaborator')),
  check (status in ('active', 'revoked'))
);

create index if not exists idx_vacation_mcp_tokens_trip_status
  on vacation_mcp_tokens (trip_id, status, created_at desc);

create table if not exists vacation_mcp_change_sets (
  id uuid primary key default gen_random_uuid(),
  scope_trip_id uuid not null references trips(id) on delete cascade,
  target_trip_id uuid references trips(id) on delete set null,
  published_trip_id uuid references trips(id) on delete set null,
  token_id uuid references vacation_mcp_tokens(id) on delete set null,
  kind text not null,
  apply_mode text not null default 'create_new',
  status text not null default 'draft',
  summary text not null default '',
  payload jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  committed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind in ('draft_import', 'targeted_edit')),
  check (apply_mode in ('create_new', 'populate_scoped', 'targeted_edit')),
  check (status in ('draft', 'pending_approval', 'approved', 'declined'))
);

create index if not exists idx_vacation_mcp_change_sets_scope_status
  on vacation_mcp_change_sets (scope_trip_id, status, created_at desc);

create table if not exists vacation_mcp_draft_media (
  id uuid primary key default gen_random_uuid(),
  scope_trip_id uuid not null references trips(id) on delete cascade,
  change_set_id uuid references vacation_mcp_change_sets(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  media_kind text not null default 'photo',
  expected_bytes bigint,
  actual_bytes bigint not null default 0,
  upload_status text not null default 'signed',
  upload_token_hash text not null unique,
  upload_expires_at timestamptz not null,
  storage_provider text not null default 'pending',
  storage_pathname text,
  public_url text,
  caption text,
  target_thing_ref text,
  assigned_day_date date,
  assigned_day_number integer,
  assignment_bucket text not null default 'unassigned',
  exif_captured_at timestamptz,
  exif_lat double precision,
  exif_lng double precision,
  exif_raw jsonb not null default '{}'::jsonb,
  file_bytes bytea,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (media_kind in ('photo', 'video')),
  check (upload_status in ('signed', 'uploaded', 'finalized', 'published', 'expired')),
  check (assignment_bucket in ('day', 'thing', 'unassigned'))
);

create index if not exists idx_vacation_mcp_draft_media_change_set
  on vacation_mcp_draft_media (change_set_id, created_at asc);

create index if not exists idx_vacation_mcp_draft_media_scope_trip
  on vacation_mcp_draft_media (scope_trip_id, created_at desc);

create table if not exists vacation_media_usage (
  trip_id uuid primary key references trips(id) on delete cascade,
  total_bytes bigint not null default 0,
  media_count integer not null default 0,
  updated_at timestamptz not null default now()
);
