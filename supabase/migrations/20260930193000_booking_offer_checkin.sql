-- Enregistrement : proposé seulement si l’agence l’active sur le dossier.
alter table public.crm_bookings
  add column if not exists offer_checkin boolean not null default false;

comment on column public.crm_bookings.offer_checkin is
  'Si true, l’enregistrement est proposé dans cette réservation. Défaut : non.';
