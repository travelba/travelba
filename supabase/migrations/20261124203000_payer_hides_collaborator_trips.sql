-- Le payeur d’une société ne lit plus le carnet de ses collaborateurs.
-- Il lit un dossier d’un autre titulaire seulement s’il y voyage, et seulement s’il est montré.
-- visible_to_client n’est pas modifié : seul « Montrer au client » montre une carte.
-- À jouer à la main. Tant que cette migration n’est pas appliquée, une lecture PostgREST
-- avec le jeton du client peut encore voir ces dossiers. L’espace ne les demande plus.

comment on column public.crm_customers.billing_parent_id is
  'Pour company_role=member : fiche admin / wallet société qui paie. Le payeur voit les dépenses, pas le carnet.';

create or replace function crm_private.travels_on_booking(booking uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crm_customers me
    join public.crm_booking_travelers traveler on traveler.booking_id = booking
    where me.id = crm_private.customer_id()
      and booking is not null
      and btrim(coalesce(me.first_name, '')) <> ''
      and btrim(coalesce(traveler.first_name, '')) <> ''
      and btrim(coalesce(traveler.last_name, '')) <> ''
      and (
        (
          btrim(coalesce(me.last_name, '')) <> ''
          and crm_private.fold_search(coalesce(traveler.first_name, '') || ' ' || coalesce(traveler.last_name, ''))
            = crm_private.fold_search(coalesce(me.first_name, '') || ' ' || coalesce(me.last_name, ''))
        )
        or (
          btrim(coalesce(me.usage_name, '')) <> ''
          and crm_private.fold_search(coalesce(traveler.first_name, '') || ' ' || coalesce(traveler.last_name, ''))
            = crm_private.fold_search(coalesce(me.first_name, '') || ' ' || coalesce(me.usage_name, ''))
        )
      )
  );
$$;

comment on function crm_private.travels_on_booking(uuid) is
  'Vrai si le client connecté est voyageur de ce dossier, prénom et nom repliés. Pas le seul nom.';

revoke all on function crm_private.travels_on_booking(uuid) from public, anon;
grant execute on function crm_private.travels_on_booking(uuid) to authenticated;

drop policy if exists crm_bookings_admin_collaborator on public.crm_bookings;
drop policy if exists crm_booking_items_admin_collaborator on public.crm_booking_items;
drop policy if exists crm_booking_docs_admin_collaborator on public.crm_booking_documents;
drop policy if exists crm_booking_travelers_admin_collaborator on public.crm_booking_travelers;
drop policy if exists crm_declined_services_admin_collaborator on public.crm_declined_services;
drop policy if exists crm_visa_requests_admin_collaborator on public.crm_visa_requests;

drop function if exists crm_private.sees_collaborator_trip(uuid);

drop policy if exists crm_bookings_as_traveler on public.crm_bookings;
create policy crm_bookings_as_traveler on public.crm_bookings
  for select to authenticated
  using (
    crm_private.travels_on_booking(id)
    and visible_to_client
    and archived_at is null
  );

drop policy if exists crm_booking_items_as_traveler on public.crm_booking_items;
create policy crm_booking_items_as_traveler on public.crm_booking_items
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.travels_on_booking(b.id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_booking_docs_as_traveler on public.crm_booking_documents;
create policy crm_booking_docs_as_traveler on public.crm_booking_documents
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.travels_on_booking(b.id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_booking_travelers_as_traveler on public.crm_booking_travelers;
create policy crm_booking_travelers_as_traveler on public.crm_booking_travelers
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.travels_on_booking(b.id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_declined_services_as_traveler on public.crm_declined_services;
create policy crm_declined_services_as_traveler on public.crm_declined_services
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.travels_on_booking(b.id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_visa_requests_as_traveler on public.crm_visa_requests;
create policy crm_visa_requests_as_traveler on public.crm_visa_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.travels_on_booking(b.id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );
