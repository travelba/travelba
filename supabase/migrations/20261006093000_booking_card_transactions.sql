-- Nombre de transactions et montant maximum de chacune, saisis à la génération.
-- Nullable : les cartes déjà émises n’ont pas ces plafonds enregistrés.

alter table public.crm_booking_cards
  add column if not exists max_transaction_count integer;

alter table public.crm_booking_cards
  add column if not exists transaction_limit_cents integer;

alter table public.crm_booking_cards
  drop constraint if exists crm_booking_cards_tx_count_check;

alter table public.crm_booking_cards
  add constraint crm_booking_cards_tx_count_check
  check (
    max_transaction_count is null
    or (max_transaction_count >= 1 and max_transaction_count <= 999999999)
  );

alter table public.crm_booking_cards
  drop constraint if exists crm_booking_cards_tx_limit_check;

alter table public.crm_booking_cards
  add constraint crm_booking_cards_tx_limit_check
  check (transaction_limit_cents is null or transaction_limit_cents > 0);

alter table public.crm_pliant_cards
  add column if not exists max_transaction_count integer;

alter table public.crm_pliant_cards
  add column if not exists transaction_limit_cents integer;

alter table public.crm_pliant_cards
  drop constraint if exists crm_pliant_cards_tx_count_check;

alter table public.crm_pliant_cards
  add constraint crm_pliant_cards_tx_count_check
  check (
    max_transaction_count is null
    or (max_transaction_count >= 1 and max_transaction_count <= 999999999)
  );

alter table public.crm_pliant_cards
  drop constraint if exists crm_pliant_cards_tx_limit_check;

alter table public.crm_pliant_cards
  add constraint crm_pliant_cards_tx_limit_check
  check (transaction_limit_cents is null or transaction_limit_cents > 0);
