-- Journal des e-mails partis depuis le CRM.
-- Objet, fil Gmail, identifiant RFC. Pas de corps.
-- Aucune ligne existante n’est modifiée. La file n’est pas classée.

create table if not exists public.crm_sent_mail (
  id uuid primary key default gen_random_uuid(),
  rfc_message_id text,
  resend_id text,
  gmail_thread_id text,
  subject text,
  subject_key text,
  source text,
  sent_at timestamptz not null default now(),
  constraint crm_sent_mail_rfc_message_id_key unique (rfc_message_id)
);

comment on table public.crm_sent_mail is
  'Envois du CRM. Sert à ne garder dans la file que les réponses. Pas de corps.';

create index if not exists crm_sent_mail_subject_key_idx
  on public.crm_sent_mail (subject_key);

alter table public.crm_sent_mail enable row level security;

revoke all on public.crm_sent_mail from anon, authenticated, public;
grant select on public.crm_sent_mail to authenticated;
grant all on public.crm_sent_mail to service_role;

drop policy if exists crm_sent_mail_staff on public.crm_sent_mail;
create policy crm_sent_mail_staff on public.crm_sent_mail
  for select to authenticated
  using (crm_private.is_staff());
