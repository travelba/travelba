-- Ouverture fiche et dossier : index en double, politiques RLS, recherche hôtel.
-- Aucune donnée n’est modifiée.

create extension if not exists pg_trgm with schema extensions;

-- Deux index identiques (mêmes colonnes, même unicité) : on garde le plus ancien.
do $$
declare
  row record;
begin
  for row in
    select drop_rel.oid::regclass as drop_name
    from pg_index keep
    join pg_class tbl on tbl.oid = keep.indrelid
    join pg_index drop_idx
      on drop_idx.indrelid = keep.indrelid
     and drop_idx.indexrelid <> keep.indexrelid
     and drop_idx.indkey = keep.indkey
     and drop_idx.indisunique = keep.indisunique
     and drop_idx.indisprimary = false
     and keep.indisprimary = false
    join pg_class drop_rel on drop_rel.oid = drop_idx.indexrelid
    where tbl.relname in ('crm_pliant_cards', 'crm_travel_companions')
      and drop_idx.indexrelid > keep.indexrelid
  loop
    execute format('drop index if exists %s', row.drop_name);
  end loop;
end $$;

drop policy if exists crm_staff_select on public.crm_staff;
create policy crm_staff_select on public.crm_staff
  for select to authenticated
  using (auth_user_id = (select auth.uid()) or crm_private.is_staff());

drop policy if exists crm_customers_self on public.crm_customers;
create policy crm_customers_self on public.crm_customers
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

drop policy if exists crm_customers_self_update on public.crm_customers;
create policy crm_customers_self_update on public.crm_customers
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

create index if not exists crm_hotel_contacts_hotel_name_trgm
  on public.crm_hotel_contacts
  using gin (hotel_name extensions.gin_trgm_ops);
