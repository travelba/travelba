-- Journal de la prolongation du 1er janvier. Une ligne par membre et par passage.
-- Additive. Aucune lecture anon. L’écriture est le service role du cron.

create table if not exists public.crm_club_year_extensions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  from_on date not null,
  to_on date not null,
  status text not null,
  detail text,
  created_at timestamptz not null default now(),
  unique (customer_id, from_on, to_on)
);

comment on table public.crm_club_year_extensions is
  'Prolongation Platinum du 1er janvier. La clé unique empêche un second envoi.';

alter table public.crm_club_year_extensions enable row level security;

revoke all on table public.crm_club_year_extensions from public, anon, authenticated;
grant select on table public.crm_club_year_extensions to authenticated;
grant all on table public.crm_club_year_extensions to service_role;

drop policy if exists crm_club_year_extensions_staff on public.crm_club_year_extensions;
create policy crm_club_year_extensions_staff
  on public.crm_club_year_extensions
  for select
  to authenticated
  using (crm_private.is_staff());
