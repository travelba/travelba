---
name: travelba-identity
description: >-
  Travelba customer fiche: shared admin/client profile, passports per person,
  companions without login, billing company, Flying Blue, trip documents,
  phone wall, vault vs trip passport, shorter ticket given name. Use when
  editing customers, OCR passport, companions, facturation, or the
  « pièce manquante » banner.
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
- Scan : photo JPEG/PNG/HEIC → `/api/admin/travel-documents/scan` ou `/api/client/documents/scan`. MRZ Tesseract + `mrz`. **Pas** le dropzone résa (skill `travelba-document-ingest`).
- PDF passeport souvent sans calque : rasteriser ou photo de la bande MRZ.
- Ne **pas** logger numéro / MRZ.
- Champs : n°, nationalité, naissance, expiration, `place_of_birth`, `authority`, `personal_number` (migration passport_fields).
- Pièce **pour un voyage** : `crm_travel_documents.booking_id` / `traveler_id` (docs d’identité utiles à ce séjour, en plus des confirmations `crm_booking_documents`).

UI : bloc pièce **replié** par défaut (passeport). Copy courte, pas « Uploadez le passeport du titulaire pour préremplir » en hint permanent.

## Coffre vs case du séjour

- Coffre = `crm_travel_documents.booking_id` null. La case « Passeport pour ce séjour » coche une **copie** (`booking_id` + `traveler_id`). Le coffre n’est pas modifié. Ne pas créer un second passeport pour « remplir » la case.
- `tripDocCoverage` ne compte qu’une pièce **déjà copiée sur le séjour**. Le bandeau « Pièce d’identité manquante… Joindre dans Mon compte, puis cocher » reste tant que la case n’est pas cochée, même si le coffre est plein.
- « Aucune pièce dans le coffre pour cette personne » = `samePerson` n’a pas relié ce voyageur. Ce n’est pas « le client n’a rien scanné ».
- `samePerson` (`lib/crm/trip-documents.ts`) : `companion_id` → pièces de cet accompagnant ; sinon `is_account_holder` → pièces sans `companion_id` ; sinon seulement `doc.traveler_id === traveler.id`. Le coffre du titulaire (`companion_id` null) est invisible si le voyageur du billet n’est pas marqué titulaire.

## Même personne, prénom plus court

Normaliser (`normalizePersonName`) : NFD, sans accents, minuscules, **sans** espaces ni virgules. `Benjamin, Elie, David` devient `benjamineliedavid`. Le billet `Benjamin` en est le préfixe : **même titulaire**. L’égalité stricte est le bug qui laissait le coffre vide.

- `holderNamesMatch` (`lib/crm/person-name.ts`) : nom exact ; prénom égal ou préfixe dans un sens. Prénom de billet vide = le nom suffit. Fiche sans prénom + billet avec prénom = pas un match.
- `isHolder` et `matchCustomerId` (`lib/crm/ingest-booking.ts`) passent par là. Ne pas revenir à `first_name` égal caractère pour caractère.
- `companionNamesMatch` : **les deux** prénoms requis, nom exact, prénom en préfixe. Pas de lien sur le seul nom de famille. Un accompagnant dont le prénom ne contient pas celui du billet (les deux champs remplis avec la même longue chaîne, par exemple) **ne se rattache pas**. Plusieurs matchs = on ne choisit pas.
- Au chargement du carnet (client et admin), `reconcileBookingTravelers` (`lib/crm/traveler-link.ts`) écrit `is_account_holder` ou `companion_id` s’ils sont vides. RLS client sur `crm_booking_travelers` = **select** seulement : l’écriture est service role, limitée aux lignes déjà chargées pour un dossier autorisé. Ne pas ouvrir un UPDATE client.
- La case reste manuelle. Ne pas copier le coffre tout seul sur le séjour.

## Flying Blue / facturation

- `flying_blue` normalisé (majuscules, sans espaces).
- Société : `company_name`, `siret`, `vat_number`, `billing_email`, `billing_address_line`, `billing_postal_code`, `billing_city`, `billing_country`.
- Adresse perso ≠ adresse de facturation. Les deux peuvent exister.

## OCR

`lib/crm/ocr-document.ts`, `lib/crm/mrz-parse.ts`. Toute erreur MRZ réelle se corrige **là** + un test `lib/crm/passport-extract.test.ts` / `document-identity.test.ts`. Ne pas envoyer le scan passeport dans le prompt carnet `gpt-4o`.

## Admin fiche

Pas d’e-mail titulaire éditable à la légère (identifiant de connexion). Pas de scan dropzone résa sur la fiche client admin. Créer ≠ inviter : skill `travelba-auth`.
