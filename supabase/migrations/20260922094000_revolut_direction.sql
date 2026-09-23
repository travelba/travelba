-- Revolut inbox: distinguish revenus (credit) vs dépenses (debit)
alter table public.crm_revolut_transactions
  add column if not exists direction text;

update public.crm_revolut_transactions
set direction = 'credit'
where direction is null;

alter table public.crm_revolut_transactions
  alter column direction set default 'credit';

alter table public.crm_revolut_transactions
  alter column direction set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_revolut_transactions_direction_check'
  ) then
    alter table public.crm_revolut_transactions
      add constraint crm_revolut_transactions_direction_check
      check (direction in ('credit', 'debit'));
  end if;
end $$;
