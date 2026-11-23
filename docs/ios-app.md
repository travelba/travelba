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

L’application prévient quand un vol change, quand une carte d’embarquement est prête, quand un règlement est reçu, ou quand l’agence répond dans Messages. Chaque envoi se coupe dans Mon compte.

Ajoutez un vol ou tout le séjour au calendrier de l’iPhone. L’application écrit ces étapes, elle ne lit pas les autres événements.

Les messages avec l’agence sont dans l’application. Une photo part depuis l’appareil. Ce n’est pas WhatsApp.

Quand le certificat est en place, l’hôtel, le transfert et le vol sans carte de la compagnie proposent Ajouter à Apple Wallet.

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
| Photos ou vidéos (pièce photographiée, photo envoyée à l’agence) | Oui | Oui | Non |
| Autres contenus utilisateur (messages à l’agence) | Oui | Oui | Non |
| Autres infos financières (règlements affichés) | Oui | Oui | Non |
| Identifiant de l’appareil (jeton de notification) | Oui | Oui | Non |

Face ID reste sur l’appareil : le système répond seulement oui ou non. Le numéro de carte bancaire n’est pas stocké par TBA (le paiement carte passe par Stripe, dans le site). Le jeton de notification et le jeton d’activité en direct sont des identifiants d’appareil, liés au compte, sans suivi. Ils ne sont pas revendus.

Le calendrier de l’iPhone n’est pas lu et n’est pas une donnée collectée. L’application demande seulement d’y écrire les vols et les étapes du séjour. Rien n’est envoyé.

### Note pour l’équipe de revue

À coller dans App Review Information.

L’application montre d’abord l’écran local (séjour déjà connu sur l’appareil), puis ouvre l’espace sur `https://travelba.fr`. Les cookies de session restent ceux du site. Il n’y a pas d’inscription ouverte : l’agence crée le compte et envoie l’invitation. Le back-office `/admin` est refusé (redirection vers la connexion, et le délégué de navigation annule la page).

Fonctions natives : notifications Apple, widgets d’écran d’accueil (prochain séjour, prochain vol, météo de la destination), activité en direct le jour du vol (écran verrouillé et Dynamic Island : numéro, trajet, heure, porte, terminal, statut), Face ID au retour (résultat gardé sur l’appareil), appareil photo pour une pièce ou un message, feuille de partage, calendrier (écriture seule à partir d’iOS 17 : les étapes du séjour, sans lire les autres événements), écran hors ligne, écran de lancement. Les widgets lisent un résumé déjà chargé par l’application. L’activité en direct ne démarre que le jour du vol, dans l’application, ou par une notification Apple si l’iPhone le permet. Un iPhone plus ancien garde la notification classique.

Messages : Mon compte, icône en haut, et « Écrire à l’agence » sur un séjour. Le fil est dans l’application. Il ne passe pas par WhatsApp. L’agence répond dans Boîte de réception › Messages.

Apple Wallet : le bouton n’apparaît que si le certificat Pass Type ID est posé (voir plus bas). Sans lui, l’écran n’a pas le bouton. Une carte déjà signée par la compagnie reste celle de la compagnie. Les passes TBA (hôtel, transfert, vol de repli) ne se mettent pas à jour tout seuls : la mise à jour par le service PassKit est l’étape suivante.

Suppression du compte : Mon compte › Supprimer mon compte. Le dialogue explique ce qui est effacé tout de suite (connexion, profil, passeport, Face ID, appareils) et ce que l’agence garde (dossiers, factures, règlements : comptabilité dix ans, contrat de voyage). Le bouton est « Supprimer définitivement mon compte ». Le compte est effacé immédiatement, puis l’écran « Votre compte a été supprimé » s’affiche. Politique : `https://travelba.fr/fr/confidentialite`. Assistance : `https://travelba.fr/fr/support`.

Compte de démonstration :

- E-mail : `appreview@travelba.fr` (`is_test`)
- Mot de passe : celui posé pour la revue, hors dépôt

