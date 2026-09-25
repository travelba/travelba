# Fiche App Store — Travelba

À coller dans App Store Connect une fois le compte Apple Developer ouvert. La signature se fait sur un Mac.

## Identité

- Nom : Travelba
- Sous-titre : L’espace de votre séjour
- Catégorie principale : Voyages
- Public : 4+
- Bundle id : `fr.travelba.espace`
- URL marketing : https://travelba.fr
- URL support : https://travelba.fr
- Politique de confidentialité : https://travelba.fr/fr/legal
- Compte de démo : un client de test, jamais un accès agence

L’app n’ouvre que l’espace client. Le back-office n’y est pas.

## Description

Travelba est l’espace de votre séjour. Carnet, réservations, transactions et pièces, au même endroit. Le Concierge vous y conduit.

## Mots-clés

voyage, séjour, carnet, réservation, concierge

## Notes pour la revue

L’app charge l’espace client déjà en ligne (`https://travelba.fr/mon-compte`). Icône TBA, écran de lancement marine, session conservée, partage des pièces par la feuille iOS. Fournissez un client de démonstration (mot de passe déjà créé). Ne donnez pas d’accès `/admin`.

Ce que l’app ne fait pas encore : notifications.

## Signature (bloquée sans compte Apple)

1. Ouvrir un compte Apple Developer (99 USD / an), au nom de l’agence ou le vôtre.
2. Noter le Team ID et le poser dans `APPLE_TEAM_ID` (Vercel Production). Le fichier `/.well-known/apple-app-site-association` s’en sert.
3. Sur un Mac : `npm run cap:sync` puis `npm run cap:ios`.
4. Dans Xcode, équipe de signature = ce Team ID, puis Archive → App Store Connect.
5. Associer le domaine `travelba.fr` (entitlement déjà dans `ios/App/App/App.entitlements`).

La revue Apple ne se commande pas. Pas de date de mise en ligne tant que le compte et le Mac ne sont pas là.
