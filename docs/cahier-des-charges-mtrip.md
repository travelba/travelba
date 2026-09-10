# Cahier des charges — Intégration mTrip (CRM Travelba)

**Version :** 1.0  
**Date :** 2026-09-09  
**Projet :** Travel Business Agency / Travelba  
**Objectif :** Spécifier le produit et l’interface web pour créer / mettre à jour des voyages mTrip depuis le CRM (dossiers), à partir de PDF et de données structurées.

---

## 1. Contexte & objectifs

### 1.1 Contexte
mTrip fournit une app white-label voyageurs (itinéraire, vols, hôtels, documents, notifications). L’agence TBT dispose déjà d’un accès API production et d’un back-office CRM (`/admin`) orienté Little Emperors (dossiers, devis, résas).

### 1.2 Objectif produit
Permettre à un agent, depuis l’interface web admin :

1. De **créer automatiquement un voyage mTrip** lié à un dossier CRM.
2. D’**importer des PDF** (billets, confirmations hôtel) pour pré-remplir le voyage.
3. D’**enrichir** le voyage (photos hôtels, descriptions, contacts, prix).
4. D’**envoyer le lien app** aux voyageurs (email / WhatsApp / copie).
5. De **mettre à jour** le voyage (re-push complet) sans perdre le lien dossier ↔ mTrip.

### 1.3 Périmètre V1 (MVP)
- Compte mTrip **TBT** (production USA `api.mtrip.com`).
- Création / update trip depuis un dossier.
- Import PDF multi-fichiers → extraction → revue agent → publication.
- Inventaires hôtels (5 photos + description).
- Génération liens app + mots de passe voyageurs.
- Mapping dossier CRM ↔ `trip.identifier`.

### 1.4 Hors périmètre V1
- Sync GDS automatique (Amadeus / Sabre / Travelport) — déjà listé côté mTrip, pas requis pour le flux PDF.
- Push notifications marketing (endpoint existant, option à activer chez mTrip).
- SSO OBT / mid-office.
- App mobile native TBT (on consomme mTrip).

---

## 2. Comptes & authentification API

### 2.1 Environnements
| Env | Base URL |
|-----|----------|
| Sandbox | `https://sandbox.mtrip.com` |
| Production USA | `https://api.mtrip.com` ← **utilisé TBT** |
| Production Europe | `https://api1.mtrip.com` |

Doc : `https://doc.mtrip.com/` (protégée).

### 2.2 Auth
- **HTTP Basic Auth** : `Authorization: Basic base64(API_ID:API_KEY)`
- `Content-Type: application/json`
- HTTPS uniquement, TLS ≥ 1.2
- **Jamais** exposer `MTRIP_API_*` côté client (`NEXT_PUBLIC_` interdit)

### 2.3 Variables d’environnement
```
MTRIP_API_URL=https://api.mtrip.com
MTRIP_API_ID=
MTRIP_API_KEY=
MTRIP_ACCOUNT_ID=66582
MTRIP_PRIMARY_ID=TBT123
```

### 2.4 Comptes CMS détectés
| Nom | `agency_id` | `office_id` / primary | Notes |
|-----|-------------|------------------------|-------|
| **TBT test** | `66582` | `TBT123` | **Compte à utiliser pour le CRM / tests** |
| TBT | `19280` | `PARA122WX` (+ corporate `RZERDOUN`) | Prod — ne pas utiliser pour les essais |

### 2.5 Règle de liaison trip ↔ compte (critique)
- Utiliser **`mtrip_account_id` seul** (ex. `66582` pour TBT test).
- **Ne pas** combiner `mtrip_account_id` + `primary_id` : l’API renvoie `404 No agency found`.
- Alternative possible : `primary_id` seul (ex. `TBT123`) — non recommandé si `agency_id` est connu.

---

## 3. Capacités API à exploiter

### 3.1 Endpoints utiles
| Méthode | Path | Usage UI |
|---------|------|----------|
| `GET` | `/v1/health` | Statut API (ops) |
| `GET` | `/v1/accounts` | Sélecteur compte / debug |
| `POST` | `/v1/trips` | Créer **ou** mettre à jour (upsert) un voyage |
| `DELETE` | `/v1/trips` | Supprimer par `identifier` |
| `GET` | `/v1/trips/internal_identifier?identifier=` | Vérifier existence → afficher `trip_id` |
| `POST` | `/v1/inventories` | Catalogue hôtel/activité (multi-photos) |
| `POST` | `/v1/travelers` | Voyageurs hors trip (avancé) |
| `DELETE` | `/v1/travelers` | Suppression voyageurs |
| `GET` | `/v1/travelers/mobile_app_link` | Lien app pré-auth |
| `POST` | `/v1/travelers/notifications` | Push (si activé) |
| `POST` | `/v1/external_bookings` | Lecture résas ajoutées dans l’app |

