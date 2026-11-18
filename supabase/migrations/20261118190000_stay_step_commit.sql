-- Deux cartes (aller et retour) peuvent porter le même PDF.
-- booking_item_id est ON DELETE SET NULL : supprimer les deux cartes
-- mettait les deux pièces à NULL et cassait l’index unique
-- (booking_id, empreinte, coalesce(item, zéro)).
-- L’empreinte reste unique par carte. Les pièces sans carte ne se heurtent plus.
-- crm_commit_stay_steps applique retrait, suppression, modification et création
-- dans une seule transaction.

drop index if exists public.crm_booking_documents_booking_sha_item_uidx;

create unique index crm_booking_documents_booking_sha_item_uidx
  on public.crm_booking_documents (booking_id, content_sha256, booking_item_id)
  where content_sha256 is not null
    and booking_item_id is not null;

create or replace function public.crm_commit_stay_steps(
  p_booking_id uuid,
  p_updates jsonb,
  p_deleted jsonb,
  p_created jsonb,
  p_release jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row jsonb;
  v_id uuid;
  v_new uuid;
  v_ids jsonb := '{}'::jsonb;
  v_client text;
begin
  if p_booking_id is null then
    raise exception 'Dossier requis' using errcode = '22023';
  end if;

  -- D’abord les doublons d’empreinte, avant le DELETE (SET NULL).
  update public.crm_booking_documents as doc
  set
    visible_to_client = false,
    booking_item_id = null,
    content_sha256 = case
      when coalesce((released.value->>'clear_sha')::boolean, false) then null
      else doc.content_sha256
    end,
    extracted = case
      when jsonb_exists(released.value, 'extracted') then released.value->'extracted'
      else doc.extracted
    end
  from jsonb_array_elements(coalesce(p_release, '[]'::jsonb)) as released(value)
  where doc.booking_id = p_booking_id
    and doc.id = nullif(released.value->>'id', '')::uuid;

  delete from public.crm_booking_items
  where booking_id = p_booking_id
    and id in (
      select jsonb_array_elements_text(coalesce(p_deleted, '[]'::jsonb))::uuid
    );

  for v_row in
    select value from jsonb_array_elements(coalesce(p_updates, '[]'::jsonb))
  loop
    v_id := nullif(v_row->>'id', '')::uuid;
    update public.crm_booking_items
    set
      kind = case when jsonb_exists(v_row, 'kind') then v_row->>'kind' else kind end,
      title = case when jsonb_exists(v_row, 'title') then v_row->>'title' else title end,
      supplier = case when jsonb_exists(v_row, 'supplier') then nullif(v_row->>'supplier', '') else supplier end,
      confirmation_ref = case when jsonb_exists(v_row, 'confirmation_ref') then nullif(v_row->>'confirmation_ref', '') else confirmation_ref end,
      start_at = case when jsonb_exists(v_row, 'start_at') then nullif(v_row->>'start_at', '')::timestamptz else start_at end,
      end_at = case when jsonb_exists(v_row, 'end_at') then nullif(v_row->>'end_at', '')::timestamptz else end_at end,
      amount = case when jsonb_exists(v_row, 'amount') then nullif(v_row->>'amount', '')::numeric else amount end,
      include_in_ledger = case when jsonb_exists(v_row, 'include_in_ledger') then coalesce((v_row->>'include_in_ledger')::boolean, false) else include_in_ledger end,
      sort_order = case when jsonb_exists(v_row, 'sort_order') then coalesce((v_row->>'sort_order')::integer, 0) else sort_order end,
      details = case when jsonb_exists(v_row, 'details') then coalesce(v_row->'details', '{}'::jsonb) else details end,
      visible_to_client = case when jsonb_exists(v_row, 'visible_to_client') then coalesce((v_row->>'visible_to_client')::boolean, false) else visible_to_client end,
      billing_company_id = case when jsonb_exists(v_row, 'billing_company_id') then nullif(v_row->>'billing_company_id', '')::uuid else billing_company_id end
    where id = v_id
      and booking_id = p_booking_id;
    if not found then
      raise exception 'Carte introuvable' using errcode = 'P0002';
    end if;
  end loop;

  for v_row in
    select value from jsonb_array_elements(coalesce(p_created, '[]'::jsonb))
  loop
    insert into public.crm_booking_items (
      booking_id,
      kind,
      title,
      supplier,
      confirmation_ref,
      start_at,
      end_at,
      amount,
      include_in_ledger,
      sort_order,
      details,
      visible_to_client,
      billing_company_id
    ) values (
      p_booking_id,
      v_row->>'kind',
      coalesce(v_row->>'title', ''),
      nullif(v_row->>'supplier', ''),
      nullif(v_row->>'confirmation_ref', ''),
      nullif(v_row->>'start_at', '')::timestamptz,
      nullif(v_row->>'end_at', '')::timestamptz,
      nullif(v_row->>'amount', '')::numeric,
      coalesce((v_row->>'include_in_ledger')::boolean, false),
      coalesce((v_row->>'sort_order')::integer, 0),
      coalesce(v_row->'details', '{}'::jsonb),
      coalesce((v_row->>'visible_to_client')::boolean, false),
      nullif(v_row->>'billing_company_id', '')::uuid
    )
    returning id into v_new;
    v_client := coalesce(v_row->>'client_id', '');
    if v_client <> '' then
      v_ids := v_ids || jsonb_build_object(v_client, v_new);
    end if;
  end loop;

  return jsonb_build_object('ids', v_ids);
end;
$$;

revoke all on function public.crm_commit_stay_steps(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.crm_commit_stay_steps(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;

comment on function public.crm_commit_stay_steps(uuid, jsonb, jsonb, jsonb, jsonb) is
  'Enregistre les étapes d’un dossier dans une transaction : pièces retirées, cartes supprimées, modifiées, créées.';
