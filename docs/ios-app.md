# Application iOS TBA

L’application est une enveloppe native du portail client (`/connexion`, `/mon-compte`). Elle charge `https://travelba.fr` : les cookies de session restent ceux du site. `/admin` n’y est pas servi. Rien n’est déployé en production par ce document : la migration et les variables se posent à la main, avant le premier envoi.

Les visuels sont dans `mobile/store-assets/` (icône, splash, captures). Ils viennent de la marque du dépôt et de l’aperçu fictif `/exemple` (Camille Morel). Aucun client réel.

## Fiche App Store

À coller dans App Store Connect. Les longueurs sont celles d’Apple.

| Champ | Texte | Longueur |
| --- | --- | --- |
| Nom | TBA : Travel Business Agency | 28 / 30 |
| Sous-titre | Votre carnet de voyage | 22 / 30 |
| Texte promotionnel | Le carnet, les vols et les documents de vos séjours. Une notification quand l’horaire change ou quand une pièce est prête. | 122 / 170 |
| Mots-clés | `voyage,carnet,séjour,vol,hôtel,billet,document,passeport,agence,règlement,eta,esta,transfert` | 92 / 100 |
| URL d’assistance | `https://travelba.fr` | |
| URL marketing | `https://travelba.fr` | |
| Nom sous l’icône | TBA | |

Catégorie principale : Voyages. Secondaire : aucune. Âge : 4+. Pas d’achat intégré. L’accès est ouvert par l’agence.

### Description

TBA est l’espace client de Travel Business Agency.

Retrouvez le carnet du séjour que l’agence a publié : les villes, les vols, l’hôtel, les transferts et les pièces du dossier. Les horaires sont ceux du voyage, pas une estimation.

L’application prévient quand un vol change, quand une carte d’embarquement est prête, ou quand un règlement est reçu. Chaque envoi se coupe dans Mon compte.

Photographiez un passeport depuis l’appareil. Partagez une pièce avec la feuille de partage du téléphone. Au retour dans l’application, Face ID la déverrouille.

L’agence invite. Il n’y a pas d’inscription ouverte, et le back-office n’est pas dans l’application.

### Étiquette de confidentialité

Réponses pour App Store Connect. Rien n’est utilisé pour le suivi publicitaire. Les données sont liées au compte, pour le fonctionnement de l’espace.

| Donnée | Collectée | Liée à l’identité | Suivi |
| --- | --- | --- | --- |
| Nom | Oui | Oui | Non |
| Adresse e-mail | Oui | Oui | Non |
| Numéro de téléphone | Oui | Oui | Non |
| Photos ou vidéos (pièce photographiée) | Oui | Oui | Non |
| Autres infos financières (règlements affichés) | Oui | Oui | Non |
| Identifiant de l’appareil (jeton de notification) | Oui | Oui | Non |

Face ID reste sur l’appareil : le système répond seulement oui ou non. Le numéro de carte bancaire n’est pas stocké par TBA (le paiement carte passe par Stripe, dans le site). Le jeton de notification n’est pas revendu.

### Note pour l’équipe de revue

L’application ouvre l’espace client sur `https://travelba.fr/connexion`, puis `/mon-compte`. Ce n’est pas une coque vide : notifications Apple, Face ID au retour, appareil photo pour une pièce, feuille de partage, écran hors ligne, écran de lancement.

Le back-office `/admin` est refusé : la requête est renvoyée vers la connexion, et le délégué de navigation annule la page.

Compte de démonstration (à remplacer avant l’envoi) :

- E-mail : `REMPLACER@exemple.invalid`
- Mot de passe : `REMPLACER`

L’agence crée ce compte et publie un séjour d’exemple visible. Ne pas utiliser un client réel.

## Ce que Benjamin fait, dans l’ordre

1. **Programme Apple Developer** (99 USD / an) au nom de Travel Business Agency. Noter l’identifiant d’équipe, dix caractères (`APPLE_TEAM_ID`).

2. **Identifiant d’app** `fr.travelba.client`. Activer la capacité Push Notifications. Ajouter les domaines associés `applinks:travelba.fr` si les liens d’invitation doivent ouvrir l’application plutôt que Safari.

