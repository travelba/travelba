-- Liens courts /e/CODE : expiration, premier usage, révocation (B-01).
-- Un lien magique vit 24 h, une invitation ou une réinitialisation 30 jours.
-- Après le premier usage, le jeton ne se régénère que 15 minutes
-- (le temps que l’aperçu WhatsApp et le navigateur se succèdent).
-- Service role seulement, comme le reste de la table.

alter table public.crm_entry_links
  add column if not exists expires_at timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists revoked_at timestamptz;

update public.crm_entry_links
  set expires_at = created_at + interval '30 days'
  where expires_at is null;

create index if not exists crm_entry_links_expires_idx
  on public.crm_entry_links (expires_at);

comment on column public.crm_entry_links.expires_at is
  'Après cette date, le lien court ne s’ouvre plus (24 h magique, 30 j invitation / réinitialisation).';

comment on column public.crm_entry_links.used_at is
  'Première ouverture réussie. Un nouveau jeton n’est régénéré que 15 min après.';

comment on column public.crm_entry_links.revoked_at is
  'Posé par l’agence pour couper un lien avant son expiration.';
