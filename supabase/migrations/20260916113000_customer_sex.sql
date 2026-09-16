alter table public.crm_customers
  add column if not exists sex text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_customers_sex_check'
  ) then
    alter table public.crm_customers
      add constraint crm_customers_sex_check
      check (sex is null or sex in ('M', 'F', 'X'));
  end if;
end $$;
