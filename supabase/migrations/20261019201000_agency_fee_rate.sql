-- Commission d’agence sur le compte et sur le dossier.
-- Null sur le compte = 10 %. Null sur le dossier = le taux du compte facturé.
-- Choix : 10 %, 7,5 %, 5 %. La case agency_commission reste l’interrupteur.
-- Le client authentifié n’a pas le grant de cette colonne (fiche : service role).

alter table public.crm_customers
  add column if not exists agency_fee_rate numeric(5, 4);

alter table public.crm_customers
  drop constraint if exists crm_customers_agency_fee_rate_check;

alter table public.crm_customers
  add constraint crm_customers_agency_fee_rate_check
  check (agency_fee_rate is null or agency_fee_rate in (0.1000, 0.0750, 0.0500));

comment on column public.crm_customers.agency_fee_rate is
  'Taux de commission d’agence du compte. Null = 10 %. Choix : 0.1000, 0.0750, 0.0500. Un dossier peut déroger. Pas d’écriture client.';

alter table public.crm_bookings
  add column if not exists agency_fee_rate numeric(5, 4);

alter table public.crm_bookings
  drop constraint if exists crm_bookings_agency_fee_rate_check;

alter table public.crm_bookings
  add constraint crm_bookings_agency_fee_rate_check
  check (agency_fee_rate is null or agency_fee_rate in (0.1000, 0.0750, 0.0500));

comment on column public.crm_bookings.agency_fee_rate is
  'Dérogation du dossier. Null = taux du compte facturé, sinon 10 %. Jamais montré au client.';

comment on column public.crm_bookings.agency_commission is
  'Si true, un débit « Commission d’agence » est ajouté. Le taux est agency_fee_rate du dossier, sinon celui du compte, sinon 10 %.';
