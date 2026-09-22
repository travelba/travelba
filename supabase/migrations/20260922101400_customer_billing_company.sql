alter table public.crm_customers
  add column if not exists billing_legal_name text,
  add column if not exists billing_siret text,
  add column if not exists billing_vat text,
  add column if not exists billing_address_line text,
  add column if not exists billing_postal_code text,
  add column if not exists billing_city text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_customers_billing_siret_check'
  ) then
    alter table public.crm_customers
      add constraint crm_customers_billing_siret_check
      check (billing_siret is null or billing_siret ~ '^[0-9]{14}$');
  end if;
end $$;
