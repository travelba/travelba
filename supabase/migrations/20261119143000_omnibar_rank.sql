-- Barre de recherche agence : prénom, nom, les deux ordres, société, e-mail,
-- téléphone, référence, voyageurs et accompagnants.
-- Chaque mot compte (ET). Sans accent ni casse. Pertinence : mot entier, puis préfixe, puis fragment.
-- À jouer à la main. Tant qu’elle n’est pas appliquée, l’application classe elle-même
-- (lib/crm/directory-search.ts) et ignore l’ancienne fonction, qui coupait à 5 fiches par nom de famille.
-- Pas d’extension d’accent (stable, inutilisable dans un index). fold_letters reste immutable.
-- Les index trigrammes déjà posés ne sont pas reconstruits : le volume tient dans un parcours.

create or replace function crm_private.search_phone_words(value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  with digits as (
    select regexp_replace(coalesce(value, ''), '\D', '', 'g') as d
  ),
  national as (
    select
      d,
      case
        when d like '0033%' and char_length(d) > 4 then substr(d, 5)
        when d like '33%' and char_length(d) >= 11 then substr(d, 3)
        when d like '0%' and char_length(d) > 1 then substr(d, 2)
        else d
      end as n
    from digits
  )
  select case
    when char_length(d) < 4 then ''
    else trim(both ' ' from d || ' ' || n || ' 0' || n)
  end
  from national;
$$;

-- 0 mot entier, 1 préfixe, 2 fragment, null si absent.
create or replace function crm_private.search_token_rank(hay text, token text)
returns integer
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when coalesce(token, '') = '' or coalesce(btrim(hay), '') = '' then null
    when exists (
      select 1 from unnest(string_to_array(hay, ' ')) as word
      where word = token
    ) then 0
    when exists (
      select 1 from unnest(string_to_array(hay, ' ')) as word
      where word like token || '%'
    ) then 1
    when hay like '%' || token || '%' then 2
    else null
  end;
$$;

-- Le moins bon mot. Null si un mot manque (ET).
create or replace function crm_private.search_rank(hay text, tokens text[])
returns integer
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when coalesce(array_length(tokens, 1), 0) = 0 then null
    when exists (
      select 1
      from unnest(tokens) as token
      where crm_private.search_token_rank(hay, token) is null
    ) then null
    else (
      select max(crm_private.search_token_rank(hay, token))
      from unnest(tokens) as token
    )
  end;
$$;

revoke all on function crm_private.search_phone_words(text) from public, anon;
revoke all on function crm_private.search_token_rank(text, text) from public, anon;
revoke all on function crm_private.search_rank(text, text[]) from public, anon;
grant execute on function crm_private.search_phone_words(text) to authenticated, service_role;
grant execute on function crm_private.search_token_rank(text, text) to authenticated, service_role;
grant execute on function crm_private.search_rank(text, text[]) to authenticated, service_role;

create or replace function public.crm_omnibar_suggest(q text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  raw text;
  letters text;
  digits text;
  tokens text[];
  clients jsonb;
  dossiers jsonb;
  voyageurs jsonb;
begin
  if not crm_private.is_staff() then
    return jsonb_build_object('v', 2, 'clients', '[]'::jsonb, 'dossiers', '[]'::jsonb, 'voyageurs', '[]'::jsonb);
  end if;

  raw := left(btrim(coalesce(q, '')), 80);
  letters := crm_private.fold_letters(raw);
  digits := regexp_replace(raw, '\D', '', 'g');
  if letters !~ '[a-z]' and char_length(digits) >= 4 then
    if digits like '0033%' and char_length(digits) > 4 then
      digits := substr(digits, 5);
    end if;
    if digits like '33%' and char_length(digits) >= 11 then
      digits := substr(digits, 3);
    elsif digits like '0%' and char_length(digits) > 1 then
      digits := substr(digits, 2);
    end if;
    tokens := array[digits];
  else
    select coalesce(array_agg(token), '{}')
      into tokens
    from (
      select distinct token
      from unnest(string_to_array(trim(both ' ' from regexp_replace(letters, '[^a-z0-9]+', ' ', 'g')), ' ')) as token
      where char_length(token) >= 2
      limit 8
    ) picked;
  end if;

  if coalesce(array_length(tokens, 1), 0) = 0 then
    return jsonb_build_object('v', 2, 'clients', '[]'::jsonb, 'dossiers', '[]'::jsonb, 'voyageurs', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg((to_jsonb(row) - 'rank') order by row.rank, row.last_name, row.first_name), '[]'::jsonb)
    into clients
  from (
    select
      c.id,
      c.first_name,
      c.last_name,
      coalesce(hit.company_name, nullif(btrim(c.company_name), '')) as company_name,
      coalesce(hit.siret, nullif(btrim(c.siret), '')) as siret,
      crm_private.search_rank(hay.blob, tokens) as rank
    from public.crm_customers c
    left join lateral (
      select string_agg(
        coalesce(b.company_name, '') || ' ' || coalesce(b.siret, '') || ' ' || coalesce(b.registration_number, ''),
        ' '
      ) as blob
      from public.crm_billing_companies b
      where b.customer_id = c.id
    ) companies on true
    left join lateral (
      select string_agg(
        coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') || ' ' || coalesce(p.usage_name, ''),
        ' '
      ) as blob
      from public.crm_travel_companions p
      where p.customer_id = c.id
    ) people on true
    left join lateral (
      select b.company_name, b.siret
      from public.crm_billing_companies b
      where b.customer_id = c.id
        and crm_private.search_rank(
          crm_private.fold_search(coalesce(b.company_name, '') || ' ' || coalesce(b.siret, '') || ' ' || coalesce(b.registration_number, '')),
          tokens
        ) is not null
      order by b.sort_order, b.created_at
      limit 1
    ) hit on true
    cross join lateral (
      select crm_private.fold_search(
        coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '') || ' ' ||
        coalesce(c.last_name, '') || ' ' || coalesce(c.first_name, '') || ' ' ||
        coalesce(c.usage_name, '') || ' ' || coalesce(c.company_name, '') || ' ' || coalesce(c.siret, '') || ' ' ||
        coalesce(c.email, '') || ' ' || coalesce(companies.blob, '') || ' ' || coalesce(people.blob, '')
      ) || ' ' ||
      crm_private.fold_search(crm_private.search_phone_words(c.phone)) || ' ' ||
      crm_private.fold_search(crm_private.search_phone_words(c.phone_secondary)) as blob
    ) hay
    where crm_private.search_rank(hay.blob, tokens) is not null
    order by 6, c.last_name, c.first_name
    limit 20
  ) row;

  select coalesce(jsonb_agg((to_jsonb(row) - 'rank') order by row.rank, row.start_date desc nulls last), '[]'::jsonb)
    into dossiers
  from (
    select
      b.id,
      b.reference,
      b.title,
      b.destination,
      b.start_date,
      b.end_date,
      b.archived_at,
      crm_private.search_rank(hay.blob, tokens) as rank
    from public.crm_bookings b
    left join public.crm_customers c on c.id = b.customer_id
    left join lateral (
      select string_agg(
        coalesce(co.company_name, '') || ' ' || coalesce(co.siret, '') || ' ' || coalesce(co.registration_number, ''),
        ' '
      ) as blob
      from public.crm_billing_companies co
      where co.customer_id = c.id
    ) companies on true
    left join lateral (
      select string_agg(
        coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') || ' ' || coalesce(p.usage_name, ''),
        ' '
      ) as blob
      from public.crm_travel_companions p
      where p.customer_id = c.id
    ) people on true
    left join lateral (
      select string_agg(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, ''), ' ') as blob
      from public.crm_booking_travelers t
      where t.booking_id = b.id
    ) guests on true
    cross join lateral (
      select crm_private.fold_search(
        coalesce(b.reference, '') || ' ' || coalesce(b.title, '') || ' ' || coalesce(b.destination, '') || ' ' ||
        coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '') || ' ' ||
        coalesce(c.last_name, '') || ' ' || coalesce(c.first_name, '') || ' ' ||
        coalesce(c.usage_name, '') || ' ' || coalesce(c.company_name, '') || ' ' || coalesce(c.email, '') || ' ' ||
        coalesce(companies.blob, '') || ' ' || coalesce(people.blob, '') || ' ' || coalesce(guests.blob, '')
      ) || ' ' ||
      crm_private.fold_search(crm_private.search_phone_words(c.phone)) || ' ' ||
      crm_private.fold_search(crm_private.search_phone_words(c.phone_secondary)) as blob
    ) hay
    where crm_private.search_rank(hay.blob, tokens) is not null
    order by 8, b.start_date desc nulls last
    limit 20
  ) row;

  select coalesce(jsonb_agg(to_jsonb(row) - 'rank' order by row.rank, row.last_name, row.first_name), '[]'::jsonb)
    into voyageurs
  from (
    select *
    from (
      select
        p.id,
        'companion'::text as source,
        p.first_name,
        p.last_name,
        p.customer_id,
        null::uuid as booking_id,
        null::text as reference,
        null::text as booking_title,
        nullif(btrim(p.relationship), '') as relationship,
        trim(both ' ' from coalesce(cu.first_name, '') || ' ' || coalesce(cu.last_name, '')) as context,
        crm_private.search_rank(
          crm_private.fold_search(
            coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') || ' ' || coalesce(p.usage_name, '') || ' ' ||
            coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '')
          ),
          tokens
        ) as rank
      from public.crm_travel_companions p
      join public.crm_customers cu on cu.id = p.customer_id
      where crm_private.search_rank(
        crm_private.fold_search(
          coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '') || ' ' || coalesce(p.usage_name, '') || ' ' ||
          coalesce(p.last_name, '') || ' ' || coalesce(p.first_name, '')
        ),
        tokens
      ) is not null
      order by 11, p.last_name, p.first_name
      limit 20
    ) companions
    union all
    select *
    from (
      select
        t.id,
        'traveler'::text as source,
        t.first_name,
        t.last_name,
        b.customer_id,
        t.booking_id,
        b.reference,
        coalesce(nullif(btrim(b.title), ''), b.destination) as booking_title,
        null::text as relationship,
        b.reference as context,
        crm_private.search_rank(
          crm_private.fold_search(
            coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '') || ' ' ||
            coalesce(t.last_name, '') || ' ' || coalesce(t.first_name, '')
          ),
          tokens
        ) as rank
      from public.crm_booking_travelers t
      join public.crm_bookings b on b.id = t.booking_id
      where coalesce(t.is_account_holder, false) = false
        and crm_private.search_rank(
          crm_private.fold_search(
            coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '') || ' ' ||
            coalesce(t.last_name, '') || ' ' || coalesce(t.first_name, '')
          ),
          tokens
        ) is not null
        and not exists (
          select 1
          from public.crm_travel_companions c
          where c.customer_id = b.customer_id
            and crm_private.fold_search(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))
              = crm_private.fold_search(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, ''))
        )
      order by 11, t.last_name, t.first_name
      limit 20
    ) guests
    order by rank, last_name, first_name
    limit 20
  ) row;

  return jsonb_build_object('v', 2, 'clients', clients, 'dossiers', dossiers, 'voyageurs', voyageurs);
end;
$$;

revoke all on function public.crm_omnibar_suggest(text) from public, anon;
grant execute on function public.crm_omnibar_suggest(text) to authenticated, service_role;

comment on function public.crm_omnibar_suggest(text) is
  'Suggestions agence, v2 : mots en ET, sans accent, pertinence mot entier puis préfixe puis fragment. Staff seulement.';
