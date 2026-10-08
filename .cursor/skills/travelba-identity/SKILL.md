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

- **Un livret = une personne**, pas un passeport « du dossier ». Photo d’un livret ouvert : seule la **page du bas** (identité) est lue. Le haut est une couverture ou la page « réservée aux autorités » — pas une seconde personne, et ça n’écrase rien. Deux livrets côte à côte sur une page paysage → une personne par moitié. Le titulaire ne reçoit une pièce **que si le nom correspond** ; **chaque autre personne devient un accompagnateur**.
- **Même personne, deux nationalités** : nom + date de naissance. On garde les deux passeports (israélien et français), on ne crée pas un second accompagnateur, et un nouveau passeport ne remplace au coffre **que** le même pays émetteur.
- Scan : photo JPEG/PNG/HEIC **ou PDF** → `/api/admin/travel-documents/scan` ou `/api/client/documents/scan`. MRZ Tesseract + `mrz`, orientations 0/90/180/270, on garde celle dont les chiffres de contrôle sont valides. PDF sans calque : JPEG embarqué (`pdfimages`) ou raster **unpdf/pdfjs** (jamais `pdfjs-dist` 5.7). `getDocumentProxy` clone les octets. **Pas** le dropzone résa. Un reflet ne bat pas une MRZ valide.
- **Israël** : type PP, ISR, dates JJ/MM/AAAA, sexe à côté de נ (F) ou ז (M). « Israeli » → `IL` (jamais l’adjectif, jamais ISR sur la fiche). Le n° d’identité (`3-1234567-8`) est le `personal_number` ; les `<` de la MRZ sont les tirets.
- **France** : type P, FRA, dates JJ MM AAAA. « Française » → `FR`. Prénoms séparés par des virgules, accents gardés. Un prénom court reste (`Zoé`, trois lettres) : la fenêtre s’arrête au champ suivant (nationalité, sexe, date), le lieu de naissance n’entre pas dans les prénoms. L’autorité peut tenir sur deux lignes ; une préfecture est lue (`Préfecture des Hauts-de-Seine Nanterre`), pas seulement un consulat. Un reflet (`“ee`, `|`) ne reste pas dans l’autorité, et « Selne » lu pour Seine est corrigé. Le lieu de naissance est la ville à côté de la date de naissance, article et trait d’union compris (`LE BLANC-MESNIL`), même si l’OCR colle le mois et l’année (`04 071988`). La date d’expiration suivie d’un bout de MRZ n’est pas une ville. Le domicile est la **première** adresse imprimée, rue entière (`du Bois de la Fontaine`, pas coupée à « de ») et ville entière (`Neuilly-sur-Seine`, `Levallois-Perret`, pas `Neuilly` ni `Levallois`). La rue s’arrête avant un reflet de deux lettres. Une deuxième adresse (mineur : le représentant légal) ne remplit pas la fiche. Taille et couleur des yeux ne sont pas des champs.
- **Prénoms** : tous, le premier d’abord, dans l’ordre de la ligne latine « Prénoms » / « Given name » et de la MRZ (gauche à droite) — `Maelle Louise Rosalie`, pas l’inverse. L’hébreu se lit de droite à gauche ; la fiche est en français, donc on stocke les noms dans l’ordre français et on ne retourne jamais la ligne latine. Si l’OCR rend le bloc hébreu dans l’ordre visuel gauche-droite, cette chaîne n’est pas l’ordre des prénoms, et on ne retourne pas les noms latins pour imiter l’hébreu. `last_name` est le nom de famille. La MRZ tronque souvent : on complète si l’ordre est le même (`completeGivenNames`), accents de la ligne imprimée (`Hélie, Gaspar, Augustin`). Un prénom de trois lettres n’est pas écarté. Un `<` lu S, K ou X ne rallonge pas le prénom (`Noémie`, pas `Snoémie` ; `Lina`, pas `Linas` quand la forme courte est aussi lue).
- **Nom d'épouse** : la MRZ n'a que le nom de naissance (`last_name`). Le nom d'usage / « épouse » / « ép. » / « née » va dans `usage_name` (`spouseFamilyNames`). Ne pas le perdre au merge. Null si la pièce n'en a pas. Si l’OCR lit « ép. » comme `6p,` ou `66,`, le second nom de la ligne « Nom » reste le nom d’épouse.
- **Nationalité** : toujours un code ISO 2 (`FR`) sur la fiche Identité (`CountrySelect`). Vision/MRZ peuvent renvoyer « Française », FRA ou seulement le pays d’émission — `resolveNationality` (+ fallback `issuing_country`). Ne jamais stocker l’adjectif. Toute erreur de nationalité se corrige dans `lib/crm/countries.ts` + un test.
- Ne **pas** logger numéro / MRZ.
- Champs : n°, nationalité, naissance, expiration, `place_of_birth`, `authority`, `personal_number` (migration passport_fields).
- Pièce **pour un voyage** : `crm_travel_documents.booking_id` / `traveler_id` (docs d’identité utiles à ce séjour, en plus des confirmations `crm_booking_documents`). La section **Validation des pièces** n’en montre **qu’une** par personne et par numéro (`reviewIdentityPieces`) : la copie coffre, pas chaque clone de séjour. Un nouveau passeport ou une nouvelle carte d’identité au coffre remplace la pièce du même type pour cette personne.
- **Adresse personnelle** : si la pièce imprime un domicile (passeport français, carte d’identité, titre de séjour, permis), le recopier sur la fiche du **titulaire** (`address_line`, `postal_code`, `city`, `country`) seulement dans les champs encore vides. Passeport français : la première adresse seulement. La suivante, celle du représentant légal d’un mineur, ne compte pas. Un passeport sans adresse ne remplit rien. Ne jamais inventer, ne pas prendre le lieu de naissance, ne pas écraser une adresse déjà saisie, ne pas toucher l’adresse de facturation. L’adresse d’un accompagnateur ne va pas sur la fiche du titulaire.
- Rattachement : un mot du prénom suffit (« Jérémy » = « Jérémy Moïse »), une lettre d’écart dès 4 lettres (`Leoh` / `Leo`), nom égal ou à deux caractères près. Virgule, nom inversé ou nom entier dans un seul champ comptent. Le passeport du titulaire rangé sur un accompagnateur du même nom est le sien. `Louise` ≠ `Noah`. « Adulte N » n’est pas une personne. Un passeport de coffre unique et non expiré est coché pour le séjour (`lib/crm/person-match.ts`, `reconcile-party.ts`).

