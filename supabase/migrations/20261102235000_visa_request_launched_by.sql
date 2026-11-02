-- Qui a lancé la formalité à la place du client. Null si le client a confirmé.
-- Pas d’e-mail, pas de numéro de passeport.
-- Déjà appliquée en production sous la version 20261102165047.
-- Les colonnes sont ajoutées seulement si elles manquent.

alter table public.crm_visa_requests
  add column if not exists launched_by uuid references public.crm_staff (id) on delete set null;

alter table public.crm_visa_requests
  add column if not exists launched_by_name text;

comment on column public.crm_visa_requests.launched_by is
  'Membre qui a lancé la formalité à la place du client. Null si le client a confirmé.';

comment on column public.crm_visa_requests.launched_by_name is
  'Nom du membre au moment du lancement. Pas d’e-mail.';
