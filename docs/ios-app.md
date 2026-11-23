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
| URL d’assistance | `https://travelba.fr/fr/support` | |
| URL de confidentialité | `https://travelba.fr/fr/confidentialite` | |
| URL marketing | `https://travelba.fr` | |
| Nom sous l’icône | TBA | |

Catégorie principale : Voyages. Secondaire : aucune. Âge : 4+. Pas d’achat intégré. L’accès est ouvert par l’agence.

### Description

TBA est l’espace client de Travel Business Agency.

Retrouvez le carnet du séjour que l’agence a publié : les villes, les vols, l’hôtel, les transferts et les pièces du dossier. Les horaires sont ceux du voyage, pas une estimation.

L’application prévient quand un vol change, quand une carte d’embarquement est prête, ou quand un règlement est reçu. Chaque envoi se coupe dans Mon compte.

Sur l’iPhone, le prochain séjour, le vol et la météo de la destination peuvent rester sur l’écran d’accueil. Le jour du vol, l’heure, la porte et le statut s’affichent sur l’écran verrouillé.

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

Face ID reste sur l’appareil : le système répond seulement oui ou non. Le numéro de carte bancaire n’est pas stocké par TBA (le paiement carte passe par Stripe, dans le site). Le jeton de notification et le jeton d’activité en direct sont des identifiants d’appareil, liés au compte, sans suivi. Ils ne sont pas revendus.

### Note pour l’équipe de revue

À coller dans App Review Information.

L’application montre d’abord l’écran local (séjour déjà connu sur l’appareil), puis ouvre l’espace sur `https://travelba.fr`. Les cookies de session restent ceux du site. Il n’y a pas d’inscription ouverte : l’agence crée le compte et envoie l’invitation. Le back-office `/admin` est refusé (redirection vers la connexion, et le délégué de navigation annule la page).

Fonctions natives : notifications Apple, widgets d’écran d’accueil (prochain séjour, prochain vol, météo de la destination), activité en direct le jour du vol (écran verrouillé et Dynamic Island : numéro, trajet, heure, porte, terminal, statut), Face ID au retour (résultat gardé sur l’appareil), appareil photo pour une pièce, feuille de partage, écran hors ligne, écran de lancement. Les widgets lisent un résumé déjà chargé par l’application. L’activité en direct ne démarre que le jour du vol, dans l’application, ou par une notification Apple si l’iPhone le permet. Un iPhone plus ancien garde la notification classique.

Suppression du compte : Mon compte › Supprimer mon compte. La demande est enregistrée et envoyée à l’agence. Le client est déconnecté. Le traitement est fait sous 30 jours. Les séjours ne sont pas effacés sur-le-champ. Politique : `https://travelba.fr/fr/confidentialite`. Assistance : `https://travelba.fr/fr/support`.

Compte de démonstration (à remplacer avant l’envoi) :

- E-mail : `REMPLACER@exemple.invalid`
- Mot de passe : `REMPLACER`

L’agence crée ce compte et publie un séjour d’exemple visible. Ne pas utiliser un client réel.

## Ce que Benjamin fait, dans l’ordre

1. **Programme Apple Developer** (99 USD / an) au nom de Travel Business Agency. Noter l’identifiant d’équipe, dix caractères (`APPLE_TEAM_ID`).

2. **Identifiant d’app** `fr.travelba.client`. Activer **Push Notifications**, **Associated Domains** et **App Groups**. Le fichier d’entitlements porte déjà `aps-environment`, `applinks:travelba.fr` et le groupe `group.fr.travelba.client`. Sans Associated Domains ou sans le groupe, la signature du build échoue. Les liens d’invitation n’ouvrent l’application que si `APPLE_TEAM_ID` est aussi posé. L’extension et le groupe se préparent avant le premier build, voir ci-dessous.

3. **App Store Connect** : nouvelle app iOS, bundle `fr.travelba.client`, nom « TBA : Travel Business Agency ». SKU libre, par exemple `tba-ios`. Coller la fiche ci-dessus. Déposer l’icône `mobile/store-assets/icon-1024.png` (1024, sans transparence). Déposer les captures `mobile/store-assets/screenshots/iphone-6.9/` et `iphone-6.5/` (six écrans, dans l’ordre des noms).

4. **Clé APNs** (Certificates, Identifiers & Profiles → Keys). Une clé .p8, avec Apple Push Notifications service. Noter l’identifiant de clé (`APNS_KEY_ID`) et l’équipe (`APNS_TEAM_ID`). Le fichier .p8 ne se télécharge qu’une fois.

5. **Clé API App Store Connect** (Users and Access → Integrations → App Store Connect API). Accès Developer ou App Manager. Noter l’issuer id et le key id. Le .p8 de cette clé est distinct de la clé APNs.

