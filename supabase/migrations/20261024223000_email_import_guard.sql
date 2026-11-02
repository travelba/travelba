-- Import e-mail : statuts ignoré et regroupé, journal des décisions, tâches À faire.
-- Aucune réécriture des dossiers, titres ou notes déjà en place.
-- crm_audit_events peut déjà exister (autre forme). On ajoute les colonnes,
-- sans remplacer la policy SELECT du staff et sans toucher aux lignes.

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

do $$
begin
  if to_regclass('public.crm_audit_events') is null then
    create table public.crm_audit_events (
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
    alter table public.crm_audit_events enable row level security;
    create policy crm_audit_events_staff on public.crm_audit_events
      for all to authenticated
      using (crm_private.is_staff())
      with check (crm_private.is_staff());
    grant select, insert on public.crm_audit_events to authenticated;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'crm_audit_events'
      and column_name = 'entity_type'
  ) then
    alter table public.crm_audit_events add column if not exists actor_kind text;
    alter table public.crm_audit_events drop constraint if exists crm_audit_events_actor_kind_check;
    alter table public.crm_audit_events
      add constraint crm_audit_events_actor_kind_check
      check (actor_kind is null or actor_kind in ('auto', 'human'));
    alter table public.crm_audit_events add column if not exists actor_id uuid;
    alter table public.crm_audit_events
      add column if not exists email_ingest_id uuid references public.crm_email_ingest (id) on delete set null;
    alter table public.crm_audit_events
      add column if not exists booking_id uuid references public.crm_bookings (id) on delete set null;
    alter table public.crm_audit_events add column if not exists summary text;
    alter table public.crm_audit_events add column if not exists detail jsonb not null default '{}'::jsonb;
    alter table public.crm_audit_events alter column entity_type set default 'email_ingest';
  end if;
end $$;

create index if not exists crm_audit_events_ingest_idx
  on public.crm_audit_events (email_ingest_id, created_at desc);

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
