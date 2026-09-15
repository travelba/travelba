-- New Travelba CRM schema. Existing agency_* tables remain in place because
-- they power the voyage/mTrip product independently of this CRM.

create extension if not exists pgcrypto;

create schema if not exists crm_private;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.crm_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.crm_staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users (id) on delete cascade,
  role text not null default 'agent' check (role in ('admin', 'agent')),
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  first_name text not null default '',
  last_name text not null default '',
  email text not null unique,
  phone text,
  whatsapp text,
  birth_date date,
  nationality text,
  address_line text,
  postal_code text,
  city text,
  country text,
  language text not null default 'fr',
  stripe_customer_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_travel_companions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  birth_date date,
  sex text,
  nationality text,
  relationship text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_travel_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  companion_id uuid references public.crm_travel_companions (id) on delete cascade,
  doc_type text not null check (doc_type in ('passport', 'id_card', 'visa', 'insurance', 'other')),
  number text,
  issuing_country text,
  issued_on date,
  expires_on date,
  storage_path text,
  file_name text,
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete restrict,
  reference text not null unique,
  title text not null,
  destination text,
  status text not null default 'draft'
    check (status in ('draft', 'quoted', 'confirmed', 'travelling', 'completed', 'cancelled')),
  start_date date,
  end_date date,
  currency text not null default 'EUR',
  total_amount numeric(12,2) not null default 0,
  cover_image_path text,
  notes_client text,
  notes_internal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  kind text not null check (kind in ('flight', 'hotel', 'transfer', 'activity', 'insurance', 'fee')),
  title text not null,
  supplier text,
  confirmation_ref text,
  start_at timestamptz,
  end_at timestamptz,
  amount numeric(12,2),
  sort_order int not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_booking_travelers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  companion_id uuid references public.crm_travel_companions (id) on delete set null,
  is_account_holder boolean not null default false,
  first_name text,
  last_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_booking_documents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  kind text not null default 'other',
  file_name text,
  mime_type text,
  storage_path text not null,
  visible_to_client boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete restrict,
  booking_id uuid references public.crm_bookings (id) on delete set null,
  direction text not null check (direction in ('debit', 'credit')),
  kind text not null check (kind in ('booking', 'transfer', 'refund', 'adjustment', 'card_payment')),
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null default 'EUR',
  occurred_on date not null default (now() at time zone 'utc')::date,
  label text not null default '',
  source text not null default 'manual' check (source in ('manual', 'revolut', 'stripe')),
  external_id text,
  status text not null default 'posted' check (status in ('pending', 'posted', 'void')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_transactions_source_external_uidx
  on public.crm_transactions (source, external_id)
  where external_id is not null;

create table if not exists public.crm_payment_methods (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  stripe_payment_method_id text not null unique,
  brand text,
  last4 text,
  exp_month int,
  exp_year int,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_revolut_transactions (
  id uuid primary key default gen_random_uuid(),
  revolut_transaction_id text not null unique,
  amount numeric(12,2) not null,
  currency text not null,
  counterparty_name text,
  counterparty_iban text,
  reference text,
  booked_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  matched_customer_id uuid references public.crm_customers (id) on delete set null,
  matched_transaction_id uuid references public.crm_transactions (id) on delete set null,
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'ignored')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_integrations (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  extra jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_booking_seq (
  year int primary key,
  last int not null default 0
);

create or replace function public.crm_next_booking_reference()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  insert into public.crm_booking_seq (year, last)
  values (y, 1)
  on conflict (year) do update set last = public.crm_booking_seq.last + 1
  returning last into n;
  return 'TB-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$$;

revoke all on function public.crm_next_booking_reference() from public;
grant execute on function public.crm_next_booking_reference() to authenticated;
grant execute on function public.crm_next_booking_reference() to service_role;

create or replace view public.crm_customer_balances
with (security_invoker = true) as
select
  t.customer_id,
  t.currency,
  coalesce(sum(case when t.direction = 'credit' then t.amount else 0 end), 0)
    - coalesce(sum(case when t.direction = 'debit' then t.amount else 0 end), 0)
    as balance
from public.crm_transactions t
where t.status = 'posted'
group by t.customer_id, t.currency;

-- updated_at triggers
do $$
declare
  t text;
begin
  foreach t in array array[
    'crm_staff','crm_customers','crm_travel_companions','crm_travel_documents',
    'crm_bookings','crm_booking_items','crm_transactions','crm_revolut_transactions',
    'crm_integrations'
  ]
  loop
    execute format('drop trigger if exists trg_%s_updated on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated before update on public.%I for each row execute function public.crm_set_updated_at()',
      t, t
    );
  end loop;
end $$;

create or replace function crm_private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.crm_staff s
    where s.auth_user_id = auth.uid()
  );
$$;

create or replace function crm_private.customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.crm_customers c
  where c.auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function crm_private.is_staff() from public;
revoke all on function crm_private.customer_id() from public;
grant usage on schema crm_private to authenticated;
grant execute on function crm_private.is_staff() to authenticated;
grant execute on function crm_private.customer_id() to authenticated;

grant select, insert, update, delete on
  public.crm_staff,
  public.crm_customers,
  public.crm_travel_companions,
  public.crm_travel_documents,
  public.crm_bookings,
  public.crm_booking_items,
  public.crm_booking_travelers,
  public.crm_booking_documents,
  public.crm_transactions,
  public.crm_payment_methods,
  public.crm_booking_seq
to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.crm_staff enable row level security;
alter table public.crm_customers enable row level security;
alter table public.crm_travel_companions enable row level security;
alter table public.crm_travel_documents enable row level security;
alter table public.crm_bookings enable row level security;
alter table public.crm_booking_items enable row level security;
alter table public.crm_booking_travelers enable row level security;
alter table public.crm_booking_documents enable row level security;
alter table public.crm_transactions enable row level security;
alter table public.crm_payment_methods enable row level security;
alter table public.crm_revolut_transactions enable row level security;
alter table public.crm_integrations enable row level security;
alter table public.crm_booking_seq enable row level security;

-- staff: readable by staff; inserts via service role / bootstrap
drop policy if exists crm_staff_select on public.crm_staff;
create policy crm_staff_select on public.crm_staff
  for select to authenticated
  using (auth_user_id = auth.uid() or crm_private.is_staff());

-- Inserts: service_role only (bootstrap in app).

-- customers
drop policy if exists crm_customers_staff on public.crm_customers;
create policy crm_customers_staff on public.crm_customers
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_customers_self on public.crm_customers;
create policy crm_customers_self on public.crm_customers
  for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists crm_customers_self_update on public.crm_customers;
create policy crm_customers_self_update on public.crm_customers
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- companions
drop policy if exists crm_companions_staff on public.crm_travel_companions;
create policy crm_companions_staff on public.crm_travel_companions
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_companions_self on public.crm_travel_companions;
create policy crm_companions_self on public.crm_travel_companions
  for all to authenticated
  using (customer_id = crm_private.customer_id())
  with check (customer_id = crm_private.customer_id());

-- travel documents
drop policy if exists crm_travel_docs_staff on public.crm_travel_documents;
create policy crm_travel_docs_staff on public.crm_travel_documents
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_travel_docs_self on public.crm_travel_documents;
create policy crm_travel_docs_self on public.crm_travel_documents
  for all to authenticated
  using (customer_id = crm_private.customer_id())
  with check (customer_id = crm_private.customer_id());

-- bookings
drop policy if exists crm_bookings_staff on public.crm_bookings;
create policy crm_bookings_staff on public.crm_bookings
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_bookings_self on public.crm_bookings;
create policy crm_bookings_self on public.crm_bookings
  for select to authenticated
  using (customer_id = crm_private.customer_id());

-- booking items
drop policy if exists crm_booking_items_staff on public.crm_booking_items;
create policy crm_booking_items_staff on public.crm_booking_items
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_booking_items_self on public.crm_booking_items;
create policy crm_booking_items_self on public.crm_booking_items
  for select to authenticated
  using (
    exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id and b.customer_id = crm_private.customer_id()
    )
  );

-- booking travelers
drop policy if exists crm_booking_travelers_staff on public.crm_booking_travelers;
create policy crm_booking_travelers_staff on public.crm_booking_travelers
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_booking_travelers_self on public.crm_booking_travelers;
create policy crm_booking_travelers_self on public.crm_booking_travelers
  for select to authenticated
  using (
    exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id and b.customer_id = crm_private.customer_id()
    )
  );

