create extension if not exists pgcrypto;

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  phone text,
  telegram_user_id text unique,
  first_name text,
  last_name text,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  title text not null default 'Vacation',
  destination text,
  start_date date,
  end_date date,
  party jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  status text not null default 'intake',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table trips
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  trip_id uuid references trips(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_payment_intent_id text,
  plan text not null default 'single',
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vacation_collaborator_invites (
  id uuid primary key default gen_random_uuid(),
  owner_customer_id uuid not null references customers(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  plan_code text not null,
  scope text not null default 'single_trip',
  requested_for text,
  status text not null default 'pending_payment',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  deep_link_token_hash text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  accepted_at timestamptz,
  expires_at timestamptz,
  check (scope in ('single_trip', 'unlimited_trips')),
  check (status in ('pending_payment', 'paid', 'accepted', 'revoked', 'expired'))
);

create table if not exists vacation_collaborators (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid references vacation_collaborator_invites(id) on delete set null,
  owner_customer_id uuid not null references customers(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  telegram_chat_id text,
  telegram_user_id text,
  display_name text,
  plan_code text not null,
  scope text not null default 'single_trip',
  status text not null default 'active',
  accepted_eula_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  check (scope in ('single_trip', 'unlimited_trips')),
  check (status in ('active', 'revoked'))
);

create unique index if not exists vacation_collaborators_active_telegram_chat_idx
  on vacation_collaborators (owner_customer_id, coalesce(trip_id, '00000000-0000-0000-0000-000000000000'::uuid), telegram_chat_id)
  where status = 'active' and telegram_chat_id is not null;

create unique index if not exists vacation_collaborators_active_telegram_user_idx
  on vacation_collaborators (owner_customer_id, coalesce(trip_id, '00000000-0000-0000-0000-000000000000'::uuid), telegram_user_id)
  where status = 'active' and telegram_user_id is not null;

create table if not exists vacation_web_access_grants (
  id uuid primary key default gen_random_uuid(),
  owner_customer_id uuid not null references customers(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'web_editor',
  status text not null default 'invited',
  invite_token_hash text unique,
  session_token_hash text unique,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (role in ('owner', 'web_editor', 'telegram_collaborator', 'viewer')),
  check (status in ('invited', 'accepted', 'revoked', 'expired'))
);

create unique index if not exists vacation_web_access_active_email_idx
  on vacation_web_access_grants (trip_id, lower(email), role)
  where status in ('invited', 'accepted');

create table if not exists paid_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  trip_id uuid references trips(id) on delete set null,
  entitlement_id uuid references entitlements(id) on delete set null,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  stripe_invoice_id text,
  stripe_payment_intent_id text unique,
  amount_cents integer,
  currency text not null default 'usd',
  plan text not null default 'single',
  status text not null default 'paid',
  contact jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  trip_id uuid references trips(id) on delete set null,
  order_id uuid references paid_orders(id) on delete set null,
  token text not null unique,
  status text not null default 'purchase_confirmed',
  current_step text not null default 'post_purchase',
  telegram_deep_link text,
  telegram_install_choice text,
  email_sent_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists checkout_coupons (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  label text not null default 'TimeSyncher checkout coupon',
  max_redemptions integer not null default 1,
  redemption_count integer not null default 0,
  status text not null default 'active',
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_redemptions > 0),
  check (redemption_count >= 0)
);

create table if not exists checkout_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references checkout_coupons(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  trip_id uuid references trips(id) on delete set null,
  order_id uuid references paid_orders(id) on delete set null,
  onboarding_session_id uuid references onboarding_sessions(id) on delete set null,
  email text,
  plan text not null default 'single',
  original_amount_cents integer not null default 0,
  status text not null default 'processing',
  email_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table checkout_coupons
  add column if not exists max_redemptions integer not null default 1,
  add column if not exists redemption_count integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table checkout_coupon_redemptions
  add column if not exists customer_id uuid references customers(id) on delete set null,
  add column if not exists trip_id uuid references trips(id) on delete set null,
  add column if not exists order_id uuid references paid_orders(id) on delete set null,
  add column if not exists onboarding_session_id uuid references onboarding_sessions(id) on delete set null,
  add column if not exists email text,
  add column if not exists email_status text,
  add column if not exists created_at timestamptz not null default now();

alter table checkout_coupon_redemptions
  add column if not exists code_hint text;

alter table checkout_coupon_redemptions
  alter column code_hint drop not null;

create table if not exists onboarding_clicks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references onboarding_sessions(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  order_id uuid references paid_orders(id) on delete set null,
  event_type text not null,
  target text,
  href text,
  user_agent text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  clicked_at timestamptz not null default now()
);

create table if not exists outbound_emails (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  order_id uuid references paid_orders(id) on delete set null,
  session_id uuid references onboarding_sessions(id) on delete set null,
  to_email text not null,
  subject text not null,
  html_body text not null,
  text_body text not null,
  provider text not null default 'pending',
  provider_message_id text,
  status text not null default 'pending',
  error_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists telegram_sessions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  trip_id uuid references trips(id) on delete set null,
  onboarding_session_id uuid references onboarding_sessions(id) on delete set null,
  telegram_chat_id text not null,
  telegram_user_id text,
  status text not null default 'active',
  current_step text not null default 'setup_started',
  started_at timestamptz not null default now(),
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (telegram_chat_id)
);

create table if not exists vacation_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  trip_id uuid references trips(id) on delete cascade,
  source text not null default 'web',
  request_type text not null default 'trip_intake',
  request_text text not null default '',
  normalized_intent jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  error_code text,
  error_summary text,
  agent_runtime text,
  tooling_used jsonb not null default '[]'::jsonb,
  retry_count integer not null default 0,
  received_at timestamptz not null default now(),
  queued_at timestamptz,
  worker_started_at timestamptz,
  first_response_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vacation_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references vacation_requests(id) on delete cascade,
  event_type text not null,
  actor text not null default 'system',
  event_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create table if not exists worker_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references vacation_requests(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  job_type text not null,
  status text not null default 'pending',
  priority integer not null default 100,
  run_after timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  input jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trip_things (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  source_request_id uuid references vacation_requests(id) on delete set null,
  category text not null,
  subtype text,
  title text not null,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  cost_estimate_cents integer,
  currency text not null default 'usd',
  location jsonb not null default '{}'::jsonb,
  links jsonb not null default '[]'::jsonb,
  ratings jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists budget_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  source_thing_id uuid references trip_things(id) on delete set null,
  category text not null,
  label text not null,
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists transcript_turns (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  trip_id uuid references trips(id) on delete cascade,
  request_id uuid references vacation_requests(id) on delete set null,
  speaker text not null,
  channel text not null default 'web',
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  captured_for_review boolean not null default true,
  created_at timestamptz not null default now()
);

alter table transcript_turns
  add column if not exists telegram_session_id uuid references telegram_sessions(id) on delete set null,
  add column if not exists direction text,
  add column if not exists telegram_message_id text,
  add column if not exists received_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists response_latency_ms integer,
  add column if not exists onboarding_step text,
  add column if not exists turn_category text,
  add column if not exists turn_tags text[] not null default '{}'::text[],
  add column if not exists turn_tag_source text,
  add column if not exists turn_tag_confidence numeric,
  add column if not exists turn_tagged_at timestamptz;

create table if not exists support_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  trip_id uuid references trips(id) on delete cascade,
  request_id uuid references vacation_requests(id) on delete set null,
  actor text not null,
  note text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_trips_customer_id on trips(customer_id);
create index if not exists idx_vacation_requests_trip_id on vacation_requests(trip_id);
create index if not exists idx_vacation_requests_status on vacation_requests(status);
create index if not exists idx_vacation_requests_timing on vacation_requests(received_at, completed_at);
create index if not exists idx_worker_jobs_claim on worker_jobs(status, run_after, priority, created_at);
create index if not exists idx_worker_jobs_request_id on worker_jobs(request_id);
create index if not exists idx_transcript_turns_trip_id on transcript_turns(trip_id, created_at);
create index if not exists idx_trip_things_trip_category on trip_things(trip_id, category, subtype);
create index if not exists idx_budget_items_trip_id on budget_items(trip_id);
create index if not exists idx_paid_orders_customer_id on paid_orders(customer_id);
create index if not exists idx_checkout_coupons_status on checkout_coupons(status, expires_at, created_at);
create index if not exists idx_checkout_coupon_redemptions_coupon_id on checkout_coupon_redemptions(coupon_id, created_at);
create index if not exists idx_checkout_coupon_redemptions_session_id on checkout_coupon_redemptions(onboarding_session_id);
create index if not exists idx_onboarding_sessions_customer_id on onboarding_sessions(customer_id);
create index if not exists idx_onboarding_sessions_token on onboarding_sessions(token);
create index if not exists idx_onboarding_clicks_session_id on onboarding_clicks(session_id, clicked_at);
create index if not exists idx_outbound_emails_status on outbound_emails(status, created_at);
create index if not exists idx_telegram_sessions_customer_id on telegram_sessions(customer_id);
create index if not exists idx_transcript_turns_telegram_session_id on transcript_turns(telegram_session_id, created_at);
create index if not exists idx_transcript_turns_turn_category on transcript_turns(turn_category, created_at);
create index if not exists idx_transcript_turns_turn_tags on transcript_turns using gin(turn_tags);
