-- Facture Amadeus déjà dans MB3M (kind gds) et lettrage d’un crédit sur plusieurs pièces.

alter table public.crm_mb3m_pieces
  drop constraint if exists crm_mb3m_pieces_kind_check;

alter table public.crm_mb3m_pieces
  add constraint crm_mb3m_pieces_kind_check check (kind in ('invoice', 'credit_note', 'gds'));

create unique index if not exists crm_mb3m_pieces_gds_uidx
  on public.crm_mb3m_pieces (booking_id, realm, piece_number)
  where kind = 'gds';

create table if not exists public.crm_mb3m_payment_matches (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.crm_mb3m_payments (id) on delete cascade,
  mb3m_invoice_number text not null,
  mb3m_matching_id text,
  matched_amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint crm_mb3m_payment_matches_invoice_key unique (payment_id, mb3m_invoice_number)
);

alter table public.crm_mb3m_payment_matches enable row level security;

revoke all on public.crm_mb3m_payment_matches from anon, authenticated;
grant all on public.crm_mb3m_payment_matches to service_role;
