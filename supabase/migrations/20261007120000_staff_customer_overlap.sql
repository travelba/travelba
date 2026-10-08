-- Incident 07/10 : une fiche client portait l’e-mail d’un compte `crm_staff` admin. Le lien
-- d’invitation (WhatsApp) a ouvert la session de l’agent. Un même utilisateur Auth, ou un même
-- e-mail, ne peut plus être à la fois une fiche client et un compte de l’agence.
-- Additive : le code appelle `crm_is_staff_email` quand elle existe, les triggers restent le filet.

-- E-mail d’un compte de l’agence (service_role seulement : la table auth.users n’est pas exposée).
create or replace function public.crm_is_staff_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.crm_staff s
    join auth.users u on u.id = s.auth_user_id
    where lower(u.email) = lower(trim(p_email))
  );
$$;

revoke all on function public.crm_is_staff_email(text) from public;
revoke all on function public.crm_is_staff_email(text) from anon;
revoke all on function public.crm_is_staff_email(text) from authenticated;
grant execute on function public.crm_is_staff_email(text) to service_role;

comment on function public.crm_is_staff_email(text) is
  'Vrai si l’e-mail est celui d’un compte de l’agence (crm_staff). Une fiche client ne le porte jamais.';

-- Fiche client : jamais l’utilisateur Auth ni l’e-mail d’un compte de l’agence.
create or replace function crm_private.forbid_staff_customer()
returns trigger
language plpgsql
security definer
set search_path = public, auth, crm_private
as $$
begin
  if new.auth_user_id is not null
     and exists (select 1 from public.crm_staff s where s.auth_user_id = new.auth_user_id) then
    raise exception 'Réservé à un client : ce compte est un compte de l’agence.'
      using errcode = 'check_violation';
  end if;
  if new.email is not null and public.crm_is_staff_email(new.email) then
    raise exception 'Réservé à un client : cet e-mail est un compte de l’agence.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function crm_private.forbid_staff_customer() from public;

drop trigger if exists crm_customers_forbid_staff on public.crm_customers;
create trigger crm_customers_forbid_staff
before insert or update of auth_user_id, email on public.crm_customers
for each row
execute function crm_private.forbid_staff_customer();

-- Compte de l’agence : jamais l’utilisateur Auth ni l’e-mail d’une fiche client.
create or replace function crm_private.forbid_customer_staff()
returns trigger
language plpgsql
security definer
set search_path = public, auth, crm_private
as $$
begin
  if exists (select 1 from public.crm_customers c where c.auth_user_id = new.auth_user_id) then
    raise exception 'Ce compte est une fiche client : il ne peut pas rejoindre l’équipe.'
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1
    from public.crm_customers c
    join auth.users u on u.id = new.auth_user_id
    where lower(c.email) = lower(u.email)
  ) then
    raise exception 'Cet e-mail est une fiche client : il ne peut pas rejoindre l’équipe.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke all on function crm_private.forbid_customer_staff() from public;

drop trigger if exists crm_staff_forbid_customer on public.crm_staff;
create trigger crm_staff_forbid_customer
before insert or update of auth_user_id on public.crm_staff
for each row
execute function crm_private.forbid_customer_staff();
