alter table public.crm_customer_activity
  add column if not exists detail text;

comment on column public.crm_customer_activity.detail is
  'Précision du geste (séjour, personne, montant). Jamais un numéro de pièce, un PAN ou un IBAN.';
