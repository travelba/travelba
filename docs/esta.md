# ESTA — contrat de vérification

Travelba ne consulte pas `https://esta.cbp.dhs.gov/`. Il n’y a pas d’API officielle, et le site bloque les robots. Un assistant externe fait la recherche dans un navigateur, puis écrit le résultat dans Supabase avec la **clé service**.

Le numéro de passeport, la MRZ et la date de naissance ne sortent jamais dans un webhook, un e-mail ou un journal. Le numéro complet n’existe que dans `crm_travel_documents` et dans la vue `esta_a_verifier` (rôle `service_role` seulement).

## Quand un dossier est concerné

Un voyageur est concerné si le dossier a, sur une carte **active** :

- un vol dont **l’arrivée** ou **une escale** est un aéroport américain soumis à l’ESTA ;
- ou un hôtel dont le pays est un de ces territoires.

Territoires ESTA (CBP) : États-Unis (`US`), Porto Rico (`PR`), îles Vierges américaines (`VI`), Guam (`GU`), Mariannes du Nord (`MP`).

Les Samoa américaines (`AS`, aéroport PPG) **ne** sont **pas** couvertes par l’ESTA.

Un vol qui **part** des États-Unis sans y arriver ni y faire escale (retour JFK → CDG seul) n’ouvre pas la vérification. Une carte `cancelled` ou `superseded` non plus.

Nationalité du passeport retenu (le plus longuement valable) :

| Nationalité | Statut |
|---|---|
| Pays du Visa Waiver Program (42 pays DHS, octobre 2026, dont Qatar, Israël, Taïwan, Royaume-Uni) | `a_verifier`, puis le résultat |
| États-Unis | `non_concerne` |
| Hors programme (Chine, Roumanie, etc.) | `non_concerne` |
| Nationalité absente | `a_verifier` (la pièce est incomplète) |

Le badge « Visa / non concerné » correspond à `non_concerne`. Un Britannique est traité comme éligible : le droit de séjour au Royaume-Uni n’est pas sur la fiche.

## Table `crm_esta_checks`

Une ligne par dossier et par voyageur (`unique (booking_id, traveler_id)`).

| Colonne | Rôle |
|---|---|
| `id` | Identifiant de la vérification. C’est lui qu’on met à jour. |
| `booking_id` | Dossier `crm_bookings`. |
| `traveler_id` | Voyageur `crm_booking_travelers`. |
| `travel_document_id` | Passeport utilisé pour la recherche. Référence, pas une copie du numéro. |
| `status` | Voir la liste ci-dessous. |
| `application_number` | Numéro de dossier ESTA, 64 caractères maximum. Pas un numéro de passeport. |
| `valid_until` | Date de fin de validité (`YYYY-MM-DD`). |
| `esta_passport_last3` | **Exactement 3** caractères du passeport auquel l’ESTA est lié sur le site. Sert à détecter un ancien passeport. |
| `checked_at` | Date de la vérification. `null` = jamais vérifié. |
| `source` | Ex. `esta.cbp.dhs.gov`. |
| `note` | Précision courte, ex. `étape 4 sur 7, jamais payé`. 400 caractères. Jamais de numéro de passeport. |
| `client_message_sent_at` | Envoi au client. Remis à `null` quand `checked_at` change. |
| `dispatch_key`, `dispatch_attempt_at`, `dispatched_at` | Dédoublonnage du webhook. Ne pas les modifier à la main. |

### Statuts

`a_verifier`, `approuve`, `inacheve`, `introuvable`, `refuse`, `en_attente`, `non_concerne`, `erreur`.

### Alertes calculées (non stockées)

Même jour = encore valable. « Avant » est strict.

- ESTA `approuve` et `valid_until` **avant** la date de retour du dossier.
- `esta_passport_last3` différent des 3 derniers caractères du passeport lié.
- Passeport qui expire **avant** `valid_until`.
- Passeport qui expire **avant** le retour.

« Approuvé et couvre tout le séjour » = `approuve`, aucune de ces alertes.

## Écrire un résultat

Mettre à jour la ligne existante. Ne pas en créer une autre : le CRM la crée quand le dossier devient concerné.

```sql
update public.crm_esta_checks
set
  status = 'approuve',
  application_number = 'ESTA-EXEMPLE',
  valid_until = '2027-08-29',
  esta_passport_last3 = '567',
  checked_at = now(),
  source = 'esta.cbp.dhs.gov',
  note = null
where id = '<id de la vue>';
```

Exemples de statut :

- Approuvé jusqu’au 26/03/2027, passeport qui expire le même jour : `status = 'approuve'`, `valid_until = '2027-03-26'`, `esta_passport_last3` = les 3 derniers du passeport actuel.
- Inachevé, étape 4 sur 7, jamais payé : `status = 'inacheve'`, `note = 'étape 4 sur 7, jamais payé'`, `valid_until = null`.
- Approuvé jusqu’au 29/08/2027 : `status = 'approuve'`, `valid_until = '2027-08-29'`.
- Introuvable : `introuvable`. Refusé : `refuse`. En attente côté site : `en_attente`. Échec de recherche : `erreur`.

