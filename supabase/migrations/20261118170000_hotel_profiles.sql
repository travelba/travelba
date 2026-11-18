-- Fiche publique d’un hôtel hors Little Emperors (recherche). Pas de donnée client.
-- Le catalogue Little Emperors reste dans crm_le_hotels et crm_hotel_contacts.

create table if not exists public.crm_hotel_profiles (
  id uuid primary key default gen_random_uuid(),
  name_key text not null,
  city_key text not null default '',
  hotel_name text not null,
  city text not null default '',
  country text not null default '',
  address text,
  website text,
  phone text,
  description text,
  photos jsonb not null default '[]'::jsonb,
  contacts jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  status text not null default 'attente',
  attempts integer not null default 0,
  searched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_hotel_profiles_status_check check (status in ('attente', 'prete', 'vide', 'echec')),
  constraint crm_hotel_profiles_attempts_check check (attempts >= 0 and attempts <= 10)
);

create unique index if not exists crm_hotel_profiles_identity_idx
  on public.crm_hotel_profiles (name_key, city_key);

drop trigger if exists trg_crm_hotel_profiles_updated on public.crm_hotel_profiles;
create trigger trg_crm_hotel_profiles_updated
  before update on public.crm_hotel_profiles
  for each row execute function public.crm_set_updated_at();

grant select on public.crm_hotel_profiles to authenticated;

alter table public.crm_hotel_profiles enable row level security;

drop policy if exists crm_hotel_profiles_staff on public.crm_hotel_profiles;
create policy crm_hotel_profiles_staff on public.crm_hotel_profiles
  for select to authenticated
  using (crm_private.is_staff());
