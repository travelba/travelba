-- Avertissement Amadeus : la facture fournisseur soldée ne se déplace pas.
-- La pièce reste liée au séjour. Ce n’est pas un échec de préparation.

alter table public.crm_mb3m_pieces
  add column if not exists warning text;
