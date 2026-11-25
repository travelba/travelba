-- Comptes jumeaux : deux fiches distinctes, deux accès, les mêmes dossiers.
-- Une ligne par paire (uuid le plus petit d’abord). Aucun dossier copié, aucun second débit.
-- À jouer à la main. Le CRM répond sans la table : l’espace ne voit alors que ses propres dossiers.

create table if not exists public.crm_customer_twins (
  customer_a uuid not null references public.crm_customers (id) on delete cascade,
  customer_b uuid not null references public.crm_customers (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (customer_a, customer_b),
  constraint crm_customer_twins_order check (customer_a < customer_b)
);

comment on table public.crm_customer_twins is
  'Paire de fiches qui voient les mêmes dossiers dans l’espace client. Accès séparés. Un seul dossier, un seul grand livre.';

create index if not exists crm_customer_twins_b_idx
  on public.crm_customer_twins (customer_b);

alter table public.crm_customer_twins enable row level security;

revoke all on table public.crm_customer_twins from public, anon, authenticated;
grant select on table public.crm_customer_twins to authenticated;
grant all on table public.crm_customer_twins to service_role;

drop policy if exists crm_customer_twins_staff on public.crm_customer_twins;
create policy crm_customer_twins_staff on public.crm_customer_twins
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_customer_twins_self on public.crm_customer_twins;
create policy crm_customer_twins_self on public.crm_customer_twins
  for select to authenticated
  using (
    customer_a = crm_private.customer_id()
    or customer_b = crm_private.customer_id()
  );

create or replace function crm_private.sees_twin_trip(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.crm_customer_twins pair
    where crm_private.customer_id() is not null
      and owner is not null
      and owner <> crm_private.customer_id()
      and pair.customer_a = least(crm_private.customer_id(), owner)
      and pair.customer_b = greatest(crm_private.customer_id(), owner)
  );
$$;

comment on function crm_private.sees_twin_trip(uuid) is
  'Vrai si la fiche connectée est jumelée avec le titulaire du dossier. Lecture seule.';

revoke all on function crm_private.sees_twin_trip(uuid) from public, anon;
grant execute on function crm_private.sees_twin_trip(uuid) to authenticated;

-- Même visibilité que le titulaire : séjour montré, non archivé. Une carte cachée reste cachée.

drop policy if exists crm_bookings_twin on public.crm_bookings;
create policy crm_bookings_twin on public.crm_bookings
  for select to authenticated
  using (
    crm_private.sees_twin_trip(customer_id)
    and visible_to_client
    and archived_at is null
  );

drop policy if exists crm_booking_items_twin on public.crm_booking_items;
create policy crm_booking_items_twin on public.crm_booking_items
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.sees_twin_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_booking_docs_twin on public.crm_booking_documents;
create policy crm_booking_docs_twin on public.crm_booking_documents
  for select to authenticated
  using (
    visible_to_client
    and exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.sees_twin_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_booking_travelers_twin on public.crm_booking_travelers;
create policy crm_booking_travelers_twin on public.crm_booking_travelers
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.sees_twin_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_declined_services_twin on public.crm_declined_services;
create policy crm_declined_services_twin on public.crm_declined_services
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.sees_twin_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );

drop policy if exists crm_visa_requests_twin on public.crm_visa_requests;
create policy crm_visa_requests_twin on public.crm_visa_requests
  for select to authenticated
  using (
    exists (
      select 1
      from public.crm_bookings b
      where b.id = booking_id
        and crm_private.sees_twin_trip(b.customer_id)
        and b.visible_to_client
        and b.archived_at is null
    )
  );
