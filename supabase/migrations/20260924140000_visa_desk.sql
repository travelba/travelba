create table if not exists public.crm_visa_tasks (
  booking_id uuid primary key references public.crm_bookings (id) on delete cascade,
  holder_name text not null,
  reference text not null,
  reasons text[] not null default '{}',
  done_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.crm_visa_tasks enable row level security;

drop policy if exists crm_visa_tasks_staff on public.crm_visa_tasks;
create policy crm_visa_tasks_staff on public.crm_visa_tasks
  for all
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

alter table public.crm_bookings
  add column if not exists prices_visible boolean;

update public.crm_bookings
set prices_visible = visible_to_client
where prices_visible is null;

alter table public.crm_bookings
  alter column prices_visible set default false;

alter table public.crm_bookings
  alter column prices_visible set not null;