L’agence publie un séjour d’exemple visible sur cette fiche. Ne pas utiliser un client réel. Si la revue supprime le compte, la fiche anonymisée reste pour les dossiers. Recréer l’accès avec `APPREVIEW_PASSWORD='…' APPREVIEW_CONFIRM=1 npx tsx scripts/recreate-appreview-account.ts` (12 caractères minimum, le mot de passe n’est pas affiché). Le script refuse une adresse d’agence.

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

11. **Pass Type ID** (après le compte développeur). Un seul identifiant : `pass.fr.travelba.client`. Hôtel, transfert et vol de repli partagent ce certificat. Trois identifiants (`pass.fr.travelba.client.hotel`, `.transfer`, `.boarding`) demanderaient trois certificats : ce n’est pas le choix retenu.

    Créer le certificat sans Mac, avec OpenSSL :

    ```bash
    openssl req -new -newkey rsa:2048 -nodes \
      -keyout pass.key -out pass.csr \
      -subj "/CN=pass.fr.travelba.client/O=Travel Business Agency/C=FR"
    ```

    Dans Certificates, Identifiers & Profiles : Identifiers → Pass Type IDs → enregistrer `pass.fr.travelba.client`, puis créer le certificat à partir de `pass.csr`. Télécharger `pass.cer`.

    Intermédiaire public Apple (déjà dans `lib/crm/wallet/`, G4 et G6) :

    ```bash
    curl -fsSL -o AppleWWDRCAG4.cer https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
    openssl x509 -inform DER -in AppleWWDRCAG4.cer -out AppleWWDRCAG4.pem
    openssl x509 -inform DER -in pass.cer -out pass.pem
    openssl pkcs12 -export -inkey pass.key -in pass.pem -certfile AppleWWDRCAG4.pem \
      -out pass.p12 -passout pass:CHOISIR
    base64 -i pass.p12 | tr -d '\n'
    ```

    Le `.key` et le `.p12` ne vont pas dans git.

12. **Variables Wallet** (Production seulement, puis redéployer). Sans elles, le bouton n’existe pas.

    - `WALLET_PASS_CERT_P12` — le base64 du `.p12`
    - `WALLET_PASS_CERT_PASSWORD` — le mot de passe choisi ci-dessus
    - `WALLET_PASS_TYPE_ID` = `pass.fr.travelba.client`
    - `WALLET_TEAM_ID` — les dix caractères de l’équipe (le même que `APPLE_TEAM_ID`)
    - `WALLET_WWDR_CERT_PEM` — facultatif. Vide : les certificats publics G4 et G6 du dépôt.

    Migration messages : `supabase/migrations/20261123180000_app_messages.sql`, dans le SQL Editor. Elle ajoute `crm_app_threads`, `crm_app_messages` et `push_messages`. Additive. Tant qu’elle n’est pas jouée, Messages dit que la messagerie n’est pas ouverte, et le site continue.

## Mise à jour des passes

Le service web PassKit (enregistrement de l’appareil, push quand la porte ou l’heure change) n’est pas dans cette version. Il demande une table d’appareils par numéro de série, des routes `webServiceURL`, et un envoi APNs sur le sujet du type de passe, distinct des notifications de l’application. Le bouton ajoute la carte telle qu’elle est au moment du téléchargement. L’étape suivante branche ce service quand le certificat existe.

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
| Envoi | `lib/crm/push-notices.ts` (vol, carte d’embarquement, règlement reçu, message de l’agence) |
| Cartes Wallet TBA | `lib/crm/wallet-pass.ts`, `GET /api/client/bookings/[id]/passe/[itemId]` |
| Messages | `/mon-compte/messages`, Boîte de réception › Messages |
| Pont dans le site | `components/native/NativeApp.tsx` (inactif dans Safari) |
| Calendrier | `mobile/ios/App/App/CalendarBridge.swift`, `components/account/AddToPhoneCalendar.tsx` |

Un changement d’écran du portail part avec le site. Un changement d’icône, de permission ou de plugin demande un nouveau build TestFlight.

## Build via GitHub Actions

