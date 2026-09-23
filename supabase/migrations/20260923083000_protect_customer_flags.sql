-- VIP / veille : réservés à l’agence (et service_role). Le self-update RLS
-- ne doit pas permettre à un client de s’auto-promouvoir pour le greeter.

create or replace function crm_private.protect_customer_agency_flags()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  if auth.role() = 'service_role' or crm_private.is_staff() then
    return new;
  end if;
  new.on_hold := old.on_hold;
  new.is_vip := old.is_vip;
  return new;
end;
$$;

revoke all on function crm_private.protect_customer_agency_flags() from public;

drop trigger if exists crm_customers_protect_agency_flags on public.crm_customers;
create trigger crm_customers_protect_agency_flags
before update on public.crm_customers
for each row
execute function crm_private.protect_customer_agency_flags();
