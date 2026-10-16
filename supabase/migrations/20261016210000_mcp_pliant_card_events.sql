-- Journal des cartes Pliant créées ou lues par le MCP.
-- Dossier, identifiant Pliant, libellé, plafond, heure.
-- Jamais de PAN, d'expiration ou de cryptogramme.
-- Pas de clé étrangère : la ligne reste si le dossier est supprimé.

create table if not exists public.crm_mcp_card_events (
  id uuid primary key default gen_random_uuid(),
  actor text not null check (char_length(actor) between 1 and 40),
  customer_id uuid,
  booking_id uuid,
  reference text check (reference is null or char_length(reference) <= 80),
  pliant_card_id text check (
    pliant_card_id is null
    or (char_length(pliant_card_id) <= 80 and pliant_card_id !~ '[0-9]{12,}')
  ),
  label text check (label is null or char_length(label) <= 40),
  limit_cents integer check (limit_cents is null or limit_cents > 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  kind text not null check (kind in ('creation', 'reveal')),
  outcome text not null check (outcome in ('ok', 'refuse', 'introuvable', 'invalide', 'choix', 'erreur')),
  created_at timestamptz not null default now()
);

comment on table public.crm_mcp_card_events is
  'Créations et lectures de carte Pliant via le MCP. Sans PAN, sans expiration, sans cryptogramme.';

create index if not exists crm_mcp_card_events_created_idx
  on public.crm_mcp_card_events (created_at desc);

create index if not exists crm_mcp_card_events_booking_idx
  on public.crm_mcp_card_events (booking_id, created_at desc);

alter table public.crm_mcp_card_events enable row level security;

revoke all on public.crm_mcp_card_events from anon, authenticated, public;
grant select on public.crm_mcp_card_events to authenticated;
grant all on public.crm_mcp_card_events to service_role;

drop policy if exists crm_mcp_card_events_staff on public.crm_mcp_card_events;
create policy crm_mcp_card_events_staff on public.crm_mcp_card_events
  for select to authenticated
  using (crm_private.is_staff());
