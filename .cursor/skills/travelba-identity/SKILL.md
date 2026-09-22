---
name: travelba-identity
description: >-
  Travelba customer fiche: shared admin/client profile, passports per person,
  companions without login, billing company, Flying Blue, trip documents,
  phone wall. Use when editing customers, OCR passport, companions, or
  facturation.
---

# Travelba — fiche & pièces

**Une fiche partagée** : mêmes champs admin (`CustomerEditor`) et client (`ProfileForm`) via `lib/crm/customer-patch.ts`. Pas de second modèle « profil public ».

## Titulaire vs voyageurs

- Login = **titulaire** `crm_customers` seulement.
- `crm_travel_companions` : identité du foyer, **pas** d’invitation / pas de session.
- Voyageurs dossier : `crm_booking_travelers` (Adulte 1 / 2 si l’ingest n’a que « 2 adults »). On peut rattacher un compagnon **plus tard**.
- Admin peut **supprimer un client** (`deleteCustomerById`) : dossiers, txs, fichiers, user Auth si non staff. Le client **ne** se supprime **pas** lui-même.

## Téléphones / WhatsApp

- `phone` (obligatoire pour sortir du mur) + `phone_secondary` optionnel (`PhoneField` / `OptionalSecondPhone`).
- E.164 via `lib/crm/phone.ts`. Pas de champ `whatsapp` sur la fiche (le WhatsApp est celui de **l’agence**).
- Mur : skill `travelba-auth`.

## Passeport / pièces

- **Un passeport par personne** (titulaire ou compagnon), pas un passeport « du dossier » générique.
- Scan : photo JPEG/PNG/HEIC **ou PDF** → `/api/admin/travel-documents/scan` ou `/api/client/documents/scan`. MRZ Tesseract + `mrz`. PDF : texte MRZ si calque, sinon raster 1–2 pages. **Pas** le dropzone résa (skill `travelba-document-ingest`).
- PDF passeport souvent sans calque : rasteriser ou photo de la bande MRZ. L’upload **accepte** le PDF.
- Ne **pas** logger numéro / MRZ.
- Champs : n°, nationalité, naissance, expiration, `place_of_birth`, `authority`, `personal_number` (migration passport_fields).
- Pièce **pour un voyage** : `crm_travel_documents.booking_id` / `traveler_id` (docs d’identité utiles à ce séjour, en plus des confirmations `crm_booking_documents`).
- Rattachement : un mot du prénom suffit (« Jérémy » = « Jérémy Moïse ») et le nom est égal, ou à deux caractères près s’il est assez long. « Adulte N » n’est pas une personne. Un passeport de coffre unique et non expiré est coché pour le séjour (`lib/crm/person-match.ts`, `reconcile-party.ts`).

UI : bloc pièce **replié** par défaut (passeport). Copy courte, pas « Uploadez le passeport du titulaire pour préremplir » en hint permanent.

## Flying Blue / facturation

- `flying_blue` normalisé (majuscules, sans espaces).
- Société : `company_name`, `siret`, `vat_number`, `billing_email`, `billing_address_line`, `billing_postal_code`, `billing_city`, `billing_country`.
- Adresse perso ≠ adresse de facturation. Les deux peuvent exister.
- **Rôle société** (`company_role`) :
  - `null` = particulier (comportement historique)
  - `admin` = admin société : wallet / grand livre (Revolut, crédit disponible)
  - `member` = collaborateur rattaché via `billing_parent_id` → ne voit **que** les débits de **ses** dossiers, pas les revenus société
- Dossier : `crm_bookings.billing_customer_id` = qui paie (`syncBookingDebit` poste sur ce wallet). Défaut = `billing_parent_id` si member, sinon titulaire.

## OCR

`lib/crm/ocr-document.ts`, `lib/crm/mrz-parse.ts`. Toute erreur MRZ réelle se corrige **là** + un test `lib/crm/passport-extract.test.ts` / `document-identity.test.ts`. Ne pas envoyer le scan passeport dans le prompt carnet `gpt-4o`.

## Admin fiche

Pas d’e-mail titulaire éditable à la légère (identifiant de connexion). Pas de scan dropzone résa sur la fiche client admin. Créer ≠ inviter : skill `travelba-auth`.
