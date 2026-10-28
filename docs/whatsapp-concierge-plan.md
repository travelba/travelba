# Concierge WhatsApp — audit et plan (phase 1)

Statut : le MVP est dans la pull request du Concierge. La phase 2 (savoir, parcours, propositions à approuver) est dans la pull request empilée. Aucun message envoyé, aucun webhook modifié, aucune migration appliquée, rien fusionné.

Public : Benjamin, Travel Business Agency. Le bot parle au nom de l’agence, signature **Le Concierge**, vouvoiement, ton de conciergerie.

La phrase que le client envoie depuis l’espace (`whatsappModifyHref` dans `lib/crm/carnet.ts`) est exactement celle de la capture : `Bonjour, je voudrais modifier {réf} — {destination}.`

---

## 1. Ce que la capture montre

Le 18 octobre 2026, vers 19:39 (heure de Paris), le numéro de l’agence envoie le modèle déjà en production :

> Votre séjour à Deauville, réservation TB-2026-0089, est dans votre espace.
>
> Le Concierge

Bouton « Voir le séjour ». Ce texte est bien celui du modèle séjour, journalisé en base (`template_key` `sejour_texte`, 17:38 UTC).

À 19:54 le client écrit la demande de modification de TB-2026-0051. La réponse qui part dans la même minute est :

> Envoie une ou plusieurs photos de passeport ou de carte d'identité.

Tutoiement, et le sujet n’est pas la modification.

Cette phrase **n’existe nulle part dans ce dépôt**. Le webhook Travelba ne l’a pas produite.

Preuves, lecture seule, le 18 octobre 2026 :

- `crm_whatsapp_messages` contient le modèle Deauville. Il ne contient ni le message « modifier », ni la réponse passeport.
- Depuis l’ouverture du canal : **5 messages entrants** journalisés, le dernier le 29 septembre 2026. **Aucune** ligne dans `crm_whatsapp_requests`.
- Les logs Vercel Production des six heures autour de l’échange ne montrent aucun appel à `/api/webhooks/twilio/whatsapp`. Le cron hôtel tourne ; le webhook entrant, non.

Le numéro `+33 7 56 84 13 15` (`siteConfig.whatsappNumber`) envoie donc les modèles Travelba, et **un autre répondeur** répond aux messages entrants. Tant que ce répondeur reste branché sur l’expéditeur Twilio, le Concierge du dépôt ne voit pas les clients.

Les cinq entrants de septembre, eux, sont passés par Travelba. Le routeur a répondu en vouvoiement, signature Le Concierge, souvent par « Je n’ai pas cette information… ». Aucune demande n’a été ouverte pour l’agence.

---

## 2. Flux entrant actuel

```
Twilio WhatsApp (expéditeur agence)
        │
        ├─ modèles sortants  →  Travelba  (cron, invitation, formalité)
        │
        └─ messages entrants →  répondeur hors dépôt   ← la capture
                                 (passeport, tutoiement)

Le code prêt, non atteint en production :
POST /api/webhooks/twilio/whatsapp
        → receiveWhatsappWebhook
        → identification téléphone
        → routeur + modèle
        → texte libre (fenêtre 24 h)
        → journal crm_whatsapp_messages
```

### Route

Une seule route entrante : `app/api/webhooks/twilio/whatsapp/route.ts`.

`POST` lit le corps brut, vérifie `TWILIO_AUTH_TOKEN`, ouvre le client service Supabase, appelle `receiveWhatsappWebhook`, répond sans corps (`200`, `403`, `503` ou `500`). Runtime Node. Pas de limite de débit sur cette route.

`CONCIERGE_AUTOREPLY` est coupé par défaut. Seuls `1` et `true` l’ouvrent. Fermé, la signature est toujours vérifiée, le message entrant est enregistré (client connu, numéro inconnu, numéro partagé), une pièce est rangée et un statut est mis à jour. L’alerte CRM part, le badge de non-lus monte, le temps réel ouvre l’onglet du bas. Rien n’est renvoyé : ni réponse du robot, ni phrase de prospect, ni phrase fixe, ni lien d’accès. Les réponses libres saisies dans `/admin/whatsapp` ne dépendent pas de ce drapeau.

