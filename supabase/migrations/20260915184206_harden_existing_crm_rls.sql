-- Complete indexing and consolidate the original CRM policies.
create index if not exists crm_booking_documents_booking_idx on public.crm_booking_documents(booking_id);
create index if not exists crm_booking_items_booking_idx on public.crm_booking_items(booking_id);
create index if not exists crm_booking_travelers_booking_idx on public.crm_booking_travelers(booking_id);
create index if not exists crm_booking_travelers_companion_idx on public.crm_booking_travelers(companion_id);
create index if not exists crm_bookings_customer_idx on public.crm_bookings(customer_id);
create index if not exists crm_payment_methods_customer_idx on public.crm_payment_methods(customer_id);
create index if not exists crm_revolut_matched_customer_idx on public.crm_revolut_transactions(matched_customer_id);
create index if not exists crm_revolut_matched_transaction_idx on public.crm_revolut_transactions(matched_transaction_id);
create index if not exists crm_transactions_customer_idx on public.crm_transactions(customer_id);
create index if not exists crm_companions_customer_idx on public.crm_travel_companions(customer_id);
create index if not exists crm_travel_documents_companion_idx on public.crm_travel_documents(companion_id);
create index if not exists crm_travel_documents_customer_idx on public.crm_travel_documents(customer_id);

-- Keep privileged implementations outside the exposed public schema.
create or replace function crm_private.next_booking_reference()
returns text
language plpgsql
security definer
set search_path = public, crm_private
as $$
declare
  y int := extract(year from now())::int;
  n int;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not crm_private.is_staff() then
    raise exception 'Accès réservé au personnel' using errcode = '42501';
  end if;
  insert into public.crm_booking_seq (year, last)
  values (y, 1)
  on conflict (year) do update set last = public.crm_booking_seq.last + 1
  returning last into n;
  return 'TB-' || y::text || '-' || lpad(n::text, 4, '0');
end;
$$;

revoke all on function crm_private.next_booking_reference() from public, anon;
grant execute on function crm_private.next_booking_reference() to authenticated, service_role;

create or replace function public.crm_next_booking_reference()
returns text
language sql
security invoker
set search_path = public, crm_private
as $$ select crm_private.next_booking_reference(); $$;

revoke all on function public.crm_next_booking_reference() from public, anon;
grant execute on function public.crm_next_booking_reference() to authenticated, service_role;

-- Explicit deny policies document that these tables are service-role only.
drop policy if exists crm_integrations_deny on public.crm_integrations;
create policy crm_integrations_deny on public.crm_integrations
  for all to authenticated using (false) with check (false);
drop policy if exists crm_revolut_deny on public.crm_revolut_transactions;
create policy crm_revolut_deny on public.crm_revolut_transactions
  for all to authenticated using (false) with check (false);

drop policy if exists crm_bookings_staff on public.crm_bookings;
drop policy if exists crm_bookings_self on public.crm_bookings;
create policy crm_bookings_select on public.crm_bookings for select to authenticated
  using (crm_private.is_staff() or (customer_id = crm_private.customer_id() and status <> 'draft'));
create policy crm_bookings_staff_insert on public.crm_bookings for insert to authenticated
  with check (crm_private.is_staff());
create policy crm_bookings_staff_update on public.crm_bookings for update to authenticated
  using (crm_private.is_staff()) with check (crm_private.is_staff());
create policy crm_bookings_staff_delete on public.crm_bookings for delete to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_booking_items_staff on public.crm_booking_items;
drop policy if exists crm_booking_items_self on public.crm_booking_items;
create policy crm_booking_items_select on public.crm_booking_items for select to authenticated
  using (
    crm_private.is_staff() or exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id and b.customer_id = crm_private.customer_id() and b.status <> 'draft'
    )
  );
create policy crm_booking_items_staff_insert on public.crm_booking_items for insert to authenticated
  with check (crm_private.is_staff());
create policy crm_booking_items_staff_update on public.crm_booking_items for update to authenticated
  using (crm_private.is_staff()) with check (crm_private.is_staff());
