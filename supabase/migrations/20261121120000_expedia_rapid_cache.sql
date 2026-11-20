-- Cache de contenu Expedia et journal d’appels, sans corps et sans signature.
-- Aucune réservation n’est écrite ici.
-- À jouer à la main.

create table if not exists public.crm_expedia_properties (
  property_id text primary key check (char_length(property_id) between 1 and 40),
  name text not null check (char_length(name) between 1 and 160),
  city text not null default '' check (char_length(city) <= 80),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  address text check (address is null or char_length(address) <= 240),
  latitude double precision,
  longitude double precision,
  stars smallint check (stars is null or stars between 1 and 5),
  image_url text check (image_url is null or (char_length(image_url) <= 500 and image_url like 'https://%')),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_expedia_logs (
  id uuid primary key default gen_random_uuid(),
  environment text not null check (environment in ('test', 'production')),
  endpoint text not null check (char_length(endpoint) between 1 and 120),
  http_status integer not null,
  duration_ms integer not null check (duration_ms >= 0),
  error text check (error is null or char_length(error) <= 180),
  created_at timestamptz not null default now()
);

create index if not exists crm_expedia_logs_created_idx
  on public.crm_expedia_logs (created_at desc);

alter table public.crm_expedia_properties enable row level security;
alter table public.crm_expedia_logs enable row level security;

revoke all on public.crm_expedia_properties from anon, authenticated, public;
revoke all on public.crm_expedia_logs from anon, authenticated, public;
grant select on public.crm_expedia_properties to authenticated;
grant select on public.crm_expedia_logs to authenticated;
grant select, insert, update, delete on public.crm_expedia_properties to service_role;
grant select, insert, update, delete on public.crm_expedia_logs to service_role;

drop policy if exists crm_expedia_properties_staff_read on public.crm_expedia_properties;
create policy crm_expedia_properties_staff_read on public.crm_expedia_properties
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_expedia_logs_staff_read on public.crm_expedia_logs;
create policy crm_expedia_logs_staff_read on public.crm_expedia_logs
  for select to authenticated
  using (crm_private.is_staff());

comment on table public.crm_expedia_properties is
  'Fiche Expedia en cache : nom, adresse, GPS. Pas de tarif, pas de carte.';
comment on table public.crm_expedia_logs is
  'Appels Expedia en lecture. Statut et durée seulement, jamais la signature ni la clé.';
