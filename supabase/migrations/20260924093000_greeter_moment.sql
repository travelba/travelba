-- Greeter au départ et à l'arrivée : le refus distingue les deux moments.

alter table public.crm_declined_services
  add column if not exists moment text not null default '';

alter table public.crm_declined_services
  drop constraint if exists crm_declined_services_moment_check;

alter table public.crm_declined_services
  add constraint crm_declined_services_moment_check
  check (moment in ('', 'depart', 'arrive'));

update public.crm_declined_services
  set moment = 'depart'
  where kind = 'greeter' and moment = '';

alter table public.crm_declined_services
  drop constraint if exists crm_declined_services_shape;

alter table public.crm_declined_services
  add constraint crm_declined_services_shape check (
    (kind in ('visa', 'checkin') and service_leg = '' and place = '' and moment = '')
    or (kind = 'greeter' and service_leg in ('departure', 'arrival') and place = '' and moment in ('depart', 'arrive'))
    or (kind = 'chauffeur' and service_leg in ('departure', 'arrival') and place in ('home', 'hotel') and moment = '')
  );

alter table public.crm_declined_services
  drop constraint if exists crm_declined_services_key;

alter table public.crm_declined_services
  add constraint crm_declined_services_key unique (booking_id, kind, service_leg, place, moment);
