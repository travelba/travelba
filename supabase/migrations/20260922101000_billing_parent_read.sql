-- Member peut lire la fiche admin société (payeur) pour afficher « facturé par ».
drop policy if exists crm_customers_billing_parent_read on public.crm_customers;
create policy crm_customers_billing_parent_read on public.crm_customers
  for select to authenticated
  using (
    id = (
      select me.billing_parent_id
      from public.crm_customers me
      where me.id = crm_private.customer_id()
    )
  );
