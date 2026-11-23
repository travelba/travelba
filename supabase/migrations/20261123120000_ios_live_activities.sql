-- Activité en direct (Live Activity) de l’application iOS TBA.
-- Additive. À jouer à la main. Rien n’est détruit.
-- Sans ces colonnes, le suivi de vol continue et aucune activité n’est poussée.

alter table public.crm_espace_devices
  add column if not exists live_start_token text,
  add column if not exists live_start_token_at timestamptz;

comment on column public.crm_espace_devices.live_start_token is
  'Jeton push-to-start ActivityKit (iOS 17.2+), un par appareil. Pas un jeton de session.';

create table if not exists public.crm_live_activities (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  booking_item_id uuid references public.crm_booking_items (id) on delete cascade,
  activity_id text not null,
  update_token text not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_live_activities_activity_key unique (customer_id, activity_id),
  constraint crm_live_activities_token_key unique (update_token)
);

create index if not exists crm_live_activities_open_idx
  on public.crm_live_activities (booking_item_id)
  where ended_at is null;

create index if not exists crm_live_activities_customer_idx
  on public.crm_live_activities (customer_id, updated_at desc);

alter table public.crm_live_activities enable row level security;

revoke all on public.crm_live_activities from anon;
grant select, insert, update, delete on public.crm_live_activities to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_live_activities' and policyname = 'crm_live_activities_own'
  ) then
    create policy crm_live_activities_own on public.crm_live_activities
      for all to authenticated
      using (customer_id = crm_private.customer_id())
      with check (customer_id = crm_private.customer_id());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_live_activities' and policyname = 'crm_live_activities_staff'
  ) then
    create policy crm_live_activities_staff on public.crm_live_activities
      for select to authenticated
      using (crm_private.is_staff());
  end if;
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_crm_live_activities_updated'
  ) then
    create trigger trg_crm_live_activities_updated
      before update on public.crm_live_activities
      for each row execute function public.crm_set_updated_at();
  end if;
end $$;

comment on table public.crm_live_activities is
  'Jetons de mise à jour d’une Live Activity de vol. Un jeton par activité. Pas de PAN.';
