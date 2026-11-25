-- Remise commerciale du dossier. Non appliquée par l’agent : à jouer sur Supabase.
-- amount = euros. percent = pourcentage de 0 à 100, après commissions et frais.

alter table public.crm_bookings
  add column if not exists remise_type text,
  add column if not exists remise_value numeric(12, 2);

alter table public.crm_bookings
  drop constraint if exists crm_bookings_remise_check;

alter table public.crm_bookings
  add constraint crm_bookings_remise_check
  check (
    (remise_type is null and remise_value is null)
    or (remise_type = 'amount' and remise_value is not null and remise_value >= 0)
    or (remise_type = 'percent' and remise_value is not null and remise_value >= 0 and remise_value <= 100)
  );

comment on column public.crm_bookings.remise_type is
  'Remise commerciale : amount (euros) ou percent (0 à 100). Null : pas de remise.';

comment on column public.crm_bookings.remise_value is
  'Valeur de la remise commerciale. Appliquée au total TTC après commissions et frais. Le total ne descend pas sous zéro.';
