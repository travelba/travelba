-- Suggestions de la barre de recherche agence : clients, dossiers, voyageurs.
-- Insensible aux accents et à la casse, fragment de référence compris (« 0088 »).
-- Index trigrammes sur l’expression repliée. Lecture staff seulement (is_staff + RLS).

create extension if not exists pg_trgm with schema extensions;

-- Lettres repliées : minuscules, sans accent français. Immutable (pas unaccent, qui est stable).
create or replace function crm_private.fold_letters(value text)
returns text
language sql
immutable
parallel safe
as $$
  select translate(
    replace(replace(lower(coalesce(value, '')), 'œ', 'oe'), 'æ', 'ae'),
    'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ',
    'aaaaaaeeeeiiiiooooouuuuyycn'
  );
$$;

-- « Bensaïd » → « bensaid bensaid ». « TB-2026-0088 » → « tb 2026 0088 tb20260088 ».
create or replace function crm_private.fold_search(value text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when coalesce(btrim(value), '') = '' then ''
    else
      trim(both ' ' from regexp_replace(crm_private.fold_letters(value), '[^a-z0-9]+', ' ', 'g'))
      || ' '
      || regexp_replace(crm_private.fold_letters(value), '[^a-z0-9]+', '', 'g')
  end;
$$;

create or replace function crm_private.omnibar_matches(hay text, spaced text, compact text)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(hay, '') like '%' || coalesce(spaced, '') || '%'
    or (
      coalesce(compact, '') <> ''
      and coalesce(compact, '') <> coalesce(spaced, '')
      and coalesce(hay, '') like '%' || compact || '%'
    );
$$;

revoke all on function crm_private.fold_letters(text) from public, anon;
revoke all on function crm_private.fold_search(text) from public, anon;
revoke all on function crm_private.omnibar_matches(text, text, text) from public, anon;
grant execute on function crm_private.fold_letters(text) to authenticated, service_role;
grant execute on function crm_private.fold_search(text) to authenticated, service_role;
grant execute on function crm_private.omnibar_matches(text, text, text) to authenticated, service_role;

create index if not exists crm_customers_omnibar_trgm
  on public.crm_customers
  using gin (
    crm_private.fold_search(
      coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(usage_name, '') || ' ' ||
      coalesce(company_name, '') || ' ' || coalesce(siret, '')
    ) extensions.gin_trgm_ops
  );

create index if not exists crm_billing_companies_omnibar_trgm
  on public.crm_billing_companies
  using gin (
    crm_private.fold_search(coalesce(company_name, '') || ' ' || coalesce(siret, ''))
    extensions.gin_trgm_ops
  );

create index if not exists crm_bookings_omnibar_trgm
  on public.crm_bookings
  using gin (
    crm_private.fold_search(coalesce(reference, '') || ' ' || coalesce(title, '') || ' ' || coalesce(destination, ''))
    extensions.gin_trgm_ops
  );

create index if not exists crm_booking_items_omnibar_trgm
  on public.crm_booking_items
  using gin (
    crm_private.fold_search(
      coalesce(title, '') || ' ' || coalesce(confirmation_ref, '') || ' ' || coalesce(details->>'hotel_name', '')
    ) extensions.gin_trgm_ops
  );

create index if not exists crm_companions_omnibar_trgm
  on public.crm_travel_companions
  using gin (
    crm_private.fold_search(coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(usage_name, ''))
    extensions.gin_trgm_ops
  );

create index if not exists crm_booking_travelers_omnibar_trgm
  on public.crm_booking_travelers
  using gin (
    crm_private.fold_search(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
    extensions.gin_trgm_ops
  );

create or replace function public.crm_omnibar_suggest(q text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  letters text;
  spaced text;
  compact text;
  clients jsonb;
  dossiers jsonb;
  voyageurs jsonb;
begin
  if not crm_private.is_staff() then
    return jsonb_build_object('clients', '[]'::jsonb, 'dossiers', '[]'::jsonb, 'voyageurs', '[]'::jsonb);
  end if;

  letters := crm_private.fold_letters(left(coalesce(q, ''), 80));
  spaced := trim(both ' ' from regexp_replace(letters, '[^a-z0-9]+', ' ', 'g'));
  compact := regexp_replace(letters, '[^a-z0-9]+', '', 'g');
  if length(compact) < 2 then
    return jsonb_build_object('clients', '[]'::jsonb, 'dossiers', '[]'::jsonb, 'voyageurs', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(to_jsonb(row) order by row.last_name, row.first_name), '[]'::jsonb)
    into clients
  from (
    select
      c.id,
      c.first_name,
      c.last_name,
      coalesce(hit.company_name, nullif(btrim(c.company_name), '')) as company_name,
      coalesce(hit.siret, nullif(btrim(c.siret), '')) as siret
    from public.crm_customers c
    left join lateral (
      select b.company_name, b.siret
      from public.crm_billing_companies b
      where b.customer_id = c.id
        and crm_private.omnibar_matches(
          crm_private.fold_search(coalesce(b.company_name, '') || ' ' || coalesce(b.siret, '')),
          spaced,
          compact
        )
      order by b.sort_order, b.created_at
      limit 1
    ) hit on true
    where hit.company_name is not null
      or hit.siret is not null
      or crm_private.omnibar_matches(
        crm_private.fold_search(
          coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '') || ' ' || coalesce(c.usage_name, '') || ' ' ||
          coalesce(c.company_name, '') || ' ' || coalesce(c.siret, '')
        ),
        spaced,
        compact
      )
    order by c.last_name, c.first_name
    limit 5
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
      case
        when crm_private.omnibar_matches(crm_private.fold_search(coalesce(b.reference, '')), spaced, compact) then 0
        else 1
      end as rank
    from public.crm_bookings b
    where crm_private.omnibar_matches(
        crm_private.fold_search(coalesce(b.reference, '') || ' ' || coalesce(b.title, '') || ' ' || coalesce(b.destination, '')),
        spaced,
        compact
      )
      or exists (
        select 1
        from public.crm_booking_items i
        where i.booking_id = b.id
          and crm_private.omnibar_matches(
            crm_private.fold_search(
              coalesce(i.title, '') || ' ' || coalesce(i.confirmation_ref, '') || ' ' || coalesce(i.details->>'hotel_name', '')
            ),
            spaced,
            compact
          )
      )
    order by 8, b.start_date desc nulls last
    limit 5
  ) row;

  select coalesce(jsonb_agg(to_jsonb(row) - 'ord' order by row.ord, row.last_name, row.first_name), '[]'::jsonb)
    into voyageurs
  from (
    select *
    from (
      select
        c.id,
        'companion'::text as source,
        c.first_name,
        c.last_name,
        c.customer_id,
        null::uuid as booking_id,
        null::text as reference,
        null::text as booking_title,
        nullif(btrim(c.relationship), '') as relationship,
        trim(both ' ' from coalesce(cu.first_name, '') || ' ' || coalesce(cu.last_name, '')) as context,
        0 as ord
      from public.crm_travel_companions c
      join public.crm_customers cu on cu.id = c.customer_id
      where crm_private.omnibar_matches(
        crm_private.fold_search(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '') || ' ' || coalesce(c.usage_name, '')),
        spaced,
        compact
      )
      order by c.last_name, c.first_name
      limit 5
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
        1 as ord
      from public.crm_booking_travelers t
      join public.crm_bookings b on b.id = t.booking_id
      where coalesce(t.is_account_holder, false) = false
        and crm_private.omnibar_matches(
          crm_private.fold_search(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')),
          spaced,
          compact
        )
        and not exists (
          select 1
          from public.crm_travel_companions c
          where c.customer_id = b.customer_id
            and crm_private.fold_search(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))
              = crm_private.fold_search(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, ''))
        )
      order by t.last_name, t.first_name
      limit 5
    ) guests
    order by ord, last_name, first_name
    limit 5
  ) row;

  return jsonb_build_object('clients', clients, 'dossiers', dossiers, 'voyageurs', voyageurs);
end;
$$;

revoke all on function public.crm_omnibar_suggest(text) from public, anon;
grant execute on function public.crm_omnibar_suggest(text) to authenticated, service_role;

comment on function public.crm_omnibar_suggest(text) is
  'Suggestions de la barre agence : 5 clients, 5 dossiers, 5 voyageurs. Staff seulement.';
