-- Demande de prestation dans le fil des cartes.
-- kind : train aujourd’hui, flight ensuite. La carte (item_id) reste au même rang
-- quand les billets sont achetés. À jouer à la main, comme la table des demandes.

alter table public.crm_train_requests add column if not exists kind text not null default 'train';
alter table public.crm_train_requests add column if not exists anchor_item_id uuid references public.crm_booking_items (id) on delete set null;
alter table public.crm_train_requests add column if not exists anchor_side text;
alter table public.crm_train_requests add column if not exists item_id uuid references public.crm_booking_items (id) on delete set null;

alter table public.crm_train_requests drop constraint if exists crm_train_requests_kind_check;
alter table public.crm_train_requests
  add constraint crm_train_requests_kind_check check (kind in ('train', 'flight'));

alter table public.crm_train_requests drop constraint if exists crm_train_requests_anchor_side_check;
alter table public.crm_train_requests
  add constraint crm_train_requests_anchor_side_check check (anchor_side is null or anchor_side in ('avant', 'apres'));

create unique index if not exists crm_train_requests_item_uidx
  on public.crm_train_requests (item_id) where item_id is not null;