URL signée attendue : `https://travelba.fr/api/webhooks/twilio/whatsapp`, ou `TWILIO_WHATSAPP_WEBHOOK_URL` si elle est posée (`lib/crm/twilio-signature.ts`). Signature HMAC-SHA1 Twilio. Jeton absent → `503`. Signature fausse → `403`, rien n’est écrit. Rappel de statut (`MessageStatus` sans texte) → `200` ignoré. `MessageSid` déjà vu → `200` sans second envoi.

### Identification

`From` est normalisé en E.164 France (`phoneFromWhatsapp`).

Recherche : `crm_customers.phone` et `crm_customers.phone_secondary`, une fiche par identifiant.

| Cas | Comportement actuel |
|---|---|
| Une fiche | Le dossier de cette fiche est chargé. |
| Aucune fiche | Réponse fixe « L’espace s’ouvre sur invitation. » Sans signature. Message stocké avec `customer_id` vide. Pas de prospect. |
| Plusieurs fiches | « Je transmets à l’agence. » signé. Aucune demande créée, car il n’y a pas de fiche unique. Le fil n’apparaît sur aucune fiche. |

Le téléphone d’un accompagnateur (`crm_travel_companions.phone`) sert à l’envoi sortant d’une formalité. Il ne sert pas à reconnaître un message entrant. Un voyageur qui écrit de son propre numéro tombe dans « numéro inconnu ».

Société : un admin voit les séjours de ses collaborateurs rattachés (`loadCollaboratorTripOwnerIds`). Un collaborateur ne voit pas les séjours de l’admin ni ceux d’un autre admin.

### Ce que le client a le droit de lire

`buildConciergeDossier` (`lib/crm/whatsapp-concierge.ts`) ne garde que :

- séjours `visible_to_client`, non archivés ;
- étapes visibles, hors frais et hors dépenses ;
- prix seulement si `prices_visible` ;
- la note client déjà publiée (`shownClientNote`), pas la note interne ;
- libellés de pièces du séjour visibles, pas les numéros ;
- coffre : type, titulaire, date d’expiration — pas le numéro de pièce ;
- formalités (visa / ETA / ESTA) avec le texte d’étape client ;
- mouvements `posted` (12 derniers) et encours `crm_customer_balances`.

Les contacts d’hôtel Little Emperors n’entrent pas dans ce dossier. Les brouillons non plus.

### Passeport et photos

Si le message a une image ou un PDF (JPEG, PNG, WebP, HEIC, PDF, 8 Mo, URL `api.twilio.com` seulement) :

- un PDF qui contient un PAN est refusé, rien n’est gardé ;
- sinon le fichier va dans le coffre privé `customers/{id}/whatsapp/…`, pièce de type `other`, sans lecture MRZ, sans relecture humaine.

La réponse « Votre pièce est enregistrée dans votre coffre. » part même si le client parlait d’autre chose. Le scan passeport du dépôt (`lib/crm/ocr-document.ts`, `gpt-4o`) n’est pas appelé ici. La règle identité reste : une pièce n’est écrite sur la fiche qu’après relecture.

La phrase de la capture n’est pas ce chemin.

### Routeur, puis modèle

`planConciergeConversation` (`lib/crm/whatsapp-conversation.ts`) :

1. Stop, lien d’accès, ou acte métier (`classifyHandoff`) → réponse fixe, le modèle n’est pas appelé.
2. Sinon le modèle parle. Un fait absent du dossier ou de l’historique (heure, montant, téléphone, référence, lien, PAN) fait retomber sur le routeur.

Actes qui ouvrent une demande, sans rien modifier en base métier :

| Mot-clé | `kind` |
|---|---|
| modifier, changer, décaler, reporter | `change` |
| annuler | `cancel` |
| virement déjà fait, rapprocher, créditer | `payment` |
| déposer / lancer un visa, une ETA, un ESTA | `formality` |
| commander un chauffeur | `chauffeur` |
| plainte et réponse trop mince | `complaint` |
| le client demande à parler à l’agence, ou confirme l’offre | `question` |

