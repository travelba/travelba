-- Frais du dossier : 10 % du séjour, ou frais à la carte. null = ancien calcul.
alter table public.crm_bookings
  add column if not exists fee_mode text,
  add column if not exists ticketing_fee_qty integer not null default 0,
  add column if not exists transfer_fee boolean not null default false,
  add column if not exists lodging_fee boolean not null default false;

alter table public.crm_bookings
  drop constraint if exists crm_bookings_fee_mode_check;

alter table public.crm_bookings
  add constraint crm_bookings_fee_mode_check
  check (fee_mode is null or fee_mode in ('percent', 'carte'));

comment on column public.crm_bookings.fee_mode is
  'null = billeterie automatique s''il y a un vol, et commission si la case est cochée. percent = 10 % du séjour, sans frais à la carte. carte = frais cochés, sans commission.';

comment on column public.crm_bookings.ticketing_fee_qty is
  'Nombre de billets à 25 € quand fee_mode = carte. Ignoré sinon.';

comment on column public.crm_bookings.transfer_fee is
  'Forfait transfert 15 € quand fee_mode = carte.';

comment on column public.crm_bookings.lodging_fee is
  'Forfait hébergement 20 € quand fee_mode = carte.';