Un trigger `AFTER INSERT OR UPDATE` insère une ligne dans `crm_esta_notices` dès qu’un résultat est écrit (`checked_at` renseigné, statut autre que `a_verifier` et `non_concerne`). L’agence voit la notification sur le tableau de bord (bloc ESTA) et sur la fiche. Le cron envoie l’e-mail interne.

Ne jamais écrire le numéro complet, la MRZ ou la date de naissance dans `note`, `application_number` ou `source`.

## Vue `esta_a_verifier`

Lecture **service_role** uniquement. `anon` et `authenticated` n’ont pas le droit. `security_invoker = true`.

Elle liste les vérifications dont le départ (date du dossier, sinon premier début de carte, heure de Paris) est **aujourd’hui ou dans les 90 jours**, dossier non archivé, statut autre que `non_concerne`, et au moins un de ces cas :

- jamais vérifié (`checked_at` null) ;
- statut autre que `approuve`, vérifié il y a **plus de 7 jours** ;
- `approuve` mais `valid_until` avant le retour ;
- `esta_passport_last3` différent du passeport enregistré.

Colonnes utiles pour le site ESTA : `passport_number`, `birth_date`, `nationality`, `issuing_country`, `issued_on`, `expires_on`.

Colonnes pour réécrire le résultat : `id`, `booking_id`, `traveler_id`, `reference`, `departure_on`, `return_on`, `status`, `travel_document_id`.

```sql
select id, reference, traveler_first_name, traveler_last_name,
       passport_number, birth_date, nationality, issuing_country, issued_on, expires_on,
       departure_on, return_on, status
from public.esta_a_verifier;
```

À lancer avec la clé service (SQL editor rôle postgres, ou client service). Un utilisateur connecté à l’agence ne doit pas voir cette vue.

## Webhook

Quand une vérification **passe à** `a_verifier` (nouveau segment ou hôtel aux États-Unis, passeport ajouté ou changé, bouton « Vérifier l’ESTA »), le serveur fait un `POST` JSON.

Un seul appel par changement. La fonction `crm_claim_esta_dispatch` pose le verrou. Si l’appel échoue, un nouvel essai est possible après 15 minutes. Si les variables manquent, rien ne casse : journal `[esta] webhook non configuré`, la ligne reste `a_verifier`.

Corps, et rien d’autre :

```json
{
  "id": "<crm_esta_checks.id>",
  "booking_id": "<dossier>",
  "traveler_id": "<voyageur>",
  "departure_date": "2026-11-01"
}
```

`departure_date` peut être `null`.

En-tête : `ESTA_WEBHOOK_KEY_HEADER` (défaut `Authorization`). Si le nom est `Authorization`, la valeur est `Bearer <ESTA_WEBHOOK_KEY>`. Sinon la valeur est la clé seule.

## Variables d’environnement (Vercel, production)

| Variable | Rôle |
|---|---|
| `ESTA_WEBHOOK_URL` | URL qui reçoit le POST. |
| `ESTA_WEBHOOK_KEY` | Secret. Vide sur une preview Vercel (`productionOnlySecret`). |
| `ESTA_WEBHOOK_KEY_HEADER` | Nom de l’en-tête. Défaut `Authorization`. |
| `ESTA_CLIENT_AUTO_SEND` | `1`, `true` ou `oui` : le message client part seul. Sinon l’agence clique « Envoyer au client ». |
| `RESEND_API_KEY`, `CONTACT_FROM_EMAIL` | Déjà utilisés pour les e-mails. |
| `CRON_SECRET` | Déjà utilisé. Le passage est `GET /api/cron/esta` toutes les 15 minutes. |

## Messages

Agence (`contact@travelba.fr`) : alerte si le résultat ne couvre pas tout le séjour, récapitulatif court s’il est valable.

Client, en français, depuis la fiche : ESTA valable jusqu’au JJ/MM/AAAA ; manquant ou inachevé avec `https://esta.cbp.dhs.gov/` et la consigne des 72 h ; ESTA lié à un ancien passeport. Si un numéro de passeport apparaissait, il est masqué sauf les 3 derniers caractères.

## RLS

`crm_esta_checks` et `crm_esta_notices` : RLS activée. L’agence lit. L’écriture (résultat, webhook, e-mail) passe par la clé service. Pas de lecture client.

## Migration

Fichier `supabase/migrations/20261006153000_esta_checks.sql`. À appliquer sur le projet Supabase `fsmfozxgujskluxakeoq` (SQL editor ou `apply_migration`) **avant** que l’assistant lise la vue. Le code tolère l’absence de la table : la fiche s’ouvre, la vérification attend le schéma.
