-- Quatre derniers chiffres des cartes libres d'un dossier. Jamais le numéro complet.

alter table public.crm_booking_cards
  add column if not exists last4 text;

alter table public.crm_booking_cards
  drop constraint if exists crm_booking_cards_last4_check;

alter table public.crm_booking_cards
  add constraint crm_booking_cards_last4_check
  check (last4 is null or last4 ~ '^[0-9]{4}$');
