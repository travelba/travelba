-- Carnet : types train / voiture / bateau, visibilité séjour + cartes.

alter table public.crm_booking_items
  drop constraint if exists crm_booking_items_kind_check;

alter table public.crm_booking_items
  add constraint crm_booking_items_kind_check
  check (
    kind in (
      'flight',
      'hotel',
      'transfer',
      'activity',
      'rail',
      'car',
      'cruise',
      'insurance',
      'fee'
    )
  );

-- Dossiers existants restent visibles ; les nouveaux naissent en brouillon.
alter table public.crm_bookings
  add column if not exists visible_to_client boolean not null default true;

alter table public.crm_bookings
  alter column visible_to_client set default false;

alter table public.crm_booking_items
  add column if not exists visible_to_client boolean not null default true;

alter table public.crm_booking_items
  alter column visible_to_client set default false;

alter table public.crm_booking_items
  add column if not exists source_document_id uuid
    references public.crm_booking_documents (id) on delete set null;

drop policy if exists crm_bookings_self on public.crm_bookings;
create policy crm_bookings_self on public.crm_bookings
  for select to authenticated
  using (
    customer_id = crm_private.customer_id()
    and visible_to_client
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
    )
  );
