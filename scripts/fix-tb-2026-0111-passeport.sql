-- Correctif de données TB-2026-0111. À jouer à la main. Non appliqué.
-- Le passeport du titulaire est au coffre, sans nom, et le voyageur n’est pas marqué titulaire.
-- Le compagnon cité est le doublon du titulaire : on ne le retire que s’il n’a aucune pièce.
-- Aucun message n’est envoyé.

begin;

update public.crm_booking_travelers
set is_account_holder = true,
    companion_id = null
where id = '91b5c78b-83b1-4151-a43f-5c2d1a160c77'
  and booking_id = 'f9ebf984-228a-4148-bb04-3b045dbd189f';

insert into public.crm_travel_documents (
  customer_id,
  companion_id,
  booking_id,
  traveler_id,
  doc_type,
  number,
  issuing_country,
  issued_on,
  expires_on,
  first_name,
  last_name,
  usage_name,
  birth_date,
  nationality,
  sex,
  place_of_birth,
  authority,
  personal_number,
  storage_path,
  file_name,
  mime_type
)
select
  customer_id,
  null,
  'f9ebf984-228a-4148-bb04-3b045dbd189f',
  '91b5c78b-83b1-4151-a43f-5c2d1a160c77',
  doc_type,
  number,
  issuing_country,
  issued_on,
  expires_on,
  first_name,
  last_name,
  usage_name,
  birth_date,
  nationality,
  sex,
  place_of_birth,
  authority,
  personal_number,
  storage_path,
  file_name,
  mime_type
from public.crm_travel_documents
where id = '6ff710fb-84b7-45f3-ae87-7b4877e83f77'
  and customer_id = '49bd7666-9fd4-4c0b-a06c-f68bd45a7d94'
  and booking_id is null
  and doc_type = 'passport'
  and not exists (
    select 1
    from public.crm_travel_documents already
    where already.customer_id = '49bd7666-9fd4-4c0b-a06c-f68bd45a7d94'
      and already.booking_id = 'f9ebf984-228a-4148-bb04-3b045dbd189f'
      and already.traveler_id = '91b5c78b-83b1-4151-a43f-5c2d1a160c77'
      and already.doc_type = 'passport'
  );

delete from public.crm_travel_companions as companion
where companion.id = '9449eff4-17ea-46e2-b8d7-2b4295bf03dc'
  and companion.customer_id = '49bd7666-9fd4-4c0b-a06c-f68bd45a7d94'
  and not exists (
    select 1
    from public.crm_travel_documents as piece
    where piece.companion_id = companion.id
  );

commit;
