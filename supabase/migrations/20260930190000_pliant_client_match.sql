-- Rapprochement Pliant → compte client. `status` reste le statut Pliant (BOOKED, DECLINED…).

alter table public.crm_pliant_transactions
  add column if not exists match_status text not null default 'unmatched';

alter table public.crm_pliant_transactions
  drop constraint if exists crm_pliant_transactions_match_status_check;

alter table public.crm_pliant_transactions
  add constraint crm_pliant_transactions_match_status_check
  check (match_status in ('unmatched', 'matched', 'ignored'));

alter table public.crm_pliant_transactions
  add column if not exists matched_customer_id uuid references public.crm_customers (id) on delete set null;

alter table public.crm_pliant_transactions
  add column if not exists matched_transaction_id uuid references public.crm_transactions (id) on delete set null;

create index if not exists crm_pliant_transactions_match_status_idx
  on public.crm_pliant_transactions (match_status, booked_at desc);

alter table public.crm_transactions
  drop constraint if exists crm_transactions_source_check;

alter table public.crm_transactions
  add constraint crm_transactions_source_check
  check (source in ('manual', 'revolut', 'stripe', 'pliant'));
