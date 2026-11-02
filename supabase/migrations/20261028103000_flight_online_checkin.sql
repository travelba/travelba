-- Enregistrement en ligne, une ligne par vol.
-- Statut et auteur (agence ou bot). Pas de passeport, pas de MRZ.
-- Additive : aucune table existante n’est modifiée.

create table if not exists public.crm_flight_checkins (
  booking_item_id uuid primary key references public.crm_booking_items (id) on delete cascade,
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  status text not null default 'a_faire',
  actor text,
  updated_at timestamptz not null default now(),
  constraint crm_flight_checkins_status_check
    check (status in ('a_faire', 'ouvert', 'en_cours', 'fait', 'cartes_recues', 'envoyees')),
  constraint crm_flight_checkins_actor_check
    check (actor is null or actor in ('agence', 'bot'))
);

comment on table public.crm_flight_checkins is
  'Enregistrement en ligne d’un vol. Statut et auteur (agence ou bot). Sans numéro de passeport ni MRZ.';

create index if not exists crm_flight_checkins_booking_idx
  on public.crm_flight_checkins (booking_id);

alter table public.crm_flight_checkins enable row level security;

revoke all on public.crm_flight_checkins from anon;
grant select, insert, update, delete on public.crm_flight_checkins to authenticated;
grant all on public.crm_flight_checkins to service_role;

drop policy if exists crm_flight_checkins_staff on public.crm_flight_checkins;
create policy crm_flight_checkins_staff on public.crm_flight_checkins
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
