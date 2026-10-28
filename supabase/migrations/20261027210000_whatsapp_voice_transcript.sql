-- Transcription des notes vocales WhatsApp entrantes.
-- Le fichier audio reste dans media_path (coffre privé crm-files).
-- transcript est le texte entendu. Null si ce n’est pas une note, ou si la transcription a échoué.
-- À jouer à la main sur le projet fsmfozxgujskluxakeoq. Ne pas appliquer depuis l’agent.

alter table public.crm_whatsapp_messages
  add column if not exists transcript text;

comment on column public.crm_whatsapp_messages.transcript is
  'Transcription d’une note vocale. Null hors note vocale, ou si la transcription a échoué.';