Pour « Je voudrais modifier TB-2026-0051 », le code actuel répondrait, en vouvoiement :

> Je regarde, je vous fais un retour rapide
> Je transmets à l’agence.
> Cela concerne le séjour TB-2026-0051.
>
> Le Concierge

…et écrirait une ligne `crm_whatsapp_requests` de type `change`. C’est l’inverse de la capture. La capture n’a donc pas traversé ce code.

Le modèle : `generateText` + schéma Zod, **8 secondes**. Clé `OPENAI_API_KEY` (`sk-`) → `gpt-4.1-mini` direct. Sinon, sur Vercel, le modèle passe par l’AI Gateway sous le nom `openai/gpt-4.1-mini`, étiquette `feature:whatsapp-concierge`. Sans clé et hors Vercel, le routeur seul répond. Prompt système : vouvoiement, français ou anglais, aucun fait hors JSON, aucun emoji, la signature est ajoutée après. Historique : 16 tours, 24 heures.

Langue : `messageLanguage` ne connaît que `fr` et `en`. Un message en hébreu est traité comme du français.

### Fenêtre de 24 heures

`sendWhatsappSession` envoie un `Body` libre, avec une image `https` éventuelle. Pas de modèle Meta. Hors fenêtre, Twilio refuse ; la ligne sortante passe en `failed`. Le client ne reçoit rien, et aucun modèle de repli n’existe pour la conversation.

Les modèles Utility (séjour, pièces, passeport manquant, formalité, connexion, vols, ESTA, ETA) sont un autre tuyau : file `crm_whatsapp_messages` (`dedupe_key`, `payload`), cron `GET /api/cron/concierge`. Ils exigent l’opt-in (`whatsapp_opt_in_at`) et respectent l’opt-out. Ils ne répondent pas à une question.

### Journal, demandes, alertes

| Élément | Où | Ce qui manque |
|---|---|---|
| Fil | `crm_whatsapp_messages` | Visible sur la fiche client et le dossier, trois derniers messages repliés sur la fiche, fil entier sur le dossier. Lecture seule. |
| Demande | `crm_whatsapp_requests` | Pastille « Demande à traiter ». Pas de statut, pas de clic qui approuve, pas d’e-mail, pas de file d’accueil admin. |
| Opt-out | `whatsapp_opt_out_at` | `stop` / `arrêt` coupe les messages proactifs. Le bot continue de répondre, et il le dit. |
| Rafale | attente 1,2 s | Plusieurs bulles d’une minute sont fondues en une réponse. |
| Débit | `crm_rate_limits` | Utilisé par le contact, l’OTP, l’ingest. Pas par le webhook. |
| Prise de main | — | Aucun drapeau. Un humain qui répond depuis le téléphone WhatsApp n’arrête pas le bot. L’admin ne peut pas répondre depuis le fil. |

Le bot n’écrit ni le séjour, ni le grand livre, ni une formalité. C’est voulu.

### IA déjà dans le dépôt

Même SDK (`ai`, `@ai-sdk/openai`) : import de confirmations et OCR passeport en `gpt-4o`, retouche de couverture, Concierge en `gpt-4.1-mini`. `aiGatewayConfigured()` est vrai sur Vercel même sans clé `sk-`. L’ingest, lui, exige encore une clé OpenAI.

Il n’existe pas d’outil de recherche de disponibilités hôtel ou vol. Little Emperors sert à lire une réservation et un hôtel déjà identifiés (admin). Le catalogue d’hôtels aligne un nom sur une ville. Le desk hôtel rédige un courrier à l’hôtel, au clic de l’agence. Rien de tout cela ne cote un prix ni une chambre libre.

Le paiement client vit dans Transactions (carte, Apple Pay, prélèvement société, virement Revolut). Il n’y a pas de lien de paiement Stripe créé depuis WhatsApp.

---

## 3. Le Concierge visé

Un seul expéditeur, le webhook Travelba comme seul répondeur. Le bot fait le travail de renseignement de l’agent. Tout ce qui engage de l’argent ou une réservation devient une demande pour Benjamin, avec une réponse d’attente chaleureuse.

