-- Carte active, remplacée ou annulée. Le total et le carnet ne comptent que active.

alter table public.crm_booking_items
  add column if not exists lifecycle text not null default 'active';

alter table public.crm_booking_items
  drop constraint if exists crm_booking_items_lifecycle_check;

alter table public.crm_booking_items
  add constraint crm_booking_items_lifecycle_check
  check (lifecycle in ('active', 'superseded', 'cancelled'));

alter table public.crm_booking_items
  add column if not exists superseded_by uuid;

alter table public.crm_booking_items
  drop constraint if exists crm_booking_items_superseded_by_fkey;

alter table public.crm_booking_items
  add constraint crm_booking_items_superseded_by_fkey
  foreign key (superseded_by) references public.crm_booking_items (id) on delete set null;
