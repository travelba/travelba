-- Choix agent : comptabiliser (ou non) une dépense au grand livre / encours.
alter table public.crm_bookings
  add column if not exists include_in_ledger boolean not null default true;

alter table public.crm_booking_items
  add column if not exists include_in_ledger boolean not null default false;

comment on column public.crm_bookings.include_in_ledger is
  'Si false, le montant du séjour n''est pas posté au grand livre (transactions / encours).';

comment on column public.crm_booking_items.include_in_ledger is
  'Si true, le prix vendu de la carte est posté au grand livre (transactions / encours).';
