-- Jetons push de l’app iPhone (Expo / APNs). Un titulaire, plusieurs appareils.

create table if not exists public.crm_espace_devices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  auth_user_id uuid,
  platform text not null check (platform in ('ios')),
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (token)
);

create index if not exists crm_espace_devices_customer_idx
  on public.crm_espace_devices (customer_id, updated_at desc);

alter table public.crm_espace_devices enable row level security;

revoke all on public.crm_espace_devices from anon, public;
grant select, insert, update, delete on public.crm_espace_devices to authenticated;
grant all on public.crm_espace_devices to service_role;

drop policy if exists crm_espace_devices_own on public.crm_espace_devices;
create policy crm_espace_devices_own on public.crm_espace_devices
  for all to authenticated
  using (customer_id = crm_private.customer_id())
  with check (customer_id = crm_private.customer_id());

drop policy if exists crm_espace_devices_staff on public.crm_espace_devices;
create policy crm_espace_devices_staff on public.crm_espace_devices
  for select to authenticated
  using (crm_private.is_staff());
