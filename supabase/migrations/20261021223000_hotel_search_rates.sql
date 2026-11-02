-- Un tarif choisi (chambre + plan) est une offre distincte. Les voyageurs de la demande y sont joints.

alter table public.crm_hotel_search_offers
  add column if not exists room_key text,
  add column if not exists rate_key text,
  add column if not exists rate_title text,
  add column if not exists cancellation_policy text;

update public.crm_hotel_search_offers set room_key = '' where room_key is null;
update public.crm_hotel_search_offers set rate_key = '' where rate_key is null;

alter table public.crm_hotel_search_offers
  alter column room_key set default '',
  alter column room_key set not null,
  alter column rate_key set default '',
  alter column rate_key set not null;

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_room_key_check;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_room_key_check check (char_length(room_key) <= 60);

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_rate_key_check;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_rate_key_check check (char_length(rate_key) <= 80);

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_quote_key;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_quote_key
  unique (customer_id, hotel_key, check_in, check_out, occupancy_key, room_key, rate_key);

alter table public.crm_hotel_search_requests
  add column if not exists guests jsonb,
  add column if not exists rate_title text,
  add column if not exists cancellation_policy text;

update public.crm_hotel_search_requests set guests = '[]'::jsonb where guests is null;

alter table public.crm_hotel_search_requests
  alter column guests set default '[]'::jsonb,
  alter column guests set not null;

alter table public.crm_hotel_search_requests
  drop constraint if exists crm_hotel_search_requests_guests_check;
alter table public.crm_hotel_search_requests
  add constraint crm_hotel_search_requests_guests_check
  check (jsonb_typeof(guests) = 'array' and jsonb_array_length(guests) <= 4);
