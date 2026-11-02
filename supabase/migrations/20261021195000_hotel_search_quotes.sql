-- Demandes de recherche hôtel (essai, allowlist). Pas de PAN, pas de net côté client.
-- L’offre garde le compte fournisseur pour l’agence seulement. service_role.

create table if not exists public.crm_hotel_search_offers (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  hotel_key text not null check (char_length(hotel_key) between 1 and 240),
  hotel_name text not null check (char_length(hotel_name) between 1 and 160),
  city text not null default '' check (char_length(city) <= 80),
  room_label text check (room_label is null or char_length(room_label) <= 120),
  photo_url text check (photo_url is null or (char_length(photo_url) <= 500 and photo_url like 'https://%')),
  thumb_url text check (thumb_url is null or (char_length(thumb_url) <= 500 and thumb_url like 'https://%')),
  sell_cents integer not null check (sell_cents > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  nights integer not null check (nights between 1 and 30),
  check_in date not null,
  check_out date not null,
  adults integer not null check (adults between 1 and 8),
  benefits jsonb not null default '[]'::jsonb,
  free_cancellation boolean not null default false,
  advantage_score integer not null default 0,
  account text not null check (account in ('little_emperors', 'net')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (customer_id, hotel_key, check_in, check_out, adults)
);

create index if not exists crm_hotel_search_offers_customer_idx
  on public.crm_hotel_search_offers (customer_id, expires_at desc);

create table if not exists public.crm_hotel_search_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  offer_id uuid references public.crm_hotel_search_offers (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'refused', 'issued', 'locked')),
  hotel_name text not null check (char_length(hotel_name) between 1 and 160),
  city text not null default '' check (char_length(city) <= 80),
  room_label text check (room_label is null or char_length(room_label) <= 120),
  check_in date not null,
  check_out date not null,
  adults integer not null check (adults between 1 and 8),
  sell_cents integer not null check (sell_cents > 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  benefits jsonb not null default '[]'::jsonb,
  account text not null check (account in ('little_emperors', 'net')),
  pliant_card_id text check (
    pliant_card_id is null
    or (char_length(pliant_card_id) <= 80 and pliant_card_id !~ '[0-9]{12,}')
  ),
  validated_by uuid,
  validated_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_hotel_search_requests_status_idx
  on public.crm_hotel_search_requests (status, created_at desc);

drop trigger if exists trg_crm_hotel_search_requests_updated on public.crm_hotel_search_requests;
create trigger trg_crm_hotel_search_requests_updated
  before update on public.crm_hotel_search_requests
  for each row execute function public.crm_set_updated_at();

alter table public.crm_hotel_search_offers enable row level security;
alter table public.crm_hotel_search_requests enable row level security;

revoke all on public.crm_hotel_search_offers from anon, authenticated, public;
revoke all on public.crm_hotel_search_requests from anon, authenticated, public;
grant all on public.crm_hotel_search_offers to service_role;
grant all on public.crm_hotel_search_requests to service_role;

comment on table public.crm_hotel_search_offers is
  'Offres de recherche hôtel. Le compte fournisseur reste interne. Pas de net exposé au client.';
comment on table public.crm_hotel_search_requests is
  'Demande client. La carte Pliant n’est émise qu’après validation agence, en sandbox.';
