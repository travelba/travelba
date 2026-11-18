-- Le même reçu d’aller-retour peut être lié à la carte aller et à la carte retour.
-- L’empreinte ne se répète pas deux fois sur la même carte.

drop index if exists public.crm_booking_documents_booking_sha_uidx;

create unique index if not exists crm_booking_documents_booking_sha_item_uidx
  on public.crm_booking_documents (
    booking_id,
    content_sha256,
    coalesce(booking_item_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where content_sha256 is not null;
