-- Fil hôtel : titres réellement partis, et chaque message Gmail du même titre.
-- Jamais de PAN, d'expiration ou de cryptogramme.

alter table public.crm_hotel_requests
  add column if not exists sent_subjects text[] not null default '{}',
  add column if not exists thread_synced_at timestamptz;

alter table public.crm_hotel_messages
  add column if not exists sent_subjects text[] not null default '{}',
  add column if not exists thread_synced_at timestamptz;

comment on column public.crm_hotel_requests.sent_subjects is
  'Titres partis pour ce courrier. La recherche Gmail suit ces titres, pas le brouillon.';

create table if not exists public.crm_hotel_thread_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  booking_item_id uuid not null references public.crm_booking_items (id) on delete cascade,
  gmail_message_id text not null unique,
  gmail_thread_id text,
  subject_key text not null,
  direction text not null check (direction in ('out', 'in')),
  from_email text not null default '',
  subject text not null default '',
  body text not null default '',
  link text,
  received_at timestamptz not null,
  counts_as_reply boolean not null default false,
  source text not null default 'gmail' check (source in ('crm', 'gmail')),
  request_id uuid references public.crm_hotel_requests (id) on delete cascade,
  message_id uuid references public.crm_hotel_messages (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.crm_hotel_thread_messages is
  'Tours du fil hôtel : envoi CRM et messages Gmail du même titre. Sans numéro de carte.';

create index if not exists crm_hotel_thread_messages_item_idx
  on public.crm_hotel_thread_messages (booking_item_id, subject_key, received_at);

revoke all on public.crm_hotel_thread_messages from anon, public;
grant select, insert, update, delete on public.crm_hotel_thread_messages to authenticated;

alter table public.crm_hotel_thread_messages enable row level security;

drop policy if exists crm_hotel_thread_messages_staff on public.crm_hotel_thread_messages;
create policy crm_hotel_thread_messages_staff on public.crm_hotel_thread_messages
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
