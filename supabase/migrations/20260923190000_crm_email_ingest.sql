-- Boîte d'ingestion e-mail : mails fournisseurs (labels Gmail) → proposition de
-- rattachement à un client / voyage. Staff seulement (RLS), écriture par le
-- service role (webhook + cron).

create table if not exists public.crm_email_ingest (
  id uuid primary key default gen_random_uuid(),
  gmail_message_id text not null unique,
  gmail_thread_id text,
  label text,
  from_email text,
  subject text,
  received_at timestamptz,
  status text not null default 'received'
    check (status in ('received', 'parsed', 'matched', 'attached', 'refused', 'error')),
  extract jsonb,
  candidates jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  suggested_customer_id uuid references public.crm_customers (id) on delete set null,
  suggested_booking_id uuid references public.crm_bookings (id) on delete set null,
  created_booking_id uuid references public.crm_bookings (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_email_ingest_status_idx
  on public.crm_email_ingest (status, received_at desc);

-- Curseur d'historique Gmail + expiration du watch (singleton par provider).
create table if not exists public.crm_email_sync (
  provider text primary key,
  history_id text,
  watch_expiration timestamptz,
  updated_at timestamptz not null default now()
);

-- updated_at triggers
drop trigger if exists trg_crm_email_ingest_updated on public.crm_email_ingest;
create trigger trg_crm_email_ingest_updated
  before update on public.crm_email_ingest
  for each row execute function public.crm_set_updated_at();

drop trigger if exists trg_crm_email_sync_updated on public.crm_email_sync;
create trigger trg_crm_email_sync_updated
  before update on public.crm_email_sync
  for each row execute function public.crm_set_updated_at();

grant select, insert, update, delete on
  public.crm_email_ingest,
  public.crm_email_sync
to authenticated;

alter table public.crm_email_ingest enable row level security;
alter table public.crm_email_sync enable row level security;

drop policy if exists crm_email_ingest_staff on public.crm_email_ingest;
create policy crm_email_ingest_staff on public.crm_email_ingest
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());

drop policy if exists crm_email_sync_staff on public.crm_email_sync;
create policy crm_email_sync_staff on public.crm_email_sync
  for all to authenticated
  using (crm_private.is_staff())
  with check (crm_private.is_staff());
