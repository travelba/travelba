-- Infos voyage WhatsApp pour un conjoint, dossier par dossier.
-- À jouer à la main. Cette migration ne part pas toute seule.
-- Aucun message n’est envoyé.
--
-- La case est cochée par défaut : whatsapp_travel_updates vaut true
-- sur les lignes déjà là. L’envoi ne retient ensuite que les accompagnants
-- dont le lien se normalise en conjoint et qui ont un téléphone E.164.
-- L’agence décoche un dossier. Stop écrit whatsapp_opt_out_at sur le compagnon,
-- pas sur le titulaire.

alter table public.crm_booking_travelers
  add column if not exists whatsapp_travel_updates boolean not null default true;

alter table public.crm_booking_travelers
  add column if not exists whatsapp_travel_updates_at timestamptz;

alter table public.crm_booking_travelers
  add column if not exists whatsapp_travel_updates_by uuid;

alter table public.crm_booking_travelers
  drop constraint if exists crm_booking_travelers_whatsapp_by_fkey;

alter table public.crm_booking_travelers
  add constraint crm_booking_travelers_whatsapp_by_fkey
  foreign key (whatsapp_travel_updates_by) references public.crm_staff (id) on delete set null;

comment on column public.crm_booking_travelers.whatsapp_travel_updates is
  'Conjoint voyageur : reçoit les infos voyage WhatsApp de ce dossier. Vrai par défaut. L’agence peut décocher. Pas l’argent, pas le compte.';

comment on column public.crm_booking_travelers.whatsapp_travel_updates_at is
  'Dernier changement de la case infos voyage, par l’agence.';

comment on column public.crm_booking_travelers.whatsapp_travel_updates_by is
  'Collègue qui a coché ou décoché la case infos voyage.';

alter table public.crm_travel_companions
  add column if not exists whatsapp_opt_out_at timestamptz;

alter table public.crm_travel_companions
  add column if not exists whatsapp_intro_sent_at timestamptz;

comment on column public.crm_travel_companions.whatsapp_opt_out_at is
  'Stop WhatsApp de ce numéro. Ne coupe pas l’opt-in du titulaire.';

comment on column public.crm_travel_companions.whatsapp_intro_sent_at is
  'Premier message explicatif déjà envoyé à ce numéro (infos voyage, Stop). Une seule fois.';

create index if not exists crm_travel_companions_phone_idx
  on public.crm_travel_companions (phone)
  where phone is not null;
