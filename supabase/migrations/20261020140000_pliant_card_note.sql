-- Montant d'origine d'une carte hôtel convertie en euros. Jamais un PAN.

alter table public.crm_pliant_cards
  add column if not exists note text;