### Voix

Vouvoiement par défaut. Phrases courtes. Pas d’emoji. Signature `Le Concierge`, ajoutée par le code, jamais par le modèle. Français, anglais, hébreu : la langue du dernier message du client, avec repli sur la langue de la fiche. Un « oui » isolé reprend la langue de la proposition précédente (déjà le cas pour l’anglais).

### Identification

1. E.164 sur `phone` et `phone_secondary`.
2. Sinon le téléphone d’accompagnateur, rattaché à la fiche du client qui l’a enregistré. Le voyageur ne voit que le séjour auquel il appartient, pas le coffre entier ni l’encours.
3. Deux fiches pour le même numéro : aucune donnée. Réponse d’attente, demande `question` visible dans une file agence, sans choisir une fiche.
4. Numéro inconnu : voir les décisions. Défaut recommandé plus bas.

### Demandes que le bot traite

| Demande | Réponse au client | Écriture |
|---|---|---|
| Question sur un dossier, le carnet, un vol, un hôtel, un horaire, un inclus, une note | Faits du dossier publié seulement. Lien du séjour ou des transactions. | Aucune. |
| Fait absent | « Je n’ai pas cette information dans votre dossier. » Puis offre de transmettre. | Demande `question` seulement si le client accepte. |
| Modification, annulation, report | « Je regarde, je vous fais un retour rapide. » + la référence reconnue. | Demande + alerte. Le séjour ne change pas. |
| Nouveau voyage ou devis | Questions utiles (qui, où, quand, combien de voyageurs), puis transmission. | Demande `quote`. Pas de dossier créé, pas d’invitation. |
| Hôtel, restaurant, transfert, activité | Pistes à partir du séjour déjà publié et de conseils généraux présentés comme tels. | Une piste qui doit être réservée devient une demande. Pas de prix, pas de disponibilité. |
| Document, formalité | État déjà déposé. Le lien pour déposer dans l’espace. | Aucune formalité lancée. |
| Photo ou PDF envoyé | Accusé. Fichier au coffre, type `other`, en attente de relecture. | Pas d’OCR automatique, pas d’écrasement d’un passeport. PAN refusé. |
| Encours, paiement | Solde publié, signe brut, lien Transactions. | Un « j’ai viré » ou « envoyez-moi un lien » est une demande `payment`. Pas de crédit, pas de lien inventé. |
| Urgence en voyage | Réponse immédiate avec les faits du dossier (vol, hôtel, transfert déjà confirmés) et transmission marquée urgente. | Alerte staff tout de suite. |
| Infos générales (prise, quartier, tenue) | Conseil, jamais un fait du dossier. | Aucune. |
| Stop | Les messages proactifs s’arrêtent. La conversation reste ouverte. | `whatsapp_opt_out_at`. |

### Outils

Le modèle n’a pas le client service en main. Il appelle des fonctions qui relisent le dossier déjà filtré, le même que `buildConciergeDossier`.

Lecture, pour la fiche reconnue seulement :

- séjour publié, étapes, horaires, inclus, notes client, pièces (libellés), formalités, encours, mouvements.

Préparation, pour l’agence seulement :

- `ouvrir_demande` : écrit `crm_whatsapp_requests`, envoie l’alerte, ne touche pas au séjour.
- `deposer_fichier` : coffre, type `other`, file de relecture. Le scan MRZ reste le geste humain déjà en place (admin Enregistrer, client Confirmer).

Hors du MVP : catalogue Little Emperors et desk hôtel restent des outils admin. Les brancher au bot donnerait des contacts d’hôtel au client, ce que le produit interdit, ou des prix qui n’existent pas.

### Alerte et approbation

Chaque demande :

- une ligne `crm_whatsapp_requests` (type, séjour s’il est reconnu, extrait du message, heure) ;
- un e-mail à `CONTACT_TO_EMAIL`, sur le modèle de `notifyServiceRequest` : référence, type, phrase du client, lien fiche et lien dossier ;
- la pastille déjà affichée sur la fiche et le dossier.

