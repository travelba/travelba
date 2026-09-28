-- Quatre derniers chiffres pour l'affichage masqué. Jamais le PAN ni le cryptogramme.

alter table public.crm_hotel_arrivals
  add column if not exists card_last4 text;

alter table public.crm_hotel_arrivals
  drop constraint if exists crm_hotel_arrivals_card_last4_check;

alter table public.crm_hotel_arrivals
  add constraint crm_hotel_arrivals_card_last4_check
  check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');
