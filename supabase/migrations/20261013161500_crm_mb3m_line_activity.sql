-- Activité MB3M de chaque ligne de la facture de compte.
-- La production suit le fichier agence. La base de test garde son activité unique.

alter table public.crm_mb3m_account_lines
  add column if not exists activity_id integer;
