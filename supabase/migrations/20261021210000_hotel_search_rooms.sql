-- Occupation réelle de la recherche hôtel : chambres, adultes, âges des enfants.
-- Le devis dépend de cette occupation, plus seulement du nombre d’adultes.

alter table public.crm_hotel_search_offers
  add column if not exists rooms jsonb;

alter table public.crm_hotel_search_requests
  add column if not exists rooms jsonb;

update public.crm_hotel_search_offers
set rooms = jsonb_build_array(jsonb_build_object('adults', adults, 'children', '[]'::jsonb))
where rooms is null;

update public.crm_hotel_search_requests
set rooms = jsonb_build_array(jsonb_build_object('adults', adults, 'children', '[]'::jsonb))
where rooms is null;

alter table public.crm_hotel_search_offers
  alter column rooms set default '[{"adults":2,"children":[]}]'::jsonb,
  alter column rooms set not null;

alter table public.crm_hotel_search_requests
  alter column rooms set default '[{"adults":2,"children":[]}]'::jsonb,
  alter column rooms set not null;

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_rooms_check;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_rooms_check
  check (jsonb_typeof(rooms) = 'array' and jsonb_array_length(rooms) between 1 and 4);

alter table public.crm_hotel_search_requests
  drop constraint if exists crm_hotel_search_requests_rooms_check;
alter table public.crm_hotel_search_requests
  add constraint crm_hotel_search_requests_rooms_check
  check (jsonb_typeof(rooms) = 'array' and jsonb_array_length(rooms) between 1 and 4);

alter table public.crm_hotel_search_offers
  add column if not exists occupancy_key text;

update public.crm_hotel_search_offers
set occupancy_key = adults::text || ':'
where occupancy_key is null;

alter table public.crm_hotel_search_offers
  alter column occupancy_key set not null;

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_customer_id_hotel_key_check_in_chec_key;

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_quote_key;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_quote_key
  unique (customer_id, hotel_key, check_in, check_out, occupancy_key);

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_adults_check;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_adults_check check (adults between 1 and 24);

alter table public.crm_hotel_search_requests
  drop constraint if exists crm_hotel_search_requests_adults_check;
alter table public.crm_hotel_search_requests
  add constraint crm_hotel_search_requests_adults_check check (adults between 1 and 24);