Le clic qui modifierait le séjour, annulerait, ou créerait un dossier n’est pas dans le MVP. L’agence traite la demande avec les écrans qu’elle a déjà. Un bouton « J’ai répondu » pourra clôturer la pastille. L’approbation en un clic qui écrit le séjour est une phase suivante, avec les gardes déjà en place (séjour caché qui ne débite pas, virement qui attend Valider).

### Prise de main

Drapeau sur le fil (`paused_at` / `paused_by`). Le bot se tait dès que :

- un message sort du téléphone de l’agence sur ce fil (webhook de statut ou message sortant vu par Twilio), ou
- un membre du staff envoie une réponse depuis le fil admin.

Le client reçoit alors les messages de l’humain, signés par l’agence si on écrit depuis l’admin. Un bouton « Rendre au Concierge » lève la pause. Sans ce clic, la pause tient jusqu’au lendemain matin, heure de Paris, pour ne pas laisser un fil muet.

### Numéro inconnu

Réponse d’accueil, vouvoiement, signature Le Concierge : l’agence a bien reçu, un conseiller reprend. Le fil est stocké. Une demande `lead` part à l’agence avec le numéro et le texte. Pas de fiche client, pas d’invitation, pas de lien magique.

### Fenêtre 24 h et modèles

Dans les 24 h qui suivent le dernier message du client : texte libre, comme aujourd’hui.

Hors fenêtre, y compris une relance de l’agence après une demande : un modèle Utility à faire approuver par Meta, par langue (fr, en, he). Variables : prénom, référence, une phrase courte. Pas de fait nouveau dans le modèle. Le corps libre n’est pas renvoyé « en espérant que Twilio accepte ».

Le modèle de la capture (séjour dans l’espace) reste le modèle de notification. Il n’est pas le modèle de conversation.

### Garde-fous

- **Cloisonnement.** Chaque outil reçoit l’identifiant de la fiche déjà résolue. Pas de recherche par nom, par e-mail ou par référence seule. Une référence inconnue dans le message ne charge pas un autre client. Deux fiches pour un numéro : aucune donnée.
- **Injection.** Le message client et l’historique restent dans le tour utilisateur, bornés (1 500 caractères par bulle, 16 tours). Le système interdit de suivre une consigne qui demande d’ignorer les règles, de citer un autre client, ou d’inventer un prix. Le contrôle `replyUsesUnknownFact` reste devant l’envoi : heure, montant, téléphone, référence, lien ou PAN absents du dossier → la réponse fixe du routeur part à la place.
- **Prix et disponibilités.** Interdits hors du dossier publié. Un conseil général est annoncé comme un conseil.
- **Débit.** `crm_rate_limit_hit` sur le numéro et sur l’IP Twilio, avant l’appel modèle. Au-delà : accusé court, pas de second appel.
- **Opt-out.** `stop` coupe le proactif. La conversation et le journal restent.
- **RGPD.** Le fil est le journal déjà visible par le staff sur la fiche. Les pièces restent dans le bucket privé, URL courte via `/api/files`. Pas de numéro de pièce, pas de PAN, pas de MRZ dans le prompt du Concierge ni dans les logs. Durée de conservation proposée : le fil suit la fiche ; un prospect sans suite est effacé au bout de 12 mois, au même rythme qu’une purge staff. À confirmer avec le registre de l’agence.
- **Tutoiement.** Un contrôle rejette une réponse qui tutoie en français, et renvoie la phrase du routeur.

---

## 4. Phases

L’ampleur est celle des fichiers touchés, pas un calendrier.

### Phase 0 — le message arrive ici

Réglage Twilio, sans nouveau code métier : l’URL entrante du numéro WhatsApp devient `https://travelba.fr/api/webhooks/twilio/whatsapp`, et le répondeur passeport est débranché du même expéditeur. Vérification : un message test de Benjamin crée une ligne `inbound` et une réponse signée. Tant que ce branchement n’est pas fait, le reste ne sert pas les clients.

### MVP — le métier, sur le code déjà là

Fichiers principaux : `lib/crm/whatsapp-inbound.ts`, `whatsapp-concierge.ts`, `whatsapp-conversation.ts`, la fiche admin, une migration courte.

