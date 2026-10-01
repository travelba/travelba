-- Visa : proposé seulement si l’agence l’active sur le dossier.
alter table public.crm_bookings
  add column if not exists offer_visa boolean not null default false;

comment on column public.crm_bookings.offer_visa is
  'Si true, le visa est proposé dans cette réservation. Défaut : non.';
