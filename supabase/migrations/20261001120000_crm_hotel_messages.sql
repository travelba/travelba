-- Messages libres à l'hôtel. Le fil de la fiche les montre avec les courriers.
-- Jamais de PAN, d'expiration ou de cryptogramme.

create table if not exists public.crm_hotel_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.crm_bookings (id) on delete cascade,
  booking_item_id uuid not null references public.crm_booking_items (id) on delete cascade,
  subject text not null default '',
  body text not null default '',
  recipients text[] not null default '{}',
  sent_at timestamptz,
  reply_from text not null default '',
  reply_subject text not null default '',
  reply_body text not null default '',
  reply_message_id text,
  replied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crm_hotel_messages is
  'Échanges libres avec un hôtel. Le texte de réponse est recopié sans numéro de carte.';

create index if not exists crm_hotel_messages_booking_idx
  on public.crm_hotel_messages (booking_id, booking_item_id);

drop trigger if exists trg_crm_hotel_messages_updated on public.crm_hotel_messages;
create trigger trg_crm_hotel_messages_updated
  before update on public.crm_hotel_messages
  for each row execute function public.crm_set_updated_at();

revoke all on public.crm_hotel_messages from anon, public;
grant select, insert, update, delete on public.crm_hotel_messages to authenticated;

alter table public.crm_hotel_messages enable row level security;

drop policy if exists crm_hotel_messages_staff on public.crm_hotel_messages;
create policy crm_hotel_messages_staff on public.crm_hotel_messages
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
