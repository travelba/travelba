-- Référence de la pro forma MB3M liée à une facture groupée.
-- À jouer à la main. Ne pas appliquer depuis l’agent.
-- Sans ces colonnes, le CRM crée quand même la pièce et renvoie son numéro :
-- il n’est pas gardé, et la fenêtre le dit.

alter table public.crm_grouped_invoices
  add column if not exists mb3m_piece_number text,
  add column if not exists mb3m_piece_uid text,
  add column if not exists mb3m_folder_id text,
  add column if not exists mb3m_customer_uid text,
  add column if not exists mb3m_error text;

comment on column public.crm_grouped_invoices.mb3m_piece_number is
  'Numéro de la pro forma MB3M. Jamais une pièce imprimée, validée ou finalisée.';
comment on column public.crm_grouped_invoices.mb3m_error is
  'Dernière erreur MB3M, en français. Vide quand la pro forma est en place.';
