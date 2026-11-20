-- Facture groupée : un PDF pro forma pour plusieurs dossiers du même payeur.
-- Le fichier est déposé sur chaque dossier (crm_booking_documents), masqué au client.
-- Le retrait pose removed_at : la ligne et le fichier restent, la restauration les rouvre.
-- À jouer à la main. Ne pas appliquer depuis l’agent.

create table if not exists public.crm_grouped_invoices (
  id uuid primary key,
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  payer_kind text not null check (payer_kind in ('company', 'personal')),
  billing_company_id uuid references public.crm_billing_companies (id) on delete set null,
  number text not null,
  storage_path text not null,
  content_sha256 text,
  total_amount numeric(12, 2) not null,
  paid_amount numeric(12, 2) not null,
  balance_amount numeric(12, 2) not null,
  currency text not null default 'EUR',
  removed_at timestamptz,
  created_by uuid references public.crm_staff (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_grouped_invoices_number_uidx
  on public.crm_grouped_invoices (number);

create index if not exists crm_grouped_invoices_customer_idx
  on public.crm_grouped_invoices (customer_id, created_at desc);

create table if not exists public.crm_grouped_invoice_bookings (
  grouped_invoice_id uuid not null references public.crm_grouped_invoices (id) on delete cascade,
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  document_id uuid references public.crm_booking_documents (id) on delete set null,
  primary key (grouped_invoice_id, booking_id)
);

create index if not exists crm_grouped_invoice_bookings_booking_idx
  on public.crm_grouped_invoice_bookings (booking_id);

drop trigger if exists trg_crm_grouped_invoices_updated on public.crm_grouped_invoices;
create trigger trg_crm_grouped_invoices_updated
  before update on public.crm_grouped_invoices
  for each row execute function public.crm_set_updated_at();

grant select, insert, update, delete on public.crm_grouped_invoices to authenticated, service_role;
grant select, insert, update, delete on public.crm_grouped_invoice_bookings to authenticated, service_role;
revoke all on public.crm_grouped_invoices from anon;
revoke all on public.crm_grouped_invoice_bookings from anon;

alter table public.crm_grouped_invoices enable row level security;
alter table public.crm_grouped_invoice_bookings enable row level security;

drop policy if exists crm_grouped_invoices_staff on public.crm_grouped_invoices;
create policy crm_grouped_invoices_staff on public.crm_grouped_invoices
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_grouped_invoice_bookings_staff on public.crm_grouped_invoice_bookings;
create policy crm_grouped_invoice_bookings_staff on public.crm_grouped_invoice_bookings
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

comment on table public.crm_grouped_invoices is
  'Facture pro forma groupée. Jamais une pièce MB3M imprimée ou validée. removed_at retire sans effacer.';
comment on table public.crm_grouped_invoice_bookings is
  'Dossiers d’une facture groupée et le justificatif déposé sur chacun, masqué au client.';