- Nouveaux types de demande : `quote`, `urgent`, `lead`, en plus de ceux qui existent.
- Alerte e-mail staff à l’insertion d’une demande.
- File « À traiter » sur l’accueil admin, pas seulement au fond d’une fiche.
- Pause du bot et réponse staff depuis le fil.
- Hébreu dans la détection de langue et dans les phrases fixes.
- Limite de débit sur le webhook.
- Numéro d’accompagnateur rattaché au séjour, pas au coffre entier.
- Photo : accusé + coffre `other`, file de relecture, pas d’OCR.
- Prospect : table légère ou demande sans `customer_id`, visible dans la file.
- Tests à côté de `whatsapp-inbound.test.ts` et `whatsapp-conversation.test.ts`, y compris la phrase exacte de `whatsappModifyHref`.
- Le contrôle anti-tutoiement et le refus de fait inconnu restent devant l’envoi.

Pas de nouveau fournisseur. Le modèle reste `openai/gpt-4.1-mini` via l’AI Gateway.

### Ensuite — phase 2, pull request empilée

Livré dans le code, pas encore branché sur Twilio :

- Base de savoir éditable (`/admin/concierge`) : services, ton, conditions, questions, partenaires, formalités. Le Concierge classe les textes (recouvrement + vecteur déterministe, colonne `vector(64)`, fonction `crm_concierge_match`) et passe les faits au modèle. Les exemples importés règlent le ton, ils ne deviennent pas des faits. Benjamin déposera plus tard de vraies conversations.
- Parcours : questions (destination, dates, voyageurs, budget, souhaits), deux ou trois pistes, relance dans les 24 h en texte libre, au-delà par des modèles Utility rédigés et non soumis à Meta, rappel avant départ, arrivée, aide sur place, retour.
- Recherche hôtel / vol / transfert derrière `CONCIERGE_SEARCH` (`off` par défaut, `mock`, `staging`). RateHawk n’est pas dans le dépôt. Amadeus y lit des billets, il ne cherche pas un vol. Little Emperors et Rolzo ne sont pas appelés sans clé de test, et jamais vers la production. Le catalogue ne montre ni prix ni contact.
- Devis d’hébergement : marge d’au moins 12 % du net. La commission attendue compte dans ce minimum. Sur un tarif commissionnable, commission hôtel + 2 % ; le manque pour atteindre 12 % est ajouté au prix client. Le texte chiffré reste dans la file « À approuver ». Le client ne le reçoit qu’après l’accord, et seulement si `CONCIERGE_OUTBOUND=1` (coupé en aperçu, non posé).
- Lien de règlement : montant de l’encours publié, moyens Stripe déjà en place. Aucun PaymentIntent n’est créé ici.
- Console : fil en direct, reprise déjà en place, approbation, revue hebdomadaire, relances stockées en `planned` (aucun envoi).

Pas de nouveau webhook. Pas de soumission Meta. Pas d’envoi.

---

## 5. Configuration

Déjà en production, inchangé par ce plan : `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, la série `TWILIO_CONTENT_*`, `OPENAI_API_KEY` ou l’AI Gateway Vercel, `CONTACT_TO_EMAIL`.

À faire au moment de la phase 0, dans la console Twilio, pas dans git :

- Webhook entrant du sender : `https://travelba.fr/api/webhooks/twilio/whatsapp`, méthode POST.
- Retirer l’autre répondeur (Studio, bot, ou URL tierce) du même numéro.
- Laisser `TWILIO_WHATSAPP_WEBHOOK_URL` vide, ou l’égaler à cette URL, pour que la signature colle.

À soumettre à Meta plus tard, pas pour le MVP tant que l’on répond dans la fenêtre :

- un Utility « Le Concierge vous répond » en fr, en, he ;
- variables prénom et référence seulement.

Le modèle séjour de la capture reste celui des notifications.

---

## 6. Risques

