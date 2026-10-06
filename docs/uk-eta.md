# ETA Royaume-Uni — contrat de vérification

Travelba ne consulte pas `https://check-your-travel-permission.homeoffice.gov.uk`. Il n’y a pas d’API officielle. Un assistant externe fait la recherche dans un navigateur, puis écrit le résultat dans Supabase avec la **clé service**.

Le numéro de passeport, la MRZ et la date de naissance ne sortent jamais dans un webhook, un e-mail ou un journal. Le numéro complet n’existe que dans `crm_travel_documents` et dans la vue `uk_eta_a_verifier` (rôle `service_role` seulement). Partout ailleurs, un numéro qui apparaîtrait est masqué sauf les 3 derniers caractères.

## Quand un dossier est concerné

Un voyageur est concerné si le dossier **n’est pas archivé** et a, sur une carte **active** (`flight`, `rail` ou `hotel`) :

- un vol qui touche un aéroport du Royaume-Uni (départ, arrivée ou escale) : `LHR`, `LGW`, `LCY`, `STN`, `LTN`, et les autres codes IATA dont le pays est `GB` (Édimbourg, Manchester, Glasgow, Belfast…) ;
- ou un train vers le Royaume-Uni (Eurostar : St Pancras, Londres, Ashford, Ebbsfleet) ;
- ou un hôtel dont le pays est le Royaume-Uni, ou la ville (Londres, Édimbourg, Manchester…).

La détection lit `crm_bookings.destination`, `crm_bookings.title`, et le titre / les détails des cartes (`title`, `details.country`, `details.city`, `details.address`, `details.hotel_name`, `from` / `to`). Une destination `London` avec un hôtel actif suffit : c’est le cas des dossiers `TB-2026-0040`, `TB-2026-0041` et `TB-2026-0043`.

Une carte `cancelled` ou `superseded` ne compte pas. New York, Londres (Ontario) et un hôtel dont le pays est explicitement ailleurs ne comptent pas. Dublin (`DUB`, Irlande) n’est pas le Royaume-Uni.

Nationalité du passeport retenu (le plus longuement valable) :

| Nationalité | Statut |
|---|---|
| Britannique ou irlandaise | `non_concerne` |
| Toute autre nationalité | `a_verifier`, puis le résultat |
| Nationalité absente | `a_verifier` (la pièce est incomplète) |

Le badge « Non concerné » correspond à `non_concerne`. Sans passeport dans `crm_travel_documents`, aucune ligne n’est créée.

## Site de contrôle

`https://check-your-travel-permission.homeoffice.gov.uk`

Champs saisis, et rien d’autre :

- pays de nationalité ;
- numéro de passeport ;
- date d’expiration du passeport ;
- date de naissance.

Pas de nom. Pas de date de délivrance.

Résultat déjà observé : `No current ETA found for your details` → statut `introuvable`. Ce message peut aussi vouloir dire : données inexactes, ETA expirée, ou passeport changé. Le noter dans `note`, sans recopier le numéro.

## Table `crm_uk_eta_checks`

Une ligne par dossier et par voyageur (`unique (booking_id, traveler_id)`).

| Colonne | Rôle |
|---|---|
| `id` | Identifiant de la vérification. C’est lui qu’on met à jour. |
| `booking_id` | Dossier `crm_bookings`. |
| `traveler_id` | Voyageur `crm_booking_travelers`. |
| `travel_document_id` | Passeport utilisé pour la recherche. Référence, pas une copie du numéro. |
| `status` | Voir la liste ci-dessous. |
| `application_number` | Référence ETA, **16 chiffres** quand elle est connue. 64 caractères maximum. Pas un numéro de passeport. |
| `valid_until` | Date de fin de validité (`YYYY-MM-DD`). 2 ans, ou l’expiration du passeport si elle arrive avant. |
| `passport_last3` | **Exactement 3** caractères du passeport auquel l’ETA est liée sur le site. Sert à détecter un ancien passeport. |
| `checked_at` | Date de la vérification. `null` = jamais vérifié. |
| `source` | Ex. `check-your-travel-permission.homeoffice.gov.uk`. |
| `note` | Précision courte, 400 caractères. Jamais de numéro de passeport. |
| `client_message_sent_at` | Envoi au client. Remis à `null` quand `checked_at` change. |
| `dispatch_key`, `dispatch_attempt_at`, `dispatched_at` | Dédoublonnage du webhook. Ne pas les modifier. |

### Statuts

`a_verifier`, `approuve`, `introuvable`, `refuse`, `en_attente`, `non_concerne`, `erreur`.

### Alertes calculées (non stockées)

Même jour = encore valable. « Avant » est strict.

- ETA `approuve` et `valid_until` **avant** la date de retour du dossier.
- `passport_last3` différent des 3 derniers caractères du passeport lié.
- Passeport qui expire **avant** `valid_until`.
- Passeport qui expire **avant** le retour.

