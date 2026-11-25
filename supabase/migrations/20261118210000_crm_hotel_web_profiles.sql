-- Cache de recherche web par hôtel (nom plié + ville). Pas de donnée client.
-- Après 20261118201000 (remise commerciale) et 20261118190000 (commit des étapes).
-- N’écrit pas sur crm_bookings. Non appliquée : à jouer sur Supabase.

create table if not exists public.crm_hotel_web_profiles (
  cache_key text primary key,
  hotel_name text not null,
  city text not null default '',
  payload jsonb not null,
  model text not null default 'sonar-pro',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_hotel_web_profiles_name_len check (char_length(hotel_name) <= 180),
  constraint crm_hotel_web_profiles_city_len check (char_length(city) <= 80),
  constraint crm_hotel_web_profiles_model_len check (char_length(model) <= 40)
);

drop trigger if exists trg_crm_hotel_web_profiles_updated on public.crm_hotel_web_profiles;
create trigger trg_crm_hotel_web_profiles_updated
  before update on public.crm_hotel_web_profiles
  for each row execute function public.crm_set_updated_at();

grant select on public.crm_hotel_web_profiles to authenticated;

alter table public.crm_hotel_web_profiles enable row level security;

drop policy if exists crm_hotel_web_profiles_staff on public.crm_hotel_web_profiles;
create policy crm_hotel_web_profiles_staff on public.crm_hotel_web_profiles
  for select to authenticated
  using (crm_private.is_staff());

comment on table public.crm_hotel_web_profiles is
  'Résultat Perplexity réutilisé pour le même hôtel et la même ville. Écriture service role.';
