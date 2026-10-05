-- B-06 : plus de code maître ADMIN_CLIENT_CODE. Un agent connecté ouvre l’espace d’un client
-- depuis sa fiche : lien court `channel = 'desk'`, 10 minutes, une ouverture, créé par un agent
-- identifié. L’ouverture est journalisée avec cet agent.
-- Additive : à appliquer avant le déploiement du code (l’ancien code ignore ces colonnes).

alter table public.crm_entry_links
  add column if not exists created_by_staff_id uuid references public.crm_staff (id) on delete set null;

alter table public.crm_entry_links
  drop constraint if exists crm_entry_links_channel_check;
alter table public.crm_entry_links
  add constraint crm_entry_links_channel_check
  check (channel is null or channel in ('email', 'whatsapp', 'desk'));

comment on column public.crm_entry_links.created_by_staff_id is
  'Agent qui a créé le lien (ouverture de l’espace client par l’agence, channel = desk).';

alter table public.crm_customer_logins
  add column if not exists staff_id uuid references public.crm_staff (id) on delete set null;

comment on column public.crm_customer_logins.staff_id is
  'Agent à l’origine de la connexion (méthode desk). Null pour une connexion du client.';

create index if not exists crm_entry_links_created_by_staff_idx
  on public.crm_entry_links (created_by_staff_id)
  where created_by_staff_id is not null;
