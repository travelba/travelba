-- Un seul appel Auth0 à la fois. Les autres passages relisent le jeton déjà gardé.
-- Le verrou expire tout seul si le demandeur s’arrête.

create or replace function public.crm_claim_integration_refresh(p_provider text, p_until timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted boolean;
begin
  if p_provider is null or length(btrim(p_provider)) = 0 or p_until is null then
    return false;
  end if;

  insert into public.crm_integrations (provider, extra)
  values (p_provider, jsonb_build_object('token_refresh_until', p_until))
  on conflict (provider) do nothing;
  inserted := found;
  if inserted then
    return true;
  end if;

  update public.crm_integrations
  set extra = coalesce(extra, '{}'::jsonb) || jsonb_build_object('token_refresh_until', p_until),
      updated_at = now()
  where provider = p_provider
    and (
      coalesce(extra->>'token_refresh_until', '') = ''
      or (
        extra->>'token_refresh_until' ~ '^\d{4}-\d{2}-\d{2}'
        and (extra->>'token_refresh_until')::timestamptz <= now()
      )
    );
  return found;
end;
$$;

revoke all on function public.crm_claim_integration_refresh(text, timestamptz) from public, anon, authenticated;
grant execute on function public.crm_claim_integration_refresh(text, timestamptz) to service_role;
