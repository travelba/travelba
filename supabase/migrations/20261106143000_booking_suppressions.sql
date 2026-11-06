-- Un dossier supprimé volontairement ne doit pas être recréé par l’import.
-- La référence et les confirmations (hôtel, PNR, Little Emperors) restent le souvenir.

create table if not exists public.crm_booking_suppressions (
  id uuid primary key default gen_random_uuid(),
  reference text,
  confirmation_refs text[] not null default '{}',
  le_booking_ids bigint[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists crm_booking_suppressions_reference_idx
  on public.crm_booking_suppressions (reference);

alter table public.crm_booking_suppressions enable row level security;

drop policy if exists crm_booking_suppressions_staff on public.crm_booking_suppressions;
create policy crm_booking_suppressions_staff on public.crm_booking_suppressions
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

grant select, insert, update, delete on public.crm_booking_suppressions to authenticated;

insert into public.crm_booking_suppressions (reference, confirmation_refs)
select 'TB-2026-0147', array['2049BB90500']
where not exists (
  select 1 from public.crm_booking_suppressions where reference = 'TB-2026-0147'
);
