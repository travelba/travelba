-- Crédit visible quand la couverture vient d’une photo CC BY.
alter table public.crm_bookings
  add column if not exists cover_credit text;

comment on column public.crm_bookings.cover_credit is
  'Mention photographe affichée avec la couverture importée (CC BY). Null si fichier agence ou domaine public.';
