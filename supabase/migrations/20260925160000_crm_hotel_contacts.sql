-- Contacts hôtel Little Emperors (catalogue public), un hôtel importé à la fois.
-- Staff en lecture, écriture service role. Pas de PII client.

alter table public.crm_le_bookings
  add column if not exists country text;

create table if not exists public.crm_hotel_contacts (
  id uuid primary key default gen_random_uuid(),
  le_hotel_id bigint not null,
  hotel_name text,
  city text,
  country text,
  contact_type text,
  last_name text,
  first_name text,
  email text,
  phone text,
  source text not null default 'little_emperors',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_hotel_contacts_identity_idx
  on public.crm_hotel_contacts (
    le_hotel_id,
    coalesce(email, ''),
    coalesce(contact_type, ''),
    coalesce(last_name, ''),
    coalesce(first_name, '')
  );

create index if not exists crm_hotel_contacts_hotel_idx
  on public.crm_hotel_contacts (le_hotel_id);

drop trigger if exists trg_crm_hotel_contacts_updated on public.crm_hotel_contacts;
create trigger trg_crm_hotel_contacts_updated
  before update on public.crm_hotel_contacts
  for each row execute function public.crm_set_updated_at();

grant select, insert, update, delete on public.crm_hotel_contacts to authenticated;

alter table public.crm_hotel_contacts enable row level security;

drop policy if exists crm_hotel_contacts_staff on public.crm_hotel_contacts;
create policy crm_hotel_contacts_staff on public.crm_hotel_contacts
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
