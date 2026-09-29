-- Carte Pliant d'un dossier et dépenses synchronisées. Jamais de PAN.

create table if not exists public.crm_booking_pliant_cards (
  booking_id uuid primary key references public.crm_bookings (id) on delete cascade,
  pliant_card_id text not null,
  ceiling_cents integer not null check (ceiling_cents > 0),
  currency text not null default 'EUR',
  holder_first_name text not null,
  holder_last_name text not null,
  card_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_booking_pliant_cards_last4_check check (card_last4 is null or card_last4 ~ '^[0-9]{4}$')
);

create unique index if not exists crm_booking_pliant_cards_pliant_id
  on public.crm_booking_pliant_cards (pliant_card_id);

create table if not exists public.crm_pliant_transactions (
  id uuid primary key default gen_random_uuid(),
  pliant_transaction_id text not null,
  pliant_card_id text not null,
  booking_id uuid references public.crm_bookings (id) on delete set null,
  customer_id uuid references public.crm_customers (id) on delete set null,
  merchant text not null default '',
  type text not null,
  status text not null,
  amount_cents integer not null,
  currency text not null default 'EUR',
  booked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_pliant_transactions_external
  on public.crm_pliant_transactions (pliant_transaction_id);

create index if not exists crm_pliant_transactions_booking
  on public.crm_pliant_transactions (booking_id, booked_at desc);

create index if not exists crm_pliant_transactions_card
  on public.crm_pliant_transactions (pliant_card_id);

alter table public.crm_booking_pliant_cards enable row level security;
alter table public.crm_pliant_transactions enable row level security;

revoke all on public.crm_booking_pliant_cards from anon, authenticated;
revoke all on public.crm_pliant_transactions from anon, authenticated;
grant all on public.crm_booking_pliant_cards to service_role;
grant all on public.crm_pliant_transactions to service_role;