UI : bloc pièce **replié** par défaut (passeport). Copy courte, pas « Uploadez le passeport du titulaire pour préremplir » en hint permanent.

## Fidélité / facturation

- Carte `loyalty` (jsonb) sur le **titulaire** et sur **chaque accompagnateur**. Numéro normalisé (majuscules, sans espaces).
- Programmes : Flying Blue, Miles & More, Executive Club, Skywards, Marriott Bonvoy, ALL Accor, Grand Voyageur (SNCF), Great Members (Club Med).
- `flying_blue` du titulaire reste recopié depuis la carte (colonne historique).
- Société : `crm_billing_companies` (plusieurs par client, onglets Facturation). La première est recopiée sur `company_name`, `siret`, `vat_number`, `billing_email`, `billing_address_line`, `billing_postal_code`, `billing_city`, `billing_country` pour la recherche. L’encours reste global, sauf crédit / Pro (`funding`) : skill `travelba-money`.
- Recherche annuaire (`recherche-entreprises.api.gouv.fr`) : chaque ligne montre de quoi reconnaître la société — raison sociale, enseigne si elle diffère, forme (SAS, SARL…), activité NAF, adresse complète, SIRET, siège ou établissement (et la ville du siège si ce n’est pas le même), année de création, nombre d’établissements, dirigeant. Une société cessée est marquée.
- Adresse perso ≠ adresse de facturation. Les deux peuvent exister.
- **Rôle société** (`company_role`) :
  - `null` = particulier (comportement historique)
  - `admin` = admin société : wallet / grand livre (Revolut, crédit disponible)
  - `member` = collaborateur rattaché via `billing_parent_id` → ne voit **que** les débits de **ses** dossiers, pas les revenus société. `spending_allowance` (fiche, agence seulement) est son droit sur ce wallet ; null = pas de plafond, l’écran Transactions reste la liste des frais
- Dossier : `crm_bookings.billing_customer_id` = qui paie (`syncBookingDebit` poste sur ce wallet). Défaut = `billing_parent_id` si member, sinon titulaire.
- Fiche agence du payeur : les dossiers facturés sur ce compte sont listés avec le nom du voyageur (rapprochement). L’espace client du payeur ne montre pas le carnet du collaborateur.

## OCR

`lib/crm/ocr-document.ts`, `lib/crm/mrz-parse.ts`, `lib/crm/passport-scan.ts`. Toute erreur MRZ réelle se corrige **là** + un test `lib/crm/passport-extract.test.ts` / `identity.test.ts` / `passport-mrz.test.ts`. Ne pas envoyer le scan passeport dans le prompt carnet `gpt-4o`. Les prénoms extraits = **tous**, ordre latin, jamais l’ordre hébreu.

## Admin fiche

L’agence change l’e-mail titulaire sur la fiche : `crm_customers.email` et le compte Auth suivent. Une adresse déjà prise par un autre client est refusée. Le client ne change pas son identifiant. Pas de scan dropzone résa sur la fiche client admin. Créer ≠ inviter : skill `travelba-auth`.