6. **Migrations**, dans le SQL Editor du projet `fsmfozxgujskluxakeoq`. Les deux sont additives. Ne pas les rejouer comme un reset. Tant qu’elles ne sont pas appliquées, l’envoi ne part pas et le site continue.

   - `supabase/migrations/20261121160000_ios_client_push.sql` : les tables `crm_espace_devices`, `crm_notification_preferences` et `crm_notifications` existent déjà, vides ; le script ajoute `push_travel`, `push_documents` et `push_payment`.
   - `supabase/migrations/20261123120000_ios_live_activities.sql` : colonne `live_start_token` sur l’appareil, table `crm_live_activities` pour le jeton de chaque activité en direct. Sans elle, les widgets et les notifications classiques continuent ; l’activité en direct ne se pousse pas.

7. **Variables Vercel** (Production seulement, puis redéployer) :

   - `APNS_KEY_ID`
   - `APNS_TEAM_ID`
   - `APNS_KEY_P8` (contenu du .p8, retours à la ligne en `\n`, ou le PEM en base64)
   - `APNS_BUNDLE_ID` = `fr.travelba.client`
   - `APNS_PRODUCTION` = `1` (TestFlight et App Store). `0` seulement pour un jeton du bac à sable.
   - `APPLE_TEAM_ID` (dix caractères) pour le fichier `/.well-known/apple-app-site-association`. Sans elle, ce fichier répond 404 et les liens universels ne s’associent pas.

   Sans ces variables, aucun envoi APNs. Une preview Vercel ne les utilise pas.

8. **Codemagic** : connecter le dépôt, groupe de variables `travelba_ios` (voir `codemagic.yaml`). Y mettre la clé API App Store Connect, pas la clé APNs. Lancer le workflow « TBA iOS TestFlight » à la main, ou pousser un tag `ios-1`. Le build signe, archive, et envoie à TestFlight. Pas de Mac requis. Le même envoi part de GitHub Actions (section « Build via GitHub Actions »).

9. **TestFlight** : installer sur un iPhone, se connecter avec le compte de démonstration, accepter les notifications. Vérifier qu’un vol ou un règlement de test arrive, et que `/admin` ne s’ouvre pas.

10. **Revue** : coller la note ci-dessus avec le vrai compte de démonstration. Répondre aux questions de chiffrement : non exempté, seulement HTTPS (la clé `ITSAppUsesNonExemptEncryption` est déjà fausse dans l’app).

## Widgets et activité en direct

Une seule extension, `fr.travelba.client.Widgets`, porte les widgets et l’activité en direct. Codemagic ne signe ainsi qu’un identifiant de plus, avec le même certificat que l’application. Une seconde cible n’apporterait rien : ActivityKit se dessine dans l’extension WidgetKit.

L’application reste en iOS 15. L’extension demande iOS 16.2 (widgets d’écran verrouillé et activité en direct). Sur iOS 15, 16.0 et 16.1, l’application s’ouvre sans ces écrans et la notification classique reste. Le démarrage local de l’activité demande iOS 16.2. Le démarrage par Apple (push-to-start) demande iOS 17.2. En dessous, rien n’est envoyé sur ce canal.

Le résumé `GET /api/client/widgets` est celui du prochain séjour visible : titre, compte à rebours, vol (numéro, heure, porte, terminal, statut), météo. Pas de prix, pas de pièce. L’application l’écrit dans le groupe `group.fr.travelba.client` à chaque retour au premier plan et après une notification, puis demande à iOS de recharger les widgets. L’activité locale s’ouvre quand le vol est à moins de huit heures, et se ferme après l’arrivée ou l’annulation.

### Avant le premier build signé

Dans Certificates, Identifiers & Profiles, dans cet ordre. `--create` de Codemagic peut créer l’identifiant, pas le groupe ni la capacité.

1. **App Group** `group.fr.travelba.client`.
2. Identifiant `fr.travelba.client` : Push Notifications, Associated Domains, App Groups, cocher ce groupe. L’activité en direct n’a pas de capacité à part : `NSSupportsLiveActivities` est déjà dans l’app.
3. Identifiant `fr.travelba.client.Widgets` : App Groups, le même groupe. Pas de push sur l’extension. Le sujet APNs de l’activité est `fr.travelba.client.push-type.liveactivity`, sur la clé déjà posée pour l’app. Aucune variable nouvelle.
4. Ensuite seulement, le workflow GitHub Actions **iOS TestFlight** (ou Codemagic). Il récupère un profil pour les deux identifiants déjà écrits dans le projet.

Sans le groupe sur les deux identifiants, la signature échoue : le profil ne couvre pas l’entitlement.

Ce que l’API du workflow ne fait pas, et qui se pose dans le portail developer.apple.com (Identifiers) :

