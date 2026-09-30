create table if not exists public.crm_pliant_transactions (
  id uuid primary key default gen_random_uuid(),
  pliant_transaction_id text not null unique,
  card_id text,
  status text,
  type text,
  merchant text,
  billing_cents integer,
  billing_currency text,
  transaction_cents integer,
  transaction_currency text,
  booked_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_pliant_transactions_booked_at_idx
  on public.crm_pliant_transactions (booked_at desc);

alter table public.crm_pliant_transactions enable row level security;

revoke all on public.crm_pliant_transactions from anon, authenticated;
grant all on public.crm_pliant_transactions to service_role;
