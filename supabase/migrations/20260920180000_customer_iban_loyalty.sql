alter table public.crm_customers
  add column if not exists iban text,
  add column if not exists loyalty jsonb;
