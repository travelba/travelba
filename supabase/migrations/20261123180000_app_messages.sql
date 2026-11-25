-- Messagerie de l’application TBA. Un fil par client. Pas WhatsApp.
-- Additive. À jouer à la main. Rien n’est détruit.
-- Les écritures passent par le service role, après requireCustomer ou requireStaff.
-- Le client authentifié ne peut que lire son fil.

create table if not exists public.crm_app_threads (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  booking_id uuid references public.crm_bookings (id) on delete set null,
  customer_unread integer not null default 0,
  agency_unread integer not null default 0,
  last_message_at timestamptz,
  last_preview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_app_threads_customer_key unique (customer_id),
  constraint crm_app_threads_customer_unread_check check (customer_unread >= 0),
  constraint crm_app_threads_agency_unread_check check (agency_unread >= 0),
  constraint crm_app_threads_preview_len check (last_preview is null or char_length(last_preview) <= 160)
);

create table if not exists public.crm_app_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.crm_app_threads (id) on delete cascade,
  customer_id uuid not null references public.crm_customers (id) on delete cascade,
  author_kind text not null,
  author_staff_id uuid references public.crm_staff (id) on delete set null,
  body text not null default '',
  attachment_path text,
  attachment_name text,
  attachment_mime text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint crm_app_messages_author_check check (author_kind in ('customer', 'agency')),
  constraint crm_app_messages_body_len check (char_length(body) <= 4000),
  constraint crm_app_messages_content_check check (char_length(btrim(body)) > 0 or attachment_path is not null),
  constraint crm_app_messages_path_check check (
    attachment_path is null
    or (
      char_length(attachment_path) <= 300
      and attachment_path not like '%..%'
      and attachment_path like 'customers/%/messages/%'
    )
  )
);

create index if not exists crm_app_threads_inbox_idx
  on public.crm_app_threads (agency_unread desc, last_message_at desc);

create index if not exists crm_app_messages_thread_idx
  on public.crm_app_messages (thread_id, created_at);

alter table public.crm_notification_preferences
  add column if not exists push_messages boolean not null default true;

alter table public.crm_app_threads enable row level security;
alter table public.crm_app_messages enable row level security;

revoke all on public.crm_app_threads from anon, authenticated;
revoke all on public.crm_app_messages from anon, authenticated;

grant select on public.crm_app_threads to authenticated;
grant select on public.crm_app_messages to authenticated;
grant all on public.crm_app_threads to service_role;
grant all on public.crm_app_messages to service_role;

drop policy if exists crm_app_threads_customer on public.crm_app_threads;
create policy crm_app_threads_customer on public.crm_app_threads
  for select to authenticated
  using (customer_id = crm_private.customer_id());

drop policy if exists crm_app_threads_staff on public.crm_app_threads;
create policy crm_app_threads_staff on public.crm_app_threads
  for select to authenticated
  using (crm_private.is_staff());

drop policy if exists crm_app_messages_customer on public.crm_app_messages;
create policy crm_app_messages_customer on public.crm_app_messages
  for select to authenticated
  using (customer_id = crm_private.customer_id());

drop policy if exists crm_app_messages_staff on public.crm_app_messages;
create policy crm_app_messages_staff on public.crm_app_messages
  for select to authenticated
  using (crm_private.is_staff());

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_crm_app_threads_updated') then
    create trigger trg_crm_app_threads_updated
      before update on public.crm_app_threads
      for each row execute function public.crm_set_updated_at();
  end if;
end $$;

comment on table public.crm_app_threads is
  'Fil de l’application TBA, un par client. Pas de WhatsApp. Le client ne lit que le sien.';
comment on table public.crm_app_messages is
  'Messages du fil. author_kind customer ou agency. read_at est l’accusé de l’autre côté. Pièce jointe dans crm-files, customers/{id}/messages/.';
comment on column public.crm_notification_preferences.push_messages is
  'Notification quand l’agence répond dans l’application. Vrai par défaut.';
