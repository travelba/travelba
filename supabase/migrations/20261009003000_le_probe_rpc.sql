-- Actualiser : le partenaire enregistre la lecture sans le rôle de service.
-- La preview ignore ce rôle pour les autres secrets.

create or replace function public.crm_record_le_probe(
  p_status integer,
  p_error text,
  p_ok_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (crm_private.is_staff() or crm_private.is_partner()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_status is null or p_status < 100 or p_status > 599 then
    raise exception 'status' using errcode = '22023';
  end if;
  insert into public.crm_le_sync as s (provider, last_status, last_error, last_ok_at)
  values (
    'little_emperors',
    p_status,
    nullif(left(coalesce(p_error, ''), 400), ''),
    p_ok_at
  )
  on conflict (provider) do update
    set last_status = excluded.last_status,
        last_error = excluded.last_error,
        last_ok_at = excluded.last_ok_at;
end;
$$;

revoke all on function public.crm_record_le_probe(integer, text, timestamptz) from public, anon;
grant execute on function public.crm_record_le_probe(integer, text, timestamptz) to authenticated;

comment on function public.crm_record_le_probe(integer, text, timestamptz) is
  'Résultat d’Actualiser pour l’agence ou le partenaire. Aucun secret.';
