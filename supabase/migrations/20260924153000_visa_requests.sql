create table if not exists public.crm_visa_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  country text not null check (country in ('IL', 'US', 'GB')),
  status text not null default 'en_cours' check (status in ('en_cours', 'paye', 'refuse', 'piece')),
  answers jsonb not null default '{}'::jsonb,
  pay_attempts integer not null default 0,
  pliant_transaction_id text,
  paid_cents integer,
  created_at timestamptz not null default now(),
  unique (booking_id, country)
);

create table if not exists public.crm_visa_cards (
  booking_id uuid primary key references public.crm_bookings (id) on delete cascade,
  pliant_card_id text not null,
  ceiling_cents integer not null,
  countries text[] not null default '{}',
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_visa_notices (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  traveler_key text not null,
  kind text not null check (kind in ('piece', 'refus')),
  country text not null,
  holder_name text not null,
  sent_at timestamptz,
  first_failure_on date,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  unique (booking_id, traveler_key, kind, country)
);

alter table public.crm_visa_requests enable row level security;
alter table public.crm_visa_cards enable row level security;
alter table public.crm_visa_notices enable row level security;

drop policy if exists crm_visa_requests_staff on public.crm_visa_requests;
create policy crm_visa_requests_staff on public.crm_visa_requests
  for all using (crm_private.is_staff()) with check (crm_private.is_staff());

drop policy if exists crm_visa_requests_client on public.crm_visa_requests;
create policy crm_visa_requests_client on public.crm_visa_requests
  for select using (
    exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.visible_to_client
    )
  );

drop policy if exists crm_visa_cards_staff on public.crm_visa_cards;
create policy crm_visa_cards_staff on public.crm_visa_cards
  for all using (crm_private.is_staff()) with check (crm_private.is_staff());

drop policy if exists crm_visa_notices_staff on public.crm_visa_notices;
create policy crm_visa_notices_staff on public.crm_visa_notices
  for all using (crm_private.is_staff()) with check (crm_private.is_staff());
