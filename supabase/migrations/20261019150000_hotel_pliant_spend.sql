-- Lecture staff des achats Pliant rattachés à un hôtel (carte du séjour, lien carte, coût pointé).
-- Montant, statut et date seulement : pas de numéro de carte, pas de commerçant.
-- Le pipeline de déploiement n’applique pas les migrations : à jouer à la main sur Supabase.

create or replace function public.crm_hotel_pliant_spend(
  item_ids uuid[],
  request_ids uuid[]
)
returns table (
  booking_item_id uuid,
  hotel_request_id uuid,
  transaction_id uuid,
  status text,
  type text,
  billing_cents bigint,
  billing_currency text,
  booked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not crm_private.is_staff() then
    return;
  end if;

  return query
  with items as (
    select distinct u.item_id as id
    from unnest(coalesce(item_ids, '{}'::uuid[])) as u(item_id)
    where u.item_id is not null
    limit 80
  ),
  requests as (
    select distinct u.request_id as id
    from unnest(coalesce(request_ids, '{}'::uuid[])) as u(request_id)
    where u.request_id is not null
    limit 80
  ),
  linked as (
    select a.booking_item_id, null::uuid as hotel_request_id, a.pliant_card_id as card_id
    from public.crm_hotel_arrivals a
    join items i on i.id = a.booking_item_id
    where a.pliant_card_id is not null
      and length(btrim(a.pliant_card_id)) > 0
    union
    select cl.booking_item_id, cl.hotel_request_id, cl.pliant_card_id
    from public.crm_card_links cl
    where cl.source = 'pliant'
      and cl.pliant_card_id is not null
      and length(btrim(cl.pliant_card_id)) > 0
      and (
        cl.booking_item_id in (select items.id from items)
        or cl.hotel_request_id in (select requests.id from requests)
      )
  )
  select distinct
    linked.booking_item_id,
    linked.hotel_request_id,
    t.id,
    t.status,
    t.type,
    t.billing_cents,
    t.billing_currency,
    t.booked_at
  from linked
  join public.crm_pliant_transactions t
    on t.card_id = linked.card_id
    or t.pliant_card_id = linked.card_id
  union
  select distinct
    tc.booking_item_id,
    null::uuid,
    t.id,
    t.status,
    t.type,
    t.billing_cents,
    t.billing_currency,
    t.booked_at
  from public.crm_trip_costs tc
  join items i on i.id = tc.booking_item_id
  join public.crm_pliant_transactions t on t.id::text = tc.source_id
  where tc.source = 'pliant';
end;
$$;

comment on function public.crm_hotel_pliant_spend(uuid[], uuid[]) is
  'Achats Pliant d’un hôtel pour l’agence. Staff seulement. Sans numéro de carte.';

revoke all on function public.crm_hotel_pliant_spend(uuid[], uuid[]) from public;
revoke all on function public.crm_hotel_pliant_spend(uuid[], uuid[]) from anon;
grant execute on function public.crm_hotel_pliant_spend(uuid[], uuid[]) to authenticated;
