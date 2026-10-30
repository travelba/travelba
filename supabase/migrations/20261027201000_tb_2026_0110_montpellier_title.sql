-- TB-2026-0110 : le titre reprend la ville du séjour.
-- La couverture n’est pas stockée : Montpellier est au catalogue (photo-city-montpellier).
-- Idempotent. Une seconde exécution ne change rien et n’ajoute pas de ligne d’audit.
-- À jouer à la main après relecture. Le déploiement ne l’applique pas.

do $$
declare
  fixed_id uuid;
  fixed_customer uuid;
  has_entity boolean;
  detail jsonb := jsonb_build_object(
    'reference', 'TB-2026-0110',
    'titre_avant', 'Hôtel Richer de Belleval',
    'titre_apres', 'Montpellier',
    'couverture', 'photo-city-montpellier'
  );
begin
  update public.crm_bookings
  set title = 'Montpellier'
  where reference = 'TB-2026-0110'
    and title = 'Hôtel Richer de Belleval'
    and destination = 'Montpellier'
  returning id, customer_id into fixed_id, fixed_customer;

  if fixed_id is null then
    return;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'crm_audit_events'
      and column_name = 'entity_type'
  ) into has_entity;

  if has_entity then
    insert into public.crm_audit_events (
      actor_kind, action, entity_type, entity_id, booking_id, customer_id, summary, detail
    ) values (
      'auto',
      'titre_dossier',
      'booking',
      fixed_id::text,
      fixed_id,
      fixed_customer,
      'Titre du dossier TB-2026-0110 : Montpellier',
      detail
    );
  else
    insert into public.crm_audit_events (
      actor_kind, action, booking_id, customer_id, summary, detail
    ) values (
      'auto',
      'titre_dossier',
      fixed_id,
      fixed_customer,
      'Titre du dossier TB-2026-0110 : Montpellier',
      detail
    );
  end if;
end $$;
