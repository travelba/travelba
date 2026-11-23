-- Ouvre les offres, les demandes et les séjours directs à plusieurs fournisseurs.
-- Les colonnes Little Emperors restent. Expedia ne réserve pas encore.
-- À jouer à la main.

alter table public.crm_hotel_search_offers
  add column if not exists provider text,
  add column if not exists provider_hotel_id text,
  add column if not exists canonical_hotel_id uuid,
  add column if not exists supplier_rate jsonb,
  add column if not exists pricing jsonb,
  add column if not exists payment jsonb,
  add column if not exists legal_lines jsonb,
  add column if not exists sales_channel text;

update public.crm_hotel_search_offers
  set provider = 'little_emperors'
  where provider is null;

alter table public.crm_hotel_search_offers
  alter column provider set default 'little_emperors';

alter table public.crm_hotel_search_offers
  alter column provider set not null;

update public.crm_hotel_search_offers
  set provider_hotel_id = le_hotel_id::text
  where provider_hotel_id is null and le_hotel_id is not null;

update public.crm_hotel_search_offers set pricing = '{}'::jsonb where pricing is null;
update public.crm_hotel_search_offers set payment = '{}'::jsonb where payment is null;
update public.crm_hotel_search_offers set legal_lines = '[]'::jsonb where legal_lines is null;

alter table public.crm_hotel_search_offers alter column pricing set default '{}'::jsonb;
alter table public.crm_hotel_search_offers alter column payment set default '{}'::jsonb;
alter table public.crm_hotel_search_offers alter column legal_lines set default '[]'::jsonb;
alter table public.crm_hotel_search_offers alter column pricing set not null;
alter table public.crm_hotel_search_offers alter column payment set not null;
alter table public.crm_hotel_search_offers alter column legal_lines set not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'crm_hotel_search_offers'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%account%'
  loop
    execute format('alter table public.crm_hotel_search_offers drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_account_check;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_account_check
  check (account in ('little_emperors', 'net', 'expedia', 'ratehawk'));

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_provider_check;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_provider_check
  check (provider in ('little_emperors', 'expedia', 'ratehawk'));

alter table public.crm_hotel_search_offers
  drop constraint if exists crm_hotel_search_offers_canonical_hotel_id_fkey;
alter table public.crm_hotel_search_offers
  add constraint crm_hotel_search_offers_canonical_hotel_id_fkey
  foreign key (canonical_hotel_id) references public.crm_hotels_canonical (id) on delete set null;

alter table public.crm_hotel_search_requests
  add column if not exists provider text;

update public.crm_hotel_search_requests
  set provider = coalesce(provider, case when account = 'net' then 'little_emperors' else account end)
  where provider is null;

update public.crm_hotel_search_requests
  set provider = 'little_emperors'
  where provider is null or provider not in ('little_emperors', 'expedia', 'ratehawk');

alter table public.crm_hotel_search_requests
  alter column provider set default 'little_emperors';
alter table public.crm_hotel_search_requests
  alter column provider set not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'crm_hotel_search_requests'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%account%'
  loop
    execute format('alter table public.crm_hotel_search_requests drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.crm_hotel_search_requests
  drop constraint if exists crm_hotel_search_requests_account_check;
alter table public.crm_hotel_search_requests
  add constraint crm_hotel_search_requests_account_check
  check (account in ('little_emperors', 'net', 'expedia', 'ratehawk'));

alter table public.crm_hotel_search_requests
  drop constraint if exists crm_hotel_search_requests_provider_check;
alter table public.crm_hotel_search_requests
  add constraint crm_hotel_search_requests_provider_check
  check (provider in ('little_emperors', 'expedia', 'ratehawk'));

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'crm_hotel_direct_stays'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%supplier%'
  loop
    execute format('alter table public.crm_hotel_direct_stays drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.crm_hotel_direct_stays
  drop constraint if exists crm_hotel_direct_stays_supplier_check;
alter table public.crm_hotel_direct_stays
  add constraint crm_hotel_direct_stays_supplier_check
  check (supplier in ('direct_email', 'little_emperors', 'expedia', 'ratehawk'));
