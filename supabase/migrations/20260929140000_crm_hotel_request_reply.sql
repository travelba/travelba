-- Réponse hôtel visible dans le dossier. Jamais de PAN, d'expiration ou de cryptogramme.

alter table public.crm_hotel_requests
  add column if not exists reply_from text not null default '',
  add column if not exists reply_subject text not null default '',
  add column if not exists reply_body text not null default '',
  add column if not exists reply_message_id text;

comment on column public.crm_hotel_requests.reply_body is
  'Texte de la réponse hôtel recopié dans le dossier, sans numéro de carte.';