- Créer l’App Group `group.fr.travelba.client`. L’API App Store Connect utilisée par `fetch-signing-files` n’a pas cette ressource.
- Cocher **App Groups** sur `fr.travelba.client` et sur `fr.travelba.client.Widgets`, et y attacher ce groupe. Un identifiant déjà créé n’est pas mis à jour par `--create`.
- **Push Notifications** et **Associated Domains** sur `fr.travelba.client`, s’ils n’y sont pas déjà (le premier TestFlight les demandait). L’extension n’a pas le push. L’activité en direct n’ajoute pas de capacité.

Le workflow, lui, crée l’identifiant `fr.travelba.client.Widgets` s’il manque, récupère un profil App Store pour chaque identifiant, et réutilise le certificat de `CERTIFICATE_PRIVATE_KEY`.

## Où est le code

| Pièce | Chemin |
| --- | --- |
| Projet Xcode, SPM | `mobile/ios/` |
| Configuration | `mobile/capacitor.config.ts` (écran local, puis `https://travelba.fr`) |
| Écran hors ligne | `mobile/www/offline.html` |
| Icône, splash, captures | `mobile/store-assets/` |
| Enregistrement du jeton | `POST` et `DELETE /api/client/devices` |
| Widgets | `GET /api/client/widgets`, extension `mobile/ios/App/Widgets` |
| Activité en direct | `POST` et `DELETE /api/client/live-activity`, `lib/crm/live-activity-run.ts` |
| Préférences | `GET` et `PATCH /api/client/notifications` |
| Envoi | `lib/crm/push-notices.ts` (vol, carte d’embarquement, règlement reçu) |
| Pont dans le site | `components/native/NativeApp.tsx` (inactif dans Safari) |

Un changement d’écran du portail part avec le site. Un changement d’icône, de permission ou de plugin demande un nouveau build TestFlight.

## Build via GitHub Actions

Même envoi que Codemagic, depuis GitHub. `codemagic.yaml` reste en place.

Workflow : `.github/workflows/ios-testflight.yml`. Runner `macos-latest` (macOS 26, Xcode 26, exigé par Capacitor 8). Un seul run à la fois (groupe `ios-testflight`).

Lancer :

- Actions → **iOS TestFlight** → Run workflow, sur la branche voulue
- ou pousser un tag `ios-*` (`git tag ios-1 && git push origin ios-1`)

Le numéro de build du projet est `2`, la version marketing `1.2`. À l’archive, le workflow remplace le numéro de build par `github.run_number`.

Secrets du dépôt (Settings → Secrets and variables → Actions) :

| Secret | Contenu |
| --- | --- |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | Identifiant de la clé API App Store Connect |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer id de cette clé |
| `APP_STORE_CONNECT_PRIVATE_KEY` | PEM .p8 brut, retours à la ligne conservés |
| `APPLE_TEAM_ID` | `X9FYJNAYD8` |
| `CERTIFICATE_PRIVATE_KEY` | PEM RSA 2048, sans mot de passe |

Signature. `codemagic-cli-tools` exécute `app-store-connect fetch-signing-files --type IOS_APP_STORE --create` avec `CERTIFICATE_PRIVATE_KEY`. Le premier run crée le certificat de distribution ; les suivants réutilisent le même, tant que cette clé ne change pas. Un profil App Store est récupéré ou créé pour chaque `PRODUCT_BUNDLE_IDENTIFIER` littéral de `mobile/ios` (`--strict-match-identifier`). Les deux sont exigés : `fr.travelba.client` et `fr.travelba.client.Widgets`. L’archive du scheme `App` embarque l’extension. L’archive est en Release. L’IPA est exportée pour App Store Connect (`method` `app-store-connect`, le nom actuel sous Xcode 26 de la méthode `app-store`) et envoyée à l’app `6838238661` par `app-store-connect publish` (`xcrun altool --upload-app`). Le workflow s’arrête à l’envoi. Le traitement du build se termine dans App Store Connect.

La clé API doit pouvoir créer un certificat et des profils. Apple limite le nombre de certificats de distribution : si la création est refusée, révoquer un certificat inutilisé dans le portail, et garder la même `CERTIFICATE_PRIVATE_KEY`. Le cache SPM reste sur le runner. Le journal de debug de l’action reste éteint.

## Ce qui ne part pas tout seul

- Pas de notification si `APNS_*` manque, si la préférence est décochée, ou s’il n’y a pas d’appareil.
- Pas d’activité en direct si `APNS_*` manque, si la migration n’est pas jouée, ou s’il n’y a pas de jeton. Le suivi de vol et la notification classique continuent.
- Pas de notification sur une preview Vercel.
- Le site dans Safari ne demande pas la permission de notification.
- Déposer une pièce ou montrer un séjour n’envoie pas la notification à la place du geste déjà prévu (WhatsApp, e-mail). La notification s’ajoute, elle ne le remplace pas.
- Créditer un client, imprimer une pièce, ou ouvrir `/admin` ne se fait pas depuis l’application.
