-- Clés API nominatives du MCP CRM. Le secret n’est jamais stocké : seulement
-- un préfixe visible et l’empreinte SHA-256. Une clé révoquée ou expirée
-- ne s’authentifie plus. Écriture service_role, après un administrateur.

create table if not exists public.crm_mcp_api_keys (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.crm_staff (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  key_prefix text not null check (key_prefix ~ '^tbk_[a-f0-9]{8}$'),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  created_by uuid references public.crm_staff (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz
);

comment on table public.crm_mcp_api_keys is
  'Clés MCP par collègue. Préfixe visible, empreinte seulement. Jamais la clé en clair.';
comment on column public.crm_mcp_api_keys.key_prefix is
  'Préfixe visible tbk_ et huit hexadécimaux. Sert à retrouver la ligne, pas à s’authentifier.';
comment on column public.crm_mcp_api_keys.key_hash is
  'SHA-256 hexadécimal de la clé complète. La clé en clair n’est pas conservée.';

create unique index if not exists crm_mcp_api_keys_prefix_idx
  on public.crm_mcp_api_keys (key_prefix);
create index if not exists crm_mcp_api_keys_staff_idx
  on public.crm_mcp_api_keys (staff_id, created_at desc);

alter table public.crm_mcp_api_keys enable row level security;

revoke all on public.crm_mcp_api_keys from anon, authenticated, public;
grant all on public.crm_mcp_api_keys to service_role;
