-- Journal de ce que le titulaire fait dans l’espace : pages et gestes.
-- Pas les secrets (mot de passe, numéro de pièce, PAN). Lecture staff. Écriture service_role.
-- Une ouverture par l’agence n’écrit pas ici : elle est déjà dans crm_customer_logins (desk).

create table if not exists public.crm_customer_activity (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  auth_user_id uuid,
  action text not null,
  summary text not null,
  path text,
  booking_id uuid references public.crm_bookings (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists crm_customer_activity_customer_idx
  on public.crm_customer_activity (customer_id, created_at desc);

alter table public.crm_customer_activity enable row level security;

revoke all on public.crm_customer_activity from anon, public;
grant select on public.crm_customer_activity to authenticated;
grant all on public.crm_customer_activity to service_role;

drop policy if exists crm_customer_activity_staff on public.crm_customer_activity;
create policy crm_customer_activity_staff on public.crm_customer_activity
  for select to authenticated
  using (crm_private.is_staff());

comment on table public.crm_customer_activity is
  'Pages ouvertes et gestes du titulaire dans l’espace client. Sans secret.';
