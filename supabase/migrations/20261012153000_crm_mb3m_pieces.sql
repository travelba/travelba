-- Facture MB3M d’un dossier. Pas de débit : le grand livre suit déjà « Montrer au client ».

create table if not exists public.crm_mb3m_pieces (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  kind text not null default 'invoice' check (kind in ('invoice')),
  customer_uid text,
  folder_id text,
  folder_uid text,
  piece_number text,
  piece_uid text,
  amount numeric(12,2),
  currency text not null default 'EUR',
  document_id uuid references public.crm_booking_documents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_mb3m_pieces_invoice_booking_uidx
  on public.crm_mb3m_pieces (booking_id)
  where kind = 'invoice';

alter table public.crm_mb3m_pieces enable row level security;

revoke all on public.crm_mb3m_pieces from anon, authenticated;
grant all on public.crm_mb3m_pieces to service_role;
