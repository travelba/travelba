-- Prix des cartes et forfait du séjour.
-- À jouer à la main, seulement avec l’accord de Raphael.
-- Sans ces colonnes, le CRM continue : le mode d’une carte est dans details.price_mode.
-- La visibilité (visible_to_client) n’est pas modifiée.
-- Les frais de billeterie déjà en dossier ne sont pas supprimés.

alter table public.crm_booking_items
  add column if not exists price_mode text;

alter table public.crm_booking_items
  drop constraint if exists crm_booking_items_price_mode_check;

alter table public.crm_booking_items
  add constraint crm_booking_items_price_mode_check
  check (price_mode is null or price_mode = any (array['avec'::text, 'sans'::text]));

-- Reprise : un mode déjà écrit dans details gagne.
-- Sinon un prix de vente non nul devient « Avec prix », le reste « Sans prix ».
update public.crm_booking_items
set price_mode = case
  when details->>'price_mode' = any (array['avec', 'sans']) then details->>'price_mode'
  when amount is not null and amount <> 0 then 'avec'
  else 'sans'
end
where price_mode is null;

alter table public.crm_booking_items
  alter column price_mode set default 'sans';

comment on column public.crm_booking_items.price_mode is
  'avec : prix de vente obligatoire et ligne de transaction, même si la carte est masquée. sans : aucun prix pour le client.';

alter table public.crm_bookings
  add column if not exists price_mode text not null default 'cartes';

alter table public.crm_bookings
  drop constraint if exists crm_bookings_price_mode_check;

alter table public.crm_bookings
  add constraint crm_bookings_price_mode_check
  check (price_mode = any (array['cartes'::text, 'forfait'::text]));

alter table public.crm_bookings
  add column if not exists forfait_amount numeric(12, 2);

comment on column public.crm_bookings.price_mode is
  'cartes : un prix par carte. forfait : un seul prix de voyage, une seule ligne de transaction.';

comment on column public.crm_bookings.forfait_amount is
  'Prix de vente unique du voyage quand price_mode vaut forfait.';
