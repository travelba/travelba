-- Facture MB3M ouverte par compte. Pas de second débit : les lignes suivent le grand livre.

create table if not exists public.crm_mb3m_account_invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  billing_company_id uuid references public.crm_billing_companies (id) on delete set null,
  customer_uid text,
  folder_id text,
  folder_uid text,
  piece_number text,
  piece_uid text,
  printed_at timestamptz,
  storage_path text,
  balance numeric(12,2),
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_mb3m_account_invoices_open_uidx
  on public.crm_mb3m_account_invoices (
    customer_id,
    coalesce(billing_company_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where printed_at is null;

create table if not exists public.crm_mb3m_account_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.crm_mb3m_account_invoices (id) on delete cascade,
  transaction_id uuid not null references public.crm_transactions (id) on delete cascade,
  label text not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create unique index if not exists crm_mb3m_account_lines_transaction_uidx
  on public.crm_mb3m_account_lines (transaction_id);

alter table public.crm_mb3m_account_invoices enable row level security;
alter table public.crm_mb3m_account_lines enable row level security;

revoke all on public.crm_mb3m_account_invoices from anon, authenticated;
revoke all on public.crm_mb3m_account_lines from anon, authenticated;
grant all on public.crm_mb3m_account_invoices to service_role;
grant all on public.crm_mb3m_account_lines to service_role;