-- booking documents
drop policy if exists crm_booking_docs_staff on public.crm_booking_documents;
create policy crm_booking_docs_staff on public.crm_booking_documents
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_booking_docs_self on public.crm_booking_documents;
create policy crm_booking_docs_self on public.crm_booking_documents
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id and b.customer_id = crm_private.customer_id()
    )
  );

-- transactions
drop policy if exists crm_tx_staff on public.crm_transactions;
create policy crm_tx_staff on public.crm_transactions
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_tx_self on public.crm_transactions;
create policy crm_tx_self on public.crm_transactions
  for select to authenticated
  using (customer_id = crm_private.customer_id() and status = 'posted');

-- payment methods
drop policy if exists crm_pm_staff on public.crm_payment_methods;
create policy crm_pm_staff on public.crm_payment_methods
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_pm_self on public.crm_payment_methods;
create policy crm_pm_self on public.crm_payment_methods
  for all to authenticated
  using (customer_id = crm_private.customer_id())
  with check (customer_id = crm_private.customer_id());

-- revolut inbox + integrations: service_role only (no policies for authenticated)
drop policy if exists crm_revolut_none on public.crm_revolut_transactions;
drop policy if exists crm_integrations_none on public.crm_integrations;
drop policy if exists crm_seq_staff on public.crm_booking_seq;
create policy crm_seq_staff on public.crm_booking_seq
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

revoke all on public.crm_revolut_transactions from anon, authenticated;
revoke all on public.crm_integrations from anon, authenticated;
grant all on public.crm_revolut_transactions to service_role;
grant all on public.crm_integrations to service_role;

grant select on public.crm_customer_balances to authenticated;

-- storage bucket
insert into storage.buckets (id, name, public)
values ('crm-files', 'crm-files', false)
on conflict (id) do update set public = false;
