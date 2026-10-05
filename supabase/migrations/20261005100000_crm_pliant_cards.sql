create table if not exists public.crm_pliant_cards (
  id uuid primary key default gen_random_uuid(),
  pliant_card_id text not null,
  customer_id uuid references public.crm_customers (id) on delete set null,
  booking_id uuid references public.crm_bookings (id) on delete set null,
  label text,
  last4 text,
  ceiling_cents integer,
  currency text not null default 'EUR',
  status text not null default 'active',
  limit_manual boolean not null default false,
  countries text[] not null default '{}',
  closed_at timestamptz,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_pliant_cards add column if not exists customer_id uuid references public.crm_customers (id) on delete set null;
alter table public.crm_pliant_cards add column if not exists currency text not null default 'EUR';
alter table public.crm_pliant_cards add column if not exists status text not null default 'active';
alter table public.crm_pliant_cards add column if not exists limit_manual boolean not null default false;
alter table public.crm_pliant_cards add column if not exists updated_at timestamptz not null default now();
alter table public.crm_pliant_cards add column if not exists ceiling_cents integer;
alter table public.crm_pliant_cards add column if not exists countries text[] not null default '{}';
alter table public.crm_pliant_cards add column if not exists closed_at timestamptz;
alter table public.crm_pliant_cards add column if not exists synced_at timestamptz;

alter table public.crm_pliant_cards alter column booking_id drop not null;
alter table public.crm_pliant_cards alter column label drop not null;

alter table public.crm_pliant_cards
  drop constraint if exists crm_pliant_cards_status_check;

alter table public.crm_pliant_cards
  add constraint crm_pliant_cards_status_check
  check (status in ('active', 'locked'));

alter table public.crm_pliant_cards
  drop constraint if exists crm_pliant_cards_last4_check;

alter table public.crm_pliant_cards
  add constraint crm_pliant_cards_last4_check
  check (last4 is null or last4 ~ '^[0-9]{4}$');

create unique index if not exists crm_pliant_cards_pliant_id_idx
  on public.crm_pliant_cards (pliant_card_id);

create index if not exists crm_pliant_cards_booking_idx
  on public.crm_pliant_cards (booking_id);

create index if not exists crm_pliant_cards_customer_idx
  on public.crm_pliant_cards (customer_id);

alter table public.crm_pliant_cards enable row level security;

revoke all on public.crm_pliant_cards from anon, authenticated, public;
grant all on public.crm_pliant_cards to service_role;

insert into public.crm_pliant_cards (
  pliant_card_id, customer_id, booking_id, last4, ceiling_cents, currency, status, limit_manual
)
select
  a.pliant_card_id,
  (array_agg(b.billing_customer_id) filter (where b.billing_customer_id is not null))[1],
  (array_agg(a.booking_id))[1],
  (array_agg(a.card_last4) filter (where a.card_last4 ~ '^[0-9]{4}$'))[1],
  nullif(sum(coalesce(a.card_limit_cents, 0)), 0),
  coalesce((array_agg(a.currency) filter (where a.currency ~ '^[A-Za-z]{3}$'))[1], 'EUR'),
  'active',
  false
from public.crm_hotel_arrivals a
join public.crm_bookings b on b.id = a.booking_id
where a.pliant_card_id is not null
  and length(trim(a.pliant_card_id)) > 0
group by a.pliant_card_id
on conflict (pliant_card_id) do nothing;

insert into public.crm_pliant_cards (
  pliant_card_id, customer_id, booking_id, ceiling_cents, currency, status, limit_manual
)
select
  v.pliant_card_id,
  b.billing_customer_id,
  v.booking_id,
  v.ceiling_cents,
  'EUR',
  'active',
  false
from public.crm_visa_cards v
join public.crm_bookings b on b.id = v.booking_id
where v.pliant_card_id is not null
  and length(trim(v.pliant_card_id)) > 0
on conflict (pliant_card_id) do nothing;

update public.crm_transactions t
set booking_id = c.booking_id
from public.crm_pliant_transactions p
join public.crm_pliant_cards c on c.pliant_card_id = p.card_id
where t.source = 'pliant'
  and t.external_id = p.pliant_transaction_id
  and t.booking_id is null
  and c.booking_id is not null;
