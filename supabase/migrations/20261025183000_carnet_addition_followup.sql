-- Brouillon WhatsApp quand une prestation rejoint un carnet déjà montré.
-- status planned : rien n’est envoyé. L’agence clique.

alter table public.crm_concierge_followups
  add column if not exists payload jsonb;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'crm_concierge_followups'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table public.crm_concierge_followups drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.crm_concierge_followups
  drop constraint if exists crm_concierge_followups_kind_check;

alter table public.crm_concierge_followups
  add constraint crm_concierge_followups_kind_check
  check (kind in (
    'silence_session',
    'silence_template',
    'predeparture',
    'checkin',
    'feedback',
    'carnet_ajout'
  ));
