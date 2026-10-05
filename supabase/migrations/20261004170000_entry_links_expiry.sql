-- Liens courts /e/CODE : expiration, usage, révocation, canal (B-01, C-01).
-- Un lien magique vit 24 h, une invitation ou une réinitialisation 30 jours.
-- Dans ce délai, le jeton Supabase consommé est régénéré jusqu’à 5 ouvertures
-- (aperçu WhatsApp, scanner d’e-mail, puis le vrai client). Une session déjà
-- ouverte passe sans consommer le lien. `channel` dit par où le lien est parti :
-- ouvrir un lien WhatsApp vaut opt-in (le client a reçu et ouvert le message).
-- Service role seulement, comme le reste de la table.

alter table public.crm_entry_links
  add column if not exists expires_at timestamptz,
  add column if not exists used_at timestamptz,
  add column if not exists revoked_at timestamptz,
  add column if not exists open_count int not null default 0,
  add column if not exists channel text;

alter table public.crm_entry_links
  drop constraint if exists crm_entry_links_channel_check;
alter table public.crm_entry_links
  add constraint crm_entry_links_channel_check
  check (channel is null or channel in ('email', 'whatsapp'));

update public.crm_entry_links
  set expires_at = created_at + case
    when otp_type = 'magiclink' then interval '24 hours'
    else interval '30 days'
  end
  where expires_at is null;

create index if not exists crm_entry_links_expires_idx
  on public.crm_entry_links (expires_at);

comment on column public.crm_entry_links.expires_at is
  'Après cette date, le lien court ne s’ouvre plus (24 h magique, 30 j invitation / réinitialisation).';

comment on column public.crm_entry_links.used_at is
  'Première ouverture réussie.';

comment on column public.crm_entry_links.revoked_at is
  'Posé par l’agence pour couper un lien avant son expiration.';

comment on column public.crm_entry_links.open_count is
  'Ouvertures réussies. Au-delà de 5, le lien ne s’ouvre plus.';

comment on column public.crm_entry_links.channel is
  'email | whatsapp : par où le lien est parti. Ouvrir un lien whatsapp pose whatsapp_opt_in_at.';

-- Journal des lectures de carte : écrit par le service role à chaque lecture (B-05).
grant all on public.crm_card_views to service_role;

-- Historique des connexions : le mode desk (code agence) est désormais journalisé (C-03 / B-06).
alter table public.crm_customer_logins
  drop constraint if exists crm_customer_logins_method_check;
alter table public.crm_customer_logins
  add constraint crm_customer_logins_method_check check (
    method in ('password', 'magiclink', 'invite', 'recovery', 'entry', 'precedent', 'desk')
  );
