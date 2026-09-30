-- Suppression agence = archive. Le dossier, ses cartes et ses fichiers restent.
alter table public.crm_bookings
  add column if not exists archived_at timestamptz;

alter table public.crm_bookings
  add column if not exists archived_was_visible boolean;

comment on column public.crm_bookings.archived_at is
  'Date d’archivage. Null = dossier actif. La suppression agence archive, elle ne détruit pas.';

comment on column public.crm_bookings.archived_was_visible is
  'Visibilité client juste avant l’archive, rétablie à la réactivation.';

create index if not exists crm_bookings_archived_at_idx
  on public.crm_bookings (archived_at)
  where archived_at is not null;

drop policy if exists crm_bookings_self on public.crm_bookings;
create policy crm_bookings_self on public.crm_bookings
  for select to authenticated
  using (
    customer_id = crm_private.customer_id()
    and visible_to_client
    and archived_at is null
  );

drop policy if exists crm_booking_items_self on public.crm_booking_items;
create policy crm_booking_items_self on public.crm_booking_items
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_booking_docs_self on public.crm_booking_documents;
create policy crm_booking_docs_self on public.crm_booking_documents
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_booking_travelers_self on public.crm_booking_travelers;
create policy crm_booking_travelers_self on public.crm_booking_travelers
  for select to authenticated
  using (
    exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.archived_at is null
    )
  );

drop policy if exists crm_declined_services_client on public.crm_declined_services;
create policy crm_declined_services_client on public.crm_declined_services
  for select to authenticated
  using (
    exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_visa_requests_client on public.crm_visa_requests;
create policy crm_visa_requests_client on public.crm_visa_requests
  for select using (
    exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.visible_to_client
        and b.archived_at is null
    )
  );
