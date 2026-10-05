-- Une question dont le dossier n’a pas la réponse, quand le client veut la transmettre.
-- Les cinq actes métier et la plainte restent inchangés.

alter table public.crm_whatsapp_requests
  drop constraint if exists crm_whatsapp_requests_kind_check;

alter table public.crm_whatsapp_requests
  add constraint crm_whatsapp_requests_kind_check
  check (kind in ('change', 'cancel', 'payment', 'formality', 'chauffeur', 'complaint', 'question'));
