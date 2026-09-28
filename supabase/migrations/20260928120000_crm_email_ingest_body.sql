-- Corps du mail fournisseur, pour la relecture agence. Staff seulement (RLS existante).

alter table public.crm_email_ingest
  add column if not exists body_text text,
  add column if not exists body_html text;
