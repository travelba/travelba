alter table public.crm_pliant_transactions
  add column if not exists card_label text,
  add column if not exists card_last4 text,
  add column if not exists holder_name text,
  add column if not exists category text,
  add column if not exists comment text;

alter table public.crm_pliant_transactions
  drop constraint if exists crm_pliant_transactions_card_last4_check;

alter table public.crm_pliant_transactions
  add constraint crm_pliant_transactions_card_last4_check
  check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');
