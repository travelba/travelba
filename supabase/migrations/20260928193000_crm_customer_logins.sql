-- Historique des connexions titulaire (mot de passe, lien magique, invitation, lien court).
-- Lecture staff uniquement. Écriture service_role. Pas d’accès client.

create table if not exists public.crm_customer_logins (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  auth_user_id uuid,
  method text not null check (
    method in ('password', 'magiclink', 'invite', 'recovery', 'entry', 'precedent')
  ),
  created_at timestamptz not null default now()
);

create index if not exists crm_customer_logins_customer_idx
  on public.crm_customer_logins (customer_id, created_at desc);

alter table public.crm_customer_logins enable row level security;

revoke all on public.crm_customer_logins from anon, public;
grant select on public.crm_customer_logins to authenticated;
grant all on public.crm_customer_logins to service_role;

drop policy if exists crm_customer_logins_staff on public.crm_customer_logins;
create policy crm_customer_logins_staff on public.crm_customer_logins
  for select to authenticated
  using (crm_private.is_staff());

-- Une ligne par titulaire déjà connu de Auth, pour ne pas perdre la dernière connexion.
insert into public.crm_customer_logins (customer_id, auth_user_id, method, created_at)
select c.id, c.auth_user_id, 'precedent', u.last_sign_in_at
from public.crm_customers c
join auth.users u on u.id = c.auth_user_id
where u.last_sign_in_at is not null
  and not exists (
    select 1
    from public.crm_customer_logins existing
    where existing.customer_id = c.id
  );
