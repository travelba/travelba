-- Stop coupe les messages proactifs. La conversation reste ouverte.
-- Une plainte insuffisante est une demande, à part des cinq actions métier.

alter table public.crm_customers
  add column if not exists whatsapp_opt_out_at timestamptz;

alter table public.crm_whatsapp_requests
  drop constraint if exists crm_whatsapp_requests_kind_check;

alter table public.crm_whatsapp_requests
  add constraint crm_whatsapp_requests_kind_check
  check (kind in ('change', 'cancel', 'payment', 'formality', 'chauffeur', 'complaint'));
