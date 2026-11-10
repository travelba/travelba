-- Classement manuel d’un courrier hôtel. Aucun e-mail.
-- Le statut calculé reprend dès qu’un message entrant est plus récent que classified_at.
-- Additive : les lignes existantes restent non classées.

alter table public.crm_hotel_requests
  add column if not exists classified_at timestamptz,
  add column if not exists classified_by uuid references public.crm_staff (id) on delete set null,
  add column if not exists classified_by_name text,
  add column if not exists classified_note text;

alter table public.crm_hotel_requests drop constraint if exists crm_hotel_requests_classified_by_name_len;
alter table public.crm_hotel_requests
  add constraint crm_hotel_requests_classified_by_name_len
  check (classified_by_name is null or char_length(classified_by_name) <= 80);

alter table public.crm_hotel_requests drop constraint if exists crm_hotel_requests_classified_note_len;
alter table public.crm_hotel_requests
  add constraint crm_hotel_requests_classified_note_len
  check (classified_note is null or char_length(classified_note) <= 500);

comment on column public.crm_hotel_requests.classified_at is
  'Classement manuel. Ignoré si un message entrant de l’hôtel est plus récent. N’envoie aucun e-mail.';
comment on column public.crm_hotel_requests.classified_by is
  'Membre de l’agence qui a classé le fil. Null pour le jeton MCP général.';
comment on column public.crm_hotel_requests.classified_by_name is
  'Nom affiché de l’auteur du classement. Pas d’e-mail, pas de secret.';
comment on column public.crm_hotel_requests.classified_note is
  'Note interne facultative. Pas de numéro de carte.';