### 3.2 Lien app — paramètre exact
```
GET /v1/travelers/mobile_app_link?user_identifier={id}&trip_identifier={id}
```
⚠️ Le paramètre s’appelle **`user_identifier`** (pas `traveler_identifier`).  
Réponse : `{ "mobile_app_link": "https://abre.app.link/..." }`

### 3.3 Upsert trip
- `POST /v1/trips` avec le **même `identifier`** = mise à jour.
- La mise à jour exige de **renvoyer l’itinéraire complet**.
- Les éléments saisis manuellement dans le CMS mTrip ne sont pas écrasés.
- Voyages **passés** non modifiables → supprimer puis re-créer.

---

## 4. Modèle métier Trip (champs pour l’UI)

### 4.1 Meta voyage (obligatoire / best practice)
| Champ | Obligatoire | Valeur recommandée TBT |
|-------|-------------|-------------------------|
| `name` | Oui (UX) | Titre dossier / destination |
| `identifier` | Oui | Stable = `dossier-{uuid}` ou slug métier |
| `mtrip_account_id` | Oui | `66582` (TBT test) |
| `start_date` / `end_date` | Oui | ISO date-time |
| `trip_type` | Recommandé | `type_4` (loisirs / indépendants) |
| `status` | Recommandé | `published` (ou `draft` en revue) |
| `booking_status` | Recommandé | `confirmed` \| `pending` \| `cancelled` |
| `booking_visibility` | Recommandé | `true` (partage infos vol/hôtel) |
| `description` | Recommandé | HTML « Trip Information » |
| `picture_url` | Optionnel | Cover 1280×960 |
| `trip_update_notifications` | Recommandé | Message FR ≤ 150 car. ; `""` = pas de notif |
| `sort_items_by_position` | Optionnel | `true` si ordre manuel |
| `template_id` | Optionnel | Modèles tours organisés |
| `contacts` | Recommandé | Contact agence custom |
| `prices` / `total_price` / `price_currency` / `price_note` | Optionnel | Totaux devis |

**Layouts `trip_type` :**
- `type_2` — Tours & MICE wide / cruise  
- `type_3` — Tours & MICE slim  
- `type_4` — Indépendants (loisirs & business) ← **défaut TBT**

### 4.2 Destinations (obligatoire, ≥ 1)
Champs clés : `name`, `country_iso_code`, `locode` (UNECE city), `start_date`, `end_date`, `description` (HTML), `picture_url`, `location.{latitude,longitude}`, `position`, `active_for_every_traveler`.

⚠️ Chaque destination doit avoir **start_date et end_date** (sinon warning API).

### 4.3 Travelers (obligatoire, ≥ 1)
| Champ | Notes UI |
|-------|----------|
| `identifier` | ID stable CRM (slug) |
| `first_name` / `last_name` | Depuis client / PDF |
| `email` / `phone` | Requis pour invitations |
| `password` | 6–256 car. — généré auto, affichable une fois |
| `language` | Défaut `fr` |
| `role` | `lead_traveler`, `traveler`, … |
| `send_invitation_type` | `0` aucune · `1` envoyer email |
| `send_invitation_sms` | `true` si téléphone |
| `booking_reference` | PNR principal |

### 4.4 Flights
Champs utiles issus des e-tickets :
`airline_iata`, `flight_number`, `departure_date`/`arrival_date`, aéroports + IATA, terminaux, `aircraft`, `operator`, `booking_reference` (PNR), `duration`, `comments`, `position`.

**Par voyageur** (`flights_travelers_details`) :
`traveler_identifier`, `reservation_reference`, `e_ticket`, `class` (`Economy` \| `Premium Economy` \| `Business` \| `First`), `seat_number`, `baggage_allowance`, `frequent_flyer_number`, `cancellation_conditions`, VCC.

Services annexes : `lounge`, `vip`, `meet`, `trsf`, etc.

Si plusieurs PNR sur le même vol physique → **un segment** + détails par voyageur (`active_for_every_traveler: false`).

