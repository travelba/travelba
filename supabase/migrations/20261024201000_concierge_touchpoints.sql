-- Brouillons veille / arrivée / retour. status planned : rien n’est envoyé.
-- sent : l’agence a cliqué. slot distingue deux séjours du même téléphone.

alter table public.crm_concierge_followups
  add column if not exists booking_id uuid references public.crm_bookings (id) on delete set null;

alter table public.crm_concierge_followups
  add column if not exists slot text not null default '';

alter table public.crm_concierge_followups
  drop constraint if exists crm_concierge_followups_phone_kind_key;

create unique index if not exists crm_concierge_followups_phone_kind_slot_idx
  on public.crm_concierge_followups (phone, kind, slot);

alter table public.crm_concierge_followups
  drop constraint if exists crm_concierge_followups_status_check;

alter table public.crm_concierge_followups
  add constraint crm_concierge_followups_status_check
  check (status in ('planned', 'skipped', 'sent'));