« Approuvée et couvre tout le séjour » = `approuve`, aucune de ces alertes.

## Écrire un résultat

Mettre à jour la ligne existante. Ne pas en créer une autre : le CRM la crée quand le dossier devient concerné.

```sql
update public.crm_uk_eta_checks
set
  status = 'approuve',
  application_number = '1234567890123456',
  valid_until = '2028-10-30',
  passport_last3 = '567',
  checked_at = now(),
  source = 'check-your-travel-permission.homeoffice.gov.uk',
  note = null
where id = '<id de la vue>';
```

Exemples de statut :

- Approuvée jusqu’au 30/10/2028 : `status = 'approuve'`, `valid_until = '2028-10-30'`, `passport_last3` = les 3 derniers du passeport actuel, `application_number` = les 16 chiffres.
- Introuvable (`No current ETA found for your details`) : `introuvable`. La note peut dire `données inexactes, ETA expirée ou passeport changé`, sans numéro.
- Refusée : `refuse`. En attente côté site : `en_attente`. Échec de recherche : `erreur`.

Un trigger `AFTER INSERT OR UPDATE` insère une ligne dans `crm_uk_eta_notices` dès qu’un résultat est écrit (`checked_at` renseigné, statut autre que `a_verifier` et `non_concerne`). L’agence voit la notification sur le tableau de bord et sur la fiche. Le cron envoie l’e-mail interne.

Ne jamais écrire le numéro complet, la MRZ ou la date de naissance dans `note`, `application_number` ou `source`. Ne pas modifier `dispatch_key`, `dispatch_attempt_at`, `dispatched_at`.

### Quels statuts créent une notice

| Résultat | Notice |
|---|---|
| `a_verifier`, `non_concerne`, ou `checked_at` vide | aucune |
| `introuvable`, `refuse`, `en_attente`, `erreur` | `alerte` |
| `approuve` qui expire avant le retour, liée à un autre passeport, ou dont le passeport n’arrive pas au bout | `alerte` |
| `approuve` qui couvre tout le séjour | `valable` |

L’e-mail agence part pour chaque notice. Les alertes citent : ETA introuvable, refusée, expire avant le retour, liée à un ancien passeport. Le cas `valable` est un récapitulatif court.

## Vue `uk_eta_a_verifier`

Lecture **service_role** uniquement. `anon` et `authenticated` n’ont pas le droit. `security_invoker = true`.

Elle liste les vérifications dont le départ (date du dossier, sinon premier début de carte, heure de Paris) est **aujourd’hui ou dans les 90 jours**, dossier non archivé, statut autre que `non_concerne`, et au moins un de ces cas :

- jamais vérifié (`checked_at` null) ;
- statut `a_verifier`, même si `checked_at` est récent (clic « Vérifier l’ETA ») ;
- statut autre que `approuve`, vérifié il y a **plus de 7 jours** ;
- `approuve` mais `valid_until` avant le retour ;
- `passport_last3` différent du passeport enregistré.

Colonnes : `id`, `booking_id`, `traveler_id`, `reference`, `traveler_first_name`, `traveler_last_name`, `departure_on`, `return_on`, `status`, `checked_at`, `valid_until`, `application_number`, `passport_last3`, `travel_document_id`, `passport_number`, `birth_date`, `nationality`, `issuing_country`, `issued_on`, `expires_on`.

Pour le site Home Office : `nationality`, `passport_number`, `expires_on`, `birth_date`. Les noms et `issued_on` ne sont pas saisis sur le site.

```sql
select id, reference, traveler_first_name, traveler_last_name,
       passport_number, birth_date, nationality, expires_on,
       departure_on, return_on, status
from public.uk_eta_a_verifier;
```

À lancer avec la clé service (SQL editor rôle postgres, ou client service). Un utilisateur connecté à l’agence ne doit pas voir cette vue.

## Webhook

Quand une vérification **passe à** `a_verifier` (nouveau séjour au Royaume-Uni, passeport ajouté ou changé, bouton « Vérifier l’ETA »), le serveur fait un `POST` JSON.

Un seul appel par changement. La fonction `crm_claim_uk_eta_dispatch` pose le verrou. Si l’appel échoue, un nouvel essai est possible après 15 minutes. Une nouvelle clé (clic ou changement de passeport) remet `dispatched_at` à vide, pour que cet essai ait lieu. Si `UK_ETA_WEBHOOK_URL` ou `UK_ETA_WEBHOOK_KEY` manque, rien n’est appelé et rien n’est journalisé : la ligne reste `a_verifier`.

Corps, et rien d’autre :

```json
{
  "id": "<crm_uk_eta_checks.id>",
  "booking_id": "<dossier>",
  "traveler_id": "<voyageur>",
  "departure_date": "2026-10-30",
  "kind": "uk_eta"
}
```

