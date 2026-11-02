-- Choix depuis l’espace client. Même effet que WhatsApp. Additive. À jouer à la main.

alter table public.crm_restaurant_evenings
  drop constraint if exists crm_restaurant_evenings_source_check;

alter table public.crm_restaurant_evenings
  add constraint crm_restaurant_evenings_source_check
  check (choice_source is null or choice_source in ('whatsapp', 'manuel', 'espace'));
