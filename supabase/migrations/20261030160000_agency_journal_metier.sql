-- Journal métier : une étiquette lisible par action (option posée, carte émise, paiement reçu…), un montant,
-- les quatre derniers chiffres d’une carte, le dossier lié, et le nom d’un connecteur quand l’auteur n’est pas
-- un collègue. Additive seulement : colonnes nullables sur crm_agency_journal, rien n’est réécrit.
-- Le scellement append-only de 20261030090000 reste ; le sceau couvre désormais aussi ces champs.
-- Les lignes déjà écrites gardent leur canonical stocké : la chaîne existante reste vérifiable telle quelle.
-- Idempotente. Ne touche pas le registre clé/valeur de production (voir scripts/check-migrations.mjs).

alter table public.crm_agency_journal add column if not exists kind text;
alter table public.crm_agency_journal
  add column if not exists booking_id uuid references public.crm_bookings (id) on delete set null;
alter table public.crm_agency_journal add column if not exists amount_cents bigint;
alter table public.crm_agency_journal add column if not exists currency text;
alter table public.crm_agency_journal add column if not exists card_last4 text;
alter table public.crm_agency_journal add column if not exists actor_label text;

-- Jamais un numéro complet : quatre chiffres, pas un de plus. La devise est un code ISO. L’étiquette est un slug.
alter table public.crm_agency_journal drop constraint if exists crm_agency_journal_card_last4_check;
alter table public.crm_agency_journal
  add constraint crm_agency_journal_card_last4_check
  check (card_last4 is null or card_last4 ~ '^[0-9]{4}$');

alter table public.crm_agency_journal drop constraint if exists crm_agency_journal_currency_check;
alter table public.crm_agency_journal
  add constraint crm_agency_journal_currency_check
  check (currency is null or currency ~ '^[A-Z]{3}$');

alter table public.crm_agency_journal drop constraint if exists crm_agency_journal_kind_check;
alter table public.crm_agency_journal
  add constraint crm_agency_journal_kind_check
  check (kind is null or kind ~ '^[a-z][a-z0-9_]{1,59}$');

alter table public.crm_agency_journal drop constraint if exists crm_agency_journal_actor_label_check;
alter table public.crm_agency_journal
  add constraint crm_agency_journal_actor_label_check
  check (actor_label is null or (length(actor_label) between 1 and 80 and actor_label !~ '[0-9]{13,19}'));

create index if not exists crm_agency_journal_booking_idx
  on public.crm_agency_journal (booking_id, seq desc)
  where booking_id is not null;
create index if not exists crm_agency_journal_occurred_idx
  on public.crm_agency_journal (occurred_at desc);
create index if not exists crm_agency_journal_kind_idx
  on public.crm_agency_journal (kind, seq desc)
  where kind is not null;

-- Même calcul que lib/crm/agency-journal.ts (journalCanonical) : les anciens champs d’abord, puis les nouveaux.
create or replace function crm_private.seal_agency_journal()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  prev text;
begin
  perform pg_advisory_xact_lock(84221024);
  select j.row_hash into prev
  from public.crm_agency_journal j
  order by j.seq desc
  limit 1;

  if new.summary ~ '[0-9]{13,19}' then
    new.summary := regexp_replace(new.summary, '[0-9]{13,19}', '••••', 'g');
  end if;
  if new.diff is not null and new.diff::text ~ '[0-9]{13,19}' then
    new.diff := '{"masked":true}'::jsonb;
  end if;
  if new.card_last4 is not null and new.card_last4 !~ '^[0-9]{4}$' then
    new.card_last4 := null;
  end if;

  new.canonical := new.action
    || '|' || new.entity_type
    || '|' || coalesce(new.entity_id, '')
    || '|' || new.summary
    || '|' || coalesce(new.diff::text, '')
    || '|' || coalesce(new.kind, '')
    || '|' || coalesce(new.booking_id::text, '')
    || '|' || coalesce(new.amount_cents::text, '')
    || '|' || coalesce(new.currency, '')
    || '|' || coalesce(new.card_last4, '')
    || '|' || coalesce(new.actor_label, '');
  new.prev_hash := prev;
  new.row_hash := encode(
    extensions.digest(convert_to(coalesce(prev, '') || '|' || new.canonical, 'UTF8'), 'sha256'),
    'hex'
  );
  if new.occurred_at is null then
    new.occurred_at := now();
  end if;
  return new;
end;
$$;

-- Les lignes rattachées à un dossier par booking_id se lisent par toute l’agence, comme celles d’entité dossier.
drop policy if exists crm_agency_journal_read on public.crm_agency_journal;
create policy crm_agency_journal_read on public.crm_agency_journal
  for select to authenticated
  using (
    crm_private.agency_allows('view_journal')
    or staff_id = crm_private.agency_staff_id()
    or (crm_private.is_staff() and (entity_type in ('dossier', 'client') or booking_id is not null))
  );

-- Droit « Voir l’activité de l’agence » : la page Activité et le résumé de chaque agent. Administrateur seulement
-- par défaut ; la grille Équipe peut l’ouvrir à un autre rôle.
insert into public.crm_role_permissions (role, permission, allowed)
select r.role, 'view_activity', r.role = 'admin'
from unnest(array['admin', 'manager', 'agent', 'comptable', 'lecture']) as r(role)
on conflict (role, permission) do nothing;

comment on column public.crm_agency_journal.kind is
  'Étiquette métier (option_posee, carte_emise, paiement_recu…). Lisible ; la liste vit dans lib/crm/agency-journal.ts.';
comment on column public.crm_agency_journal.booking_id is
  'Dossier lié, quelle que soit l’entité (carte, paiement, e-mail). Null : hors dossier.';
comment on column public.crm_agency_journal.amount_cents is
  'Montant en centimes, signé comme la ligne (crédit positif). Null : sans montant.';
comment on column public.crm_agency_journal.card_last4 is
  'Quatre derniers chiffres d’une carte. Jamais le numéro complet ni le CVC.';
comment on column public.crm_agency_journal.actor_label is
  'Auteur hors équipe (connecteur, cron). Null quand staff_id est renseigné.';
