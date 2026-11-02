-- Fiche restaurant enrichie pour le connecteur (list_restaurants, create_restaurant, update_restaurant).
-- Additive. À jouer à la main après 20261029203000_crm_restaurant_catalogue.sql. Le dépôt ne l’applique pas.
-- La catégorie reste `categories` (la première est la catégorie principale) ;
-- l’empreinte de carte reste `guarantee_card`.

alter table public.crm_restaurants
  add column if not exists cuisine text,
  add column if not exists style text,
  add column if not exists price_estimated boolean not null default false,
  add column if not exists opening_hours text,
  add column if not exists online_cancellation boolean,
  add column if not exists availability_notes text;

alter table public.crm_restaurants
  drop constraint if exists crm_restaurants_cuisine_check;
alter table public.crm_restaurants
  add constraint crm_restaurants_cuisine_check
  check (cuisine is null or char_length(cuisine) <= 80);

alter table public.crm_restaurants
  drop constraint if exists crm_restaurants_style_check;
alter table public.crm_restaurants
  add constraint crm_restaurants_style_check
  check (style is null or char_length(style) <= 80);

alter table public.crm_restaurants
  drop constraint if exists crm_restaurants_opening_hours_check;
alter table public.crm_restaurants
  add constraint crm_restaurants_opening_hours_check
  check (opening_hours is null or char_length(opening_hours) <= 400);

alter table public.crm_restaurants
  drop constraint if exists crm_restaurants_availability_check;
alter table public.crm_restaurants
  add constraint crm_restaurants_availability_check
  check (availability_notes is null or char_length(availability_notes) <= 1000);

-- Statut « à valider » : fiche saisie par le connecteur, pas encore relue. Hors sélection tant qu’elle n’est pas active.
alter table public.crm_restaurants
  drop constraint if exists crm_restaurants_status_check;
alter table public.crm_restaurants
  add constraint crm_restaurants_status_check
  check (status in ('actif', 'a_valider', 'exclu'));

comment on column public.crm_restaurants.cuisine is
  'Cuisine, texte libre : italienne du sud, omakase.';
comment on column public.crm_restaurants.style is
  'Style de la maison : bistrot, terrasse les pieds dans l’eau.';
comment on column public.crm_restaurants.price_estimated is
  'La fourchette price_band est une estimation, pas la carte.';
comment on column public.crm_restaurants.opening_hours is
  'Horaires d’ouverture, texte libre. Les jours fermés restent closed_weekdays.';
comment on column public.crm_restaurants.online_cancellation is
  'Annulation possible en ligne. Null : pas renseigné.';
comment on column public.crm_restaurants.availability_notes is
  'Disponibilités et conseils de réservation.';
comment on column public.crm_restaurants.status is
  'actif : sélectionnable. a_valider : fiche à relire, hors sélection. exclu : hors sélection.';
