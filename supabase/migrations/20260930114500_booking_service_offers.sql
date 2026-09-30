-- Chauffeur et VIP Airport : proposés seulement si l’agence les active sur le dossier.
alter table public.crm_bookings
  add column if not exists offer_chauffeur boolean not null default false,
  add column if not exists offer_greeter boolean not null default false;

comment on column public.crm_bookings.offer_chauffeur is
  'Si true, le chauffeur est proposé dans cette réservation. Défaut : non.';

comment on column public.crm_bookings.offer_greeter is
  'Si true, le VIP Airport est proposé dans cette réservation. Défaut : non.';
