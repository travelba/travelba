-- Les politiques « select » durcies (statut ≠ brouillon) sont en OU avec la
-- visibilité du carnet. Sans archived_at, le client lirait encore un dossier archivé.
do $$
begin
  if to_regprocedure('crm_private.has_staff_permission(text)') is null then
    return;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_bookings' and policyname = 'crm_bookings_select'
  ) then
    drop policy crm_bookings_select on public.crm_bookings;
    create policy crm_bookings_select on public.crm_bookings
      for select to authenticated
      using (
        crm_private.has_staff_permission('bookings')
        or crm_private.has_staff_permission('quotes')
        or crm_private.has_staff_permission('finance')
        or crm_private.has_staff_permission('operations')
        or crm_private.has_staff_permission('mtrip')
        or (
          customer_id = crm_private.customer_id()
          and status <> 'draft'
          and archived_at is null
        )
      );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_booking_items' and policyname = 'crm_booking_items_select'
  ) then
    drop policy crm_booking_items_select on public.crm_booking_items;
    create policy crm_booking_items_select on public.crm_booking_items
      for select to authenticated
      using (
        crm_private.has_staff_permission('bookings')
        or exists (
          select 1 from public.crm_bookings b
          where b.id = booking_id
            and b.customer_id = crm_private.customer_id()
            and b.status <> 'draft'
            and b.archived_at is null
        )
      );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_booking_documents' and policyname = 'crm_booking_documents_select'
  ) then
    drop policy crm_booking_documents_select on public.crm_booking_documents;
    create policy crm_booking_documents_select on public.crm_booking_documents
      for select to authenticated
      using (
        crm_private.has_staff_permission('bookings')
        or (
          visible_to_client
          and exists (
            select 1 from public.crm_bookings b
            where b.id = booking_id
              and b.customer_id = crm_private.customer_id()
              and b.status <> 'draft'
              and b.archived_at is null
          )
        )
      );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_booking_travelers' and policyname = 'crm_booking_travelers_select'
  ) then
    drop policy crm_booking_travelers_select on public.crm_booking_travelers;
    create policy crm_booking_travelers_select on public.crm_booking_travelers
      for select to authenticated
      using (
        crm_private.has_staff_permission('bookings')
        or exists (
          select 1 from public.crm_bookings b
          where b.id = booking_id
            and b.customer_id = crm_private.customer_id()
            and b.status <> 'draft'
            and b.archived_at is null
        )
      );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_mtrip_publications' and policyname = 'crm_mtrip_publications_customer_select'
  ) then
    drop policy crm_mtrip_publications_customer_select on public.crm_mtrip_publications;
    create policy crm_mtrip_publications_customer_select on public.crm_mtrip_publications
      for select to authenticated
      using (
        state = 'published'
        and exists (
          select 1 from public.crm_bookings b
          where b.id = booking_id
            and b.customer_id = crm_private.customer_id()
            and b.status <> 'draft'
            and b.archived_at is null
        )
      );
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'crm_full_credits' and policyname = 'crm_full_credits_client_select'
  ) then
    drop policy crm_full_credits_client_select on public.crm_full_credits;
    create policy crm_full_credits_client_select on public.crm_full_credits
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
  end if;
end $$;