Même envoi que Codemagic, depuis GitHub. `codemagic.yaml` reste en place.

Workflow : `.github/workflows/ios-testflight.yml`. Runner `macos-latest` (macOS 26, Xcode 26, exigé par Capacitor 8). Un seul run à la fois (groupe `ios-testflight`).

Lancer :

- Actions → **iOS TestFlight** → Run workflow, sur la branche voulue
- ou pousser un tag `ios-*` (`git tag ios-1 && git push origin ios-1`)

Le numéro de build du projet est `2`, la version marketing `1.5`. À l’archive, le workflow remplace le numéro de build par `github.run_number`.

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
- Pas de bouton Apple Wallet si `WALLET_PASS_*` manque. Une preview Vercel ne signe pas.
- Pas de mise à jour automatique d’une carte déjà ajoutée (service PassKit : étape suivante).
- Pas de notification sur une preview Vercel.
- Le site dans Safari ne demande pas la permission de notification.
- Pas d’écriture dans le calendrier si la personne refuse l’accès. Le bouton reste sur la page et propose les réglages. Safari, l’écran d’accueil et Android ne demandent pas cette permission.
- Déposer une pièce ou montrer un séjour n’envoie pas la notification à la place du geste déjà prévu (WhatsApp, e-mail). La notification s’ajoute, elle ne le remplace pas.
- Créditer un client, imprimer une pièce, ou ouvrir `/admin` ne se fait pas depuis l’application.

## Version 1.3

Quatre ajouts dans l’application. Le site dans Safari ne demande ni Face ID, ni le cache des pièces. La migration se joue à la main, elle n’est pas appliquée par ce dépôt.

Au premier lancement, l’écran local demande tout de suite la permission iOS (alerte, son, pastille). Pas d’écran préalable. iOS ne la montre qu’une fois. Si la personne accepte, toutes les catégories sont ouvertes, et le jeton est enregistré dès la connexion (il est gardé sur l’appareil si la demande a lieu avant). Si elle refuse, un bandeau discret propose plus tard d’ouvrir les réglages de l’iPhone.

### Face ID / Touch ID

Après la première entrée, l’application propose le déverrouillage. Le jeton (préfixe `tu_`, empreinte seule en base) va dans le trousseau, protégé par la biométrie. À la réouverture, Face ID ou Touch ID rouvre la session. « Utiliser le mot de passe » revient au formulaire. La case est dans Mon compte. La déconnexion efface le trousseau et révoque les jetons. Le repli mot de passe garde le trousseau pour la fois suivante.

Migration : `supabase/migrations/20261123150000_ios_client_12.sql` (table `crm_device_unlocks`).

### Pièces hors ligne

Les billets, bons d’hôtel, assurances et autres pièces des séjours en cours ou à venir sont téléchargés, chiffrés (AES-GCM, clé dans le trousseau, sans biométrie à chaque ouverture) et rangés dans le bac de l’application, par personne. L’écran dit « Disponible hors ligne ». Passeport, visa et ETA ne sont pas gardés, et un numéro de passeport est retiré du libellé. La déconnexion vide le bac. Un autre compte sur le même téléphone ne relit pas le dossier précédent.

### Rappels de voyage

Cron `GET /api/cron/travel-notices`, toutes les heures à la minute 8. Même envoi APNs que les autres notifications, et la ligne reste dans l’accueil (« Pour votre voyage ») même sans appareil.

- Enregistrement, entre 20 h et 28 h avant le départ.
- Retard et changement de porte, lus dans `crm_booking_items.details.flight_watch` (AeroAPI). Le retard reprend la clé déjà utilisée par le suivi de vol.
- Départ la veille, avec l’heure du transfert seulement si elle est déjà sur la carte.
- Reste à payer, dans les 14 jours avant le départ.

Rien ne part entre 22 h et 8 h, heure de Paris, sauf un retard ou une porte dont le vol part dans les 12 heures. Une même clé ne part pas deux fois. Les cases sont dans Mon compte : enregistrement, retard et porte, départ la veille, reste à payer. « Vols et départs » ferme les rappels de vol. Tant que la migration n’est pas jouée, ces cases nouvelles restent cachées et les trois cases déjà là continuent.

