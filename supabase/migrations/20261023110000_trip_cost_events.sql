-- Journal des rattachements de coûts (Pliant, Revolut).
-- Qui, quand, dossier d’origine, dossier d’arrivée.
-- Pas de numéro de carte, pas de PAN, pas de cryptogramme.
-- Pas de clé étrangère : la ligne reste si le dossier ou l’agent disparaît.

create table if not exists public.crm_trip_cost_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  staff_id uuid,
  actor text,
  action text not null,
  source text not null,
  source_id text not null,
  from_booking_id uuid,
  to_booking_id uuid,
  from_item_id uuid,
  to_item_id uuid,
  from_reference text,
  to_reference text,
  note text,
  constraint crm_trip_cost_events_action_check
    check (action in ('attach', 'detach', 'move', 'refuse', 'correction')),
  constraint crm_trip_cost_events_source_check
    check (source in ('pliant', 'revolut')),
  constraint crm_trip_cost_events_actor_len
    check (actor is null or char_length(actor) <= 80),
  constraint crm_trip_cost_events_note_len
    check (note is null or char_length(note) <= 500),
  constraint crm_trip_cost_events_source_id_len
    check (char_length(source_id) between 1 and 80),
  constraint crm_trip_cost_events_from_reference_len
    check (from_reference is null or char_length(from_reference) <= 80),
  constraint crm_trip_cost_events_to_reference_len
    check (to_reference is null or char_length(to_reference) <= 80)
);

comment on table public.crm_trip_cost_events is
  'Rattachements de coûts Pliant et Revolut. Qui, quand, dossier d’origine, dossier d’arrivée. Sans numéro de carte.';

create index if not exists crm_trip_cost_events_source_idx
  on public.crm_trip_cost_events (source, source_id, created_at desc);

create index if not exists crm_trip_cost_events_created_idx
  on public.crm_trip_cost_events (created_at desc);

alter table public.crm_trip_cost_events enable row level security;

revoke all on public.crm_trip_cost_events from anon, authenticated;
grant all on public.crm_trip_cost_events to service_role;
