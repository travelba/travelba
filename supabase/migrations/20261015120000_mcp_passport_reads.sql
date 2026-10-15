-- Journal des lectures MCP de passeports (émission de billets).
-- Qui, quand, quel client ou dossier. Jamais le numéro, le nom, la MRZ ou le fichier.
-- Pas de clé étrangère : la ligne reste si la fiche est supprimée, et un identifiant
-- demandé puis introuvable peut être noté. Écriture service_role. Lecture staff.

create table if not exists public.crm_mcp_passport_reads (
  id uuid primary key default gen_random_uuid(),
  actor text not null check (char_length(actor) between 1 and 40),
  customer_id uuid,
  booking_id uuid,
  reference text check (reference is null or char_length(reference) <= 80),
  outcome text not null check (outcome in ('ok', 'refuse', 'introuvable', 'invalide', 'choix', 'erreur')),
  traveler_count integer not null default 0 check (traveler_count >= 0),
  created_at timestamptz not null default now()
);

comment on table public.crm_mcp_passport_reads is
  'Consultations de passeport_voyageur. Acteur, client, dossier. Sans numéro de pièce.';

create index if not exists crm_mcp_passport_reads_created_idx
  on public.crm_mcp_passport_reads (created_at desc);

create index if not exists crm_mcp_passport_reads_customer_idx
  on public.crm_mcp_passport_reads (customer_id, created_at desc);

alter table public.crm_mcp_passport_reads enable row level security;

revoke all on public.crm_mcp_passport_reads from anon, authenticated, public;
grant select on public.crm_mcp_passport_reads to authenticated;
grant all on public.crm_mcp_passport_reads to service_role;

drop policy if exists crm_mcp_passport_reads_staff on public.crm_mcp_passport_reads;
create policy crm_mcp_passport_reads_staff on public.crm_mcp_passport_reads
  for select to authenticated
  using (crm_private.is_staff());
