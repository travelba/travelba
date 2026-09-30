-- Qui règle le séjour : une société du compte, ou le particulier dans son espace.
alter table public.crm_bookings
  add column if not exists payer_kind text;

alter table public.crm_bookings
  drop constraint if exists crm_bookings_payer_kind_check;

alter table public.crm_bookings
  add constraint crm_bookings_payer_kind_check
  check (payer_kind is null or payer_kind in ('company', 'personal'));

comment on column public.crm_bookings.payer_kind is
  'company = société du compte ; personal = particulier. Null tant que l’agence n’a pas choisi.';
