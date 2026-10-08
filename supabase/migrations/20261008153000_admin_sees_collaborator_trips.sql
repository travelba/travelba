-- Un admin voit les voyages publiés de ses collaborateurs
-- (company_role=member et billing_parent_id = cet admin).
-- Il ne voit pas les voyages des autres admins, et ne lit pas leur grand livre.

drop policy if exists crm_bookings_admin_peer on public.crm_bookings;
drop policy if exists crm_booking_items_admin_peer on public.crm_booking_items;
drop policy if exists crm_booking_docs_admin_peer on public.crm_booking_documents;
drop policy if exists crm_booking_travelers_admin_peer on public.crm_booking_travelers;
drop policy if exists crm_declined_services_admin_peer on public.crm_declined_services;
drop policy if exists crm_visa_requests_admin_peer on public.crm_visa_requests;
drop policy if exists crm_tx_admin_wallet on public.crm_transactions;
drop policy if exists crm_billing_companies_admin_wallet on public.crm_billing_companies;

drop function if exists crm_private.admin_shares_trip(uuid);
drop function if exists crm_private.company_wallet_id();

comment on column public.crm_customers.billing_parent_id is
  'Pour company_role=member : fiche admin / wallet société qui paie.';

create or replace function crm_private.sees_collaborator_trip(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crm_customers me
    join public.crm_customers traveler on traveler.id = owner
    where me.id = crm_private.customer_id()
      and me.company_role = 'admin'
      and traveler.company_role = 'member'
      and traveler.billing_parent_id = me.id
  );
$$;

revoke all on function crm_private.sees_collaborator_trip(uuid) from public;
grant execute on function crm_private.sees_collaborator_trip(uuid) to authenticated;

drop policy if exists crm_bookings_admin_collaborator on public.crm_bookings;
create policy crm_bookings_admin_collaborator on public.crm_bookings
  for select to authenticated
  using (
    crm_private.sees_collaborator_trip(customer_id)
    and visible_to_client
    and archived_at is null
  );

drop policy if exists crm_booking_items_admin_collaborator on public.crm_booking_items;
create policy crm_booking_items_admin_collaborator on public.crm_booking_items
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.sees_collaborator_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_booking_docs_admin_collaborator on public.crm_booking_documents;
create policy crm_booking_docs_admin_collaborator on public.crm_booking_documents
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.sees_collaborator_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_booking_travelers_admin_collaborator on public.crm_booking_travelers;
create policy crm_booking_travelers_admin_collaborator on public.crm_booking_travelers
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.sees_collaborator_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_declined_services_admin_collaborator on public.crm_declined_services;
create policy crm_declined_services_admin_collaborator on public.crm_declined_services
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.sees_collaborator_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_visa_requests_admin_collaborator on public.crm_visa_requests;
create policy crm_visa_requests_admin_collaborator on public.crm_visa_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.sees_collaborator_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );
