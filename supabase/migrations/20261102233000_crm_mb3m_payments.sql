-- Règlement MB3M d’un crédit CRM. Un crédit, un encaissement, par base.
-- Le lettrage (matched_amount) ne repart pas : SavePayment n’est pas rappelé.

create table if not exists public.crm_mb3m_payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.crm_transactions (id) on delete restrict,
  booking_id uuid references public.crm_bookings (id) on delete set null,
  realm text not null,
  mb3m_payment_number text not null,
  mb3m_invoice_number text,
  mb3m_matching_id text,
  amount numeric(12,2) not null,
  matched_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint crm_mb3m_payments_realm_check check (realm in ('test', 'production')),
  constraint crm_mb3m_payments_tx_realm_key unique (transaction_id, realm)
);

alter table public.crm_mb3m_payments enable row level security;

revoke all on public.crm_mb3m_payments from anon, authenticated;
grant all on public.crm_mb3m_payments to service_role;

-- Encaissement saisi à la main dans MB3M (règlement 2153, facture 2152).
-- Le crédit dépasse la facture : on ne pose pas le dossier. Absent ailleurs : rien n’est écrit.
insert into public.crm_mb3m_payments (
  transaction_id,
  booking_id,
  realm,
  mb3m_payment_number,
  mb3m_invoice_number,
  amount,
  matched_amount
)
select t.id, null, 'production', '2153', '2152', t.amount, t.amount
from public.crm_transactions t
where t.id = '0173733f-95a6-4115-8e49-e81cb3e875c5'
  and t.direction = 'credit'
on conflict (transaction_id, realm) do nothing;
