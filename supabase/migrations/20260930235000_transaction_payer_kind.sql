-- Part société ou particulier d’un règlement. Le solde crm_customer_balances reste unique.
alter table public.crm_transactions
  add column if not exists payer_kind text;

alter table public.crm_transactions
  drop constraint if exists crm_transactions_payer_kind_check;

alter table public.crm_transactions
  add constraint crm_transactions_payer_kind_check
    check (payer_kind is null or payer_kind in ('company', 'personal'));

comment on column public.crm_transactions.payer_kind is
  'company ou personal pour ranger un crédit dans la répartition de l’encours. Null sur les lignes historiques.';
