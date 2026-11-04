-- Jetons de réservation fournisseur, côté serveur. Jamais renvoyés au client.
-- payment_description reste en base : le texte peut nommer le fournisseur.

alter table public.crm_hotel_search_offers
  add column if not exists le_hotel_id bigint,
  add column if not exists le_session_id text,
  add column if not exists le_rate_index text,
  add column if not exists cancellation_deadline text,
  add column if not exists requires_cvc boolean,
  add column if not exists payment_description text;

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_le_session_id_check;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_le_session_id_check
  check (le_session_id is null or char_length(le_session_id) <= 120);

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_le_rate_index_check;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_le_rate_index_check
  check (le_rate_index is null or char_length(le_rate_index) <= 200);

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_payment_description_check;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_payment_description_check
  check (payment_description is null or char_length(payment_description) <= 500);

comment on column public.crm_hotel_search_offers.payment_description is
  'Texte fournisseur, serveur seulement. Jamais renvoyé au client.';

alter table public.crm_hotel_direct_stays
  add column if not exists le_booking_id bigint;

create unique index if not exists crm_hotel_direct_stays_le_booking
  on public.crm_hotel_direct_stays (le_booking_id)
  where le_booking_id is not null;