### 4.5 Accommodations
Champs : `name`, `booking_number`, `from_date`/`to_date`, `check_in_time`/`check_out_time`, `type_of_room`, `address`, `city`, `country_code`, `phone`, `email`, `website`, `chain_code` (logo), `location`, `info` (HTML description), `picture_url` (**1 seule**), `inventory_id`, `position`, détails par voyageur.

### 4.6 Inventories (multi-photos — obligatoire pour galerie hôtel)
`POST /v1/inventories` :
```json
{
  "name": "Waldorf Astoria Panama",
  "inventory_id": "inv-waldorf-astoria-pty",
  "inventory_type": "accommodation",
  "description": "<p>HTML…</p>",
  "address": "…",
  "city": "Panama City",
  "picture_url": ["https://…/1.jpg", "https://…/2.jpg", "… jusqu'à 5+"]
}
```
Puis sur chaque accommodation du trip : `"inventory_id": "inv-waldorf-astoria-pty"`.

Sources photos V1 : **Little Emperors** `GET /hotels/{id}` → `images[].url` (CloudFront).

#### Descriptions hôtels — règle rédactionnelle (obligatoire)
- **Langue : français uniquement** (voyageurs TBT).
- **Ton : agence de voyages**, pas la fiche technique brute LE/hôtel (souvent en anglais).
- La description doit :
  - présenter l’hôtel et son **positionnement** (luxe, charme, emplacement) ;
  - expliquer **pourquoi l’agence l’a choisi** dans l’itinéraire ;
  - mentionner l’**ambiance / quartier** et 2–4 atouts concrets (spa, piscine, resto, vue…) ;
  - rappeler les **avantages Little Emperors** inclus (petit-déj, crédit, upgrade…) ;
  - rester lisible sur mobile (2–4 courts paragraphes HTML `<p>`).
- Ne **pas** coller tel quel `hotel.description` LE en anglais.
- Champs concernés : Inventory `description` + Accommodation `info` (+ optionnel détail chambre).

### 4.7 Documents
- Uniquement des **URLs HTTPS** (pdf, jpg, png, doc…).
- Pas d’upload binaire direct mTrip.
- V1 : upload vers **Supabase Storage** (bucket dédié `mtrip-documents` ou réutiliser `agency-quotes`) puis lien dans `documents[]`.

### 4.8 Autres blocs (V1.1+)
`trains`, `car_rentals`, `cruises`, `transports`, `activities` (reminders, reviewable), `contacts`.

---

## 5. Profil « meilleures options » TBT (defaults produit)

À appliquer par défaut dans l’UI (modifiables avant publish) :

| Option | Valeur |
|--------|--------|
| Compte | `mtrip_account_id = 66582` (TBT test) |
| Layout | `trip_type = type_4` |
| Publication | `status = published` (après revue) / `draft` pendant édition |
| Réservation | `booking_status = confirmed` |
| Visibilité booking | `booking_visibility = true` |
| Langue voyageurs | `fr` |
| Invitations | email `send_invitation_type = 1` si email ; SMS si téléphone |
| Contact agence | custom — `contact@travelbt.fr` / tél. agence |
| Notif update | Message FR ≤ 150 caractères |
| Photos hôtel | Inventory 5 photos + description LE |
| Identifier | Stable lié au dossier CRM |

Helper existant : `lib/mtrip/build-trip.ts` → `buildBestTrip()`.

---

## 6. Flux métier PDF → voyage mTrip

### 6.1 Parcours agent
```
[Dossier CRM]
    → Upload PDF (billets, hôtels, vouchers)
    → Extraction automatique
    → Écran de revue / correction
    → Enrichissement (photos LE, descriptions, contacts, prix)
    → Hébergement documents (HTTPS)
    → Publish mTrip (draft puis published)
    → Afficher trip_id + liens app
    → Partage WhatsApp / email
```

### 6.2 Extraction attendue (parsers)
**E-tickets aériens :**
- Passager (prénom, nom)
- Numéro de billet (e-ticket)
- PNR / référence dossier compagnie
- Cie, numéro de vol, opérateur
- Dates/heures départ & arrivée
- Aéroports, IATA, terminaux
- Classe, bagages, aircraft

**Confirmations hôtel :**
- Nom hôtel, adresse
- Check-in / check-out
- Booking reference
- Type de chambre, nb adults
- Booking name
- Total, devise, conditions d’annulation
- Avantages LE si présents

