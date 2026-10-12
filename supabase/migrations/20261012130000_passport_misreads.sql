-- Signalement d’une lecture de passeport jugée fausse.
-- Forme de l’erreur seulement : pas de numéro, pas de MRZ, pas de photo.

create table if not exists public.crm_passport_misreads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  staff_id uuid references public.crm_staff (id) on delete set null,
  customer_id uuid references public.crm_customers (id) on delete set null,
  issuing_country text,
  symptom jsonb not null default '{}'::jsonb,
  note text,
  cursor_agent_id text,
  status text not null default 'noted'
    check (status in ('noted', 'sent', 'failed'))
);

comment on table public.crm_passport_misreads is
  'Lecture de passeport signalée fausse. Pays, champs et forme. Sans numéro ni photo.';

create index if not exists crm_passport_misreads_created_idx
  on public.crm_passport_misreads (created_at desc);

alter table public.crm_passport_misreads enable row level security;

revoke all on public.crm_passport_misreads from anon, public;
grant select, insert, update on public.crm_passport_misreads to authenticated;
grant all on public.crm_passport_misreads to service_role;

drop policy if exists crm_passport_misreads_staff_select on public.crm_passport_misreads;
create policy crm_passport_misreads_staff_select on public.crm_passport_misreads
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_passport_misreads_staff_insert on public.crm_passport_misreads;
create policy crm_passport_misreads_staff_insert on public.crm_passport_misreads
  for insert to authenticated
  with check (crm_private.is_staff());

drop policy if exists crm_passport_misreads_staff_update on public.crm_passport_misreads;
create policy crm_passport_misreads_staff_update on public.crm_passport_misreads
  for update to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
