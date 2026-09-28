-- Commission d’agence : opt-in par voyage, 10 % du montant du séjour.
alter table public.crm_bookings
  add column if not exists agency_commission boolean not null default false;

comment on column public.crm_bookings.agency_commission is
  'Si true, un débit « Frais d''agence 10 % » (10 % du montant du séjour) est ajouté aux dépenses du dossier. Le virement reçu reste crédité en entier.';
