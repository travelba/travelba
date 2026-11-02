-- Note d’agence sur une réponse du Concierge. Rien n’est envoyé.

alter table public.crm_whatsapp_messages
  add column if not exists concierge_mark text,
  add column if not exists concierge_marked_at timestamptz,
  add column if not exists concierge_marked_by uuid references public.crm_staff (id) on delete set null;

alter table public.crm_whatsapp_messages
  drop constraint if exists crm_whatsapp_messages_concierge_mark_check;

alter table public.crm_whatsapp_messages
  add constraint crm_whatsapp_messages_concierge_mark_check
  check (concierge_mark is null or concierge_mark in ('good', 'bad'));

create index if not exists crm_whatsapp_messages_concierge_bad_idx
  on public.crm_whatsapp_messages (created_at desc)
  where concierge_mark = 'bad';
