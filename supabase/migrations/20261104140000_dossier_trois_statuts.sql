-- Trois états : Non visible (draft, caché), Visible (confirmed, montré), Annulé.
-- Les colonnes status et visible_to_client restent. Elles ne divergent plus
-- sur un dossier actif. L’archive (archived_at, archived_was_visible) n’est pas touchée.
-- Aucune écriture de paiement, de facture, de client ou de réservation hors ces deux colonnes.
-- Relevé du 2026-11-04 (97 dossiers) : Visible 37 (18 confirmés montrés + 16 brouillons
-- montrés + 3 devis montrés), Non visible 51 (21 confirmés cachés + 30 brouillons cachés),
-- Annulé 1, archivés laissés 8.
-- Un confirmé caché devient Non visible : il reste caché. On ne montre pas ces dossiers,
-- on n’envoie aucun message, et on ne touche ni aux cartes Pliant ni au grand livre.
-- Le déclencheur de débit est suspendu : changer status ne doit ni poster ni annuler une écriture.

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'trg_crm_booking_debit') then
    execute 'alter table public.crm_bookings disable trigger trg_crm_booking_debit';
  end if;
end $$;

-- Déjà montré : Visible. Un confirmé encore caché n’entre pas ici.
update public.crm_bookings
set status = 'confirmed',
    visible_to_client = true
where archived_at is null
  and status is distinct from 'cancelled'
  and visible_to_client = true
  and status is distinct from 'confirmed';

-- Confirmé mais caché : Non visible. visible_to_client reste faux.
-- Aucune carte, aucun mouvement, aucun message : seulement ces deux colonnes.
update public.crm_bookings
set status = 'draft',
    visible_to_client = false
where archived_at is null
  and status = 'confirmed'
  and coalesce(visible_to_client, false) = false;

-- Brouillon ou devis non montré : Non visible.
update public.crm_bookings
set status = 'draft',
    visible_to_client = false
where archived_at is null
  and status in ('draft', 'quoted')
  and coalesce(visible_to_client, false) = false
  and (status is distinct from 'draft' or visible_to_client is distinct from false);

-- Annulé : le client ne le voit pas. Le statut ne change pas.
update public.crm_bookings
set visible_to_client = false
where archived_at is null
  and status = 'cancelled'
  and visible_to_client is distinct from false;

create or replace function crm_private.sync_dossier_face()
returns trigger
language plpgsql
security definer
set search_path = public, crm_private
as $$
begin
  -- L’archive force visible_to_client à faux et s’en souvient. On ne réécrit pas.
  if new.archived_at is not null then
    return new;
  end if;
  if new.status = 'cancelled' then
    new.visible_to_client := false;
    return new;
  end if;
  if new.visible_to_client then
    new.status := 'confirmed';
    return new;
  end if;
  if new.status = 'confirmed' then
    new.visible_to_client := true;
    return new;
  end if;
  new.status := 'draft';
  new.visible_to_client := false;
  return new;
end;
$$;

drop trigger if exists trg_crm_dossier_face on public.crm_bookings;
create trigger trg_crm_dossier_face
  before insert or update on public.crm_bookings
  for each row
  execute function crm_private.sync_dossier_face();

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'trg_crm_booking_debit') then
    execute 'alter table public.crm_bookings enable trigger trg_crm_booking_debit';
  end if;
end $$;
