-- Lien court « connexion » : le client n’a pas encore choisi son mot de passe, le message WhatsApp
-- garde son bouton mais le lien ne porte aucun jeton (`token_hash` null, `otp_type = 'connexion'`).
-- L’aperçu est le même ; l’ouverture mène à /connexion avec le retour. Aucune session n’est posée.
-- Additive : à appliquer avant le déploiement du code (l’ancien code refuse un lien sans jeton).

alter table public.crm_entry_links
  alter column token_hash drop not null;

comment on column public.crm_entry_links.token_hash is
  'Jeton Supabase haché. Null : lien « connexion » sans session (mot de passe pas encore choisi), otp_type = connexion.';
