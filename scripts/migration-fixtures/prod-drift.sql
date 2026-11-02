-- Objets présents en production hors migrations : registre de réglages clé/valeur, vide.
create table if not exists public.crm_agency_settings (
  key text primary key,
  label text,
  value jsonb,
  secret_configured boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
-- Rôles réels en production : admin et partner seulement.
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'admin@travelba.fr'),
  ('00000000-0000-4000-8000-000000000002', 'partner@exemple.invalid')
on conflict do nothing;
insert into public.crm_staff (auth_user_id, role, full_name) values
  ('00000000-0000-4000-8000-000000000001', 'admin', 'Admin'),
  ('00000000-0000-4000-8000-000000000002', 'partner', 'Partner')
on conflict do nothing;
