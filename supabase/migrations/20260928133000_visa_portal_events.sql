create table if not exists public.crm_visa_portal_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  country text not null default 'IL' check (country in ('IL', 'US', 'GB')),
  kind text not null check (kind in ('ouvert', 'echec', 'page', 'champ', 'attente', 'erreur', 'fini')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists crm_visa_portal_events_booking_idx
  on public.crm_visa_portal_events (booking_id, country, created_at);

alter table public.crm_visa_portal_events enable row level security;

drop policy if exists crm_visa_portal_events_staff on public.crm_visa_portal_events;
create policy crm_visa_portal_events_staff on public.crm_visa_portal_events
  for all using (crm_private.is_staff()) with check (crm_private.is_staff());
