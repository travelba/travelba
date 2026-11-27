-- Pause, prise en main, interrupteur IA et journal du suivi.
-- Le journal ne garde que le texte montré à l’agence. Pas de secret.

alter table public.crm_train_requests
  add column if not exists pause boolean not null default false,
  add column if not exists prise_en_main boolean not null default false,
  add column if not exists ia boolean,
  add column if not exists journal jsonb not null default '[]'::jsonb;

comment on column public.crm_train_requests.pause is
  'Pause : aucun message automatique, ni relance ni réponse IA.';
comment on column public.crm_train_requests.prise_en_main is
  'L’agence a coupé l’automatique, réponse IA comprise.';
comment on column public.crm_train_requests.ia is
  'null suit le réglage global. false coupe l’IA sur cette demande.';
comment on column public.crm_train_requests.journal is
  'Lignes du suivi : texte, ia, at. Pas de clé, pas de numéro de pièce.';
