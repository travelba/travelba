-- Fiche : veille interne + VIP (greeter). PJ par carte. Kinds extras.

alter table public.crm_customers
  add column if not exists on_hold boolean not null default false;

alter table public.crm_customers
  add column if not exists is_vip boolean not null default false;

comment on column public.crm_customers.on_hold is
  'Compte en veille — badge / filtre admin seulement.';
comment on column public.crm_customers.is_vip is
  'Client VIP — accès greeter aéroport.';

alter table public.crm_booking_documents
  add column if not exists booking_item_id uuid
    references public.crm_booking_items (id) on delete set null;

create index if not exists crm_booking_documents_item_idx
  on public.crm_booking_documents (booking_item_id)
  where booking_item_id is not null;

alter table public.crm_booking_items
  drop constraint if exists crm_booking_items_kind_check;

alter table public.crm_booking_items
  add constraint crm_booking_items_kind_check
  check (
    kind in (
      'flight',
      'hotel',
      'transfer',
      'activity',
      'rail',
      'car',
      'cruise',
      'insurance',
      'fee',
      'chauffeur',
      'greeter'
    )
  );
