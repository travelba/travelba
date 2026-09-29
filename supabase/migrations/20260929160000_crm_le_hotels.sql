-- Annuaire Little Emperors : un hôtel, pour relier une carte de séjour à ses contacts.
-- Les personnes restent dans crm_hotel_contacts. Pas de donnée client.

create table if not exists public.crm_le_hotels (
  le_hotel_id bigint primary key,
  hotel_name text not null,
  city text not null default '',
  country text not null default '',
  source text not null default 'little_emperors',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_le_hotels_name_idx
  on public.crm_le_hotels (hotel_name);

drop trigger if exists trg_crm_le_hotels_updated on public.crm_le_hotels;
create trigger trg_crm_le_hotels_updated
  before update on public.crm_le_hotels
  for each row execute function public.crm_set_updated_at();

grant select on public.crm_le_hotels to authenticated;

alter table public.crm_le_hotels enable row level security;

drop policy if exists crm_le_hotels_staff on public.crm_le_hotels;
create policy crm_le_hotels_staff on public.crm_le_hotels
  for select to authenticated
  using (crm_private.is_staff());
