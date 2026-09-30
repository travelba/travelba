-- Frais d’agence et dépenses : même facture que le séjour, ou l’autre mention.
alter table public.crm_bookings
  add column if not exists fees_follow_stay boolean not null default true;

comment on column public.crm_bookings.fees_follow_stay is
  'true = frais et dépenses suivent la facture du séjour. false = ils portent l’autre mention (facture société ou sans facture société).';
