-- Blocage et suppression des cartes libres d'un dossier.
-- active : payable. locked : bloquée, réversible. terminated : supprimée chez Pliant.

alter table public.crm_booking_cards
  add column if not exists status text not null default 'active';

alter table public.crm_booking_cards
  drop constraint if exists crm_booking_cards_status_check;

alter table public.crm_booking_cards
  add constraint crm_booking_cards_status_check
  check (status in ('active', 'locked', 'terminated'));
