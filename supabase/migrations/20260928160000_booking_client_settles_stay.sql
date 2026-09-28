-- Séjour réglé sur la carte du client : le montant du séjour sort du grand livre.
alter table public.crm_bookings
  add column if not exists client_settles_stay boolean not null default false;

comment on column public.crm_bookings.client_settles_stay is
  'Si true, l''hôtel est payé sur la carte du client. Le montant du séjour et les cartes qui le composent ne vont ni aux transactions ni à l''encours. Frais d''agence, billeterie, dépenses libres et extras inclus restent.';
