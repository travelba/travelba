-- E-mail de contact d’un accompagnateur (n’ouvre pas de compte).
-- Origine d’un geste du journal : whatsapp_concierge pour le concierge.
-- Téléphone d’un membre de l’équipe, pour reconnaître l’expéditeur WhatsApp.

alter table public.crm_travel_companions
  add column if not exists email text;

comment on column public.crm_travel_companions.email is
  'E-mail de contact. N’ouvre pas de compte et ne remplace pas l’e-mail du titulaire.';

alter table public.crm_audit_events
  add column if not exists source text;

comment on column public.crm_audit_events.source is
  'Origine du geste. whatsapp_concierge : le concierge a modifié le dossier à la place du client.';

create index if not exists crm_audit_events_source_idx
  on public.crm_audit_events (source, created_at desc)
  where source is not null;

alter table public.crm_staff
  add column if not exists phone text;

create unique index if not exists crm_staff_phone_idx
  on public.crm_staff (phone)
  where phone is not null;

comment on column public.crm_staff.phone is
  'Téléphone E.164. Le concierge reconnaît l’équipe et n’écrit que sur le dossier du client identifié.';
