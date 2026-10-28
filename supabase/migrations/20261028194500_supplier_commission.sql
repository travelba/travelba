-- Commission IATA à recevoir du fournisseur, une ligne par carte.
-- Table à part : le client peut lire ses cartes (select *). Ces montants n’y sont pas.
-- Personnel seulement. Pas de taux par défaut.

create table if not exists public.crm_booking_item_commissions (
  booking_item_id uuid primary key references public.crm_booking_items (id) on delete cascade,
  commission_attendue numeric(12, 2),
  commission_taux numeric(7, 4),
  commission_date_prevue date,
  commission_recue numeric(12, 2),
  commission_recue_le date,
  updated_at timestamptz not null default now(),
  constraint crm_booking_item_commissions_attendue_check
    check (commission_attendue is null or commission_attendue >= 0),
  constraint crm_booking_item_commissions_taux_check
    check (commission_taux is null or (commission_taux > 0 and commission_taux <= 1)),
  constraint crm_booking_item_commissions_recue_check
    check (commission_recue is null or commission_recue >= 0)
);

comment on table public.crm_booking_item_commissions is
  'Commission IATA du fournisseur, en euros. Vide si la confirmation ne l’imprime pas. Jamais lue par le client.';
comment on column public.crm_booking_item_commissions.commission_attendue is
  'Montant attendu, en euros. Pas de taux habituel.';
comment on column public.crm_booking_item_commissions.commission_taux is
  'Taux facultatif, fraction (0,1000 = 10 %).';
comment on column public.crm_booking_item_commissions.commission_date_prevue is
  'Date prévue. Défaut : fin de la carte, sinon du séjour, plus un mois.';
comment on column public.crm_booking_item_commissions.commission_recue is
  'Montant reçu. Dès qu’il est saisi, la marge l’utilise à la place de l’attendu.';
comment on column public.crm_booking_item_commissions.commission_recue_le is
  'Jour de réception.';

create index if not exists crm_booking_item_commissions_due_idx
  on public.crm_booking_item_commissions (commission_date_prevue)
  where commission_recue is null
    and (commission_attendue is not null or commission_taux is not null);

alter table public.crm_booking_item_commissions enable row level security;

drop policy if exists crm_booking_item_commissions_staff on public.crm_booking_item_commissions;
create policy crm_booking_item_commissions_staff on public.crm_booking_item_commissions
  for all
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

revoke all on public.crm_booking_item_commissions from public, anon;
grant select, insert, update, delete on public.crm_booking_item_commissions to authenticated, service_role;

create or replace function public.crm_booking_item_commission_due()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  stay_end date;
begin
  if new.commission_date_prevue is null
     and (new.commission_attendue is not null or new.commission_taux is not null) then
    select coalesce(i.end_at::date, b.end_date)
      into stay_end
    from public.crm_booking_items i
    join public.crm_bookings b on b.id = i.booking_id
    where i.id = new.booking_item_id;
    if stay_end is not null then
      new.commission_date_prevue := (stay_end + interval '1 month')::date;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists crm_booking_item_commission_due on public.crm_booking_item_commissions;
create trigger crm_booking_item_commission_due
  before insert or update of commission_attendue, commission_taux, commission_date_prevue, commission_recue, commission_recue_le
  on public.crm_booking_item_commissions
  for each row
  execute function public.crm_booking_item_commission_due();

create or replace view public.crm_commissions_a_recevoir
with (security_invoker = true) as
select
  i.id as booking_item_id,
  i.booking_id,
  b.reference,
  b.title as dossier_titre,
  b.customer_id,
  i.title,
  i.kind,
  i.supplier,
  i.confirmation_ref,
  i.end_at,
  c.commission_attendue,
  c.commission_taux,
  c.commission_date_prevue,
  c.commission_recue,
  c.commission_recue_le,
  case
    when c.commission_recue is not null then 'recue'
    when c.commission_date_prevue is not null
      and c.commission_date_prevue < (timezone('Europe/Paris', now()))::date then 'en_retard'
    else 'attendue'
  end as statut
from public.crm_booking_item_commissions c
join public.crm_booking_items i on i.id = c.booking_item_id
join public.crm_bookings b on b.id = i.booking_id
where crm_private.is_staff()
  and coalesce(i.lifecycle, 'active') = 'active'
  and (
    c.commission_attendue is not null
    or c.commission_taux is not null
    or c.commission_recue is not null
  );

comment on view public.crm_commissions_a_recevoir is
  'Commissions fournisseur à recevoir : attendue, en retard, reçue. Personnel seulement.';

revoke all on public.crm_commissions_a_recevoir from public, anon;
grant select on public.crm_commissions_a_recevoir to authenticated, service_role;
