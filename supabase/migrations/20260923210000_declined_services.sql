-- Refus client d'une proposition (transfert, greeter, enregistrement, visa).
-- Ce n'est pas une carte : rien n'est débité, la proposition disparaît.

create table if not exists public.crm_declined_services (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  kind text not null check (kind in ('chauffeur', 'greeter', 'visa', 'checkin')),
  service_leg text not null default '' check (service_leg in ('', 'departure', 'arrival')),
  place text not null default '' check (place in ('', 'home', 'hotel')),
  created_at timestamptz not null default now(),
  constraint crm_declined_services_key unique (booking_id, kind, service_leg, place),
  constraint crm_declined_services_shape check (
    (kind in ('visa', 'checkin') and service_leg = '' and place = '')
    or (kind = 'greeter' and service_leg in ('departure', 'arrival') and place = '')
    or (kind = 'chauffeur' and service_leg in ('departure', 'arrival') and place in ('home', 'hotel'))
  )
);

revoke all on public.crm_declined_services from anon, authenticated;
grant select on public.crm_declined_services to authenticated;
grant all on public.crm_declined_services to service_role;

alter table public.crm_declined_services enable row level security;

drop policy if exists crm_declined_services_staff on public.crm_declined_services;
create policy crm_declined_services_staff on public.crm_declined_services
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_declined_services_client on public.crm_declined_services;
create policy crm_declined_services_client on public.crm_declined_services
  for select to authenticated
  using (
    exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.visible_to_client
    )
  );