create policy crm_booking_items_staff_delete on public.crm_booking_items for delete to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_booking_travelers_staff on public.crm_booking_travelers;
drop policy if exists crm_booking_travelers_self on public.crm_booking_travelers;
create policy crm_booking_travelers_select on public.crm_booking_travelers for select to authenticated
  using (
    crm_private.is_staff() or exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id and b.customer_id = crm_private.customer_id() and b.status <> 'draft'
    )
  );
create policy crm_booking_travelers_staff_insert on public.crm_booking_travelers for insert to authenticated
  with check (crm_private.is_staff());
create policy crm_booking_travelers_staff_update on public.crm_booking_travelers for update to authenticated
  using (crm_private.is_staff()) with check (crm_private.is_staff());
create policy crm_booking_travelers_staff_delete on public.crm_booking_travelers for delete to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_booking_docs_staff on public.crm_booking_documents;
drop policy if exists crm_booking_docs_self on public.crm_booking_documents;
create policy crm_booking_documents_select on public.crm_booking_documents for select to authenticated
  using (
    crm_private.is_staff() or (
      visible_to_client and exists (
        select 1 from public.crm_bookings b
        where b.id = booking_id and b.customer_id = crm_private.customer_id() and b.status <> 'draft'
      )
    )
  );
create policy crm_booking_documents_staff_insert on public.crm_booking_documents for insert to authenticated
  with check (crm_private.is_staff());
create policy crm_booking_documents_staff_update on public.crm_booking_documents for update to authenticated
  using (crm_private.is_staff()) with check (crm_private.is_staff());
create policy crm_booking_documents_staff_delete on public.crm_booking_documents for delete to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_customers_staff on public.crm_customers;
drop policy if exists crm_customers_self on public.crm_customers;
drop policy if exists crm_customers_self_update on public.crm_customers;
create policy crm_customers_select on public.crm_customers for select to authenticated
  using (crm_private.is_staff() or auth_user_id = auth.uid());
create policy crm_customers_insert on public.crm_customers for insert to authenticated
  with check (crm_private.is_staff());
create policy crm_customers_update on public.crm_customers for update to authenticated
  using (crm_private.is_staff() or auth_user_id = auth.uid())
  with check (crm_private.is_staff() or auth_user_id = auth.uid());
create policy crm_customers_delete on public.crm_customers for delete to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_companions_staff on public.crm_travel_companions;
drop policy if exists crm_companions_self on public.crm_travel_companions;
create policy crm_companions_access on public.crm_travel_companions for all to authenticated
  using (crm_private.is_staff() or customer_id = crm_private.customer_id())
  with check (crm_private.is_staff() or customer_id = crm_private.customer_id());

drop policy if exists crm_travel_docs_staff on public.crm_travel_documents;
drop policy if exists crm_travel_docs_self on public.crm_travel_documents;
create policy crm_travel_documents_access on public.crm_travel_documents for all to authenticated
  using (crm_private.is_staff() or customer_id = crm_private.customer_id())
  with check (crm_private.is_staff() or customer_id = crm_private.customer_id());

drop policy if exists crm_tx_staff on public.crm_transactions;
drop policy if exists crm_tx_self on public.crm_transactions;
create policy crm_transactions_select on public.crm_transactions for select to authenticated
  using (
    crm_private.is_staff() or
    (customer_id = crm_private.customer_id() and status = 'posted')
  );
create policy crm_transactions_staff_insert on public.crm_transactions for insert to authenticated
  with check (crm_private.is_staff());
create policy crm_transactions_staff_update on public.crm_transactions for update to authenticated
  using (crm_private.is_staff()) with check (crm_private.is_staff());
create policy crm_transactions_staff_delete on public.crm_transactions for delete to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_pm_staff on public.crm_payment_methods;
drop policy if exists crm_pm_self on public.crm_payment_methods;
create policy crm_payment_methods_select on public.crm_payment_methods for select to authenticated
  using (crm_private.is_staff() or customer_id = crm_private.customer_id());
