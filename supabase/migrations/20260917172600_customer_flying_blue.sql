alter table public.crm_customers
  add column if not exists phone_secondary text,
  add column if not exists flying_blue text;