### 6.3 Règles de consolidation
- Grouper les segments de vol identiques → 1 flight + `flights_travelers_details[]`.
- Plusieurs chambres même hôtel → N accommodations, **1 inventory** partagé.
- Déduire destinations depuis aéroports / villes + dates.
- Détecter trous d’itinéraire (ex. Bocas sans hôtel) → **warning UI**, ne pas bloquer.

### 6.4 Retour d’expérience (cas Benamara Panama)
Voyage réel créé avec succès :
- `identifier` : `benamara-panama-2026-08`
- `trip_id` : `16574660`
- 5 voyageurs, 4 vols, 4 chambres, 2 inventaires (5 photos chacun)
- Gaps signalés : hébergement 3–14 août, emails voyageurs absents des PDF, documents PDF non attachés tant que non hébergés

Ces remarques deviennent des **requirements UI** (warnings, champs manquants, upload docs).

---

## 7. Spécification interface web (CRM `/admin`)

### 7.1 Navigation
Ajouter dans `AdminNav` :
- Entrée **mTrip** ou section dans le dossier : onglet « App voyageur (mTrip) ».

### 7.2 Écran Dossier — onglet mTrip
**États :**
1. `not_linked` — pas encore de trip
2. `draft` — trip en brouillon
3. `published` — trip publié
4. `error` — dernier push en échec

**Actions principales :**
| Action | Comportement |
|--------|--------------|
| Créer voyage mTrip | Génère `identifier = dossier-{id}`, préremplit depuis dossier + client |
| Importer PDF | Multi-upload → job extraction → écran revue |
| Enrichir hôtels | Recherche LE → inventaire 5 photos + description |
| Publier / Mettre à jour | `POST /v1/trips` full payload |
| Copier lien app | Par voyageur |
| Envoyer invitation | Active email/SMS si contacts présents |
| Supprimer trip | Confirm + `DELETE /v1/trips` |

### 7.3 Écran revue post-extraction
Tabs :
1. **Voyageurs** — édition inline, email/tél manquants en rouge
2. **Vols** — timeline + détails PNR/e-ticket
3. **Hôtels** — chambres, inventaire, galerie
4. **Destinations** — ordre, dates, locode
5. **Documents** — PDF uploadés + statut HTTPS
6. **Prix & contacts**
7. **Preview payload** (JSON collapsible, mode avancé)

Boutons : Enregistrer brouillon CRM · Publier mTrip · Diff vs dernier publish.

### 7.4 Composants UI à prévoir
- `MtripStatusBadge`
- `MtripTravelerTable` (password reveal once, copy app link)
- `MtripFlightTimeline`
- `MtripHotelCard` (galerie 5 photos, description HTML sanitized)
- `MtripPdfDropzone`
- `MtripPublishDialog` (checklist : emails, photos, dates destinations, account_id)
- `MtripGapWarnings` (trous d’itinéraire)

### 7.5 Données à persister (Supabase)
Nouvelle table proposée : `agency_mtrip_trips`
| Colonne | Type | Description |
|---------|------|-------------|
| `id` | uuid | PK |
| `dossier_id` | uuid | FK dossier |
| `mtrip_identifier` | text | unique |
| `mtrip_trip_id` | bigint | nullable jusqu’au 1er publish |
| `mtrip_account_id` | int | défaut 66582 (TBT test) |
| `status` | text | draft / published / deleted |
| `payload` | jsonb | dernier payload envoyé |
| `extraction` | jsonb | résultat parsers PDF |
| `app_links` | jsonb | liens par traveler identifier |
| `last_error` | jsonb | nullable |
| `published_at` | timestamptz | |
| `created_at` / `updated_at` | timestamptz | |

Table `agency_mtrip_documents` (optionnel) : fichiers Storage + URL publique.

### 7.6 Routes API Next.js (à compléter / exposer)
Déjà amorcées :
- `GET /api/admin/mtrip/accounts`
- `GET|POST|DELETE /api/admin/mtrip/trips`

À ajouter :
| Route | Rôle |
|-------|------|
| `POST /api/admin/mtrip/extract` | Upload PDF → JSON structuré |
| `POST /api/admin/mtrip/inventories` | Créer inventory depuis LE hotel_id |
| `POST /api/admin/dossiers/[id]/mtrip/publish` | Build best trip + upsert |
| `GET /api/admin/dossiers/[id]/mtrip` | État + liens |
| `POST /api/admin/mtrip/app-links` | Refresh liens |
| `POST /api/admin/mtrip/documents` | Upload Storage → URLs |

