-- Propositions d’import : confiance par champ, diff réversible.
-- Aucune réécriture des dossiers déjà en place.

alter table public.crm_email_ingest
  add column if not exists field_confidence numeric;

alter table public.crm_email_ingest
  add column if not exists field_quotes jsonb not null default '[]'::jsonb;

create table if not exists public.crm_import_proposals (
  id uuid primary key default gen_random_uuid(),
  email_ingest_id uuid references public.crm_email_ingest (id) on delete cascade,
  booking_id uuid references public.crm_bookings (id) on delete set null,
  confidence numeric,
  conflict boolean not null default false,
  ops jsonb not null default '[]'::jsonb,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_import_proposals_ingest_idx
  on public.crm_import_proposals (email_ingest_id, created_at desc);

alter table public.crm_import_proposals enable row level security;

drop policy if exists crm_import_proposals_staff on public.crm_import_proposals;
create policy crm_import_proposals_staff on public.crm_import_proposals
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

grant select, insert, update on public.crm_import_proposals to authenticated;
