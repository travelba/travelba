-- crm_customers_self et crm_customers_self_update existent depuis le schéma initial.
-- L’espace client les utilise : PATCH /api/client/profile écrit sa fiche avec le rôle authenticated.
-- On ne les retire pas. Cette garde limite les colonnes qu’un client (pas l’agence, pas le service role) peut changer.

create or replace function public.crm_customers_self_column_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'authenticated' then
    return new;
  end if;
  if crm_private.is_staff() then
    return new;
  end if;
  if new.email is distinct from old.email
    or new.auth_user_id is distinct from old.auth_user_id
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.company_role is distinct from old.company_role
    or new.billing_parent_id is distinct from old.billing_parent_id
    or new.iban is distinct from old.iban
    or new.on_hold is distinct from old.on_hold
    or new.is_vip is distinct from old.is_vip
    or new.whatsapp_opt_in_at is distinct from old.whatsapp_opt_in_at
    or new.whatsapp_opt_out_at is distinct from old.whatsapp_opt_out_at
    or new.spending_allowance is distinct from old.spending_allowance
    or new.hotel_booking_enabled is distinct from old.hotel_booking_enabled
    or new.hotel_demo is distinct from old.hotel_demo
  then
    raise exception 'Cette fiche ne se modifie pas ici.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.crm_customers_self_column_guard() from public;
grant execute on function public.crm_customers_self_column_guard() to authenticated, service_role;

drop trigger if exists crm_customers_self_column_guard on public.crm_customers;
create trigger crm_customers_self_column_guard
  before update on public.crm_customers
  for each row
  execute function public.crm_customers_self_column_guard();