Toutes protégées par `requireAdminUser()`.

---

## 8. Architecture technique

### 8.1 Code existant
```
lib/mtrip/client.ts      — client HTTP Basic
lib/mtrip/types.ts       — types OpenAPI-aligned
lib/mtrip/build-trip.ts  — defaults « best options »
app/api/admin/mtrip/...  — routes admin
scripts/create-benamara-mtrip.mjs
scripts/update-benamara-hotels-media.mjs
```

### 8.2 Principes
- Toute logique mTrip **côté serveur** uniquement.
- Upsert = payload **complet** reconstruit depuis CRM + extraction.
- Photos : préférer URLs LE CloudFront (déjà HTTPS, stables).
- Documents PDF : Storage Travelba → URL signée ou publique HTTPS.
- Ne jamais logger API keys / mots de passe voyageurs en clair (sauf affichage one-time UI agent).

### 8.3 Sécurité
- Secrets uniquement `.env.local` / Vercel env.
- Pas de commit de PDF clients ni credentials trip.
- Sanitizer HTML pour `description` / `info` (XSS).
- Rate-limit uploads PDF.
- Audit : qui a publié quel trip (user_id).

---

## 9. Critères d’acceptation (V1)

1. Depuis un dossier, un agent peut publier un trip mTrip en &lt; 3 clics après revue.
2. Import de N PDF produit un brouillon éditable (voyageurs, vols, hôtels).
3. Les champs manquants critiques (email si invitation, dates destination) sont signalés.
4. Chaque hôtel publié peut avoir **5 photos + description** via inventory.
5. Après publish : `trip_id` visible + lien app par voyageur copiable.
6. Re-publish avec le même `identifier` met à jour sans créer de doublon.
7. Échec API affiche le `message` mTrip (ex. agency not found) de façon actionnable.
8. Aucune clé mTrip n’apparaît dans le bundle client.

---

## 10. Maquettes / UX — contraintes design
- S’aligner sur le design system admin existant (pas de nouveau thème marketing).
- L’onglet mTrip est un **espace de travail agent** (dashboard OK ici).
- Priorité : checklist de publication, timeline vols, galerie hôtel, liens app.
- États vides clairs : « Aucun voyage mTrip — Importer des PDF ou Créer manuellement ».

---

## 11. Backlog priorisé

### P0 — MVP
- [x] Table `agency_mtrip_guides` + bucket Storage `agency-mtrip`
- [x] UI `/admin/mtrip` : passagers → PDF → publication
- [ ] Onglet mTrip sur dossier LE
- [ ] Publish / update depuis dossier (best options)
- [x] Affichage trip identifier + app links
- [x] Upload PDF + extraction basique (e-ticket + booking)
- [ ] Inventaire hôtel depuis LE (5 photos + description FR)

### P1
- [ ] Écran revue extraction complet
- [ ] Attach documents PDF via Storage
- [ ] Invitations email/SMS
- [ ] Warnings trous d’itinéraire
- [ ] Historique des publishes

### P2
- [ ] Trains / transferts / activités
- [ ] Push notifications
- [ ] Templates `trip_type` 2/3
- [ ] Multi-comptes mTrip (TBT test)

---

## 12. Références techniques internes

| Élément | Valeur / chemin |
|---------|-----------------|
| Doc API | https://doc.mtrip.com/ |
| Client | `lib/mtrip/client.ts` |
| Defaults | `lib/mtrip/build-trip.ts` |
| Compte CRM / test | agency_id `66582` (TBT test) |
| Compte prod | agency_id `19280` (TBT) |
| Exemple réussi | `benamara-panama-2026-08` / trip_id `16574660` |
| Param lien app | `user_identifier` + `trip_identifier` |
| Liaison compte | `mtrip_account_id` **seul** |

---

## 13. Glossaire
- **Trip / Guide** : itinéraire mTrip poussé via API  
- **Identifier** : clé métier stable (upsert)  
- **Inventory** : fiche réutilisable (hôtel/activité) avec galerie  
- **LE** : Little Emperors (sourcing dispo + médias hôtels)  
- **PNR** : référence réservation compagnie  

---

*Document vivant — à mettre à jour à chaque décision produit / contrainte API découverte.*
