-- Restore the voyage/mTrip tables renamed by the initial CRM migration.
-- The CRM uses its own crm_* namespace, so these products do not conflict.
do $$
declare
  table_name text;
  original_name text;
begin
  foreach table_name in array array[
    'legacy_agency_mtrip_guides',
    'legacy_agency_clients',
    'legacy_agency_dossiers',
    'legacy_agency_dossier_hotels',
    'legacy_agency_quotes',
    'legacy_agency_bookings',
    'legacy_agency_hotel_contacts',
    'legacy_agency_payment_followups',
    'legacy_agency_wa_ops_sessions'
  ]
  loop
    original_name := substring(table_name from 8);
    if to_regclass(format('public.%I', table_name)) is not null
      and to_regclass(format('public.%I', original_name)) is null
    then
      execute format(
        'alter table public.%I rename to %I',
        table_name,
        original_name
      );
    end if;
  end loop;
end $$;