| Risque | Effet | Parade |
|---|---|---|
| Le répondeur passeport reste en place | Le client continue de recevoir le tutoiement, Travelba ne voit rien | Phase 0 avant tout le reste. Un entrant sans ligne en base = le branchement a échoué. |
| Deux bots sur le même numéro | Double réponse, ou le premier consomme la fenêtre | Un seul webhook. |
| Fenêtre 24 h fermée | `failed` silencieux | Le MVP le dit à l’agence dans l’alerte. Le modèle Utility vient ensuite. |
| Téléphone partagé | Mélange de deux clients | Aucune donnée, demande sans fiche. |
| Injection dans le message | Le modèle cite un prix ou un autre dossier | Schéma, contrôle des faits, outils sans recherche libre. |
| Photo de carte bancaire | PAN au coffre | Refus déjà là pour un PDF. L’étendre aux images avant d’enregistrer. |
| Alerte à chaque « bonjour » | Benjamin ne lit plus | L’e-mail part pour les actes, l’urgence, le devis et le prospect. Une question résolue par le dossier ne réveille personne. |
| Hébreu mal détecté | Réponse en français à un client qui écrit en hébreu | Détection par alphabet, et la langue de la fiche en secours. |
| Prospect | Numéro et texte conservés | File staff, purge à 12 mois, pas de fiche tant que l’agence n’invite pas. |

---

## 7. Coût par conversation

Ordres de grandeur, à recouper dans les consoles OpenAI et Twilio. Pas un devis.

Hypothèse : huit allers-retours dans la fenêtre de 24 h, dossier publié de quelques séjours dans le contexte (quelques milliers de jetons en entrée, quelques centaines en sortie).

- **Modèle** `gpt-4.1-mini` : de l’ordre de **0,02 à 0,08 USD** pour cette conversation. Le routeur répond sans appel dès que la demande est un acte métier (modifier, annuler, virement).
- **Twilio / Meta, fenêtre ouverte par le client** : messages de service, en général bien en dessous d’un modèle Utility. Souvent quelques centimes au plus pour huit réponses, parfois inclus dans la conversation ouverte.
- **Hors fenêtre** : un Utility par relance. En France, la grille Meta des modèles utility se compte en centimes par message. Trois relances coûtent plus cher que le modèle.
- **Photo** : le MVP ne lance pas `gpt-4o`. Le jour où la relecture appellera l’OCR déjà en place, ce sera le coût d’un scan de pièce, pas celui de chaque texto.

Une conversation ordinaire, dans la fenêtre, reste sous **0,15 USD** tout compris. Une journée d’urgence avec trois relances hors fenêtre et une photo relue se rapproche de **0,30 à 0,60 USD**, surtout à cause des modèles Meta.

---

## 8. Décisions pour Benjamin

Cinq choix. Le défaut recommandé est celui qui débloque le métier sans écrire dans les réservations.

1. **Débrancher le répondeur passeport et pointer le webhook Twilio sur Travelba.**
   Défaut : oui, en premier. Sans cela le Concierge du dépôt ne parle à personne.

2. **Modèle du MVP : `openai/gpt-4.1-mini` via l’AI Gateway, routeur de mots-clés devant lui.**
   Défaut : celui-ci. Il est déjà branché, il tient dans le délai de 8 secondes, et un acte métier ne l’appelle pas. Un modèle plus fort attendra les outils de la phase suivante.

3. **Rien de ce qui engage n’est exécuté par le bot.** Modification, annulation, paiement, nouveau dossier : demande, e-mail, pastille. L’agence agit dans les écrans actuels.
   Défaut : oui. Le bouton qui écrirait le séjour vient après, quand la file aura tourné.

4. **Un numéro inconnu devient un prospect, pas un client.** Accueil signé, fil en base, alerte. Pas de fiche, pas d’invitation, pas de lien.
   Défaut : oui. L’agence invite ensuite, comme aujourd’hui, si elle retient la demande.

5. **Pas de prix ni de disponibilité hors dossier au MVP.** Les pistes sont des conseils ou des faits déjà publiés. Le catalogue Little Emperors et toute recherche fournisseur restent pour plus tard, et ne montrent jamais un contact d’hôtel au client.
   Défaut : oui. Le bot dit qu’il transmet dès qu’il faudrait réserver ou chiffrer.
