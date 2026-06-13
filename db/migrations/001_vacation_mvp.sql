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

create table if not exists checkout_coupons (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_hint text not null,
  label text,
  status text not null default 'active',
  created_by text,
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_order_id uuid,
  metadata jsonb not null default '{}'::jsonb,
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

create table if not exists checkout_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid references checkout_coupons(id) on delete set null,
  customer_id uuid references customers(id) on delete set null,
  order_id uuid references paid_orders(id) on delete set null,
  session_id uuid references onboarding_sessions(id) on delete set null,
  code_hint text not null,
  customer_email text,
  plan text not null default 'single',
  original_amount_cents integer not null default 0,
  waived_amount_cents integer not null default 0,
  currency text not null default 'usd',
  email_status text,
  status text not null default 'redeemed',
  metadata jsonb not null default '{}'::jsonb,
  redeemed_at timestamptz not null default now()
);

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
  add column if not exists onboarding_step text;

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
create index if not exists idx_checkout_coupons_status on checkout_coupons(status, expires_at);
create index if not exists idx_checkout_coupon_redemptions_coupon_id on checkout_coupon_redemptions(coupon_id);
create index if not exists idx_checkout_coupon_redemptions_redeemed_at on checkout_coupon_redemptions(redeemed_at);
create index if not exists idx_vacation_requests_trip_id on vacation_requests(trip_id);
create index if not exists idx_vacation_requests_status on vacation_requests(status);
create index if not exists idx_vacation_requests_timing on vacation_requests(received_at, completed_at);
create index if not exists idx_worker_jobs_claim on worker_jobs(status, run_after, priority, created_at);
create index if not exists idx_worker_jobs_request_id on worker_jobs(request_id);
create index if not exists idx_transcript_turns_trip_id on transcript_turns(trip_id, created_at);
create index if not exists idx_trip_things_trip_category on trip_things(trip_id, category, subtype);
create index if not exists idx_budget_items_trip_id on budget_items(trip_id);
create index if not exists idx_paid_orders_customer_id on paid_orders(customer_id);
create index if not exists idx_onboarding_sessions_customer_id on onboarding_sessions(customer_id);
create index if not exists idx_onboarding_sessions_token on onboarding_sessions(token);
create index if not exists idx_onboarding_clicks_session_id on onboarding_clicks(session_id, clicked_at);
create index if not exists idx_outbound_emails_status on outbound_emails(status, created_at);
create index if not exists idx_telegram_sessions_customer_id on telegram_sessions(customer_id);
create index if not exists idx_transcript_turns_telegram_session_id on transcript_turns(telegram_session_id, created_at);
