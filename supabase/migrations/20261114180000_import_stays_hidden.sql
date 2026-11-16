-- Les imports, fusions, crons et outils (rôle service_role) ne peuvent pas
-- rendre un dossier, une carte ou une pièce visible. Une ligne déjà visible
-- le reste. Le clic « Montrer au client » passe par la session du personnel
-- (rôle authenticated), pas par service_role.
-- À appliquer seulement avec l’accord explicite du propriétaire.

alter table public.crm_booking_travelers
  add column if not exists proposed boolean not null default false;

comment on column public.crm_booking_travelers.proposed is
  'Voyageur posé par un import ou une fusion. Le client ne le voit pas tant que l’agence ne l’a pas validé.';

create or replace function crm_private.block_service_role_show()
returns trigger
language plpgsql
as $$
begin
  if auth.role() is distinct from 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.visible_to_client is true then
    new.visible_to_client := false;
  elsif tg_op = 'UPDATE'
    and new.visible_to_client is true
    and coalesce(old.visible_to_client, false) is not true then
    new.visible_to_client := false;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_bookings_block_service_show on public.crm_bookings;
create trigger crm_bookings_block_service_show
  before insert or update on public.crm_bookings
  for each row execute function crm_private.block_service_role_show();

drop trigger if exists crm_booking_items_block_service_show on public.crm_booking_items;
create trigger crm_booking_items_block_service_show
  before insert or update on public.crm_booking_items
  for each row execute function crm_private.block_service_role_show();

drop trigger if exists crm_booking_documents_block_service_show on public.crm_booking_documents;
create trigger crm_booking_documents_block_service_show
  before insert or update on public.crm_booking_documents
  for each row execute function crm_private.block_service_role_show();

drop policy if exists crm_booking_travelers_self on public.crm_booking_travelers;
create policy crm_booking_travelers_self on public.crm_booking_travelers
  for select to authenticated
  using (
    proposed is not true
    and exists (
      select 1 from public.crm_bookings b
      where b.id = booking_id
        and b.customer_id = crm_private.customer_id()
        and b.visible_to_client
    )
  );
