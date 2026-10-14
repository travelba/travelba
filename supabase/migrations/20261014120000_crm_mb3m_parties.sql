-- Fiche MB3M d’un client ou d’une société, par base.
-- Une facture de dossier non imprimée à la fois : l’impression dans MB3M fige la pièce.

create table if not exists public.crm_mb3m_parties (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  billing_company_id uuid references public.crm_billing_companies (id) on delete cascade,
  realm text not null default 'test',
  mb3m_uid text not null,
  partner_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_mb3m_parties
  drop constraint if exists crm_mb3m_parties_realm_check;

alter table public.crm_mb3m_parties
  add constraint crm_mb3m_parties_realm_check check (realm in ('test', 'production'));

create unique index if not exists crm_mb3m_parties_uidx
  on public.crm_mb3m_parties (
    customer_id,
    coalesce(billing_company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    realm
  );

alter table public.crm_mb3m_parties enable row level security;

revoke all on public.crm_mb3m_parties from anon, authenticated;
grant all on public.crm_mb3m_parties to service_role;

alter table public.crm_mb3m_pieces
  add column if not exists printed_at timestamptz;

alter table public.crm_mb3m_pieces
  add column if not exists line_signature text;

alter table public.crm_mb3m_pieces
  add column if not exists transaction_ids uuid[] not null default '{}';

drop index if exists public.crm_mb3m_pieces_invoice_booking_realm_uidx;

create unique index if not exists crm_mb3m_pieces_open_invoice_uidx
  on public.crm_mb3m_pieces (booking_id, realm)
  where kind = 'invoice' and printed_at is null;
