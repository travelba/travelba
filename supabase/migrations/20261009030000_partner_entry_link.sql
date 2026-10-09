-- La preview ouvre le lien partenaire sans le rôle de service de production.
-- Le code du lien est le secret : huit signes, pas une liste.

create or replace function public.crm_read_entry_link(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.crm_entry_links%rowtype;
begin
  if p_code is null or p_code !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then
    return null;
  end if;
  select * into row from public.crm_entry_links where code = p_code;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'token_hash', row.token_hash,
    'otp_type', row.otp_type,
    'next_path', row.next_path,
    'email', row.email,
    'show_cover', row.show_cover,
    'created_at', row.created_at,
    'expires_at', row.expires_at,
    'used_at', row.used_at,
    'revoked_at', row.revoked_at,
    'open_count', row.open_count,
    'channel', row.channel,
    'created_by_staff_id', row.created_by_staff_id
  );
end;
$$;

revoke all on function public.crm_read_entry_link(text) from public;
grant execute on function public.crm_read_entry_link(text) to anon, authenticated, service_role;

comment on function public.crm_read_entry_link(text) is
  'Lit un lien court par son code. Le code est le secret.';

create or replace function public.crm_mark_entry_opened(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code is null or p_code !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$' then
    return;
  end if;
  update public.crm_entry_links
  set used_at = coalesce(used_at, now()),
      open_count = coalesce(open_count, 0) + 1
  where code = p_code;
end;
$$;

revoke all on function public.crm_mark_entry_opened(text) from public;
grant execute on function public.crm_mark_entry_opened(text) to anon, authenticated, service_role;

comment on function public.crm_mark_entry_opened(text) is
  'Compte une ouverture du lien court.';

create or replace function public.crm_finish_staff_password()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.crm_staff where auth_user_id = uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update auth.users
  set raw_app_meta_data =
    coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
      'must_set_password', false,
      'password_set_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'client_onboarding_pending', false
    )
  where id = uid;
end;
$$;

revoke all on function public.crm_finish_staff_password() from public, anon;
grant execute on function public.crm_finish_staff_password() to authenticated;

comment on function public.crm_finish_staff_password() is
  'Un collègue connecté clôt la première définition de mot de passe.';
