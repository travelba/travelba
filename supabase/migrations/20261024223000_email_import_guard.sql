-- Import e-mail : statuts ignoré et regroupé, journal des décisions, tâches À faire.
-- Aucune réécriture des dossiers, titres ou notes déjà en place.

alter table public.crm_email_ingest
  drop constraint if exists crm_email_ingest_status_check;

alter table public.crm_email_ingest
  add constraint crm_email_ingest_status_check
  check (status in (
    'received', 'parsed', 'matched', 'attached', 'refused', 'error', 'ignored', 'grouped'
  ));

alter table public.crm_email_ingest
  add column if not exists grouped_into uuid references public.crm_email_ingest (id) on delete set null;

alter table public.crm_email_ingest
  add column if not exists ignore_reason text;

alter table public.crm_email_ingest
  add column if not exists confirmation_refs text[] not null default '{}';

alter table public.crm_email_ingest
  add column if not exists match_tier text;

create table if not exists public.crm_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_kind text not null check (actor_kind in ('auto', 'human')),
  actor_id uuid,
  action text not null,
  email_ingest_id uuid references public.crm_email_ingest (id) on delete set null,
  booking_id uuid references public.crm_bookings (id) on delete set null,
  customer_id uuid references public.crm_customers (id) on delete set null,
  summary text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists crm_audit_events_ingest_idx
  on public.crm_audit_events (email_ingest_id, created_at desc);

alter table public.crm_audit_events enable row level security;

drop policy if exists crm_audit_events_staff on public.crm_audit_events;
create policy crm_audit_events_staff on public.crm_audit_events
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

grant select, insert on public.crm_audit_events to authenticated;

create table if not exists public.crm_booking_tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  kind text not null check (kind in ('checkin', 'visa', 'preregistration')),
  title text not null,
  email_ingest_id uuid references public.crm_email_ingest (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crm_booking_tasks_booking_idx
  on public.crm_booking_tasks (booking_id, created_at);

alter table public.crm_booking_tasks enable row level security;

drop policy if exists crm_booking_tasks_staff on public.crm_booking_tasks;
create policy crm_booking_tasks_staff on public.crm_booking_tasks
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

grant select, insert, update, delete on public.crm_booking_tasks to authenticated;
