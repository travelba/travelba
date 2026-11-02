-- Ratehawk / ETG v3. Contenu statique hors recherche, réservations, journal de certification.
-- Staff seulement. Aucun secret, aucun numéro de carte.

create table if not exists public.crm_ratehawk_regions (
  id bigint primary key,
  name text not null,
  name_fr text,
  country_code text,
  country_name text,
  type text,
  latitude double precision,
  longitude double precision,
  iata text,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_ratehawk_hotels (
  hid bigint primary key,
  slug text,
  name text not null,
  address text,
  region_id bigint,
  region_name text,
  country_code text,
  star_rating int,
  kind text,
  check_in_time text,
  check_out_time text,
  images jsonb not null default '[]'::jsonb,
  metapolicy_struct jsonb,
  metapolicy_extra_info text,
  room_groups jsonb not null default '[]'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  source text not null default 'seed',
  updated_at timestamptz not null default now()
);

create index if not exists crm_ratehawk_hotels_region_idx on public.crm_ratehawk_hotels (region_id);
create index if not exists crm_ratehawk_hotels_name_idx on public.crm_ratehawk_hotels (name);
create index if not exists crm_ratehawk_regions_name_idx on public.crm_ratehawk_regions (name);

create table if not exists public.crm_ratehawk_sync (
  id text primary key,
  cursor jsonb not null default '{}'::jsonb,
  last_ok_at timestamptz,
  last_error text,
  hotels_upserted int,
  regions_upserted int,
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_ratehawk_bookings (
  id uuid primary key default gen_random_uuid(),
  partner_order_id text not null unique,
  environment text not null check (environment in ('sandbox', 'production')),
  status text not null check (status in ('price_review', 'in_progress', 'success', 'failed', 'cancelled')),
  status_reason text,
  etg_order_id bigint,
  hid bigint,
  hotel_name text,
  checkin date,
  checkout date,
  residency text,
  guests jsonb not null default '[]'::jsonb,
  rooms jsonb not null default '[]'::jsonb,
  currency text,
  net_amount numeric(12, 2),
  sell_amount numeric(12, 2),
  margin_percent numeric(5, 2),
  payment_type text,
  book_hash text,
  price_increased boolean not null default false,
  form_payment jsonb,
  crm_booking_id uuid references public.crm_bookings (id) on delete set null,
  crm_booking_item_id uuid,
  dossier_ref text,
  link_error text,
  webhook_status text,
  webhook_payload jsonb,
  order_info jsonb,
  order_info_at timestamptz,
  confirmed_at timestamptz,
  booking_started_at timestamptz,
  deadline_at timestamptz,
  last_polled_at timestamptz,
  poll_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_ratehawk_bookings_status_idx
  on public.crm_ratehawk_bookings (status, created_at desc);

create table if not exists public.crm_ratehawk_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  environment text,
  endpoint text not null,
  http_status int,
  duration_ms int,
  partner_order_id text,
  error text,
  request jsonb,
  response jsonb
);

create index if not exists crm_ratehawk_logs_created_idx on public.crm_ratehawk_logs (created_at desc);
create index if not exists crm_ratehawk_logs_order_idx on public.crm_ratehawk_logs (partner_order_id);

insert into public.crm_ratehawk_regions (id, name, name_fr, country_code, country_name, type)
values (2011, 'Los Angeles', 'Los Angeles', 'US', 'États-Unis', 'City')
on conflict (id) do nothing;

insert into public.crm_ratehawk_hotels (hid, name, region_id, region_name, country_code, source)
values
  (10004834, 'Conrad Los Angeles', 2011, 'Los Angeles', 'US', 'seed'),
  (8819557, 'Rosa Bell Motel - Los Angeles', 2011, 'Los Angeles', 'US', 'seed')
on conflict (hid) do nothing;

alter table public.crm_ratehawk_regions enable row level security;
alter table public.crm_ratehawk_hotels enable row level security;
alter table public.crm_ratehawk_sync enable row level security;
alter table public.crm_ratehawk_bookings enable row level security;
alter table public.crm_ratehawk_logs enable row level security;

grant select, insert, update, delete on
  public.crm_ratehawk_regions,
  public.crm_ratehawk_hotels,
  public.crm_ratehawk_sync,
  public.crm_ratehawk_bookings,
  public.crm_ratehawk_logs
to authenticated, service_role;

drop policy if exists crm_ratehawk_regions_staff on public.crm_ratehawk_regions;
create policy crm_ratehawk_regions_staff on public.crm_ratehawk_regions
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_ratehawk_hotels_staff on public.crm_ratehawk_hotels;
create policy crm_ratehawk_hotels_staff on public.crm_ratehawk_hotels
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_ratehawk_sync_staff on public.crm_ratehawk_sync;
create policy crm_ratehawk_sync_staff on public.crm_ratehawk_sync
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_ratehawk_bookings_staff on public.crm_ratehawk_bookings;
create policy crm_ratehawk_bookings_staff on public.crm_ratehawk_bookings
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_ratehawk_logs_staff on public.crm_ratehawk_logs;
create policy crm_ratehawk_logs_staff on public.crm_ratehawk_logs
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop trigger if exists trg_crm_ratehawk_bookings_updated on public.crm_ratehawk_bookings;
create trigger trg_crm_ratehawk_bookings_updated
  before update on public.crm_ratehawk_bookings
  for each row execute function public.crm_set_updated_at();

drop trigger if exists trg_crm_ratehawk_sync_updated on public.crm_ratehawk_sync;
create trigger trg_crm_ratehawk_sync_updated
  before update on public.crm_ratehawk_sync
  for each row execute function public.crm_set_updated_at();
