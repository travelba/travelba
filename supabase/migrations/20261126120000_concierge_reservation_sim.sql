-- Simulation du concierge sur des réservations. Lecture seule côté métier.
-- Aucun message, aucune demande client. À jouer à la main.
-- source est figé : simulation_reservations.

create table if not exists public.crm_concierge_reservation_sims (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  batch_key text not null,
  source text not null default 'simulation_reservations',
  booking_reference text not null,
  phase text not null,
  kind text not null,
  mode text not null,
  client_text text not null default '',
  reply text not null default '',
  ok boolean not null default false,
  summary text not null default '',
  created_at timestamptz not null default now(),
  constraint crm_concierge_reservation_sims_source_check
    check (source = 'simulation_reservations'),
  constraint crm_concierge_reservation_sims_mode_check
    check (mode in ('router', 'engine')),
  constraint crm_concierge_reservation_sims_text_len
    check (char_length(client_text) <= 800 and char_length(reply) <= 800),
  unique (batch_key, booking_reference, kind, mode)
);

comment on table public.crm_concierge_reservation_sims is
  'Résultats de simulation. source = simulation_reservations. Pas de passeport, pas de naissance, pas de MRZ. Aucun envoi.';

create index if not exists crm_concierge_reservation_sims_batch_idx
  on public.crm_concierge_reservation_sims (batch_id, phase, kind);

alter table public.crm_concierge_reservation_sims enable row level security;

revoke all on public.crm_concierge_reservation_sims from anon;
grant select, insert, update, delete on public.crm_concierge_reservation_sims to authenticated;
grant all on public.crm_concierge_reservation_sims to service_role;

drop policy if exists crm_concierge_reservation_sims_staff on public.crm_concierge_reservation_sims;
create policy crm_concierge_reservation_sims_staff on public.crm_concierge_reservation_sims
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