### Apple Pay dans l’application

Le règlement du solde est celui de Transactions : PaymentIntent Stripe, carte (`PaymentElement`) et Apple Pay (`ExpressCheckoutElement`, Payment Request). Ce sont des prestations de voyage consommées hors de l’application. Pas d’achat intégré (guidelines 3.1.3(e) et 3.1.5).

Pour qu’Apple Pay s’ouvre dans la webview :

1. Portail Apple → Identifiers → Merchant IDs : créer `merchant.fr.travelba.client`.
2. Identifiant d’app `fr.travelba.client` : activer la capacité Apple Pay et cocher ce marchand. L’entitlement `com.apple.developer.in-app-payments` est déjà dans `App.entitlements`. Sans cette capacité sur l’identifiant, la signature TestFlight échoue : la faire avant le prochain build.
3. Stripe → Payment methods → Apple Pay → ajouter le domaine `travelba.fr`. Copier le fichier de vérification.
4. Variable Vercel Production `APPLE_PAY_DOMAIN_ASSOCIATION` : le corps de ce fichier, pas une clé privée. Puis redéployer. `https://travelba.fr/.well-known/apple-developer-merchantid-domain-association` doit le renvoyer. Sans la variable, la route répond 404.
5. Dans Stripe, vérifier le domaine. Le marchand Stripe et le marchand Apple doivent être le même compte.
6. Rebuild TestFlight. Safari et l’application utilisent alors le même bouton.

Aucune nouvelle clé Stripe. Les variables APNs de la 1.1 restent celles du document. `APPLE_PAY_DOMAIN_ASSOCIATION` est la seule variable nouvelle.

## Version 1.4

Le bouton **Ajouter au calendrier** (séjour entier, carte, prochain vol, carte d’embarquement, confirmation) écrit dans Calendrier via EventKit. La webview ne charge plus le fichier `.ics` : elle en montrait le texte, sans retour.

Un seul événement ouvre la feuille système. Plusieurs événements (tout le séjour, accueil aller-retour) sont écrits d’un coup. À partir d’iOS 17, l’accès demandé est l’écriture seule (`NSCalendarsWriteOnlyAccessUsageDescription`). En dessous, l’accès calendrier déjà connu d’iOS 15. Les trois textes sont dans `Info.plist`, en français. Aucune capacité à cocher dans le portail développeur : ce n’est pas un entitlement.

Safari, l’icône sur l’écran d’accueil et Android ne changent pas. Le `.ics` reste la voie du site. L’application demande `Accept: application/json` sur la même adresse.

Le site doit être en production avant le TestFlight : l’application charge `https://travelba.fr`. Sans le JavaScript de cette version, le binaire annule quand même une ouverture de `.ics` dans la webview et écrit les événements. Pas de tag `ios-*` dans ce changement : le build se lance à la main, ou avec un tag plus tard.

## Version 1.5

Suppression du compte dans l’application, conforme à la guideline 5.1.1(v). Mon compte › Supprimer mon compte ouvre un dialogue (au-dessus de la barre). « Supprimer définitivement mon compte » efface le compte tout de suite : la connexion, le profil, les passeports et pièces d’identité, les préférences, Face ID et les appareils. Les dossiers, les factures et les règlements restent, sur une fiche sans identité. L’écran « Votre compte a été supprimé » suit, puis la déconnexion.

Migration à jouer à la main, non appliquée par ce dépôt : `supabase/migrations/20261123200000_account_deletion.sql` (`crm_customers.account_deleted_at`). Sans elle, l’effacement utilise l’adresse `supprime+<id>@compte.invalid`. Rien d’autre n’est détruit.

Le compte de revue `appreview@travelba.fr` peut être supprimé pendant la revue. Le script `scripts/recreate-appreview-account.ts` le recrée. Pas de tag `ios-*` : le build TestFlight se lance à la main, ou avec un tag plus tard.
