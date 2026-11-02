-- SID des modèles WhatsApp déposés depuis le serveur.
-- Un réglage, pas une variable : l’envoi le lit sans redéploiement.
-- HX… seulement. Pas de jeton Twilio, pas de secret.

create table if not exists public.crm_whatsapp_content_sids (
  env_name text primary key,
  content_sid text not null check (content_sid ~ '^HX[A-Za-z0-9]{8,80}$'),
  friendly_name text not null,
  updated_at timestamptz not null default now()
);

comment on table public.crm_whatsapp_content_sids is
  'SID Twilio (HX) des modèles déposés par l’agence. Service role. Repli : variable d’environnement du même nom.';

alter table public.crm_whatsapp_content_sids enable row level security;

revoke all on public.crm_whatsapp_content_sids from anon, authenticated, public;
grant all on public.crm_whatsapp_content_sids to service_role;
