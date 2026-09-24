-- Lien court /e/CODE vers le callback d’accès. Service role seulement.

create table if not exists public.crm_entry_links (
  code text primary key,
  token_hash text not null,
  otp_type text not null,
  next_path text not null,
  created_at timestamptz not null default now()
);

alter table public.crm_entry_links enable row level security;

revoke all on public.crm_entry_links from anon, authenticated;
grant all on public.crm_entry_links to service_role;
