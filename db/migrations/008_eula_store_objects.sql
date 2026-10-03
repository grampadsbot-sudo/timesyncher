create table if not exists eula_store_objects (
  key text primary key,
  document jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists eula_store_objects_key_prefix_idx
  on eula_store_objects (key text_pattern_ops);
