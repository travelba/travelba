alter table public.crm_customers
  add column if not exists phone_secondary text,
  add column if not exists flying_blue text,
  add column if not exists company_name text,
  add column if not exists siret text,
  add column if not exists vat_number text,
  add column if not exists billing_email text,
  add column if not exists billing_address_line text,
  add column if not exists billing_postal_code text,
  add column if not exists billing_city text,
  add column if not exists billing_country text;
