-- Internal drafts and their children are never exposed in the client portal.
drop policy if exists crm_bookings_self on public.crm_bookings;
create policy crm_bookings_self on public.crm_bookings
  for select to authenticated
  using (
    customer_id = crm_private.customer_id()
    and status <> 'draft'
  );

drop policy if exists crm_booking_items_self on public.crm_booking_items;
create policy crm_booking_items_self on public.crm_booking_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.status <> 'draft'
    )
  );

drop policy if exists crm_booking_travelers_self on public.crm_booking_travelers;
create policy crm_booking_travelers_self on public.crm_booking_travelers
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.status <> 'draft'
    )
  );

drop policy if exists crm_booking_docs_self on public.crm_booking_documents;
create policy crm_booking_docs_self on public.crm_booking_documents
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.status <> 'draft'
    )
  );

-- Payment methods are synchronized only by trusted server routes and Stripe
-- webhooks. Clients may read their own rows but cannot forge card records.
drop policy if exists crm_pm_self on public.crm_payment_methods;
create policy crm_pm_self on public.crm_payment_methods
  for select to authenticated
  using (customer_id = crm_private.customer_id());

revoke insert, update, delete on public.crm_payment_methods from authenticated;
