-- File de rapprochement Stripe, même garde que Revolut : service_role seulement.

create table if not exists public.crm_stripe_transactions (
  id uuid primary key default gen_random_uuid(),
  stripe_payment_intent_id text not null unique,
  amount numeric(12,2) not null,
  currency text not null,
  direction text not null default 'credit',
  payer_name text,
  payer_email text,
  reference text,
  method text,
  last4 text,
  booked_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  matched_customer_id uuid references public.crm_customers (id) on delete set null,
  matched_transaction_id uuid references public.crm_transactions (id) on delete set null,
  status text not null default 'unmatched',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_stripe_transactions
  drop constraint if exists crm_stripe_transactions_direction_check;
alter table public.crm_stripe_transactions
  add constraint crm_stripe_transactions_direction_check
  check (direction in ('credit', 'debit'));

alter table public.crm_stripe_transactions
  drop constraint if exists crm_stripe_transactions_method_check;
alter table public.crm_stripe_transactions
  add constraint crm_stripe_transactions_method_check
  check (method is null or method in ('card', 'apple_pay', 'sepa', 'other'));

alter table public.crm_stripe_transactions
  drop constraint if exists crm_stripe_transactions_status_check;
alter table public.crm_stripe_transactions
  add constraint crm_stripe_transactions_status_check
  check (status in ('unmatched', 'matched', 'ignored'));

create index if not exists crm_stripe_transactions_status_direction_idx
  on public.crm_stripe_transactions (status, direction);

create index if not exists crm_stripe_transactions_matched_customer_idx
  on public.crm_stripe_transactions (matched_customer_id);

drop trigger if exists trg_crm_stripe_transactions_updated on public.crm_stripe_transactions;
create trigger trg_crm_stripe_transactions_updated
  before update on public.crm_stripe_transactions
  for each row execute function public.crm_set_updated_at();

alter table public.crm_stripe_transactions enable row level security;

revoke all on public.crm_stripe_transactions from anon, authenticated;
grant all on public.crm_stripe_transactions to service_role;
