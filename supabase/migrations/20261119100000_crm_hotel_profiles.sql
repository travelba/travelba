-- Fiche hôtel réutilisable (hors Little Emperors) : contacts, photos, description.
-- La table existe déjà en prod, vide, sans ce fichier. Cette migration la reprend.
-- Photos publiques dans le bucket hotel-photos. Écriture service role.
-- À jouer à la main. Ne pas appliquer depuis l’agent.

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
  check_in_time text,
  check_out_time text,
  contacts jsonb not null default '{}'::jsonb,
  photos jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  status text not null default 'auto',
  attempts integer not null default 0,
  searched_at timestamptz,
  last_searched_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_hotel_profiles add column if not exists check_in_time text;
alter table public.crm_hotel_profiles add column if not exists check_out_time text;
alter table public.crm_hotel_profiles add column if not exists sources jsonb not null default '[]'::jsonb;
alter table public.crm_hotel_profiles add column if not exists last_searched_at timestamptz;
alter table public.crm_hotel_profiles add column if not exists last_verified_at timestamptz;

alter table public.crm_hotel_profiles drop constraint if exists crm_hotel_profiles_status_check;
update public.crm_hotel_profiles
  set status = case
    when status in ('verified', 'prete') then 'verified'
    when status = 'auto' then 'auto'
    else 'auto'
  end
  where status is null or status not in ('auto', 'verified');
alter table public.crm_hotel_profiles alter column status set default 'auto';
alter table public.crm_hotel_profiles
  add constraint crm_hotel_profiles_status_check check (status in ('auto', 'verified'));

alter table public.crm_hotel_profiles drop constraint if exists crm_hotel_profiles_attempts_check;
alter table public.crm_hotel_profiles
  add constraint crm_hotel_profiles_attempts_check check (attempts >= 0 and attempts <= 100);

create unique index if not exists crm_hotel_profiles_identity_idx
  on public.crm_hotel_profiles (name_key, city_key);

drop trigger if exists trg_crm_hotel_profiles_updated on public.crm_hotel_profiles;
create trigger trg_crm_hotel_profiles_updated
  before update on public.crm_hotel_profiles
  for each row execute function public.crm_set_updated_at();

grant select on public.crm_hotel_profiles to authenticated;
revoke insert, update, delete, truncate on public.crm_hotel_profiles from anon, authenticated;
grant select, insert, update, delete on public.crm_hotel_profiles to service_role;

alter table public.crm_hotel_profiles enable row level security;

drop policy if exists crm_hotel_profiles_staff on public.crm_hotel_profiles;
drop policy if exists crm_hotel_profiles_staff_read on public.crm_hotel_profiles;
create policy crm_hotel_profiles_staff_read on public.crm_hotel_profiles
  for select to authenticated
  using (crm_private.is_staff());

comment on table public.crm_hotel_profiles is
  'Fiche hôtel réutilisée d’un dossier à l’autre, hors Little Emperors. Lecture staff. Écriture service role. Les e-mails restent à vérifier jusqu’au clic Valider la fiche.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hotel-photos',
  'hotel-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hotel_photos_public_read on storage.objects;
create policy hotel_photos_public_read on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'hotel-photos');
