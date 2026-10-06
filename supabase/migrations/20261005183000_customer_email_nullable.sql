-- Une confirmation sans e-mail voyageur crée quand même la fiche.
-- L'unicité reste : plusieurs fiches sans e-mail sont permises (NULL distincts).
alter table public.crm_customers alter column email drop not null;

comment on column public.crm_customers.email is
  'Vide tant que le mail fournisseur n''a pas d''adresse voyageur. Pas d''invitation dans ce cas.';
