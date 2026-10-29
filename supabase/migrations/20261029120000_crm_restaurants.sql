-- Restaurants : catalogue, tables du soir, choix WhatsApp.
-- Quatre chiffres de garantie seulement. Jamais le numéro complet.
-- Additive. À jouer à la main : cette migration n’est pas appliquée par le dépôt.

alter table public.crm_bookings
  add column if not exists timezone text;

comment on column public.crm_bookings.timezone is
  'Fuseau IANA du séjour. Vide : il se déduit de la ville de l’hôtel.';

create table if not exists public.crm_restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  city_key text not null default '',
  address text,
  lat double precision,
  lng double precision,
  phone text,
  website text,
  categories text[] not null default '{}',
  booking_platform text,
  booking_url text,
  bot_reservable text not null default 'non',
  guarantee_card boolean not null default false,
  cancel_hours integer,
  cancel_fee_cents integer,
  closed_weekdays smallint[] not null default '{}',
  annual_closures jsonb not null default '[]'::jsonb,
  status text not null default 'actif',
  exclusion_reason text,
  starred boolean not null default false,
  prepaid_required boolean not null default false,
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_restaurants_name_check check (char_length(btrim(name)) between 1 and 200),
  constraint crm_restaurants_city_check check (char_length(btrim(city)) between 1 and 80),
  constraint crm_restaurants_platform_check check (
    booking_platform is null or booking_platform in (
      'resy', 'opentable', 'sevenrooms', 'thefork', 'zenchef', 'telephone', 'whatsapp', 'formulaire'
    )
  ),
  constraint crm_restaurants_bot_check check (bot_reservable in ('oui', 'partiel', 'non')),
  constraint crm_restaurants_status_check check (status in ('actif', 'exclu')),
  constraint crm_restaurants_reason_check check (
    exclusion_reason is null or exclusion_reason in ('ferme', 'gastronomique', 'prepaiement')
  ),
  constraint crm_restaurants_hours_check check (cancel_hours is null or (cancel_hours >= 0 and cancel_hours <= 1440)),
  constraint crm_restaurants_fee_check check (cancel_fee_cents is null or cancel_fee_cents >= 0),
  constraint crm_restaurants_lat_check check (lat is null or (lat >= -90 and lat <= 90)),
  constraint crm_restaurants_lng_check check (lng is null or (lng >= -180 and lng <= 180)),
  constraint crm_restaurants_weekdays_check check (closed_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
);

comment on table public.crm_restaurants is
  'Catalogue restaurants. Étoilé, gastronomique et prépaiement sont exclus. Pas de numéro de carte complet.';

create index if not exists crm_restaurants_city_idx on public.crm_restaurants (city_key, status);
create index if not exists crm_restaurants_name_idx on public.crm_restaurants (name);

create table if not exists public.crm_restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  evening_date date not null,
  seat text not null,
  restaurant_id uuid references public.crm_restaurants (id) on delete restrict,
  time_local time,
  covers integer not null,
  confirmation_ref text,
  account_email text not null default 'concierge@travelba.fr',
  card_last4 text,
  status text not null default 'a_reserver',
  cancel_fee_cents integer,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_restaurant_tables_seat_check check (seat in ('A', 'B')),
  constraint crm_restaurant_tables_covers_check check (covers >= 1 and covers <= 40),
  constraint crm_restaurant_tables_status_check check (
    status in ('a_reserver', 'reservee', 'proposee', 'choisie', 'a_annuler', 'annulee', 'echec')
  ),
  constraint crm_restaurant_tables_last4_check check (card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  constraint crm_restaurant_tables_fee_check check (cancel_fee_cents is null or cancel_fee_cents >= 0),
  constraint crm_restaurant_tables_unique unique (booking_id, evening_date, seat)
);

comment on column public.crm_restaurant_tables.card_last4 is
  'Quatre derniers chiffres de la carte de garantie. Jamais le numéro complet.';

create index if not exists crm_restaurant_tables_booking_idx
  on public.crm_restaurant_tables (booking_id, evening_date);

create table if not exists public.crm_restaurant_evenings (
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  evening_date date not null,
  choice text,
  chosen_at timestamptz,
  choice_source text,
  message_status text not null default 'aucun',
  message_sent_at timestamptz,
  closed_at timestamptz,
  primary key (booking_id, evening_date),
  constraint crm_restaurant_evenings_choice_check check (choice is null or choice in ('A', 'B', 'aucune')),
  constraint crm_restaurant_evenings_source_check check (choice_source is null or choice_source in ('whatsapp', 'manuel')),
  constraint crm_restaurant_evenings_message_check check (message_status in ('aucun', 'en_file', 'envoye', 'echec'))
);

create table if not exists public.crm_restaurant_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  evening_date date not null,
  direction text not null,
  body text not null,
  button text,
  status text not null,
  twilio_sid text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  constraint crm_restaurant_messages_direction_check check (direction in ('outbound', 'inbound')),
  constraint crm_restaurant_messages_status_check check (status in ('en_file', 'envoye', 'echec', 'recu'))
);

create unique index if not exists crm_restaurant_messages_dedupe_idx
  on public.crm_restaurant_messages (dedupe_key)
  where dedupe_key is not null;

create index if not exists crm_restaurant_messages_booking_idx
  on public.crm_restaurant_messages (booking_id, created_at desc);

alter table public.crm_restaurants enable row level security;
alter table public.crm_restaurant_tables enable row level security;
alter table public.crm_restaurant_evenings enable row level security;
alter table public.crm_restaurant_messages enable row level security;

revoke all on public.crm_restaurants from anon;
revoke all on public.crm_restaurant_tables from anon;
revoke all on public.crm_restaurant_evenings from anon;
revoke all on public.crm_restaurant_messages from anon;

grant select, insert, update, delete on public.crm_restaurants to authenticated;
grant select, insert, update, delete on public.crm_restaurant_tables to authenticated;
grant select, insert, update, delete on public.crm_restaurant_evenings to authenticated;
grant select, insert, update, delete on public.crm_restaurant_messages to authenticated;

grant all on public.crm_restaurants to service_role;
grant all on public.crm_restaurant_tables to service_role;
grant all on public.crm_restaurant_evenings to service_role;
grant all on public.crm_restaurant_messages to service_role;

drop policy if exists crm_restaurants_staff on public.crm_restaurants;
create policy crm_restaurants_staff on public.crm_restaurants
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_restaurant_tables_staff on public.crm_restaurant_tables;
create policy crm_restaurant_tables_staff on public.crm_restaurant_tables
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_restaurant_evenings_staff on public.crm_restaurant_evenings;
create policy crm_restaurant_evenings_staff on public.crm_restaurant_evenings
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_restaurant_messages_staff on public.crm_restaurant_messages;
create policy crm_restaurant_messages_staff on public.crm_restaurant_messages
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