`departure_date` peut être `null`. `kind` vaut toujours `uk_eta`. L’ESTA peut viser la même URL : son corps porte `"kind": "esta"`.

Le passage `GET /api/cron/uk-eta` reprend le même départ que la vue : date du dossier, sinon le premier début de carte active à l’heure de Paris. Il traite les 200 départs les plus proches, ordre date puis id.

En-tête : `UK_ETA_WEBHOOK_KEY_HEADER` (défaut `Authorization`). Si le nom est `Authorization`, la valeur est `Bearer <UK_ETA_WEBHOOK_KEY>`. Sinon la valeur est la clé seule.

## Variables d’environnement (Vercel, production)

| Variable | Rôle |
|---|---|
| `UK_ETA_WEBHOOK_URL` | URL qui reçoit le POST. Absente : aucun appel. |
| `UK_ETA_WEBHOOK_KEY` | Secret. Vide sur une preview Vercel (`productionOnlySecret`). Absente : aucun appel. |
| `UK_ETA_WEBHOOK_KEY_HEADER` | Nom de l’en-tête. Défaut `Authorization`. |
| `UK_ETA_CLIENT_AUTO_SEND` | `1`, `true` ou `oui` : le message client part seul. Sinon l’agence clique « Envoyer au client ». Éteint par défaut. |
| `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` | Déjà utilisés pour les e-mails. |
| `CRON_SECRET` | Déjà utilisé. Le passage est `GET /api/cron/uk-eta` toutes les 15 minutes. |

## Messages

Agence (`contact@travelba.fr`) : alerte si l’ETA est introuvable, refusée, expire avant le retour, ou liée à un ancien passeport. Récapitulatif court si elle couvre le séjour.

Client, en français, depuis la fiche (clic « Envoyer au client », sauf `UK_ETA_CLIENT_AUTO_SEND`) : l’ETA est obligatoire, 20 £ par personne enfants compris, demande uniquement sur `https://www.gov.uk/eta` ou dans l’application UK ETA, décision en général dans la journée et au plus tard sous 3 jours ouvrés, valable 2 ans ou jusqu’à l’expiration du passeport, liée au passeport. Si un numéro de passeport apparaissait, il est masqué sauf les 3 derniers caractères.

Le badge envoie le cas connu par WhatsApp. `UK_ETA_CLIENT_AUTO_SEND` reste éteint. Le même modèle ne part qu’une fois pour ce voyageur et ce séjour, sauf le bouton « Renvoyer ». Le contrat du webhook et les colonnes `dispatch_*` ne changent pas.

| Cas | Modèle | Repli sans photo |
|---|---|---|
| Introuvable | `TWILIO_CONTENT_ETA_UK_MANQUANT_CARTE_PHOTO` | `TWILIO_CONTENT_ETA_UK_MANQUANT_CARTE` |
| Expire avant le retour ou le départ | `TWILIO_CONTENT_ETA_UK_EXPIRE_CARTE_PHOTO` | `TWILIO_CONTENT_ETA_UK_EXPIRE_CARTE` |
| Ancien passeport | `TWILIO_CONTENT_ETA_UK_ANCIEN_PASSEPORT_CARTE_PHOTO` | `TWILIO_CONTENT_ETA_UK_ANCIEN_PASSEPORT_CARTE` |
| Approuvée pour tout le séjour | `TWILIO_CONTENT_ETA_UK_APPROUVE_CARTE_PHOTO` | `TWILIO_CONTENT_ETA_UK_APPROUVE_CARTE` |

Sans téléphone, sans acceptation WhatsApp, ou sans SID approuvé, le badge dit pourquoi. La photo est `/whatsapp/visa.jpg`. Le bouton ouvre le séjour.

Soumettre à Meta : `npx tsx scripts/arm-whatsapp-concierge.ts`. Coller chaque SID dans la variable sur Vercel Production, puis redéployer. Ne pas commiter les SID.

## RLS

`crm_uk_eta_checks` et `crm_uk_eta_notices` : RLS activée. L’agence lit. L’écriture (résultat, webhook, e-mail) passe par la clé service. Pas de lecture client. La vue `uk_eta_a_verifier` n’est lisible que par `service_role`.

## Migrations

`supabase/migrations/20261006201000_uk_eta_checks.sql` est appliquée en production (version enregistrée `20261006143711`).

`supabase/migrations/20261006224500_esta_uk_eta_dispatch_retry.sql` reste à appliquer sur `fsmfozxgujskluxakeoq`. Elle remplace seulement `crm_claim_esta_dispatch`, `crm_claim_uk_eta_dispatch`, `esta_a_verifier` et `uk_eta_a_verifier`. Idempotente. Le code tolère l’absence de la table : la fiche s’ouvre, la vérification attend le schéma.
