-- Application iOS TBA : appareils APNs et préférences push.
-- Les trois tables existent déjà en production (vides) sans migration.
-- Cette version les décrit pour un environnement neuf et ajoute les colonnes push.
-- Idempotente. À jouer à la main avant d’activer APNS_* . Rien n’est détruit.

create table if not exists public.crm_espace_devices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  auth_user_id uuid,
  platform text not null,
  token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_espace_devices_platform_check check (platform = 'ios'),
  constraint crm_espace_devices_token_key unique (token)
);

create index if not exists crm_espace_devices_customer_idx
  on public.crm_espace_devices (customer_id, updated_at desc);

create table if not exists public.crm_notification_preferences (
  customer_id uuid primary key references public.crm_customers (id) on delete cascade,
  email_travel boolean not null default true,
  email_payment boolean not null default true,
  email_documents boolean not null default true,
  whatsapp_operational boolean not null default false,
  push_travel boolean not null default true,
  push_documents boolean not null default true,
  push_payment boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.crm_notification_preferences
  add column if not exists push_travel boolean not null default true,
  add column if not exists push_documents boolean not null default true,
  add column if not exists push_payment boolean not null default true;

create table if not exists public.crm_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  booking_id uuid references public.crm_bookings (id) on delete set null,
  kind text not null default 'agency',
  title text not null,
  message text not null,
  action_url text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  idempotency_key text,
  constraint crm_notifications_idempotency_key_key unique (idempotency_key)
);

create index if not exists crm_notifications_customer_idx
  on public.crm_notifications (customer_id, created_at desc);

create index if not exists crm_notifications_booking_idx
  on public.crm_notifications (booking_id);

alter table public.crm_espace_devices enable row level security;
alter table public.crm_notification_preferences enable row level security;
alter table public.crm_notifications enable row level security;

revoke all on public.crm_espace_devices from anon;
revoke all on public.crm_notification_preferences from anon;
revoke all on public.crm_notifications from anon;

grant select, insert, update, delete on public.crm_espace_devices to authenticated, service_role;
grant select, insert, update, delete on public.crm_notification_preferences to authenticated, service_role;
grant select, insert, update, delete on public.crm_notifications to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_espace_devices' and policyname = 'crm_espace_devices_own'
  ) then
    create policy crm_espace_devices_own on public.crm_espace_devices
      for all to authenticated
      using (customer_id = crm_private.customer_id())
      with check (customer_id = crm_private.customer_id());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_espace_devices' and policyname = 'crm_espace_devices_staff'
  ) then
    create policy crm_espace_devices_staff on public.crm_espace_devices
      for select to authenticated
      using (crm_private.is_staff());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_notification_preferences' and policyname = 'crm_notification_preferences_access'
  ) then
    create policy crm_notification_preferences_access on public.crm_notification_preferences
      for all to authenticated
      using (crm_private.is_staff() or customer_id = crm_private.customer_id())
      with check (crm_private.is_staff() or customer_id = crm_private.customer_id());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_notifications' and policyname = 'crm_notifications_select'
  ) then
    create policy crm_notifications_select on public.crm_notifications
      for select to authenticated
      using (crm_private.is_staff() or customer_id = crm_private.customer_id());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_notifications' and policyname = 'crm_notifications_update_read'
  ) then
    create policy crm_notifications_update_read on public.crm_notifications
      for update to authenticated
      using (customer_id = crm_private.customer_id())
      with check (customer_id = crm_private.customer_id());
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_crm_espace_devices_updated'
  ) then
    create trigger trg_crm_espace_devices_updated
      before update on public.crm_espace_devices
      for each row execute function public.crm_set_updated_at();
  end if;
end $$;

comment on table public.crm_espace_devices is
  'Jetons APNs de l’application client TBA. Un jeton, un appareil. Pas de PAN.';
comment on column public.crm_notification_preferences.push_travel is
  'Notifications de vol dans l’application. Vrai par défaut.';
comment on column public.crm_notification_preferences.push_documents is
  'Notifications de documents dans l’application. Vrai par défaut.';
comment on column public.crm_notification_preferences.push_payment is
  'Notifications de règlement dans l’application. Vrai par défaut.';
