-- Lignes envoyées à MB3M (libellé, montant, marge, note) : l’avoir reprend la pièce imprimée telle quelle.
alter table public.crm_mb3m_pieces
  add column if not exists lines jsonb not null default '[]'::jsonb;
