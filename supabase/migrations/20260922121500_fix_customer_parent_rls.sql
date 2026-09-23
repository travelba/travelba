-- crm_customers_billing_parent_read lisait crm_customers depuis une policy
-- crm_customers → récursion infinie. Toute lecture staff/client échouait
-- (liste /admin/clients vide, selects undés). Helper security definer.

create or replace function crm_private.billing_parent_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.billing_parent_id
  from public.crm_customers c
  where c.id = crm_private.customer_id()
  limit 1;
$$;

revoke all on function crm_private.billing_parent_id() from public;
grant execute on function crm_private.billing_parent_id() to authenticated;

drop policy if exists crm_customers_billing_parent_read on public.crm_customers;
create policy crm_customers_billing_parent_read on public.crm_customers
  for select to authenticated
  using (id = crm_private.billing_parent_id());
