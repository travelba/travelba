-- Admins associés (company_role=admin + billing_parent_id = wallet) voient
-- les voyages publiés des autres admins du même wallet, et le grand livre de ce wallet.
-- Les collaborateurs restent hors du carnet de l'admin.

comment on column public.crm_customers.billing_parent_id is
  'Collaborateur : admin société qui paie. Admin associé : wallet dont il partage le grand livre et les voyages.';

create or replace function crm_private.company_wallet_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select case
    when c.company_role = 'admin' and c.billing_parent_id is not null then c.billing_parent_id
    when c.company_role = 'admin' then c.id
    else null
  end
  from public.crm_customers c
  where c.id = crm_private.customer_id()
  limit 1;
$$;

revoke all on function crm_private.company_wallet_id() from public;
grant execute on function crm_private.company_wallet_id() to authenticated;

create or replace function crm_private.admin_shares_trip(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select owner is not null
    and me.company_role = 'admin'
    and peer.company_role = 'admin'
    and (
      case
        when me.billing_parent_id is not null then me.billing_parent_id
        else me.id
      end
      =
      case
        when peer.billing_parent_id is not null then peer.billing_parent_id
        else peer.id
      end
    )
  from public.crm_customers me
  join public.crm_customers peer on peer.id = owner
  where me.id = crm_private.customer_id();
$$;

revoke all on function crm_private.admin_shares_trip(uuid) from public;
grant execute on function crm_private.admin_shares_trip(uuid) to authenticated;

drop policy if exists crm_bookings_admin_peer on public.crm_bookings;
create policy crm_bookings_admin_peer on public.crm_bookings
  for select to authenticated
  using (
    crm_private.admin_shares_trip(customer_id)
    and visible_to_client
    and archived_at is null
  );

drop policy if exists crm_booking_items_admin_peer on public.crm_booking_items;
create policy crm_booking_items_admin_peer on public.crm_booking_items
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.admin_shares_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_booking_docs_admin_peer on public.crm_booking_documents;
create policy crm_booking_docs_admin_peer on public.crm_booking_documents
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.admin_shares_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_booking_travelers_admin_peer on public.crm_booking_travelers;
create policy crm_booking_travelers_admin_peer on public.crm_booking_travelers
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.admin_shares_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_declined_services_admin_peer on public.crm_declined_services;
create policy crm_declined_services_admin_peer on public.crm_declined_services
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.admin_shares_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_visa_requests_admin_peer on public.crm_visa_requests;
create policy crm_visa_requests_admin_peer on public.crm_visa_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.admin_shares_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_tx_admin_wallet on public.crm_transactions;
create policy crm_tx_admin_wallet on public.crm_transactions
  for select to authenticated
  using (
    status = 'posted'
    and customer_id = crm_private.company_wallet_id()
    and crm_private.company_wallet_id() is distinct from crm_private.customer_id()
  );

drop policy if exists crm_billing_companies_admin_wallet on public.crm_billing_companies;
create policy crm_billing_companies_admin_wallet on public.crm_billing_companies
  for select to authenticated
  using (
    customer_id = crm_private.company_wallet_id()
    and crm_private.company_wallet_id() is distinct from crm_private.customer_id()
  );
