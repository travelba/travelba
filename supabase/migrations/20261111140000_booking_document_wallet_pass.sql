-- Champs lus dans pass.json au dépôt d’un .pkpass (compagnie).
-- L’affichage ne rouvre pas le zip. La colonne peut manquer : le dépôt réessaie sans elle.

alter table public.crm_booking_documents
  add column if not exists extracted jsonb;

comment on column public.crm_booking_documents.extracted is
  'Champs lus à l’envoi d’un passe Apple Wallet (passager, vol, siège, porte, PNR). Rien n’est inventé. Le fichier signé n’est pas modifié.';
