-- Pièces cochées pour le pré-check-in. Jamais de carte bancaire ici.

alter table public.crm_hotel_requests
  add column if not exists identity_document_ids uuid[] not null default '{}',
  add column if not exists identity_picked boolean not null default false;

comment on column public.crm_hotel_requests.identity_document_ids is
  'Pièces d''identité cochées pour le pré-check-in. Aucun numéro de carte.';
