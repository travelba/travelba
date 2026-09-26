-- E-mail du titulaire, à côté du jeton. Sert à rouvrir la session
-- si l’aperçu a déjà consommé le lien magique. Service role seulement.

alter table public.crm_entry_links
  add column if not exists email text;

alter table public.crm_entry_links
  add column if not exists show_cover boolean not null default false;

comment on column public.crm_entry_links.email is
  'Titulaire. Un POST qui ne peut plus vérifier le jeton ouvre une session pour cet e-mail.';

comment on column public.crm_entry_links.show_cover is
  'Vrai seulement pour le message « Votre séjour » : l’aperçu peut montrer la couverture.';