3. **App Store Connect** : nouvelle app iOS, bundle `fr.travelba.client`, nom « TBA : Travel Business Agency ». SKU libre, par exemple `tba-ios`. Coller la fiche ci-dessus. Déposer l’icône `mobile/store-assets/icon-1024.png` (1024, sans transparence). Déposer les captures `mobile/store-assets/screenshots/iphone-6.9/` et `iphone-6.5/` (six écrans, dans l’ordre des noms).

4. **Clé APNs** (Certificates, Identifiers & Profiles → Keys). Une clé .p8, avec Apple Push Notifications service. Noter l’identifiant de clé (`APNS_KEY_ID`) et l’équipe (`APNS_TEAM_ID`). Le fichier .p8 ne se télécharge qu’une fois.

5. **Clé API App Store Connect** (Users and Access → Integrations → App Store Connect API). Accès Developer ou App Manager. Noter l’issuer id et le key id. Le .p8 de cette clé est distinct de la clé APNs.

6. **Migration** `supabase/migrations/20261121160000_ios_client_push.sql`, dans le SQL Editor du projet `fsmfozxgujskluxakeoq`. Elle est additive : les tables `crm_espace_devices`, `crm_notification_preferences` et `crm_notifications` existent déjà, vides ; le script ajoute `push_travel`, `push_documents` et `push_payment`. Ne pas la rejouer comme un reset. Tant qu’elle n’est pas appliquée, l’envoi ne part pas et le site continue.

7. **Variables Vercel** (Production seulement, puis redéployer) :

   - `APNS_KEY_ID`
   - `APNS_TEAM_ID`
   - `APNS_KEY_P8` (contenu du .p8, retours à la ligne en `\n`, ou le PEM en base64)
   - `APNS_BUNDLE_ID` = `fr.travelba.client`
   - `APNS_PRODUCTION` = `1` (TestFlight et App Store). `0` seulement pour un jeton du bac à sable.
   - `APPLE_TEAM_ID` (dix caractères) pour le fichier `/.well-known/apple-app-site-association`. Sans elle, ce fichier répond 404 et les liens universels ne s’associent pas.

   Sans ces variables, aucun envoi APNs. Une preview Vercel ne les utilise pas.

8. **Codemagic** : connecter le dépôt, groupe de variables `travelba_ios` (voir `codemagic.yaml`). Y mettre la clé API App Store Connect, pas la clé APNs. Lancer le workflow « TBA iOS TestFlight » à la main, ou pousser un tag `ios-1`. Le build signe, archive, et envoie à TestFlight. Pas de Mac requis.

9. **TestFlight** : installer sur un iPhone, se connecter avec le compte de démonstration, accepter les notifications. Vérifier qu’un vol ou un règlement de test arrive, et que `/admin` ne s’ouvre pas.

10. **Revue** : coller la note ci-dessus avec le vrai compte de démonstration. Répondre aux questions de chiffrement : non exempté, seulement HTTPS (la clé `ITSAppUsesNonExemptEncryption` est déjà fausse dans l’app).

## Où est le code

| Pièce | Chemin |
| --- | --- |
| Projet Xcode, SPM | `mobile/ios/` |
| Configuration | `mobile/capacitor.config.ts` (`server.url` = `https://travelba.fr/mon-compte`) |
| Écran hors ligne | `mobile/www/offline.html` |
| Icône, splash, captures | `mobile/store-assets/` |
| Enregistrement du jeton | `POST` et `DELETE /api/client/devices` |
| Préférences | `GET` et `PATCH /api/client/notifications` |
| Envoi | `lib/crm/push-notices.ts` (vol, carte d’embarquement, règlement reçu) |
| Pont dans le site | `components/native/NativeApp.tsx` (inactif dans Safari) |

Un changement d’écran du portail part avec le site. Un changement d’icône, de permission ou de plugin demande un nouveau build TestFlight.

## Ce qui ne part pas tout seul

- Pas de notification si `APNS_*` manque, si la préférence est décochée, ou s’il n’y a pas d’appareil.
- Pas de notification sur une preview Vercel.
- Le site dans Safari ne demande pas la permission de notification.
- Déposer une pièce ou montrer un séjour n’envoie pas la notification à la place du geste déjà prévu (WhatsApp, e-mail). La notification s’ajoute, elle ne le remplace pas.
- Créditer un client, imprimer une pièce, ou ouvrir `/admin` ne se fait pas depuis l’application.
