-- Sépare les pièces de la base partners (test) de celles de la base agence (production).
-- Un numéro ou un uid créé sur l’une n’existe pas sur l’autre.

alter table public.crm_mb3m_pieces
  add column if not exists realm text not null default 'test';

alter table public.crm_mb3m_pieces
  drop constraint if exists crm_mb3m_pieces_realm_check;

alter table public.crm_mb3m_pieces
  add constraint crm_mb3m_pieces_realm_check check (realm in ('test', 'production'));

drop index if exists public.crm_mb3m_pieces_invoice_booking_uidx;

create unique index if not exists crm_mb3m_pieces_invoice_booking_realm_uidx
  on public.crm_mb3m_pieces (booking_id, realm)
  where kind = 'invoice';

alter table public.crm_mb3m_account_invoices
  add column if not exists realm text not null default 'test';

alter table public.crm_mb3m_account_invoices
  drop constraint if exists crm_mb3m_account_invoices_realm_check;

alter table public.crm_mb3m_account_invoices
  add constraint crm_mb3m_account_invoices_realm_check check (realm in ('test', 'production'));

drop index if exists public.crm_mb3m_account_invoices_open_uidx;

create unique index if not exists crm_mb3m_account_invoices_open_uidx
  on public.crm_mb3m_account_invoices (
    customer_id,
    coalesce(billing_company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    realm
  )
  where printed_at is null;

alter table public.crm_mb3m_account_lines
  add column if not exists realm text not null default 'test';

alter table public.crm_mb3m_account_lines
  drop constraint if exists crm_mb3m_account_lines_realm_check;

alter table public.crm_mb3m_account_lines
  add constraint crm_mb3m_account_lines_realm_check check (realm in ('test', 'production'));

drop index if exists public.crm_mb3m_account_lines_transaction_uidx;

create unique index if not exists crm_mb3m_account_lines_transaction_realm_uidx
  on public.crm_mb3m_account_lines (transaction_id, realm);
