-- Application iOS 1.2 : déverrouillage Face ID et préférences des rappels.
-- Additive. À jouer à la main sur fsmfozxgujskluxakeoq. Rien n’est détruit.
-- Le jeton en clair n’est pas stocké : seulement son empreinte.

create table if not exists public.crm_device_unlocks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null default (now() + interval '400 days'),
  revoked_at timestamptz,
  constraint crm_device_unlocks_hash_key unique (token_hash)
);

create index if not exists crm_device_unlocks_customer_idx
  on public.crm_device_unlocks (customer_id, created_at desc);

alter table public.crm_notification_preferences
  add column if not exists push_checkin boolean not null default true,
  add column if not exists push_flight_change boolean not null default true,
  add column if not exists push_departure boolean not null default true,
  add column if not exists push_balance boolean not null default true;

alter table public.crm_device_unlocks enable row level security;

revoke all on public.crm_device_unlocks from anon, authenticated;
grant all on public.crm_device_unlocks to service_role;

comment on table public.crm_device_unlocks is
  'Empreinte du jeton Face ID / Touch ID. Le secret reste dans le trousseau de l’appareil. Pas de mot de passe, pas de PAN.';
comment on column public.crm_notification_preferences.push_checkin is
  'Rappel d’enregistrement 24 h avant le vol. Vrai par défaut.';
comment on column public.crm_notification_preferences.push_flight_change is
  'Retard et changement de porte. Vrai par défaut.';
comment on column public.crm_notification_preferences.push_departure is
  'Rappel de départ la veille, avec le transfert s’il est connu. Vrai par défaut.';
comment on column public.crm_notification_preferences.push_balance is
  'Rappel du reste à régler. Vrai par défaut.';
