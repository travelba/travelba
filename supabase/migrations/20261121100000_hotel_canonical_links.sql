-- Hôtels canoniques et correspondances fournisseur.
-- Les tables publiques hotels, giata_supplier_properties et hotel_supplier_connections
-- restent celles du site. Elles ne sont pas réutilisées ici.
-- À jouer à la main.

create table if not exists public.crm_hotels_canonical (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  name_key text not null check (char_length(name_key) between 1 and 180),
  city text not null default '' check (char_length(city) <= 80),
  city_key text not null default '' check (char_length(city_key) <= 80),
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  address text check (address is null or char_length(address) <= 240),
  latitude double precision,
  longitude double precision,
  stars numeric(2, 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name_key, city_key)
);

create table if not exists public.crm_hotel_supplier_links (
  id uuid primary key default gen_random_uuid(),
  canonical_id uuid not null references public.crm_hotels_canonical (id) on delete cascade,
  provider text not null check (provider in ('little_emperors', 'expedia', 'ratehawk')),
  provider_hotel_id text not null check (char_length(provider_hotel_id) between 1 and 80),
  provider_name text check (provider_name is null or char_length(provider_name) <= 160),
  confidence numeric(4, 3) not null default 0 check (confidence >= 0 and confidence <= 1),
  method text not null check (method in ('geo_name', 'name_city', 'manual', 'import')),
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'rejected')),
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_hotel_id)
);

create index if not exists crm_hotel_supplier_links_canonical_idx
  on public.crm_hotel_supplier_links (canonical_id);

drop trigger if exists trg_crm_hotels_canonical_updated on public.crm_hotels_canonical;
create trigger trg_crm_hotels_canonical_updated
  before update on public.crm_hotels_canonical
  for each row execute function public.crm_set_updated_at();

drop trigger if exists trg_crm_hotel_supplier_links_updated on public.crm_hotel_supplier_links;
create trigger trg_crm_hotel_supplier_links_updated
  before update on public.crm_hotel_supplier_links
  for each row execute function public.crm_set_updated_at();

alter table public.crm_hotels_canonical enable row level security;
alter table public.crm_hotel_supplier_links enable row level security;

revoke all on public.crm_hotels_canonical from anon, authenticated, public;
revoke all on public.crm_hotel_supplier_links from anon, authenticated, public;
grant select on public.crm_hotels_canonical to authenticated;
grant select on public.crm_hotel_supplier_links to authenticated;
grant select, insert, update, delete on public.crm_hotels_canonical to service_role;
grant select, insert, update, delete on public.crm_hotel_supplier_links to service_role;

drop policy if exists crm_hotels_canonical_staff_read on public.crm_hotels_canonical;
create policy crm_hotels_canonical_staff_read on public.crm_hotels_canonical
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_hotel_supplier_links_staff_read on public.crm_hotel_supplier_links;
create policy crm_hotel_supplier_links_staff_read on public.crm_hotel_supplier_links
  for select to authenticated
  using (crm_private.is_staff());

comment on table public.crm_hotels_canonical is
  'Hôtel canonique partagé par les fournisseurs. Lecture staff. Écriture service role.';
comment on table public.crm_hotel_supplier_links is
  'Correspondance hôtel fournisseur. proposed reste à vérifier. rejected n’est pas reproposé.';
