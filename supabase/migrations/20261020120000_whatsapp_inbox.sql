-- Boîte WhatsApp : téléphone sur chaque message, auteur agence, pièce, outils, lu par l’agence.
-- Les statuts Twilio (delivered, read) tiennent dans status, déjà un texte.

alter table public.crm_whatsapp_messages
  add column if not exists phone text,
  add column if not exists author_staff_id uuid references public.crm_staff (id) on delete set null,
  add column if not exists media_path text,
  add column if not exists tools jsonb;

create index if not exists crm_whatsapp_messages_phone_idx
  on public.crm_whatsapp_messages (phone, created_at desc);

alter table public.crm_whatsapp_threads
  add column if not exists staff_read_at timestamptz;

update public.crm_whatsapp_messages as message
set phone = customer.phone
from public.crm_customers as customer
where message.customer_id = customer.id
  and message.phone is null
  and customer.phone is not null;

do $$
begin
  alter publication supabase_realtime add table public.crm_whatsapp_messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
