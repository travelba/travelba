alter table public.crm_travel_documents
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists birth_date date,
  add column if not exists nationality text,
  add column if not exists sex text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'crm_travel_documents_sex_check'
  ) then
    alter table public.crm_travel_documents
      add constraint crm_travel_documents_sex_check
      check (sex is null or sex in ('M', 'F', 'X'));
  end if;
end $$;
