-- Recherche des dossiers pour pointer une dépense (Pliant, Revolut, file À pointer).
-- Chaque mot, dans n’importe quel ordre : référence, titre, destination, prénom, nom,
-- nom d’usage, société de la fiche, sociétés rattachées, société facturée du dossier,
-- voyageurs, et nom d’hôtel de la carte. Insensible aux accents (fold_search déjà indexé).
-- service_role seulement : l’écran et le MCP passent par le serveur après requireStaff.

create or replace function public.crm_attach_booking_search(q text, lim integer default 40)
returns table (id uuid)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  letters text;
  compact text;
  tokens text[];
begin
  letters := crm_private.fold_letters(left(coalesce(q, ''), 80));
  compact := regexp_replace(letters, '[^a-z0-9]+', '', 'g');
  select coalesce(array_agg(token), '{}')
    into tokens
  from (
    select distinct token
    from unnest(string_to_array(trim(both ' ' from regexp_replace(letters, '[^a-z0-9]+', ' ', 'g')), ' ')) as token
    where char_length(token) >= 2
    limit 8
  ) picked;

  if coalesce(array_length(tokens, 1), 0) = 0 then
    return;
  end if;

  return query
  with token as (
    select unnest(tokens) as token
  ),
  hit as (
    select b.id as booking_id, tk.token
    from token tk
    join public.crm_bookings b
      on b.status is distinct from 'cancelled'
     and crm_private.fold_search(coalesce(b.reference, '') || ' ' || coalesce(b.title, '') || ' ' || coalesce(b.destination, ''))
         like '%' || tk.token || '%'
    union
    select b.id, tk.token
    from token tk
    join public.crm_customers c
      on crm_private.fold_search(
           coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '') || ' ' || coalesce(c.usage_name, '') || ' ' ||
           coalesce(c.company_name, '') || ' ' || coalesce(c.siret, '')
         ) like '%' || tk.token || '%'
    join public.crm_bookings b
      on b.customer_id = c.id
     and b.status is distinct from 'cancelled'
    union
    select b.id, tk.token
    from token tk
    join public.crm_billing_companies co
      on crm_private.fold_search(coalesce(co.company_name, '') || ' ' || coalesce(co.siret, ''))
         like '%' || tk.token || '%'
    join public.crm_bookings b
      on b.status is distinct from 'cancelled'
     and (b.customer_id = co.customer_id or b.billing_company_id = co.id)
    union
    select b.id, tk.token
    from token tk
    join public.crm_booking_travelers t
      on crm_private.fold_search(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, ''))
         like '%' || tk.token || '%'
    join public.crm_bookings b
      on b.id = t.booking_id
     and b.status is distinct from 'cancelled'
    union
    select b.id, tk.token
    from token tk
    join public.crm_booking_items i
      on crm_private.fold_search(
           coalesce(i.title, '') || ' ' || coalesce(i.confirmation_ref, '') || ' ' || coalesce(i.details->>'hotel_name', '')
         ) like '%' || tk.token || '%'
    join public.crm_bookings b
      on b.id = i.booking_id
     and b.status is distinct from 'cancelled'
  )
  select b.id
  from hit
  join public.crm_bookings b on b.id = hit.booking_id
  group by b.id
  having count(distinct hit.token) = array_length(tokens, 1)
  order by
    case
      when compact <> '' and crm_private.fold_search(coalesce(b.reference, '')) like '%' || compact || '%' then 0
      else 1
    end,
    abs(coalesce(b.start_date, current_date) - current_date),
    b.start_date desc nulls last
  limit least(greatest(coalesce(lim, 40), 1), 80);
end;
$$;

revoke all on function public.crm_attach_booking_search(text, integer) from public, anon, authenticated;
grant execute on function public.crm_attach_booking_search(text, integer) to service_role;

comment on function public.crm_attach_booking_search(text, integer) is
  'Dossiers pour rattacher une dépense. Mots dans n’importe quel ordre, sans accent. service_role.';
