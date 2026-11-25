-- TBA - Travel Club : invitations de parrainage et plafond.
-- Additive. Le décompte par défaut est l’envoi (`envoi`). `validee` ne compte que les filleuls validés.
-- À jouer à la main, après 20261123210000_signup_requests.sql.

alter table public.crm_signup_invitations
  add column if not exists kind text not null default 'admin',
  add column if not exists referrer_customer_id uuid references public.crm_customers (id) on delete set null;

alter table public.crm_signup_invitations drop constraint if exists crm_signup_invitations_kind_check;
alter table public.crm_signup_invitations
  add constraint crm_signup_invitations_kind_check
  check (kind in ('admin', 'parrainage'));

comment on column public.crm_signup_invitations.kind is
  'admin : invitation de l’agence. parrainage : invitation au nom d’un membre, plafonnée.';
comment on column public.crm_signup_invitations.referrer_customer_id is
  'Membre qui parraine. Vide pour une invitation de l’agence.';

create index if not exists crm_signup_invitations_referrer_idx
  on public.crm_signup_invitations (referrer_customer_id)
  where kind = 'parrainage';

alter table public.crm_signup_settings
  add column if not exists referral_count_mode text not null default 'envoi';

alter table public.crm_signup_settings drop constraint if exists crm_signup_settings_count_mode_check;
alter table public.crm_signup_settings
  add constraint crm_signup_settings_count_mode_check
  check (referral_count_mode in ('envoi', 'validee'));

comment on column public.crm_signup_settings.referral_count_mode is
  'envoi : une invitation de parrainage est décomptée dès l’envoi. validee : seules les demandes validées comptent. Plafond 10, à vie.';
