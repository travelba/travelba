-- Réservations hôtels autonomes : avis agence, demande de lien, file de paiement.
-- Aucun PAN, aucune expiration, aucun cryptogramme. Quatre derniers chiffres seulement.
-- Les interrupteurs naissent éteints. À jouer à la main.

create table if not exists public.crm_hotel_auto_settings (
  id integer primary key default 1 check (id = 1),
  auto_hotel_pay_request boolean not null default false,
  auto_hotel_charge_enabled boolean not null default false,
  auto_hotel_charge_max_cents integer not null default 200000 check (
    auto_hotel_charge_max_cents between 100 and 5000000
  ),
  updated_at timestamptz not null default now()
);

insert into public.crm_hotel_auto_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.crm_hotel_notice_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  kind text not null check (kind in ('confirmed', 'failed', 'cancelled')),
  stay_id uuid,
  booking_id uuid,
  reference text,
  client_name text,
  hotel_name text,
  dates text,
  subject text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_hotel_notice_outbox_status_idx
  on public.crm_hotel_notice_outbox (status, next_attempt_at);

create table if not exists public.crm_hotel_charge_jobs (
  id uuid primary key default gen_random_uuid(),
  booking_item_id uuid not null unique references public.crm_booking_items (id) on delete cascade,
  booking_id uuid,
  arrival_id uuid,
  payment_url text not null,
  amount_cents integer not null,
  currency text not null default 'EUR',
  pliant_card_id text,
  card_last4 text,
  card_limit_cents integer,
  status text not null default 'queued' check (status in (
    'queued', 'running', 'submitted', 'paid', 'needs_agent', 'stopped', 'failed'
  )),
  reason text,
  screenshot_path text,
  reference text,
  hotel_name text,
  client_name text,
  dates text,
  attempts integer not null default 0,
  claimed_at timestamptz,
  paid_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_hotel_charge_jobs_last4_check check (card_last4 is null or card_last4 ~ '^[0-9]{4}$')
);

create index if not exists crm_hotel_charge_jobs_status_idx
  on public.crm_hotel_charge_jobs (status, created_at desc);

alter table public.crm_agency_alerts drop constraint if exists crm_agency_alerts_kind_check;
alter table public.crm_agency_alerts
  add constraint crm_agency_alerts_kind_check
  check (kind in (
    'passport_reveal',
    'card_reveal',
    'export',
    'payment',
    'refund',
    'failed_login',
    'role_change',
    'pliant',
    'hotel_booking'
  ));

revoke all on public.crm_hotel_auto_settings from anon, public;
revoke all on public.crm_hotel_notice_outbox from anon, public;
revoke all on public.crm_hotel_charge_jobs from anon, public;
grant select on public.crm_hotel_auto_settings to authenticated;
grant select on public.crm_hotel_notice_outbox to authenticated;
grant select on public.crm_hotel_charge_jobs to authenticated;

alter table public.crm_hotel_auto_settings enable row level security;
alter table public.crm_hotel_notice_outbox enable row level security;
alter table public.crm_hotel_charge_jobs enable row level security;

drop policy if exists crm_hotel_auto_settings_staff on public.crm_hotel_auto_settings;
create policy crm_hotel_auto_settings_staff on public.crm_hotel_auto_settings
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_hotel_notice_outbox_staff on public.crm_hotel_notice_outbox;
create policy crm_hotel_notice_outbox_staff on public.crm_hotel_notice_outbox
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_hotel_charge_jobs_staff on public.crm_hotel_charge_jobs;
create policy crm_hotel_charge_jobs_staff on public.crm_hotel_charge_jobs
  for select to authenticated
  using (crm_private.is_staff());
