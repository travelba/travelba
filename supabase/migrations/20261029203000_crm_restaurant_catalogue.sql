-- Catalogue visuel des restaurants, pour le carrousel WhatsApp.
-- Additive. À jouer à la main après 20261029120000_crm_restaurants.sql.
-- Le dépôt ne l’applique pas.

alter table public.crm_restaurants
  add column if not exists photo_urls text[] not null default '{}',
  add column if not exists menu_photo_url text,
  add column if not exists signature_photo_url text,
  add column if not exists concierge_pitch text,
  add column if not exists price_band text,
  add column if not exists place_url text;

alter table public.crm_restaurants
  drop constraint if exists crm_restaurants_photos_check;
alter table public.crm_restaurants
  add constraint crm_restaurants_photos_check
  check (cardinality(photo_urls) <= 8);

alter table public.crm_restaurants
  drop constraint if exists crm_restaurants_menu_photo_check;
alter table public.crm_restaurants
  add constraint crm_restaurants_menu_photo_check
  check (menu_photo_url is null or char_length(menu_photo_url) <= 500);

alter table public.crm_restaurants
  drop constraint if exists crm_restaurants_signature_photo_check;
alter table public.crm_restaurants
  add constraint crm_restaurants_signature_photo_check
  check (signature_photo_url is null or char_length(signature_photo_url) <= 500);

alter table public.crm_restaurants
  drop constraint if exists crm_restaurants_pitch_check;
alter table public.crm_restaurants
  add constraint crm_restaurants_pitch_check
  check (concierge_pitch is null or char_length(concierge_pitch) <= 400);

alter table public.crm_restaurants
  drop constraint if exists crm_restaurants_price_band_check;
alter table public.crm_restaurants
  add constraint crm_restaurants_price_band_check
  check (price_band is null or char_length(price_band) <= 80);

alter table public.crm_restaurants
  drop constraint if exists crm_restaurants_place_url_check;
alter table public.crm_restaurants
  add constraint crm_restaurants_place_url_check
  check (place_url is null or char_length(place_url) <= 500);

comment on column public.crm_restaurants.photo_urls is
  'Photos https. La première est la salle du carrousel.';
comment on column public.crm_restaurants.menu_photo_url is
  'Photo de la carte, facultative. Elle ajoute une carte au carrousel.';
comment on column public.crm_restaurants.signature_photo_url is
  'Photo du plat signature.';
comment on column public.crm_restaurants.concierge_pitch is
  'Description courte, ton concierge.';
comment on column public.crm_restaurants.price_band is
  'Fourchette de prix par personne, texte libre.';
comment on column public.crm_restaurants.place_url is
  'Site ou page Google. Lien « Découvrir l’adresse ».';

alter table public.crm_restaurant_tables
  alter column covers set default 2;

comment on column public.crm_restaurant_tables.covers is
  'Toujours 2. Le nombre de voyageurs ne change pas les couverts.';

alter table public.crm_restaurant_messages
  add column if not exists part text,
  add column if not exists table_id uuid;

alter table public.crm_restaurant_messages
  drop constraint if exists crm_restaurant_messages_part_check;
alter table public.crm_restaurant_messages
  add constraint crm_restaurant_messages_part_check
  check (part is null or part in ('intro', 'A', 'B'));

comment on column public.crm_restaurant_messages.part is
  'intro, puis A ou B : un pré-message et un carrousel par table.';
comment on column public.crm_restaurant_messages.table_id is
  'Table concernée par le carrousel ou par le clic. Vide pour le pré-message.';

create index if not exists crm_restaurant_messages_sid_idx
  on public.crm_restaurant_messages (twilio_sid)
  where twilio_sid is not null;
