alter table public.crm_travel_documents
  add column if not exists booking_id uuid references public.crm_bookings (id) on delete cascade,
  add column if not exists traveler_id uuid references public.crm_booking_travelers (id) on delete cascade;

create index if not exists crm_travel_documents_booking_idx
  on public.crm_travel_documents (booking_id);

create index if not exists crm_travel_documents_traveler_idx
  on public.crm_travel_documents (traveler_id);
