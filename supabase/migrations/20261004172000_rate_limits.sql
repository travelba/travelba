-- B-09 / C-19 : limitation de débit persistante (partagée entre les lambdas Vercel).
-- Une ligne par clé (hachée côté serveur : jamais d’e-mail ni d’IP en clair).
-- Service role seulement. Purge possible : delete where window_started_at < now() - interval '1 day'.

create table if not exists public.crm_rate_limits (
  key text primary key,
  hits int not null default 0,
  window_started_at timestamptz not null default now()
);

comment on table public.crm_rate_limits is
  'Compteurs de tentatives par clé hachée (otp, reset, contact, relais géo). Service role.';

create index if not exists crm_rate_limits_window_idx
  on public.crm_rate_limits (window_started_at);

alter table public.crm_rate_limits enable row level security;

revoke all on public.crm_rate_limits from anon, authenticated, public;
grant all on public.crm_rate_limits to service_role;

-- Incrémente dans la fenêtre courante, repart de 1 si la fenêtre est passée.
-- Renvoie true si la tentative est autorisée (hits <= p_limit).
create or replace function public.crm_rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_hits int;
begin
  if p_key is null or length(btrim(p_key)) = 0
     or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds < 1 then
    return true;
  end if;

  insert into public.crm_rate_limits as r (key, hits, window_started_at)
  values (p_key, 1, now())
  on conflict (key) do update
    set hits = case
        when r.window_started_at + make_interval(secs => p_window_seconds) <= now() then 1
        else r.hits + 1
      end,
      window_started_at = case
        when r.window_started_at + make_interval(secs => p_window_seconds) <= now() then now()
        else r.window_started_at
      end
  returning hits into current_hits;

  return current_hits <= p_limit;
end;
$$;

revoke all on function public.crm_rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.crm_rate_limit_hit(text, int, int) to service_role;
